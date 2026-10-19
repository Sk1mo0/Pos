-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "fund" INTEGER NOT NULL,
    "opened" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed" TIMESTAMP(3),
    "expected" INTEGER,
    "counted" INTEGER,
    "difference" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "received" INTEGER NOT NULL,
    "change" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_business_idx" ON "Product"("business");

-- CreateIndex
CREATE INDEX "Shift_business_closed_idx" ON "Shift"("business", "closed");

-- CreateIndex
CREATE INDEX "Sale_business_date_idx" ON "Sale"("business", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_business_number_key" ON "Sale"("business", "number");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_business_fkey" FOREIGN KEY ("business") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_business_fkey" FOREIGN KEY ("business") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_business_fkey" FOREIGN KEY ("business") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shift_fkey" FOREIGN KEY ("shift") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

