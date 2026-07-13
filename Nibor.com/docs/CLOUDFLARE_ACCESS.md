# Login privado con Cloudflare Access

Nibor.com contiene información financiera y de salud. La aplicación completa, incluida `/api/*`, debe permanecer privada.

## Decisión

- Cloudflare Access es el login de producción.
- Solo se autorizan correos exactos de los propietarios; no se permiten dominios completos ni `Everyone`.
- El método inicial será One-time PIN: Cloudflare envía un código de un solo uso al correo autorizado.
- `workers.dev` y las Preview URLs están desactivadas en `wrangler.toml` para evitar accesos alternativos.
- El Worker no se despliega hasta confirmar expresamente que Access ya protege `niborapp.com`.

Access valida cada solicitud antes de servir Vue o ejecutar la API. Una pantalla de login hecha únicamente en el frontend no sería una protección real porque un atacante podría llamar `/api/*` directamente.

## Configuración obligatoria antes del primer deploy

1. En Cloudflare, abrir **Zero Trust > Integrations > Identity providers**.
2. Agregar **One-time PIN** como método de identidad.
3. Abrir **Access controls > Applications** y crear una aplicación web/self-hosted para:
   - `niborapp.com`
   - `www.niborapp.com` solo si también se usará ese hostname.
4. Crear una política con:
   - Acción: `Allow`.
   - Include: `Emails` y cada correo exacto autorizado.
   - Require: `Login Methods` → `One-time PIN`.
   - Duración de sesión: 1 semana.
5. No usar `Include Everyone`, `Emails ending in` ni `Login Methods` como única condición.
6. Crear/asociar el Custom Domain del Worker solamente después de guardar la política de Access.
7. Verificar en una ventana privada:
   - Los correos autorizados son `Joseedev20@gmail.com` y `joseeborja20@hotmail.com`; cada uno recibe el PIN y entra.
   - Otro correo no recibe un PIN válido ni puede ver HTML, API o archivos.
   - Abrir directamente `https://niborapp.com/api/health` también exige login.
8. Confirmar el deploy en PowerShell y desplegar:

```powershell
$env:NIBOR_ACCESS_CONFIRMED='1'
npm run deploy
```

La confirmación dura solo para esa terminal. Sin ella, `npm run deploy` falla de forma segura.

## Cerrar sesión

En producción, el menú lateral muestra `Cerrar sesión`, que apunta a:

```text
/cdn-cgi/access/logout
```

Cloudflare elimina la sesión y vuelve a exigir autenticación.

## iCalendar

La suscripción automática del celular usa una URL con token rotatorio guardado como secreto `CALENDAR_FEED_TOKEN` en el Worker. La ruta autenticada `/api/events/calendar-url` entrega esa URL únicamente dentro de Nibor.

Cloudflare Access puede tener una aplicación adicional para la ruta exacta `/api/events/calendar.ics` con política `Bypass` para `Everyone`. El bypass solo evita el login OTP en esa ruta; el Worker exige el token correcto y devuelve 404 si falta o es inválido. No ampliar el bypass a `/api/events/*` ni guardar el token en Git. Si la URL se comparte accidentalmente, rotar el secreto y volver a suscribir el calendario.

## Referencias oficiales

- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Políticas de Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Cookie de autorización](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)
- [Cerrar sesión](https://developers.cloudflare.com/cloudflare-one/faq/authentication-faq/)
- [Desactivar workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
