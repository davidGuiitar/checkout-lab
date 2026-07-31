-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- AddConstraint
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100);
