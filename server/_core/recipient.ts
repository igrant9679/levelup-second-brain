/**
 * Who may receive a user's scheduled emails (daily digest, weekly review,
 * coach check-ins).
 *
 * The "send to a different address" overrides live in the client-written
 * prefs blob, so any account could otherwise point the system sender at any
 * outside address (and, for the coach, have that address's replies treated
 * as the account's own commands). Overrides are honored only for the
 * workspace owner, and only once the address has been confirmed by the link
 * emailed to it (audit F29, recipientConfirm.ts); until then — and for
 * everyone else — mail goes to the account's own address.
 */
import { isOwner } from "./ownerGuard";
import { isRecipientConfirmed } from "./recipientConfirm";

export async function allowedRecipient(
  user: { id: number; openId?: string | null; email?: string | null },
  override?: string | null,
): Promise<string | null> {
  const own = user.email ? String(user.email).trim() : "";
  const alt = override ? String(override).trim() : "";
  if (!alt || alt.toLowerCase() === own.toLowerCase()) return own || null;
  if (!(await isOwner(user))) return own || null;
  return (await isRecipientConfirmed(user.id, alt)) ? alt : (own || null);
}
