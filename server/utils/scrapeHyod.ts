// server/utils/scrapeHyod.ts
import * as cheerio from 'cheerio'

export const scrapeHyod = ($: cheerio.CheerioAPI, url: string) => {
  console.log('🔍 使用 HYOD 專用策略')

  try {
    const urlObj = new URL(url)
    const baseUrl = `${urlObj.origin}` 

    // 1. 抓標題
    let title = $('h2.product_name').text().trim()
    if (!title) title = $('.mainImageTitle h1').text().trim()
    if (!title) title = $('h1').text().trim()

    // 2. 抓價格
    let price = $('.taxPrice').text().trim()
    if (!price) price = $('.price .sell').text().trim()
    if (!price) price = $('span[itemprop="price"]').text().trim()
    if (price && !price.includes('¥')) price = `¥${price}`
    if (!price) price = '價格請見官網'

    // 3. 抓主圖
    let mainImage = $('#zoomPicture').attr('src') || $('.main_image_link img').attr('src')

    // 全域缺貨標記 (備用)
    const isGlobalSoldOut = $('.soldout').length > 0 || $('.productPrice').text().toUpperCase().includes('SOLDOUT')

    const variants: any[] = []
    const variantsMap = new Map()

    // 🔥 策略 A: 優先嘗試解析「庫存表格」 (#divMultiVariation table)
    // 這是針對 HYD704DN 這種有顯示詳細尺寸表格的頁面
    const tableRows = $('#divMultiVariation table tbody tr')
    
    if (tableRows.length > 0) {
      console.log(`📋 策略 A: 發現庫存表格 (共 ${tableRows.length} 列)，開始解析...`)
      
      tableRows.each((_, tr) => {
        // HYOD 表格結構通常是:
        // [0]圖片 [1]顏色(p標籤) [2]價格 [3]尺寸(td.pc) [4]購物車按鈕(.addCart)
        
        // 抓顏色
        const color = $(tr).find('td').eq(1).find('p').first().text().trim()
        
        // 抓尺寸 (優先抓 PC 版顯示的尺寸)
        let size = $(tr).find('td.pc').last().text().trim()
        // 有時候尺寸欄位會包含 "在庫あり" 等文字，要清掉
        size = size.replace(/在庫.*/, '').trim()
        
        // 如果 PC 版抓不到，嘗試抓 SP 版 (在第 2 個 td 裡面的 span 或 p)
        if (!size) {
           // 備用邏輯：有些舊版頁面結構不同，這裡做個簡單處理
           size = $(tr).find('td').eq(3).text().trim().replace(/在庫.*/, '')
        }

        // 抓圖片
        let img = $(tr).find('td').eq(0).find('img').attr('src')
        if (img) img = fixUrl(img, baseUrl)

        // 抓庫存狀態
        // 判斷方式：如果有 "addCart" 區塊且裡面有 "a" 連結，代表有貨
        const hasCartButton = $(tr).find('.addCart a').length > 0
        const sizeLabel = hasCartButton ? size : `${size} (缺貨)`

        if (color && size) {
            if (variantsMap.has(color)) {
                variantsMap.get(color).sizes.push(sizeLabel)
            } else {
                variantsMap.set(color, {
                    color,
                    image: img || mainImage,
                    price, 
                    sizes: [sizeLabel]
                })
            }
        }
      })
      
      // 將 Map 轉回 Array
      if (variantsMap.size > 0) {
        variants.push(...variantsMap.values())
      }
    }

    // 🔥 策略 B: 如果表格是空的 (例如 STJ615D 那種動態載入或全缺貨頁面)
    // 改為抓取「顏色列表縮圖」
    if (variants.length === 0) {
      console.log('⚠️ 策略 A 無資料，切換至策略 B (抓取顏色列表)')
      
      const colorItems = $('.variationImage li')
      
      if (colorItems.length > 0) {
        colorItems.each((_, el) => {
          const colorName = $(el).find('.subItemTitle').text().trim() || 'One Color'
          let img = $(el).find('img').attr('src') || $(el).find('img').attr('data-image')
          if (img) img = fixUrl(img, baseUrl)
          else img = mainImage

          // 因為抓不到尺寸，如果是全域缺貨就標示已售完，否則引導回官網
          const sizes = isGlobalSoldOut ? ['已售完'] : ['請前往官網選擇尺寸']

          variants.push({
            color: colorName,
            image: img,
            price: price,
            sizes: sizes 
          })
        })
      } 
    }
    
    // --- 策略 C: 真的什麼都抓不到，至少回傳一個通用卡片 ---
    if (variants.length === 0) {
      console.log('⚠️ 策略 A/B 皆無效，使用保底資料')
      variants.push({
        color: '單一款式',
        image: mainImage,
        price: price,
        sizes: isGlobalSoldOut ? ['已售完'] : ['請前往官網選擇尺寸']
      })
    }

    return {
      title,
      productType: 'Riding Gear', 
      tags: [],
      variants
    }

  } catch (error: any) {
    console.error('❌ HYOD 爬蟲失敗:', error.message)
    return null
  }
}