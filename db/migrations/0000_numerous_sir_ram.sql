CREATE TYPE "public"."library_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."acquisition_status" AS ENUM('owned', 'wishlist');--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"email" text,
	"phone" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"role" "library_role" NOT NULL,
	"invited_email" text,
	"invited_phone" text,
	"token_hash" "bytea" NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "library_invites_target_check" CHECK ("library_invites"."invited_email" IS NOT NULL OR "library_invites"."invited_phone" IS NOT NULL),
	CONSTRAINT "library_invites_terminal_exclusive" CHECK ("library_invites"."accepted_at" IS NULL OR "library_invites"."revoked_at" IS NULL),
	CONSTRAINT "library_invites_accept_pair" CHECK (("library_invites"."accepted_at" IS NULL) = ("library_invites"."accepted_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "library_members" (
	"library_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "library_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_members_library_id_user_id_pk" PRIMARY KEY("library_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"isbn" text,
	"cover_url" text,
	"acquisition" "acquisition_status" DEFAULT 'owned' NOT NULL,
	"purchase_date" date,
	"purchase_price" numeric(12, 2),
	"purchase_currency" char(3),
	"purchase_source" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_id_library_unique" UNIQUE("id","library_id"),
	CONSTRAINT "books_price_nonneg" CHECK ("books"."purchase_price" IS NULL OR "books"."purchase_price" >= 0),
	CONSTRAINT "books_price_currency_pair" CHECK (("books"."purchase_price" IS NULL) = ("books"."purchase_currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "borrowers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "borrowers_id_library_unique" UNIQUE("id","library_id")
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"borrower_id" uuid NOT NULL,
	"lent_date" date NOT NULL,
	"expected_return_date" date,
	"returned_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_expected_after_lent" CHECK ("loans"."expected_return_date" IS NULL OR "loans"."expected_return_date" >= "loans"."lent_date"),
	CONSTRAINT "loans_returned_after_lent" CHECK ("loans"."returned_date" IS NULL OR "loans"."returned_date" >= "loans"."lent_date")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "libraries" ADD CONSTRAINT "libraries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_invites" ADD CONSTRAINT "library_invites_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_invites" ADD CONSTRAINT "library_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_invites" ADD CONSTRAINT "library_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_members" ADD CONSTRAINT "library_members_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_members" ADD CONSTRAINT "library_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_purchase_currency_currencies_code_fk" FOREIGN KEY ("purchase_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrowers" ADD CONSTRAINT "borrowers_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_book_library_fk" FOREIGN KEY ("book_id","library_id") REFERENCES "public"."books"("id","library_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrower_library_fk" FOREIGN KEY ("borrower_id","library_id") REFERENCES "public"."borrowers"("id","library_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_invites_token_hash_key" ON "library_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_invites_library" ON "library_invites" USING btree ("library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invites_pending_email" ON "library_invites" USING btree ("library_id",lower("invited_email")) WHERE "library_invites"."invited_email" IS NOT NULL AND "library_invites"."accepted_at" IS NULL AND "library_invites"."revoked_at" IS NULL AND "library_invites"."expires_at" > now();--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invites_pending_phone" ON "library_invites" USING btree ("library_id","invited_phone") WHERE "library_invites"."invited_phone" IS NOT NULL AND "library_invites"."accepted_at" IS NULL AND "library_invites"."revoked_at" IS NULL AND "library_invites"."expires_at" > now();--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_members_one_owner" ON "library_members" USING btree ("library_id") WHERE role = 'owner';--> statement-breakpoint
CREATE INDEX "idx_library_members_user" ON "library_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_books_library_isbn" ON "books" USING btree ("library_id","isbn") WHERE "books"."isbn" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_books_library_acquisition" ON "books" USING btree ("library_id","acquisition");--> statement-breakpoint
CREATE INDEX "idx_borrowers_library" ON "borrowers" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "idx_loans_book" ON "loans" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "idx_loans_borrower" ON "loans" USING btree ("borrower_id");--> statement-breakpoint
CREATE INDEX "idx_loans_library" ON "loans" USING btree ("library_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_loans_one_active" ON "loans" USING btree ("book_id") WHERE "loans"."returned_date" IS NULL;