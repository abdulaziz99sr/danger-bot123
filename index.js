const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.TOKEN;

// السيرفر الجديد
const GUILD_ID = '1554748054412992564';

// روم تنبيهات السيفتي
const SECURITY_CHANNEL_ID = '1554748055213842454';

// إعدادات الحماية
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

  // تجاهل الخاص والبوتات وأي سيرفر ثاني
  if (!message.guild) return;
  if (message.guild.id !== GUILD_ID) return;
  if (message.author.bot) return;

  // محتوى الرسالة
  const text = message.content.trim().toLowerCase();

  // المرفقات
  const files = [...message.attachments.values()]
    .map(file =>
      `${file.name || 'file'}-${file.size || 0}-${file.contentType || 'unknown'}`
    )
    .join('|');

  const signature = `${text}|${files}`;

  // تجاهل الرسائل الفاضية
  if (signature === '|') return;

  const userId = message.author.id;
  const key = `${userId}:${signature}`;
  const now = Date.now();

  let records = tracker.get(key) || [];

  // الاحتفاظ فقط بالرسائل خلال آخر دقيقة
  records = records.filter(
    record => now - record.time <= SPAM_TIME
  );

  records.push({
    time: now,
    channelId: message.channel.id,
    messageId: message.id
  });

  tracker.set(key, records);

  // حساب عدد الرومات المختلفة
  const differentChannels = new Set(
    records.map(record => record.channelId)
  );

  // لازم نفس المحتوى يكون في 3 رومات مختلفة
  if (differentChannels.size < CHANNEL_LIMIT) return;

  // منع تكرار العقوبة
  if (punished.has(userId)) return;

  punished.add(userId);

  console.log(`Safety triggered for: ${message.author.tag}`);

  // حذف الرسائل
  for (const record of records) {
    try {
      const channel = await client.channels.fetch(record.channelId);

      if (!channel || !channel.isTextBased()) continue;

      const msg = await channel.messages.fetch(record.messageId);

      await msg.delete();

    } catch (err) {
      console.error('Delete failed:', err.message);
    }
  }

  // إعطاء Timeout لمدة 7 أيام
  try {
    const member = await message.guild.members.fetch(userId);

    console.log('Trying timeout:', member.user.tag);
    console.log('Moderatable:', member.moderatable);

    if (!member.moderatable) {

      console.log('CANNOT TIMEOUT THIS MEMBER');

    } else {

      await member.timeout(
        TIMEOUT_TIME,
        'Same content sent in 3 different channels within 1 minute.'
      );

      console.log('TIMEOUT SUCCESS');
    }

  } catch (err) {
    console.error('TIMEOUT ERROR:', err);
  }

  // إرسال تنبيه في روم السيفتي
  try {
    const securityChannel =
      await client.channels.fetch(SECURITY_CHANNEL_ID);

    if (securityChannel && securityChannel.isTextBased()) {

      await securityChannel.send(
`تنبيه!!
<@${userId}> حسابه متهكر لحد يتواصل معاه..

Attention!!
<@${userId}> Account has been hacked. Please do not contact`
      );

    }

  } catch (err) {
    console.error('Security message failed:', err);
  }

  // إرسال DM للشخص
  try {

    await message.author.send(
`السلام عليكم..

حسابك متهكر وقاعد يرسل رسائل عشوائية بالسيرفر..

─────────────

Hello,

Your account got hacked. It's sending random messages in the server.`
    );

  } catch (err) {
    console.log('Could not send DM.');
  }

  // تنظيف تسجيل الرسائل
  tracker.delete(key);

  // السماح بمراقبته مرة ثانية بعد دقيقة
  setTimeout(() => {
    punished.delete(userId);
  }, SPAM_TIME);
});

// تنظيف الذاكرة
setInterval(() => {

  const now = Date.now();

  for (const [key, records] of tracker.entries()) {

    const freshRecords = records.filter(
      record => now - record.time <= SPAM_TIME
    );

    if (freshRecords.length === 0) {
      tracker.delete(key);
    } else {
      tracker.set(key, freshRecords);
    }

  }

}, 60 * 1000);

client.login(TOKEN);