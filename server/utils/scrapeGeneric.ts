// server/utils/scrapeGeneric.ts
import * as cheerio from 'cheerio'
import { fixUrl } from './fixUrl'

// 🧠 通用保底策略 (Fallback Strategy)
// 當所有專屬爬蟲 (Shopify, HYOD) 都失敗時，最後會用這個
// 或是用來抓取未支援網站 (如 Amazon, Webike) 的基本資訊
export const scrapeGeneric = ($: cheerio.CheerioAPI, url: string) => {
  console.log('🔍 使用通用 OG 策略 (56design)')

  // 1. 抓標題
  const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim()
  
  // 2. 抓圖片
  const rawImage = $('meta[property="og:image"]').attr('content')
  const image = fixUrl(rawImage, url)
  
  // 3. 抓價格
  let price = $('meta[property="og:price:amount"]').attr('content') 
    || $('.price').first().text().trim() 
    || $('.money').first().text().trim()
    || $('.product-price').first().text().trim()
    || '請點擊查看'
  
  price = price.replace(/\s+/g, ' ').trim()

  // 回傳標準格式 (即使只有一個款式，也包成陣列)
  return {
    title,
    variants: [
      {
        color: '單一款式',
        image: image,
        price: price,
        sizes: [] // 通用網站通常很難抓尺寸表，留空
      }
    ]
  }
}