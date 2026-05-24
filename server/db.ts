import { and, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { credentialAuditLog, emailDeliveryLog, emailNotificationPrefs, InsertCredentialAuditLog, InsertEmailDeliveryLog, InsertOAuthToken, InsertUser, InsertUserOauthCredential, InsertScheduledTaskLog, oauthTokens, scheduledTaskLog, systemSettings, userOauthCredentials, users, smtpImapAccounts, InsertSmtpImapAccount, SmtpImapAccount, userActivityLog, externalSourceCredentials, InsertExternalSourceCredential } from "../drizzle/schema";
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

export async function updateUserEmail(userId: number, newEmail: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ email: newEmail }).where(eq(users.id, userId));
}

export async function updateUserName(userId: number, newName: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ name: newName }).where(eq(users.id, userId));
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

// ─── External source credentials (Smartsheet PAT / Nifty OAuth) ────────────
// Two shapes share this table: PAT sources (apiToken only) and OAuth sources
// (clientId+clientSecret+accessToken+refreshToken+expiresAt). The Express
// callback in oauth-callbacks.ts and the externalSources tRPC router both
// go through these helpers so the column set stays consistent.
export async function getExternalSourceCredential(userId: number, source: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, source)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertExternalSourceCredential(cred: InsertExternalSourceCredential): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Only update fields explicitly present on the input — preserves any
  // OAuth-app credentials (clientId/clientSecret) when only the token rotates,
  // and vice versa.
  const set: Record<string, unknown> = {};
  for (const k of ['apiToken','accountEmail','accountDisplayName','accountExternalId','clientId','clientSecret','refreshToken','expiresAt','scope'] as const) {
    if (k in cred && (cred as Record<string, unknown>)[k] !== undefined) set[k] = (cred as Record<string, unknown>)[k];
  }
  await db.insert(externalSourceCredentials).values(cred).onDuplicateKeyUpdate({ set });
}

export async function deleteExternalSourceCredential(userId: number, source: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, source)));
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

// Get all SMTP/IMAP secondary accounts across users (for owner notification sender picker)
export async function getAllSmtpAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: smtpImapAccounts.userId,
    email: smtpImapAccounts.email,
    displayName: smtpImapAccounts.displayName,
    userName: users.name,
  })
  .from(smtpImapAccounts)
  .innerJoin(users, eq(users.id, smtpImapAccounts.userId));
}

/**
 * List all users (admin-only consumer in the router layer). Returns minimal
 * fields needed by the admin UI for configuring per-user notification senders.
 */
export async function adminListAllUsers(): Promise<Array<{ id: number; name: string | null; email: string | null; role: string; hasSmtp: boolean }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);
  // Find which users have an SMTP/IMAP row
  const smtpRows = await db.select({ userId: smtpImapAccounts.userId }).from(smtpImapAccounts);
  const smtpUserIds = new Set(smtpRows.map(r => r.userId));
  return rows.map(r => ({ id: r.id, name: r.name as string | null, email: r.email as string | null, role: r.role as string, hasSmtp: smtpUserIds.has(r.id) }));
}

// Get a user's SMTP/IMAP account row (full credentials) — used by sendEmail to build a transporter.
export async function getSmtpImapAccountFull(userId: number): Promise<SmtpImapAccount | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(smtpImapAccounts).where(eq(smtpImapAccounts.userId, userId)).limit(1);
  return rows[0] ?? null;
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

// ─── Calendar Event Update ───────────────────────────────────────────────────

