/**
 * 測試腳本：BAPE / AAPE 重量估算 + 圖片壓縮 + 真實爬蟲
 * 執行：node test-weight-scraper.mjs
 */
import https from 'node:https';
import axios from 'axios';
import * as cheerio from 'cheerio';

const api = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ja,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});

// ══════════════════════════════════════════════════════════════
// 1. BAPE 重量邏輯（複製自 scrape/bape.ts）
// ══════════════════════════════════════════════════════════════
const BAPE_PACKAGING = 500;
const BAPE_FALLBACK = 800;

const BAPE_TYPE_MAP = {
  'Tシャツ': 300, 'カットソー': 350, 'シャツ': 400,
  'スウェット/パーカー': 900, 'アウター': 1200, 'ボトムス': 700,
  'キャップ/ハット': 200, 'バッグ': 600, 'グッズ': 400, 'ベビー': 200,
};

const BAPE_NAME_RULES = [
  { p: /BAPE\s*STA|STA\s*LOW|STA\s*MID|STA\s*HIGH|スニーカー|SNEAKER|SHOES/i, w: 1200, l: '鞋子' },
  { p: /ダウン|DOWN\s*JACKET/i, w: 1500, l: '羽絨外套' },
  { p: /DENIM|デニム|JEANS|ジーンズ/i, w: 900, l: '牛仔褲' },
  { p: /SHORT|ショート|ハーフパンツ/i, w: 400, l: '短褲' },
  { p: /BACKPACK|バックパック|DUFFLE|ダッフル|リュック/i, w: 1000, l: '背包' },
  { p: /KEYCHAIN|キーチェーン|CARABINER|カラビナ|PHONE\s*CASE|ケース|STICKER|ステッカー/i, w: 150, l: '小物' },
  { p: /SCARF|マフラー|TOWEL|タオル/i, w: 300, l: '圍巾/毛巾' },
  { p: /BELT|ベルト/i, w: 250, l: '腰帶' },
  { p: /SOCKS|ソックス/i, w: 100, l: '襪子' },
  { p: /LIGHTER|ライター/i, w: 100, l: '打火機' },
];

function bapeWeight(productType, title) {
  const nameMatch = BAPE_NAME_RULES.find(r => r.p.test(title));
  if (nameMatch) return { g: nameMatch.w + BAPE_PACKAGING, src: `名稱「${nameMatch.l}」` };
  if (productType && BAPE_TYPE_MAP[productType]) return { g: BAPE_TYPE_MAP[productType] + BAPE_PACKAGING, src: `分類「${productType}」` };
  return { g: BAPE_FALLBACK + BAPE_PACKAGING, src: '預設值' };
}

// ══════════════════════════════════════════════════════════════
// 2. AAPE 重量邏輯（複製自 scrape/aape.ts）
// ══════════════════════════════════════════════════════════════
const AAPE_PACKAGING = 500;
const AAPE_FALLBACK = 400;

const AAPE_NAME_RULES = [
  { p: /jacket|ジャケット|blouson|ブルゾン|bomber/i, w: 900, l: '外套' },
  { p: /fleece|フリース/i, w: 600, l: '搖粒絨外套' },
  { p: /hoodie|hoody|パーカー/i, w: 750, l: '帽T' },
  { p: /sweatshirt|スウェット/i, w: 650, l: '衛衣' },
  { p: /pants|パンツ/i, w: 500, l: '褲子' },
  { p: /shorts|ショーツ/i, w: 300, l: '短褲' },
  { p: /l\/s tee|long.*tee|ロングスリーブ|長袖.*Ｔ|長袖.*T/i, w: 300, l: '長袖T' },
  { p: /\bTEE\b|Tシャツ|T-SHIRT/i, w: 250, l: 'T恤' },
  { p: /polo|ポロ/i, w: 350, l: 'Polo衫' },
  { p: /shirt|シャツ/i, w: 350, l: '襯衫' },
  { p: /cap|hat|キャップ|ハット/i, w: 200, l: '帽子' },
  { p: /backpack|バックパック|rucksack|リュック|daypack/i, w: 800, l: '後背包' },
  { p: /bag|バッグ|tote|トート/i, w: 300, l: '包包' },
  { p: /socks?|ソックス/i, w: 100, l: '襪子' },
  { p: /key.?chain|キーホルダー|keyring/i, w: 100, l: 'Key Chain' },
  { p: /sneaker|スニーカー|footwear|フットウェア|shoes?|シューズ|STA\b/i, w: 1000, l: '鞋類' },
];

