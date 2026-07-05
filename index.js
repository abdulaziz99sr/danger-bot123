const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const token = process.env.TOKEN;
const clientId = '1483511468308566036';
const guildId = '1270863034830553108';

const allowedRoles = [
  '1487146735779446926',
  '1290687572095533160',
  '1290687573257355367',
  '1425176316281360466'
];

const ALLOWED_CHANNELS = [
  '1290687696536080505',
  '1290687690194292777',
  '1400536942600257798',
  '1290687693944000523'
];

const STICKY_TEXT = 'Posts Only | بوستات فقط';
const SECURITY_LOG_CHANNEL_ID = '1290687685777821790';

const SPAM_WINDOW_MS = 60 * 1000;
const SPAM_CHANNEL_LIMIT = 3;
const TIMEOUT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const CONTEST_FILE = './invite-contest-data.json';

const lastSticky = new Map();
const processedMessages = new Set();
const stickyCooldown = new Map();
const spamTracker = new Map();
const punishedUsers = new Set();
const inviteCache = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasAllowedRole(member) {
  return member.roles.cache.some(role => allowedRoles.includes(role.id));
}

function createDefaultContestData() {
  return {
    active: false,
    scoreboardChannelId: null,
    scoreboardMessageId: null,
    points: {},
    countedUsers: {}
  };
}

function loadContestData() {
  if (!fs.existsSync(CONTEST_FILE)) {
    return createDefaultContestData();
  }

  try {
    return JSON.parse(fs.readFileSync(CONTEST_FILE, 'utf8'));
  } catch {
    return createDefaultContestData();
  }
}

let contestData = loadContestData();

function saveContestData() {
  fs.writeFileSync(CONTEST_FILE, JSON.stringify(contestData, null, 2));
}

function formatScoreboard() {
  const entries = Object.entries(contestData.points)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return 'نقاط المتسابقين📊:\n\nلا يوجد متسابقون حتى الآن.';
  }

  const lines = entries.map(([userId, points], index) => {
    return `${index + 1}- <@${userId}> - ${points}`;
  });

  return `نقاط المتسابقين📊:\n\n${lines.join('\n\n')}`;
}

async function updateScoreboard() {
  if (!contestData.scoreboardChannelId || !contestData.scoreboardMessageId) return;

  const channel = await client.channels.fetch(contestData.scoreboardChannelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(contestData.scoreboardMessageId).catch(() => null);
  if (!message) return;

  await message.edit({
    content: formatScoreboard(),
    allowedMentions: { parse: [] }
  }).catch(() => {});
}

async function cacheGuildInvites(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) {
    console.error('Failed to fetch invites. Make sure the bot has Manage Server permission.');
    return;
  }

  const mappedInvites = new Map();

  invites.forEach(invite => {
    mappedInvites.set(invite.code, {
      uses: invite.uses || 0,
      inviterId: invite.inviter ? invite.inviter.id : null
    });
  });

  inviteCache.set(guild.id, mappedInvites);
}

app.get('/', (req, res) => {
  res.send('Bot is running');
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a message, image, or video as the bot')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message to send')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Image or video to send')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('dm-user')
    .setDescription('Send a DM to a specific user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to DM')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message to send')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Image or video to send')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('dm-everyone')
    .setDescription('Send a DM to all server members')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message to send')
        .setRequired(false)
    )

    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Image or video to send')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('points')
    .setDescription('Create the invite competition points message'),

  new SlashCommandBuilder()
    .setName('startinvite')
    .setDescription('Start invite points counting'),

  new SlashCommandBuilder()
    .setName('stopinvite')
    .setDescription('Stop invite points counting'),

  new SlashCommandBuilder()
    .setName('resetinvite')
    .setDescription('Reset invite competition points')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('Commands registered');

  } catch (err) {
    console.error(err);
  }
})();

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  for (const [, guild] of client.guilds.cache) {
    await cacheGuildInvites(guild);
  }
});

client.on('inviteCreate', async invite => {
  await cacheGuildInvites(invite.guild);
});

