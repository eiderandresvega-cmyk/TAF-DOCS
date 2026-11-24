# Entrega del MVP de TAF Docs

El 24 de noviembre de 2026 se publicó la demo personal de TAF Docs en Vercel Hobby. [Abrir el Documentador QA](https://elcoveg.com/TAF/Documentador-QA)

## Alcance funcional

- Proyectos manuales, desde Excel o desde el ejemplo sintético. Cada navegador admite tres proyectos locales.
- Importación `.xlsx` con detección de encabezados, formatos de 15 y 27 columnas y revisión editable de los datos de portada. El número de escenarios depende de las filas del archivo, hasta 5.000.
- Tablero con búsqueda, filtros, vistas de tarjetas y lista, y métricas independientes de ejecución y documentación.
- Editor de escenarios con pasos, resultados, comentarios y capturas por portapapeles, arrastre o selector. Las capturas se optimizan, permiten descripción y se ordenan por escenario.
- Persistencia local, funcionamiento sin conexión después de la primera carga, exportación PDF y copia portable `.tafproject` con verificación de integridad.

El PDF toma de la plantilla Word el formato carta y la estructura de portada, autorización, resumen de escenarios y evidencias de ejecución. La interfaz usa la paleta oscura y cian de la referencia visual y una marca propia de TAF Docs. Los ejemplos de la aplicación contienen datos sintéticos.

## Resultados de verificación

| Comprobación | Resultado |
| --- | --- |
| TypeScript y compilación de producción | Compilación correcta con generación de recursos sin conexión. |
| Pruebas unitarias | 26 aprobadas. Cubren los dos formatos de Excel, archivos sintéticos de 10, 27 y 1.000 escenarios, progreso, imágenes, PDF y respaldos. |
| Pruebas E2E en Chromium | 7 aprobadas en la compilación local. Cubren la actualización desde una caché anterior con otra pestaña abierta, importación y guardado de 1.000 escenarios del formato estándar, portal, capturas, persistencia, PDF, respaldo y modo sin conexión. |
| Archivos de referencia en Chromium local | La plantilla estándar importó 15 escenarios con encabezados en la fila 2, fecha de portada y cero advertencias. La plantilla ampliada importó 27 escenarios con encabezados en la fila 5 y cero advertencias. |
| Excel estándar en Brave local | 15 escenarios, fecha de portada verificada, creación del proyecto y pasos disponibles. Cero advertencias y cero solicitudes con datos del Excel. |
| PDF sintético | Cinco páginas revisadas visualmente, incluida una captura ancha en página horizontal. |
| Dependencias | `npm audit` reportó 0 vulnerabilidades conocidas. |
| Seguridad funcional | Se verificaron el rechazo de archivos inválidos y respaldos alterados, el tratamiento de HTML introducido como texto y la política CSP. Las pruebas observaron cero solicitudes con el contenido del proyecto y cero solicitudes a otros orígenes. |
| Vercel Hobby | Se verificaron la URL pública, las descargas PDF y `.tafproject` con el ejemplo sintético, las cabeceras y la activación del service worker. |

## Rendimiento

Medición local de la compilación de producción en Chromium, Apple M2, sin emulación de red. Se hicieron tres cargas iniciales con perfiles limpios y una prueba con un Excel sintético de 1.000 escenarios.

| Operación | Tiempo observado |
| --- | --- |
| Pantalla inicial lista | 62 ms de media |
| Validar Excel sintético | 221 ms |
| Guardar y mostrar 1.000 escenarios | 220 ms |
| Recargar el proyecto desde el navegador | 152 ms |
| Filtrar por identificador | 114 ms |

En esta medición el navegador transfirió unos 126 kB para mostrar la página inicial y registró aproximadamente 608 kB de respuestas, incluida la precarga de recursos para trabajar sin conexión. La recarga del proyecto se sirvió desde el dispositivo. Son tiempos de una máquina local y pueden variar por red y equipo.

## Aceptación funcional

1. Abre la demo en un perfil de navegador con almacenamiento disponible. En **Con Test Scripts**, importa la plantilla Excel descargable. Comprueba que se reconocen las columnas y revisa los datos de la portada. Para validar compatibilidad con el Excel de referencia, ejecuta la app en local y repite con ese archivo.
2. Crea el proyecto y abre un escenario. Completa el resultado esperado y el obtenido. Cambia el estado a **Passed** y comprueba que una captura requerida deja documentación pendiente hasta adjuntarla.
3. Pega una captura sintética con Ctrl+V o Cmd+V. Adjunta otra con el selector, añade una descripción y cambia el orden. Al ver **Guardado localmente**, recarga y verifica resultados, pasos, comentarios y capturas.
4. Regresa a **Escenarios**. Cambia entre tarjetas y lista, busca por ID, filtra por estado y comprueba las métricas.
5. Exporta el PDF y abre la descarga. Revisa portada, autorización, resultados esperados y obtenidos, capturas en el orden elegido, y la indicación de documentación pendiente en los demás escenarios.
6. Exporta una **Copia de respaldo**. Desde **Mis proyectos**, restaura la copia y verifica que se abre como proyecto independiente. Después de la primera carga del sitio, desconecta la red y recarga un escenario para comprobar que sigue disponible.
7. Para validar permisos locales, elimina únicamente el proyecto de prueba desde **Ajustes** después de exportar su copia. Comprueba que puedes volver a importarlo.

## Reproducir la verificación

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Para probar el Excel de referencia en local, ejecuta `npm run preview`, abre la dirección mostrada, selecciona **Documentador QA** y carga el archivo desde el navegador. Usa la compilación de producción para verificar el modo sin conexión.

Para repetir la medición sintética, deja `npm run preview` en ejecución y usa `npm run test:performance -- http://127.0.0.1:4173/TAF/Documentador-QA 1000 3` desde otra terminal. El comando devuelve los tiempos, cabeceras y solicitudes observadas en JSON.

## Límites conocidos

- Las pruebas ejecutadas no dejaron defectos abiertos en el flujo principal. La aceptación funcional queda a cargo de QA.
- Los proyectos pertenecen al origen, perfil y equipo del navegador. Una copia portable permite migrarlos. Borrar los datos del sitio elimina la copia local.
- Las copias portables admiten archivos de hasta 192 MiB y 4.000 capturas. La interfaz informa si el respaldo supera los límites.
- El PDF usa una fuente integrada con cobertura de español y otras lenguas de alfabeto latino. El MVP se verificó en Chromium.
- Vercel Hobby se utiliza para la demo personal no comercial. Un piloto corporativo en Vercel requiere Pro. [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- El despliegue se realizó mediante la CLI de Vercel. Para activar despliegues automáticos, el equipo de Vercel debe conectar GitHub como método de acceso.
- La configuración de CI está lista y su activación en el repositorio requiere el permiso `workflow` de GitHub. [Configuración de GitHub Actions](github-actions.yml)
