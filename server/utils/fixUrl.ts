// server/utils/fixUrl.ts

// 🔧 工具人：把破網址修成 LINE 喜歡的 HTTPS 完整網址
export const fixUrl = (url: string | undefined, baseUrl: string) => {
  if (!url) return 'https://placehold.co/600x400?text=No+Image'
  
  let cleanUrl = url.trim()

  // 1. 如果是 // 開頭 -> 補上 https:
  if (cleanUrl.startsWith('//')) return `https:${cleanUrl}`
  
  // 2. 如果是 / 開頭 -> 補上主網域
  if (cleanUrl.startsWith('/')) {
    const origin = new URL(baseUrl).origin
    return `${origin}${cleanUrl}`
  }

  // 3. 如果是 http: 開頭 -> 強制改成 https:
  if (cleanUrl.startsWith('http:')) {
    return cleanUrl.replace('http:', 'https:')
  }

  return cleanUrl
}