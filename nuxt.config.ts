// nuxt.config.ts
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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
    // 🔒 僅限伺服器端使用 (Webhook 會用到)
    line: {
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    },
    
    // 🌍 公開區塊 (前端 pages/cart.vue 與伺服器端皆可讀取)
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    }
  },

  // Vite 相關設定 (處理 ngrok 開放外部連接)
  vite: {
    server: {
      allowedHosts: [
        'semiskilled-summarily-aleena.ngrok-free.dev'
      ]
    }
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
})