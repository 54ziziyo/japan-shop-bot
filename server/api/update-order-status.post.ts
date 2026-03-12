// server/api/update-order-status.post.ts
// 接收 Google Apps Script 的狀態更新，只允許修改 orders.status
import { createClient } from '@supabase/supabase-js';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const body = await readBody(event);
  const secret = getHeader(event, 'x-webhook-secret');

  // 🔍 Debug：排查 secret 比對問題（上線穩定後可移除）
  const expected = config.sheetsWebhookSecret;
  console.log(`🔑 收到 secret 長度=${secret?.length ?? 'null'}, 期望長度=${expected?.length ?? 'null'}, 相符=${secret === expected}`);

  // 驗證暗號
  if (secret !== expected) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const { orderId, status } = body || {};
  if (!orderId || !status) {
    throw createError({ statusCode: 400, statusMessage: '缺少 orderId 或 status' });
  }

  // 只允許這些狀態值
  const ALLOWED_STATUSES = [
    'pending',
    'confirmed',
    'purchasing',
    'shipped',
    'delivered',
    'cancelled',
  ];
  if (!ALLOWED_STATUSES.includes(status)) {
    throw createError({ statusCode: 400, statusMessage: '不合法的狀態值' });
  }

  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey,
  );

  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: '更新失敗' });
  }

  return { ok: true };
});