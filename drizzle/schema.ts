import { index, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, tinyint, unique, varchar } from "drizzle-orm/mysql-core";
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
  autoSyncEnabled: tinyint("autoSyncEnabled").default(1).notNull(), // 1 = enabled, 0 = disabled
  syncFrequency: mysqlEnum("syncFrequency", ["manual", "every5min", "every15min", "every30min", "hourly"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Ensure only one token row per user per provider so upsert works correctly
  uniqueUserProvider: unique('uq_oauth_token_user_provider').on(t.userId, t.provider),
}));

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
  imapPassword: text('imapPassword').notNull(),
  // SMTP settings
  smtpHost: varchar('smtpHost', { length: 255 }).notNull(),
  smtpPort: int('smtpPort').notNull().default(587),
  smtpEncryption: mysqlEnum('smtpEncryption', ['ssl', 'tls', 'none']).default('tls').notNull(),
  smtpUsername: varchar('smtpUsername', { length: 255 }).notNull(),
  smtpPassword: text('smtpPassword').notNull(),
  // Metadata
  lastTestedAt: timestamp('lastTestedAt').default(sql`null`),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // One SMTP/IMAP account per user — ensures onDuplicateKeyUpdate works as an upsert
  uniqueUserId: unique('uq_smtp_imap_user').on(t.userId),
}));
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


// ─── Email Notifications ────────────────────────────────────────────────────
// Track notifications sent to users when new emails arrive
export const emailNotifications = mysqlTable('email_notifications', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'smtp_imap'
  emailSubject: text('emailSubject').notNull(),
  emailFrom: varchar('emailFrom', { length: 320 }).notNull(),
  emailId: varchar('emailId', { length: 255 }).notNull(),
  read: tinyint('read').default(0).notNull(), // 0 = unread, 1 = read
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
  // Prevent duplicate notifications for the same email across repeated syncs
  uniqueUserEmail: unique('uq_email_notif_user_email').on(t.userId, t.emailId),
}));
export type EmailNotification = typeof emailNotifications.$inferSelect;
export type InsertEmailNotification = typeof emailNotifications.$inferInsert;

// ─── Calendar Event Reminders ───────────────────────────────────────────────
// Track reminders for upcoming calendar events
export const eventReminders = mysqlTable('event_reminders', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google'
  eventId: varchar('eventId', { length: 255 }).notNull(),
  eventTitle: text('eventTitle').notNull(),
  eventStart: timestamp('eventStart').notNull(),
  reminderType: mysqlEnum('reminderType', ['5min', '15min', '1hour']).notNull(),
  sent: tinyint('sent').default(0).notNull(), // 0 = pending, 1 = sent
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});
export type EventReminder = typeof eventReminders.$inferSelect;
export type InsertEventReminder = typeof eventReminders.$inferInsert;

// ─── Calendar Events ────────────────────────────────────────────────────────
// Persisted calendar events synced from Microsoft/Google
export const calendarEvents = mysqlTable('calendar_events', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google'
  eventId: varchar('eventId', { length: 512 }).notNull(),  // provider-native event ID
  title: text('title').notNull(),
  start: timestamp('start').notNull(),
  end: timestamp('end').notNull(),
  location: text('location'),
  description: text('description'),
  organizer: varchar('organizer', { length: 320 }),
  isAllDay: tinyint('isAllDay').default(0).notNull(),
  status: varchar('status', { length: 64 }),  // 'confirmed' | 'tentative' | 'cancelled'
  recurrence: varchar('recurrence', { length: 32 }).default('none'),  // 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Prevent duplicate events for the same provider event across repeated syncs
  uniqueUserProviderEvent: unique('uq_cal_event_user_provider').on(t.userId, t.provider, t.eventId),
  // Index for fast date-range queries
  idxUserStart: index('idx_cal_events_user_start').on(t.userId, t.start),
}));
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

// ─── Secret Expiry Reminders ───────────────────────────────────────────────────────
// Tracks expiry dates for OAuth app secrets so users can be reminded before they lapse.
export const secretExpiryReminders = mysqlTable('secret_expiry_reminders', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google'
  label: varchar('label', { length: 128 }).notNull(),      // human-readable name, e.g. "Azure App Secret"
  expiresAt: timestamp('expiresAt').notNull(),             // when the secret expires
  notifyDaysBefore: int('notifyDaysBefore').default(30).notNull(), // how many days before expiry to remind
  lastNotifiedAt: timestamp('lastNotifiedAt'),             // null = not yet notified
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type SecretExpiryReminder = typeof secretExpiryReminders.$inferSelect;
export type InsertSecretExpiryReminder = typeof secretExpiryReminders.$inferInsert;

// ─── Sync Status ────────────────────────────────────────────────────────────
// Track sync statistics for each provider
export const syncStatus = mysqlTable('sync_status', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(), // 'microsoft' | 'google' | 'smtp_imap'
  lastSyncAt: timestamp('lastSyncAt'),
  lastSyncStatus: mysqlEnum('lastSyncStatus', ['success', 'failed', 'pending']).default('pending').notNull(),
  syncErrorMessage: text('syncErrorMessage'),
  totalEventsImported: int('totalEventsImported').default(0).notNull(),
  totalEmailsImported: int('totalEmailsImported').default(0).notNull(),
  totalContactsImported: int('totalContactsImported').default(0).notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});
