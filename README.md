# Centinela v0.8

## Consulta de activos y plan personal

La pantalla principal permite consultar un activo por nombre o símbolo y ver una ficha calculada sin IA: cierre en USD, fecha, cambio de cinco sesiones, media de veinte sesiones y volumen. Los cálculos se recomputan a partir del historial validado; se rechazan archivos de más de 48 horas, cierres de más de cinco días, fechas duplicadas, sesiones sin completar y precios o volúmenes inválidos. La cobertura diaria incorpora MP Materials (18 activos). Los avisos privados siguen limitados a sus 17 valores originales.

El plan de aportaciones, plazo y pérdida aceptable solo se guarda en este dispositivo mediante una acción explícita. Puede borrarse. No se envía al servidor ni al modelo y todavía no personaliza el análisis. El comparador de escenarios y los avisos anteriores siguen disponibles.

**La conversación con IA está preparada en código, pero pendiente de configurar, desplegar y verificar en Cloudflare.** No se ha activado un servicio de pago ni se ha probado una respuesta real de un modelo. Las pruebas de IA utilizan respuestas simuladas. No hay noticias o resultados empresariales conectados, conversión EUR/USD verificada, seguimiento de operaciones simuladas ni estrategia rentable demostrada. La primera versión ofrece consultas independientes, sin memoria conversacional.

El usuario ha elegido buscar una opción sin coste. La conexión opcional se ha adaptado a Cloudflare Workers AI y un modelo fijo compatible con su cupo gratuito: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. No necesita clave de OpenAI. Antes de activarla se debe comprobar en la cuenta el plan Workers Free: su cuota diaria limita el consumo y no se debe contratar Workers Paid. El código exige verificar el plan gratuito y activar expresamente el asistente; ambos valores están desactivados por defecto. El límite inicial preparado es de cinco consultas al día (configurable entre 1 y 10). El cupo de Cloudflare se comparte con otros usos de la cuenta y puede agotarse antes.

Las reservas se realizan en una transacción antes de llamar al modelo y también cuentan los intentos fallidos; máximo una solicitud cada diez segundos, sin reintentos automáticos y salida limitada a 1.000 tokens. Una espera agotada no garantiza cancelar la inferencia en el proveedor y consume el cupo de intento. No hay sustitución automática por servicios de pago. La pregunta y los datos de mercado se envían a Cloudflare solo al pulsar el botón correspondiente; no se registra el texto en el servicio de Centinela. El texto generado se trata como texto, nunca HTML. Las pruebas usan un modelo simulado; falta desplegar, comprobar el plan y probar una respuesta real.

Fuentes de la opción gratuita: [precios](https://developers.cloudflare.com/workers-ai/platform/pricing/), [modelo](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/) y [modo JSON](https://developers.cloudflare.com/workers-ai/features/json-mode/).

## Objetivo principal

Recibir avisos claros de compra y venta en el mercado financiero. Cada aviso debe tener un motivo comprensible y una hora visible. El usuario decide y realiza las operaciones por su cuenta.

## Herramienta para operaciones de pocos días

El usuario quiere estudiar operaciones que se mantengan unos días. La herramienta experimental selecciona hasta tres valores de la lista actual con cambio positivo en cinco sesiones, cierre sobre la media de veinte sesiones y volumen medio de las últimas cinco sesiones al menos un 20% superior al de las veinte sesiones anteriores. Se ordenan por aumento de volumen, no por rentabilidad prevista. Si no se cumplen las condiciones no se muestra una oportunidad forzada.

La herramienta usa cierres diarios, descarta fechas de más de cinco días y archivos de más de 48 horas. No envía avisos automáticos de compra o venta ni constituye una estrategia de rentabilidad validada. El cambio diario absoluto medio es descriptivo, no una previsión.

El comparador calcula dos escenarios hipotéticos en EUR (subida y bajada), descontando gastos totales introducidos por el usuario. El importe excluye dichos gastos, se supone cambio de divisa constante y no se calculan impuestos. Las entradas no se guardan ni se envían. Las reglas, el cálculo, la ausencia de volumen y los datos antiguos tienen comprobaciones automáticas.

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
- Analiza una **lista predefinida de 18 activos estadounidenses**, no todo el mercado. Las cotizaciones están en USD.
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
- La selección de 18 símbolos es inicial. El descubrimiento general de empresas y las noticias no están implementados. Los avisos push a niveles elegidos por el usuario están activos.
- No subir datos personales, credenciales, extractos privados ni claves API al repositorio público.

