CREATE TYPE "public"."certificate_kind" AS ENUM('lab_analysis', 'origin', 'organic', 'health');--> statement-breakpoint
CREATE TYPE "public"."crop_cycle" AS ENUM('first', 'ratoon');--> statement-breakpoint
CREATE TYPE "public"."grain_type" AS ENUM('long', 'medium', 'short');--> statement-breakpoint
CREATE TYPE "public"."lot_grade" AS ENUM('momtaz', 'darajeh_yek', 'darajeh_do', 'daneh_shekasteh');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('incoming', 'active', 'depleted', 'quarantined', 'archived');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_reason" AS ENUM('intake', 'reservation', 'release', 'sale', 'return', 'shrinkage', 'recount');--> statement-breakpoint
CREATE TABLE "lot_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"kind" "certificate_kind" NOT NULL,
	"issuer" varchar(128) NOT NULL,
	"reference_no" varchar(64),
	"issued_at" timestamp with time zone NOT NULL,
	"file_url" text NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"price_per_kg_rial" bigint NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variety_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"origin_province" varchar(64) NOT NULL,
	"origin_city" varchar(64) NOT NULL,
	"mill_name" varchar(128),
	"harvest_year" smallint NOT NULL,
	"crop_cycle" "crop_cycle" DEFAULT 'first' NOT NULL,
	"grade" "lot_grade" NOT NULL,
	"moisture_pct" numeric(4, 2),
	"broken_grain_pct" numeric(4, 2),
	"price_per_kg_rial" bigint NOT NULL,
	"cost_per_kg_rial" bigint,
	"quantity_on_hand_g" bigint DEFAULT 0 NOT NULL,
	"quantity_reserved_g" bigint DEFAULT 0 NOT NULL,
	"status" "lot_status" DEFAULT 'incoming' NOT NULL,
	"received_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_code_unique" UNIQUE("code"),
	CONSTRAINT "lots_on_hand_non_negative" CHECK ("lots"."quantity_on_hand_g" >= 0),
	CONSTRAINT "lots_reserved_non_negative" CHECK ("lots"."quantity_reserved_g" >= 0),
	CONSTRAINT "lots_reserved_within_on_hand" CHECK ("lots"."quantity_reserved_g" <= "lots"."quantity_on_hand_g"),
	CONSTRAINT "lots_price_positive" CHECK ("lots"."price_per_kg_rial" > 0),
	CONSTRAINT "lots_harvest_year_jalali" CHECK ("lots"."harvest_year" between 1380 and 1500)
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"pack_size_g" integer NOT NULL,
	"price_rial" bigint NOT NULL,
	"packaging_fee_rial" bigint DEFAULT 0 NOT NULL,
	"barcode" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_lot_pack_unique" UNIQUE("lot_id","pack_size_g"),
	CONSTRAINT "skus_pack_size_positive" CHECK ("skus"."pack_size_g" > 0),
	CONSTRAINT "skus_price_positive" CHECK ("skus"."price_rial" > 0)
);
--> statement-breakpoint
CREATE TABLE "varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name_fa" varchar(128) NOT NULL,
	"name_en" varchar(128),
	"grain_type" "grain_type" NOT NULL,
	"is_imported" boolean DEFAULT false NOT NULL,
	"summary_fa" text,
	"description_fa" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hero_image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "varieties_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"delta_g" bigint NOT NULL,
	"reason" "stock_movement_reason" NOT NULL,
	"order_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"note" text,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "stock_movements_delta_non_zero" CHECK ("stock_movements"."delta_g" <> 0),
	CONSTRAINT "stock_movements_explained" CHECK (("stock_movements"."reason" not in ('shrinkage', 'recount')) or ("stock_movements"."note" is not null))
);
--> statement-breakpoint
ALTER TABLE "lot_certificates" ADD CONSTRAINT "lot_certificates_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_price_history" ADD CONSTRAINT "lot_price_history_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_certificates_lot_idx" ON "lot_certificates" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "lot_price_history_lot_time_idx" ON "lot_price_history" USING btree ("lot_id","effective_from");--> statement-breakpoint
CREATE INDEX "lots_fefo_idx" ON "lots" USING btree ("variety_id","status","harvest_year");--> statement-breakpoint
CREATE INDEX "skus_active_idx" ON "skus" USING btree ("is_active","lot_id");--> statement-breakpoint
CREATE INDEX "varieties_published_idx" ON "varieties" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "stock_movements_lot_time_idx" ON "stock_movements" USING btree ("lot_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");