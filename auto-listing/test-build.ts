// ============================================================
// 離線測試 — buildWooProduct 轉換邏輯（不連網、不需金鑰）
// 執行：npx tsx auto-listing/test-build.ts
// ============================================================

import { buildWooProduct } from './src/buildProduct';
import { parseSeason } from './src/season';
import { resolveCategoryIds } from './src/categories';
import type { RstaichiProduct } from '../server/utils/scrape/rstaichi';
import type { ListingContent } from './src/draft';
import type { WooCategory } from './src/woocommerce';

const mock: RstaichiProduct = {
  title: 'RST469 | アーバン エアーグローブ［6colors］',
  sku: 'RST469',
  price: '¥6930',
  weightGrams: 622,
  variants: [
    {
      color: 'BLACK',
      image: 'https://media/rst469bk_1_26ss.jpg',
      price: '¥6930',
      sizes: [
        { name: 'M', isStock: true },
        { name: 'L', isStock: false },
      ],
    },
    {
      color: 'NAVY',
      image: 'https://media/rst469nv_1_26ss.jpg',
      price: '¥6930',
      sizes: [
        { name: 'L', isStock: true },
        { name: 'XL', isStock: true },
      ],
    },
  ],
};

const content: ListingContent = {
  name: 'RS TAICHI RST469 URBAN AIR GLOVE 都會透氣手套 防摔 夏季 機車手套',
  slug: 'rs-taichi-rst469-urban-air-glove',
  focusKeyword: '透氣機車手套',
  seoTitle: 'RS TAICHI RST469 都會透氣手套｜騎旅生活',
  metaDescription: 'RS TAICHI RST469 都會透氣手套，網眼透氣設計…',
  descriptionHtml: '<p>測試說明</p>',
  shortDescriptionHtml: '<p>測試賣點</p>',
  category: '手套',
  imageAlt: 'RS TAICHI RST469 都會透氣手套',
};

// 模擬分類樹：重機部品(10) > 手套(12)、防摔衣(13)
const cats: WooCategory[] = [
  { id: 10, name: '重機部品', parent: 0, slug: 'parts' },
  { id: 12, name: '手套', parent: 10, slug: 'gloves' },
  { id: 13, name: '防摔衣', parent: 10, slug: 'jacket' },
];

let pass = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    `${ok ? '✅' : '❌'} ${name}${ok ? '' : ` got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`,
  );
  ok ? pass++ : fail++;
};

// 季節解析
const season = parseSeason(mock.variants.map((v) => v.image));
eq('季節年份', season?.year, 2026);
eq('季節資料夾', season?.folder, '2026 春夏');

// 分類解析（手套 → [12,10] 含上層）
const catIds = resolveCategoryIds(cats, content.category);
eq('分類含上層', catIds, [12, 10]);

const { product, variations } = buildWooProduct({
  scraped: mock,
  content,
  categoryIds: catIds,
  season,
  sourceUrl: 'https://www.ec.rs-taichi.com/rst469.html',
  brand: 'RS TAICHI',
});

eq('狀態=送審', product.status, 'pending');
eq('型別=variable', product.type, 'variable');
eq('SEO名稱', product.name, content.name);
eq('代稱slug', product.slug, content.slug);
eq('商品SKU', product.sku, 'RST469');
eq('分類已填', product.categories, [{ id: 12 }, { id: 10 }]);
eq('顏色屬性', product.attributes[0].options, ['BLACK', 'NAVY']);
eq('尺寸聯集去重', product.attributes[1].options, ['M', 'L', 'XL']);
eq('圖片帶alt', product.images[0].alt, 'RS TAICHI RST469 都會透氣手套 BLACK');
eq(
  'Yoast焦點關鍵字',
  product.meta_data.find((m) => m.key === '_yoast_wpseo_focuskw')?.value,
  '透氣機車手套',
);
eq(
  '季節存meta',
  product.meta_data.find((m) => m.key === '_source_season')?.value,
  '2026 春夏',
);
eq('變體數=2+2', variations.length, 4);
eq('黑M有貨', variations[0].stock_status, 'instock');
eq('黑L無貨', variations[1].stock_status, 'outofstock');
eq('變體價留空', variations[0].regular_price, '');

console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
