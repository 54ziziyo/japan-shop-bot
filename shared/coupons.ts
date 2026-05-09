export type CouponTierRule = {
  minItems: number;
  discountTwd: number;
};

export type CouponLike = {
  code?: string | null;
  discount_twd?: number | string | null;
  discount_rules?: unknown;
};

export type CouponDiscountResult = {
  valid: boolean;
  discountTwd: number;
  summary: string;
  requiredItems: number | null;
  matchedRule: CouponTierRule | null;
  mode: 'fixed' | 'tiered' | 'none';
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
      if (minItems <= 0 || discountTwd <= 0) return null;
      return { minItems, discountTwd };
    })
    .filter((item): item is CouponTierRule => !!item)
    .sort((a, b) => a.minItems - b.minItems);
}

export function formatCouponTierRule(rule: CouponTierRule): string {
  return `${rule.minItems} 件以上折 NT$${rule.discountTwd.toLocaleString()}`;
}

export function formatCouponDiscountSummary(coupon: CouponLike): string {
  const rules = parseCouponTierRules(coupon.discount_rules);
  if (rules.length > 0) {
    return rules.map(formatCouponTierRule).join(' / ');
  }

  const fixedDiscount = toInt(coupon.discount_twd);
  if (fixedDiscount > 0) {
    return `固定折扣 NT$${fixedDiscount.toLocaleString()}`;
  }

  return '未設定折扣';
}

export function evaluateCouponDiscount(
  coupon: CouponLike,
  itemCount: number,
): CouponDiscountResult {
  const normalizedCount = Math.max(0, Math.floor(itemCount));
  const rules = parseCouponTierRules(coupon.discount_rules);

  if (rules.length > 0) {
    const matchedRule = [...rules]
      .filter((rule) => normalizedCount >= rule.minItems)
      .pop();

    if (!matchedRule) {
      const smallestRule = rules[0]!;
      return {
        valid: false,
        discountTwd: 0,
        summary: formatCouponDiscountSummary(coupon),
        requiredItems: smallestRule.minItems,
        matchedRule: null,
        mode: 'tiered',
        message: `此折扣碼需購買至少 ${smallestRule.minItems} 件商品`,
      };
    }

    return {
      valid: true,
      discountTwd: matchedRule.discountTwd,
      summary: formatCouponTierRule(matchedRule),
      requiredItems: matchedRule.minItems,
      matchedRule,
      mode: 'tiered',
    };
  }

  const fixedDiscount = toInt(coupon.discount_twd);
  if (fixedDiscount > 0) {
    return {
      valid: true,
      discountTwd: fixedDiscount,
      summary: `固定折扣 NT$${fixedDiscount.toLocaleString()}`,
      requiredItems: null,
      matchedRule: null,
      mode: 'fixed',
    };
  }

  return {
    valid: false,
    discountTwd: 0,
    summary: '未設定折扣',
    requiredItems: null,
    matchedRule: null,
    mode: 'none',
    message: '折扣碼無效',
  };
}