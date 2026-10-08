-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'RUC', 'CE', 'PASSPORT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'YAPE_PLIN', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('PART', 'SUPPLY');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('UNIT', 'LITER', 'GALLON', 'KIT', 'METER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'WORK_ORDER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('AVAILABLE', 'IN_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('RECEIVED', 'DIAGNOSIS', 'WAITING_APPROVAL', 'IN_PROGRESS', 'WAITING_PARTS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DecisionChannel" AS ENUM ('PHONE', 'WHATSAPP', 'IN_PERSON');

-- AlterTable
-- updated_at entra con un valor para las filas que ya existen y después se le
-- quita el default: Prisma lo llena desde el cliente (@updatedAt), no la base.
ALTER TABLE "core_user" ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "core_user" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "customer_customer" (
    "customer_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_number" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(254),
    "address" VARCHAR(250),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "customer_vehicle" (
    "vehicle_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "plate" VARCHAR(10) NOT NULL,
    "brand" VARCHAR(60) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "year" INTEGER,
    "color" VARCHAR(40),
    "vin" VARCHAR(17),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_vehicle_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "finance_payment" (
    "payment_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(60),
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by_id" UUID NOT NULL,
    "note" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_payment_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "inventory_product" (
    "product_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "brand" VARCHAR(60),
    "stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_product_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "inventory_stock_movement" (
    "stock_movement_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "work_order_item_id" UUID,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_stock_movement_pkey" PRIMARY KEY ("stock_movement_id")
);

-- CreateTable
CREATE TABLE "inventory_tool" (
    "tool_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "brand" VARCHAR(60),
    "status" "ToolStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assigned_to_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_tool_pkey" PRIMARY KEY ("tool_id")
);

-- CreateTable
CREATE TABLE "workshop_service_catalog_item" (
    "service_catalog_item_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "labor_price" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_service_catalog_item_pkey" PRIMARY KEY ("service_catalog_item_id")
);

-- CreateTable
CREATE TABLE "workshop_work_order" (
    "work_order_id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "tracking_code" VARCHAR(12) NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "mechanic_id" UUID,
    "created_by_id" UUID NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "mileage_in" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "diagnosis" TEXT,
    "promised_date" DATE,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_work_order_pkey" PRIMARY KEY ("work_order_id")
);

-- CreateTable
CREATE TABLE "workshop_work_order_event" (
    "work_order_event_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "status" "WorkOrderStatus",
    "note" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_work_order_event_pkey" PRIMARY KEY ("work_order_event_id")
);

-- CreateTable
CREATE TABLE "workshop_work_order_item" (
    "work_order_item_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "type" "ItemType" NOT NULL,
    "service_catalog_item_id" UUID,
    "product_id" UUID,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_work_order_item_pkey" PRIMARY KEY ("work_order_item_id")
);

-- CreateTable
CREATE TABLE "workshop_quote" (
    "quote_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(10,2) NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_channel" "DecisionChannel",
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshop_quote_pkey" PRIMARY KEY ("quote_id")
);

-- CreateTable
CREATE TABLE "workshop_quote_item" (
    "quote_item_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "type" "ItemType" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_quote_item_pkey" PRIMARY KEY ("quote_item_id")
);

-- CreateIndex
CREATE INDEX "customer_customer_name_idx" ON "customer_customer"("name");

-- CreateIndex
CREATE INDEX "customer_customer_phone_idx" ON "customer_customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customer_customer_document_type_document_number_key" ON "customer_customer"("document_type", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_vehicle_plate_key" ON "customer_vehicle"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "customer_vehicle_vin_key" ON "customer_vehicle"("vin");

-- CreateIndex
CREATE INDEX "customer_vehicle_customer_id_idx" ON "customer_vehicle"("customer_id");

-- CreateIndex
CREATE INDEX "finance_payment_work_order_id_idx" ON "finance_payment"("work_order_id");

-- CreateIndex
CREATE INDEX "finance_payment_paid_at_idx" ON "finance_payment"("paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_product_code_key" ON "inventory_product"("code");

-- CreateIndex
CREATE INDEX "inventory_product_name_idx" ON "inventory_product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_movement_work_order_item_id_key" ON "inventory_stock_movement"("work_order_item_id");

-- CreateIndex
CREATE INDEX "inventory_stock_movement_product_id_created_at_idx" ON "inventory_stock_movement"("product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_tool_code_key" ON "inventory_tool"("code");

-- CreateIndex
CREATE INDEX "inventory_tool_assigned_to_id_idx" ON "inventory_tool"("assigned_to_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_service_catalog_item_name_key" ON "workshop_service_catalog_item"("name");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_work_order_number_key" ON "workshop_work_order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_work_order_tracking_code_key" ON "workshop_work_order"("tracking_code");

-- CreateIndex
CREATE INDEX "workshop_work_order_status_idx" ON "workshop_work_order"("status");

-- CreateIndex
CREATE INDEX "workshop_work_order_mechanic_id_idx" ON "workshop_work_order"("mechanic_id");

-- CreateIndex
CREATE INDEX "workshop_work_order_vehicle_id_idx" ON "workshop_work_order"("vehicle_id");

-- CreateIndex
CREATE INDEX "workshop_work_order_customer_id_idx" ON "workshop_work_order"("customer_id");

-- CreateIndex
CREATE INDEX "workshop_work_order_event_work_order_id_created_at_idx" ON "workshop_work_order_event"("work_order_id", "created_at");

-- CreateIndex
CREATE INDEX "workshop_work_order_item_work_order_id_idx" ON "workshop_work_order_item"("work_order_id");

-- CreateIndex
CREATE INDEX "workshop_work_order_item_product_id_idx" ON "workshop_work_order_item"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_quote_work_order_id_version_key" ON "workshop_quote"("work_order_id", "version");

-- CreateIndex
CREATE INDEX "workshop_quote_item_quote_id_idx" ON "workshop_quote_item"("quote_id");

-- AddForeignKey
ALTER TABLE "customer_vehicle" ADD CONSTRAINT "customer_vehicle_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_payment" ADD CONSTRAINT "finance_payment_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "workshop_work_order"("work_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_payment" ADD CONSTRAINT "finance_payment_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_payment" ADD CONSTRAINT "finance_payment_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory_product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_work_order_item_id_fkey" FOREIGN KEY ("work_order_item_id") REFERENCES "workshop_work_order_item"("work_order_item_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_movement" ADD CONSTRAINT "inventory_stock_movement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_tool" ADD CONSTRAINT "inventory_tool_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order" ADD CONSTRAINT "workshop_work_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order" ADD CONSTRAINT "workshop_work_order_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "customer_vehicle"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order" ADD CONSTRAINT "workshop_work_order_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order" ADD CONSTRAINT "workshop_work_order_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order_event" ADD CONSTRAINT "workshop_work_order_event_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "workshop_work_order"("work_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order_event" ADD CONSTRAINT "workshop_work_order_event_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order_item" ADD CONSTRAINT "workshop_work_order_item_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "workshop_work_order"("work_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order_item" ADD CONSTRAINT "workshop_work_order_item_service_catalog_item_id_fkey" FOREIGN KEY ("service_catalog_item_id") REFERENCES "workshop_service_catalog_item"("service_catalog_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_work_order_item" ADD CONSTRAINT "workshop_work_order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory_product"("product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_quote" ADD CONSTRAINT "workshop_quote_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "workshop_work_order"("work_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_quote" ADD CONSTRAINT "workshop_quote_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_quote" ADD CONSTRAINT "workshop_quote_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "core_user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_quote_item" ADD CONSTRAINT "workshop_quote_item_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "workshop_quote"("quote_id") ON DELETE CASCADE ON UPDATE CASCADE;

