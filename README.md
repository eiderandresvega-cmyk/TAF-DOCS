# TAF Docs

Aplicación para documentar pruebas QA desde el navegador. Importa un test script de Excel, registra el resultado de cada escenario, agrega capturas y genera un informe PDF. También permite empezar un proyecto manual o usar un proyecto sintético de ejemplo.

[Inicio TAF](https://elcoveg.com/TAF/) · [Documentador QA](https://elcoveg.com/TAF/Documentador-QA)

## Ejecutar y verificar

Requiere Node.js 24 y npm.

```bash
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

El comando de producción genera `dist/`. La primera carga de esa versión instala el service worker y guarda los recursos necesarios para usar TAF sin conexión. Las pruebas de navegador usan la compilación de producción.

## Flujo de demostración

1. Abre el proyecto de ejemplo o descarga la plantilla Excel e impórtala desde **Con Test Scripts**.
2. Abre un escenario y pega una captura sintética con Ctrl+V o Cmd+V. También puedes arrastrar un PNG, JPEG o WebP, o seleccionarlo desde el equipo.
3. Registra el estado y el resultado obtenido. En el tablero puedes buscar por ID, título o componente y filtrar por estado o prioridad.
4. Descarga el PDF. Incluye portada, resultados, evidencias ordenadas y escenarios pendientes.
5. Exporta una copia `.tafproject` y recupérala desde **Importar copia**. El formato incluye una versión e integridad SHA-256.

## Datos y almacenamiento

IndexedDB almacena proyectos, escenarios y capturas comprimidas en transacciones locales. Cada navegador admite hasta tres proyectos. El indicador de respaldo aparece al acercarse a los 14 días y los datos se conservan hasta que el usuario los borre o el navegador los elimine. Las copias permiten recuperar un proyecto en otro navegador u otro equipo.

Consulta [PRIVACY.md](PRIVACY.md) para conocer el tratamiento de los datos y [SECURITY.md](SECURITY.md) para los controles de importación y exportación.

## Despliegue

`vercel.json` define el sitio estático Vite y sus cabeceras de seguridad. No requiere variables de entorno. Para la demostración personal no comercial, usa un proyecto de Vercel Hobby con el dominio `*.vercel.app` y datos sintéticos. Para empezar un piloto corporativo en Vercel, migra a Pro. [Vercel Hobby](https://vercel.com/docs/plans/hobby)

El dominio ElCoVeg redirige temporalmente `/` a `/TAF/`. La Home se genera desde `portal.html` y su catálogo se amplía en `src/portal/TafHome.tsx`. El Documentador se sirve en `/TAF/Documentador-QA`. Para mover proyectos guardados en el [dominio anterior](https://taf-docs.vercel.app/), exporta un `.tafproject` allí e impórtalo en ElCoVeg.

## Licencia

MIT. Consulta [LICENSE](LICENSE).

## Documentación del proyecto

Consulta el [roadmap](docs/ROADMAP.md), las [decisiones técnicas](docs/DECISIONES.md) y el [informe de entrega y pruebas de aceptación](docs/ENTREGA.md).
