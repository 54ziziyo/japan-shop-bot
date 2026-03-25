// ============================================================
// 💰 Kushitani 自訂售價查表
// server/utils/kushitaniPricing.ts
// ============================================================
// 從 server/data/kushitani-pricing.json 讀取型號 → 台幣售價對照表。
// 有自訂價格的商品直接顯示台幣定價，且可選擇不計入國際運費。

import pricingData from '../data/kushitani-pricing.json';

interface KushitaniCustomPrice {
  priceTwd: number;
  skipShipping: boolean;
}

/** 忽略以 _ 開頭的說明欄位 */
const pricing: Record<string, KushitaniCustomPrice> = {};
for (const [key, val] of Object.entries(pricingData)) {
  if (key.startsWith('_')) continue;
  const v = val as any;
  if (typeof v === 'object' && typeof v.priceTwd === 'number') {
    pricing[key] = {
      priceTwd: v.priceTwd,
      skipShipping: v.skipShipping === true,
    };
  }
}

/**
 * 依型號查詢自訂售價
 * @param modelNumber Kushitani 型號（e.g. "7701", "K-2846"）
 * @returns 自訂價格資訊，或 null 表示使用原價公式
 */
export function getKushitaniCustomPrice(
  modelNumber: string,
): KushitaniCustomPrice | null {
  if (!modelNumber) return null;
  return pricing[modelNumber] ?? null;
}
