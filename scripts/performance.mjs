import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { platform, arch, cpus } from 'node:os'

import { chromium } from '@playwright/test'
import * as XLSX from 'xlsx'

const destination = new URL(process.argv[2] ?? 'http://127.0.0.1:4173/')
const scenarioCount = Number(process.argv[3] ?? 1000)
const trials = Number(process.argv[4] ?? 3)

assert(['https:', 'http:'].includes(destination.protocol), 'Use an HTTP or HTTPS URL.')
assert(Number.isInteger(scenarioCount) && scenarioCount >= 1 && scenarioCount <= 5000)
assert(Number.isInteger(trials) && trials >= 1 && trials <= 10)

const heading = 'Documenta tus pruebas QA.'
const projectTitle = 'TAF · Rendimiento sintético'
const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
const rounded = (value) => Math.round(value * 10) / 10
const normalize = (label) => String(label ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

function workbookBytes(template, count) {
  const workbook = XLSX.read(template, { type: 'buffer' })
  const sheet = workbook.SheetNames.find((name) => normalize(name) === 'escenarios')
  assert(sheet, 'The downloaded template does not contain Escenarios.')
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, raw: false, blankrows: true })
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalize)
    return ['id', 'escenario', 'resultado esperado'].every((label) => headers.includes(label))
  })
  assert(headerIndex >= 0, 'The downloaded template schema was not recognized.')
  const headers = rows[headerIndex]
  const scenarios = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(4, '0')
    const fields = {
      id: 'PERF-' + number,
      escenario: 'Validación genérica ' + number,
      componente: 'Portal sintético',
      prioridad: ['Alta', 'Media', 'Baja'][index % 3],
      objetivo: 'Confirmar que el resultado coincide con la entrada de prueba.',
      'resultado esperado': 'La aplicación muestra la confirmación esperada.',
      'evidencia requerida': 'Sí',
    }
    return headers.map((name) => fields[normalize(name)] ?? '')
  })
  workbook.Sheets[sheet] = XLSX.utils.aoa_to_sheet([...rows.slice(0, headerIndex + 1), ...scenarios])
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true })
}

function observe(context) {
  let stage = 'home-cold'
  const requests = []
  const uploads = []
  const faults = []
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (!['https:', 'http:'].includes(url.protocol)) return
    if (url.origin !== destination.origin || !['GET', 'HEAD'].includes(request.method()) || request.postDataBuffer()) {
      uploads.push({ method: request.method(), origin: url.origin, path: url.pathname })
    }
  })
  context.on('requestfinished', (request) => {
    const url = new URL(request.url())
    if (!['https:', 'http:'].includes(url.protocol)) return
    const at = stage
    requests.push(Promise.all([request.sizes(), request.response()]).then(([sizes, response]) => ({
      stage: at,
      path: url.pathname,
      viaServiceWorker: response?.fromServiceWorker() ?? false,
      fromWorker: Boolean(request.serviceWorker()),
      bytes: sizes.responseBodySize,
    })).catch(() => null))
  })
  const toStages = (rows) => Object.fromEntries([...new Set(rows.map((row) => row.stage))].map((stage) => {
    const stageRows = rows.filter((row) => row.stage === stage)
    const originRows = stageRows.filter((row) => !row.viaServiceWorker)
    return [stage, {
      responses: stageRows.length,
      serviceWorkerResponses: stageRows.length - originRows.length,
      serviceWorkerFetches: originRows.filter((row) => row.fromWorker).length,
      originResponseBytesReportedByPlaywright: originRows.reduce((sum, row) => sum + row.bytes, 0),
      largestOriginResponses: originRows.toSorted((a, b) => b.bytes - a.bytes).slice(0, 5).map(({ path, bytes }) => ({ path, bytes })),
    }]
  }))
  return {
    uploads,
    faults,
    setStage: (next) => { stage = next },
    attach(page) {
      page.on('pageerror', (error) => faults.push(error.message))
      page.on('console', (entry) => { if (entry.type() === 'error') faults.push(entry.text()) })
    },
    async stages() { return toStages((await Promise.all(requests)).filter(Boolean)) },
  }
}

