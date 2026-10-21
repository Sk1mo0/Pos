"use client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { paymentRequest } from "./mercado-pago-client";
import { ErrorAlert } from "./ui-feedback";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";
import { PosContext } from "./pos-context";
import { PageSkeleton } from "./pos-skeletons";
import { CartDropdown } from "./cart-dropdown";
import { itemTotal, priceUnit, quantityLabel, quantityLimit } from "@/lib/pricing";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    businesses,
    initialState,
    storageKey,
    cartTotal,
    expectedCash,
    money,
    type Business,
    type Item,
    type Product,
    type Sale,
    type Shop,
    type State,
} from "./pos-data";

const methods = ["Efectivo", "Mercado Pago", "Externo manual"];
const navigation = [
    ["venta", "▦", "Vender"],
    ["historial", "◷", "Historial"],
    ["catalogo", "▣", "Catálogo"],
    ["caja", "▤", "Caja"],
    ["reportes", "↗", "Reportes"],
    ["pagos", "$", "Pagos"],
];
export type Modal =
    | { kind: "product"; product: Product }
    | { kind: "pay" | "open" | "close" }
    | { kind: "ticket"; sale: Sale };

function Workspace({ children }: { children: ReactNode }) {
    const [state, setState] = useState<State>(initialState);
    const [products, setProducts] = useState<Product[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [busy, setBusy] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const view = pathname.split("/")[1] || "venta";
    const [category, setCategory] = useState("Todos");
    const [query, setQuery] = useState("");
    const [cartOpen, setCartOpen] = useState(false);
    const [modal, setModal] = useState<Modal | null>(null);
    const setMessage = (message: string) => {
        toast(message);
    };
    const search = useRef<HTMLInputElement>(null);

    async function refresh() {
        const response = await fetch("/api/state", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setProducts(data.products);
        setState((previous) => {
            const next = structuredClone(previous);
            for (const business of ["tacos", "tienda"] as Business[]) {
                next.shops[business].sales = data.sales.filter(
                    (sale: Sale) => sale.business === business,
                );
                next.shops[business].shift =
                    data.shifts.find(
                        (shift: { business: string; closed: string | null }) =>
                            shift.business === business && !shift.closed,
                    ) || null;
            }
            next.closedShifts = data.shifts.filter(
                (shift: { closed: string | null }) => shift.closed,
            );
            return next;
        });
        setLoaded(true);
        setLoadError("");
    }
    async function mutate(
        resource: string,
        method: string,
        data: object,
        id?: string,
    ) {
        if (busy) throw new Error("Espera a que termine la operación actual.");
        setBusy(true);
        try {
            const response = await fetch(
                `/api/${resource}${id ? `/${id}` : ""}`,
                {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...data, business: state.business }),
                },
            );
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            await refresh();
            return result;
        } finally {
            setBusy(false);
        }
    }
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const saved = JSON.parse(
                    localStorage.getItem(storageKey + "-draft") || "null",
                );
                if (saved?.business in businesses)
                    setState((previous) => ({
                        ...previous,
                        business: saved.business,
                        shops: {
                            tacos: { ...previous.shops.tacos, ...saved.tacos },
                            tienda: {
                                ...previous.shops.tienda,
                                ...saved.tienda,
                            },
                        },
                    }));
            } catch {
                /* An invalid local draft does not prevent database loading. */
            }
            const returnedBusiness = new URL(window.location.href).searchParams.get("business");
            if (returnedBusiness === "tacos" || returnedBusiness === "tienda") setState(previous => ({ ...previous, business: returnedBusiness }));
            refresh().catch((error) => setLoadError(error.message));
        }, 0);
        const shortcut = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                search.current?.focus();
            }
        };
        document.addEventListener("keydown", shortcut);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("keydown", shortcut);
        };
    }, []);
    useEffect(() => {
        if (!loaded) return;
        const draft = (business: Business) => {
            const { cart, note, mode } = state.shops[business];
            return { cart, note, mode };
        };
        try {
            localStorage.setItem(
                storageKey + "-draft",
                JSON.stringify({
                    business: state.business,
                    tacos: draft("tacos"),
                    tienda: draft("tienda"),
                }),
            );
        } catch {
            /* Draft storage may be unavailable. */
        }
    }, [loaded, state]);

    const shop = state.shops[state.business];
    const total = cartTotal(shop.cart);
    const expected = expectedCash(shop);
    const sum = shop.sales.reduce((a, s) => a + s.total, 0);
    const changeShop = (next: Shop) =>
        setState({
            ...state,
            shops: { ...state.shops, [state.business]: next },
        });
    const changeCart = (cart: Item[]) => changeShop({ ...shop, cart });
    const navigate = (next: string) => {
        router.push("/" + next);
        setCartOpen(false);
    };
    const categories = [
        "Todos",
        ...new Set(
            products
                .filter((p) => p.business === state.business)
                .map((p) => p.category),
        ),
    ];
    const filtered = products.filter(
        (p) =>
            p.business === state.business &&
            (category === "Todos" || p.category === category) &&
            `${p.name} ${p.description}`
                .toLowerCase()
                .includes(query.toLowerCase()),
    );

    const acceptPayment = useCallback(async (sale: Sale) => {
        const fingerprint = (items: Item[]) => JSON.stringify(items.map(item => ({ id: item.id, qty: item.qty, unit: item.unit, extras: item.extras, note: item.note })));
        let pendingId: string | null = null;
        try {
            pendingId = localStorage.getItem(`mp-draft-${sale.business}`);
            if (pendingId === sale.id) localStorage.removeItem(`mp-draft-${sale.business}`);
        } catch { /* No storage: preserve the draft. */ }
        setState(previous => {
            const current = previous.shops[sale.business];
            const sameDraft = pendingId === sale.id && fingerprint(current.cart) === fingerprint(sale.items) && current.note === sale.note && current.mode === sale.mode;
            return { ...previous, shops: { ...previous.shops, [sale.business]: { ...current,
                ...(sameDraft ? { cart: [], note: "" } : {}),
                sales: [...current.sales.filter(item => item.id !== sale.id), sale],
            } } };
        });
    }, []);
    async function completeSale(sale: Sale) {
        const saved = await mutate("sales", "POST", sale);
        setState((previous) => ({
            ...previous,
            shops: {
                ...previous.shops,
                [sale.business]: {
                    ...previous.shops[sale.business],
                    cart: [],
                    note: "",
                },
            },
        }));
        setModal({ kind: "ticket", sale: saved });
    }
    async function update(next: State) {
        const nextShop = next.shops[state.business];
        if (!shop.shift && nextShop.shift)
            await mutate("shifts", "POST", { fund: nextShop.shift.fund });
        else if (shop.shift && !nextShop.shift) {
            const closed = next.closedShifts.at(-1)!;
            await mutate(
                "shifts",
                "PATCH",
                {
                    action: "close",
                    counted: closed.counted,
                    reason: closed.reason,
                },
                shop.shift.id,
            );
        }
        setModal(null);
    }
    const shared = {
        state,
        shop,
        products,
        filtered,
        categories,
        category,
        setCategory,
        query,
        setQuery,
        search,
        view,
        total,
        expected,
        sum,
        setModal,
        navigate,
        mutate,
        refresh,
        acceptPayment,
        busy,
        setMessage,
    };
    return (
        <PosContext.Provider value={shared}>
            <header>
                <b className="brand">
                    ▤ carrito<span>control.</span>
                </b>
                <NativeSelect
                    disabled={busy || !loaded}
                    aria-label="Negocio"
                    value={state.business}
                    onChange={(e) => {
                        setState({
                            ...state,
                            business: e.target.value as Business,
                        });
                        setCategory("Todos");
                        setQuery("");
                        setModal(null);
                        setCartOpen(false);
                    }}
                >
                    {Object.entries(businesses).map(([id, name]) => (
                        <NativeSelectOption key={id} value={id}>
                            {id === "tacos" ? "🌮" : "🛒"} {name}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <div className="flex shrink-0 items-center gap-4">
                    <span className="user">
                        AM · Alex Martínez <small>Propietario</small>
                    </span>
                    <CartDropdown
                        shop={shop}
                        open={cartOpen}
                        onOpenChange={setCartOpen}
                        loaded={loaded}
                        busy={busy}
                        onChange={changeShop}
                        onCheckout={() => {
                            if (shop.shift) setModal({ kind: "pay" });
                            else {
                                navigate("caja");
                                setMessage("Abre la caja antes de cobrar");
                            }
                        }}
                    />
                </div>
            </header>
            <div className="layout">
                <nav>
                    {navigation.map(([id, icon, label]) => (
                        <Link
                            key={id}
                            href={`/${id}`}
                            className={`${buttonVariants({ variant: "ghost" })} nav-link ${view === id ? "active" : ""}`}
                            aria-current={view === id ? "page" : undefined}
                            onClick={() => setCartOpen(false)}
                        >
                            <b>{icon}</b>
                            {label}
                        </Link>
                    ))}
                </nav>
                <main aria-busy={!loaded && !loadError}>
                    {loadError ? (
                        <div className="empty">
                            <ErrorAlert message={loadError} />
                            <Button
                                className="h-auto px-5 py-3.5"
                                size="lg"
                                onClick={() =>
                                    refresh().catch((error) =>
                                        setLoadError(error.message),
                                    )
                                }
                            >
                                Reintentar conexión
                            </Button>
                        </div>
                    ) : !loaded ? (
                        <PageSkeleton view={view} />
                    ) : null}
                    <div hidden={!loaded}>{children}</div>
                </main>
            </div>

            {modal && (
                <Dialog
                    open
                    onOpenChange={(open) => {
                        if (!open && !busy) setModal(null);
                    }}
                >
                    <DialogContent
                        className="pos-dialog max-h-[85dvh] overflow-y-auto pt-12 sm:max-w-[460px]"
                        showCloseButton={!busy}
                    >
                        <Operation
                            key={modal.kind === "product" ? modal.product.id : modal.kind}
                            modal={modal}
                            state={state}
                            shop={shop}
                            close={() => setModal(null)}
                            add={(item) => {
                                changeCart([...shop.cart, item]);
                                setModal(null);
                                setMessage("Producto agregado al pedido");
                            }}
                            sold={completeSale}
                            update={update}
                        />
                    </DialogContent>
                </Dialog>
            )}
            <Toaster position="bottom-center" />
        </PosContext.Provider>
    );
}

function Operation({
    modal,
    state,
    shop,
    add,
    sold,
    update,
    close,
}: {
    modal: Modal;
    state: State;
    shop: Shop;
    close: () => void;
    add: (item: Item) => void;
    sold: (sale: Sale) => Promise<void>;
    update: (state: State) => Promise<void>;
}) {
    const [extras, setExtras] = useState<string[]>([]);
    const [quantity, setQuantity] = useState(modal.kind === "product" && modal.product.unit === "weight" ? "1000" : "1");
    const productPrice = modal.kind === "product" ? modal.product.price + extras.reduce((sum, extra) => sum + (extra === "Queso" ? 1000 : 1500), 0) : 0;
    const productTotal = modal.kind === "product" ? itemTotal({ ...modal.product, price: productPrice, qty: Number(quantity) }) : 0;
    const [method, setMethod] = useState(methods[0]);
    const [received, setReceived] = useState(
        String(cartTotal(shop.cart) / 100),
    );
    const [error, setError] = useState("");
    const total = cartTotal(shop.cart);
    const expected = expectedCash(shop);

    const [pending, setPending] = useState(false);
    const [saleId] = useState(() => crypto.randomUUID());
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (pending) return;
        const form = new FormData(e.currentTarget);
        setPending(true);
        setError("");
        try {
            if (modal.kind === "product") {
                const qty = Number(quantity);
                if (!Number.isSafeInteger(qty) || qty < 1 || qty > quantityLimit(modal.product.unit)) {
                    setError("Introduce una cantidad entera válida.");
                    return;
                }
                add({
                    ...modal.product,
                    qty,
                    extras,
                    price: productPrice,
                    note: String(form.get("note") || ""),
                });
            } else if (modal.kind === "pay" && shop.shift && shop.cart.length) {
                if (method === "Mercado Pago") {
                    try { localStorage.setItem(`mp-draft-${state.business}`, saleId); } catch { /* Payment recovery still works without draft storage. */ }
                    const result = await paymentRequest<{ id: string; checkoutUrl: string }>("checkout", state.business, {
                        id: saleId, items: shop.cart, total, mode: shop.mode, note: shop.note,
                    });
                    window.location.assign(result.checkoutUrl);
                    return;
                }
                const amount =
                    method === "Efectivo"
                        ? Math.round(Number(received) * 100)
                        : total;
                if (!Number.isSafeInteger(amount) || amount < total) {
                    setError(
                        "El efectivo recibido es insuficiente o inválido.",
                    );
                    return;
                }
                await sold({
                    id: saleId,
                    business: state.business,
                    number: String(shop.sales.length + 1).padStart(4, "0"),
                    shift: shop.shift.id,
                    items: structuredClone(shop.cart),
                    total,
                    received: amount,
                    change: amount - total,
                    method,
                    reference: String(form.get("reference") || ""),
                    mode: shop.mode,
                    note: shop.note,
                    date: new Date().toISOString(),
                });
            } else if (modal.kind === "open" || modal.kind === "close") {
                const amount = Math.round(Number(form.get("amount")) * 100),
                    reason = String(form.get("reason") || "").trim();
                if (!Number.isSafeInteger(amount) || amount < 0) {
                    setError("Introduce un importe válido.");
                    return;
                }
                if (modal.kind === "close" && shop.shift) {
                    if (amount !== expected && !reason) {
                        setError("Indica el motivo de la diferencia.");
                        return;
                    }
                    await update({
                        ...state,
                        shops: {
                            ...state.shops,
                            [state.business]: { ...shop, shift: null },
                        },
                        closedShifts: [
                            ...state.closedShifts,
                            {
                                ...shop.shift,
                                business: state.business,
                                expected,
                                counted: amount,
                                difference: amount - expected,
                                reason,
                                closed: new Date().toISOString(),
                            },
                        ],
                    });
                } else
                    await update({
                        ...state,
                        shops: {
                            ...state.shops,
                            [state.business]: {
                                ...shop,
                                shift: {
                                    id: crypto.randomUUID(),
                                    fund: amount,
                                    opened: new Date().toISOString(),
                                },
                            },
                        },
                    });
            }
        } catch (error) {
            setError(
                error instanceof Error ? error.message : "No se pudo guardar.",
            );
        } finally {
            setPending(false);
        }
    }

    if (modal.kind === "product")
        return (
            <>
                <div className="art">{modal.product.emoji}</div>
                <DialogTitle>{modal.product.name}</DialogTitle>
                <DialogDescription>
                    {modal.product.description} · {money(modal.product.price)} / {priceUnit(modal.product.unit)}
                </DialogDescription>
                <form onSubmit={submit}>
                    <Label htmlFor="item-quantity">{modal.product.unit === "weight" ? "Gramaje (g)" : "Cantidad de unidades"}</Label>
                    <Input id="item-quantity" type="number" min="1" max={quantityLimit(modal.product.unit)} step="1" required value={quantity} onChange={event => { setQuantity(event.target.value); setError(""); }} />
                    {modal.product.unit === "weight" && <p>1 kg = 1,000 g · El importe se ajusta al gramaje.</p>}
                    {["Tacos", "Antojitos"].includes(modal.product.category) &&
                        ["Queso", "Aguacate"].map((x) => (
                            <Label key={x} className="checkbox-label">
                                <Checkbox
                                    checked={extras.includes(x)}
                                    onCheckedChange={(checked) =>
                                        setExtras(
                                            checked
                                                ? [...extras, x]
                                                : extras.filter((n) => n !== x),
                                        )
                                    }
                                />{" "}
                                {x} extra + {money(x === "Queso" ? 1000 : 1500)} / {priceUnit(modal.product.unit)}
                            </Label>
                        ))}
                    <Label htmlFor="item-note">Nota del producto</Label>
                    <Textarea
                        id="item-note"
                        name="note"
                        maxLength={200}
                        placeholder="Sin cebolla, salsa aparte…"
                    />
                    <ErrorAlert message={error} />
                    <Button
                        type="submit"
                        className="h-auto px-5 py-3.5"
                        size="lg"
                        disabled={pending}
                    >
                        Agregar al pedido ·{" "}
                        {money(Number.isFinite(productTotal) ? productTotal : 0)}
                    </Button>
                </form>
            </>
        );
    if (modal.kind === "pay")
        return (
            <>
                <DialogTitle>Vamos a cobrar</DialogTitle>
                <DialogDescription>
                    Total del pedido <b>{money(total)}</b>
                </DialogDescription>
                <form onSubmit={submit}>
                    <Label htmlFor="method">Método de pago</Label>
                    <NativeSelect
                        className="w-full"
                        id="method"
                        value={method}
                        onChange={(e) => {
                            setMethod(e.target.value);
                            setError("");
                        }}
                    >
                        {methods.map((m) => (
                            <NativeSelectOption key={m}>{m}</NativeSelectOption>
                        ))}
                    </NativeSelect>
                    {method === "Efectivo" ? (
                        <>
                            <Label htmlFor="received">
                                Efectivo recibido (MXN)
                            </Label>
                            <Input
                                id="received"
                                type="number"
                                min={total / 100}
                                step="0.01"
                                required
                                value={received}
                                onChange={(e) => setReceived(e.target.value)}
                            />
                            <p>
                                Cambio:{" "}
                                {money(
                                    Math.max(
                                        0,
                                        Math.round(Number(received) * 100) -
                                            total,
                                    ),
                                )}
                            </p>
                        </>
                    ) : method === "Mercado Pago" ? (
                        <div className="grid gap-3">
                            <p>Completa el pago en Mercado Pago. El ticket se generará cuando se confirme el cobro; tu pedido se conserva mientras tanto.</p>
                            <Link href="/pagos" onClick={() => close()}>Conectar cuenta o revisar cobros pendientes</Link>
                        </div>
                    ) : (
                        <>
                            <Label htmlFor="reference">
                                Referencia opcional
                            </Label>
                            <Input
                                id="reference"
                                name="reference"
                                maxLength={80}
                            />
                            <Label className="checkbox-label">
                                <Checkbox required name="confirmed" /> Confirmo
                                manualmente la recepción del pago.
                            </Label>
                            <p>No verificado por un banco.</p>
                        </>
                    )}
                    <ErrorAlert message={error} />
                    <Button
                        type="submit"
                        className="h-auto px-5 py-3.5"
                        size="lg"
                        disabled={pending}
                    >
                        {method === "Mercado Pago" ? "Ir a Mercado Pago" : "Confirmar venta"}
                    </Button>
                </form>
            </>
        );
    if (modal.kind === "open" || modal.kind === "close")
        return (
            <>
                <DialogTitle>
                    {modal.kind === "close" ? "Cerrar turno" : "Abrir caja"}
                </DialogTitle>
                <DialogDescription>
                    {modal.kind === "close"
                        ? `Efectivo esperado: ${money(expected)}`
                        : "Registra el fondo inicial para dar cambio."}
                </DialogDescription>
                <form onSubmit={submit}>
                    <Label htmlFor="amount">
                        {modal.kind === "close"
                            ? "Efectivo contado"
                            : "Fondo inicial"}{" "}
                        (MXN)
                    </Label>
                    <Input
                        id="amount"
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        defaultValue={
                            modal.kind === "close" ? expected / 100 : 0
                        }
                    />
                    <Label htmlFor="reason">Motivo de diferencia / nota</Label>
                    <Input id="reason" name="reason" maxLength={200} />
                    <ErrorAlert message={error} />
                    <Button
                        type="submit"
                        className="h-auto px-5 py-3.5"
                        size="lg"
                        disabled={pending}
                    >
                        {modal.kind === "close"
                            ? "Confirmar cierre"
                            : "Abrir turno"}
                    </Button>
                </form>
            </>
        );
    if (modal.kind === "ticket")
        return (
            <>
                <div className="text-center">
                    <small>TICKET DE VENTA</small>
                    <DialogTitle>{businesses[modal.sale.business]}</DialogTitle>
                    <DialogDescription>
                        Pedido #{modal.sale.number} · {modal.sale.mode}
                        <br />
                        {new Date(modal.sale.date).toLocaleString("es-MX", {
                            timeZone: "America/Mexico_City",
                        })}
                    </DialogDescription>
                </div>
                {modal.sale.items.map((x, i) => (
                    <div className="row ticket-line" key={i}>
                        <span>
                            {quantityLabel(x)} × {x.name}
                            <small>
                                {money(x.price)} / {priceUnit(x.unit)} · {x.extras.join(", ")} {x.note}
                            </small>
                        </span>
                        <b>{money(itemTotal(x))}</b>
                    </div>
                ))}
                <div className="row total my-5">
                    <span>Total</span>
                    {money(modal.sale.total)}
                </div>
                <p>
                    {modal.sale.method}
                    <br />
                    Recibido: {money(modal.sale.received)} · Cambio:{" "}
                    {money(modal.sale.change)}
                    <br />
                    {modal.sale.note}
                    <br />
                    {modal.sale.reference}
                    <br />
                    No es un comprobante fiscal.
                </p>
                <Button
                    className="h-auto px-5 py-3.5"
                    size="lg"
                    onClick={() => window.print()}
                >
                    Imprimir ticket
                </Button>
            </>
        );
    return null;
}

export default function PointOfSale({ children }: { children: ReactNode }) {
    return <Workspace>{children}</Workspace>;
}
