import { expect, test } from '@playwright/test'
import { QA_DOCUMENTADOR, TAF_HOME } from '../src/site-paths'

test('raíz temporal, catálogo TAF y Documentador en su nueva ruta', async ({ page, request, baseURL }) => {
  const root = await request.get('/', { maxRedirects: 0 })
  expect(root.status()).toBe(307)
  expect(new URL(root.headers().location, baseURL).pathname).toBe(TAF_HOME)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/TAF')
  await expect(page).toHaveURL(`${baseURL}${TAF_HOME}`)
  await expect(page.getByRole('heading', { name: 'Proyectos TAF' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.getByRole('link', { name: 'Documentador QA' }).press('Enter')
  await expect(page).toHaveURL(`${baseURL}${QA_DOCUMENTADOR}`)
  await expect(page.getByRole('heading', { name: 'Documenta tus pruebas QA.' })).toBeVisible()
  await page.getByRole('link', { name: 'Inicio TAF' }).click()
  await expect(page.getByRole('heading', { name: 'Proyectos TAF' })).toBeVisible()
})

test('enlaces de proyectos anteriores y portal sin conexión', async ({ page, context, baseURL }) => {
  await page.goto(QA_DOCUMENTADOR)
  await page.getByRole('button', { name: 'Abrir proyecto de ejemplo' }).click()
  await expect(page.getByRole('heading', { name: 'Portal de pagos · Validación UAT' })).toBeVisible()
  const hash = new URL(page.url()).hash
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await page.goto(`/${hash}`)
  await expect(page).toHaveURL(`${baseURL}${QA_DOCUMENTADOR}${hash}`)
  await expect(page.getByRole('heading', { name: 'Portal de pagos · Validación UAT' })).toBeVisible()
  const unknown = await page.goto(`${TAF_HOME}ruta-sin-proyecto`)
  expect(unknown?.status()).toBe(404)

  await context.setOffline(true)
  await page.goto(TAF_HOME)
  await expect(page.getByRole('heading', { name: 'Proyectos TAF' })).toBeVisible()
  await page.getByRole('link', { name: 'Documentador QA' }).click()
  await expect(page.getByRole('button', { name: /Portal de pagos · Validación UAT/ })).toBeVisible()
})
