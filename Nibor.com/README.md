# Nibor Finanzas

Dashboard personal de finanzas con Vue 3, Vite, Tailwind, ECharts, Cloudflare Workers y D1.

## Desarrollo local

```powershell
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

También puedes usar el arranque rápido de Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar-nibor.ps1
```

Ese script instala dependencias si faltan, aplica migraciones locales pendientes, levanta la app y abre `http://localhost:5173/` cuando ya está lista.

Abrir:

```text
http://localhost:5173/
```

La API local corre en:

```text
http://localhost:8787/api
```

No abrir `index.html` directamente desde el explorador: Vite necesita servir los módulos del frontend y Wrangler necesita levantar la API local.

## Verificación

```powershell
npm test
npm run build
npm run smoke
```

`npm run smoke` crea una D1 y un R2 temporales, ejecuta las migraciones y elimina el entorno al terminar. Nunca usa la D1 personal. `npm run smoke:local` queda disponible solo para diagnóstico explícito contra un Worker ya levantado.

## Primer despliegue en Cloudflare

Antes de publicar, configurar el login privado siguiendo [`docs/CLOUDFLARE_ACCESS.md`](docs/CLOUDFLARE_ACCESS.md). El proyecto desactiva `workers.dev` y las Preview URLs para no dejar una URL pública alternativa.

Hacer una sola vez:

```powershell
npx wrangler login
npx wrangler d1 create nibor-finanzas
npx wrangler r2 bucket create nibor-files
```

Copiar el `database_id` que devuelve Cloudflare y reemplazarlo en `wrangler.toml`.
El bucket `nibor-files` queda conectado al binding `FILES` para PDFs de Vehículos.

Aplicar esquema remoto. Para migrar una D1 local existente, exportar sus datos con `wrangler d1 export --local --no-schema` e importarlos en la D1 remota después de aplicar las migraciones; no usar el seed histórico como reemplazo de datos personales:

```powershell
npm run db:migrate:remote
```

Desplegar Worker + assets de Vite:

```powershell
$env:NIBOR_ACCESS_CONFIRMED='1'
npm run deploy
```

Sin esa confirmación, el deploy queda bloqueado. La variable no sustituye la configuración real: primero se debe comprobar en Cloudflare que solo el correo autorizado puede iniciar sesión.

## Notificaciones push con Pushover

1. Crear cuenta en [pushover.net](https://pushover.net/).
2. Copiar el `User Key` del home de Pushover.
3. Crear una Application en Pushover y copiar su `API Token`.
4. En Nibor, abrir `/notificaciones`, pegar `User Key` y `API Token`, activar push y usar `Enviar prueba`.

Las notificaciones in-app funcionan sin Pushover. En `/notificaciones` puedes activar push por regla, elegir prioridad/sonido, definir horario de silencio, pausar temporalmente la entrega y agrupar novedades en resumen diario. También puedes abrir la campana de configuración dentro de Hábitos, Vehículos, Eventos y Suscripciones para ajustar solo ese módulo. Hábitos soporta múltiples franjas por días, por ejemplo L-V mañana/tarde y S-D todo el día. En producción, Cloudflare ejecuta el motor cada 15 minutos y el backend decide si corresponde avisar según la regla de cada módulo.

## Notas de datos

- D1 remoto es la fuente de verdad en producción.
- R2 `nibor-files` guarda PDFs adjuntos de Vehículos; D1 solo guarda metadatos del archivo.
- Los históricos Ene-Jun 2026 están en `scripts/seed_historicos.sql`.
- `saldo_final = NULL` significa mes pendiente.
- Ganancia, rentabilidad y totales calculados viven en el backend.
