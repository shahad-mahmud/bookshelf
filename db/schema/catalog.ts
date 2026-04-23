import {
  pgTable, pgEnum, uuid, text, timestamp, date, numeric, char,
  uniqueIndex, index, foreignKey, check, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { libraries } from './libraries'

export const acquisitionStatus = pgEnum('acquisition_status', ['owned', 'wishlist'])

export const currencies = pgTable('currencies', {
  code: char('code', { length: 3 }).primaryKey(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
})

export const authors = pgTable('authors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authorAliases = pgTable(
  'author_aliases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    authorId: uuid('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    authorIdx: index('idx_author_aliases_author').on(t.authorId),
  }),
)

export const borrowers = pgTable(
  'borrowers',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contact: text('contact'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    libraryIdx: index('idx_borrowers_library').on(t.libraryId),
    idLibrary: unique('borrowers_id_library_unique').on(t.id, t.libraryId),
  }),
)

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    isbn: text('isbn'),
    coverUrl: text('cover_url'),
    acquisition: acquisitionStatus('acquisition').notNull().default('owned'),
    purchaseDate: date('purchase_date'),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    purchaseCurrency: char('purchase_currency', { length: 3 }).references(() => currencies.code),
    purchaseSource: text('purchase_source'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    libraryIsbn: uniqueIndex('idx_books_library_isbn')
      .on(t.libraryId, t.isbn)
      .where(sql`${t.isbn} IS NOT NULL`),
    idLibrary: unique('books_id_library_unique').on(t.id, t.libraryId),
    libraryAcq: index('idx_books_library_acquisition').on(t.libraryId, t.acquisition),
    priceNonNeg: check('books_price_nonneg', sql`${t.purchasePrice} IS NULL OR ${t.purchasePrice} >= 0`),
    priceCurrencyPair: check(
      'books_price_currency_pair',
      sql`(${t.purchasePrice} IS NULL) = (${t.purchaseCurrency} IS NULL)`,
    ),
  }),
)

export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    libraryId: uuid('library_id').notNull(),
    bookId: uuid('book_id').notNull(),
    borrowerId: uuid('borrower_id').notNull(),
    lentDate: date('lent_date').notNull(),
    expectedReturnDate: date('expected_return_date'),
    returnedDate: date('returned_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookFk: foreignKey({
      columns: [t.bookId, t.libraryId],
      foreignColumns: [books.id, books.libraryId],
      name: 'loans_book_library_fk',
    }).onDelete('cascade'),
    borrowerFk: foreignKey({
      columns: [t.borrowerId, t.libraryId],
      foreignColumns: [borrowers.id, borrowers.libraryId],
      name: 'loans_borrower_library_fk',
    }).onDelete('restrict'),
    bookIdx: index('idx_loans_book').on(t.bookId),
    borrowerIdx: index('idx_loans_borrower').on(t.borrowerId),
    libraryIdx: index('idx_loans_library').on(t.libraryId),
    oneActive: uniqueIndex('idx_loans_one_active').on(t.bookId).where(sql`${t.returnedDate} IS NULL`),
    expectedCoherent: check(
      'loans_expected_after_lent',
      sql`${t.expectedReturnDate} IS NULL OR ${t.expectedReturnDate} >= ${t.lentDate}`,
    ),
    returnedCoherent: check(
      'loans_returned_after_lent',
      sql`${t.returnedDate} IS NULL OR ${t.returnedDate} >= ${t.lentDate}`,
    ),
  }),
)

export type Currency = typeof currencies.$inferSelect
export type Author = typeof authors.$inferSelect
export type AuthorAlias = typeof authorAliases.$inferSelect
export type Borrower = typeof borrowers.$inferSelect
export type Book = typeof books.$inferSelect
export type Loan = typeof loans.$inferSelect
