// server/api/cancel-expired-orders.get.ts
// Vercel Cron Job：自動刪除逾期未轉帳的 pending 訂單（DB + Google 試算表）
import { createClient } from '@supabase/supabase-js';
import { deleteOrderRows } from '../utils/googleSheets';

// ⏱️ 逾期門檻（毫秒）
const EXPIRE_MS = 3 * 24 * 60 * 60 * 1000; // ✅ 正式：3 天
// const EXPIRE_MS = 1 * 60 * 1000; // 🔧 測試中：1 分鐘 http://localhost:3000/api/cancel-expired-orders?secret=CRON_SECRET

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);

  // 驗證身份：Vercel Cron 用 Authorization header，本機測試可用 ?secret= query
  const authHeader = getHeader(event, 'authorization') ?? '';
  const querySecret = getQuery(event).secret as string | undefined;
  const cronSecret = config.cronSecret;

  const authorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret);

  if (!authorized) {
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
    console.log('✅ 無逾期訂單需要刪除');
    return { ok: true, deleted: 0 };
  }

  const expiredIds = expiredOrders.map((o) => o.id);

  // 1. 從 Google 試算表刪除對應的列
  try {
    await deleteOrderRows(
      {
        googleServiceAccountJson: config.googleServiceAccountJson,
        googleSpreadsheetId: config.googleSpreadsheetId,
        googleSheetName: config.googleSheetName,
      },
      expiredIds,
    );
    console.log('✅ 試算表刪除成功');
  } catch (err: any) {
    console.error('❌ 試算表刪除失敗（不影響 DB 刪除）:', err.message);
  }

  // 2. 從資料庫直接刪除訂單
  const { error: deleteError } = await supabase
    .from('orders')
    .delete()
    .in('id', expiredIds);

  if (deleteError) {
    console.error('❌ 刪除訂單失敗:', deleteError.message);
    throw createError({ statusCode: 500, statusMessage: '刪除失敗' });
  }

  console.log(
    `✅ 已刪除 ${expiredOrders.length} 筆逾期訂單:`,
    expiredIds.join(', '),
  );

  return { ok: true, deleted: expiredOrders.length };
});
