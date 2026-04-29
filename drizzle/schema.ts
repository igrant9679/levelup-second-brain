import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

export const userLearningPreferences = mysqlTable('user_learning_preferences', {
  userId: int('userId').primaryKey(),
  showCoachMascot: int('showCoachMascot').notNull().default(1),
  showProactiveHints: int('showProactiveHints').notNull().default(1),
  completedOnboarding: int('completedOnboarding').notNull().default(0),
  preferredTourSpeed: mysqlEnum('preferredTourSpeed', ['slow', 'normal', 'fast']).default('normal'),
});