export async function updateCalendarEvent(
  userId: number,
  id: number,
  updates: {
    title?: string;
    start?: Date;
    end?: Date;
    location?: string | null;
    description?: string | null;
    isAllDay?: number;
    recurrence?: string;
  }
) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { calendarEvents } = await import('../drizzle/schema');
    // Verify ownership
    const [existing] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
      .limit(1);
    if (!existing) return null;
    await db
      .update(calendarEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)));
    const [updated] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id))
      .limit(1);
    return updated ?? null;
  } catch (err) {
    console.warn('[Database] Failed to update calendar event:', err);
    return null;
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

// ─── Bookmark helpers ──────────────────────────────────────────────────────

export async function createBookmark(data: {
  userId: number;
  url: string;
  title?: string | null;
  description?: string | null;
  favicon?: string | null;
  ogImage?: string | null;
  siteName?: string | null;
  tags?: string | null;
  notes?: string | null;
  color?: string | null;
  wordCount?: number | null;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const { bookmarks } = await import("../drizzle/schema");
  const result = await db.insert(bookmarks).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(bookmarks).where(eq(bookmarks.id, insertId)).limit(1);
  return rows[0];
}

export async function getBookmarkById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { bookmarks } = await import("../drizzle/schema");
  const rows = await db.select().from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getBookmarks(opts: {
  userId: number;
  search?: string;
  tag?: string;
  isRead?: boolean;
  isFavorite?: boolean;
  sort?: 'newest' | 'oldest' | 'alpha';
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  if (!db) return { bookmarks: [], total: 0 };
  const { bookmarks } = await import("../drizzle/schema");
  const { page = 1, pageSize = 30, sort = 'newest' } = opts;
  const offset = (page - 1) * pageSize;

  const conditions: ReturnType<typeof eq>[] = [eq(bookmarks.userId, opts.userId)];
  if (opts.isRead !== undefined) conditions.push(eq(bookmarks.isRead, opts.isRead ? 1 : 0));
  if (opts.isFavorite !== undefined) conditions.push(eq(bookmarks.isFavorite, opts.isFavorite ? 1 : 0));

  // Build where clause
  let whereClause = and(...conditions);

  // For search and tag, we use raw SQL since drizzle doesn't have a built-in LIKE
  if (opts.search) {
    const searchTerm = `%${opts.search}%`;
    conditions.push(sql`(${bookmarks.title} LIKE ${searchTerm} OR ${bookmarks.url} LIKE ${searchTerm} OR ${bookmarks.description} LIKE ${searchTerm} OR ${bookmarks.notes} LIKE ${searchTerm})` as any);
    whereClause = and(...conditions);
  }
  if (opts.tag) {
    const tagPattern = `%"${opts.tag}"%`;
    conditions.push(sql`${bookmarks.tags} LIKE ${tagPattern}` as any);
    whereClause = and(...conditions);
  }

  // Sort
  let orderBy;
  if (sort === 'oldest') orderBy = bookmarks.createdAt;
  else if (sort === 'alpha') orderBy = bookmarks.title;
  else orderBy = desc(bookmarks.createdAt);

  const rows = await db.select().from(bookmarks)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset);

  const countResult = await db.select({ count: sql<number>`count(*)` }).from(bookmarks).where(whereClause);
  const total = countResult[0]?.count ?? 0;

  return { bookmarks: rows, total };
}

export async function updateBookmark(id: number, userId: number, data: {
  title?: string | null;
  description?: string | null;
  tags?: string | null;
  notes?: string | null;
  isRead?: number;
  isFavorite?: number;
  color?: string | null;
}) {
  const db = await getDb();
  if (!db) return undefined;
  const { bookmarks } = await import("../drizzle/schema");
  await db.update(bookmarks).set(data).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  const rows = await db.select().from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function deleteBookmark(id: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  const { bookmarks } = await import("../drizzle/schema");
  await db.delete(bookmarks).where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
  return true;
}

export async function getBookmarkCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const { bookmarks } = await import("../drizzle/schema");
  const result = await db.select({ count: sql<number>`count(*)` }).from(bookmarks)
    .where(eq(bookmarks.userId, userId));
  return result[0]?.count ?? 0;
}

export async function getAllBookmarkTags(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const { bookmarks } = await import("../drizzle/schema");
  const rows = await db.select({ tags: bookmarks.tags }).from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), sql`${bookmarks.tags} IS NOT NULL AND ${bookmarks.tags} != '[]'`));
  const tagSet = new Set<string>();
  for (const row of rows) {
    if (row.tags) {
      try {
        const parsed = JSON.parse(row.tags);
        if (Array.isArray(parsed)) parsed.forEach((t: string) => tagSet.add(t));
      } catch { /* skip malformed */ }
    }
  }
  return Array.from(tagSet).sort();
}

