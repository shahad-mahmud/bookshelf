CREATE TYPE "public"."contributor_role" AS ENUM('author', 'translator', 'editor', 'illustrator');--> statement-breakpoint
CREATE TABLE "book_contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"role" "contributor_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_contributors_unique" UNIQUE("book_id","author_id","role")
);
--> statement-breakpoint
ALTER TABLE "books" DROP CONSTRAINT "books_author_id_authors_id_fk";
--> statement-breakpoint
ALTER TABLE "book_contributors" ADD CONSTRAINT "book_contributors_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_contributors" ADD CONSTRAINT "book_contributors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_book_contributors_book" ON "book_contributors" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_book_contributors_author" ON "book_contributors" USING btree ("author_id");--> statement-breakpoint
--> statement-breakpoint
INSERT INTO "book_contributors" ("book_id", "author_id", "role")
SELECT "id", "author_id", 'author'
FROM "books"
WHERE "author_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "books" DROP COLUMN "author_id";