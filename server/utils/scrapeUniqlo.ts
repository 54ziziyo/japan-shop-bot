import axios from 'axios';

export const scrapeUniqlo = async (url: string) => {
  try {
    // 1. 從網址提取商品代碼 (例如 E480302-000) 和 price group (例如 00、01)
    const match = url.match(/products\/(E\d+-\d+)(?:\/(\d+))?/);
    if (!match) throw new Error('無法從網址提取商品編號');
    const rawCode = match[1];
    const priceGroup = match[2] || '00';

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://www.uniqlo.com/',
    };

    const BASE = 'https://www.uniqlo.com/jp/api/commerce/v5/ja';

    // 2. 同時呼叫「商品詳情 API」和「商品搜尋 API（含庫存篩選）」
    const detailUrl = `${BASE}/products/${rawCode}/price-groups/${priceGroup}/details?httpFailure=true`;
    const stockUrl = `${BASE}/products?productIds=${rawCode}&offset=0&limit=1&httpFailure=true`;

    const [detailRes, stockRes] = await Promise.all([
      axios.get(detailUrl, { headers }),
      axios
        .get(stockUrl, { headers })
        .catch(() => ({ data: { result: { items: [] } } })),
    ]);

    const result = detailRes.data?.result;
    if (!result) throw new Error('API 無法取得商品資訊');

    // 3. 基本資訊
    const title = result.name || 'UNIQLO 商品';
    const baseVal = result.prices?.base?.value;
    const price = baseVal ? `¥${baseVal}` : '請洽官網';

    // 3.1 偵測「期間限定價格」vs「永久値下げ」
    //     真正可靠的來源是 representative.flags.priceFlags
    const priceFlags: any[] = result.representative?.flags?.priceFlags || [];
    const limitedOfferFlag = priceFlags.find(
      (f: any) => f.code === 'limitedOffer',
    );
    const isLimitedOffer = !!limitedOfferFlag;
    const promoEndTs: number | null =
      limitedOfferFlag?.effectiveTime?.end || null;
    if (isLimitedOffer) {
      const endDate = limitedOfferFlag.nameWording?.substitutions?.date || '?';
      console.log(
        `🏷️ 期間限定價格！¥${baseVal}（${endDate} まで / ts=${promoEndTs}）`,
      );
    } else if (priceFlags.some((f: any) => f.code === 'discount')) {
      console.log(`💸 永久値下げ：¥${baseVal}`);
    }

    // 3.5 分類資訊（用於運費計算）
    // 儲存格式: "class|category"（e.g. "tops|t shirts", "outerwear|coats"）
    const breadcrumbs = result.breadcrumbs || {};
    const className = breadcrumbs?.class?.name || 'unknown';
    const categoryName = breadcrumbs?.category?.name || '';
    const category = categoryName ? `${className}|${categoryName}` : className;

    // 4. 從 products search API 取得「全部顏色聯集」的有庫存尺寸
    const stockItem = stockRes.data?.result?.items?.[0];
    const inStockSizeCodes = new Set<string>();
    if (stockItem?.sizes) {
      for (const s of stockItem.sizes) {
        inStockSizeCodes.add(s.displayCode); // e.g. "006", "007"
      }
    }
    console.log('📦 聯集有庫存尺寸:', [...inStockSizeCodes].join(', ') || '無');

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

    // ────────────────────────────────────────────────────
    // 7. ✅ 精確每色每尺寸庫存：用 colorCodes + sizeCodes 組合查詢
    //    若 items > 0 → 該色 + 該尺寸有庫存
    //    若 items = 0 → 該色 + 該尺寸缺貨
    // ────────────────────────────────────────────────────
    type StockCheck = {
      colorDC: string; // e.g. "08"
      sizeDC: string; // e.g. "006"
    };
    const checks: StockCheck[] = [];

    for (const c of colors) {
      for (const s of sizes) {
        // 只檢查聯集中有庫存的尺寸（其他一定缺貨，不用查）
        if (inStockSizeCodes.has(s.displayCode)) {
          checks.push({ colorDC: c.displayCode, sizeDC: s.displayCode });
        }
      }
    }

    console.log(`🔍 需檢查 ${checks.length} 個顏色×尺寸組合`);

    // 並行查詢所有組合
    const checkResults = await Promise.all(
      checks.map(({ colorDC, sizeDC }) =>
        axios
          .get(
            `${BASE}/products?productIds=${rawCode}&colorCodes=COL${colorDC}&sizeCodes=SMA${sizeDC}&offset=0&limit=1&httpFailure=true`,
            { headers },
          )
          .then((res) => (res.data?.result?.items?.length ?? 0) > 0)
          .catch(() => false),
      ),
    );

    // 建立 per-color stock map: colorDisplayCode → Set<sizeDisplayCode>
    const perColorStock = new Map<string, Set<string>>();
    for (let i = 0; i < checks.length; i++) {
      if (checkResults[i]) {
        const { colorDC, sizeDC } = checks[i]!;
        if (!perColorStock.has(colorDC)) perColorStock.set(colorDC, new Set());
        perColorStock.get(colorDC)!.add(sizeDC);
      }
    }

    // log 每色庫存
    for (const [cdc, sSet] of perColorStock) {
      console.log(`  🎨 ${cdc}: ${[...sSet].join(', ')}`);
    }

    // 8. 組裝 Variants（每個顏色 = 一張輪播卡片）
    const variants = colors.map((c: any, index: number) => {
      const displayCode = c.displayCode; // e.g. "31"
      const colorName = `${displayCode} ${c.name}`;

      const imageUrl = mainImages[displayCode]?.image || '';
      if (index === 0) {
        console.log('🖼️ 使用 API 圖片:', imageUrl);
      }

      // ✅ 用精確的每色庫存 map 判斷
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

    // 9. 從實際圖片 URL 提取 goodsId（e.g. "484278" 或 "479662001"）
    let goodsId = '';
    for (const [, img] of Object.entries(mainImages)) {
      const gidMatch = (img as any)?.image?.match(/imagesgoods\/(\d+)\//);
      if (gidMatch) {
        goodsId = gidMatch[1];
        break;
      }
    }
    console.log(`🆔 goodsId: ${goodsId}`);

    console.log(
      `✅ Uniqlo API 取得 ${variants.length} 個顏色 | 分類: ${category}`,
    );
    return {
      title,
      rawCode,
      priceGroup,
      category,
      goodsId,
      isLimitedOffer,
      promoEndTs,
      variants: variants.slice(0, 10),
    };
  } catch (err: any) {
    console.error('❌ Uniqlo API 抓取失敗:', err.message);
    return null;
  }
};
