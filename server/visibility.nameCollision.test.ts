/**
 * Display-name collisions must never grant visibility.
 *
 * Background (2026-09-09): the owner and the demo account were both named
 * "Idris Grant". `_resolveUserIdMap` keyed a flat Map by lower-cased display
 * name, last writer wins, so the owner's tasks with `assignedTo:"Idris Grant"`
 * were stamped `assigneeId = <demo id>` on their next save and 71 personal
 * tasks appeared in the demo account's "Shared & delegated" section.
 *
 * Rule under test: a name shared by two accounts resolves to NOTHING (emails
 * stay unique), and a user's own display name only counts as one of their
 * assignee keys when nobody else has it.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  adminListAllUsers: vi.fn(async () => [
    { id: 1, name: "Idris Grant", email: "owner@example.com" },
    { id: 103448, name: "Idris Grant", email: "demo@example.com" },
    { id: 46561, name: "Lucas Grant", email: "lucas@example.com" },
    { id: 7, name: "  lucas grant ", email: "lucas2@example.com" }, // same name, odd casing/whitespace
    { id: 9, name: null, email: "nameless@example.com" },
  ]),
}));

import { _resolveUserIdMap, _myAssigneeKeys } from "./routers/appData";

describe("_resolveUserIdMap — ambiguous display names", () => {
  it("drops a name shared by two accounts and keeps emails", async () => {
    const map = await _resolveUserIdMap();
    expect(map.get("idris grant")).toBeUndefined();          // the collision
    expect(map.get("lucas grant")).toBeUndefined();          // whitespace/case still counts as the same name
    expect(map.get("owner@example.com")).toBe(1);
    expect(map.get("demo@example.com")).toBe(103448);
    expect(map.get("nameless@example.com")).toBe(9);
  });

  it("never resolves the colliding name to the later-listed account", async () => {
    const map = await _resolveUserIdMap();
    // The old last-writer-wins map returned 103448 here.
    expect(map.get("idris grant")).not.toBe(103448);
    expect(map.get("idris grant")).not.toBe(1);
  });
});

describe("_myAssigneeKeys — what strings may name me as assignee", () => {
  const users = [
    { id: 1, name: "Idris Grant", email: "owner@example.com" },
    { id: 103448, name: "Idris Grant", email: "demo@example.com" },
    { id: 46561, name: "Lucas Grant", email: "lucas@example.com" },
  ];
  it("includes the email always and the name only when unique", () => {
    expect(_myAssigneeKeys(users, users[2])).toEqual(["lucas@example.com", "lucas grant"]);
    expect(_myAssigneeKeys(users, users[1])).toEqual(["demo@example.com"]);   // name shared → excluded
    expect(_myAssigneeKeys(users, users[0])).toEqual(["owner@example.com"]);
  });
  it("is safe on a missing user", () => {
    expect(_myAssigneeKeys(users, undefined)).toEqual([]);
  });
  it("becomes unique again once the demo persona is renamed", () => {
    const renamed = users.map((u) => (u.id === 103448 ? { ...u, name: "Jordan Ellis" } : u));
    expect(_myAssigneeKeys(renamed, renamed[0])).toEqual(["owner@example.com", "idris grant"]);
    expect(_myAssigneeKeys(renamed, renamed[1])).toEqual(["demo@example.com", "jordan ellis"]);
  });
});
