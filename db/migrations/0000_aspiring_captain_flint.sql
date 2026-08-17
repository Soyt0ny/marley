CREATE TYPE "public"."buckle_shape" AS ENUM('rect_cut_corners', 'rect_rounded', 'contoured_rect', 'oval', 'round', 'shield');--> statement-breakpoint
CREATE TYPE "public"."design_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'authorized_pending_review', 'under_review', 'changes_requested', 'approved', 'in_production', 'shipped', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('authorization', 'capture', 'additional_charge', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."proposal_quality" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."zone_type" AS ENUM('top_text', 'bottom_text', 'center_image', 'corner_ornament');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_image_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"prompt_user_text" text NOT NULL,
	"prompt_final_text" text NOT NULL,
	"provider" text NOT NULL,
	"quality" "proposal_quality" NOT NULL,
	"image_url" text,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_zone_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"text_value" text,
	"font_id" uuid,
	"font_size_px" integer,
	"selected_proposal_id" uuid,
	"selected_ornament_option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"customer_email" text,
	"status" "design_status" DEFAULT 'draft' NOT NULL,
	"ai_generation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"css_family" text NOT NULL,
	"file_url" text,
	"supports_curve" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"stripe_object_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"note" text,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"design_id" uuid NOT NULL,
	"order_code" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text NOT NULL,
	"shipping_address" jsonb,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"template_snapshot" jsonb,
	"price_at_submission_cents" integer NOT NULL,
	"price_final_cents" integer,
	"stripe_payment_intent_id" text,
	"stripe_customer_id" text,
	"admin_notes" text,
	"customer_facing_note" text,
	"proof_image_url" text,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ornament_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"thumbnail_url" text,
	"asset_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"shape_type" "buckle_shape" NOT NULL,
	"base_artwork_url" text,
	"base_artwork_width" integer NOT NULL,
	"base_artwork_height" integer NOT NULL,
	"base_price_cents" integer NOT NULL,
	"status" "template_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_font_options" (
	"zone_id" uuid NOT NULL,
	"font_id" uuid NOT NULL,
	CONSTRAINT "zone_font_options_zone_id_font_id_pk" PRIMARY KEY("zone_id","font_id")
);
--> statement-breakpoint
CREATE TABLE "zone_ornament_options" (
	"zone_id" uuid NOT NULL,
	"ornament_option_id" uuid NOT NULL,
	CONSTRAINT "zone_ornament_options_zone_id_ornament_option_id_pk" PRIMARY KEY("zone_id","ornament_option_id")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"zone_type" "zone_type" NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"geometry" jsonb NOT NULL,
	"constraints" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_image_proposals" ADD CONSTRAINT "ai_image_proposals_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_image_proposals" ADD CONSTRAINT "ai_image_proposals_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_zone_values" ADD CONSTRAINT "design_zone_values_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_zone_values" ADD CONSTRAINT "design_zone_values_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_zone_values" ADD CONSTRAINT "design_zone_values_font_id_fonts_id_fk" FOREIGN KEY ("font_id") REFERENCES "public"."fonts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_zone_values" ADD CONSTRAINT "design_zone_values_selected_proposal_id_ai_image_proposals_id_fk" FOREIGN KEY ("selected_proposal_id") REFERENCES "public"."ai_image_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_zone_values" ADD CONSTRAINT "design_zone_values_selected_ornament_option_id_ornament_options_id_fk" FOREIGN KEY ("selected_ornament_option_id") REFERENCES "public"."ornament_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designs" ADD CONSTRAINT "designs_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_font_options" ADD CONSTRAINT "zone_font_options_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_font_options" ADD CONSTRAINT "zone_font_options_font_id_fonts_id_fk" FOREIGN KEY ("font_id") REFERENCES "public"."fonts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_ornament_options" ADD CONSTRAINT "zone_ornament_options_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_ornament_options" ADD CONSTRAINT "zone_ornament_options_ornament_option_id_ornament_options_id_fk" FOREIGN KEY ("ornament_option_id") REFERENCES "public"."ornament_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_idx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ai_proposals_design_idx" ON "ai_image_proposals" USING btree ("design_id","zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_zone_values_unique_idx" ON "design_zone_values" USING btree ("design_id","zone_id");--> statement-breakpoint
CREATE INDEX "designs_template_idx" ON "designs" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "order_payments_order_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_history_order_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_code_idx" ON "orders" USING btree ("order_code");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_design_idx" ON "orders" USING btree ("design_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_slug_idx" ON "templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "zones_template_idx" ON "zones" USING btree ("template_id","sort_order");