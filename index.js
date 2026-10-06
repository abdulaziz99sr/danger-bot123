const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.TOKEN;

const GUILD_ID = '1554748054412992564';
const SECURITY_CHANNEL_ID = '1554748055213842454';

const SPAM_TIME = 60 * 1000; // دقيقة
const CHANNEL_LIMIT = 3; // 3 رومات مختلفة
const TIMEOUT_TIME = 7 * 24 * 60 * 60 * 1000; // 7 أيام

const tracker = new Map();
const punished = new Set();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('clientReady', () => {
  console.log(`Safety Bot Online: ${client.user.tag}`);
});

client.on('messageCreate', async message => {

  // يشتغل فقط بالسيرفر الجديد
  if (!message.guild) return;
  if (message.guild.id !== GUILD_ID) return;
  if (message.author.bot) return;

  const text = message.content.trim().toLowerCase();

  const files = [...message.attachments.values()]
    .map(file =>
      `${file.name || 'file'}-${file.size || 0}-${file.contentType || 'unknown'}`
    )
    .join('|');

  const signature = `${text}|${files}`;

  if (signature === '|') return;

  const userId = message.author.id;
  const key = `${userId}:${signature}`;
  const now = Date.now();

  let records = tracker.get(key) || [];

  // نحذف أي تسجيل أقدم من دقيقة
  records = records.filter(
    record => now - record.time <= SPAM_TIME
  );

  records.push({
    time: now,
    channelId: message.channel.id,
    messageId: message.id
  });

  tracker.set(key, records);

  // عدد الرومات المختلفة
  const differentChannels = new Set(
    records.map(record => record.channelId)
  );

  if (differentChannels.size < CHANNEL_LIMIT) return;
  if (punished.has(userId)) return;

  punished.add(userId);

  // حذف الرسائل
  for (const record of records) {
    try {
      const channel = await client.channels.fetch(record.channelId);
      const msg = await channel.messages.fetch(record.messageId);

      await msg.delete();
    } catch {}
  }

  // Timeout أسبوع
  try {
    const member = await message.guild.members.fetch(userId);

    await member.timeout(
      TIMEOUT_TIME,
      'Same content sent in 3 different channels within 1 minute.'
    );
  } catch (err) {
    console.error('Timeout failed:', err);
  }

  // رسالة روم السيفتي
  try {
    const securityChannel =
      await client.channels.fetch(SECURITY_CHANNEL_ID);

    await securityChannel.send(
`تنبيه!!
<@${userId}> حسابه متهكر لحد يتواصل معاه..

Attention!!
<@${userId}> Account has been hacked. Please do not contact`
    );
  } catch (err) {
    console.error('Security message failed:', err);
  }

  // DM لصاحب الحساب
  try {
    await message.author.send(
`السلام عليكم..

حسابك متهكر وقاعد يرسل رسائل عشوائية بالسيرفر..

─────────────

Hello,

Your account got hacked. It's sending random messages in the server.`
    );
  } catch {}

  tracker.delete(key);

  setTimeout(() => {
    punished.delete(userId);
  }, SPAM_TIME);
});

client.login(TOKEN);