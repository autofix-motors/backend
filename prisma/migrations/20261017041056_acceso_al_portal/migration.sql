-- AlterTable
ALTER TABLE "core_session" ADD COLUMN     "customer_account_id" UUID,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "core_user" ADD COLUMN     "document_number" VARCHAR(8),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_expires_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "core_customer_account" (
    "customer_account_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_expires_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_customer_account_pkey" PRIMARY KEY ("customer_account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_customer_account_customer_id_key" ON "core_customer_account"("customer_id");

-- CreateIndex
CREATE INDEX "core_session_customer_account_id_idx" ON "core_session"("customer_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_user_document_number_key" ON "core_user"("document_number");

-- AddForeignKey
ALTER TABLE "core_session" ADD CONSTRAINT "core_session_customer_account_id_fkey" FOREIGN KEY ("customer_account_id") REFERENCES "core_customer_account"("customer_account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_customer_account" ADD CONSTRAINT "core_customer_account_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_customer"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Una sesión es de un usuario o de la cuenta de un cliente, nunca de los dos
-- ni de ninguno. Prisma no puede declarar este CHECK: lo documenta el `///`
-- de Session. Las sesiones que ya existen tienen user_id, así que lo cumplen.
ALTER TABLE "core_session" ADD CONSTRAINT "core_session_owner_check"
    CHECK (num_nonnulls("user_id", "customer_account_id") = 1);

-- El correo del cliente pasa a servir para iniciar sesión en el portal: se
-- guarda en minúsculas, como el del personal.
UPDATE "customer_customer" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;
