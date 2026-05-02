import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { credentialAuditLog, emailDeliveryLog, InsertCredentialAuditLog, InsertEmailDeliveryLog, InsertOAuthToken, InsertUser, InsertUserOauthCredential, oauthTokens, systemSettings, userOauthCredentials, users } from "../drizzle/schema";
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
    set: { clientId: cred.clientId, clientSecret: cred.clientSecret },
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