function aapeWeight(title) {
  const nameMatch = AAPE_NAME_RULES.find(r => r.p.test(title));
  if (nameMatch) return { g: nameMatch.w + AAPE_PACKAGING, src: `名稱「${nameMatch.l}」` };
  return { g: AAPE_FALLBACK + AAPE_PACKAGING, src: '預設值' };
}

// ══════════════════════════════════════════════════════════════
// 3. 圖片壓縮/重建 測試
// ══════════════════════════════════════════════════════════════
function testImageCompression() {
  console.log('\n=== 圖片壓縮/重建測試 ===\n');
  const cases = [
    // [brand, rawImage, productCode, expectedResult]
    ['bape', 'https://cdn.shopify.com/s/files/1/0326/3660/0451/files/xxx.jpg', '1k30-110-009',
      'BAPE → BAPE:files/xxx.jpg', 'jp.bape.com'],
    ['bape', 'https://cdn.shopify.com/s/files/1/2238/5135/files/yyy.jpg', '1k80191309',
      'BAPEP → BAPEP:files/yyy.jpg', 'bapepirate.com'],
    ['aape', 'https://c.imgz.jp/420/103433420/103433420b_1_d_500.jpg', '103433420',
      'AAPE → AAPE:1', 'aape.jp'],
    ['aape', 'https://c.imgz.jp/420/103433420/103433420b_26_d_500.jpg', '103433420',
      'AAPE → AAPE:26', 'aape.jp'],
  ];

  let pass = 0, fail = 0;
  for (const [brand, img, code, desc, domain] of cases) {
    let compressed = '';
    if (brand === 'bape') {
      compressed = img
        .replace(/^https?:\/\/cdn\.shopify\.com\/s\/files\/1\/0326\/3660\/0451\//, 'BAPE:')
        .replace(/^https?:\/\/cdn\.shopify\.com\/s\/files\/1\/2238\/5135\//, 'BAPEP:');
    } else if (brand === 'aape') {
      compressed = img.replace(/^https?:\/\/c\.imgz\.jp\/420\//, 'AAPE:').replace(/^AAPE:\d+\/\d+b_(\w+)_d_500\.jpg$/, 'AAPE:$1');
      // 取 colorCode 部分：從路徑 {itemId}b_{colorCode}_d_500.jpg 中提取
      const m = img.match(/\/\d+b_(\w+)_d_500\.jpg$/);
      compressed = m ? `AAPE:${m[1]}` : compressed;
    }

    // 重建
    let reconstructed = '';
    if (compressed.startsWith('BAPE:')) {
      reconstructed = `https://cdn.shopify.com/s/files/1/0326/3660/0451/${compressed.slice(5)}`;
    } else if (compressed.startsWith('BAPEP:')) {
      reconstructed = `https://cdn.shopify.com/s/files/1/2238/5135/${compressed.slice(6)}`;
    } else if (compressed.startsWith('AAPE:')) {
      reconstructed = `https://c.imgz.jp/420/${code}/${code}b_${compressed.slice(5)}_d_500.jpg`;
    }

    const ok = reconstructed === img;
    console.log(`${ok ? '✅' : '❌'} [${domain}] ${desc}`);
    if (!ok) {
      console.log(`   原圖: ${img}`);
      console.log(`   壓縮: ${compressed}`);
      console.log(`   重建: ${reconstructed}`);
    }
    ok ? pass++ : fail++;

    // bapepirate URL 重建測試
    if (brand === 'bape') {
      const usesBapePirate = compressed.startsWith('BAPEP:');
      const productUrl = usesBapePirate
        ? `https://bapepirate.com/products/${code}`
        : `https://jp.bape.com/products/${code}`;
      console.log(`   🔗 productUrl: ${productUrl} ✓`);
    }
  }
  console.log(`\n圖片測試結果：${pass} 通過，${fail} 失敗`);
}

// ══════════════════════════════════════════════════════════════
// 4. 重量估算 矩陣測試
// ══════════════════════════════════════════════════════════════
function testWeightEstimation() {
  console.log('\n=== 重量估算矩陣測試 ===\n');
  const cases = [
    // [brand, productType, title, category, minOk(g), maxOk(g)]
    // ── 服飾 ──
    ['BAPE', 'Tシャツ', 'ABC CAMO APE HEAD TEE', '上衣', 700, 1000],
    ['BAPE', 'スウェット/パーカー', 'ABC CAMO FULL ZIP HOODIE', '帽T', 1200, 1800],
    ['BAPE', 'アウター', 'SHARK FULL ZIP DOUBLE HOODIE JACKET', '外套', 1500, 2500],
    ['BAPE', 'ボトムス', 'ABC CAMO SWEAT PANTS', '長褲', 1000, 1500],
    ['BAPE', 'ボトムス', 'ABC CAMO SHORTS', '短褲', 700, 1200],
    ['BAPE', 'ボトムス', 'ABC CAMO DENIM PANTS', '牛仔褲', 1200, 1800],
    ['BAPE', 'キャップ/ハット', 'ABC CAMO PANEL CAP', '帽子', 500, 900],
    // ── 鞋子 ──
    ['BAPE', 'グッズ', 'BAPE STA LOW M1', '鞋', 1500, 2000],
    ['BAPE', 'グッズ', 'ABC CAMO CLASSIC BAPE STA MID', '鞋', 1500, 2000],
    // ── 包包 ──
    ['BAPE', 'バッグ', 'ABC CAMO TOTE BAG', '托特包', 900, 1500],
    ['BAPE', 'バッグ', 'ABC CAMO BACKPACK', '後背包', 1300, 1800],
    ['BAPE', 'バッグ', 'BAPE SHOULDER BAG', '側包', 900, 1500],
    // ── 雜貨 ──
    ['BAPE', 'グッズ', 'BABY MILO FIGURE SET', '公仔', 700, 2000],
    ['BAPE', 'グッズ', 'ABC CAMO CUSHION', '抱枕', 800, 1500],
    ['BAPE', 'グッズ', 'BAPE TUMBLER BOTTLE', '水壺', 700, 1500],
    ['BAPE', 'グッズ', 'BAPE CHARM KEYCHAIN', '吊飾', 400, 900],
    ['BAPE', 'グッズ', 'ABC CAMO MUG CUP', '馬克杯', 600, 1200],
    ['BAPE', 'グッズ', 'BABY MILO PLUSH TOY', '玩偶', 600, 1500],
    // ── AAPE 服飾 ──
    ['AAPE', '', 'AAPE NOW HEART TEE', 'T恤', 600, 1000],
    ['AAPE', '', 'AAPE L/S TEE SHIRT', '長袖T', 700, 1000],
    ['AAPE', '', 'AAPE HOODIE SWEATSHIRT', '帽T', 1000, 1500],
    ['AAPE', '', 'AAPE JACKET BLOUSON', '外套', 1200, 1800],
    ['AAPE', '', 'AAPE TRACK PANTS', '長褲', 900, 1400],
    ['AAPE', '', 'AAPE CAP HAT', '帽子', 500, 900],
    // ── AAPE 包包 ──
    ['AAPE', '', 'AAPE BACKPACK BAG', '後背包', 1000, 1800],
    ['AAPE', '', 'AAPE TOTE BAG', '托特包', 500, 1000],
    // ── AAPE 鞋 ──
    ['AAPE', '', 'AAPE SNEAKER LOW', '球鞋', 1200, 1800],
  ];

  const issues = [];
  let pass = 0;
  for (const [brand, type, title, cat, minOk, maxOk] of cases) {
    const result = brand === 'BAPE' ? bapeWeight(type, title) : aapeWeight(title);
    const ok = result.g >= minOk && result.g <= maxOk;
    const status = ok ? '✅' : '⚠️ ';
    console.log(`${status} [${brand}][${cat}] "${title.substring(0,40)}"`);
    console.log(`       → ${result.g}g (${result.src})  期望: ${minOk}~${maxOk}g`);
    if (!ok) issues.push({ brand, cat, title, result, minOk, maxOk });
    ok ? pass++ : 0;
  }

  console.log(`\n重量估算結果：${pass}/${cases.length} 在合理範圍內`);
  if (issues.length > 0) {
    console.log(`\n⚠️  需要修正的分類（${issues.length} 個）：`);
    for (const i of issues) {
      console.log(`  [${i.brand}][${i.cat}] 目前 ${i.result.g}g (${i.result.src}) → 建議 ${i.minOk}~${i.maxOk}g`);
    }
  }
  return issues;
}

// ══════════════════════════════════════════════════════════════
// 5. 實際爬蟲測試（BAPE + AAPE）
// ══════════════════════════════════════════════════════════════
async function testLiveBape(handle, expectedCat) {
  try {
    const res = await api.get(`https://jp.bape.com/products/${handle}.js`);
    const p = res.data;
    const title = p.title || '?';
    const productType = p.type || '（無）';
    const result = bapeWeight(productType, title);
    const colorCount = new Set(p.variants?.map(v => v.option1)).size;
    const hasSize = (p.options?.length ?? 0) >= 2;
    const sizeCount = hasSize
      ? [...new Set(p.variants?.map(v => v.option2).filter(Boolean))].length
      : 0;
    console.log(`  ✅ ${handle}`);
    console.log(`     標題: ${title}`);
    console.log(`     product_type: ${productType}`);
    console.log(`     重量: ${result.g}g (${result.src})   預期分類: ${expectedCat}`);
    console.log(`     顏色數: ${colorCount}  尺寸數: ${sizeCount}  hasSize: ${hasSize}`);
    // 若尺寸為空表示全部都是 'F'
    if (!hasSize) console.log(`     ⚠️  此商品無尺寸選項（配件類），按鈕會顯示 "加入購物車 | F"`);
    return { ok: true, title, productType, weight: result.g, src: result.src };
  } catch (e) {
    console.log(`  ❌ ${handle}: ${e.message}`);
    return { ok: false };
  }
}

async function testLiveAape(itemId, expectedCat) {
  try {
    const res = await api.get(`https://aape.jp/item/${itemId}.html`);
    const $ = cheerio.load(res.data);
    const rawTitle = $('title').text().trim();
    const title = rawTitle.replace(/\s*\|\s*AAPE\.JP\s*$/i, '').trim() || 'AAPE 商品';
    const priceRaw = $('span.price-entity.ja').first().text().replace(/,/g, '').trim();
    const price = parseInt(priceRaw, 10);
    const result = aapeWeight(title);

    let colorCount = 0, totalSizes = 0;
    $('.variation-row').each((_, row) => {
      const color = $(row).find('.variation-row-thumbnail .color').text().trim();
      if (!color) return;
      colorCount++;
      $(row).find('.variation-col-item').each(() => { totalSizes++; });
    });

    console.log(`  ✅ ${itemId}`);
    console.log(`     標題: ${title}`);
    console.log(`     價格: ¥${price}`);
    console.log(`     重量: ${result.g}g (${result.src})   預期分類: ${expectedCat}`);
    console.log(`     顏色數: ${colorCount}  尺寸欄數: ${totalSizes}`);
    return { ok: true, title, price, weight: result.g, src: result.src };
  } catch (e) {
    console.log(`  ❌ ${itemId}: ${e.message}`);
    return { ok: false };
  }
}

// ── 搜尋 BAPE 各類別商品 handle ──
async function findBapeHandles() {
  const collectionTests = [
    ['t-shirts', 'T恤'],
    ['hoodies', '帽T'],
    ['outerwear', '外套'],
    ['bags', '包包'],
    ['caps', '帽子'],
    ['footwear', '鞋子'],
    ['goods', '雜貨/グッズ'],
  ];
  const found = [];
  for (const [col, cat] of collectionTests) {
    try {
      const res = await api.get(`https://jp.bape.com/collections/${col}.json?limit=2`);
      for (const p of (res.data?.products || [])) {
        found.push([p.handle, cat, p.product_type, p.title]);
      }
    } catch {}
  }
  return found;
}

// ══════════════════════════════════════════════════════════════
// 6. Postback 長度測試
// ══════════════════════════════════════════════════════════════
function testPostbackLength() {
  console.log('\n=== Postback 長度測試 ===\n');
  const longTitle = 'ABC CAMO SHARK FULL ZIP DOUBLE HOODIE SWEATSHIRT PULLOVER JACKET MEN WOMEN';
  const baseData = `action=buy&brand=bape&c=${encodeURIComponent('WHITE/BLACK')}&s=${encodeURIComponent('LARGE')}&p=${encodeURIComponent('¥39600')}&code=1k30-110-009&img=${encodeURIComponent('BAPE:files/products/product_xxx.jpg')}&cat=bape|1400&ts=1714348800`;
  let titleSlice = longTitle;
  let compactData = `${baseData}&t=${encodeURIComponent(titleSlice)}`;
  while (compactData.length > 300 && titleSlice.length > 0) {
    titleSlice = titleSlice.slice(0, -1);
    const display = titleSlice + '…';
    compactData = `${baseData}&t=${encodeURIComponent(display)}`;
  }
  const ok = compactData.length <= 300;
  console.log(`${ok ? '✅' : '❌'} Postback 長度: ${compactData.length}/300 字元`);
  console.log(`   截斷後標題: "${titleSlice}${titleSlice.length < longTitle.length ? '…' : ''}"`);
}

// ══════════════════════════════════════════════════════════════
// 主程式
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  BAPE / AAPE 爬蟲與重量估算 全面測試                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // 1. 圖片壓縮/重建測試
  testImageCompression();

  // 2. 重量估算矩陣
  const weightIssues = testWeightEstimation();

  // 3. Postback 長度
  testPostbackLength();

  // 4. 實際 BAPE 商品爬蟲（先搜尋 handle）
  console.log('\n=== 實際 BAPE 商品爬蟲測試 ===\n');
  const handles = await findBapeHandles();
  if (handles.length === 0) {
    console.log('  ⚠️  無法從 BAPE collections API 取得商品（可能被封鎖），改用已知 handle...');
    // 改用已知 handle 直接測
  } else {
    console.log(`  找到 ${handles.length} 個商品，開始測試...`);
    for (const [handle, cat] of handles.slice(0, 10)) {
      await testLiveBape(handle, cat);
    }
  }

  // 5. 實際 AAPE 商品爬蟲
  console.log('\n=== 實際 AAPE 商品爬蟲測試 ===\n');
  const aapeProducts = [
    ['103433420', 'T恤（テスト）'],
  ];
  for (const [id, cat] of aapeProducts) {
    await testLiveAape(id, cat);
  }

  // 6. 總結
  console.log('\n=== 測試總結 ===');

  if (weightIssues.length > 0) {
    console.log('\n⚠️  重量估算問題：');
    for (const i of weightIssues) {
      console.log(`   [${i.brand}][${i.cat}] "${i.title.substring(0,40)}" → 目前 ${i.result.g}g，期望 ${i.minOk}~${i.maxOk}g`);
    }
  } else {
    console.log('\n✅ 所有問題已修復，無需處理。');
  }
}

main().catch(console.error);
