import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')

  return {
    plugins: [vue()],
    define: {
      __API_URL__: JSON.stringify(env.VITE_API_URL || 'http://localhost:3000'),
    },
  }
})
