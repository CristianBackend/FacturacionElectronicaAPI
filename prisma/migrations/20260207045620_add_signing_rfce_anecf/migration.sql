/*
  Warnings:

  - You are about to alter the column `unit_price` on the `invoice_lines` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(18,4)`.

*/
-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "additional_tax_code" VARCHAR(3),
ADD COLUMN     "additional_tax_rate" DECIMAL(10,6),
ALTER COLUMN "unit_price" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "is_rfce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reference_mod_code" INTEGER,
ADD COLUMN     "signature_value" TEXT,
ADD COLUMN     "signed_at" TIMESTAMP(3),
ADD COLUMN     "xml_rfce" TEXT;

-- CreateTable
CREATE TABLE "sequence_annulments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "encf_from" VARCHAR(13) NOT NULL,
    "encf_to" VARCHAR(13) NOT NULL,
    "xml_anecf" TEXT,
    "xml_signed" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "dgii_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_annulments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sequence_annulments_tenant_id_idx" ON "sequence_annulments"("tenant_id");

-- CreateIndex
CREATE INDEX "sequence_annulments_company_id_idx" ON "sequence_annulments"("company_id");
