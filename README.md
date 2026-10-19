# CarritoControl

Punto de venta con Next.js App Router, React, TypeScript, Tailwind CSS y Prisma/PostgreSQL. Usar Bun y conservar `bun.lock` como único lockfile.

## Arranque

Configurar `.env` con `DATABASE_URL="postgresql://usuario:contraseña@servidor/base?sslmode=require"`. La conexión se usa exclusivamente en el servidor.

```sh
bun install
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev
```

El seed agrega los dos negocios y los 16 productos iniciales sin sobrescribir registros existentes. Ejecutarlo nuevamente vuelve a crear los productos iniciales que se hayan eliminado.

## Subpáginas

- `/venta`: catálogo de venta, pedido, extras, cobro y ticket.
- `/catalogo`: crear, consultar, editar y eliminar productos por negocio.
- `/historial`: consultar tickets, editar notas y referencias, eliminar ventas del turno abierto.
- `/caja`: abrir turno, editar fondo, eliminar turnos sin ventas, cerrar y consultar arqueos.
- `/reportes`: importes, pedidos, ticket promedio, métodos de pago y exportación CSV.

La navegación conserva el pedido. Solamente el borrador del pedido y el negocio seleccionado se guardan en localStorage (`carrito-local-v2-draft`). Productos, ventas y turnos se guardan en PostgreSQL. Los registros de la demo anterior no se importan automáticamente.

## Reglas

En el catálogo se selecciona **Por unidad** o **Por gramaje**. El precio corresponde a una unidad o a 1 kg, respectivamente. Al vender se indica la cantidad de unidades o el peso en gramos enteros (mínimo 1 g). El carrito permite ajustar el gramaje y el ticket conserva la modalidad, cantidad y precio originales. Los productos existentes siguen por unidad hasta que se editen.

Los importes se almacenan en centavos. Para gramaje se calcula `precio por kg × gramos / 1000`, redondeando cada renglón a centavos antes de sumar. Los extras se cobran con la misma base del producto. El servidor consulta los precios, valida extras y cantidades, calcula total y cambio y asigna folios únicos por negocio. Las operaciones de un negocio se serializan mediante una transacción y bloqueo de fila para evitar carreras entre cobro y cierre. Reintentar el mismo identificador de venta no duplica el registro.

Los tickets conservan los productos y precios vendidos aunque el catálogo cambie. Una venta de turno abierto permite editar nota y referencia o eliminarse; sus importes y productos no son editables después de cobrar. Los turnos cerrados y sus ventas quedan protegidos. Un turno con ventas no se puede eliminar. El cierre calcula el efectivo esperado en el servidor y exige motivo cuando existe diferencia.

El pago digital sigue siendo simulado y el externo se confirma manualmente. Los tickets no son comprobantes fiscales. No hay autenticación ni roles; esta aplicación todavía requiere ese control antes de exponerse a usuarios externos.

## API

`GET /api/state` carga catálogo, ventas y turnos. `/api/products`, `/api/sales` y `/api/shifts` admiten GET y POST; sus rutas `/:id` admiten GET, PATCH y DELETE. GET recibe `?business=tacos` o `?business=tienda`; las escrituras reciben `business` en JSON. Las validaciones y restricciones también se aplican al acceso directo a la API.

## Verificación

```sh
bun run check
bun run lint
bun run build
bun run start
bun test tests/pricing.test.ts
bun run test:integration
```

La prueba de integración usa la base configurada y crea registros temporales que limpia por identificador al finalizar. Comprueba CRUD, aislamiento entre negocios, rechazo de importes inválidos, cálculo de cambio, idempotencia y protección de cierres. Si la tienda tiene un turno abierto, omite las pruebas de ventas y caja para preservar ese turno. Los folios consumidos en la prueba no se reutilizan.

`prisma/schema.prisma` define los modelos y `prisma/migrations` conserva el esquema versionado. `app/point-of-sale.tsx` contiene el contenedor compartido y cobro; `app/pos-context.tsx` comparte estado; `app/pos-pages.tsx` y `app/managers.tsx` contienen vistas y formularios; `lib/pos-api.ts` implementa las operaciones de servidor.
