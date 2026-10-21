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
- `/pagos`: conectar la cuenta de Mercado Pago del negocio, iniciar/cerrar sesión y recuperar cobros pendientes.
- `/reportes`: importes, pedidos, ticket promedio, métodos de pago y exportación CSV.

La navegación conserva el pedido. Solamente el borrador del pedido y el negocio seleccionado se guardan en localStorage (`carrito-local-v2-draft`). Productos, ventas y turnos se guardan en PostgreSQL. Los registros de la demo anterior no se importan automáticamente.

## Reglas

En el catálogo se selecciona **Por unidad** o **Por gramaje**. El precio corresponde a una unidad o a 1 kg, respectivamente. Al vender se indica la cantidad de unidades o el peso en gramos enteros (mínimo 1 g). El carrito permite ajustar el gramaje y el ticket conserva la modalidad, cantidad y precio originales. Los productos existentes siguen por unidad hasta que se editen.

Los importes se almacenan en centavos. Para gramaje se calcula `precio por kg × gramos / 1000`, redondeando cada renglón a centavos antes de sumar. Los extras se cobran con la misma base del producto. El servidor consulta los precios, valida extras y cantidades, calcula total y cambio y asigna folios únicos por negocio. Las operaciones de un negocio se serializan mediante una transacción y bloqueo de fila para evitar carreras entre cobro y cierre. Reintentar el mismo identificador de venta no duplica el registro.

Los tickets conservan los productos y precios vendidos aunque el catálogo cambie. Una venta de turno abierto permite editar nota y referencia o eliminarse; sus importes y productos no son editables después de cobrar. Los turnos cerrados y sus ventas quedan protegidos. Un turno con ventas no se puede eliminar. El cierre calcula el efectivo esperado en el servidor y exige motivo cuando existe diferencia.

Mercado Pago usa OAuth y Checkout Pro; el pago externo se confirma manualmente. Los tickets no son comprobantes fiscales. La sesión de Mercado Pago protege la vinculación y los cobros digitales; el resto del POS aún no tiene autenticación ni roles; esta aplicación todavía requiere ese control antes de exponerse a usuarios externos.

## API

`GET /api/state` carga catálogo, ventas y turnos. `/api/products`, `/api/sales` y `/api/shifts` admiten GET y POST; sus rutas `/:id` admiten GET, PATCH y DELETE. GET recibe `?business=tacos` o `?business=tienda`; las escrituras reciben `business` en JSON. Las validaciones y restricciones también se aplican al acceso directo a la API.

## Verificación

```sh
bun run check
bun run lint
bun run build
bun run start
bun test tests/pricing.test.ts
bun test tests/mercado-pago.test.js
bun run test:integration
```

La prueba de integración usa la base configurada y crea registros temporales que limpia por identificador al finalizar. Comprueba CRUD, aislamiento entre negocios, rechazo de importes inválidos, cálculo de cambio, idempotencia y protección de cierres. Si la tienda tiene un turno abierto, omite las pruebas de ventas y caja para preservar ese turno. Los folios consumidos en la prueba no se reutilizan.

`prisma/schema.prisma` define los modelos y `prisma/migrations` conserva el esquema versionado. `app/point-of-sale.tsx` contiene el contenedor compartido y cobro; `app/pos-context.tsx` comparte estado; `app/pos-pages.tsx` y `app/managers.tsx` contienen vistas y formularios; `lib/pos-api.ts` implementa las operaciones de servidor.

## Mercado Pago

1. Ejecutar `bun run db:migrate` y `bun run db:generate`.
2. Crear una aplicación en Mercado Pago Developers y habilitar OAuth con PKCE. Registrar exactamente `https://TU-DOMINIO/api/mercadopago/callback` como Redirect URI.
3. Configurar las variables de `.env.example`. `APP_URL` es el origen público HTTPS, sin rutas; para desarrollo usar un túnel HTTPS hacia el servidor local. Las cookies de sesión requieren HTTPS.
4. Configurar notificaciones **payment** en `https://TU-DOMINIO/api/mercadopago/webhook` y copiar su clave de firma en `MP_WEBHOOK_SECRET`.
5. Entrar a **Pagos**, seleccionar el negocio, ingresar la clave de administración del POS (`MP_SETUP_KEY`) y conectar la cuenta en el sitio oficial de Mercado Pago. No se solicita la contraseña de Mercado Pago en el POS. Cada negocio conserva su vendedor; volver a iniciar sesión exige esa misma cuenta. Cambiar de vendedor requiere una operación administrativa fuera de esta interfaz.
6. Abrir caja, agregar productos, seleccionar **Mercado Pago** y completar Checkout Pro. El comprador puede abrir el enlace desde **Pagos** en su dispositivo. El retorno conduce a Pagos y verifica el cobro. También se procesan webhooks sin tener el navegador abierto.

`MP_CLIENT_ID` y `MP_CLIENT_SECRET` son las credenciales de **la aplicación**, no el token de un vendedor. Los access/refresh tokens se obtienen por OAuth, se renuevan en el servidor y se almacenan cifrados con AES-256-GCM. Generar `MP_ENCRYPTION_KEY` con `bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'`; conservarla respaldada y estable: cambiarla invalida tokens y sesiones existentes. Elegir una clave aleatoria de administración de al menos 16 caracteres. Nunca usar variables `NEXT_PUBLIC_` para estos secretos. La sesión dura 24 horas; cerrar sesión no revoca la autorización del proveedor.

Para probar, usar las cuentas de prueba y credenciales apropiadas de Mercado Pago, con `MP_TEST_MODE=true`. En producción establecer `false`; solo se aceptan pagos cuyo `live_mode` coincida con el entorno. Verificar el ciclo real con vendedor y comprador de prueba distintos antes de aceptar dinero real.

El servidor conserva un pedido inmutable, recalcula importes desde el catálogo y solo genera una venta tras consultar la API de Mercado Pago y comprobar aprobación, referencia, vendedor, MXN e importe. Una notificación o retorno por sí solos no acreditan el cobro. Las confirmaciones repetidas generan un solo ticket. Los pagos digitales no se pueden registrar por `/api/sales`, borrar ni cambiar de referencia desde el historial. Los reembolsos y contracargos se administran en Mercado Pago; este POS todavía no los concilia contablemente.

Por ahora se admite **un cobro pendiente por negocio** y se bloquean otras ventas y el cierre/eliminación del turno hasta resolverlo. El enlace vence a los 30 minutos; Pagos libera el pedido después de un minuto adicional si la API no informa pagos en procesamiento. Un rechazo es un intento fallido: se conserva el enlace para reintentar hasta vencer. Si falló la creación antes de guardar un enlace, puede descartarse desde Pagos. No se vacía un pedido que haya cambiado después de iniciar el pago. El historial conserva el ticket aunque se cierre el navegador; la recuperación de un borrador requiere el mismo navegador.

La clave administrativa protege la conexión de las cuentas y las sesiones protegen los endpoints de Mercado Pago. **Esto no incorpora un sistema de usuarios/roles a las otras APIs del POS**: deben protegerse antes de ofrecer la aplicación públicamente.

Documentación: [OAuth](https://www.mercadopago.com.mx/developers/en/docs/security/oauth/introduction), [Checkout Pro](https://www.mercadopago.com.mx/developers/en/reference/online-payments/checkout-pro-preferences/overview).
