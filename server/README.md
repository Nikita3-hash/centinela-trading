# Activación del servicio personal

La v0.5 añade la conexión y los avisos, pero **no activa cotizaciones recientes ni notificaciones mientras este servicio no esté desplegado y configurado**. El radar diario sigue funcionando en Pages. No hay operaciones bursátiles.

## Qué falta fuera del repositorio

1. El propietario debe darse de alta en una fuente de datos y aceptar sus condiciones. Esta implementación utiliza Finnhub para la lista de 17 símbolos estadounidenses. Comprobar en la cuenta el plan, la cobertura, los retrasos y las cuotas. Los planes personales de Finnhub no permiten redistribuir datos: el servicio exige un código privado y no expone cotizaciones en el sitio público ni guarda claves en GitHub. No publicar ni compartir ese código.
2. El propietario debe disponer de una cuenta de Cloudflare Workers, revisar sus límites y autorizar el despliegue. No se ha contratado ni activado ningún plan de pago. SQLite Durable Objects tiene modalidad gratuita, sujeta a límites. Configurar directamente los secretos en Cloudflare: no enviarlos al chat, no incluirlos en el código ni en capturas.
3. Desplegar el Worker de esta carpeta y conectar la app con su dirección y el código privado generado. En iPhone, abrir desde la pantalla de inicio y permitir los avisos. Enviar una prueba y confirmar que se recibe: el servidor no puede demostrar la recepción solo porque Apple acepte el envío.

## Instrucciones para desplegar

En esta carpeta, con Node y Wrangler oficiales:

```text
node generate-keys.mjs
npx wrangler deploy
```

El comando de generación escribe `.generated-secrets.json`, excluido de Git. No imprime valores. Antes de activar, configurar estos secretos en Cloudflare → Worker → Settings → Variables and Secrets, como tipo **Secret**:

- `FINNHUB_API_KEY`: clave del proveedor, introducida por el propietario directamente en Cloudflare.
- `API_ACCESS_TOKEN`: código aleatorio de `.generated-secrets.json`.
- `VAPID_PRIVATE_JWK`: clave privada de ese archivo.
- `VAPID_PUBLIC_KEY`: clave pública de ese archivo.

`APP_ORIGIN` y `VAPID_SUBJECT` ya están en la configuración para este Pages. El servicio no expone `FINNHUB_API_KEY`, la clave privada VAPID ni el código de conexión en ninguna respuesta. Si un secreto se filtra, rotarlo en Cloudflare; cambiar el código requiere reconectar los dispositivos.

El propietario introduce la dirección `https://…workers.dev` y **solo el código de conexión** en la sección «Conectar mi servicio de precios» de la app. No se introduce la clave de Finnhub ni ninguna contraseña de cuentas en la app.

## Comportamiento y límites comprobables

- Consulta del proveedor cada minuto mediante cron; también al abrir la app, con caché privada de 55 segundos y una sola descarga compartida entre solicitudes simultáneas.
- Sin garantía de exactitud ni de puntualidad del cron, del proveedor o del envío push. No se utiliza la expresión «tiempo real» como garantía: la app muestra la hora del proveedor y marca datos con más de 120 segundos como antiguos. Tampoco infiere que el mercado está abierto a partir del reloj.
- Una alerta se activa una sola vez al alcanzar el nivel, utilizando una cotización de como máximo 120 segundos y posterior a su creación. No se infiere que hubo un cruce entre dos precios no observados. Un proveedor con retraso puede impedir que salte una alerta; no se modifica la fecha para ocultarlo.
- Máximo 10 avisos activos y 5 dispositivos. Avisos globales de un único propietario; no es un servicio multiusuario. Las reglas se guardan en el servidor y el cron sigue funcionando con la app cerrada. Los secretos de conexión se guardan en IndexedDB del dispositivo; desconectar revoca su suscripción pero no borra las reglas globales.
- Cotizaciones, suscripciones y últimos 50 avisos se guardan en almacenamiento privado del servicio. El envío push vacío activa una notificación visible genérica; la app obtiene el detalle desde el servicio autenticado. No se almacenan precios intradía en el repositorio público. Suscripciones caducadas se retiran y envíos fallidos se reintentan en el siguiente ciclo; pueden existir duplicados en caso de reintento.
- La puntuación técnica del radar continúa calculándose con cierres diarios. Los precios recientes no cambian esa puntuación.
- Para iPhone, se necesita iOS 16.4 o posterior, app añadida a la pantalla de inicio y permiso concedido desde una acción del usuario. El servicio worker no almacena ni sirve cotizaciones antiguas fuera de línea.

## Pruebas y comprobación real pendiente

```text
node --test server/worker.test.mjs
```

Las pruebas usan respuestas simuladas y verifican privacidad, precios inválidos, fechas futuras, datos antiguos, fallo del proveedor, alertas únicas, caché y firma VAPID. No prueban la cobertura real del plan de Finnhub ni la recepción física en un iPhone. Tras activar: comparar símbolo, precio y timestamp contra la fuente autorizada; confirmar que una prueba llega al teléfono; configurar un nivel que se alcance durante la sesión y comprobar que se avisa una sola vez.

Fuentes oficiales:
- https://finnhub.io/docs/api/quote
- https://finnhub.io/terms-of-service
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
