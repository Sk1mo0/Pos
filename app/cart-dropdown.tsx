'use client';

import { ChevronDown, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cartCount, itemTotal, priceUnit, quantityLabel, quantityLimit } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { OrderSkeleton } from './pos-skeletons';
import { cartTotal, money, type Shop } from './pos-data';

type Props = {
  shop: Shop;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loaded: boolean;
  busy: boolean;
  onChange: (shop: Shop) => void;
  onCheckout: () => void;
};

export function CartDropdown({ shop, open, onOpenChange, loaded, busy, onChange, onCheckout }: Props) {
  const count = cartCount(shop.cart);
  const total = cartTotal(shop.cart);
  function quantity(index: number, qty: number) {
    const item = shop.cart[index];
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > quantityLimit(item.unit)) return;
    onChange({ ...shop, cart: shop.cart.map((item, i) => i === index ? { ...item, qty } : item) });
  }
  function remove(index: number) {
    onChange({ ...shop, cart: shop.cart.filter((_, i) => i !== index) });
  }
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger render={<Button variant="outline" className="relative h-11 gap-2 rounded-xl px-3" />} aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}>
      <ShoppingCart className="size-5" aria-hidden="true" />
      <span className="hidden text-xs font-semibold sm:inline">{money(total)}</span>
      <ChevronDown className="size-3.5 transition-transform motion-reduce:transition-none" style={{ transform: open ? 'rotate(180deg)' : undefined }} aria-hidden="true" />
      {count > 0 && <Badge aria-hidden="true" className="absolute -top-2 -right-2 h-5 min-w-5 justify-center px-1 text-[10px]">{count > 99 ? '99+' : count}</Badge>}
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={12} className="cart-dropdown w-[min(390px,calc(100vw-24px))] gap-4 rounded-2xl p-5 shadow-xl motion-reduce:animate-none" aria-busy={!loaded}>
      {!loaded ? <OrderSkeleton /> : <>
        <div className="flex items-start justify-between gap-3">
          <PopoverHeader><PopoverTitle className="text-lg font-bold">Tu carrito</PopoverTitle><PopoverDescription className="text-xs">{count} {count === 1 ? 'producto' : 'productos'} · Pedido actual</PopoverDescription></PopoverHeader>
          <div className="flex gap-1"><Button variant="ghost" size="icon" disabled={busy || !count} aria-label="Vaciar carrito" onClick={() => onChange({ ...shop, cart: [] })}><Trash2 /></Button><Button variant="ghost" size="icon" aria-label="Cerrar carrito" onClick={() => onOpenChange(false)}><X /></Button></div>
        </div>
        <ButtonGroup aria-label="Modalidad del pedido" className="w-full">
          {['Mostrador', 'Para llevar'].map(mode => <Button key={mode} className="h-9 flex-1" variant={shop.mode === mode ? 'secondary' : 'outline'} aria-pressed={shop.mode === mode} disabled={busy} onClick={() => onChange({ ...shop, mode })}>{mode}</Button>)}
        </ButtonGroup>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {shop.cart.length ? <ul className="divide-y divide-border">{shop.cart.map((item, index) => <li key={index} className="flex gap-3 py-4 first:pt-0 last:pb-0">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl" aria-hidden="true">{item.emoji}</span>
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{item.name}</p><span className="shrink-0 text-sm font-semibold">{money(itemTotal(item))}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{quantityLabel(item)} · {money(item.price)} / {priceUnit(item.unit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.extras.join(', ') || 'Sin extras'}</p>{item.note && <p className="mt-1 text-xs break-words text-muted-foreground">{item.note}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                {item.unit === 'weight' ? <div className="flex items-center gap-2"><Input className="h-9 w-24" type="number" min="1" max={quantityLimit(item.unit)} step="1" disabled={busy} aria-label={`Gramaje en gramos de ${item.name}`} key={`${index}-${item.qty}`} defaultValue={item.qty} onBlur={event => { quantity(index, Number(event.target.value)); event.target.value = String(shop.cart[index].qty); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span className="text-xs">g</span></div> :
                <ButtonGroup aria-label={`Cantidad de ${item.name}`}><Button variant="outline" size="icon" disabled={busy} aria-label={`Quitar una unidad de ${item.name}`} onClick={() => item.qty === 1 ? remove(index) : quantity(index, item.qty - 1)}><Minus /></Button><span className="flex min-w-9 items-center justify-center border-y border-border px-2 text-xs" aria-live="polite">{item.qty}</span><Button variant="outline" size="icon" disabled={busy || item.qty >= quantityLimit(item.unit)} aria-label={`Añadir una unidad de ${item.name}`} onClick={() => quantity(index, item.qty + 1)}><Plus /></Button></ButtonGroup>}
                <Button variant="ghost" size="icon" disabled={busy} aria-label={`Eliminar ${item.name} del carrito`} onClick={() => remove(index)}><Trash2 /></Button>
              </div>
            </div>
          </li>)}</ul> : <Empty className="px-4 py-9"><EmptyHeader><EmptyMedia><ShoppingCart className="size-10 text-muted-foreground/60" aria-hidden="true" /></EmptyMedia><EmptyTitle>Tu carrito está vacío</EmptyTitle><EmptyDescription>Agrega productos del catálogo para comenzar tu pedido.</EmptyDescription></EmptyHeader></Empty>}
        </div>
        <div className="space-y-2"><Label htmlFor="order-note">Nota del pedido</Label><Textarea id="order-note" placeholder="Sin cebolla, salsa aparte…" maxLength={500} disabled={busy} value={shop.note} onChange={event => onChange({ ...shop, note: event.target.value })} /></div>
        <Separator />
        <div className="space-y-3"><div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal (incluye extras)</span><span>{money(total)}</span></div><div className="flex justify-between text-lg font-bold"><span>Total</span><span>{money(total)}</span></div></div>
        <Button className="h-11 w-full rounded-xl" disabled={busy || !shop.cart.length} onClick={() => { onOpenChange(false); onCheckout(); }}>{shop.shift ? `Cobrar pedido · ${money(total)}` : 'Abrir caja para cobrar'}</Button>
        <p className="text-center text-xs text-muted-foreground">{shop.shift ? 'Turno abierto · Listo para vender' : 'Abre la caja antes de registrar ventas'}</p>
      </>}
    </PopoverContent>
  </Popover>;
}
