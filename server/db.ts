import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { credentialAuditLog, emailDeliveryLog, emailNotificationPrefs, InsertCredentialAuditLog, InsertEmailDeliveryLog, InsertOAuthToken, InsertUser, InsertUserOauthCredential, InsertScheduledTaskLog, oauthTokens, scheduledTaskLog, systemSettings, userOauthCredentials, users, smtpImapAccounts, InsertSmtpImapAccount, SmtpImapAccount } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPasswordHash(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ---- OAuth Token helpers ----

export async function upsertOAuthToken(token: InsertOAuthToken): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn('[Database] Cannot upsert oauth token'); return; }
  await db.insert(oauthTokens).values(token).onDuplicateKeyUpdate({
    set: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? null,
      expiresAt: token.expiresAt,
      scope: token.scope ?? null,
      email: token.email ?? null,
      displayName: token.displayName ?? null,
    },
  });
}

export async function getOAuthToken(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteOAuthToken(userId: number, provider: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)));
}

// ---- Per-User OAuth App Credentials helpers ----

export async function upsertUserOauthCredential(cred: InsertUserOauthCredential): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn('[Database] Cannot upsert user oauth credential'); return; }
  await db.insert(userOauthCredentials).values(cred).onDuplicateKeyUpdate({
    set: {
      clientId: cred.clientId,
      clientSecret: cred.clientSecret,
      tenantId: cred.tenantId ?? null,
      msScopes: (cred as any).msScopes ?? null,
    },
  });
}

