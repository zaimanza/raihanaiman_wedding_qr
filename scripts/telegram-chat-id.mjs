// Run with `npm run telegram:chat-id`. Credentials stay in server-side environment.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN in .env.local first. Never put your token in source code.');
  process.exitCode = 1;
} else {
  const call = async (method) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(method === 'getUpdates' ? { limit: 100, timeout: 0, allowed_updates: ['message', 'channel_post', 'my_chat_member'] } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('Telegram could not confirm the request. Check your bot token and connection.');
      return data.result;
    } catch {
      throw new Error('Could not reach Telegram. Check your token, connection, and any active webhook or polling app.');
    }
  };
  try {
    const webhook = await call('getWebhookInfo');
    if (webhook.url) {
      console.error('This bot has an active webhook. Use a dedicated wedding bot, or remove the webhook in its original application before running chat-ID discovery. No webhook was changed.');
      process.exitCode = 1;
    } else {
      const updates = await call('getUpdates');
      const chats = new Map();
      for (const update of updates) {
        const chat = (update.message || update.channel_post || update.my_chat_member)?.chat;
        if (chat && ['group', 'supergroup', 'channel'].includes(chat.type)) chats.set(chat.id, { id: String(chat.id), type: chat.type, title: chat.title || '(untitled)' });
      }
      if (!chats.size) {
        console.log('No group/channel updates found. Add the bot, then send /start@YourBotUsername in your group, or publish a new post in your channel. Run this command again within 24 hours.');
      } else {
        console.log('Copy the full id of your wedding destination into TELEGRAM_CHAT_ID in .env.local:');
        for (const chat of chats.values()) console.log(JSON.stringify(chat));
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
