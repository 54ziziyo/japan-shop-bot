// ============================================================
// 檢查 WooCommerce 所有商品是否有重複 SKU
// npx tsx --env-file=.env auto-listing/src/check-duplicate-skus.ts
// ============================================================
import { loadConfig } from './config';
import axios from 'axios';

async function main() {
  const cfg = loadConfig();
  const http = axios.create({
    baseURL: `${cfg.woo.storeUrl}/wp-json/wc/v3`,
    auth: { username: cfg.woo.consumerKey, password: cfg.woo.consumerSecret },
    timeout: 60000,
  });

  console.log('\n📦 拉取所有商品中…\n');

  const all: { id: number; name: string; sku: string }[] = [];

  for (let page = 1; page <= 50; page++) {
    const { data } = await http.get('/products', {
      params: { per_page: 100, page, status: 'any' },
    });
    if (!Array.isArray(data) || data.length === 0) break;
    for (const p of data) {
      all.push({ id: p.id, name: p.name, sku: p.sku || '' });
    }
    process.stdout.write(`  第 ${page} 頁，累計 ${all.length} 件\r`);
    if (data.length < 100) break;
  }

  console.log(`\n✅ 共 ${all.length} 件商品\n`);

  // 找重複 SKU
  const skuMap = new Map<string, { id: number; name: string }[]>();
  for (const p of all) {
    if (!p.sku) continue;
    if (!skuMap.has(p.sku)) skuMap.set(p.sku, []);
    skuMap.get(p.sku)!.push({ id: p.id, name: p.name });
  }

  const duplicates = [...skuMap.entries()].filter(([, list]) => list.length > 1);

  if (duplicates.length === 0) {
    console.log('🎉 沒有重複 SKU！');
  } else {
    console.log(`⚠️  發現 ${duplicates.length} 個重複 SKU：\n`);
    for (const [sku, list] of duplicates) {
      console.log(`SKU: ${sku}`);
      for (const p of list) {
        console.log(`  #${p.id}  ${p.name}`);
      }
      console.log();
    }
  }

  // 無 SKU 商品
  const noSku = all.filter((p) => !p.sku);
  if (noSku.length > 0) {
    console.log(`\n📋 無 SKU 商品（${noSku.length} 件）：`);
    for (const p of noSku) {
      console.log(`  #${p.id}  ${p.name}`);
    }
  }
}

main().catch((err) => {
  console.error('\n💥', err.response?.data ?? err.message ?? err);
  process.exit(1);
});
