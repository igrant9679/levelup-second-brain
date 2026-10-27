/**
 * Outbound fetches to addresses a user supplies (bookmark previews, the
 * SimpleFIN claim/access URLs) must only reach the public internet (-255,
 * audit 2). Otherwise a member could make the server fetch internal or
 * cloud-metadata addresses and read back the page title or an error body.
 *
 * `assertPublicUrl(url)` — http(s) only, no credentials in hostnames other
 * than the caller's choice, and every DNS answer for the host must be a public
 * address. `safeFetch(url, init)` follows redirects by hand (at most 5) and
 * re-checks each hop.
 */
import { lookup } from "dns/promises";
import net from "net";

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
function v4ToInt(ip: string): number { return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0; }

export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return !PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return false;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    // unique-local fc00::/7, link-local fe80::/10, multicast ff00::/8, documentation 2001:db8::/32
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || /^2001:0?db8:/.test(x)) return false;
    return true;
  }
  return false;
}

export class BlockedUrlError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new BlockedUrlError("That isn't a valid web address."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new BlockedUrlError("Only http and https addresses are allowed.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || /^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(host)) throw new BlockedUrlError("That address is not on the public internet.");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new BlockedUrlError("That address could not be found.");
  if (!addrs.every((a) => isPublicIp(a.address))) throw new BlockedUrlError("That address is not on the public internet.");
  return u;
}

/** fetch() that only ever talks to public addresses, re-checking every redirect. */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url);
    const resp = await fetch(url, { ...init, redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
      url = new URL(resp.headers.get("location")!, url).toString();
      try { await resp.body?.cancel(); } catch {}
      continue;
    }
    return resp;
  }
  throw new BlockedUrlError("Too many redirects.");
}
