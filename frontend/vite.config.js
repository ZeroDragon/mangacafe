import '../dotenv.mjs'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync } from 'fs'

const dotPathFixPlugin = () => ({
  name: "dot-path-fix-plugin",
  configureServer: (server) => {
    server.middlewares.use((req, _, next) => {
      const reqPath = req.url.split("?", 2)[0]
      if (
        !req.url.startsWith("/@") && // virtual files provided by vite plugins
        !req.url.startsWith("/api/") && // api proxy, configured below
        !existsSync(`./public${reqPath}`) && // files served directly from public folder
        !existsSync(`.${reqPath}`) // actual files
      ) {
        req.url = "/"
      }
      next()
    })
  },
})

export default (({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return defineConfig({
    plugins: [vue(), dotPathFixPlugin()],
    define: {
      '__API__': `"${env.API}"`,
      '__BOT_NAME__': `"${env.TELEGRAM_BOT}"`
    },
    build: {
      outDir: env.BUILD_OUT_DIR,
      emptyOutDir: true
    }
  })
})
