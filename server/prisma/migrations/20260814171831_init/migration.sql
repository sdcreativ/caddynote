-- CreateEnum
CREATE TYPE "strk_user_role" AS ENUM ('admin', 'school_admin', 'teacher', 'student', 'parent');

-- CreateEnum
CREATE TYPE "strk_institution_type" AS ENUM ('school', 'high_school', 'middle_school', 'university', 'training_center', 'elementary_school', 'private_school');

-- CreateEnum
CREATE TYPE "strk_absence_type" AS ENUM ('absence', 'lateness');

-- CreateEnum
CREATE TYPE "strk_signature_type" AS ENUM ('entry', 'exit', 'document');

-- CreateEnum
CREATE TYPE "strk_signature_status" AS ENUM ('pending', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "strk_guardian_relationship" AS ENUM ('father', 'mother', 'tutor', 'payer', 'other_authorized');

-- CreateTable
CREATE TABLE "strk_institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "strk_institution_type" NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo" TEXT,
    "admin_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone_number" TEXT,
    "profile_image" TEXT,
    "role" "strk_user_role" NOT NULL DEFAULT 'student',
    "institution_id" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "last_login_at" TIMESTAMP(3),
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),

    CONSTRAINT "strk_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "institution_id" UUID NOT NULL,
    "teacher_id" UUID,
    "description" TEXT,
    "academic_year" TEXT,
    "max_students" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "institution_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_class_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_teachers" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "employee_number" TEXT,
    "subjects" TEXT[],
    "hire_date" DATE,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_students" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "class_id" UUID,
    "student_number" TEXT,
    "enrollment_date" DATE,
    "attendance_rate" DECIMAL(65,30),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_student_guardians" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" "strk_guardian_relationship" NOT NULL DEFAULT 'tutor',
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "can_view_grades" BOOLEAN NOT NULL DEFAULT true,
    "can_view_attendance" BOOLEAN NOT NULL DEFAULT true,
    "can_view_billing" BOOLEAN NOT NULL DEFAULT false,
    "can_make_payments" BOOLEAN NOT NULL DEFAULT false,
    "can_receive_communications" BOOLEAN NOT NULL DEFAULT true,
    "can_authorize_pickup" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_student_classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_student_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_class_students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_class_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teacher_id" UUID,
    "class_id" UUID,
    "institution_id" UUID NOT NULL,
    "room" TEXT,
    "schedule_day" TEXT,
    "schedule_time" TEXT,
    "duration" INTEGER,
    "status" TEXT DEFAULT 'active',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_course_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "content" TEXT,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_course_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_course_students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_date" DATE DEFAULT CURRENT_TIMESTAMP,
    "grade" DECIMAL(65,30),
    "attendance_rate" DECIMAL(65,30),
    "last_attendance" TIMESTAMP(3),
    "progress" DECIMAL(65,30),

    CONSTRAINT "strk_course_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "class_id" UUID,
    "institution_id" UUID NOT NULL,
    "teacher_id" UUID,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "recurring_weeks" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'present',
    "arrival_time" TEXT,
    "departure_time" TEXT,
    "notes" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_absences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "course_id" UUID,
    "date" DATE NOT NULL,
    "type" "strk_absence_type" NOT NULL,
    "duration" INTEGER NOT NULL,
    "justified" BOOLEAN DEFAULT false,
    "reason" TEXT,
    "justification" TEXT,
    "justification_file" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_signatures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "strk_signature_type" NOT NULL,
    "status" "strk_signature_status" NOT NULL DEFAULT 'pending',
    "date" DATE NOT NULL,
    "timestamp" TEXT,
    "signature_data" TEXT,
    "verified" BOOLEAN DEFAULT false,
    "sender_id" UUID,
    "recipient_id" UUID,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "max_grade" DECIMAL(65,30) DEFAULT 20,
    "assignment_type" TEXT NOT NULL DEFAULT 'homework',
    "status" TEXT NOT NULL DEFAULT 'active',
    "attachments" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "content" TEXT,
    "attachments" JSONB DEFAULT '[]',
    "submitted_at" TIMESTAMP(3),
    "grade" DECIMAL(65,30),
    "feedback" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "grade_value" DECIMAL(65,30) NOT NULL,
    "max_grade" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "grade_type" TEXT NOT NULL DEFAULT 'exam',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "exercise_type" TEXT NOT NULL DEFAULT 'quiz',
    "difficulty_level" INTEGER,
    "points" INTEGER,
    "time_limit" INTEGER,
    "max_attempts" INTEGER,
    "due_date" TIMESTAMP(3),
    "is_published" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_exercise_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" TEXT NOT NULL DEFAULT 'multiple_choice',
    "options" JSONB,
    "correct_answer" JSONB,
    "explanation" TEXT,
    "points" INTEGER DEFAULT 1,
    "question_order" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_exercise_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_exercise_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "assigned_to_type" TEXT NOT NULL DEFAULT 'class',
    "assigned_to_id" UUID,
    "due_date" TIMESTAMP(3),
    "auto_grade" BOOLEAN DEFAULT true,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_exercise_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_exercise_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "attempt_number" INTEGER DEFAULT 1,
    "answers" JSONB,
    "score" DECIMAL(65,30),
    "max_score" DECIMAL(65,30),
    "status" TEXT DEFAULT 'in_progress',
    "feedback" TEXT,
    "time_spent" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_exercise_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_exercise_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exercise_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "current_question_id" UUID,
    "questions_answered" INTEGER DEFAULT 0,
    "total_questions" INTEGER,
    "progress_percentage" DECIMAL(65,30) DEFAULT 0,
    "streak_count" INTEGER DEFAULT 0,
    "badges_earned" JSONB DEFAULT '[]',
    "last_activity" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_exercise_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "parent_message_id" UUID,
    "attachments" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "action_url" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strk_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_notification_settings" (
    "user_id" UUID NOT NULL,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "push_notifications" BOOLEAN NOT NULL DEFAULT true,
    "sms_notifications" BOOLEAN NOT NULL DEFAULT false,
    "attendance_alerts" BOOLEAN NOT NULL DEFAULT true,
    "signature_requests" BOOLEAN NOT NULL DEFAULT true,
    "system_updates" BOOLEAN NOT NULL DEFAULT true,
    "daily_digest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "strk_notification_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "action_url" TEXT,
    "data" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_analytics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "user_id" UUID,
    "metric_type" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "date_key" DATE,
    "metadata" JSONB,
    "recorded_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strk_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_dashboard_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "stat_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),

    CONSTRAINT "strk_dashboard_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strk_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID,
    "created_by" UUID NOT NULL,
    "report_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "parameters" JSONB,
    "data" JSONB,
    "file_url" TEXT,
    "status" TEXT DEFAULT 'pending',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "strk_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "price_monthly" DECIMAL(65,30) NOT NULL,
    "price_yearly" DECIMAL(65,30),
    "stripe_price_id" TEXT,
    "stripe_yearly_price_id" TEXT,
    "max_students" INTEGER,
    "max_institutions" INTEGER,
    "max_monthly_reports" INTEGER,
    "storage_limit_gb" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_trial" BOOLEAN DEFAULT false,
    "is_active" BOOLEAN DEFAULT true,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premium_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "institution_id" UUID,
    "plan_id" UUID,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billing_cycle" TEXT DEFAULT 'monthly',
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "trial_starts_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "auto_renew" BOOLEAN DEFAULT true,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "payment_method_id" TEXT,
    "last_payment_date" TIMESTAMP(3),
    "next_billing_date" TIMESTAMP(3),
    "expiration_notifications_sent" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "premium_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "stripe_invoice_id" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "billing_period_start" TIMESTAMP(3),
    "billing_period_end" TIMESTAMP(3),
    "payment_date" TIMESTAMP(3),
    "invoice_url" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_type" TEXT NOT NULL,
    "days_before_expiration" INTEGER,
    "sent_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "email_sent" BOOLEAN DEFAULT false,
    "in_app_read" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strk_profiles_email_key" ON "strk_profiles"("email");

