// ============================================================
// 📦 運費 & 重量計算（唯一來源 — server & client 共用）
// ============================================================
// 匯率相關從 #shared/pricing 取得
import {
  JPY_SELL_RATE,
  parseJpy,
  jpyToTwd,
  getRateMarkup,
} from '#shared/pricing';

// ── 商品重量查表 ──

/**
 * 商品重量查表（含包材）
 *
 * 格式: { "class": { "category": weight(g), "_default": weight(g) } }
 * - class    = Uniqlo API breadcrumbs.class.name
 * - category = Uniqlo API breadcrumbs.category.name
 *
 * cart_items.category 存兩種格式：
 *   新格式 "class|category"  → e.g. "tops|t shirts"
 *   舊格式 "class"           → e.g. "tops" → fallback 到 _default
 */
const WEIGHT_MAP: Record<string, Record<string, number>> = {
  // ── 上衣 (tops) ──
  tops: {
    't shirts': 300, // T恤、Cut & Sew（短袖薄棉）
    'ut graphic tees': 300, // UT 聯名印花 T恤
    'sweatshirts and hoodies': 750, // 衛衣、連帽衫
    'tank tops': 200, // 背心、吊帶
    'polo shirts': 350, // Polo 衫
    _default: 400, // 其他上衣
  },

  // ── 毛衣・針織 (sweaters) ──
  sweaters: {
    sweaters: 700, // 針織毛衣（羊毛、美麗諾）
    cardigans: 600, // 開襟外套
    vests: 400, // 針織背心
    _default: 650,
  },

  // ── 童裝針織 (sweaters and shirts) ──
  'sweaters and shirts': {
    sweaters: 500,
    _default: 450,
  },

  // ── 襯衫・Polo (shirts and polo shirts) ──
  'shirts and polo shirts': {
    'dress shirts': 350, // 正裝襯衫
    'casual shirts': 400, // 休閒襯衫（法蘭絨等）
    'polo shirts': 350, // Polo 衫
    _default: 370,
  },

  // ── 女裝襯衫 (shirts and blouses) ──
  'shirts and blouses': {
    'shirts and blouses': 350, // 襯衫／女衫
    _default: 350,
  },

  // ── 外套 (outerwear) ──
  outerwear: {
    blouson: 900, // 夾克、風衣
    coats: 1300, // 大衣、長版外套
    down: 800, // 一般羽絨外套
    'ultra light down': 350, // 特級極輕羽絨
    fleece: 600, // 搖粒絨外套
    jackets: 800, // 西裝外套、夾克
    parkas: 1000, // 連帽風衣
    _default: 900,
  },

  // ── 褲子 (bottoms) ──
  bottoms: {
    jeans: 800, // 牛仔褲
    pants: 500, // 一般長褲
    'wide pants': 700, // 寬褲
    shorts: 400, // 短褲
    'leggings pants': 400, // 內搭褲
    'sweat pants': 700, // 運動棉褲
    _default: 600,
  },

  // ── 洋裝・裙子 (dresses and skirts) ──
  'dresses and skirts': {
    'dresses and jumpsuits': 500, // 洋裝、連身裙
    skirts: 400, // 裙子
    _default: 450,
  },

  // ── 內衣 (innerwear) ──
  innerwear: {
    heattech: 200, // 發熱衣
    airism: 150, // AIRism 涼感衣
    socks: 100, // 襪子
    bras: 150, // 內衣
    underwear: 100, // 底褲
    tights: 120, // 褲襪
    _default: 180,
  },

  // ── 居家服 (loungewear and homeware) ──
  'loungewear and homeware': {
    loungewear: 600, // 居家服套裝
    'room pants': 500, // 居家褲
    'room tops': 400, // 居家上衣
    _default: 550,
  },

  // ── 配件 (accessories) ──
  accessories: {
    shoes: 1200, // 鞋子
    bags: 500, // 包包
    belts: 200, // 腰帶
    hats: 150, // 帽子
    'scarves and gloves': 200, // 圍巾、手套
    socks: 100, // 襪子（歸類在配件時）
    _default: 250,
  },

  // ── 特別企劃 (special collaboration) ──
  'special collaboration': {
    _default: 500,
  },

  // ── 嬰幼兒 (toddler / baby) ──
  toddler: { _default: 250 },
  baby: { _default: 200 },

  // ── 童裝 (kids) ──
  kids: { _default: 350 },
};

