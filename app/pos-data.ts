import { itemTotal, type SaleUnit } from '../lib/pricing';
export const businesses = { tacos: 'Taquería La Esquina', tienda: 'Abarrotes Don Pepe' };
export type Business = keyof typeof businesses;
export type Product = { id: string; name: string; description: string; price: number; unit: SaleUnit; category: string; emoji: string; business: Business };
export type Item = Product & { qty: number; extras: string[]; note: string };
export type Shift = { id: string; fund: number; opened: string };
export type Sale = { id: string; business: Business; number: string; shift: string; items: Item[]; total: number; received: number; change: number; method: string; reference: string; mode: string; note: string; date: string };
export type Shop = { cart: Item[]; sales: Sale[]; shift: Shift | null; note: string; mode: string };
export type State = { business: Business; shops: Record<Business, Shop>; closedShifts: (Shift & { business: Business; expected: number; counted: number; difference: number; reason: string; closed: string })[] };
export const storageKey = 'carrito-local-v2';
export const products: Product[] = [
  {
    "id": "pastor",
    "name": "Taco al pastor",
    "description": "Cerdo al trompo, piña y cilantro",
    "unit": "unit",
    "price": 2200,
    "category": "Tacos",
    "emoji": "🌮",
    "business": "tacos"
  },
  {
    "id": "suadero",
    "name": "Taco de suadero",
    "description": "Suave, doradito y con todo",
    "unit": "unit",
    "price": 2600,
    "category": "Tacos",
    "emoji": "🌮",
    "business": "tacos"
  },
  {
    "id": "bistec",
    "name": "Taco de bistec",
    "description": "Res a la plancha y cebolla",
    "unit": "unit",
    "price": 2800,
    "category": "Tacos",
    "emoji": "🌮",
    "business": "tacos"
  },
  {
    "id": "campechano",
    "name": "Taco campechano",
    "description": "La combinación que nunca falla",
    "unit": "unit",
    "price": 3000,
    "category": "Tacos",
    "emoji": "🌮",
    "business": "tacos"
  },
  {
    "id": "quesadilla",
    "name": "Quesadilla con queso",
    "description": "Maíz y queso fundido",
    "unit": "unit",
    "price": 3500,
    "category": "Antojitos",
    "emoji": "🧀",
    "business": "tacos"
  },
  {
    "id": "gringa",
    "name": "Gringa al pastor",
    "description": "Harina, pastor, queso y piña",
    "unit": "unit",
    "price": 5800,
    "category": "Antojitos",
    "emoji": "🫓",
    "business": "tacos"
  },
  {
    "id": "horchata",
    "name": "Agua de horchata",
    "description": "Hecha en casa · 500 ml",
    "unit": "unit",
    "price": 2800,
    "category": "Bebidas",
    "emoji": "🥛",
    "business": "tacos"
  },
  {
    "id": "jamaica",
    "name": "Agua de jamaica",
    "description": "Fresca y natural · 500 ml",
    "unit": "unit",
    "price": 2800,
    "category": "Bebidas",
    "emoji": "🧃",
    "business": "tacos"
  },
  {
    "id": "refresco",
    "name": "Refresco",
    "description": "Bien frío · 355 ml",
    "unit": "unit",
    "price": 2500,
    "category": "Bebidas",
    "emoji": "🥤",
    "business": "tacos"
  },
  {
    "id": "flan",
    "name": "Flan de la casa",
    "description": "El final dulce de tu pedido",
    "unit": "unit",
    "price": 3800,
    "category": "Postres",
    "emoji": "🍮",
    "business": "tacos"
  },
  {
    "id": "leche",
    "name": "Leche entera",
    "unit": "unit",
    "price": 2900,
    "emoji": "🥛",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  },
  {
    "id": "pan",
    "name": "Pan artesanal",
    "unit": "unit",
    "price": 4500,
    "emoji": "🥖",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  },
  {
    "id": "huevo",
    "name": "Huevo · 12 piezas",
    "unit": "unit",
    "price": 4800,
    "emoji": "🥚",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  },
  {
    "id": "cafe",
    "name": "Café molido",
    "unit": "unit",
    "price": 8900,
    "emoji": "☕",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  },
  {
    "id": "manzana",
    "name": "Manzana · 1 kg",
    "unit": "unit",
    "price": 4200,
    "emoji": "🍎",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  },
  {
    "id": "agua",
    "name": "Agua natural · 1 L",
    "unit": "unit",
    "price": 1800,
    "emoji": "💧",
    "description": "Disponible en tienda",
    "category": "Despensa",
    "business": "tienda"
  }
]
;
export function initialState(): State {
  const shop = (): Shop => ({ cart: [], sales: [], shift: null, note: '', mode: 'Mostrador' });
  return { business: 'tacos', shops: { tacos: shop(), tienda: shop() }, closedShifts: [] };
}
export const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
export const cartTotal = (cart: Item[]) => cart.reduce((sum, item) => sum + itemTotal(item), 0);
export const expectedCash = (shop: Shop) => shop.shift ? shop.shift.fund + shop.sales.filter(s => s.shift === shop.shift!.id && s.method === 'Efectivo').reduce((sum, s) => sum + s.total, 0) : 0;
export function exportSales(shop: Shop, business: Business) {
  const rows = [['Folio', 'Fecha UTC', 'Metodo', 'Total MXN'], ...shop.sales.map(s => [s.number, s.date, s.method, (s.total / 100).toFixed(2)])];
  const csv = rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `ventas-${business}.csv`; link.click(); URL.revokeObjectURL(url);
}
