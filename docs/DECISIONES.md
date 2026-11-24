# Decisiones técnicas de TAF Docs

## Aplicación estática

TAF Docs usa React, TypeScript y Vite para compilar una aplicación de una sola página. El servidor entrega HTML, JavaScript, CSS y recursos públicos. Las rutas usan el fragmento de la URL para que el proyecto funcione en alojamiento estático sin reglas de redirección.

Un service worker generado al compilar conserva los recursos de cada versión, incluidos los módulos de importación y exportación. La aplicación puede usarse sin conexión después de la primera instalación exitosa. La configuración de Vercel aplica una política de seguridad de contenido que limita los recursos al origen de TAF y permite imágenes desde objetos locales del navegador.

## Proyectos y evidencias

Dexie administra IndexedDB. Los proyectos, escenarios y evidencias se agrupan en tablas relacionadas. Los archivos optimizados y sus miniaturas se guardan como `Blob` en la misma base de datos para que las operaciones de creación, restauración y eliminación puedan completarse en una sola transacción. Esta implementación evita coordinar escrituras entre IndexedDB y un segundo almacén de archivos.

Se admiten tres proyectos por origen y perfil del navegador. El editor guarda los cambios localmente y muestra su estado. El usuario puede solicitar persistencia al navegador y el recordatorio de respaldo aparece al acercarse a los 14 días. La conservación depende del espacio disponible y de las decisiones del usuario y del navegador.

## Importación de Excel

SheetJS Community Edition lee `.xlsx` en un Web Worker. El importador verifica los límites del contenedor ZIP antes de analizar las hojas y localiza el encabezado de `Escenarios` por sus columnas. La información de `Portada` se usa para completar los datos generales, que pueden ajustarse en la revisión previa a crear el proyecto. Los valores de Excel se muestran como texto y los datos de los escenarios se guardan en el modelo local.

## Capturas

El editor admite JPEG, PNG y WebP estáticos. Verifica el formato y el tamaño antes de decodificar la imagen, reduce sus dimensiones y guarda una versión JPEG optimizada y una miniatura. El navegador realiza el procesamiento en un worker cuando dispone de las interfaces necesarias y recurre al hilo principal cuando corresponde. La recodificación elimina los metadatos del archivo original.

## Exportación PDF

jsPDF genera el informe en el navegador. El formato carta sigue la estructura general de la referencia Word con identidad visual de TAF, datos generales, autorización, tabla de escenarios y evidencias con resultados esperados y obtenidos. El PDF conserva el orden de las capturas y usa orientación horizontal para las más anchas. Los escenarios incompletos llevan la indicación de documentación pendiente.

La ejecución y la documentación se calculan por separado. Un escenario cuenta como ejecutado al llegar a un estado terminal. Cuenta como documentado si también registra el resultado esperado, el obtenido y una captura cuando la evidencia es obligatoria.

## Respaldo portable

`fflate` empaqueta el proyecto en un ZIP con extensión `.tafproject`. El manifiesto versionado registra las huellas SHA-256 de los archivos de contenido. La restauración comprueba rutas, tamaño, formato, integridad y relaciones entre registros antes de escribir el proyecto. Los identificadores internos se regeneran al restaurar una copia.

Cada copia admite hasta 192 MiB, 5.000 escenarios y 4.000 capturas con sus miniaturas. Se admiten hasta 25 MiB por entrada y hasta 1 MiB para el manifiesto. La capacidad local del navegador puede superar el límite de una copia portable. Los hashes verifican integridad del contenido y la copia debe recibir el mismo tratamiento de confidencialidad que sus capturas y resultados.

## Despliegue y datos de uso

GitHub aloja el código y Vercel entrega la compilación estática. Hobby se reserva para la demostración personal no comercial con datos sintéticos. El piloto corporativo está previsto en Vercel Pro. El dominio `*.vercel.app` permite arrancar sin configurar Cloudflare. El acceso a Cloudflare solo será necesario si se elige un dominio cuya zona DNS se administra allí. [Vercel Hobby](https://vercel.com/docs/plans/hobby)

Excel, capturas, comentarios, resultados y archivos exportados permanecen en el navegador o en las descargas del usuario. La analítica, la telemetría, las donaciones y los pagos quedan fuera del alcance inicial. El proveedor de alojamiento puede registrar las solicitudes de los recursos estáticos. [Privacidad](../PRIVACY.md)
