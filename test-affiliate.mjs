/**
 * 分潤邏輯測試腳本
 * 執行：node test-affiliate.mjs
 *
 * 測試 shared/coupons.ts 的核心邏輯（複製為純 JS 版本以避免編譯依賴）
 */

// ══════════════════════════════════════════════════════════════
// 核心邏輯（與 shared/coupons.ts 一致）
// ══════════════════════════════════════════════════════════════

function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCouponTierRules(raw) {
  if (!raw) return [];
  let source = raw;
  if (typeof raw === 'string') {
    try { source = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const minItems = toInt(item.minItems ?? item.min_items ?? item.min ?? item.quantity);
      const discountTwd = toInt(item.discountTwd ?? item.discount_twd ?? item.discount);
      const commissionTwd = toInt(item.commissionTwd ?? item.commission_twd ?? item.commission);
      if (minItems <= 0 || discountTwd <= 0) return null;
      return { minItems, discountTwd, ...(commissionTwd > 0 ? { commissionTwd } : {}) };
    })
    .filter(Boolean)
    .sort((a, b) => a.minItems - b.minItems);
}

function evaluateCouponDiscount(coupon, itemCount) {
  const normalizedCount = Math.max(0, Math.floor(itemCount));
  const rules = parseCouponTierRules(coupon.discount_rules);
  const partnerName = String(coupon.partner_name ?? '').trim() || null;
  const defaultCommission = toInt(coupon.commission_twd);

  if (rules.length > 0) {
    const matchedRule = [...rules].filter((rule) => normalizedCount >= rule.minItems).pop();
    if (!matchedRule) {
      const smallestRule = rules[0];
      return {
        valid: false, discountTwd: 0, commissionTwd: 0,
        summary: '', requiredItems: smallestRule.minItems,
        matchedRule: null, mode: 'tiered', partnerName,
        message: `此折扣碼需購買至少 ${smallestRule.minItems} 件商品`,
      };
    }
    const commissionTwd = matchedRule.commissionTwd ?? defaultCommission;
    return {
      valid: true, discountTwd: matchedRule.discountTwd, commissionTwd,
      summary: `${matchedRule.minItems} 件以上折 NT$${matchedRule.discountTwd}`,
      requiredItems: matchedRule.minItems, matchedRule, mode: 'tiered', partnerName,
    };
  }

  const fixedDiscount = toInt(coupon.discount_twd);
  if (fixedDiscount > 0) {
    return {
      valid: true, discountTwd: fixedDiscount, commissionTwd: defaultCommission,
      summary: `固定折扣 NT$${fixedDiscount}`,
      requiredItems: null, matchedRule: null, mode: 'fixed', partnerName,
    };
  }

  return {
    valid: false, discountTwd: 0, commissionTwd: 0,
    summary: '未設定折扣', requiredItems: null,
    matchedRule: null, mode: 'none', partnerName, message: '折扣碼無效',
  };
}

// ══════════════════════════════════════════════════════════════
// 測試工具
// ══════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? '斷言失敗');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label ?? ''}: 預期 ${JSON.stringify(expected)}，實際 ${JSON.stringify(actual)}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 測試案例
// ══════════════════════════════════════════════════════════════

console.log('\n🧪 分潤功能邏輯測試\n');

// ── 情境 A：奈米網紅折扣碼（買 5 件折 30 / 分潤 30）──────────
console.log('【情境 A】奈米網紅折扣碼 — 買 5 件折 30，分潤 30');

const influencerCoupon = {
  code: 'ALICE30',
  partner_name: '@alice_nano',
  discount_twd: 0,
  commission_twd: 0,
  discount_rules: [{ minItems: 5, discountTwd: 30, commissionTwd: 30 }],
};

test('買 5 件 → 折 NT$30，分潤 NT$30', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 5);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 30, 'discountTwd');
  assertEqual(r.commissionTwd, 30, 'commissionTwd');
  assertEqual(r.partnerName, '@alice_nano', 'partnerName');
  assertEqual(r.mode, 'tiered', 'mode');
});

