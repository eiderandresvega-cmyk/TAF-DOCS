import { expect, test } from '@playwright/test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { QA_DOCUMENTADOR, TAF_UPDATE } from '../src/site-paths'

const previousWorker = `
const oldCache = 'taf-docs-regression-previous'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(oldCache).then((cache) => cache.put('/index.html', new Response(
    '<!doctype html><html lang="es"><h1>Versión anterior de prueba</h1></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  ))))
})
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.mode === 'navigate' && url.pathname === ${JSON.stringify(QA_DOCUMENTADOR)}) {
    event.respondWith(caches.open(oldCache).then(async (cache) =>
      (await cache.match('/index.html')) ?? fetch(event.request)))
  }
})`
const previousAsset = '/assets/regression-previous-chunk.js'

test('actualiza el Documentador desde un caché anterior con otra pestaña abierta', async ({ page, context, baseURL }) => {
  const buildOrigin = new URL(baseURL!).origin
  let servingPreviousWorker = true
  const server = createServer(async (request, response) => {
    const { pathname, search } = new URL(request.url ?? '/', buildOrigin)
    if (pathname === '/sw.js' && servingPreviousWorker) {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' })
      response.end(previousWorker)
      return
    }

    try {
      const upstream = await fetch(`${buildOrigin}${pathname}${search}`, { redirect: 'manual' })
      const headers = new Headers(upstream.headers)
      headers.delete('content-encoding')
      headers.delete('content-length')
      response.writeHead(upstream.status, Object.fromEntries(headers))
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      response.writeHead(502).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    await page.goto(`${origin}${QA_DOCUMENTADOR}`)
    await page.getByRole('button', { name: 'Abrir proyecto de ejemplo' }).click()
    await expect(page.getByRole('heading', { name: 'Portal de pagos · Validación UAT' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    const oldTab = await context.newPage()
    await oldTab.goto(`${origin}${QA_DOCUMENTADOR}`)
    await expect(oldTab.getByRole('heading', { name: 'Versión anterior de prueba' })).toBeVisible()
    await page.goto(`${origin}${QA_DOCUMENTADOR}`)
    await expect(page.getByRole('heading', { name: 'Versión anterior de prueba' })).toBeVisible()
    await oldTab.evaluate(async (url) => {
      const cache = await caches.open('taf-docs-regression-previous')
      await cache.put(url, new Response('recurso de la versión anterior'))
    }, previousAsset)

    servingPreviousWorker = false
    await page.goto(`${origin}${TAF_UPDATE}`)
    await expect(page.getByRole('heading', { name: 'Actualizar TAF Docs' })).toBeVisible()
    await page.getByRole('button', { name: 'Actualizar ahora' }).click()

    await expect.poll(() => new URL(page.url()).pathname).toBe(QA_DOCUMENTADOR)
    const savedProject = page.getByRole('button', { name: /Portal de pagos · Validación UAT/ })
    await expect(savedProject).toBeVisible()
    await expect.poll(() => oldTab.evaluate(async (url) => (await fetch(url)).text(), previousAsset))
      .toBe('recurso de la versión anterior')

    await page.evaluate(async () => {
      const currentCache = (await caches.keys()).find((name) => /^taf-docs-[a-f\d]{20}$/.test(name))
      if (!currentCache) throw new Error('Falta la caché de la actualización')
      await (await caches.open(currentCache)).put('/index.html', new Response('<h1>Copia local de prueba</h1>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }))
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Documenta tus pruebas QA.' })).toBeVisible()
    await savedProject.click()
    await expect(page.getByRole('heading', { name: 'Portal de pagos · Validación UAT' })).toBeVisible()
  } finally {
    server.close()
    server.closeAllConnections()
  }
})