-- CreateIndex
CREATE UNIQUE INDEX "strk_student_guardians_student_id_guardian_id_key" ON "strk_student_guardians"("student_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "strk_class_students_class_id_student_id_key" ON "strk_class_students"("class_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "strk_submissions_assignment_id_student_id_key" ON "strk_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "strk_exercise_progress_exercise_id_student_id_key" ON "strk_exercise_progress"("exercise_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "strk_settings_category_key_key" ON "strk_settings"("category", "key");

-- AddForeignKey
ALTER TABLE "strk_institutions" ADD CONSTRAINT "strk_institutions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_profiles" ADD CONSTRAINT "strk_profiles_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_classes" ADD CONSTRAINT "strk_classes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_classes" ADD CONSTRAINT "strk_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_subjects" ADD CONSTRAINT "strk_subjects_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_class_subjects" ADD CONSTRAINT "strk_class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_class_subjects" ADD CONSTRAINT "strk_class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "strk_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_class_subjects" ADD CONSTRAINT "strk_class_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_teachers" ADD CONSTRAINT "strk_teachers_id_fkey" FOREIGN KEY ("id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_teachers" ADD CONSTRAINT "strk_teachers_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_students" ADD CONSTRAINT "strk_students_id_fkey" FOREIGN KEY ("id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_students" ADD CONSTRAINT "strk_students_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_students" ADD CONSTRAINT "strk_students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_guardians" ADD CONSTRAINT "strk_student_guardians_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_guardians" ADD CONSTRAINT "strk_student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_guardians" ADD CONSTRAINT "strk_student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_guardians" ADD CONSTRAINT "strk_student_guardians_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_classes" ADD CONSTRAINT "strk_student_classes_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_student_classes" ADD CONSTRAINT "strk_student_classes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_courses" ADD CONSTRAINT "strk_courses_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "strk_teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_courses" ADD CONSTRAINT "strk_courses_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_courses" ADD CONSTRAINT "strk_courses_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_course_materials" ADD CONSTRAINT "strk_course_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_course_materials" ADD CONSTRAINT "strk_course_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_course_students" ADD CONSTRAINT "strk_course_students_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_course_students" ADD CONSTRAINT "strk_course_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedules" ADD CONSTRAINT "strk_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedules" ADD CONSTRAINT "strk_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "strk_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedules" ADD CONSTRAINT "strk_schedules_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_schedules" ADD CONSTRAINT "strk_schedules_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_absences" ADD CONSTRAINT "strk_absences_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_absences" ADD CONSTRAINT "strk_absences_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_absences" ADD CONSTRAINT "strk_absences_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "strk_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_absences" ADD CONSTRAINT "strk_absences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_signatures" ADD CONSTRAINT "strk_signatures_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "strk_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_signatures" ADD CONSTRAINT "strk_signatures_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_signatures" ADD CONSTRAINT "strk_signatures_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_signatures" ADD CONSTRAINT "strk_signatures_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "strk_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_exercise_questions" ADD CONSTRAINT "strk_exercise_questions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "strk_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_exercise_assignments" ADD CONSTRAINT "strk_exercise_assignments_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "strk_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_exercise_attempts" ADD CONSTRAINT "strk_exercise_attempts_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "strk_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_exercise_progress" ADD CONSTRAINT "strk_exercise_progress_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "strk_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_activities" ADD CONSTRAINT "strk_activities_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_analytics" ADD CONSTRAINT "strk_analytics_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_dashboard_stats" ADD CONSTRAINT "strk_dashboard_stats_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strk_reports" ADD CONSTRAINT "strk_reports_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_subscriptions" ADD CONSTRAINT "premium_subscriptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "strk_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premium_subscriptions" ADD CONSTRAINT "premium_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_history" ADD CONSTRAINT "billing_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "premium_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_notifications" ADD CONSTRAINT "subscription_notifications_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "premium_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_notifications" ADD CONSTRAINT "subscription_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "strk_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
