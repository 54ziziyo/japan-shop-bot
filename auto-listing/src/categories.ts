// ============================================================
// 分類比對：Claude 選的分類名稱 → WooCommerce 分類 id（含上層）
// auto-listing/src/categories.ts
// ============================================================

import type { WooCategory } from './woocommerce';

/** 要給 Claude 挑選的分類名稱清單（排除最上層容器與空名） */
export function categoryOptionNames(cats: WooCategory[]): string[] {
  // 有被當成別人 parent 的視為「上層容器」，仍保留（商品種類常是中層），
  // 這裡單純回傳所有不重複名稱，讓 Claude 依商品種類挑。
  const names = cats.map((c) => c.name.trim()).filter(Boolean);
  return Array.from(new Set(names));
}

/**
 * 把 Claude 選的分類名稱解析成「該分類 + 其所有上層」的 id 陣列。
 * 支援 "Parent/Child" 路徑格式以消除同名子分類歧義（如 KUSHITANI/春夏款）。
 * 找不到時回傳空陣列（呼叫端可決定是否警告）。
 */
export function resolveCategoryIds(
  cats: WooCategory[],
  chosenName: string,
): number[] {
  const byId = new Map(cats.map((c) => [c.id, c]));

  const walkUp = (leaf: WooCategory): number[] => {
    const ids: number[] = [];
    let cur: WooCategory | undefined = leaf;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      ids.push(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return ids;
  };

  // "Parent/Child" 路徑格式：找父名稱符合的葉節點
  if (chosenName.includes('/')) {
    const parts = chosenName.split('/').map((p) => p.trim().toLowerCase());
    const leafName = parts[parts.length - 1]!;
    const parentName = parts[parts.length - 2]!;
    const match = cats.find((c) => {
      if (c.name.trim().toLowerCase() !== leafName) return false;
      const parent = c.parent ? byId.get(c.parent) : undefined;
      return parent?.name.trim().toLowerCase() === parentName;
    });
    return match ? walkUp(match) : [];
  }

  // 一般名稱查找（原有邏輯）
  const target = chosenName.trim().toLowerCase();
  const match = cats.find((c) => c.name.trim().toLowerCase() === target);
  return match ? walkUp(match) : [];
}
