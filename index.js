const fs = require('fs');

const {AUTH_TOKEN,GUILD_ID} = require('./config')();
const PHONETIC_ALPHABET = require('./phonetic-alphabet.json');

const Discord = require('discord.js');
const client = new Discord.Client();
let guild = null;

client.login(AUTH_TOKEN);

client.on('ready', async () => {
    console.log("Bot Connected");
    guild = await client.guilds.get(GUILD_ID);
    getSpawners().forEach(spawnerDefinition => setupSpawner(spawnerDefinition));
});

client.on("voiceStateUpdate", async (oldMember, newMember) => {
    cleanChannels();

    const spawner = getSpawners().find(({creatorId}) => newMember.voiceChannelID === creatorId);
    if (!spawner) return;

    const {categoryId,creatorId,userLimit,phonetic} = spawner;

    const channel = await spawnChannel(categoryId, newMember.displayName + "'s Team", { size: userLimit, phonetic });
    // if (phonetic === true) await sortPhonetics(categoryId, creatorId); // Discord changed channelOrder permission to admin making this useless
    await newMember.setVoiceChannel(channel.id);

});

const setupSpawner = async (spawner) => {
    const shouldCreateChannel = (channelId) => {
        if (channelId == null || channelId === "null" || channelId === "") return true;
        if (!guild.channels.get(channelId)) return true;
        return false;
    };

    let categoryChannel = null;

    if (shouldCreateChannel(spawner.categoryId)) {
        categoryChannel = await guild.createChannel(spawner.defaultCategoryName, { type: "category" });
        setSpawnerProperty(spawner.id, "categoryId", categoryChannel.id);
    } else {
        categoryChannel = guild.channels.get(spawner.categoryId);
    }

    if (shouldCreateChannel(spawner.creatorId)) {
        const creatorChannel = await guild.createChannel(spawner.defaultCreatorName, { type: "voice", parent: categoryChannel.id });
        setSpawnerProperty(spawner.id, "creatorId", creatorChannel.id);
    }
};

const getSpawners = () => JSON.parse(fs.readFileSync('./channel-spawners.json', 'utf8'));
const setSpawnerProperty = (id, key, value) => {
    fs.writeFileSync('./channel-spawners.json', JSON.stringify(getSpawners().map(spawner => {
        if (spawner.id === id) spawner[key] = value;
        return spawner;
    }), null, 4), 'utf8');
};

const spawnChannel = async (categoryId, name, {
    size = null,
    phonetic = false
} = {}) => {

    if (phonetic === true) name = getNextAvailablePhoneticName(categoryId);

    return await guild.createChannel(name, { type: "voice", parent: categoryId, userLimit: size });
};

const cleanChannels = () => {
    const spawners = getSpawners();
    for (let i = 0; i < spawners.length; i++) {
        const spawner = spawners[i];
        let parentChannel = guild.channels.get(spawner.categoryId);
        if (!parentChannel) {
            continue;
        }
        parentChannel.children.forEach(channel => {
            if (channel.id === spawner.creatorId) return;
            if (channel.members.size > 0) return;
            // Sometimes the channel was already deleted from a previous clean channel run so we ignore the error
            channel.delete().catch(e => (e.message === "Unknown Channel") ? null : console.error("Channel Delete Error: ", e));
        });
    }
};

const getPhoneticName = (categoryId, index) => {
    let parentChannel = guild.channels.get(categoryId);
    return `${parentChannel.name} ${PHONETIC_ALPHABET[index]}`;
};

const getNextAvailablePhoneticName = (categoryId) => {
    let parentChannel = guild.channels.get(categoryId);
    for (let i = 0; i < PHONETIC_ALPHABET.length; i++) {
        let phoneticName = getPhoneticName(categoryId, i);
        if (!parentChannel.children.find(channel => channel.name === phoneticName)) {
            return phoneticName;
        }
    }
    return PHONETIC_ALPHABET[PHONETIC_ALPHABET.length - 1];
};

const sortPhonetics = async (categoryId, creatorId) => {
    // ** NOTE: Apparently discord requires administrator permission to reorder channels now, which is dangerous to give to a bot, rendering this function useless.
    let parentChannel = guild.channels.get(categoryId);
    let creatorChannel = guild.channels.get(creatorId);
    console.log("Parent Channel Position: " + parentChannel.position);
    console.log("Creator Channel Position: " + creatorChannel.position);
    let position = creatorChannel.position + 1;

    // let position = null;

    for (let i = 0; i < PHONETIC_ALPHABET.length; i++) {
        let phoneticName = getPhoneticName(categoryId, i);
        let channel = parentChannel.children.find(channel => channel.name === phoneticName);

        if (!channel) {
            continue;
        }

        if (position == null) {
            position = channel.position;
            continue;
        }

        console.log("Set " + channel.name + " to " + position);
        guild.setChannelPosition(channel.id, position).catch(e => console.error("Channel position error: ", e));
        position++;
    }
};
