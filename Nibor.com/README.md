# Nibor Finanzas

Dashboard personal de finanzas con Vue 3, Vite, Tailwind, ECharts, Cloudflare Workers y D1.

## Desarrollo local

```powershell
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

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
npm run build
npm run smoke
```

## Primer despliegue en Cloudflare

Hacer una sola vez:

```powershell
npx wrangler login
npx wrangler d1 create nibor-finanzas
```

Copiar el `database_id` que devuelve Cloudflare y reemplazarlo en `wrangler.toml`.

Aplicar esquema y datos históricos remotos:

```powershell
npm run db:migrate:remote
npm run db:seed:remote
```

Desplegar Worker + assets de Vite:

```powershell
npm run deploy
```

## Notas de datos

- D1 remoto es la fuente de verdad en producción.
- Los históricos Ene-Jun 2026 están en `scripts/seed_historicos.sql`.
- `saldo_final = NULL` significa mes pendiente.
- Ganancia, rentabilidad y totales calculados viven en el backend.