export async function getBookmarkByUrl(url: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { bookmarks } = await import("../drizzle/schema");
  const rows = await db.select().from(bookmarks)
    .where(and(eq(bookmarks.url, url), eq(bookmarks.userId, userId)))
    .limit(1);
  return rows[0];
}

// ─── Bookmark Links ───────────────────────────────────────────────────────────

export async function linkBookmarkToEntity(
  bookmarkId: number,
  entityType: 'idea' | 'note',
  entityId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { bookmarkLinks } = await import('../drizzle/schema');
  // Upsert: ignore if link already exists
  const existing = await db.select().from(bookmarkLinks)
    .where(and(
      eq(bookmarkLinks.bookmarkId, bookmarkId),
      eq(bookmarkLinks.entityType, entityType),
      eq(bookmarkLinks.entityId, entityId),
      eq(bookmarkLinks.userId, userId)
    )).limit(1);
  if (existing.length > 0) return existing[0];
  await db.insert(bookmarkLinks).values({ bookmarkId, entityType, entityId, userId });
  const rows = await db.select().from(bookmarkLinks)
    .where(and(
      eq(bookmarkLinks.bookmarkId, bookmarkId),
      eq(bookmarkLinks.entityType, entityType),
      eq(bookmarkLinks.entityId, entityId),
      eq(bookmarkLinks.userId, userId)
    )).limit(1);
  return rows[0];
}

export async function unlinkBookmarkFromEntity(
  bookmarkId: number,
  entityType: 'idea' | 'note',
  entityId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { bookmarkLinks } = await import('../drizzle/schema');
  await db.delete(bookmarkLinks).where(and(
    eq(bookmarkLinks.bookmarkId, bookmarkId),
    eq(bookmarkLinks.entityType, entityType),
    eq(bookmarkLinks.entityId, entityId),
    eq(bookmarkLinks.userId, userId)
  ));
}

export async function getLinkedBookmarks(
  entityType: 'idea' | 'note',
  entityId: number,
  userId: number
) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkLinks, bookmarks } = await import('../drizzle/schema');
  const rows = await db
    .select({ bookmark: bookmarks })
    .from(bookmarkLinks)
    .innerJoin(bookmarks, eq(bookmarkLinks.bookmarkId, bookmarks.id))
    .where(and(
      eq(bookmarkLinks.entityType, entityType),
      eq(bookmarkLinks.entityId, entityId),
      eq(bookmarkLinks.userId, userId)
    ))
    .orderBy(desc(bookmarkLinks.createdAt));
  return rows.map(r => r.bookmark);
}

export async function getEntityLinksForBookmark(bookmarkId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkLinks } = await import('../drizzle/schema');
  return db.select().from(bookmarkLinks)
    .where(and(eq(bookmarkLinks.bookmarkId, bookmarkId), eq(bookmarkLinks.userId, userId)));
}


// ─── Bookmark Collections ─────────────────────────────────────────────────────

export async function createCollection(userId: number, data: { name: string; description?: string; color?: string; icon?: string }) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkCollections } = await import('../drizzle/schema');
  const [result] = await db.insert(bookmarkCollections).values({
    userId,
    name: data.name,
    description: data.description ?? null,
    color: data.color ?? '#3B82F6',
    icon: data.icon ?? '📁',
  });
  const id = (result as { insertId: number }).insertId;
  const rows = await db.select().from(bookmarkCollections).where(eq(bookmarkCollections.id, id));
  return rows[0];
}

