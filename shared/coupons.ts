export type CouponTierRule = {
  minItems: number;
  discountTwd: number;
  commissionTwd?: number;
};

export type CouponLike = {
  code?: string | null;
  partner_name?: string | null;
  discount_twd?: number | string | null;
  commission_twd?: number | string | null;
  discount_rules?: unknown;
};

export type CouponDiscountResult = {
  valid: boolean;
  discountTwd: number;
  commissionTwd: number;
  summary: string;
  requiredItems: number | null;
  matchedRule: CouponTierRule | null;
  mode: 'fixed' | 'tiered' | 'none';
  partnerName: string | null;
  message?: string;
};

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeCouponCode(code: unknown): string {
  return String(code ?? '').trim().toUpperCase();
}

export function countItemQuantity(
  items: Array<{ quantity?: number | string | null }> | number | null | undefined,
): number {
  if (typeof items === 'number') return Math.max(0, Math.floor(items));
  if (!Array.isArray(items)) return 0;

  return items.reduce((sum, item) => {
    const qty = toInt(item?.quantity ?? 1);
    return sum + (qty > 0 ? qty : 1);
  }, 0);
}

export function parseCouponTierRules(raw: unknown): CouponTierRule[] {
  if (!raw) return [];

  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const minItems = toInt(
        record.minItems ?? record.min_items ?? record.min ?? record.quantity,
      );
      const discountTwd = toInt(
        record.discountTwd ?? record.discount_twd ?? record.discount,
      );
      const commissionTwd = toInt(
        record.commissionTwd ?? record.commission_twd ?? record.commission,
      );
      if (minItems <= 0 || discountTwd <= 0) return null;
      return {
        minItems,
        discountTwd,
        ...(commissionTwd > 0 ? { commissionTwd } : {}),
      };
    })
    .filter((item): item is CouponTierRule => !!item)
    .sort((a, b) => a.minItems - b.minItems);
}

export function formatCouponTierRule(rule: CouponTierRule): string {
  const parts = [`${rule.minItems} 件以上折 NT$${rule.discountTwd.toLocaleString()}`];
  if ((rule.commissionTwd ?? 0) > 0) {
    parts.push(`分潤 NT$${(rule.commissionTwd ?? 0).toLocaleString()}`);
  }
  return parts.join(' / ');
}

function formatCouponTierDiscountText(rule: CouponTierRule): string {
  return `${rule.minItems} 件以上折 NT$${rule.discountTwd.toLocaleString()}`;
}

export function formatCouponDiscountSummary(coupon: CouponLike): string {
  const rules = parseCouponTierRules(coupon.discount_rules);
  if (rules.length > 0) {
    return rules.map(formatCouponTierDiscountText).join(' / ');
  }

  const fixedDiscount = toInt(coupon.discount_twd);
  if (fixedDiscount > 0) {
    return `固定折扣 NT$${fixedDiscount.toLocaleString()}`;
  }

  return '未設定折扣';
}

export function formatCouponCommissionSummary(coupon: CouponLike): string {
  const rules = parseCouponTierRules(coupon.discount_rules);
  const defaultCommission = toInt(coupon.commission_twd);

  if (rules.length > 0) {
    const ruleTexts = rules
      .map((rule) => {
        const commissionTwd = rule.commissionTwd ?? defaultCommission;
        if (commissionTwd <= 0) return '';
        return `${rule.minItems} 件以上分潤 NT$${commissionTwd.toLocaleString()}`;
      })
      .filter(Boolean);

    if (ruleTexts.length > 0) return ruleTexts.join(' / ');
  }

  if (defaultCommission > 0) {
    return `分潤 NT$${defaultCommission.toLocaleString()}`;
  }

  return '';
}

export function formatCouponAdminSummary(coupon: CouponLike): string {
  const parts: string[] = [];
  const partnerName = String(coupon.partner_name ?? '').trim();
  if (partnerName) parts.push(`網紅：${partnerName}`);

  const discountSummary = formatCouponDiscountSummary(coupon);
  if (discountSummary) parts.push(discountSummary);

  const commissionSummary = formatCouponCommissionSummary(coupon);
  if (commissionSummary) parts.push(commissionSummary);

  return parts.join(' · ');
}

export function evaluateCouponDiscount(
  coupon: CouponLike,
  itemCount: number,
): CouponDiscountResult {
  const normalizedCount = Math.max(0, Math.floor(itemCount));
  const rules = parseCouponTierRules(coupon.discount_rules);
  const partnerName = String(coupon.partner_name ?? '').trim() || null;
  const defaultCommission = toInt(coupon.commission_twd);

  if (rules.length > 0) {
    const matchedRule = [...rules]
      .filter((rule) => normalizedCount >= rule.minItems)
      .pop();

    if (!matchedRule) {
      const smallestRule = rules[0]!;
      return {
        valid: false,
        discountTwd: 0,
        commissionTwd: 0,
        summary: formatCouponDiscountSummary(coupon),
        requiredItems: smallestRule.minItems,
        matchedRule: null,
        mode: 'tiered',
        partnerName,
        message: `此折扣碼需購買至少 ${smallestRule.minItems} 件商品`,
      };
    }

    const commissionTwd = matchedRule.commissionTwd ?? defaultCommission;

    return {
      valid: true,
      discountTwd: matchedRule.discountTwd,
      commissionTwd,
      summary: formatCouponTierDiscountText(matchedRule),
      requiredItems: matchedRule.minItems,
      matchedRule,
      mode: 'tiered',
      partnerName,
    };
  }

  const fixedDiscount = toInt(coupon.discount_twd);
  if (fixedDiscount > 0) {
    return {
      valid: true,
      discountTwd: fixedDiscount,
      commissionTwd: defaultCommission,
      summary: `固定折扣 NT$${fixedDiscount.toLocaleString()}`,
      requiredItems: null,
      matchedRule: null,
      mode: 'fixed',
      partnerName,
    };
  }

  return {
    valid: false,
    discountTwd: 0,
    commissionTwd: 0,
    summary: '未設定折扣',
    requiredItems: null,
    matchedRule: null,
    mode: 'none',
    partnerName,
    message: '折扣碼無效',
  };
}
