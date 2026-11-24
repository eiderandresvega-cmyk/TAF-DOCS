# Seguridad

La aplicación estática aplica una política de seguridad de contenido y procesa las entradas localmente. El importador admite `.xlsx`, verifica los límites del contenedor ZIP y analiza las hojas en un worker. Los valores de celdas se tratan como texto. El editor valida dimensiones y formatos de imagen antes de decodificar y vuelve a codificar los píxeles.

Los respaldos `.tafproject` verifican rutas, tamaños, versión, hashes SHA-256 y referencias internas. Los hashes detectan corrupción y no autentican al autor. IndexedDB mantiene las operaciones de creación, restauración, edición y eliminación en transacciones locales.

Para reportar una vulnerabilidad, usa la opción privada de seguridad del repositorio si está habilitada o contacta en privado con el responsable del proyecto. Incluye una descripción y datos sintéticos de ejemplo. Mantén los archivos de QA y las credenciales fuera del reporte público.
