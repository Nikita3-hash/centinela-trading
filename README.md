# Centinela Trading v0.3 beta

Prototipo educativo para iPhone (GitHub Pages). **No ejecuta operaciones, no tiene acceso a Trade Republic y no solicita contraseñas.**

## Qué hace
- Un proceso programado de GitHub Actions descarga cierres históricos diarios públicos desde Stooq.
- Analiza una **lista predefinida de 17 activos estadounidenses**, no todo el mercado. Las cotizaciones están en USD.
- Muestra puntuación de 0 a 4 basada en indicadores técnicos básicos. **No es una señal validada de compra**.
- Si el proveedor falla, no inventa cotizaciones. Muestra la fecha de los datos y advierte sobre datos antiguos.

## Instalación en el repositorio existente
1. Conserva la copia de seguridad v0.2.
2. Sube `index.html`, `scripts/update.py` y `.github/workflows/market-data.yml` manteniendo las rutas y reemplazando el `index.html` anterior.
3. En GitHub: Settings > Actions > General, revisa que las acciones estén habilitadas y que `GITHUB_TOKEN` tenga permiso para escribir contenido si tu configuración lo requiere.
4. Abre Actions > Actualizar datos de Centinela > Run workflow para generar la primera `market-data.json`. Comprueba el registro: si el proveedor rechaza la descarga, aparecerán errores y no se publicarán datos ficticios.
5. Comprueba que el archivo `market-data.json` aparezca en la rama `main`. GitHub Pages lo servirá junto con `index.html`.
6. Abre tu dirección de Pages en Safari y recarga. Si la app añadida a inicio conserva una versión antigua, ciérrala y vuelve a abrirla.

## Advertencias
- GitHub Actions programado **no garantiza puntualidad**, puede retrasarse o desactivarse por inactividad.
- Stooq es una fuente externa y puede cambiar su formato, rechazar peticiones o dejar de servir símbolos.
- El dato es un cierre diario y puede estar retrasado; no es adecuado para alertas intradía de 15 minutos.
- La selección de 17 símbolos es inicial. El descubrimiento general de empresas, las noticias y las alertas push no están implementados.
- No subir datos personales, credenciales, extractos privados ni claves API al repositorio público.
