-- AlterEnum
ALTER TYPE "DecisionChannel" ADD VALUE 'PORTAL';

-- AlterTable
ALTER TABLE "workshop_work_order_event" ALTER COLUMN "created_by_id" DROP NOT NULL;

