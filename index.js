const fs = require('fs');
const path = require('path');

const {AUTH_TOKEN, GUILD_ID, COMMAND_NAME, COMMAND_CHANNEL_ID} = require('./config')();
const PHONETIC_ALPHABET = require('./phonetic-alphabet.json');

const Discord = require('discord.js');
const client = new Discord.Client();
let guild = null;

client.login(AUTH_TOKEN);

client.on('message', async (message) => {
    if (message.channel.id !== COMMAND_CHANNEL_ID) return;
    if (message.author.id === client.user.id) return;
    if (message.content.toLowerCase() !== COMMAND_NAME.toLowerCase() && !message.content.toLowerCase().startsWith(COMMAND_NAME.toLowerCase() + ' ')) {
        const errMsg = await message.reply('Invalid command format.');
        setTimeout(() => errMsg.delete(), 30 * 1000);
        setTimeout(() => (!message.pinned) ? message.delete() : null, 30 * 1000);
        return;
    };
    const args = getArgsFromString(message.content)
    const member = await guild.members.get(message.author.id);
    if (!member.voiceChannel) {
        member.send('Please join a voice channel in order to use the `createvoice` command.');
        return;
    }
    let channelName = args[1];
    let userLimit = args[2];

    if (parseInt(args[1]) == args[1]) {
        // if the first argument is a number
        // then the user only specified the userLimit
        channelName = null;
        userLimit = args[1];
    }

    if (parseInt(userLimit) > 99) userLimit = 99;

    if (!channelName) channelName = `${message.author.username}'s Team`;
    const channel = await guild.createChannel(channelName, { type: "voice", parent: getSpawners()[0].categoryId, userLimit });
    member.setVoiceChannel(channel.id);
    message.delete();
});

client.on('ready', async () => {
    console.log("Bot Connected");
    guild = await client.guilds.get(GUILD_ID);
});

client.on("voiceStateUpdate", async (oldMember, newMember) => {
    cleanChannels();
});

const getSpawners = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'channel-spawners.json'), 'utf8'));
const setSpawnerProperty = (id, key, value) => {
    fs.writeFileSync(path.join(__dirname, 'channel-spawners.json'), JSON.stringify(getSpawners().map(spawner => {
        if (spawner.id === id) spawner[key] = value;
        return spawner;
    }), null, 4), 'utf8');
};

// const spawnChannel = async (categoryId, name, {
//     size = null,
//     phonetic = false
// } = {}) => {
//
//     if (phonetic === true) name = getNextAvailablePhoneticName(categoryId);
//
//     return await guild.createChannel(name, { type: "voice", parent: categoryId, userLimit: size });
// };

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