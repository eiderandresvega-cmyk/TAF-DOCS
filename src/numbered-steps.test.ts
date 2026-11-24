import { describe, expect, it } from 'vitest'
import { numberedStepActions, numberedSteps } from './numbered-steps'

describe('pasos numerados de Excel', () => {
  it('conserva el orden y las líneas de continuación al crear pasos editables', () => {
    const steps = numberedSteps('1. Abrir la sesión\r\n   Usar la cuenta de prueba\r\n2. Verificar el resultado')

    expect(steps).toEqual([
      { id: expect.any(String), action: 'Abrir la sesión\n   Usar la cuenta de prueba', expectedResult: '', actualResult: '', status: 'No ejecutado' },
      { id: expect.any(String), action: 'Verificar el resultado', expectedResult: '', actualResult: '', status: 'No ejecutado' },
    ])
    expect(steps[0].id).not.toBe(steps[1].id)
  })

  it('reconoce numeraciones seguidas en una celda y conserva el texto de contexto', () => {
    expect(numberedStepActions('Preparar datos de prueba\nPaso 1: Abrir; Step 2 - Guardar (3) Consultar')).toEqual([
      'Preparar datos de prueba\nAbrir', 'Guardar', 'Consultar',
    ])
  })

  it('mantiene versiones y referencias numéricas dentro de sus acciones', () => {
    expect(numberedStepActions('1. Abrir versión 2.1 y consultar el Paso 2 de la guía\n2. Revisar la opción 7. Disponible')).toEqual([
      'Abrir versión 2.1 y consultar el Paso 2 de la guía', 'Revisar la opción 7. Disponible',
    ])
    expect(numberedSteps('2.1.3\nInforme de ejecución sin numeración')).toEqual([])
  })

  it('omite entradas vacías y admite números no consecutivos en líneas separadas', () => {
    expect(numberedStepActions('1.\n3) Abrir\n8. Guardar')).toEqual(['Abrir', 'Guardar'])
    expect(numberedStepActions('')).toEqual([])
  })

  it('limita los pasos materializados al máximo del editor', () => {
    const source = Array.from({ length: 5_001 }, (_, index) => `${index + 1}. Acción de prueba`).join('\n')

    expect(numberedStepActions(source)).toHaveLength(5_001)
    expect(numberedSteps(source)).toHaveLength(5_000)
  })
})
