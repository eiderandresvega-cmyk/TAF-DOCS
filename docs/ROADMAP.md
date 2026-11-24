# Hoja de ruta de TAF Docs

## MVP para demostración

El MVP permite importar un test script de Excel o crear un proyecto manual, documentar pruebas con capturas, recuperar el trabajo tras recargar el navegador y exportar un PDF. El proyecto de ejemplo y la plantilla descargable usan datos sintéticos.

| Flujo | Alcance de la versión inicial |
| --- | --- |
| Importación | Validación del archivo `.xlsx`, detección de encabezados, mapeo de portada y revisión de advertencias antes de crear el proyecto. |
| Ejecución | Tablero con búsqueda, filtros y progreso de ejecución y documentación. Editor de resultados, pasos y comentarios con guardado en el navegador. |
| Evidencias | Capturas desde el portapapeles, por arrastre o desde el selector de archivos. Miniaturas, descripciones, orden y asociación a pasos. |
| Entrega | Informe PDF con datos generales, autorización, índice, resultados, evidencias y escenarios pendientes. Respaldo `.tafproject` para recuperar una copia completa. |
| Continuidad | Uso sin conexión tras instalar los recursos en la primera carga. Solicitud de almacenamiento persistente y recordatorio de respaldo al acercarse a los 14 días. |

### Estado de la versión inicial

- Compilación de producción y 20 pruebas unitarias aprobadas. Las 3 pruebas de navegador pasaron en local y en Vercel. El Excel de referencia validó 27 columnas y 27 escenarios en local.
- Demo personal publicada en Vercel Hobby. El portal reúne los proyectos de TAF y abre el Documentador QA en su ruta propia. [Inicio TAF](https://elcoveg.com/TAF/) · [Documentador QA](https://elcoveg.com/TAF/Documentador-QA)
- Flujo sintético verificado con cero solicitudes que contuvieran el Excel, los datos del proyecto o las capturas. Los resultados y tiempos locales están en el [informe de entrega](ENTREGA.md).
- Pendiente de aceptación funcional por QA y presentación al director de automatizaciones.
- Pendiente de desarrollar el piloto en Pro y activar la configuración de GitHub Actions cuando se conceda el permiso `workflow`. [Configuración de CI](github-actions.yml)

## Solicitud de presupuesto

La demostración al director de automatizaciones debe recorrer la importación, el registro de un resultado con su captura y la entrega del PDF. La recuperación desde un respaldo muestra cómo cambia de equipo el proyecto o vuelve a estar disponible si se elimina el almacenamiento del navegador.

Para cuantificar el ahorro, medir el tiempo activo de documentación en Word y en TAF para ejecuciones comparables. Registrar la cantidad de escenarios, la cantidad de capturas y el tiempo empleado en preparar el informe. Comparar las medianas y reportar el tamaño de la muestra junto al resultado.

Presupuestar Vercel Pro con el número previsto de miembros del equipo y la transferencia estimada de los recursos estáticos. La arquitectura inicial carece de funciones, base de datos y almacenamiento de objetos en el alojamiento. [Precios de Vercel](https://vercel.com/pricing)

## Piloto corporativo

Con el presupuesto aprobado, desplegar en Vercel Pro y acordar los participantes, sus permisos de acceso y el alcance del piloto. Usar el dominio de Vercel o configurar un dominio propio cuando se defina el nombre. Si el dominio cambia, transferir los proyectos mediante sus respaldos porque el navegador guarda cada origen por separado.

Cerrar el piloto con los tiempos comparados, los resultados de recuperación desde respaldos y los fallos de compatibilidad o capacidad observados. Estos datos determinarán si se ajustan los límites de almacenamiento, se amplía la compatibilidad de Excel o se prioriza otra mejora.

## Seguimiento

La analítica, las donaciones y los pagos quedan fuera de la versión inicial. Cualquier ampliación posterior debe responder a una necesidad observada durante la demostración o el piloto.
