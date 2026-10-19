import type { Metadata } from 'next';
import './globals.css';
import PointOfSale from './point-of-sale';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'CarritoControl · Punto de venta',
  description: 'Punto de venta para taquerías y pequeños comercios',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={cn("font-sans", inter.variable)}><body className="antialiased"><PointOfSale>{children}</PointOfSale></body></html>;
}
