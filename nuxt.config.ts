// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    line: {
      channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
      channelSecret: process.env.CHANNEL_SECRET,
    }
  },
  vite: {
    server: {
      allowedHosts: [
        'semiskilled-summarily-aleena.ngrok-free.dev'
      ]
    }
  },
})
