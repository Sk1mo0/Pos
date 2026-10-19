'use client';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { priceUnit, type SaleUnit } from '@/lib/pricing';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { ErrorAlert, DeleteConfirmation } from './ui-feedback';

import { useState, type FormEvent } from 'react';
import { usePos } from './pos-context';
import { money, type Product, type Sale } from './pos-data';

function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No se pudo guardar el cambio.'; }
export function CatalogManager() {
  const { state, filtered, mutate, busy } = usePos();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState<SaleUnit>('unit');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      await mutate('products', editing === 'new' ? 'POST' : 'PATCH', { name: form.get('name'), description: form.get('description'), price: Math.round(Number(form.get('price')) * 100), unit, category: form.get('category'), emoji: form.get('emoji') }, editing && editing !== 'new' ? editing.id : undefined);
      setEditing(null);
    } catch (error) { setError(errorMessage(error)); }
  }
  const product = editing && editing !== 'new' ? editing : null;
  return <section key={state.business}>
    <Button className="h-auto px-5 py-3.5" size="lg" onClick={() => { setEditing('new'); setUnit('unit'); setError(''); }}>+ Nuevo producto</Button>
    {editing && <Card className="panel gap-0"><form className="editor" key={product?.id || 'new'} onSubmit={save}>
      <h2>{product ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div className="form-field"><Label htmlFor="edit-name">Nombre</Label><Input id="edit-name" name="name" required maxLength={500} defaultValue={product?.name} /></div>
      <div className="form-field"><Label htmlFor="edit-description">Descripción</Label><Textarea id="edit-description" name="description" maxLength={500} defaultValue={product?.description} /></div>
      <div className="form-field"><Label htmlFor="edit-unit">Modalidad de venta</Label><NativeSelect id="edit-unit" value={unit} onChange={event => setUnit(event.target.value as SaleUnit)}><NativeSelectOption value="unit">Por unidad</NativeSelectOption><NativeSelectOption value="weight">Por gramaje</NativeSelectOption></NativeSelect></div>
      <div className="form-field"><Label htmlFor="edit-price">Precio por {priceUnit(unit)} (MXN)</Label><Input id="edit-price" name="price" type="number" required min="0" max="1000000" step="0.01" defaultValue={product ? product.price / 100 : ''} />{unit === 'weight' && <small>Precio de 1 kg (1,000 g). El cobro se calcula con los gramos vendidos.</small>}</div>
      <div className="form-field"><Label htmlFor="edit-category">Categoría</Label><Input id="edit-category" name="category" required maxLength={500} defaultValue={product?.category} /></div>
      <div className="form-field"><Label htmlFor="edit-emoji">Emoji</Label><Input id="edit-emoji" name="emoji" required maxLength={16} defaultValue={product?.emoji || '📦'} /></div>
      <div className="actions"><Button type="submit" className="h-auto px-5 py-3.5" size="lg" disabled={busy}>Guardar producto</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button></div>
    </form></Card>}
    <ErrorAlert message={deleting ? '' : error} />
    <div className="table-wrap"><Table><TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Categoría</TableHead><TableHead>Precio</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>
      {filtered.map(p => <TableRow key={p.id}><TableCell>{p.emoji} {p.name}<small>{p.description}</small></TableCell><TableCell>{p.category}</TableCell><TableCell>{money(p.price)} / {priceUnit(p.unit)}</TableCell><TableCell><div className="actions"><Button variant="outline" disabled={busy} onClick={() => { setEditing(p); setUnit(p.unit); setError(''); }}>Editar</Button><Button variant="outline" disabled={busy} onClick={() => { setDeleting(p); setError(''); }}>Eliminar</Button></div></TableCell></TableRow>)}
      {!filtered.length && <TableRow><TableCell colSpan={4}>No hay productos. Agrega uno para comenzar.</TableCell></TableRow>}
    </TableBody></Table></div>
    {deleting && <DeleteConfirmation open onOpenChange={open => { if (!open) setDeleting(null); }} busy={busy} error={error} description={`¿Eliminar ${deleting.name}? Las ventas anteriores conservarán su detalle.`} onConfirm={async () => { try { await mutate('products', 'DELETE', {}, deleting.id); setDeleting(null); if (editing !== 'new' && editing?.id === deleting.id) setEditing(null); } catch (error) { setError(errorMessage(error)); } }} />}
  </section>;
}