export async function getUserOauthCredential(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userOauthCredentials)
    .where(and(eq(userOauthCredentials.userId, userId), eq(userOauthCredentials.provider, provider)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteUserOauthCredential(userId: number, provider: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(userOauthCredentials)
    .where(and(eq(userOauthCredentials.userId, userId), eq(userOauthCredentials.provider, provider)));
}

/** Toggle the sharedWithTeam flag for an admin's credentials */
export async function setCredentialSharing(userId: number, provider: string, shared: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(userOauthCredentials)
    .set({ sharedWithTeam: shared ? 1 : 0 })
    .where(and(eq(userOauthCredentials.userId, userId), eq(userOauthCredentials.provider, provider)));
}

/** Set lastVerifiedAt to now for a user's credentials */
export async function setCredentialLastVerified(userId: number, provider: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(userOauthCredentials)
    .set({ lastVerifiedAt: new Date() })
    .where(and(eq(userOauthCredentials.userId, userId), eq(userOauthCredentials.provider, provider)));
}

/**
 * Find the first admin-owned credential for a provider that has sharedWithTeam=1.
 * Used as a fallback when the requesting user has no own credentials.
 */
export async function getSharedAdminCredential(provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  // Join with users table to filter by admin role
  const result = await db
    .select({ cred: userOauthCredentials })
    .from(userOauthCredentials)
    .innerJoin(users, eq(users.id, userOauthCredentials.userId))
    .where(
      and(
        eq(userOauthCredentials.provider, provider),
        eq(userOauthCredentials.sharedWithTeam, 1),
        eq(users.role, 'admin')
      )
    )
    .limit(1);
  return result.length > 0 ? result[0].cred : undefined;
}

// ---- Credential Audit Log helpers ----

export async function insertCredentialAuditLog(entry: Omit<InsertCredentialAuditLog, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(credentialAuditLog).values(entry);
}

export async function getCredentialAuditLog(userId: number, provider: string, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(credentialAuditLog)
    .where(and(eq(credentialAuditLog.userId, userId), eq(credentialAuditLog.provider, provider)))
    .orderBy(desc(credentialAuditLog.createdAt))
    .limit(limit);
}

// ---- System Settings helpers ----

export async function getSystemSetting(key: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return result.length > 0 ? result[0].value : undefined;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(systemSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

// ---- Email Delivery Log helpers ----

export async function insertEmailDeliveryLog(
  entry: Omit<InsertEmailDeliveryLog, 'id' | 'createdAt'>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(emailDeliveryLog).values(entry);
  } catch (err) {
    // Never let logging failures bubble up and break the caller
    console.warn('[Database] Failed to insert email delivery log:', err);
  }
}

export async function getEmailDeliveryLog(userId: number, limit = 5) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailDeliveryLog)
    .where(eq(emailDeliveryLog.userId, userId))
    .orderBy(desc(emailDeliveryLog.createdAt))
    .limit(limit);
}

export async function getAdminEmailDeliveryLog(opts: {
  status?: 'sent' | 'failed' | 'skipped';
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { entries: [], total: 0 };
  const { status, from, to, page = 1, pageSize = 20 } = opts;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(emailDeliveryLog.status, status));
  if (from) conditions.push(gte(emailDeliveryLog.createdAt, from));
  if (to) conditions.push(lte(emailDeliveryLog.createdAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [entries, countRows] = await Promise.all([
    db.select({
      id: emailDeliveryLog.id,
      userId: emailDeliveryLog.userId,
      to: emailDeliveryLog.to,
      subject: emailDeliveryLog.subject,
      status: emailDeliveryLog.status,
      errorMessage: emailDeliveryLog.errorMessage,
      createdAt: emailDeliveryLog.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(emailDeliveryLog)
    .leftJoin(users, eq(users.id, emailDeliveryLog.userId))
    .where(where)
    .orderBy(desc(emailDeliveryLog.createdAt))
    .limit(pageSize)
    .offset(offset),
    db.select({ count: sql<number>`count(*)` })
    .from(emailDeliveryLog)
    .where(where),
  ]);

  return { entries, total: Number(countRows[0]?.count ?? 0) };
}

/** Return all oauth tokens that expire within the given number of days. */
export async function getAllExpiringTokens(withinDays = 3) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return db.select({
    userId: oauthTokens.userId,
    provider: oauthTokens.provider,
    expiresAt: oauthTokens.expiresAt,
    email: oauthTokens.email,
    displayName: oauthTokens.displayName,
    userName: users.name,
    userEmail: users.email,
  })
  .from(oauthTokens)
  .innerJoin(users, eq(users.id, oauthTokens.userId))
  .where(lte(oauthTokens.expiresAt, cutoff));
}

// Get all connected OAuth accounts across all users (for owner notification sender picker)
export async function getAllConnectedOAuthAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: oauthTokens.userId,
    provider: oauthTokens.provider,
    email: oauthTokens.email,
    displayName: oauthTokens.displayName,
    userName: users.name,
  })
  .from(oauthTokens)
  .innerJoin(users, eq(users.id, oauthTokens.userId));
}

// ─── Scheduled Task Log ──────────────────────────────────────────────────────

/** Insert a record for a completed scheduled task run. */
export async function insertScheduledTaskLog(entry: InsertScheduledTaskLog): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scheduledTaskLog).values(entry);
}

/** Return the last N runs for a given task name (or all tasks if taskName is omitted). */
export async function getScheduledTaskLog(limit = 20, taskName?: string) {
  const db = await getDb();
  if (!db) return [];
  const q = db
    .select()
    .from(scheduledTaskLog)
    .orderBy(desc(scheduledTaskLog.ranAt))
    .limit(limit);
  if (taskName) {
    return q.where(eq(scheduledTaskLog.taskName, taskName));
  }
  return q;
}

/** Delete scheduled_task_log rows whose ranAt is older than the given cutoff timestamp (ms). */
export async function deleteOldScheduledTaskLogs(cutoffMs: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoffDate = new Date(cutoffMs);
  const result = await db
    .delete(scheduledTaskLog)
    .where(lte(scheduledTaskLog.ranAt, cutoffDate));
  // mysql2 returns an OkPacket; affectedRows is the count
  return (result as any)?.[0]?.affectedRows ?? 0;
}

/** Delete email_delivery_log rows whose createdAt is older than the given cutoff timestamp (ms). */
export async function deleteOldEmailDeliveryLogs(cutoffMs: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoffDate = new Date(cutoffMs);
  const result = await db
    .delete(emailDeliveryLog)
    .where(lte(emailDeliveryLog.createdAt, cutoffDate));
  return (result as any)?.[0]?.affectedRows ?? 0;
}