async function clientTiming(page) {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const navigation = performance.getEntriesByType('navigation')[0]
    const paint = performance.getEntriesByName('first-contentful-paint')[0]
    const resources = [navigation, ...performance.getEntriesByType('resource')]
      .filter((entry) => entry && entry.name.startsWith(location.origin + '/'))
    return {
      firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      pageResourceTransferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
      pageResourceEncodedBytes: resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    }
  })
}

async function warmProject(page, observation) {
  observation.setStage('template')
  const pendingTemplate = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Plantilla Excel' }).click()
  const template = await pendingTemplate
  const buffer = workbookBytes(await readFile(await template.path()), scenarioCount)
  await page.getByRole('button', { name: 'Con Test Scripts' }).click()
  observation.setStage('import')
  const validationStart = performance.now()
  await page.locator('input[type=file]').setInputFiles({
    buffer,
    name: 'benchmark-taf.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  await page.getByRole('heading', { name: 'Test Script listo' }).waitFor({ timeout: 45_000 })
  const importValidationMs = rounded(performance.now() - validationStart)
  await page.getByLabel('Nombre del proyecto').fill(projectTitle)
  await page.getByLabel('QA responsable').fill('QA de ejemplo')
  await page.getByLabel('Responsable de producto').fill('Producto de ejemplo')
  const persistStart = performance.now()
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await page.getByRole('heading', { name: projectTitle }).waitFor({ timeout: 45_000 })
  await page.getByText(scenarioCount + ' de ' + scenarioCount, { exact: true }).waitFor({ timeout: 45_000 })
  const persistAndRenderMs = rounded(performance.now() - persistStart)
  observation.setStage('warm-project-reload')
  const warmStart = performance.now()
  await page.reload({ waitUntil: 'commit' })
  await page.getByRole('heading', { name: projectTitle }).waitFor({ timeout: 45_000 })
  await page.getByText(scenarioCount + ' de ' + scenarioCount, { exact: true }).waitFor({ timeout: 45_000 })
  const projectReadyMs = rounded(performance.now() - warmStart)
  await page.waitForLoadState()
  const warm = await clientTiming(page)
  const filterStart = performance.now()
  await page.getByLabel('Buscar escenarios').fill('PERF-0001')
  await page.getByText('1 de ' + scenarioCount, { exact: true }).waitFor()
  const filterMs = rounded(performance.now() - filterStart)
  return { scenarioCount, workbookBytes: buffer.length, importValidationMs, persistAndRenderMs, projectReadyMs, filterMs, ...warm }
}

const browser = await chromium.launch()
const results = []
let headers = {}
let project
try {
  for (let run = 1; run <= trials; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const observed = observe(context)
    try {
      const page = await context.newPage()
      observed.attach(page)
      const navigationStart = performance.now()
      const response = await page.goto(destination.href, { waitUntil: 'commit' })
      await page.getByRole('heading', { name: heading }).waitFor({ timeout: 45_000 })
      const homeReadyMs = rounded(performance.now() - navigationStart)
      await page.waitForLoadState()
      const cold = await clientTiming(page)
      const ready = await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15_000 })
        .then(() => true, () => false)
      if (run === 1) {
        assert(response?.ok(), 'The target did not return a successful HTTP response.')
        const responseHeaders = response.headers()
        headers = Object.fromEntries([
          'content-security-policy',
          'strict-transport-security',
          'x-content-type-options',
          'x-frame-options',
          'referrer-policy',
          'permissions-policy',
          'content-encoding',
        ].map((name) => [name, responseHeaders[name] ?? null]))
        project = await warmProject(page, observed)
      }
      results.push({ run, homeReadyMs, serviceWorkerReady: ready, ...cold,
        requestStages: await observed.stages(), policyViolations: observed.uploads, browserErrors: observed.faults })
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({
  target: destination.href,
  method: 'Fresh Chromium context per cold run, synthetic workbook once, no throttling',
  environment: { platform: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? null },
  coldHomeMeanReadyMs: average(results.map((run) => run.homeReadyMs)),
  cold: results,
  syntheticProject: project,
  responseHeaders: headers,
}, null, 2))

assert(results.every((run) => run.serviceWorkerReady), 'The service worker did not take control.')
assert.deepEqual(results.flatMap((run) => run.policyViolations), [], 'Unexpected outbound requests were observed.')
assert.deepEqual(results.flatMap((run) => run.browserErrors), [], 'Chromium reported errors.')
