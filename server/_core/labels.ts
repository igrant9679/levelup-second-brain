/**
 * Company wording (multi-workspace Phase G, build -278).
 *
 * LevelUp began as one owner's tool, and its emails and coach spoke that
 * owner's language: Smartsheet work was "CommunityForce (CF)", NiftyPM work was
 * "LSI Media (LSI)", and the weekly reflection addressed "a COO/CEO running
 * two companies". Those are that workspace's — switched on by its `cfLabels`
 * feature. Every other workspace gets the plain names of the tools.
 */
export type SourceLabels = {
  cf: boolean;
  /** short badge */ smartsheet: string; nifty: string;
  /** count line */ smartsheetLong: string; niftyLong: string;
  /** table heading */ smartsheetTable: string; niftyTable: string;
  /** who the weekly reflection is written for */ audience: string;
};

export const CF_LABELS: SourceLabels = {
  cf: true,
  smartsheet: "CF", nifty: "LSI",
  smartsheetLong: "CommunityForce", niftyLong: "LSI Media",
  smartsheetTable: "🔵 CommunityForce (Smartsheet)", niftyTable: "🟣 LSI Media (NiftyPM)",
  audience: "a COO/CEO running two companies (CommunityForce + LSI Media)",
};

export const GENERIC_LABELS: SourceLabels = {
  cf: false,
  smartsheet: "Smartsheet", nifty: "Nifty",
  smartsheetLong: "Smartsheet", niftyLong: "NiftyPM",
  smartsheetTable: "🔵 Smartsheet", niftyTable: "🟣 NiftyPM",
  audience: "a busy professional",
};

/** The wording for a member's workspace. */
export async function labelsFor(userId: number): Promise<SourceLabels> {
  try {
    const { hasFeature } = await import("./workspace");
    return (await hasFeature({ id: userId }, "cfLabels")) ? CF_LABELS : GENERIC_LABELS;
  } catch {
    return GENERIC_LABELS;
  }
}
