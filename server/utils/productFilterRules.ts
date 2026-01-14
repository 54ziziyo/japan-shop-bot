// server/utils/productFilterRules.ts

// 🚫 【關鍵字黑名單】(針對標題)
export const PROHIBITED_KEYWORDS = [
  // --- 品牌封鎖 (精準打擊) ---
  'ECSTAR', 'エクスター', //  Suzuki 原廠化學品品牌
  'ECSTAR', 'エクスター', // Suzuki 原廠化學品
  'M.MOWBRAY', 'M.モゥブレィ', 'モゥブレィ', // 皮革保養品牌 (多為噴霧/油)
  'Yamalube', 'ヤマルーブ', // Yamaha 原廠油品
  'Honda', 'ホンダ純正オイル', // Honda 原廠油品 (視情況加)
  'Kawasaki', 'カワサキ純正オイル', // Kawasaki 原廠油品

  // --- 電池類 ---
  'バッテリー', '電池', 'Battery',
  
  // --- 液體/油類 ---
  'オイル', 'Oil', 'oil', 
  'フルード', 'Fluid', 'Liquid', 
  'ガソリン', 'Fuel', 'Gasoline', 
  'クーラント', 'Coolant', '冷却水', 
  'アドブルー', 'AdBlue', 
  '防水スプレー', 'Waterproof Spray',
  
  // --- 化學/保養類 ---
  'グリス', 'Grease', 'グリース', // 潤滑脂
  'クリーナー', 'Cleaner', '洗浄', // 清潔劑
  'スプレー', 'Spray', // 噴霧
  'ケミカル', 'Chemical', // 化學品
  'ワックス', 'Wax', 'コーティング', 'Coating', // 蠟、鍍膜
  'シャンプー', 'Shampoo', // 洗車精
  '添加剤', 'Additive', // 添加劑
  'セット', 'Set', 'Kit', // ✨ 針對 "愛車套組" (如果標題只有 Set 但沒寫內容物，先擋下來人工確認比較保險)
  
  // --- 補修/施工類 ---
  'ペイント', 'Paint', '塗料', 'タッチペン', 
  'パテ', 'Putty', 
  '接着剤', 'Adhesive', 'ボンド', 
  'シーリング', 'Sealing', 
  
  // --- 大型/特殊類 ---
  '車両', 'Vehicle', 
  'タイヤ', 'Tire', 
  'ホイール', 'Wheel', 
  // 'ヘルメット', 'Helmet',
  'エンジン', 'Engine',
  // 'マフラー', 'Muffler', 'Exhaust' // 排氣管 (通常太大或有觸媒法規問題)
]

// 🚫 【類型/標籤黑名單】(針對 Shopify 內部設定)
export const PROHIBITED_TYPES = [
  'Oil', 'Chemical', 'Maintenance', 'Liquid', 'Battery', 'Fluids',
  'Grease', 'Lubricant', 'Paint', 'Repair',
  'オイル', 'ケミカル', 'メンテナンス', 'グリス', 'バッテリー'
]

// 🚫 【網址黑名單】(針對特定網址路徑)
export const PROHIBITED_URLS = [
  'collections/ecstar_oil_chemical', 
  'collections/batteries',
  'collections/maintenance',
  'collections/chemicals'
]

// ✅ 【白名單】(豁免 - 這些字眼就算跟黑名單沾邊也放行)
export const SAFE_KEYWORDS = [
  'ステッカー', 'Sticker', 'デカール', 'Decal', // 貼紙
  'キーホルダー', 'Key Holder', 'Keyring',     // 鑰匙圈
  'フィギュア', 'Figure', '模型', 'Model',      // 公仔
  'Tシャツ', 'T-shirt', 'Apparel', 'Hoodie',   // 衣服
  'エンブレム', 'Emblem',                      // 標誌
  'キャップ', 'Cap', 'Hat',                    // 帽子
  'グローブ', 'Glove',                         // 手套
  'バッグ', 'Bag', 'Tote', 'Wallet',           // 包包/皮夾
  'カバー', 'Cover', 'Case',                   // 保護套 (如手機殼、鑰匙套)
  'カップ', 'Cup', 'Mug', 'Tumbler',           // 杯子
  'タオル', 'Towel', 'Handkerchief',           // 毛巾
  'ペン', 'Pen', 'Stationery', 'Notebook'      // 文具 (防止 ECSTAR 原子筆被擋)
]

// 👮‍♂️ 【安檢邏輯】
export const checkProductRestriction = (
  title: string, 
  productType: string | undefined, 
  tags: string[] | undefined, 
  url: string
) => {
  
  // 1. 檢查網址
  const isRestrictedUrl = PROHIBITED_URLS.some(badUrl => url.includes(badUrl))

  // 2. 檢查標題關鍵字
  const hasBadKeyword = PROHIBITED_KEYWORDS.some(k => title.toLowerCase().includes(k.toLowerCase()))

  // 3. 檢查類型與標籤
  let hasBadType = false
  if (productType) {
    hasBadType = PROHIBITED_TYPES.some(t => productType.toLowerCase().includes(t.toLowerCase()))
  }
  if (tags && Array.isArray(tags)) {
    const hasBadTag = tags.some((tag: string) => 
       PROHIBITED_TYPES.some(bad => tag.toLowerCase().includes(bad.toLowerCase()))
    )
    if (hasBadTag) hasBadType = true
  }

  // 4. 檢查白名單
  const hasGoodKeyword = SAFE_KEYWORDS.some(k => title.toLowerCase().includes(k.toLowerCase()))

  // 🚨 判決結果
  const isRestricted = (isRestrictedUrl || hasBadKeyword || hasBadType) && !hasGoodKeyword
  
  let reason = ''
  if (isRestricted) {
      if (isRestrictedUrl) reason = '網址列管'
      else if (hasBadType) reason = '商品類型列管'
      else reason = '關鍵字列管'
  }

  return { isRestricted, reason }
}