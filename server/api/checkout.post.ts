// server/api/checkout.post.ts
// 結帳 fallback：當 liff.sendMessages 失敗時，由 server 端用 pushMessage 通知
// ⚠️ 需傳入 LIFF accessToken，server 端向 LINE 驗證身分後才推送訊息
import { Client } from '@line/bot-sdk';
import axios from 'axios';

const MAX_MESSAGE_LENGTH = 500;

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody(event);

  const userId = body?.userId as string | undefined;
  const message = body?.message as string | undefined;
  const accessToken = body?.accessToken as string | undefined;

  if (!userId || !message || !accessToken) {
    throw createError({
      statusCode: 400,
      statusMessage: '缺少 userId、message 或 accessToken',
    });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: '訊息長度超過限制' });
  }

  // ── 以 LIFF access token 向 LINE 驗證使用者身分 ──
  let verifiedUserId: string;
  try {
    const profileRes = await axios.get<{ userId: string }>(
      'https://api.line.me/v2/profile',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5000,
      },
    );
    verifiedUserId = profileRes.data?.userId;
  } catch {
    throw createError({
      statusCode: 403,
      statusMessage: '存取令牌無效或已過期',
    });
  }

  if (!verifiedUserId || verifiedUserId !== userId) {
    throw createError({ statusCode: 403, statusMessage: '身分驗證失敗' });
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