// ─── Email Notification Preferences ─────────────────────────────────────────

/** Get the email notification preferences for a user (returns null if not set). */
export async function getEmailNotifPrefs(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(emailNotificationPrefs)
    .where(eq(emailNotificationPrefs.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

/** Upsert email notification preferences for a user. */
export async function setEmailNotifPrefs(
  userId: number,
  prefs: { optOutExpiryEmails?: boolean; optOutDigestEmails?: boolean }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const values = {
    userId,
    optOutExpiryEmails: prefs.optOutExpiryEmails !== undefined ? (prefs.optOutExpiryEmails ? 1 : 0) : 0,
    optOutDigestEmails: prefs.optOutDigestEmails !== undefined ? (prefs.optOutDigestEmails ? 1 : 0) : 0,
  };
  await db.insert(emailNotificationPrefs).values(values).onDuplicateKeyUpdate({
    set: {
      ...(prefs.optOutExpiryEmails !== undefined ? { optOutExpiryEmails: values.optOutExpiryEmails } : {}),
      ...(prefs.optOutDigestEmails !== undefined ? { optOutDigestEmails: values.optOutDigestEmails } : {}),
    },
  });
}


// ---- SMTP/IMAP Secondary Email Accounts helpers ----

export async function upsertSmtpImapAccount(account: InsertSmtpImapAccount): Promise<SmtpImapAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  await db.insert(smtpImapAccounts).values(account).onDuplicateKeyUpdate({
    set: {
      email: account.email,
      displayName: account.displayName,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapEncryption: account.imapEncryption,
      imapUsername: account.imapUsername,
      imapPassword: account.imapPassword,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpEncryption: account.smtpEncryption,
      smtpUsername: account.smtpUsername,
      smtpPassword: account.smtpPassword,
      lastTestedAt: account.lastTestedAt,
    },
  });
  const result = await db.select().from(smtpImapAccounts)
    .where(and(eq(smtpImapAccounts.userId, account.userId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSmtpImapAccount(userId: number): Promise<SmtpImapAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(smtpImapAccounts)
    .where(eq(smtpImapAccounts.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteSmtpImapAccount(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(smtpImapAccounts).where(eq(smtpImapAccounts.userId, userId));
}

export async function getSmtpImapAccountById(userId: number, accountId: number): Promise<SmtpImapAccount | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(smtpImapAccounts)
    .where(and(eq(smtpImapAccounts.userId, userId), eq(smtpImapAccounts.id, accountId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllSmtpImapAccounts(userId: number): Promise<SmtpImapAccount[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(smtpImapAccounts)
    .where(eq(smtpImapAccounts.userId, userId));
}

export async function updateSmtpImapLastTested(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(smtpImapAccounts)
    .set({ lastTestedAt: new Date() })
    .where(eq(smtpImapAccounts.userId, userId));
}


export async function updateOAuthTokenLastSynced(userId: number, provider: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(oauthTokens)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, provider)))
    .catch(() => {}); // Ignore errors
}


// ─── Email Notifications ────────────────────────────────────────────────────
export async function createEmailNotification(input: {
  userId: number;
  provider: string;
  emailSubject: string;
  emailFrom: string;
  emailId: string;
}) {
  const db = await getDb();
  if (!db) return;
  
  try {
    const { emailNotifications } = await import("../drizzle/schema");
    // MySQL doesn't support onConflictDoNothing directly. Use onDuplicateKeyUpdate
    // with a no-op set (id = id) to silently skip duplicate rows that violate the
    // unique constraint uq_email_notif_user_email on (userId, emailId).
    await db.insert(emailNotifications).values(input)
      .onDuplicateKeyUpdate({ set: { id: sql`id` } });
  } catch (err) {
    console.warn('[Database] Failed to create email notification:', err);
  }
}

export async function getUnreadEmailNotifications(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const { emailNotifications } = await import("../drizzle/schema");
    return await db
      .select()
      .from(emailNotifications)
      .where(and(eq(emailNotifications.userId, userId), eq(emailNotifications.read, 0)))
      .orderBy(desc(emailNotifications.createdAt));
  } catch (err) {
    console.warn('[Database] Failed to get unread notifications:', err);
    return [];
  }
}

// ─── Event Reminders ────────────────────────────────────────────────────────
export async function createEventReminder(input: {
  userId: number;
  provider: string;
  eventId: string;
  eventTitle: string;
  eventStart: Date;
  reminderType: '5min' | '15min' | '1hour';
}) {
  const db = await getDb();
  if (!db) return;
  
  try {
    const { eventReminders } = await import("../drizzle/schema");
    await db.insert(eventReminders).values([input]);
  } catch (err) {
    console.warn('[Database] Failed to create event reminder:', err);
  }
}

export async function getPendingReminders() {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const { eventReminders } = await import("../drizzle/schema");
    const result = await db
      .select()
      .from(eventReminders)
      .where(eq(eventReminders.sent, 0));
    return result;
  } catch (err) {
    console.warn('[Database] Failed to get pending reminders:', err);
    return [];
  }
}

// ─── Sync Status ────────────────────────────────────────────────────────────
export async function updateSyncStatus(input: {
  userId: number;
  provider: string;
  lastSyncStatus: 'success' | 'failed' | 'pending';
  syncErrorMessage?: string;
  totalEventsImported?: number;
  totalEmailsImported?: number;
  totalContactsImported?: number;
}) {
  const db = await getDb();
  if (!db) return;
  
  try {
    const { syncStatus } = await import("../drizzle/schema");
    const existing = await db
      .select()
      .from(syncStatus)
      .where(and(eq(syncStatus.userId, input.userId), eq(syncStatus.provider, input.provider)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(syncStatus)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: input.lastSyncStatus,
          syncErrorMessage: input.syncErrorMessage,
          totalEventsImported: input.totalEventsImported ?? existing[0].totalEventsImported,
          totalEmailsImported: input.totalEmailsImported ?? existing[0].totalEmailsImported,
          totalContactsImported: input.totalContactsImported ?? existing[0].totalContactsImported,
        })
        .where(and(eq(syncStatus.userId, input.userId), eq(syncStatus.provider, input.provider)));
    } else {
      await db.insert(syncStatus).values({
        userId: input.userId,
        provider: input.provider,
        lastSyncAt: new Date(),
        lastSyncStatus: input.lastSyncStatus,
        syncErrorMessage: input.syncErrorMessage,
        totalEventsImported: input.totalEventsImported ?? 0,
        totalEmailsImported: input.totalEmailsImported ?? 0,
        totalContactsImported: input.totalContactsImported ?? 0,
      });
    }
  } catch (err) {
    console.warn('[Database] Failed to update sync status:', err);
  }
}

export async function getSyncStatus(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const { syncStatus } = await import("../drizzle/schema");
    const result = await db
      .select()
      .from(syncStatus)
      .where(and(eq(syncStatus.userId, userId), eq(syncStatus.provider, provider)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (err) {
    console.warn('[Database] Failed to get sync status:', err);
    return null;
  }
}

export async function getAllSyncStatus(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const { syncStatus } = await import("../drizzle/schema");
    return await db
      .select()
      .from(syncStatus)
      .where(eq(syncStatus.userId, userId));
  } catch (err) {
    console.warn('[Database] Failed to get all sync status:', err);
    return [];
  }
}

// ─── Calendar Events ─────────────────────────────────────────────────────────

/**
 * Upsert a calendar event from a provider sync.
 * Uses onDuplicateKeyUpdate to update mutable fields if the event already exists
 * (identified by the unique constraint on userId + provider + eventId).
 */
export async function upsertCalendarEvent(input: {
  userId: number;
  provider: string;
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  description?: string | null;
  organizer?: string | null;
  isAllDay?: number;
  status?: string | null;
}) {
  const db = await getDb();
  if (!db) return;

  try {
    const { calendarEvents } = await import("../drizzle/schema");
    await db.insert(calendarEvents).values({
      userId: input.userId,
      provider: input.provider,
      eventId: input.eventId,
      title: input.title,
      start: input.start,
      end: input.end,
      location: input.location ?? null,
      description: input.description ?? null,
      organizer: input.organizer ?? null,
      isAllDay: input.isAllDay ?? 0,
      status: input.status ?? null,
    }).onDuplicateKeyUpdate({
      set: {
        title: input.title,
        start: input.start,
        end: input.end,
        location: input.location ?? null,
        description: input.description ?? null,
        organizer: input.organizer ?? null,
        isAllDay: input.isAllDay ?? 0,
        status: input.status ?? null,
      },
    });
  } catch (err) {
    console.warn('[Database] Failed to upsert calendar event:', err);
  }
}

/**
 * Get all calendar events for a user within an optional date range.
 * Returns events ordered by start time ascending.
 */
export async function getCalendarEvents(userId: number, opts?: { from?: Date; to?: Date; provider?: string }) {
  const db = await getDb();
  if (!db) return [];

  try {
    const { calendarEvents } = await import("../drizzle/schema");
    const conditions = [eq(calendarEvents.userId, userId)];
    if (opts?.from) conditions.push(gte(calendarEvents.start, opts.from));
    if (opts?.to) conditions.push(lte(calendarEvents.start, opts.to));
    if (opts?.provider) conditions.push(eq(calendarEvents.provider, opts.provider));

    return await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.start);
  } catch (err) {
    console.warn('[Database] Failed to get calendar events:', err);
    return [];
  }
}

/**
 * Delete a single calendar event from the local DB.
 * Scoped to userId so users can only delete their own events.
 */
export async function deleteCalendarEvent(userId: number, id: number) {
  const db = await getDb();
  if (!db) return { deleted: false };

  try {
    const { calendarEvents } = await import("../drizzle/schema");
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
    return { deleted: true };
  } catch (err) {
    console.warn('[Database] Failed to delete calendar event:', err);
    return { deleted: false };
  }
}

// ─── Secret Expiry Reminders ──────────────────────────────────────────────────

export async function getSecretExpiries(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    const { secretExpiryReminders } = await import("../drizzle/schema");
    return await db
      .select()
      .from(secretExpiryReminders)
      .where(eq(secretExpiryReminders.userId, userId))
      .orderBy(secretExpiryReminders.expiresAt);
  } catch (err) {
    console.warn('[Database] Failed to get secret expiries:', err);
    return [];
  }
}

export async function upsertSecretExpiry(data: {
  id?: number;
  userId: number;
  provider: string;
  label: string;
  expiresAt: Date;
  notifyDaysBefore: number;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { secretExpiryReminders } = await import("../drizzle/schema");
    if (data.id) {
      await db
        .update(secretExpiryReminders)
        .set({
          provider: data.provider,
          label: data.label,
          expiresAt: data.expiresAt,
          notifyDaysBefore: data.notifyDaysBefore,
        })
        .where(and(eq(secretExpiryReminders.id, data.id), eq(secretExpiryReminders.userId, data.userId)));
      return { id: data.id };
    } else {
      const [result] = await db.insert(secretExpiryReminders).values({
        userId: data.userId,
        provider: data.provider,
        label: data.label,
        expiresAt: data.expiresAt,
        notifyDaysBefore: data.notifyDaysBefore,
      });
      return { id: (result as any).insertId };
    }
  } catch (err) {
    console.warn('[Database] Failed to upsert secret expiry:', err);
    return null;
  }
}

export async function deleteSecretExpiry(userId: number, id: number) {
  const db = await getDb();
  if (!db) return { deleted: false };
  try {
    const { secretExpiryReminders } = await import("../drizzle/schema");
    await db
      .delete(secretExpiryReminders)
      .where(and(eq(secretExpiryReminders.id, id), eq(secretExpiryReminders.userId, userId)));
    return { deleted: true };
  } catch (err) {
    console.warn('[Database] Failed to delete secret expiry:', err);
    return { deleted: false };
  }
}
