// server/api/validate-coupon.post.ts
// 驗證折扣碼是否有效（唯讀，不扣除使用次數）
import { useSupabase } from '../utils/supabase';
import {
  countItemQuantity,
  evaluateCouponDiscount,
  normalizeCouponCode,
} from '#shared/coupons';

export default defineEventHandler(async (event) => {
  const { code, lineUserId, itemCount } = await readBody(event);

  if (!code || typeof code !== 'string' || !code.trim()) {
    throw createError({ statusCode: 400, statusMessage: '請輸入折扣碼' });
  }

  const normalizedItemCount = countItemQuantity(itemCount);

  const supabase = useSupabase();
  const { data: coupon } = await supabase
    .from('coupon_codes')
    .select(
      'code, discount_twd, commission_twd, partner_name, discount_rules, total_quantity, used_count, is_active, expires_at, per_user_limit',
    )
    .eq('code', normalizeCouponCode(code))
    .maybeSingle();

  // 統一回傳「無效」，避免洩漏折扣碼是否存在或狀態
  if (!coupon || !coupon.is_active)
    return { valid: false, message: '折扣碼無效' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, message: '折扣碼無效' };
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

  const result = evaluateCouponDiscount(coupon, normalizedItemCount);
  if (!result.valid) {
    return { valid: false, message: result.message || '折扣碼無效' };
  }

  return {
    valid: true,
    discountTwd: result.discountTwd,
    commissionTwd: result.commissionTwd,
    partnerName: result.partnerName,
    code: coupon.code,
    summary: result.summary,
    requiredItems: result.requiredItems,
  };
});
