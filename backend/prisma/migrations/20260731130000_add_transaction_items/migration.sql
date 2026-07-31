-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransactionItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100)
);

-- Preserve existing single-product transactions as cart lines.
INSERT INTO "TransactionItem" (
    "id",
    "transactionId",
    "productId",
    "quantity",
    "unitPrice",
    "amount"
)
SELECT
    'legacy-' || "id",
    "id",
    "productId",
    "quantity",
    CASE WHEN "quantity" > 0 THEN "productAmount" / "quantity" ELSE "productAmount" END,
    "productAmount"
FROM "Transaction";

-- CreateIndex
CREATE UNIQUE INDEX "TransactionItem_transactionId_productId_key"
ON "TransactionItem"("transactionId", "productId");

-- CreateIndex
CREATE INDEX "TransactionItem_transactionId_idx" ON "TransactionItem"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionItem_productId_idx" ON "TransactionItem"("productId");

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