/** 找不到任何對應時的預設重量 */
const FALLBACK_WEIGHT = 500;

/**
 * 依分類字串取得預估重量（公克）
 *
 * 支援三種輸入格式：
 * - 直接重量 "rstaichi|1700"  → 直接回傳 1700（RsTaichi 等品牌的實際重量）
 * - 新格式   "class|category"  → e.g. "tops|t shirts"（Uniqlo 分類查表）
 * - 舊格式   "class"           → e.g. "tops"（向下相容）
 */
export function getCategoryWeight(categoryStr: string): number {
  if (!categoryStr) return FALLBACK_WEIGHT;

  const lower = categoryStr.toLowerCase();
  const pipeIdx = lower.indexOf('|');

  if (pipeIdx !== -1) {
    const cls = lower.slice(0, pipeIdx);
    const rest = lower.slice(pipeIdx + 1);

    // 品牌直接重量格式: "rstaichi|1700" / "kushitani|2500"
    if (cls === 'rstaichi') {
      // +500g 為包材（紙箱 / 緩衝材）
      const grams = parseInt(rest);
      return grams > 0 ? grams + 500 : FALLBACK_WEIGHT;
    }
    if (cls === 'kushitani') {
      // 爬蟲已含包材重量，直接使用；0 表示含運直送，不計重
      const grams = parseInt(rest);
      return grams >= 0 ? grams : FALLBACK_WEIGHT;
    }
    if (cls === 'fr2') {
      // FR2 爬蟲已含包材重量，直接使用
      const grams = parseInt(rest);
      return grams > 0 ? grams : FALLBACK_WEIGHT;
    }
    if (cls === 'bape') {
      // BAPE 爬蟲已含包材重量（估算值），直接使用
      const grams = parseInt(rest);
      return grams > 0 ? grams : FALLBACK_WEIGHT;
    }

    const classMap = WEIGHT_MAP[cls];
    if (classMap) return classMap[rest] ?? classMap._default ?? FALLBACK_WEIGHT;
  } else {
    const classMap = WEIGHT_MAP[lower];
    if (classMap) return classMap._default ?? FALLBACK_WEIGHT;
  }

  return FALLBACK_WEIGHT;
}

/** 分類 → 中文顯示名稱 */
const CLASS_LABELS: Record<string, string> = {
  tops: '上衣',
  sweaters: '毛衣',
  'sweaters and shirts': '毛衣',
  'shirts and polo shirts': '襯衫',
  'shirts and blouses': '襯衫',
  outerwear: '外套',
  bottoms: '褲子',
  'dresses and skirts': '洋裝/裙',
  innerwear: '內衣',
  'loungewear and homeware': '居家服',
  accessories: '配件',
  'special collaboration': '特別企劃',
  toddler: '幼兒',
  baby: '嬰兒',
  kids: '童裝',
};

/**
 * 取得分類的中文顯示名稱
 */
export function getCategoryLabel(categoryStr: string): string {
  if (!categoryStr) return '其他';
  const lower = categoryStr.toLowerCase();
  const cls = lower.includes('|') ? lower.split('|')[0]! : lower;
  if (cls === 'rstaichi' || cls === 'kushitani') return '重機部品';
  if (cls === 'fr2' || cls === 'bape') return '潮流精品';
  return CLASS_LABELS[cls] || '其他';
}

// ── 運費費率表 ──

/** ePacket 日本→台灣 費率表（≤ 2000g） [最大重量(g), 費用(¥)] */
const EPACKET_RATES: [number, number][] = [
  [100, 720],
  [200, 820],
  [300, 920],
  [400, 1020],
  [500, 1120],
  [600, 1220],
  [700, 1320],
  [800, 1420],
  [900, 1520],
  [1000, 1620],
  [1100, 1720],
  [1200, 1820],
  [1300, 1920],
  [1400, 2020],
  [1500, 2120],
  [1600, 2220],
  [1700, 2320],
  [1800, 2420],
  [1900, 2520],
  [2000, 2620],
];

