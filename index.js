const fs = require('fs');
const path = require('path');

const {AUTH_TOKEN,GUILD_ID,BOT_COMMAND_CHANNEL_ID,BOT_COMMAND_NAME,BOT_CHANNEL_SPAWNER_ID} = require('./config')();
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
    if (BOT_CHANNEL_SPAWNER_ID && spawner.id === BOT_CHANNEL_SPAWNER_ID) return;

    const {categoryId,creatorId,userLimit,phonetic} = spawner;

    const channel = await spawnChannel(categoryId, newMember.displayName + "'s Team", { size: userLimit, phonetic });
    // if (phonetic === true) await sortPhonetics(categoryId, creatorId); // Discord changed channelOrder permission to admin making this useless
    await newMember.setVoiceChannel(channel.id);

});

client.on('message', async (message) => {
    if (!BOT_COMMAND_NAME) return;
    if (BOT_COMMAND_CHANNEL_ID && message.channel.id !== BOT_COMMAND_CHANNEL_ID) return;
    if (message.author.id === client.user.id) return; // If message is from the box, ignore it

    if (message.content.toLowerCase() !== BOT_COMMAND_NAME.toLowerCase() && !message.content.toLowerCase().startsWith(BOT_COMMAND_NAME.toLowerCase() + ' ')) {
        const errMsg = await message.reply('Invalid command format.');
        setTimeout(() => errMsg.delete(), 30 * 1000);
        setTimeout(() => (!message.pinned) ? message.delete() : null, 30 * 1000);
        return;
    }
    const args = getArgsFromString(message.content);
    let channelName = args[1];
    let userLimit = args[2];
    if (parseInt(args[1]) == args[1]) {
        // if the first argument is a number
        // then the user only specified the userLimit
        channelName = null;
        userLimit = args[1];
    }

    if (args.length >= 3 || !isInt(args[2])) {
        // if passed more arguments than expected and the second argument is not a number
        // then the user didn't escape the channel name with quotes
        // we will treat it like ALL arguments are apart of the channel name unless the last argument is a number
        const lastArgIsInt = isInt(args[args.length - 1]);
        userLimit = (lastArgIsInt) ? args[args.length - 1] : null;
        channelName = args.slice(1, (lastArgIsInt) ? args.length - 1 : args.length).join(" ");
    }

    if (parseInt(userLimit) > 99) userLimit = 99;

    const member = await guild.members.get(message.author.id);
    if (!member.voiceChannel) {
        member.send('Please join a voice channel in order to use the `$createvoice` command.');
        return;
    }

    if (!channelName) channelName = `${message.author.username}'s Team`;
    const categoryId = getSpawners().find(cs=>cs.id===BOT_CHANNEL_SPAWNER_ID).categoryId;
    const channel = await spawnChannel(categoryId, channelName, { size: userLimit });
    member.setVoiceChannel(channel.id);
    message.delete();
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

const getSpawners = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'channel-spawners.json'), 'utf8'));
const setSpawnerProperty = (id, key, value) => {
    fs.writeFileSync(path.join(__dirname, 'channel-spawners.json'), JSON.stringify(getSpawners().map(spawner => {
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

const getArgsFromString = (input) => {
    let args = [];
    if (input.indexOf('"') !== -1) {
        let splitQuoted = input.split('"');
        for (let i = splitQuoted.length; i--;) {
            if (splitQuoted[i].trim() === "") {
                splitQuoted.splice(i, 1);
                continue;
            }
            if (!(i % 2)) {
                let nonQuoted = splitQuoted[i].trim().split(" ");
                for (let j = nonQuoted.length; j--;) {
                    args.unshift(nonQuoted[j].trim());
                }
            } else {
                args.unshift(splitQuoted[i]);
            }
        }
    } else if (input.indexOf(' ') !== -1) {
        args = input.split(' ');
    }
    return args;
};

const isInt = (value) => parseInt(value) == value;
