// server/api/admin/partner-commissions.get.ts
// 管理員：查詢各網紅分潤彙總（按 coupon_partner_name 分組）
import { useSupabase } from '../../utils/supabase';

type PartnerEntry = {
  partnerName: string;
  codes: Set<string>;
  totalOrders: number;
  pendingCommission: number;
  confirmedCommission: number;
  totalCommission: number;
  totalDiscount: number;
};

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const secret = getHeader(event, 'x-admin-secret');

  if (!config.adminSecret || secret !== config.adminSecret) {
    throw createError({ statusCode: 401, statusMessage: '未授權' });
  }

  const supabase = useSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select(
      'coupon_partner_name, coupon_code, coupon_commission_twd, coupon_discount_twd, status',
    )
    .not('coupon_partner_name', 'is', null)
    .gt('coupon_commission_twd', 0);

  if (error) throw createError({ statusCode: 500, statusMessage: '查詢失敗' });

  const partnerMap: Record<string, PartnerEntry> = {};

  for (const order of data ?? []) {
    // 已取消的訂單不計算分潤
    if (order.status === 'cancelled') continue;

    const name = order.coupon_partner_name!;
    if (!partnerMap[name]) {
      partnerMap[name] = {
        partnerName: name,
        codes: new Set(),
        totalOrders: 0,
        pendingCommission: 0,
        confirmedCommission: 0,
        totalCommission: 0,
        totalDiscount: 0,
      };
    }

    const p = partnerMap[name];
    if (order.coupon_code) p.codes.add(order.coupon_code);
    p.totalOrders++;
    p.totalCommission += order.coupon_commission_twd ?? 0;
    p.totalDiscount += order.coupon_discount_twd ?? 0;

    // pending = 尚未確認付款的訂單，不宜立即發放分潤
    if (order.status === 'pending') {
      p.pendingCommission += order.coupon_commission_twd ?? 0;
    } else {
      // confirmed / processing / packing = 付款已確認，可計算應付分潤
      p.confirmedCommission += order.coupon_commission_twd ?? 0;
    }
  }

  const partners = Object.values(partnerMap)
    .map((p) => ({
      partnerName: p.partnerName,
      codes: Array.from(p.codes),
      totalOrders: p.totalOrders,
      pendingCommission: p.pendingCommission,
      confirmedCommission: p.confirmedCommission,
      totalCommission: p.totalCommission,
      totalDiscount: p.totalDiscount,
    }))
    .sort((a, b) => b.totalCommission - a.totalCommission);

  return { partners };
});
