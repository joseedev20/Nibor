# Registrar gastos desde Atajos de iPhone

La API usa una ruta pública exacta protegida por `EXPENSES_SHORTCUT_TOKEN`. El
token es independiente de Widgy/Hábitos y nunca debe copiarse en documentación,
capturas o chats.

## Obtener la URL privada

Con una sesión válida de Cloudflare Access, abrir:

```text
https://niborapp.com/api/widget/url
```

El campo `data.expenses_url` contiene la URL completa. Esa ruta detrás de Access
es el único lugar donde se entrega el token.

## Consultar categorías

Una solicitud `GET` a `expenses_url` devuelve:

```json
{
  "success": true,
  "data": {
    "categorias": [
      { "id": 1, "nombre": "Mercado", "icono": "🛒", "color": null }
    ],
    "categorias_nombres": ["Mercado"]
  }
}
```

`categorias_nombres` está preparada para la acción **Elegir de la lista**.

## Registrar el gasto

Enviar `POST` a la misma `expenses_url`, con `Content-Type: application/json`:

```json
{
  "monto": 25000,
  "descripcion": "Almuerzo",
  "categoria": "Mercado",
  "fecha": "2026-07-28",
  "request_id": "UUID-generado-por-el-atajo"
}
```

- `monto`: obligatorio y mayor a cero.
- `descripcion`: obligatoria, máximo 200 caracteres.
- `categoria` o `categoria_id`: obligatorio; debe ser una categoría de gasto.
- `fecha`: opcional; si se omite usa el día actual en `America/Bogota`.
- `request_id`: obligatorio. En Atajos se genera una vez con **Generar UUID**.

La respuesta creada usa status `201`. Si el Atajo reintenta exactamente el
mismo `request_id`, responde `200`, `duplicado: true` y devuelve el movimiento
original sin insertar otro. Reutilizar el UUID con datos distintos responde
`409 IDEMPOTENCY_CONFLICT`.

## Captura automática desde notificaciones de Bancolombia

Para transferencias salientes, el Atajo puede mandar el texto crudo de la
notificación en vez de monto y descripción. Enviar `POST` a `expenses_url`
con:

```json
{
  "mensaje": "Bancolombia: Transferiste $20,000.00 desde tu cuenta 5702 a la cuenta *3104772928 el 12/08/2026 a las 18:07. ¿Dudas? Llamanos al 018000931987. Estamos cerca.",
  "categoria": "Transferencias"
}
```

- El backend detecta el monto buscando `<verbo> $<monto>` dentro de
  `mensaje`, con estos verbos reconocidos: `transferiste`, `pagaste`,
  `retiraste`, `compraste` (lista en `OUTGOING_MONEY_VERBS` en
  `server/routes/widgetExpenses.js`, fácil de ampliar). Si no encuentra
  ninguno, responde `400 BAD_REQUEST`. A propósito **no** incluye verbos de
  dinero entrante (`recibiste`, `consignaron`...) porque este endpoint solo
  crea gastos.
- Si no se manda `descripcion`, se usa el **mensaje completo**, recortando
  solo el relleno final ("¿Dudas? Llamanos...", "Con Bre-b es de una y
  gratis...") — se conserva todo hasta la hora de la transacción. Así no
  importa si el mensaje es una transferencia a cuenta o a llave Bre-B con
  nombre: siempre queda el texto completo, sin adivinar qué parte extraer.
- **No mandes `descripcion` en el body si quieres que se arme sola** — si
  la mandas (aunque sea un texto viejo dejado de pruebas), esa siempre gana
  sobre lo detectado en `mensaje`.
- **`request_id` es opcional cuando mandas `mensaje`.** Si no lo mandas, el
  backend calcula uno solo con un hash del texto completo del mensaje. Como
  el mensaje de Bancolombia trae la hora exacta al minuto, dos pagos reales
  del mismo monto el mismo día no chocan entre sí; si el mismo mensaje llega
  dos veces (reintento del Atajo), da el mismo hash y no se duplica. No hace
  falta el paso de generar UUID/GUID en Atajos para este flujo.
- `categoria`/`categoria_id` y `fecha` funcionan igual que siempre;
  `categoria`/`categoria_id` sigue siendo obligatorio.

### Automatización sin tocar el teléfono

En la app **Atajos** → pestaña **Automatización** → **+** → **Notificación
recibida** → app **Bancolombia** → sin necesidad de confirmar cada vez:

1. **Notificación recibida** (dispara al llegar cualquier notificación de
   Bancolombia).
2. **Obtener texto de la notificación** (o "Contenido de texto enriquecido").
3. **Diccionario**: solo dos campos — `mensaje` = texto del paso 2,
   `categoria` = texto fijo `Transferencias`. Sin `request_id`, el backend
   lo genera solo (ver arriba).
4. **Obtener contenido de URL** → `POST` → `expenses_url` → Cuerpo JSON con
   el Diccionario del paso 3.
5. Desactivar "Preguntar antes de ejecutar" en la automatización para que
   corra en segundo plano sin abrir Atajos.

Como no todas las notificaciones de Bancolombia son transferencias (puede
llegar una de clave dinámica, promoción, etc.), el paso 4 puede fallar con
`400 BAD_REQUEST` en esos casos — es esperado, no rompe nada, simplemente
esa notificación no genera un gasto.

## Esquema recomendado del Atajo

1. **Generar UUID**.
2. Pedir monto, descripción y categoría.
3. **Obtener contenido de URL**:
   - Método: `POST`.
   - URL: `expenses_url`.
   - Cuerpo: JSON con los campos anteriores.
4. Mostrar `data.text` como confirmación.

No registrar el token en notas, logs ni variables compartidas de iCloud.
