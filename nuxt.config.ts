// nuxt.config.ts
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // 此專案以前端互動 + server/api 為主，關閉 SSR 可避開 Nuxt 4 payload 初始化錯誤
  ssr: false,

  // 設定相容性日期
  compatibilityDate: '2025-07-15',

  // 啟用開發者工具
  devtools: { enabled: true },

  // 路由規則設定
  routeRules: {
    // 💡 關鍵：強制關閉購物車頁面的伺服器端渲染 (SSR)，徹底避開 renderer$1 報錯
    '/cart': { ssr: false },
  },

  // 環境變數與全域設定
  runtimeConfig: {
    // ✅ 這裡直接對應 Vercel 上的 Key 名稱
    line: {
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
      channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    },

    public: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      liffId: process.env.LIFF_ID || '',
    },
  },

  // Vite 相關設定 (處理 ngrok 開放外部連接)
  vite: {
    server: {
      allowedHosts: ['semiskilled-summarily-aleena.ngrok-free.dev'],
    },
  },

  // PostCSS 配置用於 Tailwind CSS
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  // 如果你有使用 Tailwind CSS，記得在這裡確認模組 (選填)
  // modules: ['@nuxtjs/tailwindcss']
});
