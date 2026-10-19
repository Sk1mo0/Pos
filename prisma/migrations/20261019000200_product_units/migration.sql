ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unit';
ALTER TABLE "Product" ADD CONSTRAINT "Product_unit_check" CHECK ("unit" IN ('unit', 'weight'));
