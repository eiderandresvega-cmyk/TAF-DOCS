import { emptyDetails, emptyScenario, type ScenarioDraft } from './model'

export const demoDetails = {
  ...emptyDetails(), title: 'Portal de pagos · Validación UAT', country: 'Colombia',
  qaOwner: 'Equipo QA Demo', poOwner: 'Producto Demo', authorization: 'Pendiente de revisión',
}

export const demoScenarios: ScenarioDraft[] = [
  { ...emptyScenario(), sourceId: 'UAT-001', title: 'Registrar un pago con datos válidos', component: 'Pagos', priority: 'Alta',
    objective: 'Verificar el registro de un pago en el portal de demostración.',
    detailedSteps: '1. Abrir el formulario de pagos.\n2. Introducir los datos de la transacción de prueba.\n3. Confirmar el pago y revisar el comprobante.',
    expectedResult: 'El portal confirma la transacción y muestra un número de comprobante.',
    actualResult: 'La transacción de prueba se registró y el portal emitió el comprobante DEMO-001.', executionStatus: 'Passed' },
  { ...emptyScenario(), sourceId: 'UAT-002', title: 'Rechazar un importe fuera del límite', component: 'Validaciones', priority: 'Alta',
    objective: 'Confirmar que el portal aplica el importe máximo por transacción.',
    detailedSteps: '1. Ingresar un importe superior al límite de prueba.\n2. Intentar enviar el formulario.',
    expectedResult: 'El portal informa el límite y mantiene el pago sin registrar.',
    actualResult: 'El mensaje de validación apareció y no se registró el pago.', executionStatus: 'Passed', evidenceRequired: false },
  { ...emptyScenario(), sourceId: 'UAT-003', title: 'Consultar el historial de transacciones', component: 'Historial', priority: 'Media',
    objective: 'Verificar que el historial lista las operaciones de la cuenta de demostración.',
    detailedSteps: '1. Abrir el historial.\n2. Filtrar por fecha.\n3. Verificar la operación de referencia.',
    expectedResult: 'Se muestran las transacciones del periodo seleccionado.', executionStatus: 'En progreso' },
  { ...emptyScenario(), sourceId: 'UAT-004', title: 'Descargar el comprobante de pago', component: 'Comprobantes', priority: 'Media',
    expectedResult: 'La descarga contiene el comprobante de la transacción seleccionada.' },
  { ...emptyScenario(), sourceId: 'UAT-005', title: 'Mostrar el estado de un pago pendiente', component: 'Pagos', priority: 'Baja',
    expectedResult: 'El detalle identifica la transacción como pendiente y muestra su referencia.' },
]
