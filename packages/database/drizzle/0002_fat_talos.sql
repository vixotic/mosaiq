CREATE TABLE "owner_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "owner_sessions_token_hash_uidx" ON "owner_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "owner_sessions_expiry_idx" ON "owner_sessions" USING btree ("expires_at");