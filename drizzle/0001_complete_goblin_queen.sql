CREATE TYPE "public"."loyalty_ledger_reason" AS ENUM('earn_purchase', 'redeem_checkout', 'refund_checkout', 'expire', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'payment_failed', 'fulfilled', 'cancelled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('zarinpal', 'fake');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"recipient_name" varchar(128) NOT NULL,
	"recipient_mobile" varchar(11) NOT NULL,
	"province" varchar(64) NOT NULL,
	"city" varchar(64) NOT NULL,
	"line1" text NOT NULL,
	"postal_code" varchar(10),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" varchar(11) NOT NULL,
	"display_name" varchar(128),
	"total_kg_purchased_cache" integer DEFAULT 0 NOT NULL,
	"current_streak_months" integer DEFAULT 0 NOT NULL,
	"longest_streak_months" integer DEFAULT 0 NOT NULL,
	"points_balance_cache" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_mobile_unique" UNIQUE("mobile"),
	CONSTRAINT "customers_total_kg_non_negative" CHECK ("customers"."total_kg_purchased_cache" >= 0),
	CONSTRAINT "customers_points_balance_non_negative" CHECK ("customers"."points_balance_cache" >= 0)
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" varchar(11) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_codes_attempts_bounded" CHECK ("otp_codes"."attempts" <= 5)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"pack_size_g" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_variety_pack_unique" UNIQUE("cart_id","variety_id","pack_size_g"),
	CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_token" varchar(64) NOT NULL,
	"customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_cart_token_unique" UNIQUE("cart_token")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"sku_id" uuid,
	"pack_size_g" integer NOT NULL,
	"packs" integer NOT NULL,
	"unit_price_rial" bigint NOT NULL,
	"line_total_rial" bigint NOT NULL,
	"line_weight_g" bigint NOT NULL,
	CONSTRAINT "order_lines_packs_positive" CHECK ("order_lines"."packs" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(16) NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_id" uuid,
	"ship_recipient_name" varchar(128) NOT NULL,
	"ship_recipient_mobile" varchar(11) NOT NULL,
	"ship_province" varchar(64) NOT NULL,
	"ship_city" varchar(64) NOT NULL,
	"ship_line1" text NOT NULL,
	"ship_postal_code" varchar(10),
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"subtotal_rial" bigint NOT NULL,
	"shipping_fee_rial" bigint NOT NULL,
	"discount_rial" bigint DEFAULT 0 NOT NULL,
	"total_rial" bigint NOT NULL,
	"total_weight_g" bigint NOT NULL,
	"points_redeemed" bigint DEFAULT 0 NOT NULL,
	"points_earned" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_subtotal_non_negative" CHECK ("orders"."subtotal_rial" >= 0),
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_rial" >= 0),
	CONSTRAINT "orders_discount_bounded" CHECK ("orders"."discount_rial" <= "orders"."subtotal_rial")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"authority" varchar(64) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_rial" bigint NOT NULL,
	"ref_id" varchar(64),
	"failure_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payments_authority_unique" UNIQUE("authority"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_rial" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity_g" bigint NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"order_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "stock_reservations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"badge_code" varchar(64) NOT NULL,
	"source_order_id" uuid,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_badges_customer_badge_unique" UNIQUE("customer_id","badge_code")
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"delta_points" bigint NOT NULL,
	"reason" "loyalty_ledger_reason" NOT NULL,
	"order_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "loyalty_ledger_delta_non_zero" CHECK ("loyalty_ledger"."delta_points" <> 0),
	CONSTRAINT "loyalty_ledger_adjustment_explained" CHECK (("loyalty_ledger"."reason" <> 'adjustment') or ("loyalty_ledger"."note" is not null))
);
--> statement-breakpoint
-- Hand-fixed: drizzle-kit's generated enum swap (cast column to text, drop
-- the old type, recreate it, cast back) leaves the pre-existing
-- stock_movements_explained CHECK constraint referencing the OLD enum type in
-- its stored expression. Postgres then rejects the intermediate `text`
-- column type against that stale enum-typed literal ("operator does not
-- exist: text <> stock_movement_reason"). Drop the constraint before the
-- swap and recreate it identically afterward — its definition is unchanged,
-- only the enum's value set is.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_explained";--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."stock_movement_reason";--> statement-breakpoint
CREATE TYPE "public"."stock_movement_reason" AS ENUM('intake', 'sale', 'return', 'shrinkage', 'recount');--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "reason" SET DATA TYPE "public"."stock_movement_reason" USING "reason"::"public"."stock_movement_reason";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_explained" CHECK (("stock_movements"."reason" not in ('shrinkage', 'recount')) or ("stock_movements"."note" is not null));--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variety_id_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_badges" ADD CONSTRAINT "customer_badges_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_badges" ADD CONSTRAINT "customer_badges_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "otp_codes_mobile_idx" ON "otp_codes" USING btree ("mobile","created_at");--> statement-breakpoint
CREATE INDEX "carts_customer_idx" ON "carts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_lot_idx" ON "order_lines" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_lot_status_idx" ON "stock_reservations" USING btree ("lot_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_active_expiry_idx" ON "stock_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "customer_badges_customer_idx" ON "customer_badges" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "loyalty_ledger_customer_idx" ON "loyalty_ledger" USING btree ("customer_id","created_at");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;