/** 國際小包 日本→台灣 費率表（> 2000g） [最大重量(g), 費用(¥)] */
const INTL_SMALL_PACKET_RATES: [number, number][] = [
  [1000, 2050],
  [2000, 2750],
  [3000, 3450],
  [4000, 4150],
  [5000, 4850],
  [6000, 5550],
  [7000, 6250],
  [8000, 6950],
  [9000, 7650],
  [10000, 8350],
  [11000, 8850],
  [12000, 9350],
  [13000, 9850],
  [14000, 10350],
  [15000, 10850],
  [16000, 11350],
  [17000, 11850],
  [18000, 12350],
  [19000, 12850],
  [20000, 13350],
  [21000, 13850],
  [22000, 14350],
  [23000, 14850],
  [24000, 15350],
  [25000, 15850],
  [26000, 16350],
  [27000, 16850],
  [28000, 17350],
  [29000, 17850],
  [30000, 18350],
];

// ── 運費計算函式 ──

/**
 * 依總重量計算國際運費
 * ≤ 2000g → ePacket
 * > 2000g → 國際小包
 * 回傳日圓運費 + 台幣運費（基礎匯率 0.205）
 *
 * @param forceIntlPacket 強制使用國際小包（RsTaichi 等大型商品）
 */
export function getShippingTwd(
  totalWeightGrams: number,
  rate?: number,
  forceIntlPacket?: boolean,
): {
  method: string;
  costJpy: number;
  costTwd: number;
} {
  if (totalWeightGrams <= 0) return { method: '-', costJpy: 0, costTwd: 0 };

  const baseRate = rate ?? JPY_SELL_RATE;
  let costJpy = 0;
  let method = '';

  if (!forceIntlPacket && totalWeightGrams <= 2000) {
    method = 'ePacket';
    for (const [maxW, cost] of EPACKET_RATES) {
      if (totalWeightGrams <= maxW) {
        costJpy = cost;
        break;
      }
    }
    if (!costJpy) costJpy = EPACKET_RATES[EPACKET_RATES.length - 1]![1];
  } else {
    method = '國際小包';
    for (const [maxW, cost] of INTL_SMALL_PACKET_RATES) {
      if (totalWeightGrams <= maxW) {
        costJpy = cost;
        break;
      }
    }
    if (!costJpy)
      costJpy = INTL_SMALL_PACKET_RATES[INTL_SMALL_PACKET_RATES.length - 1]![1];
  }

  return { method, costJpy, costTwd: Math.round(costJpy * baseRate) };
}

// ── 服務費 ──

/** 固定代購服務費（台幣） */
export const SERVICE_FEE_TWD = 0;

// ── 日本國內運費 ──

/** BAPE / FR2：每個品牌固定收 ¥400 日本國內運費 */
const DOMESTIC_FLAT_FEE_JPY = 400;
/** UNIQLO / GU：品牌訂單未滿此門檻(日幣)時，加收日本國內運費 */
const DOMESTIC_FREE_THRESHOLD_JPY = 4990;
/** UNIQLO / GU：未達門檻時的日本國內運費 */
const DOMESTIC_THRESHOLD_FEE_JPY = 500;

export interface DomesticShippingResult {
  totalJpy: number;
  totalTwd: number;
  /** 逐品牌明細（方便 debug / 顯示） */
  details: { brand: string; feeJpy: number }[];
}

/**
 * 計算日本國內運費
 * - BAPE / FR2：不論金額，每個有買到的品牌固定 ¥400
 * - UNIQLO / GU：該品牌日幣商品總額 < ¥4990 時才收 ¥500
 */