export async function getCollections(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkCollections, bookmarkCollectionItems } = await import('../drizzle/schema');
  const cols = await db.select().from(bookmarkCollections)
    .where(eq(bookmarkCollections.userId, userId))
    .orderBy(bookmarkCollections.createdAt);
  // Attach item counts
  const counts = await db.select({
    collectionId: bookmarkCollectionItems.collectionId,
    cnt: sql<number>`count(*)`,
  }).from(bookmarkCollectionItems)
    .where(eq(bookmarkCollectionItems.userId, userId))
    .groupBy(bookmarkCollectionItems.collectionId);
  const countMap: Record<number, number> = {};
  for (const c of counts) countMap[c.collectionId] = Number(c.cnt);
  return cols.map(c => ({ ...c, bookmarkCount: countMap[c.id] ?? 0 }));
}

export async function getCollection(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const { bookmarkCollections } = await import('../drizzle/schema');
  const rows = await db.select().from(bookmarkCollections)
    .where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, userId)));
  return rows[0] ?? null;
}

export async function updateCollection(id: number, userId: number, data: { name?: string; description?: string; color?: string; icon?: string }) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkCollections } = await import('../drizzle/schema');
  await db.update(bookmarkCollections).set({ ...data }).where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, userId)));
  const rows = await db.select().from(bookmarkCollections).where(eq(bookmarkCollections.id, id));
  return rows[0] ?? null;
}

export async function deleteCollection(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkCollections, bookmarkCollectionItems } = await import('../drizzle/schema');
  // Remove all items first
  await db.delete(bookmarkCollectionItems).where(and(eq(bookmarkCollectionItems.collectionId, id), eq(bookmarkCollectionItems.userId, userId)));
  await db.delete(bookmarkCollections).where(and(eq(bookmarkCollections.id, id), eq(bookmarkCollections.userId, userId)));
}

export async function addBookmarkToCollection(collectionId: number, bookmarkId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkCollectionItems } = await import('../drizzle/schema');
  // Ignore duplicate (upsert-style)
  try {
    await db.insert(bookmarkCollectionItems).values({ collectionId, bookmarkId, userId });
  } catch (_e) {
    // Unique constraint violation = already in collection, that's fine
  }
}

export async function removeBookmarkFromCollection(collectionId: number, bookmarkId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkCollectionItems } = await import('../drizzle/schema');
  await db.delete(bookmarkCollectionItems).where(and(
    eq(bookmarkCollectionItems.collectionId, collectionId),
    eq(bookmarkCollectionItems.bookmarkId, bookmarkId),
    eq(bookmarkCollectionItems.userId, userId),
  ));
}

export async function getCollectionBookmarks(collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkCollectionItems, bookmarks } = await import('../drizzle/schema');
  const rows = await db.select({ bookmark: bookmarks })
    .from(bookmarkCollectionItems)
    .innerJoin(bookmarks, eq(bookmarkCollectionItems.bookmarkId, bookmarks.id))
    .where(and(eq(bookmarkCollectionItems.collectionId, collectionId), eq(bookmarkCollectionItems.userId, userId)))
    .orderBy(desc(bookmarkCollectionItems.addedAt));
  return rows.map(r => r.bookmark);
}

export async function getBookmarkCollections(bookmarkId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkCollectionItems, bookmarkCollections } = await import('../drizzle/schema');
  const rows = await db.select({ collection: bookmarkCollections })
    .from(bookmarkCollectionItems)
    .innerJoin(bookmarkCollections, eq(bookmarkCollectionItems.collectionId, bookmarkCollections.id))
    .where(and(eq(bookmarkCollectionItems.bookmarkId, bookmarkId), eq(bookmarkCollectionItems.userId, userId)));
  return rows.map(r => r.collection);
}

// ─── Bookmark Shares ──────────────────────────────────────────────────────────

