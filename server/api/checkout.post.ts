// server/api/checkout.post.ts
// 結帳 fallback：當 liff.sendMessages 失敗時，由 server 端用 pushMessage 通知
import { Client } from '@line/bot-sdk';

const ADMIN_USER_ID = 'Ud2d92728dfaf5241e62b1cb167e6973a';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody(event);

  const userId = body?.userId;
  const message = body?.message;

  if (!userId || !message) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 userId 或 message',
    });
  }

  const client = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  try {
    // 由 bot 代替發送結帳通知到聊天室
    await client.pushMessage(userId, {
      type: 'text',
      text: message,
    });

    // 同時通知老闆
    if (ADMIN_USER_ID && ADMIN_USER_ID !== userId) {
      let userName = '客戶';
      try {
        const profile = await client.getProfile(userId);
        userName = profile.displayName;
      } catch {}

      await client
        .pushMessage(ADMIN_USER_ID, {
          type: 'text',
          text: `🔔 新的報價請求！\n------------------\n👤 客人：${userName}\n\n📝 內容：\n${message}`,
        })
        .catch(() => {});
    }

    return { ok: true };
  } catch (err: any) {
    console.error('❌ checkout push 失敗:', err.message);
    throw createError({ statusCode: 500, statusMessage: '發送失敗' });
  }
});
