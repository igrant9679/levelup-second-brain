import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * Signed in, but the workspace that session belongs to is suspended or
   * deleted. `user` is null then (so nothing else treats the request as
   * signed in); auth.me and workspace.list / switch read this instead.
   */
  inactiveUser?: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let inactiveUser: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req, { allowInactiveWorkspace: true });
    if (user && (user as any).wsStatus && (user as any).wsStatus !== "active") {
      inactiveUser = user;
      user = null;
    }
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    inactiveUser,
  };
}
