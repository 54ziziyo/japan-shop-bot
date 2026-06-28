import { loadConfig } from './config';
import { WooClient } from './woocommerce';

async function main() {
  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);
  const vars = await woo.getVariations(8681);
  const out = vars.filter((v: any) => v.stock_status !== 'instock');
  console.log(`全部 ${vars.length} 個，outofstock: ${out.length} 個`);
  for (const v of out) {
    const label = (v as any).attributes.map((a: any) => a.option).join('/');
    console.log(`  [outofstock] #${v.id} ${label}  manage_stock=${(v as any).manage_stock}`);
  }
}
main().catch(console.error);
