/**
 * Integrations that have been switched off (build -223).
 *
 * Smartsheet: retired 2026-10-20 at the owner's request — CommunityForce work
 * now comes from the Atlas mirror. Nothing is deleted: the hourly pull simply
 * skips Smartsheet, every reader of external_tasks ignores its rows (so they
 * stop duplicating Atlas), and new Smartsheet connections are refused. The
 * rows, watches and credential stay in the database; setting this to false
 * and redeploying brings the integration back as it was.
 */
export const SMARTSHEET_RETIRED = true;

export const RETIRED_SOURCES = new Set<string>(SMARTSHEET_RETIRED ? ["smartsheet"] : []);
export function isRetiredSource(source: string | null | undefined): boolean {
  return RETIRED_SOURCES.has(String(source || ""));
}
export const RETIRED_MESSAGE = "The Smartsheet integration is retired — CommunityForce work now comes from Atlas.";