export function getDomesticShippingJpy(
  items: CartItemForQuote[],
  rate?: number,
): DomesticShippingResult {
  // 按品牌分組統計日幣總額
  const brandJpyTotals: Record<string, number> = {};
  const brandPresent = new Set<string>();

  for (const item of items) {
    const cat = (item.category || '').toLowerCase();
    const brand = cat.split('|')[0] || '';
    if (!brand) continue;

    brandPresent.add(brand);

    // 統計日幣總額（用於 Uniqlo/GU 門檻判斷）
    if (!item.price.startsWith('NT$')) {
      const jpy = parseJpy(item.price) * (item.quantity || 1);
      brandJpyTotals[brand] = (brandJpyTotals[brand] || 0) + jpy;
    }
  }

  const details: { brand: string; feeJpy: number }[] = [];
  let totalJpy = 0;

  // BAPE：有買就收 ¥400
  if (brandPresent.has('bape')) {
    details.push({ brand: 'bape', feeJpy: DOMESTIC_FLAT_FEE_JPY });
    totalJpy += DOMESTIC_FLAT_FEE_JPY;
  }
  // FR2：有買就收 ¥400
  if (brandPresent.has('fr2')) {
    details.push({ brand: 'fr2', feeJpy: DOMESTIC_FLAT_FEE_JPY });
    totalJpy += DOMESTIC_FLAT_FEE_JPY;
  }
  // UNIQLO：未滿 ¥4990 收 ¥500
  if (brandPresent.has('uniqlo')) {
    const jpyTotal = brandJpyTotals['uniqlo'] || 0;
    if (jpyTotal < DOMESTIC_FREE_THRESHOLD_JPY) {
      details.push({ brand: 'uniqlo', feeJpy: DOMESTIC_THRESHOLD_FEE_JPY });
      totalJpy += DOMESTIC_THRESHOLD_FEE_JPY;
    }
  }
  // GU：未滿 ¥4990 收 ¥500
  if (brandPresent.has('gu')) {
    const jpyTotal = brandJpyTotals['gu'] || 0;
    if (jpyTotal < DOMESTIC_FREE_THRESHOLD_JPY) {
      details.push({ brand: 'gu', feeJpy: DOMESTIC_THRESHOLD_FEE_JPY });
      totalJpy += DOMESTIC_THRESHOLD_FEE_JPY;
    }
  }

  const baseRate = rate ?? JPY_SELL_RATE;
  return {
    totalJpy,
    totalTwd: Math.round(totalJpy * baseRate),
    details,
  };
}

// ── 完整報價 ──

export interface CartItemForQuote {
  price: string; // e.g. "¥1990"（日幣）
  quantity: number;
  category: string; // e.g. "tops|t shirts"
}

export interface QuoteResult {
  subtotalTwd: number;
  subtotalJpy: number;
  totalWeight: number;
  shippingJpy: number;
  shippingTwd: number;
  shippingMethod: string;
  domesticShippingJpy: number;
  domesticShippingTwd: number;
  serviceFeeTwd: number;
  grandTotalTwd: number;
  categoryCounts: Record<string, number>;
}

/**
 * 計算完整報價（台幣）
 */
export function calculateQuote(
  items: CartItemForQuote[],
  rate?: number,
): QuoteResult {
  let subtotalJpy = 0;
  let subtotalTwd = 0;
  let totalWeight = 0;
  const categoryCounts: Record<string, number> = {};

  for (const item of items) {
    const qty = item.quantity || 1;

    // 自訂台幣售價（Kushitani cp=1）：price 格式 "NT$25000"
    if (item.price.startsWith('NT$')) {
      const twd = parseInt(item.price.replace(/[^\d]/g, ''), 10) || 0;
      subtotalTwd += twd * qty;
    } else {
      const priceVal = parseJpy(item.price);
      subtotalJpy += priceVal * qty;
      subtotalTwd += jpyToTwd(priceVal, rate) * qty;
    }

    const weight = getCategoryWeight(item.category);
    totalWeight += weight * qty;

    const label = getCategoryLabel(item.category);
    categoryCounts[label] = (categoryCounts[label] || 0) + qty;
  }

  const shipping = getShippingTwd(
    totalWeight,
    rate,
    // 只要有任何 RsTaichi 或 Kushitani（有重量）商品 → 強制國際小包
    items.some((i) => {
      const cat = i.category?.toLowerCase() || '';
      if (cat.startsWith('rstaichi|')) return true;
      if (cat.startsWith('kushitani|')) {
        const w = parseInt(cat.split('|')[1] || '0');
        return w > 0;
      }
      return false;
    }),
  );

  const domestic = getDomesticShippingJpy(items, rate);

  return {
    subtotalTwd,
    subtotalJpy,
    totalWeight,
    shippingJpy: shipping.costJpy,
    shippingTwd: shipping.costTwd,
    shippingMethod: shipping.method,
    domesticShippingJpy: domestic.totalJpy,
    domesticShippingTwd: domestic.totalTwd,
    serviceFeeTwd: SERVICE_FEE_TWD,
    grandTotalTwd:
      subtotalTwd + shipping.costTwd + domestic.totalTwd + SERVICE_FEE_TWD,
    categoryCounts,
  };
}