client.on('inviteDelete', async invite => {
  await cacheGuildInvites(invite.guild);
});

client.on('guildMemberAdd', async member => {

  if (!contestData.active) {
    await cacheGuildInvites(member.guild);
    return;
  }

  if (contestData.countedUsers[member.id]) {
    await cacheGuildInvites(member.guild);
    return;
  }

  const oldInvites = inviteCache.get(member.guild.id) || new Map();
  const newInvites = await member.guild.invites.fetch().catch(() => null);

  if (!newInvites) return;

  let usedInvite = null;

  newInvites.forEach(invite => {
    const oldInvite = oldInvites.get(invite.code);

    const oldUses = oldInvite ? oldInvite.uses : 0;
    const newUses = invite.uses || 0;

    if (newUses > oldUses) {
      usedInvite = invite;
    }
  });

  await cacheGuildInvites(member.guild);

  if (!usedInvite || !usedInvite.inviter) return;

  const inviterId = usedInvite.inviter.id;

  if (inviterId === member.id) return;

  contestData.countedUsers[member.id] = inviterId;
  contestData.points[inviterId] = (contestData.points[inviterId] || 0) + 1;

  saveContestData();
  await updateScoreboard();
});

client.on('guildMemberRemove', async member => {
  const inviterId = contestData.countedUsers[member.id];

  if (!inviterId) return;

  if (contestData.points[inviterId]) {
    contestData.points[inviterId]--;

    if (contestData.points[inviterId] <= 0) {
      delete contestData.points[inviterId];
    }
  }

  delete contestData.countedUsers[member.id];

  saveContestData();
  await updateScoreboard();
});

function getMessageSignature(message) {
  const text = message.content.trim().toLowerCase();

  const attachments = [...message.attachments.values()]
    .map(file => `${file.name || 'file'}-${file.size || 0}-${file.contentType || 'unknown'}`)
    .join('|');

  return `${text}|${attachments}`;
}

