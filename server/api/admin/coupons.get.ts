// server/api/admin/coupons.get.ts
// 管理員：查詢所有折扣碼
import { useSupabase } from '../../utils/supabase';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = getHeader(event, 'x-admin-secret');

  if (!config.adminSecret || secret !== config.adminSecret) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const supabase = useSupabase();
  const { data, error } = await supabase
    .from('coupon_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw createError({ statusCode: 500, statusMessage: '查詢失敗' });
  return { coupons: data || [] };
});
