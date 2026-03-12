// server/api/submit-order.post.ts
// 提交訂單：儲存至 DB → 清空購物車 → LINE 通知客戶與管理員
import { Client } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { appendOrderRow } from '../utils/googleSheets';
import nodemailer from 'nodemailer';

const ADMIN_USER_ID = 'Ud2d92728dfaf5241e62b1cb167e6973a';
const BANK_NAME = '玉山銀行';
const BANK_CODE = '808';
const BANK_ACCOUNT = '0624940150560';

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
    subtotalTwd,
    shippingTwd,
    shippingMethod,
    serviceFeeTwd,
    grandTotalTwd,
    website,
  } = body || {};

  // 🍯 Honeypot
  if (website) {
    return { ok: true, orderId: 'blocked' };
  }

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

  if (!/^09\d{8}$/.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: '手機號碼格式不正確' });
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
      grand_total_twd: grandTotalTwd || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (orderError) {
    console.error('❌ 訂單儲存失敗:', orderError.message);
    throw createError({ statusCode: 500, statusMessage: '訂單儲存失敗' });
  }

  // 生成訂單編號
  const now = new Date();
  const datePart =
    now.getFullYear().toString().slice(-2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0');
  const orderNo = `RM${datePart}${order.id.slice(-4).toUpperCase()}`;

  // 2. 寫入 Google 試算表（失敗不阻斷下單）
  try {
    await appendOrderRow(
      {
        googleServiceAccountJson: config.googleServiceAccountJson,
        googleSpreadsheetId: config.googleSpreadsheetId,
        googleSheetName: config.googleSheetName,
      },
      {
        orderId: order.id,
        orderNo,
        createdAt: now.toISOString(),
        lineName: lineName || '',
        customerName,
        phone,
        address,
        paymentMethod,
        accountLast5: accountLast5 || null,
        items,
        subtotalTwd: subtotalTwd || 0,
        shippingTwd: shippingTwd || 0,
        serviceFeeTwd: serviceFeeTwd || 0,
        grandTotalTwd: grandTotalTwd || 0,
        totalJpy: totalJpy || 0,
      },
    );
    console.log('✅ 試算表寫入成功');
  } catch (err: any) {
    console.error('❌ 試算表寫入失敗（不影響下單）:', err.message);
  }

  // 3. 清空購物車
  await supabase.from('cart_items').delete().eq('user_id', userId);

  // 4. 組裝 LINE 訊息
  const paymentLabel =
    paymentMethod === 'bank_transfer' ? '銀行轉帳' : '綠界付款';
  const gt = grandTotalTwd || subtotalTwd || 0;
  const totalQty = items.reduce(
    (s: number, i: any) => s + (i.quantity || 1),
    0,
  );

  const customerMsg = [
    '✅ 訂單已成功提交！',
    `訂單編號：${orderNo}`,
    '',
    `姓名：${customerName} 手機：${phone}`,
    `收件地址：${address}`,
    '\n📋 訂單摘要',
    `商品 ${totalQty} 件`,
    `訂單總計（含稅）：NT$${gt.toLocaleString()}`,
    `付款方式：${paymentLabel}`,
    paymentMethod === 'bank_transfer' && accountLast5
      ? `🔢 轉帳帳號末五碼：${accountLast5}`
      : '',
    paymentMethod === 'bank_transfer'
      ? `\n🏦 匯款資訊：${BANK_NAME}${BANK_CODE}，帳號 ${BANK_ACCOUNT}\n請於三天內完成轉帳 NT$${gt.toLocaleString()}，逾期將自動取消訂單。`
      : '',
    '',
    '\n如有任何疑問，請隨時向我們詢問 🙏',
  ]
    .filter(Boolean)
    .join('\n');

  const adminItemLines = items
    .map(
      (item: any, i: number) =>
        `${i + 1}. ${item.product_title}\n   ${item.color} / ${item.size} ×${item.quantity}  NT$${(item.priceTwd || 0).toLocaleString()} (${item.price})`,
    )
    .join('\n');

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
    adminItemLines,
    '',
    '💰 費用明細：',
    `  商品小計：NT$${(subtotalTwd || 0).toLocaleString()}（¥${(totalJpy || 0).toLocaleString()}）`,
    `  國際運費：NT$${(shippingTwd || 0).toLocaleString()}（${shippingMethod || 'ePacket'}）`,
    `  服務費：NT$${serviceFeeTwd || 50}`,
    `  ─────────`,
    `  總計：NT$${gt.toLocaleString()}`,
    '',
    `🆔 訂單編號：${orderNo}`,
    `🔑 UUID：${order.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  // 5. 發送 LINE 通知
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

  // 6. 發送電子郵件通知公司信箱
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.mailUser, // 妳的 Gmail
        pass: config.mailPass, // 妳的 Google 應用程式密碼
      },
    });

    const mailOptions = {
      from: `"囉姆嚕代購" <${config.mailUser}>`,
      to: config.adminEmail, // 妳接收訂單的信箱
      subject: `🔔 新訂單通知：${orderNo} - ${customerName}`,
      text: adminMsg, // 直接沿用妳寫好的 adminMsg，省時又省力
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ 訂單信件發送成功');
  } catch (err: any) {
    console.error('❌ 信件發送失敗:', err.message);
  }

  return { ok: true, orderId: order.id, orderNo };
});
