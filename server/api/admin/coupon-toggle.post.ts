// server/api/admin/coupon-toggle.post.ts
// 管理員：啟用 / 停用折扣碼
import { useSupabase } from '../../utils/supabase';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = getHeader(event, 'x-admin-secret');

  if (!config.adminSecret || secret !== config.adminSecret) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const { id, isActive } = await readBody(event);

  if (!id) throw createError({ statusCode: 400, statusMessage: '缺少 id' });
  if (typeof isActive !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: '缺少 isActive' });
  }

  const supabase = useSupabase();
  const { error } = await supabase
    .from('coupon_codes')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) throw createError({ statusCode: 500, statusMessage: '更新失敗' });
  return { ok: true };
});
