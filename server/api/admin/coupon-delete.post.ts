// server/api/admin/coupon-delete.post.ts
// 管理員：刪除折扣碼（同時刪除使用紀錄）
import { useSupabase } from '../../utils/supabase';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = getHeader(event, 'x-admin-secret');

  if (!config.adminSecret || secret !== config.adminSecret) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const { id, code } = await readBody(event);
  if (!id || !code) {
    throw createError({ statusCode: 400, statusMessage: '缺少必要欄位' });
  }

  const supabase = useSupabase();

  // 先刪除使用紀錄，再刪除折扣碼
  await supabase
    .from('coupon_usages')
    .delete()
    .eq('coupon_code', String(code).toUpperCase());

  const { error } = await supabase.from('coupon_codes').delete().eq('id', id);
  if (error) {
    throw createError({ statusCode: 500, statusMessage: '刪除失敗' });
  }

  return { ok: true };
});
