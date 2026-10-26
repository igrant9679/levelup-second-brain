/**
 * Validates that the MS_CLIENT_SECRET environment variable is configured.
 * This test runs against the actual process.env to confirm the secret was
 * successfully injected — it does NOT make a live network call.
 */

import { describe, it, expect } from "vitest";

// A check of the DEPLOYED environment, not of the code: it runs only where
// CHECK_PROD_ENV=1 (e.g. `CHECK_PROD_ENV=1 pnpm vitest run server/msClientSecret.test.ts`
// on the Railway service). In CI and on a dev machine there is no secret to
// check, and failing there only hid real failures among known ones.
describe.skipIf(process.env.CHECK_PROD_ENV !== "1")("MS_CLIENT_SECRET configuration", () => {
  it("is set in the environment", () => {
    const secret = process.env.MS_CLIENT_SECRET;
    expect(secret, "MS_CLIENT_SECRET must be set").toBeTruthy();
  });

  it("is not an empty string", () => {
    const secret = process.env.MS_CLIENT_SECRET ?? "";
    expect(secret.trim().length, "MS_CLIENT_SECRET must not be blank").toBeGreaterThan(0);
  });

  it("does not look like a placeholder value", () => {
    const secret = (process.env.MS_CLIENT_SECRET ?? "").toLowerCase();
    const placeholders = ["your_secret", "changeme", "placeholder", "xxx", "todo"];
    for (const p of placeholders) {
      expect(secret).not.toContain(p);
    }
  });
});
