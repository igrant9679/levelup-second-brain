/**
 * Zip-bomb caps for the Word / notes importers (audit F22).
 *
 * A .docx is a zip; mammoth and JSZip inflate entries fully in memory, so a
 * small upload declaring gigabytes of content (or hundreds of thousands of
 * entries) could exhaust the process. Before any library touches the file,
 * read the zip's central directory (no decompression) and refuse it when:
 *   - it has more than MAX_ENTRIES entries,
 *   - the declared uncompressed total exceeds MAX_TOTAL_UNCOMPRESSED,
 *   - one entry's declared size is over MAX_ENTRY_UNCOMPRESSED, or its
 *     compression ratio is absurd (> MAX_RATIO and over 10 MB),
 *   - sizes are in ZIP64 form (no real .docx needs that) or the directory
 *     is unreadable.
 * Buffers that are not zips (PDF, plain text) pass untouched.
 * Limitation: sizes are what the archive DECLARES; a forged directory could
 * understate them. mammoth/JSZip then still inflate the real data.
 */
import { TRPCError } from "@trpc/server";

export const ZIP_LIMITS = {
  MAX_ENTRIES: 10_000,
  MAX_TOTAL_UNCOMPRESSED: 600 * 1024 * 1024,
  MAX_ENTRY_UNCOMPRESSED: 300 * 1024 * 1024,
  MAX_RATIO: 200,
};

export type ZipStats = { entries: number; totalUncompressed: number; largest: number; zip64: boolean };

/** Central-directory statistics, or null when the buffer is not a readable zip. */
export function zipStats(buf: Buffer): ZipStats | null {
  if (buf.length < 22) return null;
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22.
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) return { entries: total, totalUncompressed: 0, largest: 0, zip64: true };
  if (cdOffset + cdSize > buf.length) return null;
  let p = cdOffset, entries = 0, sum = 0, largest = 0, zip64 = false;
  while (p + 46 <= cdOffset + cdSize) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const comp = buf.readUInt32LE(p + 20);
    const uncomp = buf.readUInt32LE(p + 24);
    if (comp === 0xffffffff || uncomp === 0xffffffff) zip64 = true;
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    entries++;
    sum += uncomp;
    if (uncomp > largest) largest = uncomp;
    if (uncomp > 10 * 1024 * 1024 && comp > 0 && uncomp / comp > ZIP_LIMITS.MAX_RATIO) largest = Math.max(largest, ZIP_LIMITS.MAX_ENTRY_UNCOMPRESSED + 1);
    if (uncomp > 10 * 1024 * 1024 && comp === 0) largest = Math.max(largest, ZIP_LIMITS.MAX_ENTRY_UNCOMPRESSED + 1);
    p += 46 + nameLen + extraLen + commentLen;
    if (entries > ZIP_LIMITS.MAX_ENTRIES) break;
  }
  return { entries: Math.max(entries, total), totalUncompressed: sum, largest, zip64 };
}

/** Throw BAD_REQUEST when a zip upload is over the caps. Non-zip buffers pass. */
export function assertZipWithinLimits(buf: Buffer): void {
  if (!buf || buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return; // not a zip
  const s = zipStats(buf);
  const refuse = (why: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message: `This file can't be imported: ${why}` }); };
  if (!s) refuse("it isn't a readable Word document (damaged zip).");
  const st = s as ZipStats;
  if (st.zip64) refuse("it is too large (ZIP64 archive).");
  if (st.entries > ZIP_LIMITS.MAX_ENTRIES) refuse(`it holds too many parts (${st.entries}).`);
  if (st.largest > ZIP_LIMITS.MAX_ENTRY_UNCOMPRESSED) refuse("one of its parts is too large once unpacked.");
  if (st.totalUncompressed > ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED) refuse(`it unpacks to more than ${Math.round(ZIP_LIMITS.MAX_TOTAL_UNCOMPRESSED / 1048576)} MB.`);
}