export function SaleManager() {
  const { shop, mutate, busy, setModal } = usePos();
  const [editing, setEditing] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState<Sale | null>(null);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const form = new FormData(event.currentTarget);
    try { await mutate('sales', 'PATCH', { note: form.get('note'), reference: form.get('reference') }, editing.id); setEditing(null); setError(''); } catch (error) { setError(errorMessage(error)); }
  }
  return <>
    <ErrorAlert message={deleting ? '' : error} />
    {editing && <Card className="panel gap-0"><form className="editor" key={editing.id} onSubmit={save}><h2>Editar venta #{editing.number}</h2><div className="form-field"><Label htmlFor="edit-note">Nota</Label><Textarea id="edit-note" name="note" maxLength={500} defaultValue={editing.note} /></div><div className="form-field"><Label htmlFor="edit-reference">Referencia</Label><Input id="edit-reference" name="reference" maxLength={500} defaultValue={editing.reference} /></div><div className="actions"><Button type="submit" className="h-auto px-5 py-3.5" size="lg" disabled={busy}>Guardar cambios</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button></div></form></Card>}
    {deleting && <DeleteConfirmation open onOpenChange={open => { if (!open) setDeleting(null); }} busy={busy} error={error} description={`¿Eliminar la venta #${deleting.number} por ${money(deleting.total)}? Se actualizarán los reportes y el efectivo esperado de caja.`} onConfirm={async () => { try { await mutate('sales', 'DELETE', {}, deleting.id); setDeleting(null); setError(''); } catch (error) { setError(errorMessage(error)); } }} />}
    <div className="table-wrap"><Table><TableHeader><TableRow>{['Pedido', 'Fecha', 'Método', 'Total', 'Acciones'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
      {[...shop.sales].reverse().map(sale => <TableRow key={sale.id}><TableCell>#{sale.number}</TableCell><TableCell>{new Date(sale.date).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</TableCell><TableCell>{sale.method}</TableCell><TableCell>{money(sale.total)}</TableCell><TableCell><div className="actions"><Button variant="outline" onClick={() => setModal({ kind: 'ticket', sale })}>Ver ticket</Button>{sale.shift === shop.shift?.id && <><Button variant="outline" disabled={busy} onClick={() => setEditing(sale)}>Editar</Button><Button variant="outline" disabled={busy} onClick={() => { setDeleting(sale); setError(''); }}>Eliminar</Button></>}</div></TableCell></TableRow>)}
      {!shop.sales.length && <TableRow><TableCell colSpan={5}>Aún no hay ventas registradas.</TableCell></TableRow>}
    </TableBody></Table></div><small>Las ventas de turnos cerrados se conservan para mantener el historial de caja.</small>
  </>;
}

export function ShiftManager() {
  const { state, shop, mutate, busy } = usePos();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const shifts = state.closedShifts.filter(s => s.business === state.business);
  return <>
    {shop.shift && <Card className="panel"><h2>Administrar turno activo</h2><p>Abierto: {new Date(shop.shift.opened).toLocaleString('es-MX')}</p><div className="actions"><Button variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>Editar fondo inicial</Button><Button variant="outline" disabled={busy || shop.sales.some(s => s.shift === shop.shift?.id)} onClick={() => { setDeleting(true); setError(''); }}>Eliminar turno sin ventas</Button></div>
      {editing && <form className="editor" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await mutate('shifts', 'PATCH', { fund: Math.round(Number(form.get('fund')) * 100) }, shop.shift!.id); setEditing(false); setError(''); } catch (error) { setError(errorMessage(error)); } }}><div className="form-field"><Label htmlFor="edit-fund">Fondo inicial (MXN)</Label><Input type="number" id="edit-fund" name="fund" required min="0" step="0.01" defaultValue={shop.shift.fund / 100} /></div><Button type="submit" className="h-auto px-5 py-3.5" size="lg" disabled={busy}>Guardar fondo</Button></form>}
      {deleting && <DeleteConfirmation open onOpenChange={setDeleting} busy={busy} error={error} description="¿Eliminar el turno activo sin ventas?" onConfirm={async () => { try { await mutate('shifts', 'DELETE', {}, shop.shift!.id); setDeleting(false); setError(''); } catch (error) { setError(errorMessage(error)); } }} />}
    </Card>}
    <ErrorAlert message={deleting ? '' : error} /><h2>Cierres de caja</h2><div className="table-wrap"><Table><TableHeader><TableRow><TableHead>Cierre</TableHead><TableHead>Esperado</TableHead><TableHead>Contado</TableHead><TableHead>Diferencia</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader><TableBody>{[...shifts].reverse().map(s => <TableRow key={s.id}><TableCell>{new Date(s.closed).toLocaleString('es-MX')}</TableCell><TableCell>{money(s.expected)}</TableCell><TableCell>{money(s.counted)}</TableCell><TableCell>{money(s.difference)}</TableCell><TableCell>{s.reason || 'Sin diferencia'}</TableCell></TableRow>)}{!shifts.length && <TableRow><TableCell colSpan={5}>Todavía no hay cierres de caja.</TableCell></TableRow>}</TableBody></Table></div>
  </>;
}
