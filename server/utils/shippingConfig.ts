// ============================================================
// 📦 代購運費 & 分類計算設定檔
// ============================================================
// Uniqlo API breadcrumbs.class.name 對應的分類：
//   tops, bottoms, outerwear, innerwear, homewear,
//   loungewear, accessories, shoes, bags, socks, ...
// ============================================================

/**
 * 商品分類對照表
 * key = Uniqlo API 回傳的 breadcrumbs.class.name
 * value = 你的自訂分類
 */
export const CATEGORY_MAP: Record<string, string> = {
  // --- 上衣 ---
  tops: '上衣',
  // --- 褲子 / 裙子 ---
  bottoms: '褲子',
  // --- 外套 ---
  outerwear: '外套',
  // --- 內衣 ---
  innerwear: '內衣',
  // --- 居家服 ---
  homewear: '居家服',
  loungewear: '居家服',
  // --- 配件 ---
  accessories: '配件',
  socks: '配件',
  // --- 鞋子 ---
  shoes: '鞋子',
  // --- 包包 ---
  bags: '包包',
};

/** 預設分類（找不到對應時使用） */
export const DEFAULT_CATEGORY = '其他';

/**
 * 將 Uniqlo API 分類轉為中文分類
 */
export const getCategoryLabel = (apiCategory: string): string => {
  return CATEGORY_MAP[apiCategory?.toLowerCase()] || DEFAULT_CATEGORY;
};

// ============================================================
// 💰 運費計算
// ============================================================
// 💡 以下是常見的日本代購運費計算方式，請依實際情況調整：
//
// 常見做法：
//   1. 按重量（EMS / 航空便）
//   2. 按件數（每件固定運費）
//   3. 混合（基本費 + 每件加價）
//
// EMS 日本→台灣 參考費率（2024）：
//   ~500g  → ¥1,450
//   ~1kg   → ¥1,900
//   ~2kg   → ¥3,150
//   ~3kg   → ¥4,400
//   ~4kg   → ¥5,400
//   ~5kg   → ¥6,400
// ============================================================

/** 每個分類的預估重量（公克） */
export const WEIGHT_PER_CATEGORY: Record<string, number> = {
  上衣: 300,
  褲子: 400,
  外套: 600,
  內衣: 150,
  居家服: 350,
  配件: 100,
  鞋子: 700,
  包包: 500,
  其他: 350,
};

/** EMS 日本→台灣 費率表 [最大重量(g), 費用(¥)] */
export const EMS_RATES: [number, number][] = [
  [500, 1450],
  [1000, 1900],
  [2000, 3150],
  [3000, 4400],
  [4000, 5400],
  [5000, 6400],
  [6000, 7400],
  [8000, 9200],
  [10000, 11000],
  [15000, 15500],
  [20000, 20000],
];

/**
 * 依重量查詢 EMS 運費
 * @param weightGrams 總重量（公克）
 * @returns 運費（日圓）
 */
export const getEmsShipping = (weightGrams: number): number => {
  for (const [maxWeight, cost] of EMS_RATES) {
    if (weightGrams <= maxWeight) return cost;
  }
  // 超過最大重量：需要分箱
  return EMS_RATES[EMS_RATES.length - 1]![1];
};

// ============================================================
// 🧮 代購手續費
// ============================================================

/** 代購手續費比例（例如 8% = 0.08） */
export const SERVICE_FEE_RATE = 0.08;

/** 最低手續費（日圓） */
export const MIN_SERVICE_FEE = 500;

/**
 * 計算代購手續費
 * @param subtotalYen 商品小計（日圓）
 */
export const getServiceFee = (subtotalYen: number): number => {
  return Math.max(Math.round(subtotalYen * SERVICE_FEE_RATE), MIN_SERVICE_FEE);
};

// ============================================================
// 📊 完整報價計算
// ============================================================

export interface CartItemForQuote {
  price: string; // e.g. "¥1990"
  quantity: number;
  category: string; // Uniqlo API category (e.g. "bottoms")
}

export interface QuoteResult {
  /** 商品小計（日圓） */
  subtotal: number;
  /** 預估總重量（公克） */
  totalWeight: number;
  /** EMS 運費（日圓） */
  shippingFee: number;
  /** 代購手續費（日圓） */
  serviceFee: number;
  /** 總計（日圓） */
  total: number;
  /** 各分類件數統計 */
  categoryCounts: Record<string, number>;
}

/**
 * 計算完整報價
 */
export const calculateQuote = (items: CartItemForQuote[]): QuoteResult => {
  let subtotal = 0;
  let totalWeight = 0;
  const categoryCounts: Record<string, number> = {};

  for (const item of items) {
    const priceVal = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
    const qty = item.quantity || 1;
    subtotal += priceVal * qty;

    const label = getCategoryLabel(item.category);
    const weight = WEIGHT_PER_CATEGORY[label] || WEIGHT_PER_CATEGORY['其他']!;
    totalWeight += weight * qty;

    categoryCounts[label] = (categoryCounts[label] || 0) + qty;
  }

  const shippingFee = getEmsShipping(totalWeight);
  const serviceFee = getServiceFee(subtotal);
  const total = subtotal + shippingFee + serviceFee;

  return {
    subtotal,
    totalWeight,
    shippingFee,
    serviceFee,
    total,
    categoryCounts,
  };
};
