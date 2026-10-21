'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { ErrorAlert } from './ui-feedback';
import { usePos } from './pos-context';
import { businesses, money, type Sale } from './pos-data';
import { paymentRequest } from './mercado-pago-client';
type Order = { id: string; total: number; checkoutUrl: string | null; createdAt: string; expiresAt: string };
type Status = { configured: boolean; connected: boolean; authorized: boolean; sellerId?: string; orders: Order[] };
export function MercadoPagoManager() {
  const { state } = usePos();
  return <PaymentAccount key={state.business} />;
}
function PaymentAccount() {
  const { state, acceptPayment } = usePos();
  const business = state.business;
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let active = true, running = false;
    const returned = new URL(window.location.href).searchParams;
    const orderId = returned.get('business') === business ? returned.get('order') : null;
    async function sync() {
      if (running || document.hidden) return;
      running = true;
      try {
        const response = await fetch(`/api/mercadopago/status?business=${business}`, { cache: 'no-store' });
        const next: Status & { error?: string } = await response.json();
        if (!response.ok) throw new Error(next.error);
        if (!active) return;
        setStatus(next);
        if (next.authorized) {
          const ids = new Set([...next.orders.map(order => order.id), ...(orderId ? [orderId] : [])]);
          for (const id of ids) {
            if (seen.current.has(id)) continue;
            const result = await paymentRequest<{ order: { status: string }; sale: Sale | null }>('verify', business, { id });
            if (!active) return;
            if (result.sale) {
              seen.current.add(id);
              await acceptPayment(result.sale);
              setNotice(`Pago confirmado · Ticket ${result.sale.number} · ${money(result.sale.total)}`);
              setStatus(current => current && ({ ...current, orders: current.orders.filter(order => order.id !== id) }));
            } else if (result.order.status === 'expired') {
              seen.current.add(id);
              setNotice('El enlace venció sin un pago aprobado. Tu pedido se conserva para volver a cobrar.');
              setStatus(current => current && ({ ...current, orders: current.orders.filter(order => order.id !== id) }));
            }
          }
        }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : 'No se pudo consultar el pago.'); }
      finally { running = false; }
    }
    const initial = setTimeout(() => {
    if (returned.get('mp') === 'cancelled') setNotice('Cancelaste la conexión. Puedes volver a intentarlo.');
    if (returned.get('mp') === 'connected') setNotice('Cuenta conectada. Ya puedes cobrar con Mercado Pago.');
    if (returned.get('mp') === 'error') setError('No se pudo conectar la cuenta. Usa la cuenta ya vinculada y vuelve a iniciar la conexión.');
      void sync();
    }, 0);
    const timer = setInterval(() => void sync(), 8000);
    return () => { active = false; clearTimeout(initial); clearInterval(timer); };
  }, [business, acceptPayment]);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/mercadopago/connect?business=${business}`, { method: 'POST', body: new FormData(event.currentTarget) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'); setBusy(false); }
  }
  return <section>
    <h1>Pagos</h1>
    <p>Recibe los cobros de {businesses[business]} en tu cuenta de Mercado Pago.</p>
    <Card className="my-6 p-6">
      <h2>Mercado Pago</h2>
      {!status ? <p>Cargando conexión…</p> : !status.configured ? <p>Un administrador debe configurar Mercado Pago antes de conectar tu cuenta.</p> : status.authorized ? <>
        <p>Cuenta vinculada: {status.sellerId}. La sesión está activa en este navegador.</p>
        <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await paymentRequest('logout', business, {}); setStatus({ ...status, authorized: false, orders: [] }); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cerrar sesión.'); } finally { setBusy(false); } }}>Cerrar sesión</Button>
        <p className="mt-3">Cerrar sesión conserva la cuenta vinculada y los cobros pendientes.</p>
      </> : <>
        <p>{status.connected ? 'Inicia sesión con la cuenta de Mercado Pago vinculada para cobrar y consultar pagos.' : 'Conecta la cuenta del propietario para recibir los pagos de este negocio.'}</p>
        <form className="mt-4 grid gap-3" onSubmit={connect}>
          <Label htmlFor="mp-setup">Clave de administración del POS</Label>
          <Input id="mp-setup" name="setupKey" type="password" required autoComplete="current-password" disabled={busy} />
          <Button type="submit" disabled={busy}>{busy ? 'Abriendo Mercado Pago…' : status.connected ? 'Iniciar sesión con Mercado Pago' : 'Conectar Mercado Pago'}</Button>
        </form>
        <p className="mt-3">Ingresarás tus credenciales de Mercado Pago en su sitio oficial. La vinculación se conserva para este negocio.</p>
      </>}
    </Card>
    {status?.authorized && <Card className="my-6 p-6"><h2>Cobros pendientes</h2>
      <p>Se consultan automáticamente cada 8 segundos. El ticket se genera al confirmar el pago. Los enlaces duran 30 minutos; los pagos en procesamiento deben resolverse antes del cierre de caja.</p>
      {!status.orders.length && <p>No tienes cobros pendientes.</p>}
      {status.orders.map(order => <div key={order.id} className="mt-5 grid gap-3 border-t pt-4">
        <b>{money(order.total)}</b><p>Creado: {new Date(order.createdAt).toLocaleString('es-MX')}</p>
        {order.checkoutUrl ? <a className={buttonVariants({ variant: 'outline' })} href={order.checkoutUrl} target="_blank" rel="noopener noreferrer">Abrir enlace de pago</a> : <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await paymentRequest('discard', business, { id: order.id }); setStatus({ ...status, orders: status.orders.filter(o => o.id !== order.id) }); } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo descartar.'); } finally { setBusy(false); } }}>Descartar cobro sin enlace</Button>}
        <p>Tu pedido se conserva hasta confirmar el pago.</p>
      </div>)}
    </Card>}
    {notice && <p role="status">{notice}</p>}<ErrorAlert message={error} />
  </section>;
}
