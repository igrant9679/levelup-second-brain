/**
 * Background jobs decide from preferences alone whether a user is due
 * (build -262). They used to read every user's WHOLE user_app_data row —
 * every list, Money, the Atlas snapshot — each tick just to look at prefs.
 * `prefsRows` reads only {userId, prefs}; `fullRow` loads the rest for the
 * few users who are due.
 */
import { eq } from "drizzle-orm";
import { userAppData } from "../../drizzle/schema";

export type PrefsRow = { userId: number; prefs: string | null };

export async function prefsRows(db: any, userId?: number): Promise<PrefsRow[]> {
  const q = db.select({ userId: userAppData.userId, prefs: userAppData.prefs }).from(userAppData);
  return userId != null ? q.where(eq(userAppData.userId, userId)) : q;
}

export async function fullRow(db: any, lite: PrefsRow): Promise<any> {
  const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, lite.userId)).limit(1);
  return row || lite;
}
