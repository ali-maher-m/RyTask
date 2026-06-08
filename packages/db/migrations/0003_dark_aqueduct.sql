CREATE TYPE "public"."capture_source" AS ENUM('WEB', 'SLACK', 'MCP', 'API');--> statement-breakpoint
CREATE TABLE "slack_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"slack_workspace_id" uuid NOT NULL,
	"slack_user_id" text NOT NULL,
	"slack_user_name" text,
	"slack_user_email" text,
	"user_id" uuid,
	"mapped_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slack_team_id" text NOT NULL,
	"slack_team_name" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_token_ciphertext" text NOT NULL,
	"bot_token_iv" text NOT NULL,
	"bot_token_tag" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_project_id" uuid,
	"installed_by_user_id" uuid NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "source" "capture_source" DEFAULT 'WEB' NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_slack_workspace_id_slack_workspaces_id_fk" FOREIGN KEY ("slack_workspace_id") REFERENCES "public"."slack_workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_users" ADD CONSTRAINT "slack_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_default_project_id_projects_id_fk" FOREIGN KEY ("default_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_workspaces" ADD CONSTRAINT "slack_workspaces_installed_by_user_id_users_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_user_org_ws_uid_unique" ON "slack_users" USING btree ("organization_id","slack_workspace_id","slack_user_id");--> statement-breakpoint
CREATE INDEX "slack_user_org_idx" ON "slack_users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "slack_user_org_user_idx" ON "slack_users" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "slack_user_email_idx" ON "slack_users" USING btree ("organization_id","slack_user_email");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_ws_team_unique" ON "slack_workspaces" USING btree ("slack_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_ws_org_team_unique" ON "slack_workspaces" USING btree ("organization_id","slack_team_id");--> statement-breakpoint
CREATE INDEX "slack_ws_org_idx" ON "slack_workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "slack_ws_org_workspace_idx" ON "slack_workspaces" USING btree ("organization_id","workspace_id");