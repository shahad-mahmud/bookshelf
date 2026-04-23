CREATE TABLE "author_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DROP INDEX "idx_invites_pending_email";--> statement-breakpoint
DROP INDEX "idx_invites_pending_phone";--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "author_id" uuid;--> statement-breakpoint
ALTER TABLE "author_aliases" ADD CONSTRAINT "author_aliases_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_author_aliases_author" ON "author_aliases" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invites_pending_email" ON "library_invites" USING btree ("library_id",lower("invited_email")) WHERE "library_invites"."invited_email" IS NOT NULL AND "library_invites"."accepted_at" IS NULL AND "library_invites"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invites_pending_phone" ON "library_invites" USING btree ("library_id","invited_phone") WHERE "library_invites"."invited_phone" IS NOT NULL AND "library_invites"."accepted_at" IS NULL AND "library_invites"."revoked_at" IS NULL;--> statement-breakpoint
INSERT INTO "authors" ("name")
SELECT DISTINCT TRIM("author")
FROM "books"
WHERE "author" IS NOT NULL AND TRIM("author") <> ''
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
UPDATE "books" b
SET "author_id" = a."id"
FROM "authors" a
WHERE TRIM(b."author") = a."name"
  AND b."author" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "books" DROP COLUMN "author";