# TAF Docs

Aplicación para documentar pruebas QA desde el navegador. Importa un test script de Excel, registra el resultado de cada escenario, agrega capturas y genera un informe PDF. También permite empezar un proyecto manual o usar un proyecto sintético de ejemplo.

El importador admite la plantilla estándar de 15 columnas y la plantilla ampliada de 27. En la estándar, la primera línea de **Objetivo** se usa como título cuando el archivo no incluye la columna **Escenario**.

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
2. Registra el estado del escenario. Al marcar **Passed**, el resultado esperado y el comentario de éxito completan los campos vacíos. Puedes editar ambos textos.
3. Pega, arrastra o selecciona capturas. Los pasos numerados del Excel aparecen como pasos editables. Las nuevas capturas se asocian al siguiente paso libre y reciben una descripción editable.
4. Usa **Compartir documentación** para vincular un paso o un escenario completo a uno o varios destinos. El PDF incluye esa evidencia en cada destino e identifica de dónde viene.
5. Descarga el PDF y exporta una copia `.tafproject`. La copia conserva capturas y vínculos y se recupera desde **Importar copia**.

## Datos y almacenamiento

IndexedDB almacena proyectos, escenarios y capturas comprimidas en transacciones locales. Cada navegador admite hasta tres proyectos. El indicador de respaldo aparece al acercarse a los 14 días y los datos se conservan hasta que el usuario los borre o el navegador los elimine. Las copias permiten recuperar un proyecto en otro navegador u otro equipo.

Consulta [PRIVACY.md](PRIVACY.md) para conocer el tratamiento de los datos y [SECURITY.md](SECURITY.md) para los controles de importación y exportación.

## Despliegue

`vercel.json` define el sitio estático Vite y sus cabeceras de seguridad. No requiere variables de entorno. Para la demostración personal no comercial, usa un proyecto de Vercel Hobby con el dominio `*.vercel.app` y datos sintéticos. Para empezar un piloto corporativo en Vercel, migra a Pro. [Vercel Hobby](https://vercel.com/docs/plans/hobby)

El dominio ElCoVeg redirige temporalmente `/` a `/TAF/`. La Home se genera desde `portal.html` y su catálogo se amplía en `src/portal/TafHome.tsx`. El Documentador se sirve en `/TAF/Documentador-QA`. Para mover proyectos guardados en el [dominio anterior](https://taf-docs.vercel.app/), exporta un `.tafproject` allí e impórtalo en ElCoVeg.

La navegación consulta la versión publicada cuando hay conexión y usa la copia local al trabajar sin red. Si una instalación anterior sigue mostrando una versión desactualizada, usa [Actualizar TAF Docs](https://elcoveg.com/TAF/Actualizar) para activar la versión publicada y conservar los proyectos del navegador.

## Licencia

MIT. Consulta [LICENSE](LICENSE).

## Documentación del proyecto

Consulta el [roadmap](docs/ROADMAP.md), las [decisiones técnicas](docs/DECISIONES.md) y el [informe de entrega y pruebas de aceptación](docs/ENTREGA.md).
