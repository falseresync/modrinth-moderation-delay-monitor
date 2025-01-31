// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  ssr: false,
  css: ['modern-normalize'],
  app: {
    baseURL: '/modrinth-moderation-delay-monitor/'
  }
})
