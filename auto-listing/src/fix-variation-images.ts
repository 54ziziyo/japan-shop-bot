// ============================================================
// 修復現有商品的變體圖片（按顏色屬性對應 WP media ID）
// npx tsx --env-file=.env auto-listing/src/fix-variation-images.ts <商品ID> <COLOR=mediaId>...
// 例：npx tsx --env-file=.env auto-listing/src/fix-variation-images.ts 14120 BLACK=14117 WHITE=14118 NAVY=14119
// ============================================================
import { loadConfig } from './config';
import { WooClient } from './woocommerce';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法：fix-variation-images.ts <商品ID> <COLOR=mediaId>...');
    console.error('例：fix-variation-images.ts 14120 BLACK=14117 WHITE=14118 NAVY=14119');
    process.exit(1);
  }

  const productId = parseInt(args[0]!, 10);
  if (isNaN(productId)) {
    console.error('商品 ID 必須是數字');
    process.exit(1);
  }

  // 解析 COLOR=imageId 參數
  const colorMap = new Map<string, number>();
  for (const arg of args.slice(1)) {
    const eq = arg.indexOf('=');
    if (eq === -1) { console.warn(`跳過無效參數：${arg}`); continue; }
    const color = arg.slice(0, eq).toUpperCase().trim();
    const id = parseInt(arg.slice(eq + 1), 10);
    if (!color || isNaN(id)) { console.warn(`跳過無效參數：${arg}`); continue; }
    colorMap.set(color, id);
    console.log(`  顏色對應：${color} → 媒體 #${id}`);
  }

  const cfg = loadConfig();
  const woo = new WooClient(cfg.woo);

  // 取所有變體（含 image 欄位）
  console.log(`\n🔍 抓取商品 #${productId} 的所有變體…`);
  const rawVars = await woo.getVariationsWithImages(productId);
  console.log(`   共 ${rawVars.length} 個變體`);

  let updated = 0;
  let skipped = 0;

  for (const v of rawVars) {
    const colorAttr = v.attributes.find((a) => a.name === '顏色');
    const color = colorAttr?.option?.toUpperCase() ?? '';
    const imageId = colorMap.get(color);

    if (!imageId) {
      console.log(`   ⚠️  #${v.id} 顏色「${color}」無對應圖片，跳過`);
      skipped++;
      continue;
    }

    // 若已有正確圖片，跳過
    if (v.imageId === imageId) {
      console.log(`   ✅ #${v.id} ${color} 圖片已正確（#${imageId}），跳過`);
      skipped++;
      continue;
    }

    console.log(`   🔄 #${v.id} ${color}：更新圖片 ${v.imageId ?? '(無)'} → #${imageId}`);
    await woo.updateVariation(productId, v.id, { image: { id: imageId } });
    updated++;
  }

  console.log(`\n✅ 完成：更新 ${updated} 個，跳過 ${skipped} 個`);
}

main().catch((err) => {
  console.error('\n💥', err.response?.data ?? err.message ?? err);
  process.exit(1);
});
