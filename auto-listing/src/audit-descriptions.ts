import { loadConfig } from './config';
import { WooClient } from './woocommerce';

const cfg = loadConfig();
const woo = new WooClient(cfg.woo);

const allProducts: any[] = [];
for (let page = 1; page <= 20; page++) {
  const { data } = await (woo as any).http.get('/products', {
    params: { per_page: 100, page, status: 'any' },
  });
  if (!Array.isArray(data) || data.length === 0) break;
  for (const p of data) {
    if (/^(K-|KG-|P-)/.test(p.sku ?? '')) allProducts.push(p);
  }
  if (data.length < 100) break;
}

// Already updated = has heading tags (h2/h3) OR description is >3x longer than short_description
function needsUpdate(p: any): boolean {
  const desc: string = p.description ?? '';
  const short: string = p.short_description ?? '';
  if (desc.includes('<h2>') || desc.includes('<h3>')) return false;
  if (desc.length > short.length * 2.5 && desc.length > 1000) return false;
  return true;
}
const needUpdate = allProducts.filter(needsUpdate);
const alreadyDone = allProducts.filter(p => !needsUpdate(p));

console.log(`總 KUSHITANI 商品：${allProducts.length}`);
console.log(`已有詳細說明：${alreadyDone.length}`);
console.log(`需要改寫：${needUpdate.length}`);
console.log('\n需要改寫的商品（SKU #WooID 分類）：');
for (const p of needUpdate) {
  console.log(`${p.sku}\t#${p.id}\t${p.name.slice(0, 35)}`);
}
