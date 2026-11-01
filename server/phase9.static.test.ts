/**
 * Build -262: static files compressed, and long-cached only when the URL
 * carries the current content version (see server/_core/staticAssets.ts).
 */
import { describe, it, expect, afterAll } from "vitest";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import zlib from "zlib";
import { createStaticLayer, pickEncoding } from "./_core/staticAssets";

const dirs: string[] = [];
function makeDist(bundleText: string) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lu-static-"));
  dirs.push(d);
  fs.mkdirSync(path.join(d, "js", "vendor"), { recursive: true });
  fs.writeFileSync(path.join(d, "index.html"), `<!doctype html><html><body>${"<p>x</p>".repeat(300)}<script>
(function(){
  var APP_BUILD='2026-11-01-262';
  ['/js/vendor/purify.min.js','/js/app-1-core.js'].forEach(function(src){
    var s=document.createElement('script');
    s.src=src+'?v='+APP_BUILD;
    document.head.appendChild(s);
  });
})();
</script></body></html>`);
  fs.writeFileSync(path.join(d, "js", "vendor", "purify.min.js"), "/*purify*/" + "var a=1;".repeat(400));
  fs.writeFileSync(path.join(d, "js", "app-1-core.js"), bundleText);
  fs.writeFileSync(path.join(d, "sw.js"), "self.addEventListener('push',()=>{});" + " ".repeat(2000));
  fs.writeFileSync(path.join(d, "tiny.js"), "var t=1;");
  fs.writeFileSync(path.join(d, "logo.png"), Buffer.from([137, 80, 78, 71]));
  return d;
}
function serve(dist: string) {
  const app = express();
  const layer = createStaticLayer(dist);
  app.use(layer.middleware);
  app.use(express.static(dist));
  app.use("*", (req, res) => layer.sendIndex(req, res));
  const srv = app.listen(0);
  const port = (srv.address() as any).port;
  const get = (p: string, headers: Record<string, string> = {}) => new Promise<{ status: number; h: http.IncomingHttpHeaders; body: Buffer }>((ok, bad) => {
    http.get({ port, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => ok({ status: res.statusCode!, h: res.headers, body: Buffer.concat(chunks) }));
    }).on("error", bad);
  });
  return { layer, get, close: () => srv.close() };
}
const unzip = (r: { h: http.IncomingHttpHeaders; body: Buffer }) =>
  r.h["content-encoding"] === "br" ? zlib.brotliDecompressSync(r.body).toString() : r.h["content-encoding"] === "gzip" ? zlib.gunzipSync(r.body).toString() : r.body.toString();

afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

describe("static files (-262)", () => {
  const BUNDLE = "function boot(){return 42}\n" + "console.log('levelup');\n".repeat(2000);

  it("the page asks for the content version, and is never cached", async () => {
    const s = serve(makeDist(BUNDLE));
    expect(s.layer.version).toMatch(/^2026-11-01-262\.[0-9a-f]{10}$/);
    const hash = s.layer.version!.split(".")[1];
    for (const p of ["/", "/index.html", "/some/spa/route"]) {
      const r = await s.get(p, { "accept-encoding": "gzip, deflate, br" });
      expect(r.status).toBe(200);
      expect(r.h["cache-control"]).toBe("no-cache, must-revalidate");
      expect(r.h["content-encoding"]).toBe("br");
      const html = unzip(r);
      expect(html).toContain(`s.src=src+'?v='+APP_BUILD+'.${hash}';`);
      expect(html).not.toContain("s.src=src+'?v='+APP_BUILD;");
    }
    s.close();
  });

  it("a bundle at the current version: compressed, cached for a year, identical bytes", async () => {
    const s = serve(makeDist(BUNDLE));
    const v = s.layer.version!;
    for (const [ae, enc] of [["gzip, deflate, br", "br"], ["gzip", "gzip"], ["", undefined], ["br;q=0, gzip", "gzip"], ["identity", undefined]] as const) {
      const r = await s.get(`/js/app-1-core.js?v=${v}`, ae ? { "accept-encoding": ae } : {});
      expect(r.status).toBe(200);
      expect(r.h["content-encoding"]).toBe(enc);
      expect(r.h["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(r.h["content-type"]).toMatch(/javascript/);
      expect(r.h.vary).toMatch(/Accept-Encoding/i);
      expect(unzip(r)).toBe(BUNDLE);
      if (enc) expect(r.body.length).toBeLessThan(BUNDLE.length / 5);
    }
    s.close();
  });

  it("an old or missing version revalidates; ETag gives a 304", async () => {
    const s = serve(makeDist(BUNDLE));
    const old = await s.get("/js/app-1-core.js?v=2026-10-31-261", { "accept-encoding": "br" });
    expect(old.h["cache-control"]).toBe("public, max-age=0");
    expect(unzip(old)).toBe(BUNDLE);
    const again = await s.get("/js/app-1-core.js?v=2026-10-31-261", { "accept-encoding": "br", "if-none-match": String(old.h.etag) });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    const bare = await s.get("/js/app-1-core.js");
    expect(bare.h["cache-control"]).toBe("public, max-age=0");
    s.close();
  });

  it("a changed bundle gets a new version even if APP_BUILD wasn't bumped", () => {
    const a = createStaticLayer(makeDist(BUNDLE)).version;
    const b = createStaticLayer(makeDist(BUNDLE + "// one more line\n")).version;
    expect(a!.split(".")[0]).toBe(b!.split(".")[0]);
    expect(a).not.toBe(b);
  });

  it("sw.js never cached, tiny files sent plain, binaries and escapes left to express.static", async () => {
    const s = serve(makeDist(BUNDLE));
    const sw = await s.get(`/sw.js?v=${s.layer.version}`, { "accept-encoding": "br" });
    expect(sw.h["cache-control"]).toBe("no-cache, must-revalidate");
    const tiny = await s.get("/tiny.js", { "accept-encoding": "br" });
    expect(tiny.h["content-encoding"]).toBeUndefined();
    expect(tiny.body.toString()).toBe("var t=1;");
    const png = await s.get("/logo.png", { "accept-encoding": "br" });
    expect(png.h["content-encoding"]).toBeUndefined();
    expect(png.status).toBe(200);
    // ../ outside the build folder → not this layer's (falls to the page)
    const esc = await s.get("/js/..%2f..%2f..%2fetc%2fpasswd.js", { "accept-encoding": "br" });
    expect(unzip(esc)).toContain("<!doctype html>");
    s.close();
  });

  it("parses Accept-Encoding", () => {
    expect(pickEncoding("gzip, deflate, br")).toBe("br");
    expect(pickEncoding("br;q=0, gzip;q=0.5")).toBe("gzip");
    expect(pickEncoding("*")).toBe("br");
    expect(pickEncoding("*;q=0")).toBe("identity");
    expect(pickEncoding(undefined)).toBe("identity");
  });
});
