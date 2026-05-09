// server/api/admin/coupons.post.ts
// 管理員：建立新折扣碼
import { useSupabase } from '../../utils/supabase';
import { parseCouponTierRules } from '#shared/coupons';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = getHeader(event, 'x-admin-secret');

  if (!config.adminSecret || secret !== config.adminSecret) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const {
    code,
    discountTwd,
    discountRules,
    totalQuantity,
    expiresAt,
    perUserLimit,
  } = await readBody(event);

  if (!code?.trim()) {
    throw createError({ statusCode: 400, statusMessage: '請輸入折扣碼代碼' });
  }
  if (!totalQuantity || Number(totalQuantity) <= 0) {
    throw createError({ statusCode: 400, statusMessage: '發行數量必須大於 0' });
  }

  const tierRules = parseCouponTierRules(discountRules);
  const hasTierRulesInput = String(discountRules ?? '').trim().length > 0;
  const fixedDiscount = Math.round(Number(discountTwd));

  if (!tierRules.length && (!discountTwd || fixedDiscount <= 0)) {
    throw createError({ statusCode: 400, statusMessage: '折扣金額必須大於 0' });
  }
  if (hasTierRulesInput && !tierRules.length) {
    throw createError({
      statusCode: 400,
      statusMessage: '請輸入正確的件數折扣規則',
    });
  }

  const supabase = useSupabase();
  const { data, error } = await supabase
    .from('coupon_codes')
    .insert({
      code: String(code).trim().toUpperCase(),
      discount_twd: tierRules.length ? 0 : fixedDiscount,
      discount_rules: tierRules.length ? tierRules : null,
      total_quantity: Math.round(Number(totalQuantity)),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      per_user_limit: perUserLimit !== false, // 預設 true
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: '此折扣碼已存在' });
    }
    console.error('❌ coupon insert error:', error.code, error.message);
    throw createError({
      statusCode: 500,
      statusMessage: `建立失敗：${error.message}`,
    });
  }

  return { coupon: data };
});
