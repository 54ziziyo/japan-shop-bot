// 一次性修正 Yoast SEO 標題過長的商品
// npx tsx --env-file=.env auto-listing/src/fix-yoast-title.ts
import { loadConfig } from './config';
import { WooClient } from './woocommerce';

const FIXES: { productId: number; sku: string; seoTitle: string; focusKeyword: string }[] = [
  {
    productId: 14132,
    sku: 'STJ422D',
    seoTitle: 'HYOD STJ422D 網眼防摔外套 ST-X THE MESH ALTIS PARKA',
    focusKeyword: 'HYOD STJ422D 網眼防摔外套 ST-X THE MESH ALTIS PARKA',
  },
  {
    productId: 14144,
    sku: 'STJ423D',
    seoTitle: 'HYOD STJ423D 網眼防摔外套 ST-X THE MESH MINERVA JAC',
    focusKeyword: 'HYOD STJ423D 網眼防摔外套 ST-X THE MESH MINERVA JAC',
  },
  {
    productId: 14156,
    sku: 'STJ424D',
    seoTitle: 'HYOD STJ424D 網眼防摔外套 ST-X THE MESH ALTIS JAC',
    focusKeyword: 'HYOD STJ424D 網眼防摔外套 ST-X THE MESH ALTIS JAC',
  },
  {
    productId: 14178,
    sku: 'STJ056D',
    seoTitle: 'HYOD STJ056D 防摔外套 ST-X FLEX NAGARE AIR-FLOW JAC',
    focusKeyword: 'HYOD STJ056D 防摔外套 ST-X FLEX NAGARE AIR-FLOW JAC',
  },
];

async function main() {
  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);

  for (const fix of FIXES) {
    console.log(`🔧 修正 #${fix.productId} (${fix.sku})…`);
    console.log(`   seoTitle: ${fix.seoTitle}`);
    await woo.updateProduct(fix.productId, {
      meta_data: [
        { key: '_yoast_wpseo_title', value: fix.seoTitle },
        { key: '_yoast_wpseo_focuskw', value: fix.focusKeyword },
        { key: '_yoast_wpseo_opengraph-title', value: fix.seoTitle },
        { key: '_yoast_wpseo_twitter-title', value: fix.seoTitle },
      ],
    });
    console.log(`   ✅ 完成`);
  }

  console.log('\n✅ 全部修正完畢');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
