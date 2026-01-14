// server/utils/scrapeShopify.ts
import axios from 'axios'
import { fixUrl } from './fixUrl'

export const scrapeShopify = async (url: string) => {
  console.log('🔍 使用 Shopify API 策略 (56design 精準濾網)')

  try {
    const urlObj = new URL(url)
    const baseUrl = `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '')
    const jsonUrl = `${baseUrl}.js`

    const { data } = await axios.get(jsonUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })

    const title = data.title
    const mainImage = data.featured_image
    const productType = data.type || data.product_type || ''
    const tags = data.tags || []

    const titleLower = title.toLowerCase()
    
    // 🛑 排除名單：只要標題有這些字，就絕對不是安全帽 (不管有沒有寫 Arai)
    const excludeKeywords = [
        'tee', 't-shirt', 'shirt', 'hoodie', 'jacket', 'pants', 'glove', // 衣服類
        'bag', 'sack', 'case', 'cover', 'holder', 'key', // 配件類
        'visor', 'shield', 'pad', 'interior', 'cheek', // 鏡片內襯類
        'sticker', 'decal', // 貼紙類
        'cap', 'hat' // 帽子 (鴨舌帽)
    ]

    const isExcluded = excludeKeywords.some(k => titleLower.includes(k))

    // ✨ 鎖定名單：必須包含 Arai 或 RX-7X 或 VZ-RAM (且沒被排除)
    // 這樣 "Arai T-shirt" 會被排除，但 "Arai RX-7X" 會被鎖定
    let isHelmet = false
    
    if (!isExcluded) {
        if (titleLower.includes('arai') || 
            titleLower.includes('rx-7x') || 
            titleLower.includes('vz-ram') || 
            titleLower.includes('classic air') ||
            titleLower.includes('rapide')) {
            isHelmet = true
        }
    }

    console.log(`📦 Title: ${title}`)
    console.log(`📦 Is 56design Helmet? ${isHelmet}`)

    const variantsMap = new Map()

    data.variants.forEach((v: any) => {
      let color = '單一款式'
      let size = 'F'

      data.options.forEach((opt: any, index: number) => {
        const val = v[`option${index + 1}`]
        const name = opt.name.toLowerCase()
        if (name.includes('color') || name.includes('clr') || name.includes('色') || name.includes('カラー')) {
          color = val
        } else if (name.includes('size') || name.includes('サイズ')) {
          size = val
        }
      })

      if (color === '單一款式' && data.options.length === 1 && v.option1) color = v.option1

      const sizeLabel = v.available ? size : `${size} (缺貨)`
      const price = `¥${(v.price / 100).toLocaleString()}`
      let img = v.featured_image ? v.featured_image.src : mainImage
      img = fixUrl(img, baseUrl)

      if (variantsMap.has(color)) {
        variantsMap.get(color).sizes.push(sizeLabel)
      } else {
        variantsMap.set(color, { color, image: img, price, sizes: [sizeLabel] })
      }
    })

    return {
      title,
      productType, 
      tags,
      isHelmet,
      variants: Array.from(variantsMap.values())
    }

  } catch (error: any) {
    console.error('❌ Shopify API 失敗')
    return null 
  }
}