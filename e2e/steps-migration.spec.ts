import { expect, test } from '@playwright/test'
import { QA_DOCUMENTADOR } from '../src/site-paths'

const legacyProject = {
  id: 'legacy-storage-project', title: 'Proyecto local de migración', country: '',
  qaOwner: 'QA Demo', poOwner: 'Producto Demo', reportDate: '2026-01-01', authorization: '',
  source: 'xlsx', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const legacyScenario = {
  id: 'legacy-storage-scenario', projectId: legacyProject.id, order: 0, sourceId: 'MIG-001',
  title: 'Escenario guardado en v1', component: '', priority: '', objective: '',
  detailedSteps: '1. Abrir la pantalla\n2. Validar la confirmación', steps: [],
  expectedResult: 'Confirmación visible', evidenceRequired: true,
  executionStatus: 'Passed', actualResult: '', comments: '', defectRef: '', metadata: {},
}

const sampleCapture = 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAAMklEQVR4nIXCMREAIAADscpBBCKYOyMCES8CEQhEwueSUXRm0VlFZxedU3QoOrfovKI//vV/gVdu7CQAAAAASUVORK5CYII='

test('migra pasos y conserva las capturas de un proyecto anterior', async ({ page }) => {
  const seedPath = '/prueba-interna-migracion-v1'
  await page.route(`**${seedPath}`, (route) => route.fulfill({ body: '', contentType: 'text/html' }))
  await page.goto(seedPath)

  await page.evaluate(async ({ project, scenario, base64 }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      // Dexie uses native version 10 for its schema version 1.
      const request = indexedDB.open('taf-docs', 10)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
        const scenarios = db.createObjectStore('scenarios', { keyPath: 'id' })
        scenarios.createIndex('projectId', 'projectId')
        scenarios.createIndex('[projectId+order]', ['projectId', 'order'])
        const evidence = db.createObjectStore('evidence', { keyPath: 'id' })
        evidence.createIndex('projectId', 'projectId')
        evidence.createIndex('scenarioId', 'scenarioId')
        evidence.createIndex('[scenarioId+order]', ['scenarioId', 'order'])
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    try {
      const image = new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: 'image/png' })
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['projects', 'scenarios', 'evidence'], 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo preparar el proyecto anterior.'))
        transaction.objectStore('projects').add(project)
        transaction.objectStore('scenarios').add(scenario)
        for (const [order, caption] of ['', 'Descripción anterior'].entries()) {
          transaction.objectStore('evidence').add({
            id: `legacy-capture-${order}`, projectId: project.id, scenarioId: scenario.id, order,
            caption, width: 12, height: 8, image, thumbnail: image,
          })
        }
      })
    } finally {
      database.close()
    }
  }, { project: legacyProject, scenario: legacyScenario, base64: sampleCapture })

  await page.goto(QA_DOCUMENTADOR)
  await page.getByRole('button', { name: new RegExp(legacyProject.title) }).click()
  await page.getByRole('button', { name: new RegExp(legacyScenario.title) }).click()
  await expect(page.getByRole('heading', { name: legacyScenario.title })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Paso 1' }).getByLabel('Acción')).toHaveValue('Abrir la pantalla')
  await expect(page.getByRole('group', { name: 'Paso 2' }).getByLabel('Acción')).toHaveValue('Validar la confirmación')

  const firstCaptureStep = page.getByLabel('Paso asociado a la captura 1')
  await expect(firstCaptureStep.locator('option:checked')).toHaveText('Paso 1')
  await expect(page.getByLabel('Paso asociado a la captura 2').locator('option:checked')).toHaveText('Paso 2')
  await expect(page.getByLabel('Descripción de captura 1')).toHaveValue('Paso 1. Abrir la pantalla')
  await expect(page.getByLabel('Descripción de captura 2')).toHaveValue('Descripción anterior')
  await expect(page.getByRole('button', { name: 'Ampliar captura 1' }).locator('img')).toHaveJSProperty('naturalWidth', 12)

  const migratedStepId = await firstCaptureStep.inputValue()
  await page.reload()
  await expect(firstCaptureStep).toHaveValue(migratedStepId)
  await expect(page.getByLabel('Descripción de captura 2')).toHaveValue('Descripción anterior')
})
