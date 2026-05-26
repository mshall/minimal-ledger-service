CREATE TYPE "public"."account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'FROZEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('POSTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."entry_direction" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" char(3) NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_balances" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" "txn_status" DEFAULT 'POSTED' NOT NULL,
	"description" text,
	"external_ref" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" "entry_direction" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_amount_positive" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_account_posted_idx" ON "entries" USING btree ("account_id","posted_at");--> statement-breakpoint
CREATE INDEX "entries_txn_idx" ON "entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");

--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_double_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
  imbalance RECORD;
BEGIN
  FOR imbalance IN
    SELECT transaction_id, currency,
           SUM(CASE WHEN direction = 'DEBIT'  THEN amount ELSE 0 END) AS debits,
           SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS credits
    FROM entries
    WHERE transaction_id IN (
      SELECT DISTINCT transaction_id FROM new_entries
    )
    GROUP BY transaction_id, currency
  LOOP
    IF imbalance.debits <> imbalance.credits THEN
      RAISE EXCEPTION
        'Double-entry violation: transaction % currency % debits=% credits=%',
        imbalance.transaction_id, imbalance.currency,
        imbalance.debits, imbalance.credits;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE CONSTRAINT TRIGGER entries_balanced_check
AFTER INSERT ON entries
DEFERRABLE INITIALLY DEFERRED
REFERENCING NEW TABLE AS new_entries
FOR EACH STATEMENT
EXECUTE FUNCTION assert_double_entry_balanced();
