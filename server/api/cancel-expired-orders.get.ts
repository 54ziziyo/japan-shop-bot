// server/api/cancel-expired-orders.get.ts
// Vercel Cron Job：每日自動取消超過三天未轉帳的待付款訂單
// 不使用 LINE push 也不寄 email（避免通知雜訊），狀態改為 cancelled 即可
import { createClient } from '@supabase/supabase-js';

// ⏱️ 逾期門檻（毫秒）— 測試時改為 1 分鐘，正式上線改回 3 天
const EXPIRE_MS = 1 * 60 * 1000; // 🔧 測試中：1 分鐘
// const EXPIRE_MS = 3 * 24 * 60 * 60 * 1000; // ✅ 正式：3 天

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  // 驗證只有 Vercel Cron 可呼叫（Authorization: Bearer {CRON_SECRET}）
  const authHeader = getHeader(event, 'authorization') ?? '';
  const cronSecret = config.cronSecret;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey,
  );

  // 查詢逾期未確認的銀行轉帳訂單
  const cutoff = new Date(Date.now() - EXPIRE_MS).toISOString();
  const { data: expiredOrders, error: fetchError } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'pending')
    .eq('payment_method', 'bank_transfer')
    .lt('created_at', cutoff);

  if (fetchError) {
    console.error('❌ 查詢逾期訂單失敗:', fetchError.message);
    throw createError({ statusCode: 500, statusMessage: '查詢失敗' });
  }

  if (!expiredOrders || expiredOrders.length === 0) {
    console.log('✅ 無逾期訂單需要取消');
    return { ok: true, cancelled: 0 };
  }

  // 批次更新狀態為 cancelled
  const expiredIds = expiredOrders.map((o) => o.id);
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .in('id', expiredIds);

  if (updateError) {
    console.error('❌ 批次取消訂單失敗:', updateError.message);
    throw createError({ statusCode: 500, statusMessage: '更新失敗' });
  }

  console.log(
    `✅ 已取消 ${expiredOrders.length} 筆逾期訂單:`,
    expiredIds.join(', '),
  );

  return { ok: true, cancelled: expiredOrders.length };
});
