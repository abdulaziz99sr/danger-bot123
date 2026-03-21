const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const token = 'PUT_YOUR_TOKEN_HERE';
const clientId = 'PUT_YOUR_CLIENT_ID_HERE';
const guildId = 'PUT_YOUR_GUILD_ID_HERE';

// Roles allowed to use /say
const allowedRoles = [
  '129068757209533160',
  '1290687573257355367',
  '1425176316281360466'
];

// Channels that allow posts only
const ALLOWED_CHANNELS = [
  'CHANNEL_ID_1',
  'CHANNEL_ID_2',
  'CHANNEL_ID_3',
  'CHANNEL_ID_4'
];

const STICKY_TEXT = 'Posts Only | بوستات فقط';

const lastSticky = new Map();
const processedMessages = new Set();
const stickyCooldown = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

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

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'say') return;

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
});

client.on('messageCreate', async message => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!ALLOWED_CHANNELS.includes(message.channel.id)) return;

  // prevent same message being processed twice
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);

  setTimeout(() => {
    processedMessages.delete(message.id);
  }, 10000);

  const hasAttachment = message.attachments.size > 0;

  // delete text-only messages
  if (!hasAttachment) {
    try {
      await message.delete();
    } catch (err) {
      console.error('Failed to delete text-only message:', err);
    }
    return;
  }

  // prevent sticky spam in same channel within a short time
  const now = Date.now();
  const lastRun = stickyCooldown.get(message.channel.id) || 0;

  if (now - lastRun < 1500) return;
  stickyCooldown.set(message.channel.id, now);

  try {
    const oldStickyId = lastSticky.get(message.channel.id);

    if (oldStickyId) {
      try {
        const oldSticky = await message.channel.messages.fetch(oldStickyId);
        await oldSticky.delete().catch(() => {});
      } catch (err) {}
    }

    const newSticky = await message.channel.send(STICKY_TEXT);
    lastSticky.set(message.channel.id, newSticky.id);
  } catch (err) {
    console.error('Failed to refresh sticky message:', err);
  }
});

client.login(token);