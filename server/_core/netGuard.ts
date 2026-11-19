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
    // Audit 3: judge the address by its 16-bit groups, not its spelling — the URL parser writes
    // [::ffff:127.0.0.1] as ::ffff:7f00:1, which the old text match let through as "public".
    const g = v6Groups(ip);
    if (!g) return false;
    const v4At = (hi: number, lo: number) => `${g[hi] >> 8}.${g[hi] & 255}.${g[lo] >> 8}.${g[lo] & 255}`;
    const zero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
    if (zero(0, 8)) return false;                                         // ::
    if (zero(0, 7) && g[7] === 1) return false;                           // ::1
    if (zero(0, 5) && g[5] === 0xffff) return isPublicIp(v4At(6, 7));     // ::ffff:a.b.c.d (IPv4-mapped)
    if (zero(0, 6)) return isPublicIp(v4At(6, 7));                        // ::a.b.c.d (IPv4-compatible)
    if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return isPublicIp(v4At(6, 7)); // ::ffff:0:a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicIp(v4At(6, 7));  // NAT64 64:ff9b::/96 and 64:ff9b:1::/48
    if (g[0] === 0x2002) return isPublicIp(v4At(1, 2));                   // 6to4 2002:AABB:CCDD::
    if (g[0] === 0x2001 && g[1] === 0) return false;                      // Teredo 2001::/32
    if (g[0] === 0x0100 && zero(1, 4)) return false;                      // discard-only 100::/64
    // unique-local fc00::/7, link-local fe80::/10, multicast ff00::/8, documentation 2001:db8::/32
    if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 || (g[0] === 0x2001 && g[1] === 0x0db8)) return false;
    return true;
  }
  return false;
}

/** The eight 16-bit groups of an IPv6 address (a trailing dotted IPv4 part included), or null. */
function v6Groups(ip: string): number[] | null {
  let x = String(ip).toLowerCase().split("%")[0];
  const dotted = x.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[1])) return null;
    const n = v4ToInt(dotted[1]);
    x = x.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const parts = x.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (parts.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill("0"), ...tail];
  if (all.length !== 8 || all.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map((h) => parseInt(h, 16));
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

/**
 * A bare host name a member supplies for a raw socket connection (the SMTP /
 * IMAP connection test and mail sending, audit F21) must be on the public
 * internet: same rules as assertPublicUrl — localhost / .local / .internal
 * names refused, and EVERY DNS answer must be a public address (loopback,
 * private, CGNAT, link-local incl. 169.254.169.254 metadata, ULA, multicast
 * and documentation ranges refused). Returns the vetted addresses; connect
 * to the first one (with the name kept for TLS) so a second DNS answer can't
 * swap in an internal address between check and connect.
 */
export async function assertPublicHost(rawHost: string): Promise<{ host: string; addresses: string[] }> {
  const host = String(rawHost || "").trim().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host.length > 253 || /[\s/@?#]/.test(host)) throw new BlockedUrlError("That isn't a valid server name.");
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(host)) throw new BlockedUrlError("That server is not on the public internet.");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!addrs.length) throw new BlockedUrlError("That server name could not be found.");
  if (!addrs.every((a) => isPublicIp(a.address))) throw new BlockedUrlError("That server is not on the public internet.");
  return { host, addresses: addrs.map((a) => a.address) };
}

/** assertPublicHost, shaped for a socket client: the address to dial plus the TLS server name. */
export async function publicConnectTarget(rawHost: string): Promise<{ connectHost: string; servername?: string }> {
  const { host, addresses } = await assertPublicHost(rawHost);
  return { connectHost: addresses[0], servername: net.isIP(host) ? undefined : host };
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