export async function createBookmarkShare(userId: number, data: {
  title?: string;
  description?: string;
  shareType: 'collection' | 'selection';
  collectionId?: number;
  bookmarkIds?: number[];
  expiresAt?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkShares } = await import('../drizzle/schema');
  // Generate a random URL-safe token
  const { randomBytes } = await import('crypto');
  const token = randomBytes(24).toString('base64url');
  await db.insert(bookmarkShares).values({
    userId,
    token,
    title: data.title ?? null,
    description: data.description ?? null,
    shareType: data.shareType,
    collectionId: data.collectionId ?? null,
    bookmarkIds: data.bookmarkIds ? JSON.stringify(data.bookmarkIds) : null,
    expiresAt: data.expiresAt ?? null,
  });
  const rows = await db.select().from(bookmarkShares).where(eq(bookmarkShares.token, token));
  return rows[0];
}

export async function getShareByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const { bookmarkShares } = await import('../drizzle/schema');
  const rows = await db.select().from(bookmarkShares).where(eq(bookmarkShares.token, token));
  return rows[0] ?? null;
}

export async function getSharesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { bookmarkShares } = await import('../drizzle/schema');
  return db.select().from(bookmarkShares)
    .where(eq(bookmarkShares.userId, userId))
    .orderBy(desc(bookmarkShares.createdAt));
}

export async function deleteBookmarkShare(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB unavailable');
  const { bookmarkShares } = await import('../drizzle/schema');
  await db.delete(bookmarkShares).where(and(eq(bookmarkShares.id, id), eq(bookmarkShares.userId, userId)));
}

export async function incrementShareViewCount(token: string) {
  const db = await getDb();
  if (!db) return;
  const { bookmarkShares } = await import('../drizzle/schema');
  await db.update(bookmarkShares)
    .set({ viewCount: sql`${bookmarkShares.viewCount} + 1` })
    .where(eq(bookmarkShares.token, token));
}

// ─── Team Invites ─────────────────────────────────────────────────────────────

export async function createTeamInvite(data: {
  invitedBy: number;
  email: string;
  name?: string | null;
  role: 'user' | 'admin';
  token: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { teamInvites } = await import('../drizzle/schema');
    await db.insert(teamInvites).values({
      invitedBy: data.invitedBy,
      email: data.email.toLowerCase().trim(),
      name: data.name ?? null,
      role: data.role,
      token: data.token,
      expiresAt: data.expiresAt,
    });
    const [row] = await db.select().from(teamInvites).where(eq(teamInvites.token, data.token)).limit(1);
    return row ?? null;
  } catch (err) {
    console.warn('[Database] Failed to create team invite:', err);
    return null;
  }
}

export async function getTeamInvites(invitedBy: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    const { teamInvites } = await import('../drizzle/schema');
    return await db.select().from(teamInvites).where(eq(teamInvites.invitedBy, invitedBy)).orderBy(teamInvites.createdAt);
  } catch (err) {
    console.warn('[Database] Failed to get team invites:', err);
    return [];
  }
}

export async function getAllTeamInvites() {
  const db = await getDb();
  if (!db) return [];
  try {
    const { teamInvites } = await import('../drizzle/schema');
    return await db.select().from(teamInvites).orderBy(teamInvites.createdAt);
  } catch (err) {
    console.warn('[Database] Failed to get all team invites:', err);
    return [];
  }
}

export async function getTeamInviteByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { teamInvites } = await import('../drizzle/schema');
    const [row] = await db.select().from(teamInvites).where(eq(teamInvites.token, token)).limit(1);
    return row ?? null;
  } catch (err) {
    console.warn('[Database] Failed to get team invite by token:', err);
    return null;
  }
}

export async function deleteTeamInvite(id: number, invitedBy: number) {
  const db = await getDb();
  if (!db) return { deleted: false };
  try {
    const { teamInvites } = await import('../drizzle/schema');
    await db.delete(teamInvites).where(and(eq(teamInvites.id, id), eq(teamInvites.invitedBy, invitedBy)));
    return { deleted: true };
  } catch (err) {
    console.warn('[Database] Failed to delete team invite:', err);
    return { deleted: false };
  }
}

