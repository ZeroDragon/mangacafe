import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default (({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return defineConfig({
    plugins: [vue()],
    define: {
      '__API__': `"${env.API}"`
    }
  })
})