async function handleSpamProtection(message) {
  const signature = getMessageSignature(message);
  if (!signature || signature === '|') return;

  const userId = message.author.id;
  const key = `${userId}:${signature}`;
  const now = Date.now();

  if (!spamTracker.has(key)) {
    spamTracker.set(key, []);
  }

  let records = spamTracker.get(key);

  records = records.filter(record => now - record.time <= SPAM_WINDOW_MS);

  records.push({
    time: now,
    channelId: message.channel.id,
    messageId: message.id
  });

  spamTracker.set(key, records);

  const uniqueChannelIds = new Set(records.map(record => record.channelId));

  if (uniqueChannelIds.size < SPAM_CHANNEL_LIMIT) return;

  if (punishedUsers.has(userId)) return;

  punishedUsers.add(userId);

  try {
    for (const record of records) {
      const channel = await client.channels.fetch(record.channelId).catch(() => null);

      if (!channel) continue;

      const msg = await channel.messages.fetch(record.messageId).catch(() => null);

      if (msg) await msg.delete().catch(() => {});
    }

    const member = await message.guild.members.fetch(userId).catch(() => null);

    if (member) {
      await member.timeout(
        TIMEOUT_DURATION_MS,
        'Same content spam detected in 3 different channels. Possible hacked account.'
      ).catch(() => {});
    }

    const logChannel = await client.channels.fetch(SECURITY_LOG_CHANNEL_ID).catch(() => null);

    if (logChannel) {
      await logChannel.send(
`تنبيه!!
<@${userId}> حسابه متهكر لحد يتواصل معاه..

Attention!!
<@${userId}> Account has been hacked. Please do not contact`
      ).catch(() => {});
    }

    await message.author.send(
`السلام عليكم..

حسابك متهكر وقاعد يرسل رسائل عشوائية بسيرفر DANGER ZONE..

─────────────

Hello,

Your account got hacked. It's sending random messages in the DANGER ZONE server.`
    ).catch(() => {});

  } catch (err) {
    console.error('Spam protection error:', err);
  }

  setTimeout(() => {
    punishedUsers.delete(userId);
  }, SPAM_WINDOW_MS);
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (!hasAllowedRole(interaction.member)) {
    return interaction.reply({
      content: 'You do not have permission',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'say') {
    const msg = interaction.options.getString('message');
    const file = interaction.options.getAttachment('file');

    if (!msg && !file) {
      return interaction.reply({
        content: 'You must provide a message or a file.',
        ephemeral: true
      });
    }

    await interaction.reply({ content: 'Done', ephemeral: true });

    return interaction.channel.send({
      content: msg || undefined,
      files: file ? [file.url] : []
    });
  }

  if (interaction.commandName === 'dm-user') {
    const user = interaction.options.getUser('user');
    const msg = interaction.options.getString('message');
    const file = interaction.options.getAttachment('file');

    if (!msg && !file) {
      return interaction.reply({
        content: 'You must provide a message or a file.',
        ephemeral: true
      });
    }

    try {
      await user.send({
        content: msg || undefined,
        files: file ? [file.url] : []
      });

      return interaction.reply({
        content: 'DM sent.',
        ephemeral: true
      });

    } catch {
      return interaction.reply({
        content: 'Failed to send DM. The user may have DMs closed.',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'dm-everyone') {
    const msg = interaction.options.getString('message');
    const file = interaction.options.getAttachment('file');

    if (!msg && !file) {
      return interaction.reply({
        content: 'You must provide a message or a file.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: 'Started sending DMs to all members.',
      ephemeral: true
    });

    const members = await interaction.guild.members.fetch();

    let sent = 0;
    let failed = 0;

    for (const [, member] of members) {
      if (member.user.bot) continue;

      try {
        await member.send({
          content: msg || undefined,
          files: file ? [file.url] : []
        });

        sent++;

      } catch {
        failed++;
      }

      await sleep(1200);
    }

    return interaction.followUp({
      content: `DM finished. Sent: ${sent}, Failed: ${failed}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'points') {

    const scoreboardMessage = await interaction.channel.send({
      content: formatScoreboard(),
      allowedMentions: { parse: [] }
    });

    contestData.scoreboardChannelId = interaction.channel.id;
    contestData.scoreboardMessageId = scoreboardMessage.id;

    saveContestData();

    return interaction.reply({
      content: 'Points message created.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'startinvite') {

    contestData.active = true;
    saveContestData();

    await cacheGuildInvites(interaction.guild);

    return interaction.reply({
      content: 'Invite competition started.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'stopinvite') {

    contestData.active = false;
    saveContestData();

    return interaction.reply({
      content: 'Invite competition stopped.',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'resetinvite') {

    contestData.points = {};
    contestData.countedUsers = {};

    saveContestData();
    await updateScoreboard();

    return interaction.reply({
      content: 'Invite competition reset.',
      ephemeral: true
    });
  }

});

client.on('messageCreate', async message => {

  if (!message.guild) return;
  if (message.author.bot) return;

  await handleSpamProtection(message);

  if (!ALLOWED_CHANNELS.includes(message.channel.id)) return;

  if (processedMessages.has(message.id)) return;

  processedMessages.add(message.id);

  setTimeout(() => {
    processedMessages.delete(message.id);
  }, 10000);

  const hasAttachment = message.attachments.size > 0;

  if (!hasAttachment) {
    try {
      await message.delete();
    } catch (err) {
      console.error(err);
    }

    return;
  }

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
      } catch {}

    }

    const recentMessages = await message.channel.messages.fetch({
      limit: 100
    });

    const oldStickies = recentMessages.filter(msg =>
      msg.author.id === client.user.id &&
      msg.content === STICKY_TEXT
    );

    for (const [, msg] of oldStickies) {
      await msg.delete().catch(() => {});
    }

    const newSticky = await message.channel.send(STICKY_TEXT);

    lastSticky.set(message.channel.id, newSticky.id);

  } catch (err) {
    console.error(err);
  }

});

client.login(token);