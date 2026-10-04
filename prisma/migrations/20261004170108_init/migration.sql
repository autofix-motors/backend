-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MECHANIC');

-- CreateTable
CREATE TABLE "core_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MECHANIC',
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "ip" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_user_email_key" ON "core_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "core_session_token_hash_key" ON "core_session"("token_hash");

-- CreateIndex
CREATE INDEX "core_session_user_id_idx" ON "core_session"("user_id");

-- CreateIndex
CREATE INDEX "core_session_family_id_idx" ON "core_session"("family_id");

-- AddForeignKey
ALTER TABLE "core_session" ADD CONSTRAINT "core_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