export type SyncStatus = typeof syncStatus.$inferSelect;
export type InsertSyncStatus = typeof syncStatus.$inferInsert;

// ─── Bookmarks ─────────────────────────────────────────────────────────────
// Web page bookmarks — part of the "Second Brain" knowledge capture system.
export const bookmarks = mysqlTable('bookmarks', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  url: text('url').notNull(),
  title: varchar('title', { length: 512 }),
  description: text('description'),
  favicon: text('favicon'),           // URL to the site's favicon
  ogImage: text('ogImage'),           // Open Graph image URL
  siteName: varchar('siteName', { length: 256 }), // e.g. "GitHub", "Medium"
  tags: text('tags'),                 // JSON array of tag strings, e.g. '["dev","react"]'
  notes: text('notes'),               // user's personal notes about this bookmark
  isRead: tinyint('isRead').default(0).notNull(), // 0 = unread, 1 = read
  isFavorite: tinyint('isFavorite').default(0).notNull(), // 0 = normal, 1 = favorited
  color: varchar('color', { length: 32 }),  // optional color label (matches app color system)
  wordCount: int('wordCount'),              // estimated word count of the page content
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idxUserCreated: index('idx_bookmarks_user_created').on(t.userId, t.createdAt),
}));
export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = typeof bookmarks.$inferInsert;

// Polymorphic links between bookmarks and other entities (ideas, notes)
export const bookmarkLinks = mysqlTable('bookmark_links', {
  id: int('id').autoincrement().primaryKey(),
  bookmarkId: int('bookmarkId').notNull(),
  entityType: varchar('entityType', { length: 32 }).notNull(), // 'idea' | 'note'
  entityId: int('entityId').notNull(),
  userId: int('userId').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
  idxBookmark: index('idx_bl_bookmark').on(t.bookmarkId),
  idxEntity: index('idx_bl_entity').on(t.entityType, t.entityId),
  idxUser: index('idx_bl_user').on(t.userId),
}));
export type BookmarkLink = typeof bookmarkLinks.$inferSelect;
export type InsertBookmarkLink = typeof bookmarkLinks.$inferInsert;

// ─── Bookmark Collections (Folders) ────────────────────────────────────────
// Named collections for organising bookmarks (alternative to tags)
export const bookmarkCollections = mysqlTable('bookmark_collections', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  color: varchar('color', { length: 32 }).default('#3B82F6'), // hex color
  icon: varchar('icon', { length: 8 }).default('📁'),         // emoji icon
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idxUser: index('idx_bc_user').on(t.userId),
}));
export type BookmarkCollection = typeof bookmarkCollections.$inferSelect;
export type InsertBookmarkCollection = typeof bookmarkCollections.$inferInsert;

// Junction table: which bookmarks belong to which collection
export const bookmarkCollectionItems = mysqlTable('bookmark_collection_items', {
  id: int('id').autoincrement().primaryKey(),
  collectionId: int('collectionId').notNull(),
  bookmarkId: int('bookmarkId').notNull(),
  userId: int('userId').notNull(),
  addedAt: timestamp('addedAt').defaultNow().notNull(),
}, (t) => ({
  idxCollection: index('idx_bci_collection').on(t.collectionId),
  idxBookmark: index('idx_bci_bookmark').on(t.bookmarkId),
  uniqueItem: unique('uq_bci_col_bm').on(t.collectionId, t.bookmarkId),
}));
export type BookmarkCollectionItem = typeof bookmarkCollectionItems.$inferSelect;
export type InsertBookmarkCollectionItem = typeof bookmarkCollectionItems.$inferInsert;