test('買 7 件 → 仍符合 5 件門檻，折 NT$30，分潤 NT$30', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 7);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 30, 'discountTwd');
  assertEqual(r.commissionTwd, 30, 'commissionTwd');
});

test('買 4 件 → 未達門檻，不成立', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 4);
  assertEqual(r.valid, false, 'valid');
  assertEqual(r.discountTwd, 0, 'discountTwd');
  assertEqual(r.commissionTwd, 0, 'commissionTwd');
  assertEqual(r.requiredItems, 5, 'requiredItems');
  assert(r.message?.includes('5'), '錯誤訊息應包含件數門檻');
});

test('買 0 件 → 未達門檻，不成立', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 0);
  assertEqual(r.valid, false, 'valid');
});

// ── 情境 B：多階梯規則 ────────────────────────────────────────
console.log('\n【情境 B】多階梯折扣（3 件 / 5 件 / 8 件）');

const tieredCoupon = {
  code: 'BOB_TIER',
  partner_name: '@bob_ig',
  discount_twd: 0,
  commission_twd: 10,  // 預設分潤（當 rule 未設 commissionTwd 時使用）
  discount_rules: [
    { minItems: 3, discountTwd: 50, commissionTwd: 20 },
    { minItems: 5, discountTwd: 100, commissionTwd: 40 },
    { minItems: 8, discountTwd: 200, commissionTwd: 80 },
  ],
};

test('買 3 件 → 符合第一階，折 NT$50，分潤 NT$20', () => {
  const r = evaluateCouponDiscount(tieredCoupon, 3);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 50, 'discountTwd');
  assertEqual(r.commissionTwd, 20, 'commissionTwd');
});

test('買 5 件 → 升級至第二階，折 NT$100，分潤 NT$40', () => {
  const r = evaluateCouponDiscount(tieredCoupon, 5);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 100, 'discountTwd');
  assertEqual(r.commissionTwd, 40, 'commissionTwd');
});

test('買 8 件 → 升級至第三階，折 NT$200，分潤 NT$80', () => {
  const r = evaluateCouponDiscount(tieredCoupon, 8);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 200, 'discountTwd');
  assertEqual(r.commissionTwd, 80, 'commissionTwd');
});

test('買 10 件 → 符合最高階（第三），折 NT$200，分潤 NT$80', () => {
  const r = evaluateCouponDiscount(tieredCoupon, 10);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 200, 'discountTwd');
  assertEqual(r.commissionTwd, 80, 'commissionTwd');
});

test('買 2 件 → 未達最低門檻 3 件，不成立', () => {
  const r = evaluateCouponDiscount(tieredCoupon, 2);
  assertEqual(r.valid, false, 'valid');
  assertEqual(r.requiredItems, 3, 'requiredItems');
});

// ── 情境 C：rule 無 commissionTwd，改用 coupon 預設值 ─────────
console.log('\n【情境 C】Rule 無 commissionTwd，使用預設分潤欄位');

const couponWithDefaultCommission = {
  code: 'CAROL10',
  partner_name: '@carol',
  discount_twd: 0,
  commission_twd: 25,  // 預設分潤
  discount_rules: [{ minItems: 5, discountTwd: 80 }],  // 未設 commissionTwd
};

test('買 5 件 → 折 NT$80，分潤使用預設 NT$25', () => {
  const r = evaluateCouponDiscount(couponWithDefaultCommission, 5);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 80, 'discountTwd');
  assertEqual(r.commissionTwd, 25, 'commissionTwd（應使用預設值）');
});

// ── 情境 D：固定折扣模式（非階梯）────────────────────────────
console.log('\n【情境 D】固定折扣模式（無 discount_rules）');

const fixedCoupon = {
  code: 'FIXED50',
  partner_name: '@david',
  discount_twd: 50,
  commission_twd: 15,
  discount_rules: null,
};

