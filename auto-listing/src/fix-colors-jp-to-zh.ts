// ============================================================
// 將所有商品的日文顏色屬性轉換為繁體中文
// npx tsx --env-file=.env auto-listing/src/fix-colors-jp-to-zh.ts
// ============================================================
import { loadConfig } from './config';
import { WooClient } from './woocommerce';

// ── 日文 → 繁體中文顏色翻譯表 ──
const COLOR_MAP: Record<string, string> = {
  'ブラック':        '黑色',
  'グレー':          '灰色',
  'ホワイト':        '白色',
  'ネイビー':        '深藍色',
  'ブルー':          '藍色',
  'レッド':          '紅色',
  'ブラウン':        '棕色',
  'ダークブラウン':  '深棕色',
  'オレンジ':        '橘色',
  'シルバー':        '銀色',
  'チャコール':      '炭灰色',
  'アイスグレー':    '冰灰色',
  'アイボリー':      '象牙白',
  'オリーブグリーン':'橄欖綠',
  'ダークグリーン':  '深綠色',
  'クリア':          '透明',
  'ヒスイ色':        '翡翠色',
  'ライトグレー':    '淺灰色',
  'イエロー':        '黃色',
  'ピンク':          '粉紅色',
  'パープル':        '紫色',
  'ゴールド':        '金色',
  'タン':            '棕褐色',
  'ベージュ':        '米色',
  'カーキ':          '卡其色',
  // Pants-specific colors
  'オールドブラック':'復古黑',
  'インディゴブルー':'靛藍色',
  'ユーズド':        '復古水洗',
  'ダークグレー':    '深灰色',
  'ダークオレンジ':  '深橘色',
  'ライトベージュ':  '淺米色',
  'ライトブラウン':  '淺棕色',
  'オリーブ':        '橄欖色',
  // Jacket-specific colors
  'ボルドー':        '酒紅色',
  'ダークレッド':    '深紅色',
  'サンドベージュ':  '沙米色',
  'サックス':        '水藍色',
  'レンガ':          '磚紅色',
  'ブラックツイル':  '黑色斜紋',
  'オフホワイト':    '米白色',
  // Gundam model names
  'バンシィモデル':  'Banshee',
  'ユニコーンモデル':'Unicorn',
  'ユニコーン':      'Unicorn',
};

function hasJapanese(str: string): boolean {
  return /[぀-ヿ]/.test(str);
}

function translateColor(color: string): string {
  // First try exact match
  if (COLOR_MAP[color]) return COLOR_MAP[color];

  let result = color;

  // Replace each Japanese token in the string (longest first to avoid partial matches)
  const sorted = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  for (const jp of sorted) {
    result = result.split(jp).join(COLOR_MAP[jp]!);
  }

  // Normalize brackets: （xxx）→（xxx）, (xxx)→（xxx）for consistency
  result = result
    .replace(/\(([^)]+)\)/g, '（$1）')
    .trim();

  return result;
}

async function main() {
  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);

  console.log('\n🔍 掃描所有商品的日文顏色…\n');

  // Paginate through all products
  const allProducts: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await (woo as any).http.get('/products', {
      params: { per_page: 100, page, status: 'any', type: 'variable' },
    });
    if (!Array.isArray(data) || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 100) break;
  }

  console.log(`共 ${allProducts.length} 件可變商品`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const product of allProducts) {
    const colorAttr = (product.attributes ?? []).find(
      (a: any) => a.name === '顏色',
    );
    if (!colorAttr) continue;

    const options: string[] = colorAttr.options ?? [];
    const hasJp = options.some(hasJapanese);
    if (!hasJp) continue;

    const newOptions = options.map(translateColor);
    const changed = options.some((o, i) => o !== newOptions[i]);
    if (!changed) continue;

    process.stdout.write(`  #${product.id} ${product.name.slice(0, 30)}…\n`);
    options.forEach((o, i) => {
      if (o !== newOptions[i]) {
        console.log(`    ${o} → ${newOptions[i]}`);
      }
    });

    // Build new attributes array (preserve all attributes, replace 顏色 options)
    const newAttrs = (product.attributes ?? []).map((a: any) => {
      if (a.name !== '顏色') return a;
      return { ...a, options: newOptions };
    });

    // Update images alt text that contained Japanese color names
    const newImages = (product.images ?? []).map((img: any) => {
      const alt = img.alt ?? '';
      if (!hasJapanese(alt)) return img;
      let newAlt = alt;
      const sorted = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
      for (const jp of sorted) newAlt = newAlt.split(jp).join(COLOR_MAP[jp]!);
      return { id: img.id, alt: newAlt };
    });

    try {
      await (woo as any).http.put(`/products/${product.id}`, {
        attributes: newAttrs,
        images: newImages,
      });

      // Update variations
      const variations: any[] = [];
      for (let vPage = 1; vPage <= 10; vPage++) {
        const { data: vData } = await (woo as any).http.get(
          `/products/${product.id}/variations`,
          { params: { per_page: 100, page: vPage } },
        );
        if (!Array.isArray(vData) || vData.length === 0) break;
        variations.push(...vData);
        if (vData.length < 100) break;
      }

      for (const variation of variations) {
        const varAttrs: any[] = variation.attributes ?? [];
        const colorVarAttr = varAttrs.find((a: any) => a.name === '顏色');
        if (!colorVarAttr || !hasJapanese(colorVarAttr.option)) continue;

        const newOption = translateColor(colorVarAttr.option);
        const newVarAttrs = varAttrs.map((a: any) =>
          a.name === '顏色' ? { ...a, option: newOption } : a,
        );

        // Also update variation image alt
        const varImgs = (variation.image ? [variation.image] : []).map(
          (img: any) => {
            const alt = img.alt ?? '';
            if (!hasJapanese(alt)) return img;
            let newAlt = alt;
            const sorted = Object.keys(COLOR_MAP).sort(
              (a, b) => b.length - a.length,
            );
            for (const jp of sorted)
              newAlt = newAlt.split(jp).join(COLOR_MAP[jp]!);
            return { id: img.id, alt: newAlt };
          },
        );

        await (woo as any).http.put(
          `/products/${product.id}/variations/${variation.id}`,
          {
            attributes: newVarAttrs,
            ...(varImgs.length ? { image: varImgs[0] } : {}),
          },
        );
      }

      console.log(`    ✅ (${variations.length} 個變體更新)`);
      totalUpdated++;
    } catch (err: any) {
      console.log(`    ❌ ${err.response?.data?.message ?? err.message}`);
    }
  }

  console.log(
    `\n🎉 完成！共更新 ${totalUpdated} 件商品，略過 ${totalSkipped} 件`,
  );
}

main().catch((err) => {
  console.error('\n💥', err.response?.data ?? err.message ?? err);
  process.exit(1);
});
