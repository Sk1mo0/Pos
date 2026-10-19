"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription } from "@/components/ui/empty";

import type { ReactNode } from "react";
import { usePos } from "./pos-context";
import { CatalogManager, SaleManager, ShiftManager } from "./managers";
import { priceUnit } from "@/lib/pricing";
import { money, exportSales } from "./pos-data";
const methods = ["Efectivo", "Digital simulado", "Externo manual"];
function Stats({ values }: { values: [string, ReactNode][] }) {
    return (
        <div className="stats">
            {values.map(([label, value]) => (
                <Card className="stat gap-0" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                </Card>
            ))}
        </div>
    );
}

export function CatalogPage() {
    const {
        state,
        shop,
        filtered,
        categories,
        category,
        setCategory,
        query,
        setQuery,
        search,
        view,
        setModal,
        navigate,
    } = usePos();
    return (
        <>
            <div className="heading">
                <div>
                    <h1>
                        {view === "venta"
                            ? "¿Qué vamos a preparar?"
                            : "Tu catálogo"}
                    </h1>
                    <small>
                        {view === "venta"
                            ? "Un buen día empieza con un buen pedido."
                            : "Administra los productos de tu negocio."}
                    </small>
                </div>
                <Button className="pill" onClick={() => navigate("caja")}>
                    ● Caja {shop.shift ? "abierta" : "cerrada"}
                </Button>
            </div>
            {view === "venta" && (
                <section className="hero">
                    <div>
                        <div className="eyebrow">HECHO PARA TU NEGOCIO</div>
                        <h2>
                            Mucho sabor.
                            <br />
                            Todo bajo control.
                        </h2>
                        <p>Tú ponle el sazón, nosotros organizamos la venta.</p>
                    </div>
                    <span className="hero-art">
                        {state.business === "tacos" ? "🌮" : "🛍️"}
                    </span>
                </section>
            )}
            <Input
                className="search"
                ref={search}
                aria-label="Buscar productos"
                placeholder="⌕ Busca un producto, encuentra un antojo…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <ToggleGroup
                className="filters max-w-full"
                aria-label="Categoría de productos"
                value={[category]}
                onValueChange={(values) => {
                    if (values[0]) setCategory(values[0]);
                }}
            >
                {categories.map((c) => (
                    <ToggleGroupItem key={c} value={c}>
                        {c}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <div className="section">
                <h2>
                    {category === "Todos" ? "Todos los productos" : category}{" "}
                    <small className="inline">({filtered.length})</small>
                </h2>
                <small>Precios en MXN</small>
            </div>
            {view === "catalogo" ? (
                <CatalogManager key={state.business} />
            ) : null}
            {view === "venta" && (
                <div className="product-grid">
                    {filtered.map((p) => (
                        <Card key={p.id} className="card gap-0">
                            <Button
                                variant="ghost"
                                className="h-auto w-full flex-col items-stretch whitespace-normal p-0 text-left hover:bg-transparent"
                                aria-label={`Agregar ${p.name}`}
                                onClick={() =>
                                    setModal({ kind: "product", product: p })
                                }
                            >
                                <div className="art">{p.emoji}</div>
                                <div className="card-info">
                                    <h3>{p.name}</h3>
                                    <p>{p.description}</p>
                                    <div className="row price">
                                        {money(p.price)} / {priceUnit(p.unit)}
                                        <span className="plus">+</span>
                                    </div>
                                </div>
                            </Button>
                        </Card>
                    ))}
                    {!filtered.length && (
                        <Empty className="col-span-full">
                            <EmptyDescription>
                                No hay productos que coincidan con tu búsqueda.
                            </EmptyDescription>
                        </Empty>
                    )}
                </div>
            )}
        </>
    );
}

export function CashPage() {
    const { state, shop, expected, setModal } = usePos();
    return (
        <>
            <div className="heading">
                <div>
                    <h1>Tu caja, en orden</h1>
                    <small>Controla el efectivo de tu turno.</small>
                </div>
                <Badge className="pill">
                    {shop.shift ? "Turno abierto" : "Sin turno activo"}
                </Badge>
            </div>
            <Stats
                values={[
                    ["Fondo inicial", money(shop.shift?.fund || 0)],
                    ["Efectivo esperado", money(expected)],
                    [
                        "Ventas de este turno",
                        shop.shift
                            ? shop.sales.filter(
                                  (s) => s.shift === shop.shift!.id,
                              ).length
                            : 0,
                    ],
                ]}
            />
            <Card className="panel">
                <h2>
                    {shop.shift
                        ? "Todo listo para seguir vendiendo"
                        : "Abre tu primer turno"}
                </h2>
                <p>
                    {shop.shift
                        ? "Cuenta tu efectivo al cerrar para conocer la diferencia con el importe esperado."
                        : "Registra el fondo de cambio para comenzar. Los movimientos se guardan en tu base de datos."}
                </p>
                <Button
                    className="h-auto px-5 py-3.5"
                    size="lg"
                    onClick={() =>
                        setModal({ kind: shop.shift ? "close" : "open" })
                    }
                >
                    {shop.shift ? "Cerrar turno" : "Abrir caja"}
                </Button>
            </Card>
            <ShiftManager key={state.business} />
        </>
    );
}

export function HistoryPage() {
    const { shop, state, view, sum } = usePos();
    return (
        <>
            <div className="heading">
                <div>
                    <h1>
                        {view === "historial"
                            ? "Historial de ventas"
                            : "Así va tu negocio"}
                    </h1>
                    <small>
                        {view === "historial"
                            ? "Cada pedido cuenta una historia."
                            : "Resultados de las ventas registradas."}
                    </small>
                </div>
                <Button
                    variant="outline"
                    onClick={() => exportSales(shop, state.business)}
                >
                    ↓ Exportar CSV
                </Button>
            </div>
            {view === "reportes" && (
                <>
                    <Stats
                        values={[
                            ["Ventas cobradas", money(sum)],
                            ["Pedidos", shop.sales.length],
                            [
                                "Ticket promedio",
                                money(
                                    shop.sales.length
                                        ? Math.round(sum / shop.sales.length)
                                        : 0,
                                ),
                            ],
                        ]}
                    />
                    <Card className="panel">
                        <h2>Cobros por método</h2>
                        {methods.map((method) => {
                            const value = shop.sales
                                .filter((s) => s.method === method)
                                .reduce((a, s) => a + s.total, 0);
                            return (
                                <div className="mt-6" key={method}>
                                    <div className="row">
                                        <small>{method}</small>
                                        <b>{money(value)}</b>
                                    </div>
                                    <Progress
                                        className="mt-2.5"
                                        aria-label={`Proporción de cobros: ${method}`}
                                        value={sum ? (value / sum) * 100 : 0}
                                    />
                                </div>
                            );
                        })}
                    </Card>
                </>
            )}
            <SaleManager key={state.business} />
        </>
    );
}
