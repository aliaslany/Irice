CREATE TABLE "fake_payment_outcomes" (
	"authority" varchar(64) PRIMARY KEY NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
