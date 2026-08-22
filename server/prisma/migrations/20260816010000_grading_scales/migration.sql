-- CreateTable
CREATE TABLE "strk_grading_scales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "max_value" DECIMAL(65,30) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_grading_scales_institution_id_name_key" ON "strk_grading_scales"("institution_id", "name");

-- AddForeignKey
ALTER TABLE "strk_grading_scales" ADD CONSTRAINT "strk_grading_scales_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
