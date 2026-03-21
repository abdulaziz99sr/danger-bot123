const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const token = 'PUT_YOUR_TOKEN_HERE';
const clientId = '1483511468308566036';
const guildId = '1270863034830553108';

// ALLOWED ROLES
const allowedRoles = [
  '129068757209533160',
  '1290687573257355367',
  '1425176316281360466'
];

// CHANNELS THAT REQUIRE IMAGES
const ALLOWED_CHANNELS = [
  '1290687696536080505',
  '1290687690194292777',
  '1400536942600257798',
  '1290687693944000523'
];

// STICKY MESSAGE
const STICKY_TEXT = 'Posts Only | بوستات فقط';

// حفظ آخر sticky بكل روم
const lastSticky = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message as the bot')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true)
    )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// REGISTER COMMANDS
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
});

// READY
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// SLASH COMMANDS
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'say') {
    const hasRole = interaction.member.roles.cache.some(role =>
      allowedRoles.includes(role.id)
    );

    if (!hasRole) {
      return interaction.reply({
        content: 'You do not have permission',
        ephemeral: true
      });
    }

    const message = interaction.options.getString('message');

    await interaction.reply({ content: 'Done', ephemeral: true });
    await interaction.channel.send(message);
  }
});

// IMAGE-ONLY + STICKY SYSTEM
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  if (!ALLOWED_CHANNELS.includes(message.channel.id)) return;

  const hasAttachment = message.attachments.size > 0;

  // delete if no image
  if (!hasAttachment) {
    try {
      await message.delete();
      return;
    } catch (err) {
      console.error(err);
    }
  }

  try {
    // delete previous sticky
    if (lastSticky[message.channel.id]) {
      await message.channel.messages.delete(lastSticky[message.channel.id]).catch(() => {});
    }

    // send new sticky
    const stickyMsg = await message.channel.send(STICKY_TEXT);

    // save sticky id
    lastSticky[message.channel.id] = stickyMsg.id;

  } catch (err) {
    console.error(err);
  }
});

client.login(token);
