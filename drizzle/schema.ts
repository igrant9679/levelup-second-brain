import { int, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// OAuth tokens table for storing Microsoft Graph and Google Workspace tokens
export const oauthTokens = mysqlTable("oauth_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: varchar("provider", { length: 32 }).notNull(), // 'microsoft' | 'google'
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt").notNull(),
  scope: text("scope"),
  email: varchar("email", { length: 320 }),
  displayName: text("displayName"),
  lastSyncedAt: timestamp("lastSyncedAt"), // Last time calendar/mail was synced from this provider
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OAuthToken = typeof oauthTokens.$inferSelect;
export type InsertOAuthToken = typeof oauthTokens.$inferInsert;

// ─── Help Center ─────────────────────────────────────────────────────────────
export const helpCategories = mysqlTable('help_categories', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 32 }).notNull().default('📄'),
  sortOrder: int('sortOrder').notNull().default(0),
});
export type HelpCategory = typeof helpCategories.$inferSelect;

export const helpArticles = mysqlTable('help_articles', {
  id: int('id').autoincrement().primaryKey(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  title: varchar('title', { length: 256 }).notNull(),
  summary: text('summary'),
  bodyMarkdown: text('bodyMarkdown'),
  categoryId: int('categoryId'),
  tags: text('tags'),
  status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
  associatedTourId: int('associatedTourId'),
  authorId: int('authorId'),
  viewCount: int('viewCount').notNull().default(0),
  helpfulCount: int('helpfulCount').notNull().default(0),
  notHelpfulCount: int('notHelpfulCount').notNull().default(0),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type HelpArticle = typeof helpArticles.$inferSelect;

export const helpSearchLog = mysqlTable('help_search_log', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId'),
  query: varchar('query', { length: 512 }).notNull(),
  resultsCount: int('resultsCount').notNull().default(0),
  clickedResultId: int('clickedResultId'),
  satisfied: mysqlEnum('satisfied', ['yes', 'no', 'unknown']).default('unknown'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

export const aiHelpConversations = mysqlTable('ai_help_conversations', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  startedAt: timestamp('startedAt').defaultNow().notNull(),
  lastMessageAt: timestamp('lastMessageAt').defaultNow().notNull(),
});

export const aiHelpMessages = mysqlTable('ai_help_messages', {
  id: int('id').autoincrement().primaryKey(),
  conversationId: int('conversationId').notNull(),
  role: mysqlEnum('role', ['user', 'assistant']).notNull(),
  body: text('body').notNull(),
  citedArticleIds: text('citedArticleIds'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

// ─── Guided Tours ─────────────────────────────────────────────────────────────
export const tours = mysqlTable('tours', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  type: mysqlEnum('type', ['onboarding', 'feature', 'whats_new', 'custom']).notNull().default('feature'),
  roleTags: text('roleTags'),
  estimatedMinutes: int('estimatedMinutes').notNull().default(3),
  prerequisiteTourId: int('prerequisiteTourId'),
  status: mysqlEnum('status', ['draft', 'published']).default('draft').notNull(),
  createdBy: int('createdBy'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type Tour = typeof tours.$inferSelect;

export const tourSteps = mysqlTable('tour_steps', {
  id: int('id').autoincrement().primaryKey(),
  tourId: int('tourId').notNull(),
  sortOrder: int('sortOrder').notNull().default(0),
  targetSelector: varchar('targetSelector', { length: 512 }),
  targetDataTourId: varchar('targetDataTourId', { length: 128 }),
  title: varchar('title', { length: 256 }).notNull(),
  bodyMarkdown: text('bodyMarkdown'),
  visualTreatment: mysqlEnum('visualTreatment', ['spotlight', 'pulse', 'arrow', 'coach']).default('spotlight'),
  advanceCondition: mysqlEnum('advanceCondition', ['next_button', 'element_clicked', 'form_field_filled', 'route_changed', 'custom_event']).default('next_button'),
  advanceConfig: text('advanceConfig'),
  skipAllowed: int('skipAllowed').notNull().default(1),
  backAllowed: int('backAllowed').notNull().default(1),
  branchingRules: text('branchingRules'),
});
export type TourStep = typeof tourSteps.$inferSelect;

export const userTourProgress = mysqlTable('user_tour_progress', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  tourId: int('tourId').notNull(),
  status: mysqlEnum('status', ['not_started', 'in_progress', 'completed', 'skipped']).default('not_started').notNull(),
  currentStep: int('currentStep').notNull().default(0),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
  lastResumedAt: timestamp('lastResumedAt'),
});

// ─── OneNote Import ──────────────────────────────────────────────────────────
export const onenoteImportJobs = mysqlTable('onenote_import_jobs', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed']).notNull().default('pending'),
  // What was selected to import
  notebookId: varchar('notebookId', { length: 256 }),
  notebookName: varchar('notebookName', { length: 256 }),
  sectionId: varchar('sectionId', { length: 256 }),   // null = all sections
  sectionName: varchar('sectionName', { length: 256 }),
  pageId: varchar('pageId', { length: 256 }),          // null = all pages in section
  // Progress counters
  totalPages: int('totalPages').notNull().default(0),
  importedPages: int('importedPages').notNull().default(0),
  failedPages: int('failedPages').notNull().default(0),
  errorMessage: text('errorMessage'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  completedAt: timestamp('completedAt'),
});
export type OnenoteImportJob = typeof onenoteImportJobs.$inferSelect;
export type InsertOnenoteImportJob = typeof onenoteImportJobs.$inferInsert;

// ─── Password Reset Tokens ──────────────────────────────────────────────────
export const passwordResetTokens = mysqlTable('password_reset_tokens', {
  id: int('id').autoincrement().primaryKey(),
  token: varchar('token', { length: 128 }).notNull().unique(),
  userId: int('userId').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  usedAt: timestamp('usedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export const userLearningPreferences = mysqlTable('user_learning_preferences', {
  userId: int('userId').primaryKey(),
  showCoachMascot: int('showCoachMascot').notNull().default(1),
  showProactiveHints: int('showProactiveHints').notNull().default(1),
  completedOnboarding: int('completedOnboarding').notNull().default(0),
  preferredTourSpeed: mysqlEnum('preferredTourSpeed', ['slow', 'normal', 'fast']).default('normal'),
});

// ─── Per-User OAuth App Credentials ─────────────────────────────────────────
// Each user can store their own OAuth app Client ID + Secret so they can
// connect their own Microsoft / Google accounts independently.
export const userOauthCredentials = mysqlTable('user_oauth_credentials', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google'
  clientId: varchar('clientId', { length: 512 }).notNull(),
  clientSecret: text('clientSecret').notNull(),
  // Admin can mark their credentials as shared so team members can use them (1=shared, 0=private)
  sharedWithTeam: tinyint('sharedWithTeam').default(0).notNull(),
  // Timestamp of last successful credential verification (via validateCredentials)
  lastVerifiedAt: timestamp('lastVerifiedAt').default(sql`null`),
  // Optional Azure AD Tenant ID (Directory ID) — required for single-tenant app registrations.
  // When set, OAuth URLs use the tenant-specific endpoint instead of /common.
  tenantId: varchar('tenantId', { length: 128 }),
  // Comma-separated Microsoft Graph scopes the user has selected (e.g. 'Mail.ReadWrite,Calendars.ReadWrite,Contacts.ReadWrite')
  // NULL means use all default scopes. Only applies to Microsoft provider.
  msScopes: varchar('msScopes', { length: 512 }),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type UserOauthCredential = typeof userOauthCredentials.$inferSelect;
export type InsertUserOauthCredential = typeof userOauthCredentials.$inferInsert;

// ─── SMTP/IMAP Secondary Email Accounts ────────────────────────────────────
// Store SMTP/IMAP credentials for secondary email accounts (non-OAuth)
export const smtpImapAccounts = mysqlTable('smtp_imap_accounts', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  displayName: varchar('displayName', { length: 255 }),
  // IMAP settings
  imapHost: varchar('imapHost', { length: 255 }).notNull(),
  imapPort: int('imapPort').notNull().default(993),
  imapEncryption: mysqlEnum('imapEncryption', ['ssl', 'tls', 'none']).default('ssl').notNull(),
  imapUsername: varchar('imapUsername', { length: 255 }).notNull(),
  imapPassword: text('imapPassword').notNull(), // Encrypted in app layer
  // SMTP settings
  smtpHost: varchar('smtpHost', { length: 255 }).notNull(),
  smtpPort: int('smtpPort').notNull().default(587),
  smtpEncryption: mysqlEnum('smtpEncryption', ['ssl', 'tls', 'none']).default('tls').notNull(),
  smtpUsername: varchar('smtpUsername', { length: 255 }).notNull(),
  smtpPassword: text('smtpPassword').notNull(), // Encrypted in app layer
  // Metadata
  lastTestedAt: timestamp('lastTestedAt').default(sql`null`),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type SmtpImapAccount = typeof smtpImapAccounts.$inferSelect;
export type InsertSmtpImapAccount = typeof smtpImapAccounts.$inferInsert;

// ─── System Settings ─────────────────────────────────────────────────────────
// Key-value store for owner-level configuration (e.g. notification sender).
export const systemSettings = mysqlTable('system_settings', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type SystemSetting = typeof systemSettings.$inferSelect;

// ─── Credential Audit Log ────────────────────────────────────────────────────
// Tracks save/clear actions on per-user OAuth app credentials.
export const credentialAuditLog = mysqlTable('credential_audit_log', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),           // whose credential was changed
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google'
  action: mysqlEnum('action', ['saved', 'cleared']).notNull(),
  performedBy: int('performedBy').notNull(), // userId of who made the change
  performedByName: varchar('performedByName', { length: 256 }),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
export type CredentialAuditLog = typeof credentialAuditLog.$inferSelect;
export type InsertCredentialAuditLog = typeof credentialAuditLog.$inferInsert;

// ─── Email Delivery Log ──────────────────────────────────────────────────────
// Records every sendEmail() attempt (success or failure) for auditability.
export const emailDeliveryLog = mysqlTable('email_delivery_log', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId'),                          // sender's userId (null = system)
  to: varchar('to', { length: 320 }).notNull(),
  subject: varchar('subject', { length: 512 }).notNull(),
  status: mysqlEnum('status', ['sent', 'failed', 'skipped']).notNull(),
  errorMessage: text('errorMessage'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
export type EmailDeliveryLog = typeof emailDeliveryLog.$inferSelect;
export type InsertEmailDeliveryLog = typeof emailDeliveryLog.$inferInsert;
// ─── Scheduled Task Log ──────────────────────────────────────────────────────
// Records every run of a scheduled task endpoint for observability.
export const scheduledTaskLog = mysqlTable('scheduled_task_log', {
  id: int('id').autoincrement().primaryKey(),
  taskName: varchar('taskName', { length: 128 }).notNull(), // e.g. 'check-expiry'
  ranAt: timestamp('ranAt').defaultNow().notNull(),
  durationMs: int('durationMs'),                // wall-clock time for the run
  emailsSent: int('emailsSent').default(0).notNull(),
  ownerNotified: tinyint('ownerNotified').default(0).notNull(), // 0 = false, 1 = true
  error: text('error'),                         // null on success
});
export type ScheduledTaskLog = typeof scheduledTaskLog.$inferSelect;
export type InsertScheduledTaskLog = typeof scheduledTaskLog.$inferInsert;

// ─── Email Notification Preferences ─────────────────────────────────────────
// Per-user opt-out flags for system-generated emails.
export const emailNotificationPrefs = mysqlTable('email_notification_prefs', {
  userId: int('userId').primaryKey(),
  optOutExpiryEmails: tinyint('optOutExpiryEmails').notNull().default(0), // 0 = subscribed, 1 = opted out
  optOutDigestEmails: tinyint('optOutDigestEmails').notNull().default(0),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type EmailNotificationPrefs = typeof emailNotificationPrefs.$inferSelect;
export type InsertEmailNotificationPrefs = typeof emailNotificationPrefs.$inferInsert;
