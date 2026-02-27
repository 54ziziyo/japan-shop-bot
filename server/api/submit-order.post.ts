// server/api/submit-order.post.ts
// 提交訂單：儲存至 DB → 清空購物車 → LINE 通知客戶與管理員
import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const ADMIN_USER_ID = 'Ud2d92728dfaf5241e62b1cb167e6973a';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody(event);

  const {
    userId,
    lineName,
    customerName,
    phone,
    address,
    paymentMethod,
    accountLast5,
    items,
    totalJpy,
  } = body || {};

  // 驗證必填欄位
  if (
    !userId ||
    !customerName ||
    !phone ||
    !address ||
    !paymentMethod ||
    !items?.length
  ) {
    throw createError({ statusCode: 400, statusMessage: '缺少必要欄位' });
  }

  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey,
  );

  const lineClient = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  // 1. 儲存訂單至資料庫
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      line_name: lineName || '',
      customer_name: customerName,
      phone,
      address,
      payment_method: paymentMethod,
      account_last5: accountLast5 || null,
      items,
      total_jpy: totalJpy,
      status: 'pending',
    })
    .select('id')
    .single();

  if (orderError) {
    console.error('❌ 訂單儲存失敗:', orderError.message);
    throw createError({ statusCode: 500, statusMessage: '訂單儲存失敗' });
  }

  // 2. 清空購物車
  await supabase.from('cart_items').delete().eq('user_id', userId);

  // 3. 組裝 LINE 訊息
  const paymentLabel =
    paymentMethod === 'bank_transfer'
      ? '銀行轉帳'
      : '綠界付款（+2.23% 手續費）';

  const itemLines = items
    .map(
      (item: any, i: number) =>
        `${i + 1}. ${item.product_title}\n   ${item.color} / ${item.size} ×${item.quantity} ${item.price}`,
    )
    .join('\n');

  // 👤 客戶確認訊息
  const customerMsg = [
    '✅ 訂單已成功提交！',
    '',
    '我們會盡快確認庫存與報價，請留意 LINE 訊息通知。',
    '',
    '📋 訂單摘要',
    `商品 ${items.length} 件 | 預估總額 ¥${totalJpy.toLocaleString()}`,
    `付款方式：${paymentLabel}`,
    '',
    '如有任何疑問，請隨時向我們詢問 🙏',
  ].join('\n');

  // 🔔 管理員詳細通知
  const adminMsg = [
    '🔔 新訂單通知！',
    '━━━━━━━━━━━━━━━━━',
    `👤 LINE：${lineName || '未知'}`,
    `📝 姓名：${customerName}`,
    `📱 電話：${phone}`,
    `📍 地址：${address}`,
    `💳 付款：${paymentLabel}`,
    paymentMethod === 'bank_transfer' && accountLast5
      ? `🔢 帳號末五碼：${accountLast5}`
      : '',
    '',
    '📦 商品明細：',
    itemLines,
    '',
    `💰 預估總額：¥${totalJpy.toLocaleString()}`,
    `🆔 訂單 ID：${order.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  // 4. 發送 LINE 通知
  try {
    await lineClient.pushMessage(userId, { type: 'text', text: customerMsg });
  } catch (err: any) {
    console.error('❌ 客戶通知發送失敗:', err.message);
  }

  if (ADMIN_USER_ID && ADMIN_USER_ID !== userId) {
    try {
      await lineClient.pushMessage(ADMIN_USER_ID, {
        type: 'text',
        text: adminMsg,
      });
    } catch (err: any) {
      console.error('❌ 管理員通知發送失敗:', err.message);
    }
  }

  return { ok: true, orderId: order.id };
});
