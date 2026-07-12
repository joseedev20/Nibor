# Login privado con Cloudflare Access

Nibor.com contiene información financiera y de salud. La aplicación completa, incluida `/api/*`, debe permanecer privada.

## Decisión

- Cloudflare Access es el login de producción.
- Solo se autoriza el correo exacto del propietario; no se permiten dominios completos ni `Everyone`.
- El método inicial será One-time PIN: Cloudflare envía un código de un solo uso al correo autorizado.
- `workers.dev` y las Preview URLs están desactivadas en `wrangler.toml` para evitar accesos alternativos.
- El Worker no se despliega hasta confirmar expresamente que Access ya protege `nibor.com`.

Access valida cada solicitud antes de servir Vue o ejecutar la API. Una pantalla de login hecha únicamente en el frontend no sería una protección real porque un atacante podría llamar `/api/*` directamente.

## Configuración obligatoria antes del primer deploy

1. En Cloudflare, abrir **Zero Trust > Integrations > Identity providers**.
2. Agregar **One-time PIN** como método de identidad.
3. Abrir **Access controls > Applications** y crear una aplicación web/self-hosted para:
   - `nibor.com`
   - `www.nibor.com` solo si también se usará ese hostname.
4. Crear una política con:
   - Acción: `Allow`.
   - Include: `Emails` y el correo exacto del propietario.
   - Require: `Login Methods` → `One-time PIN`.
   - Duración sugerida de sesión: 24 horas.
5. No usar `Include Everyone`, `Emails ending in` ni `Login Methods` como única condición.
6. Crear/asociar el Custom Domain del Worker solamente después de guardar la política de Access.
7. Verificar en una ventana privada:
   - El correo autorizado recibe el PIN y entra.
   - Otro correo no recibe un PIN válido ni puede ver HTML, API o archivos.
   - Abrir directamente `https://nibor.com/api/health` también exige login.
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

No crear una política `Bypass` para `/api/events/calendar.ics`: el feed contiene eventos personales. Con Access protegiendo todo el dominio, la suscripción automática de iPhone puede requerir una solución posterior con URL secreta rotatoria. Hasta implementarla y probarla, se prioriza privacidad y el feed remoto permanece detrás del login.

## Referencias oficiales

- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Políticas de Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Cookie de autorización](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)
- [Cerrar sesión](https://developers.cloudflare.com/cloudflare-one/faq/authentication-faq/)
- [Desactivar workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
