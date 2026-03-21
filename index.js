const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const token = 'PUT_YOUR_TOKEN_HERE';
const clientId = '1483511468308566036';
const guildId = '1270863034830553108';

// ALLOWED ROLES FOR /say
const allowedRoles = [
  '129068757209533160',
  '1290687573257355367',
  '1425176316281360466'
];

// CHANNELS THAT REQUIRE POSTS ONLY
const ALLOWED_CHANNELS = [
  '1290687696536080505',
  '1290687690194292777',
  '1400536942600257798',
  '1400536942600257798'
];

// STICKY MESSAGE
const STICKY_TEXT = 'Posts Only | بوستات فقط';

// STORE LAST STICKY PER CHANNEL
const lastSticky = {};

// LOCK PER CHANNEL TO PREVENT DOUBLE SEND
const stickyLocks = {};

// TRACK RECENTLY PROCESSED MESSAGES
const recentMessages = new Set();

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
      option
        .setName('message')
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
    console.error('Failed to register commands:', error);
  }
})();

// READY
client.on('clientReady', () => {
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

    await interaction.reply({
      content: 'Done',
      ephemeral: true
    });

    await interaction.channel.send(message);
  }
});

// POSTS ONLY + STICKY MESSAGE
client.on('messageCreate', async message => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!ALLOWED_CHANNELS.includes(message.channel.id)) return;

  // prevent same message from being processed more than once
  if (recentMessages.has(message.id)) return;
  recentMessages.add(message.id);

  setTimeout(() => {
    recentMessages.delete(message.id);
  }, 5000);

  const hasAttachment = message.attachments.size > 0;

  // text only -> delete
  if (!hasAttachment) {
    try {
      await message.delete();
    } catch (err) {
      console.error('Failed to delete text-only message:', err);
    }
    return;
  }

  // prevent duplicate sticky sends in same channel at same time
  if (stickyLocks[message.channel.id]) return;
  stickyLocks[message.channel.id] = true;

  try {
    // delete old sticky if it exists
    if (lastSticky[message.channel.id]) {
      try {
        const oldSticky = await message.channel.messages.fetch(lastSticky[message.channel.id]);
        if (oldSticky) {
          await oldSticky.delete().catch(() => {});
        }
      } catch (err) {
        // old sticky may already be deleted
      }
    }

    // send new sticky
    const newSticky = await message.channel.send(STICKY_TEXT);
    lastSticky[message.channel.id] = newSticky.id;
  } catch (err) {
    console.error('Failed to refresh sticky message:', err);
  } finally {
    stickyLocks[message.channel.id] = false;
  }
});

client.login(token);
