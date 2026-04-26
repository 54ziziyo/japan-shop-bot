// server/api/validate-coupon.post.ts
// 驗證折扣碼是否有效（唯讀，不扣除使用次數）
import { useSupabase } from '../utils/supabase';

export default defineEventHandler(async (event) => {
  const { code, lineUserId } = await readBody(event);

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw createError({ statusCode: 400, statusMessage: '請輸入折扣碼' });
  }

  const supabase = useSupabase();
  const { data: coupon } = await supabase
    .from('coupon_codes')
    .select(
      'code, discount_twd, total_quantity, used_count, is_active, expires_at, per_user_limit',
    )
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (!coupon) return { valid: false, message: '折扣碼不存在' };
  if (!coupon.is_active) return { valid: false, message: '此折扣碼已停用' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, message: '此折扣碼已過期' };
  }
  if (coupon.used_count >= coupon.total_quantity) {
    return { valid: false, message: '此折扣碼已被使用完畢' };
  }

  // 僅在此折扣碼設定「每人限用一次」時才做檢查
  if (coupon.per_user_limit && lineUserId) {
    const { data: usage } = await supabase
      .from('coupon_usages')
      .select('id')
      .eq('coupon_code', coupon.code)
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    if (usage) return { valid: false, message: '您已使用過此折扣碼' };
  }

  return { valid: true, discountTwd: coupon.discount_twd, code: coupon.code };
});
