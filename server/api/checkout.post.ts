// server/api/checkout.post.ts
// 結帳 fallback：當 liff.sendMessages 失敗時，由 server 端用 pushMessage 通知
import { Client } from '@line/bot-sdk';

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
    await client.pushMessage(userId, {
      type: 'text',
      text: message,
    });
    return { ok: true };
  } catch (err: any) {
    console.error('❌ checkout push 失敗:', err.message);
    throw createError({ statusCode: 500, statusMessage: '發送失敗' });
  }
});
