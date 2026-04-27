// server/api/submit-order.post.ts
// 提交訂單：儲存至 DB → 清空購物車 → LINE 通知客戶與管理員
import { Client } from '@line/bot-sdk';
import { useSupabase } from '../utils/supabase';
import { appendOrderRow } from '../utils/googleSheets';
import nodemailer from 'nodemailer';

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
    discountTwd,
    couponCode,
    grandTotalTwd,
    website,
    email,
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

  const supabase = useSupabase();
  const lineClient = new Client({
    channelAccessToken: config.line.channelAccessToken,
    channelSecret: config.line.channelSecret,
  });

  // 0. 驗證折扣碼並原子性扣除使用次數
  let couponDiscountTwd = 0;
  if (couponCode) {
    const { data: coupon } = await supabase
      .from('coupon_codes')
      .select(
        'id, code, discount_twd, used_count, total_quantity, is_active, expires_at, per_user_limit',
      )
      .eq('code', String(couponCode).trim().toUpperCase())
      .maybeSingle();

    if (!coupon || !coupon.is_active) {
      throw createError({ statusCode: 400, statusMessage: '折扣碼無效' });
    }
    couponDiscountTwd = coupon.discount_twd ?? 0;
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw createError({ statusCode: 400, statusMessage: '此折扣碼已過期' });
    }
    if (coupon.used_count >= coupon.total_quantity) {
      throw createError({ statusCode: 400, statusMessage: '折扣碼已使用完畢' });
    }
    // 僅在此折扣碼設定「每人限用一次」時才檢查使用記錄
    if (coupon.per_user_limit) {
      const { data: existingUsage } = await supabase
        .from('coupon_usages')
        .select('id')
        .eq('coupon_code', coupon.code)
        .eq('line_user_id', userId)
        .maybeSingle();
      if (existingUsage) {
        throw createError({
          statusCode: 400,
          statusMessage: '您已使用過此折扣碼',
        });
      }
    }
    // 樂觀鎖定：確保 used_count 未被其他請求同步更新，防止超用
    const { data: updated } = await supabase
      .from('coupon_codes')
      .update({ used_count: coupon.used_count + 1 })
      .eq('id', coupon.id)
      .eq('used_count', coupon.used_count)
      .select('id');
    if (!updated?.length) {
      throw createError({
        statusCode: 409,
        statusMessage: '折扣碼剛被其他人使用，請重新整理後再試',
      });
    }
    // 若限制每人一次，記錄此用戶已使用
    if (coupon.per_user_limit) {
      const { error: usageError } = await supabase
        .from('coupon_usages')
        .insert({
          coupon_code: coupon.code,
          line_user_id: userId,
        });
      if (usageError) {
        console.error(
          '❌ coupon_usages insert error:',
          usageError.code,
          usageError.message,
        );
      }
    }
  }

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
      email: email || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (orderError) {
    console.error('❌ 訂單儲存失敗:', orderError.message);
    throw createError({ statusCode: 500, statusMessage: '訂單儲存失敗' });
  }

  // 生成訂單編號（台灣時間 UTC+8）
  const now = new Date();
  const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart =
    twNow.getUTCFullYear().toString().slice(-2) +
    pad(twNow.getUTCMonth() + 1) +
    pad(twNow.getUTCDate()) +
    pad(twNow.getUTCHours()) +
    pad(twNow.getUTCMinutes());
  const orderNo = `RM${datePart}${order.id.slice(-4).toUpperCase()}`;
  // 台灣時間字串（寫入 Google 試算表 C 欄下單時間）
  const twDateStr = `${twNow.getUTCFullYear()}/${pad(twNow.getUTCMonth() + 1)}/${pad(twNow.getUTCDate())} ${pad(twNow.getUTCHours())}:${pad(twNow.getUTCMinutes())}:${pad(twNow.getUTCSeconds())}`;

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
        createdAt: twDateStr,
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
        couponDiscountTwd,
        grandTotalTwd: grandTotalTwd || 0,
        totalJpy: totalJpy || 0,
        email: email || '',
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
        `${i + 1}. ${item.product_title}\n   ${item.color} / ${item.size} ×${item.quantity}  NT$${(item.priceTwd || 0).toLocaleString()} (${item.price})${item.product_url ? `\n   ${item.product_url}` : ''}`,
    )
    .join('\n');

  // LINE 管理員訂單成功收到的通知（目前是失效的，但還沒有需要此功能就先保留）
  const adminMsg = [
    '新訂單通知',
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
    `  ─────────`,
    `  總計：NT$${gt.toLocaleString()}`,
    '',
    `🆔 訂單編號：${orderNo}`,
    `🔑 UUID：${order.id}`,
  ]
    .filter(Boolean)
    .join('\n');

  // HTML 版信件（含商品圖片和連結）
  const adminItemHtml = items
    .map(
      (item: any, i: number) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;width:72px">
          ${item.image_url ? `<img src="${item.image_url}" width="64" height="64" style="border-radius:8px;object-fit:cover;display:block" />` : ''}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">
            ${item.product_url ? `<a href="${item.product_url}" style="color:#4A5D59;text-decoration:none">${item.product_title}</a>` : item.product_title}
          </div>
          <div style="color:#888;font-size:12px;margin-bottom:4px">${item.color} / ${item.size} ×${item.quantity}</div>
          <div style="font-size:13px;font-weight:600">NT$${(item.priceTwd || 0).toLocaleString()} <span style="color:#aaa;font-weight:400">(${item.price})</span></div>
        </td>
      </tr>`,
    )
    .join('');

  const adminHtml = `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#333">
    <div style="background:#4A5D59;color:white;padding:20px 24px;border-radius:12px 12px 0 0">
      <h2 style="margin:0;font-size:18px">新訂單通知</h2>
      <p style="margin:4px 0 0;opacity:0.8;font-size:13px">${orderNo}</p>
    </div>
    <div style="background:#fff;border:1px solid #e8e8e8;padding:20px 24px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 0;color:#888;font-size:12px;width:80px">LINE</td><td style="font-size:13px">${lineName || '未知'}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:12px">姓名</td><td style="font-size:13px">${customerName}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:12px">電話</td><td style="font-size:13px">${phone}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:12px">地址</td><td style="font-size:13px">${address}</td></tr>
        <tr><td style="padding:4px 0;color:#888;font-size:12px">付款</td><td style="font-size:13px">${paymentLabel}${accountLast5 ? ` ／ 末五碼：${accountLast5}` : ''}</td></tr>
      </table>

      <h3 style="font-size:14px;color:#4A5D59;border-bottom:2px solid #e8f0e9;padding-bottom:8px;margin-bottom:0">📦 商品明細</h3>
      <table style="width:100%;border-collapse:collapse">${adminItemHtml}</table>

      <h3 style="font-size:14px;color:#4A5D59;border-bottom:2px solid #e8f0e9;padding-bottom:8px">💰 費用明細</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:3px 0;color:#666">商品小計</td><td style="text-align:right">NT$${(subtotalTwd || 0).toLocaleString()} （¥${(totalJpy || 0).toLocaleString()}）</td></tr>
        <tr><td style="padding:3px 0;color:#666">國際運費（${shippingMethod || 'ePacket'}）</td><td style="text-align:right">NT$${(shippingTwd || 0).toLocaleString()}</td></tr>
        <tr><td style="padding:3px 0;color:#666">代購服務費</td><td style="text-align:right">NT$${serviceFeeTwd || 0}</td></tr>
        ${discountTwd > 0 ? `<tr><td style="padding:3px 0;color:#c0392b">轉帳優惠折扣（-3%）</td><td style="text-align:right;color:#c0392b">-NT$${discountTwd.toLocaleString()}</td></tr>` : ''}
        <tr style="font-weight:700;font-size:15px;border-top:2px solid #e8e8e8">
          <td style="padding:8px 0">總計(含稅)</td><td style="text-align:right">NT$${gt.toLocaleString()}</td>
        </tr>
      </table>

      <div style="margin-top:16px;padding:12px;background:#f8f8f8;border-radius:8px;font-size:11px;color:#aaa">
        訂單編號：${orderNo}　UUID：${order.id}
      </div>
    </div>
  </div>`;

  // 5. 發送電子郵件通知公司信箱
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.mailUser,
        pass: config.mailPass,
      },
    });

    await transporter.verify();

    const mailOptions = {
      from: `"洛姆代購" <${config.mailUser}>`,
      to: config.adminEmail,
      subject: `🔔 新訂單通知：${orderNo} - ${customerName}`,
      text: adminMsg,
      html: adminHtml,
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ 訂單信件發送成功');
  } catch (err: any) {
    console.error(
      '❌ 信件發送失敗:',
      err.message,
      '| code:',
      err.code,
      '| mailUser:',
      config.mailUser ? '已設定' : '未設定',
      '| mailPass:',
      config.mailPass ? '已設定' : '未設定',
    );
  }

  return { ok: true, orderId: order.id, orderNo };
});
