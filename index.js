const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = '';
const guildId = '';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message as the bot')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('Commands registered');
  } catch (error) {
    console.error(error);
  }
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'say') {
    const message = interaction.options.getString('message');

    await interaction.reply({ content: 'Done', ephemeral: true });
    await interaction.channel.send(message);
  }
});

client.login(token);
