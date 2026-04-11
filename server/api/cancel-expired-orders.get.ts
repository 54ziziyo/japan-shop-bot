// server/api/cancel-expired-orders.get.ts
// Vercel Cron Job：自動將逾期未轉帳的 pending 訂單標記為 cancelled（DB + Google 試算表）
import { useSupabase } from '../utils/supabase';
import { updateOrderStatusInSheet } from '../utils/googleSheets';

// ⏱️ 逾期門檻（毫秒）
const EXPIRE_MS = 3 * 24 * 60 * 60 * 1000; // ✅ 正式：3 天
// const EXPIRE_MS = 1 * 60 * 1000; // 🔧 測試中：1 分鐘

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  const authHeader = getHeader(event, 'authorization') ?? '';
  const querySecret = getQuery(event).secret as string | undefined;
  const cronSecret = config.cronSecret;

  const authorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!authorized) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const supabase = useSupabase();

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

  const expiredIds = expiredOrders.map((o) => o.id);

  // 1. 更新 Google 試算表 H 欄狀態為 cancelled
  try {
    await updateOrderStatusInSheet(
      {
        googleServiceAccountJson: config.googleServiceAccountJson,
        googleSpreadsheetId: config.googleSpreadsheetId,
        googleSheetName: config.googleSheetName,
      },
      expiredIds,
      'cancelled',
    );
    console.log('✅ 試算表狀態更新成功');
  } catch (err: any) {
    console.error('❌ 試算表狀態更新失敗（不影響 DB 更新）:', err.message);
  }

  // 2. 更新資料庫訂單狀態為 cancelled
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .in('id', expiredIds);

  if (updateError) {
    console.error('❌ 更新訂單狀態失敗:', updateError.message);
    throw createError({ statusCode: 500, statusMessage: '更新失敗' });
  }

  console.log(
    `✅ 已取消 ${expiredOrders.length} 筆逾期訂單:`,
    expiredIds.join(', '),
  );

  return { ok: true, cancelled: expiredOrders.length };
});
