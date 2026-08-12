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

## Esquema recomendado del Atajo

1. **Generar UUID**.
2. Pedir monto, descripción y categoría.
3. **Obtener contenido de URL**:
   - Método: `POST`.
   - URL: `expenses_url`.
   - Cuerpo: JSON con los campos anteriores.
4. Mostrar `data.text` como confirmación.

No registrar el token en notas, logs ni variables compartidas de iCloud.
