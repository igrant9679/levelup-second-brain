/**
 * Validates that the MS_CLIENT_SECRET environment variable is configured.
 * This test runs against the actual process.env to confirm the secret was
 * successfully injected — it does NOT make a live network call.
 */

import { describe, it, expect } from "vitest";

describe("MS_CLIENT_SECRET configuration", () => {
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
