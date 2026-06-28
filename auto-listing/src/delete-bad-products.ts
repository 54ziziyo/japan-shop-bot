import { loadConfig } from './config';
import { WooClient } from './woocommerce';

const BAD_IDS = [
  10997, 10999, 11002, 11005, 11007, 11009, 11011, 11013,
  11015, 11018, 11022, 11026, 11029, 11032, 11034, 11036,
  11038, 11040, 11044, 11049, 11053, 11057, 11061, 11066,
  11071, 11072,
];

async function main() {
  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);
  let ok = 0;
  for (const id of BAD_IDS) {
    try {
      await (woo as any).http.delete(`/products/${id}`, { params: { force: true } });
      console.log(`✅ 刪除 #${id}`);
      ok++;
    } catch (e: any) {
      console.error(`❌ #${id}：${e.response?.data?.message ?? e.message}`);
    }
  }
  console.log(`\n完成：刪除 ${ok}/${BAD_IDS.length} 件`);
}
main().catch(console.error);
