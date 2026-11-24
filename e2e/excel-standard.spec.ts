import { expect, test } from '@playwright/test'
import { utils, write } from 'xlsx'
import { QA_DOCUMENTADOR } from '../src/site-paths'

test('importa 1000 escenarios del formato estándar y conserva sus datos', async ({ page }) => {
  const projectTitle = 'Validación de demostración'
  const objective = 'Validar el acceso de una cuenta de prueba'
  const steps = '1. Abrir la pantalla de acceso.\n2. Iniciar sesión con una cuenta de prueba.'
  const observations = 'La cuenta de prueba quedó disponible para una segunda revisión.'
  const additionalScenarios = Array.from({ length: 999 }, (_, index) => [
    `VOLUMEN-${index + 2}`, 'Funcional', 'Media', 'Acceso', '', '', `Escenario sintético ${index + 2}`,
    '', '', 'Operación completada', '', '', 'Sí', 'No iniciado', '',
  ])
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['Datos de la prueba'],
    ['Nombre del proyecto', projectTitle],
    ['QA Specialist', 'Equipo QA de prueba'],
    ['PO / creador del work item principal', 'Producto de prueba'],
  ]), 'Portada')
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([
    ['Escenarios de prueba'],
    ['ID', 'Tipo de prueba', 'Prioridad', 'Componente', 'Precondiciones', 'Datos de entrada', 'Objetivo',
      'Pasos numerados', 'Gherkin', 'Resultado esperado', 'Requisito cubierto', 'Estimación (min)',
      'Evidencia requerida', 'Estatus', 'Evidencia / observaciones'],
    ['QA-001', 'Funcional', 'Alta', 'Acceso', 'Cuenta activa', 'Cuenta sintética', objective,
      steps, 'Dado que hay una cuenta activa', 'Acceso permitido', 'REQ-001', 5, 'Sí', 'Aprobado', observations],
    ...additionalScenarios,
  ]), 'Escenarios')

  await page.goto(QA_DOCUMENTADOR)
  await page.getByRole('button', { name: 'Con Test Scripts' }).click()
  await page.locator('input[accept=".xlsx"]').setInputFiles({
    name: 'plantilla-estandar-sintetica.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }),
  })

  await expect(page.getByRole('heading', { name: 'Test Script listo' })).toBeVisible()
  await expect(page.getByText('1000 escenarios', { exact: true })).toBeVisible()
  await expect(page.getByText('15 columnas válidas', { exact: true })).toBeVisible()
  await expect(page.getByText('2 fila de encabezados', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Nombre del proyecto')).toHaveValue(projectTitle)
  await expect(page.getByLabel('QA responsable')).toHaveValue('Equipo QA de prueba')
  await expect(page.getByLabel('Responsable de producto')).toHaveValue('Producto de prueba')
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(objective) }).click()
  await expect(page.getByRole('heading', { name: objective })).toBeVisible()
  await expect(page.getByLabel('Pasos del guion')).toHaveValue(steps)
  await expect(page.getByRole('group', { name: 'Paso 1' }).getByLabel('Acción')).toHaveValue('Abrir la pantalla de acceso.')
  await expect(page.getByRole('group', { name: 'Paso 2' }).getByLabel('Acción')).toHaveValue('Iniciar sesión con una cuenta de prueba.')
  await expect(page.getByLabel('Estado de ejecución')).toHaveValue('Passed')
  await expect(page.getByLabel('Comentarios')).toHaveValue(observations)
})