export async function acceptTeamInvite(token: string, userId: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { teamInvites } = await import('../drizzle/schema');
    await db.update(teamInvites)
      .set({ accepted: 1, acceptedAt: new Date(), acceptedUserId: userId })
      .where(eq(teamInvites.token, token));
    const [row] = await db.select().from(teamInvites).where(eq(teamInvites.token, token)).limit(1);
    return row ?? null;
  } catch (err) {
    console.warn('[Database] Failed to accept team invite:', err);
    return null;
  }
}

export async function resendTeamInvite(id: number, newToken: string, newExpiresAt: Date) {
  const db = await getDb();
  if (!db) return null;
  try {
    const { teamInvites } = await import('../drizzle/schema');
    await db.update(teamInvites)
      .set({ token: newToken, expiresAt: newExpiresAt })
      .where(and(eq(teamInvites.id, id), eq(teamInvites.accepted, 0)));
    const [row] = await db.select().from(teamInvites).where(eq(teamInvites.id, id)).limit(1);
    return row ?? null;
  } catch (err) {
    console.warn('[Database] Failed to resend team invite:', err);
    return null;
  }
}

// ---- Activity Log helpers ----

/**
 * Log a user activity event.
 */
export async function logActivity(
  userId: number,
  action: string,
  entityType?: string,
  entityTitle?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(userActivityLog).values({
      userId,
      action,
      entityType: entityType ?? null,
      entityTitle: entityTitle ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    // Never let logging failures break the caller
    console.warn('[Database] Failed to log activity:', err);
  }
}

/**
 * Get recent activity for a list of user IDs, joined with users table for name/email.
 */
export async function getActivityFeed(
  userIds: number[],
  limit = 50,
  since?: Date
) {
  const db = await getDb();
  if (!db) return [];
  if (userIds.length === 0) return [];
  try {
    const baseQuery = db
      .select({
        id: userActivityLog.id,
        userId: userActivityLog.userId,
        action: userActivityLog.action,
        entityType: userActivityLog.entityType,
        entityTitle: userActivityLog.entityTitle,
        metadata: userActivityLog.metadata,
        createdAt: userActivityLog.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(userActivityLog)
      .innerJoin(users, eq(users.id, userActivityLog.userId))
      .orderBy(desc(userActivityLog.createdAt))
      .limit(limit);

    if (since) {
      return baseQuery.where(and(inArray(userActivityLog.userId, userIds), gte(userActivityLog.createdAt, since)));
    }
    return baseQuery.where(inArray(userActivityLog.userId, userIds));
  } catch (err) {
    console.warn('[Database] Failed to get activity feed:', err);
    return [];
  }
}

/**
 * Get action counts by type for a single user (for stats cards).
 */
export async function getActivitySummary(userId: number, since?: Date) {
  const db = await getDb();
  if (!db) return [];
  try {
    const baseQuery = db
      .select({
        action: userActivityLog.action,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(userActivityLog)
      .groupBy(userActivityLog.action)
      .orderBy(desc(sql`count(*)`));

    if (since) {
      return baseQuery.where(and(eq(userActivityLog.userId, userId), gte(userActivityLog.createdAt, since)));
    }
    return baseQuery.where(eq(userActivityLog.userId, userId));
  } catch (err) {
    console.warn('[Database] Failed to get activity summary:', err);
    return [];
  }
}

/**
 * Get all team members for the activity feed.
 */
export async function getTeamMembers() {
  const db = await getDb();
  if (!db) return [];
  try {
    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      lastSignedIn: users.lastSignedIn,
    }).from(users).orderBy(desc(users.lastSignedIn));
  } catch (err) {
    console.warn('[Database] Failed to get team members:', err);
    return [];
  }
}

// ── Delete a team member (admin-only) ──────────────────────────────────────
export async function deleteTeamMember(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database unavailable');
  await db.delete(users).where(eq(users.id, userId));
}

// ── Get user by ID ──────────────────────────────────────────────────────────
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
