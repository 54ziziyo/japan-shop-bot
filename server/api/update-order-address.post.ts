import { useSupabase } from '../utils/supabase';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const supabase = useSupabase();

  const { orderId, address, userId } = await readBody(event);

  if (!orderId || !address || !userId) {
    throw createError({ statusCode: 400, statusMessage: '缺少必要參數' });
  }

  // 查詢訂單確認擁有權與狀態
  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id, user_id, status')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    throw createError({ statusCode: 404, statusMessage: '找不到訂單' });
  }

  if (order.user_id !== userId) {
    throw createError({ statusCode: 403, statusMessage: '無權限修改此訂單' });
  }

  if (!['pending', 'confirmed'].includes(order.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: '此訂單狀態不允許修改地址',
    });
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ address })
    .eq('id', orderId);

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: '更新地址失敗' });
  }

  return { ok: true };
});
