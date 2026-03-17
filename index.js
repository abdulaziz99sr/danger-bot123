const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const token = process.env.TOKEN;
const clientId = '1483511468308566036';
const guildId = '1270863034830553108';

// 🎭 ALLOWED ROLES
const allowedRoles = [
  '1290687572095533160',
  '1290687573257355367',
  '1425176316281360466'
];

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

    // 🔒 CHECK ROLES
    const hasRole = interaction.member.roles.cache.some(role =>
      allowedRoles.includes(role.id)
    );

    if (!hasRole) {
      return interaction.reply({ content: '❌ You do not have permission', ephemeral: true });
    }

    const message = interaction.options.getString('message');

    await interaction.reply({ content: 'Done', ephemeral: true });
    await interaction.channel.send(message);
  }
});

client.login(token);
