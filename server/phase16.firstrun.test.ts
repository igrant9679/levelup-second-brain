/**
 * Build -279: a brand-new account starts EMPTY.
 *
 * The server answers a new account's first load with null ("nothing stored
 * yet"). The browser's tRPC helper hands a null value back as its envelope,
 * {json:null}, which is truthy — so the "first-time user" branch never ran and
 * the bundled SAMPLE tasks, notes and projects were kept and saved as that
 * person's own data (found while testing self-serve sign-up).
 *
 * These read the SHIPPED client code.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const src = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
function lift(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in app-part2.js`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`could not read ${name}`);
}

describe("a new account's first load", () => {
  const ctx: any = {};
  vm.runInNewContext(lift("_luNullAnswer") + "\nthis._luNullAnswer = _luNullAnswer;", ctx);
  const f = ctx._luNullAnswer as (v: any) => any;

  it("reads the server's null — in either shape — as 'nothing stored yet'", () => {
    expect(f(null)).toBeNull();
    expect(f({ json: null })).toBeNull();
    expect(f({ json: undefined })).toBeNull();
  });
  it("leaves real answers alone", () => {
    const data = { tasks: [], notes: [], updatedAt: null };
    expect(f(data)).toBe(data);
    expect(f({ json: 0 })).toEqual({ json: 0 });
    expect(f({ json: null, other: 1 })).toEqual({ json: null, other: 1 });
    expect(f([])).toEqual([]);
    expect(f(undefined)).toBeUndefined();
  });
  it("loadServerData uses it, and refuses to treat a device that has synced before as a first run", () => {
    const body = lift("loadServerData");
    expect(body).toContain("sd=_luNullAnswer(await _trpc('appData.load'");
    const guard = body.indexOf("lu_syncbase_");
    const gate = body.indexOf("_serverSyncReady=true");
    const clean = body.indexOf("_newUserKeys");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(gate);       // decided before the sync gate opens
    expect(gate).toBeLessThan(clean);       // and before anything is cleared
    // the guard returns without clearing
    const guardBlock = body.slice(guard, gate);
    expect(guardBlock).toMatch(/if\(hadSync\)\{[\s\S]*return;/);
  });
});
