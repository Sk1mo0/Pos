"use client";
import { createContext, useContext } from "react";
import type { Modal } from "./point-of-sale";
import type { State, Shop, Product, Sale } from "./pos-data";
export const PosContext = createContext<PosContextValue | null>(null);
type PosContextValue = {
    state: State;
    shop: Shop;
    products: Product[];
    filtered: Product[];
    categories: string[];
    category: string;
    setCategory: (value: string) => void;
    query: string;
    setQuery: (value: string) => void;
    search: React.RefObject<HTMLInputElement | null>;
    view: string;
    total: number;
    expected: number;
    sum: number;
    setModal: (modal: Modal | null) => void;
    navigate: (view: string) => void;
    mutate: (
        resource: string,
        method: string,
        data: object,
        id?: string,
    ) => Promise<unknown>;
    refresh: () => Promise<void>;
    acceptPayment: (sale: Sale) => Promise<void>;
    busy: boolean;
    setMessage: (message: string) => void;
};
export function usePos() {
    const value = useContext(PosContext);
    if (!value) throw new Error("Falta el contexto de punto de venta.");
    return value;
}
