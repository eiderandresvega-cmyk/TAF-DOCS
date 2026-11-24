import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const child = join(path, entry.name)
    return entry.isDirectory() ? filesIn(child) : child
  }))
  return files.flat()
}

const files = (await filesIn('dist')).filter((file) => relative('dist', file) !== 'sw.js').sort()
const digest = createHash('sha256')
for (const file of files) digest.update(file).update(await readFile(file))
const urls = files.map((file) => `/${relative('dist', file).replaceAll('\\', '/')}`)
const cacheName = `taf-docs-${digest.digest('hex').slice(0, 20)}`

await writeFile('dist/sw.js', `const cacheName = ${JSON.stringify(cacheName)}
const assets = new Set(${JSON.stringify(urls)})
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...assets])))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('taf-docs-') && key !== cacheName)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      (await cache.match('/index.html')) ?? fetch(request)))
  } else if (assets.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      (await cache.match(url.pathname)) ?? fetch(request)))
  }
})
`)