// ─── Bookmark Shares ────────────────────────────────────────────────────────
// Shareable links for individual bookmarks or whole collections
export const bookmarkShares = mysqlTable('bookmark_shares', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  token: varchar('token', { length: 64 }).notNull().unique(), // random URL-safe token
  title: varchar('title', { length: 256 }),
  description: text('description'),
  // What is being shared: 'collection' | 'selection'
  shareType: mysqlEnum('shareType', ['collection', 'selection']).notNull().default('selection'),
  collectionId: int('collectionId'),    // set when shareType = 'collection'
  bookmarkIds: text('bookmarkIds'),     // JSON array of bookmark IDs when shareType = 'selection'
  expiresAt: timestamp('expiresAt'),    // null = never expires
  viewCount: int('viewCount').notNull().default(0),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
  idxUser: index('idx_bs_user').on(t.userId),
  idxToken: index('idx_bs_token').on(t.token),
}));
export type BookmarkShare = typeof bookmarkShares.$inferSelect;
export type InsertBookmarkShare = typeof bookmarkShares.$inferInsert;

// ─── Team Invites ────────────────────────────────────────────────────────────
// Admin-generated invite tokens that allow new users to register with a password.
export const teamInvites = mysqlTable('team_invites', {
  id: int('id').autoincrement().primaryKey(),
  /** The admin who created the invite */
  invitedBy: int('invitedBy').notNull(),
  /** Email address the invite was sent to */
  email: varchar('email', { length: 320 }).notNull(),
  /** Display name hint for the invitee */
  name: varchar('name', { length: 128 }),
  /** Role to assign on acceptance */
  role: mysqlEnum('role', ['user', 'admin']).default('user').notNull(),
  /** Cryptographically random URL-safe token */
  token: varchar('token', { length: 64 }).notNull().unique(),
  /** Whether the invite has been accepted */
  accepted: tinyint('accepted').default(0).notNull(),
  /** When the invite was accepted (null if pending) */
  acceptedAt: timestamp('acceptedAt'),
  /** User ID created on acceptance */
  acceptedUserId: int('acceptedUserId'),
  /** When the invite expires (null = 7 days from creation) */
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
  idxInvitedBy: index('idx_ti_invited_by').on(t.invitedBy),
  idxEmail: index('idx_ti_email').on(t.email),
  idxToken: index('idx_ti_token').on(t.token),
}));
export type TeamInvite = typeof teamInvites.$inferSelect;
export type InsertTeamInvite = typeof teamInvites.$inferInsert;

// ─── User Activity Log ───────────────────────────────────────────────────────
// Tracks key engagement actions per user for the Team Activity Feed.
export const userActivityLog = mysqlTable('user_activity_log', {
  id: int('id').autoincrement().primaryKey(),
  /** The user who performed the action */
  userId: int('userId').notNull(),
  /**
   * Action type — one of a fixed set of verbs:
   *   login | task_created | task_completed | note_created | note_updated |
   *   goal_created | habit_completed | bookmark_created | file_uploaded |
   *   calendar_event_created | contact_added | project_created | invite_sent
   */
  action: varchar('action', { length: 64 }).notNull(),
  /** Optional entity type the action applies to (e.g. 'task', 'note') */
  entityType: varchar('entityType', { length: 32 }),
  /** Human-readable title of the entity (e.g. task title, note title) */
  entityTitle: varchar('entityTitle', { length: 255 }),
  /** Optional JSON metadata (e.g. { "taskId": 42, "priority": "high" }) */
  metadata: text('metadata'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
  idxUserId: index('idx_ual_user_id').on(t.userId),
  idxAction: index('idx_ual_action').on(t.action),
  idxCreatedAt: index('idx_ual_created_at').on(t.createdAt),
}));
export type UserActivityLog = typeof userActivityLog.$inferSelect;
export type InsertUserActivityLog = typeof userActivityLog.$inferInsert;

// ─── User App Data ───────────────────────────────────────────────────────────
// Stores each user's full app data as JSON blobs so data survives deployments
// and can be restored across devices/browsers.
export const userAppData = mysqlTable('user_app_data', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull().unique(),
  tasks: mediumtext('tasks'),         // JSON array
  notes: mediumtext('notes'),         // JSON array
  projects: mediumtext('projects'),   // JSON array
  goals: mediumtext('goals'),         // JSON array
  journal: mediumtext('journal'),     // JSON array
  habits: mediumtext('habits'),       // JSON array
  contacts: mediumtext('contacts'),   // JSON array
  ideas: mediumtext('ideas'),         // JSON array
  teams: mediumtext('teams'),         // JSON array
  prefs: text('prefs'),               // JSON object
  calEvents: mediumtext('calEvents'), // JSON array
  clusters: mediumtext('clusters'),   // JSON array of cluster objects
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  idxUserId: index('idx_uad_user_id').on(t.userId),
}));
export type UserAppData = typeof userAppData.$inferSelect;
export type InsertUserAppData = typeof userAppData.$inferInsert;
