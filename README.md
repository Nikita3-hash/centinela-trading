# Centinela v0.6

## Objetivo principal

Recibir avisos claros de compra y venta en el mercado financiero. Cada aviso debe tener un motivo comprensible y una hora visible. El usuario decide y realiza las operaciones por su cuenta.

## Estado actual

- Funcionan los avisos a niveles de precio elegidos por el usuario. No son recomendaciones automáticas de compra o venta.
- El servicio personal en Cloudflare consulta Finnhub cada minuto; la frecuencia no garantiza cotizaciones en tiempo real. El retraso durante la sesión aún debe comprobarse.
- La recepción de una notificación real en el iPhone fue confirmada por el usuario el 9 de octubre de 2026. El código privado, las claves del proveedor y las claves de notificaciones quedan fuera del repositorio.
- Las reglas para generar recomendaciones de compra y venta todavía deben definirse y validarse. El análisis diario de cuatro criterios sirve para revisar valores, no para afirmar que hay que comprar o vender.
- La interfaz separa Inicio, Valores, Avisos y Ajustes. Inicio muestra como máximo tres valores para revisar con datos recientes; las listas completas, indicadores y configuración se consultan cuando hacen falta.
- El capital de 1.000 EUR y el riesgo del 1% eran cifras fijas de la interfaz anterior, no datos confirmados del usuario; se han retirado.
- No se ejecutan operaciones ni se tiene acceso a Trade Republic.

Configuración y límites del servicio: [server/README.md](server/README.md).

## Qué hace
- GitHub Actions descarga cierres históricos diarios públicos desde Yahoo Finance chart, sin claves. Se excluye la sesión del día actual en Nueva York para evitar precios parciales.
- Analiza una **lista predefinida de 17 activos estadounidenses**, no todo el mercado. Las cotizaciones están en USD.
- Muestra puntuación de 0 a 4 basada en indicadores técnicos básicos. **No es una señal validada de compra**.
- Si el proveedor falla, no inventa cotizaciones. Muestra la fecha de los datos y advierte sobre datos antiguos.

## Instalación en el repositorio existente
1. Conserva la copia de seguridad v0.2.
2. Sube `index.html`, `scripts/update.py` y `.github/workflows/market-data.yml` manteniendo las rutas y reemplazando el `index.html` anterior.
3. En GitHub: Settings > Actions > General, revisa que las acciones estén habilitadas. El workflow declara los permisos para guardar el JSON y desplegar Pages. Para publicación con artefactos, configura Settings > Pages > Source: GitHub Actions.
4. Abre Actions > Actualizar datos de Centinela > Run workflow para generar la primera `market-data.json`. Comprueba el registro: si el proveedor rechaza la descarga, aparecerán errores y no se publicarán datos ficticios.
5. Comprueba que `market-data.json` aparezca en `main` y que termine el trabajo `deploy`. El workflow publica juntos el frontend y el JSON validado; los commits hechos con `GITHUB_TOKEN` no activan por sí solos una reconstrucción de Pages.
6. Abre tu dirección de Pages en Safari y recarga. Si la app añadida a inicio conserva una versión antigua, ciérrala y vuelve a abrirla.

## Advertencias
- La automatización también se ejecuta al modificar el frontend, los scripts o este workflow en `main`. Los commits de cotizaciones no generan bucles.
- Se requieren 55 sesiones, precios finitos positivos, volúmenes no negativos, fechas únicas ordenadas y último cierre de como máximo 7 días. El JSON se reemplaza de forma atómica tras validarlo.
- Si fallan todos los símbolos, el proceso termina con código 1 y no despliega ni sobrescribe el archivo anterior. Si falla solo una parte, publica los activos válidos y declara la cobertura y los errores en la página y el resumen de Actions.
- La página advierte si el cierre supera 5 días o el archivo lleva más de 48 horas sin actualizar. El botón Recargar datos lee el archivo publicado; no descarga cotizaciones nuevas.
- Pruebas: `python -m unittest discover -s scripts -p 'test_*.py' -v`; tras obtener datos, `python scripts/update.py --validate market-data.json` y `node scripts/test_frontend.cjs`.
- GitHub Actions programado **no garantiza puntualidad**, puede retrasarse o desactivarse por inactividad.
- Yahoo Finance es una fuente externa sin garantía de disponibilidad. Sus endpoints query1/query2 pueden cambiar, rechazar peticiones o dejar de servir símbolos; no son proveedores independientes.
- El dato es un cierre diario y puede estar retrasado; no es adecuado para alertas intradía de 15 minutos.
- La selección de 17 símbolos es inicial. El descubrimiento general de empresas y las noticias no están implementados. Los avisos push a niveles elegidos por el usuario están activos.
- No subir datos personales, credenciales, extractos privados ni claves API al repositorio público.
