CREATE TABLE "ai_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_item_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"model" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"status" text NOT NULL,
	"raw_response" text,
	"validated_result" jsonb,
	"parse_error" text,
	"error_message" text,
	"completed_at" timestamp with time zone,
	"became_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumbnail_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"library_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_library_item_id_pk" PRIMARY KEY("collection_id","library_item_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_item_tags" (
	"library_item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"analysis_run_id" uuid,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_item_tags_origin_run_check" CHECK (("library_item_tags"."origin" = 'user' and "library_item_tags"."analysis_run_id" is null) or ("library_item_tags"."origin" = 'ai' and "library_item_tags"."analysis_run_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"source_url" text,
	"user_title" text,
	"user_description" text,
	"user_notes" text,
	"user_inspiration_reasons" jsonb,
	"user_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_analysis_run_id" uuid,
	"reviewed" boolean DEFAULT false NOT NULL,
	"favourite" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_item_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"job_type" text DEFAULT 'analyze' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_label" text NOT NULL,
	"display_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_analysis_runs" ADD CONSTRAINT "ai_analysis_runs_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item_tags" ADD CONSTRAINT "library_item_tags_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item_tags" ADD CONSTRAINT "library_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item_tags" ADD CONSTRAINT "library_item_tags_analysis_run_id_ai_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."ai_analysis_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_library_item_id_library_items_id_fk" FOREIGN KEY ("library_item_id") REFERENCES "public"."library_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_item_created_idx" ON "ai_analysis_runs" USING btree ("library_item_id","created_at");--> statement-breakpoint
CREATE INDEX "analysis_runs_provider_status_idx" ON "ai_analysis_runs" USING btree ("provider_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_content_hash_uidx" ON "assets" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_storage_key_uidx" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "collection_items_library_item_idx" ON "collection_items" USING btree ("library_item_id");--> statement-breakpoint
CREATE INDEX "collections_name_idx" ON "collections" USING btree ("name");--> statement-breakpoint
CREATE INDEX "library_item_tags_tag_idx" ON "library_item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "library_item_tags_item_origin_idx" ON "library_item_tags" USING btree ("library_item_id","origin","dismissed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_item_tags_user_uidx" ON "library_item_tags" USING btree ("library_item_id","tag_id") WHERE "library_item_tags"."origin" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "library_item_tags_ai_uidx" ON "library_item_tags" USING btree ("library_item_id","tag_id","analysis_run_id") WHERE "library_item_tags"."origin" = 'ai';--> statement-breakpoint
CREATE INDEX "library_items_asset_idx" ON "library_items" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "library_items_created_idx" ON "library_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "library_items_reviewed_idx" ON "library_items" USING btree ("reviewed");--> statement-breakpoint
CREATE INDEX "library_items_favourite_idx" ON "library_items" USING btree ("favourite");--> statement-breakpoint
CREATE INDEX "library_items_visible_idx" ON "library_items" USING btree ("created_at") WHERE "library_items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "processing_jobs_claim_idx" ON "processing_jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_item_idx" ON "processing_jobs" USING btree ("library_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_jobs_active_uidx" ON "processing_jobs" USING btree ("library_item_id","provider_id","job_type") WHERE "processing_jobs"."status" in ('pending', 'processing');--> statement-breakpoint
CREATE UNIQUE INDEX "tags_normalized_label_uidx" ON "tags" USING btree ("normalized_label");