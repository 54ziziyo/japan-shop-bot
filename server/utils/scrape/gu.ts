// ============================================================
// 🛍️ GU 商品爬蟲（gu-global.com）
// server/utils/scrape/gu.ts
// ============================================================
// GU 與 UNIQLO 同屬 Fast Retailing，共用相同 v5 API 結構。
// 差異：API base 改為 gu-global.com、圖片 domain 同為 image.uniqlo.com/GU/

import axios from 'axios';
import https from 'node:https';

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
const api = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 8000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://www.gu-global.com/',
  },
});

export const scrapeGu = async (url: string) => {
  try {
    // 1. 從網址提取商品代碼 (例如 E358741-000) 和 price group (例如 00、01)
    const match = url.match(/products\/(E\d+-\d+)(?:\/(\d+))?/);
    if (!match) throw new Error('無法從網址提取商品編號');
    const rawCode = match[1];
    const priceGroup = match[2] || '00';

    const BASE = 'https://www.gu-global.com/jp/api/commerce/v5/ja';

    // 2. 同時呼叫「商品詳情 API」、「庫存 API」和「L2s API」
    const detailUrl = `${BASE}/products/${rawCode}/price-groups/${priceGroup}/details?httpFailure=true`;
    const stockUrl = `${BASE}/products/${rawCode}/price-groups/${priceGroup}/stock?httpFailure=true`;
    const l2sUrl = `${BASE}/products/${rawCode}/price-groups/${priceGroup}/l2s?httpFailure=true`;

    const [detailRes, stockRes, l2sRes] = await Promise.all([
      api.get(detailUrl),
      api.get(stockUrl).catch(() => ({ data: { result: {} } })),
      api.get(l2sUrl).catch(() => ({ data: { result: { l2s: [] } } })),
    ]);

    const result = detailRes.data?.result;
    if (!result) throw new Error('API 無法取得商品資訊');

    // 3. 基本資訊
    const title = result.name || 'GU 商品';
    const baseVal = result.prices?.base?.value;
    const price = baseVal ? `¥${baseVal}` : '請洽官網';

    // 3.1 偵測「期間限定價格」vs「永久値下げ」
    const priceFlags: any[] = result.representative?.flags?.priceFlags || [];
    const limitedOfferFlag = priceFlags.find(
      (f: any) => f.effectiveTime?.end,
    );
    const isLimitedOffer = !!limitedOfferFlag;
    const promoEndTs: number | null =
      limitedOfferFlag?.effectiveTime?.end || null;
    const promoDisplayDate: string | null =
      limitedOfferFlag?.nameWording?.substitutions?.date || null;
    if (isLimitedOffer) {
      const endDate = promoDisplayDate || '?';
      console.log(
        `🏷️ GU 期間限定價格！¥${baseVal}（${endDate} まで / code=${limitedOfferFlag.code} ts=${promoEndTs}）`,
      );
    } else if (priceFlags.some((f: any) => f.code === 'discount')) {
      console.log(`💸 GU 永久値下げ：¥${baseVal}`);
    }

    // 3.5 分類資訊（用於運費計算）
    const breadcrumbs = result.breadcrumbs || {};
    const className = breadcrumbs?.class?.name || 'unknown';
    const categoryName = breadcrumbs?.category?.name || '';
    const category = categoryName ? `${className}|${categoryName}` : className;

    // 4. 從 stock API + l2s API 建立精確的每色每尺寸庫存
    const stockData: Record<string, any> = stockRes.data?.result || {};
    const l2sList: any[] = l2sRes.data?.result?.l2s || [];

    const l2Map = new Map<string, { colorDC: string; sizeDC: string }>();
    for (const item of l2sList) {
      l2Map.set(item.l2Id, {
        colorDC: item.color.displayCode,
        sizeDC: item.size.displayCode,
      });
    }

    const perColorStock = new Map<string, Set<string>>();
    for (const [l2Id, stock] of Object.entries(stockData)) {
      if ((stock as any)?.statusCode !== 'IN_STOCK') continue;
      const mapping = l2Map.get(l2Id);
      if (!mapping) continue;
      if (!perColorStock.has(mapping.colorDC))
        perColorStock.set(mapping.colorDC, new Set());
      perColorStock.get(mapping.colorDC)!.add(mapping.sizeDC);
    }

    console.log(`📦 GU 庫存 API 取得 ${Object.keys(stockData).length} 筆 SKU`);
    for (const [cdc, sSet] of perColorStock) {
      console.log(`  🎨 ${cdc}: ${[...sSet].join(', ')}`);
    }

    // 5. 圖片
    const mainImages: Record<string, { image: string }> =
      result.images?.main || {};

    // 6. 解析顏色、尺寸
    const colors: any[] = (result.colors || []).filter(
      (c: any) => c.display?.showFlag !== false,
    );
    const sizes: any[] = (result.sizes || []).filter(
      (s: any) => s.display?.showFlag !== false,
    );

    // 7. 組裝 Variants（每個顏色 = 一張輪播卡片）
    const variants = colors.map((c: any, index: number) => {
      const displayCode = c.displayCode;
      const colorName = `${displayCode} ${c.name}`;

      const imageUrl = mainImages[displayCode]?.image || '';
      if (index === 0) {
        console.log('🖼️ GU 使用 API 圖片:', imageUrl);
      }

      const colorStockSet = perColorStock.get(displayCode);
      const sizeList = sizes.map((s: any) => ({
        name: s.name,
        isStock: colorStockSet?.has(s.displayCode) ?? false,
      }));

      return {
        color: colorName,
        image: imageUrl,
        price,
        sizes: sizeList,
      };
    });

    // 9. 從實際圖片 URL 提取 goodsId
    let goodsId = '';
    for (const [, img] of Object.entries(mainImages)) {
      const gidMatch = (img as any)?.image?.match(/imagesgoods\/(\d+)\//);
      if (gidMatch) {
        goodsId = gidMatch[1];
        break;
      }
    }
    console.log(`🆔 GU goodsId: ${goodsId}`);

    console.log(`✅ GU API 取得 ${variants.length} 個顏色 | 分類: ${category}`);
    return {
      title,
      rawCode,
      priceGroup,
      category,
      goodsId,
      isLimitedOffer,
      promoEndTs,
      promoDisplayDate,
      variants: variants.slice(0, 10),
    };
  } catch (err: any) {
    console.error('❌ GU API 抓取失敗:', err.message);
    return null;
  }
};
