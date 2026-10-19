import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type View = 'venta' | 'catalogo' | 'historial' | 'caja' | 'reportes';

function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-label={label} className="space-y-6">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-6">{children}</div>
  </div>;
}

function HeadingSkeleton() {
  return <div className="heading">
    <div className="w-2/3 space-y-3"><Skeleton className="h-8 w-full max-w-72" /><Skeleton className="h-3 w-4/5 max-w-60" /></div>
    <Skeleton className="h-9 w-24 shrink-0 rounded-full" />
  </div>;
}

function StatsSkeleton() {
  return <div className="stats">{Array.from({ length: 3 }, (_, index) => <Card className="stat gap-0" key={index}>
    <Skeleton className="h-3 w-24 max-w-full" /><Skeleton className="mt-5 h-8 w-28 max-w-full" />
  </Card>)}</div>;
}

function TableSkeleton({ columns = 4 }: { columns?: number }) {
  return <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
    {Array.from({ length: 6 }, (_, row) => <div key={row} className="grid gap-4 border-b border-[var(--line)] px-4 py-5 last:border-0" style={{ gridTemplateColumns: `minmax(0, 2fr) repeat(${columns - 1}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }, (_, column) => <Skeleton key={column} className={row === 0 ? 'h-3 w-3/4' : 'h-5 w-full'} />)}
    </div>)}
  </div>;
}

export function PageSkeleton({ view = 'venta' }: { view?: View | string }) {
  const selling = view === 'venta';
  const catalog = view === 'catalogo';
  const cash = view === 'caja';
  const reports = view === 'reportes';
  const label = selling ? 'Cargando productos' : catalog ? 'Cargando catálogo' : cash ? 'Cargando caja' : reports ? 'Cargando reportes' : 'Cargando historial';
  return <LoadingRegion label={label}>
    <HeadingSkeleton />
    {selling || catalog ? <>
      {selling && <div className="hero min-h-48"><div className="w-2/3 space-y-4"><Skeleton className="h-3 w-32 max-w-full" /><Skeleton className="h-16 w-52 max-w-full" /><Skeleton className="h-3 w-full max-w-64" /></div><Skeleton className="size-20 shrink-0 rounded-2xl" /></div>}
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex gap-2 overflow-hidden">{[20, 24, 20, 24].map((width, index) => <Skeleton key={index} className="h-10 shrink-0 rounded-full" style={{ width: `${width / 4}rem` }} />)}</div>
      <Skeleton className="h-5 w-44" />
      {selling ? <div className="product-grid">{Array.from({ length: 6 }, (_, index) => <Card className="card gap-0" key={index}>
        <Skeleton className="h-[95px] w-full rounded-xl md:h-[137px]" />
        <div className="card-info space-y-3"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-full" /><div className="row pt-2"><Skeleton className="h-5 w-16" /><Skeleton className="size-9 rounded-lg" /></div></div>
      </Card>)}</div> : <><Skeleton className="h-11 w-40 rounded-xl" /><TableSkeleton /></>}
    </> : <>
      {(cash || reports) && <StatsSkeleton />}
      {(cash || reports) && <Card className="panel gap-0 space-y-5"><Skeleton className="h-6 w-3/4 max-w-72" />{reports ? Array.from({ length: 3 }, (_, index) => <div className="space-y-3" key={index}><div className="row"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-16" /></div><Skeleton className="h-2 w-full rounded-full" /></div>) : <><Skeleton className="h-4 w-full" /><Skeleton className="h-11 w-36 rounded-xl" /></>}</Card>}
      <TableSkeleton columns={5} />
    </>}
  </LoadingRegion>;
}

export function OrderSkeleton() {
  return <>
    <div role="status" aria-label="Cargando pedido"><span className="sr-only">Cargando pedido</span><div aria-hidden="true" className="space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-3 w-28" /></div></div>
    <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-5">
      <Skeleton className="h-11 w-full shrink-0 rounded-xl" />
      <div className="flex-1 space-y-6 pt-2">{Array.from({ length: 3 }, (_, index) => <div className="flex gap-3" key={index}><Skeleton className="size-12 shrink-0 rounded-xl" /><div className="flex-1 space-y-3"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-6 w-20" /></div></div>)}</div>
      <Skeleton className="h-16 w-full shrink-0 rounded-xl" />
      <div className="space-y-4 border-t border-dashed border-[var(--line)] pt-5"><div className="row"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-16" /></div><div className="row"><Skeleton className="h-6 w-16" /><Skeleton className="h-6 w-24" /></div></div>
      <Skeleton className="h-12 w-full shrink-0 rounded-xl" /><Skeleton className="mx-auto h-3 w-4/5" />
    </div>
  </>;
}