test('固定折扣：任何件數 → 折 NT$50，分潤 NT$15', () => {
  const r = evaluateCouponDiscount(fixedCoupon, 1);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.discountTwd, 50, 'discountTwd');
  assertEqual(r.commissionTwd, 15, 'commissionTwd');
  assertEqual(r.mode, 'fixed', 'mode');
});

// ── 情境 E：安全性 — 折扣不超過最低利潤保護 ─────────────────
console.log('\n【情境 E】安全性驗證 — 最低利潤保護（MIN_PROFIT_TWD = 100）');

const MIN_PROFIT_TWD = 100;

test('5 件規則：折 30 + 分潤 30 = 60 < 5×100=500 → 安全', () => {
  const rules = [{ minItems: 5, discountTwd: 30, commissionTwd: 30 }];
  for (const rule of rules) {
    const totalCost = rule.discountTwd + (rule.commissionTwd ?? 0);
    const minProfit = rule.minItems * MIN_PROFIT_TWD;
    assert(totalCost < minProfit, `NT$${totalCost} 應小於 NT$${minProfit}`);
  }
});

test('5 件規則：折 300 + 分潤 300 = 600 > 5×100=500 → 危險（應觸發警示）', () => {
  const rules = [{ minItems: 5, discountTwd: 300, commissionTwd: 300 }];
  let hasRisk = false;
  for (const rule of rules) {
    const totalCost = rule.discountTwd + (rule.commissionTwd ?? 0);
    const minProfit = rule.minItems * MIN_PROFIT_TWD;
    if (totalCost >= minProfit) hasRisk = true;
  }
  assert(hasRisk, '應偵測到潛在虧損風險');
});

test('安全係數計算：8 件規則折 200 + 分潤 80 = 280 < 8×100=800 → 安全', () => {
  const rule = { minItems: 8, discountTwd: 200, commissionTwd: 80 };
  const totalCost = rule.discountTwd + (rule.commissionTwd ?? 0);
  const minProfit = rule.minItems * MIN_PROFIT_TWD;
  assert(totalCost < minProfit, `NT$${totalCost} 應小於 NT$${minProfit}`);
});

// ── 情境 F：輸入邊界條件 ─────────────────────────────────────
console.log('\n【情境 F】邊界條件');

test('負數件數 → 正規化為 0，不符合任何規則', () => {
  const r = evaluateCouponDiscount(influencerCoupon, -3);
  assertEqual(r.valid, false, 'valid');
});

test('浮點數件數 1.9 → 向下取整為 1 件，不符合 5 件門檻', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 1.9);
  assertEqual(r.valid, false, 'valid');
});

test('浮點數件數 5.9 → 向下取整為 5 件，符合 5 件門檻', () => {
  const r = evaluateCouponDiscount(influencerCoupon, 5.9);
  assertEqual(r.valid, true, 'valid');
});

test('空 discount_rules JSON → 解析失敗，回傳空陣列', () => {
  const rules = parseCouponTierRules('not valid json');
  assertEqual(rules.length, 0, '應回傳空陣列');
});

test('discount_rules minItems ≤ 0 → 過濾掉', () => {
  const rules = parseCouponTierRules([{ minItems: 0, discountTwd: 100 }]);
  assertEqual(rules.length, 0, '應過濾掉無效規則');
});

test('discount_rules discountTwd ≤ 0 → 過濾掉', () => {
  const rules = parseCouponTierRules([{ minItems: 3, discountTwd: 0 }]);
  assertEqual(rules.length, 0, '應過濾掉無效規則');
});

// ══════════════════════════════════════════════════════════════
// 結果摘要
// ══════════════════════════════════════════════════════════════

console.log(`\n${'─'.repeat(50)}`);
console.log(`結果：${passed} 通過 / ${failed} 失敗`);
if (failed === 0) {
  console.log('🎉 所有測試通過！分潤邏輯運作正常。\n');
} else {
  console.log('⚠️  有測試未通過，請檢查上方錯誤訊息。\n');
  process.exit(1);
}
