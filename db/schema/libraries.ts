import {
  pgTable, pgEnum, uuid, text, timestamp, primaryKey,
  customType, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { authUsers } from './auth'

export const libraryRole = pgEnum('library_role', ['owner', 'admin'])

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType: () => 'bytea',
})

export const libraries = pgTable('libraries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => authUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const libraryMembers = pgTable(
  'library_members',
  {
    libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    role: libraryRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.libraryId, t.userId] }),
    oneOwner: uniqueIndex('idx_library_members_one_owner')
      .on(t.libraryId)
      .where(sql`role = 'owner'`),
    userIdx: index('idx_library_members_user').on(t.userId),
  }),
)

export const libraryInvites = pgTable(
  'library_invites',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    role: libraryRole('role').notNull(),
    invitedEmail: text('invited_email'),
    invitedPhone: text('invited_phone'),
    tokenHash: bytea('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => authUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull().default(sql`now() + interval '7 days'`),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => authUsers.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('library_invites_token_hash_key').on(t.tokenHash),
    libraryIdx: index('idx_invites_library').on(t.libraryId),
    hasTarget: check(
      'library_invites_target_check',
      sql`${t.invitedEmail} IS NOT NULL OR ${t.invitedPhone} IS NOT NULL`,
    ),
    terminalExclusive: check(
      'library_invites_terminal_exclusive',
      sql`${t.acceptedAt} IS NULL OR ${t.revokedAt} IS NULL`,
    ),
    acceptPair: check(
      'library_invites_accept_pair',
      sql`(${t.acceptedAt} IS NULL) = (${t.acceptedBy} IS NULL)`,
    ),
    // Postgres requires IMMUTABLE functions in index predicates, so `now()` can't
    // be part of the WHERE clause. fn_send_invite must revoke/delete expired
    // invites before issuing a new one for the same email/phone.
    pendingEmail: uniqueIndex('idx_invites_pending_email')
      .on(t.libraryId, sql`lower(${t.invitedEmail})`)
      .where(sql`${t.invitedEmail} IS NOT NULL AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
    pendingPhone: uniqueIndex('idx_invites_pending_phone')
      .on(t.libraryId, t.invitedPhone)
      .where(sql`${t.invitedPhone} IS NOT NULL AND ${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  }),
)

export type Library = typeof libraries.$inferSelect
export type LibraryMember = typeof libraryMembers.$inferSelect
export type LibraryInvite = typeof libraryInvites.$inferSelect
