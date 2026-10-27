/**
 * The client's plain-script bundles, in load order — the ONE list the guards,
 * the tests and CI read. client/index.html's loader array must name the same
 * files in the same order (scripts/check-bundles.mjs fails otherwise).
 *
 * They are classic scripts sharing one global scope: a file may only call
 * another file's functions from code that runs after load (handlers, renders),
 * never from its own top-level code if that file comes later.
 * app-part1.js was split into app-1 … app-7 in build -234.
 */
export const BUNDLES = [
  'app-1-core.js',
  'app-2-home-tasks.js',
  'app-3-notes.js',
  'app-4-work.js',
  'app-5-life.js',
  'app-6-review.js',
  'app-7-team-help.js',
  'app-part2.js',
  'app-agent.js',
  'app-coach.js',
  'app-pm.js',
];
/** Loaded before the bundles. */
export const VENDOR = ['vendor/purify.min.js'];
/** The former app-part1.js, in order — for guards that read its contents. */
export const PART1 = BUNDLES.slice(0, 7);
/** The file holding the markdown renderer's NUL placeholders, and how many. */
export const NUL_FILE = 'app-1-core.js';
export const NUL_COUNT = 12;
