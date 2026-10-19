import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { businesses, products } from '../app/pos-data';
try {
  for (const [id, name] of Object.entries(businesses)) await prisma.business.upsert({ where: { id }, create: { id, name }, update: {} });
  for (const product of products) await prisma.product.upsert({ where: { id: product.id }, create: product, update: {} });
  console.log('Negocios y catálogo inicial disponibles.');
} finally { await prisma.$disconnect(); }
