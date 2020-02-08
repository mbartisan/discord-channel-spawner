module.exports = () => {
  return Object.freeze({
      AUTH_TOKEN: "", // Required
      GUILD_ID: "", // Required
      BOT_COMMAND_NAME: null, // Optional: string of the bot command trigger message
      BOT_COMMAND_CHANNEL_ID: null, // Optional: restrict the bot command to a specific channel
      BOT_CHANNEL_SPAWNER_ID: null // Required if using the BOT_COMMAND, this is the id of the channel spawner in channel-spawners.json
  });
};
