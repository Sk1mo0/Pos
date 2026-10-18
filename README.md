# CarritoControl — frontend demo

Prototipo local inspirado en la navegación por categorías de Rappi y Uber Eats, adaptado a un punto de venta. Sin dependencias de JavaScript ni instalación. El alcance actual es exclusivamente frontend, según la solicitud; no se implementaron todavía Next.js, PostgreSQL, Prisma, autenticación ni pagos reales del plan completo.

## Arranque

Desde este directorio:

```sh
cd frontend
python3 -m http.server 5173 --bind 127.0.0.1
```

Abrir http://127.0.0.1:5173. También puedes ejecutar `bun run dev` desde `frontend` si tienes Bun y Python 3 instalados. Se requiere navegador moderno. Las fuentes de Google son opcionales: sin red se usan fuentes del sistema.

## Seed y recorrido

`frontend/seed.js` contiene dos negocios ficticios y 16 productos. Se carga automáticamente en la primera visita; no requiere comando ni base de datos. Ventas, caja y pedidos se guardan en localStorage por navegador. «Reiniciar demo» permite volver al estado inicial después de confirmarlo.

1. En Caja, abrir turno con $500 de fondo.
2. En Vender, agregar tacos, seleccionar extras y escribir notas.
3. Ajustar cantidades, seleccionar Mostrador o Para llevar y cobrar en efectivo. Introducir el importe recibido; se calcula el cambio.
4. Consultar e imprimir el ticket; también está disponible en Historial.
5. Realizar otra venta con Digital simulado. Probar rechazo o vencimiento y reintentar: el pedido se conserva.
6. Revisar Reportes y exportar CSV. Cerrar caja introduciendo el efectivo contado y un motivo si hay diferencia.
7. Cambiar al segundo negocio desde el selector superior para probar su catálogo y caja independientes.

Los reportes incluyen todas las ventas demo del negocio seleccionado, sin filtro de fechas. Efectivo esperado = fondo inicial + ventas en efectivo del turno. Los pagos digitales y externos no suman efectivo. Los reportes no representan utilidad ni impuestos.

## Límites y verificación

No hay servidor de negocio: precios, roles y datos locales son manipulables. No hay aislamiento de seguridad, login, CRUD, gastos, movimientos manuales, integración bancaria ni validación de permisos. El pago externo es una confirmación manual y el digital es exclusivamente simulado. No usar con operaciones reales. La seed es frontend; no acredita la seed PostgreSQL exigida en el plan.

La validación sintáctica se ejecuta con `node --check frontend/app.js` y `node --check frontend/seed.js`. La interfaz incluye adaptación a móvil y escritorio. Consultar PLAN_CODEX.md para pendientes de la implementación completa.
