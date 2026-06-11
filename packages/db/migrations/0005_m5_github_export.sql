CREATE TYPE "public"."github_link_kind" AS ENUM('COMMIT', 'PR');--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'GITHUB_LINKED';--> statement-breakpoint
CREATE TABLE "github_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_full_name" text NOT NULL,
	"webhook_secret_ciphertext" text NOT NULL,
	"webhook_secret_iv" text NOT NULL,
	"webhook_secret_tag" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_item_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" "github_link_kind" NOT NULL,
	"external_ref" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"author_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_links" ADD CONSTRAINT "github_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_links" ADD CONSTRAINT "github_links_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_links" ADD CONSTRAINT "github_links_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_conn_org_idx" ON "github_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_conn_org_repo_unique" ON "github_connections" USING btree ("organization_id","repo_full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "github_links_item_ref_unique" ON "github_links" USING btree ("organization_id","work_item_id","kind","external_ref");--> statement-breakpoint
CREATE INDEX "github_links_org_item_idx" ON "github_links" USING btree ("organization_id","work_item_id");