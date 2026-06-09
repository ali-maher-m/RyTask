CREATE TYPE "public"."time_entry_class" AS ENUM('PLANNED', 'INTERRUPTION');--> statement-breakpoint
CREATE TYPE "public"."time_entry_source" AS ENUM('TIMER', 'MANUAL', 'SLACK', 'MCP', 'API');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'TIME_STARTED';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'TIME_STOPPED';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'TIME_LOGGED';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'TIME_EDITED';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'TIME_DELETED';--> statement-breakpoint
CREATE TABLE "time_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"user_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"note" text,
	"billable" boolean DEFAULT false NOT NULL,
	"source" time_entry_source NOT NULL,
	"classification" time_entry_class NOT NULL,
	"classification_overridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_logs" ADD CONSTRAINT "time_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_logs_org_work_item_idx" ON "time_logs" USING btree ("organization_id","work_item_id");--> statement-breakpoint
CREATE INDEX "time_logs_org_project_started_idx" ON "time_logs" USING btree ("organization_id","project_id","started_at");--> statement-breakpoint
CREATE INDEX "time_logs_org_user_started_idx" ON "time_logs" USING btree ("organization_id","user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timers_org_user_unique" ON "timers" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "timers_org_work_item_idx" ON "timers" USING btree ("organization_id","work_item_id");