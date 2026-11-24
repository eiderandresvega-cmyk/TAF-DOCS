import { fileURLToPath } from 'node:url'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import vercel from './vercel.json' with { type: 'json' }

// Preview the custom domain routes locally. Vercel handles the host conditions in production.
const serveTafRoutes: Connect.NextHandleFunction = (request, response, next) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const redirect = vercel.redirects.find(({ source }) => source === url.pathname)
  if (redirect) {
    response.writeHead(307, { Location: `${redirect.destination}${url.search}` })
    response.end()
    return
  }
  const rewrite = vercel.rewrites.find(({ source }) => source === url.pathname)
  if (rewrite) request.url = `${rewrite.destination}${url.search}`
  next()
}

const tafRoutes: Plugin = {
  name: 'taf-local-routes',
  configureServer(server) { server.middlewares.use(serveTafRoutes) },
  configurePreviewServer(server) { server.middlewares.use(serveTafRoutes) },
}

export default defineConfig({
  appType: 'mpa',
  plugins: [react(), tafRoutes],
  build: { rolldownOptions: { input: [
    fileURLToPath(new URL('./index.html', import.meta.url)),
    fileURLToPath(new URL('./portal.html', import.meta.url)),
    fileURLToPath(new URL('./actualizar.html', import.meta.url)),
  ] } },
  preview: { headers: Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value])) },
})
