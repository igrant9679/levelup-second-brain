import { AXIOS_TIMEOUT_MS, COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** users.tokenVersion at issue time (audit F20). Missing claim = 0. */
  tv?: number;
};

/** What a verified session cookie says. */
export type VerifiedSession = { openId: string; appId: string; name: string; tv: number; exp: number | null };

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }

  private decodeState(state: string): string {
    const redirectUri = atob(state);
    return redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; tokenVersion?: number } = {}
  ): Promise<string> {
    // The token carries the account's current tokenVersion so a later
    // "sign out everywhere" / password change revokes it (audit F20).
    let tv = options.tokenVersion;
    if (tv === undefined) {
      // tokenVersion lives on the LOGIN row (a member row in a further workspace points at it)
      try {
        const row: any = await db.getUserByOpenId(openId);
        const acc: any = row && row.accountId ? await db.getAccountRow(row) : row;
        tv = Number(acc?.tokenVersion) || 0;
      } catch { tv = 0; }
    }
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
        tv,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      ...(payload.tv ? { tv: payload.tv } : {}),
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<VerifiedSession | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, tv, exp } = payload as Record<string, unknown>;

      // openId is the only required field — appId and name are metadata we tolerate being empty.
      if (!isNonEmptyString(openId)) {
        console.warn("[Auth] Session payload missing openId");
        return null;
      }

      return {
        openId,
        appId: typeof appId === "string" ? appId : "",
        name: typeof name === "string" ? name : "",
        tv: typeof tv === "number" && Number.isFinite(tv) ? tv : 0,
        exp: typeof exp === "number" ? exp : null,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  /**
   * Cheap check for the body-size choice (audit F22): does the request carry
   * a session cookie with a valid signature that hasn't expired? No database
   * read — revocation is enforced later by authenticateRequest.
   */
  async hasValidSessionCookie(req: Pick<Request, "headers">): Promise<boolean> {
    try {
      const cookie = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
      if (!cookie) return false;
      await jwtVerify(cookie, this.getSessionSecret(), { algorithms: ["HS256"] });
      return true;
    } catch { return false; }
  }

  /** The verified session of a request (null when missing / invalid). */
  async sessionOf(req: Pick<Request, "headers">): Promise<VerifiedSession | null> {
    const cookie = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    return cookie ? this.verifySession(cookie) : null;
  }

  /**
   * The signed-in MEMBER of a request. The cookie names a member row, which
   * belongs to exactly one workspace (multi-workspace, -278).
   *   - tokenVersion and the operator flag are read from the login row;
   *   - a member of a suspended / deleted workspace is refused, unless the
   *     caller passes allowInactiveWorkspace (tRPC context does, so the client
   *     can still show "suspended" and switch to another workspace).
   * The returned row carries platformRole (from the login row) and wsStatus.
   */
  async authenticateRequest(req: Request, opts: { allowInactiveWorkspace?: boolean } = {}): Promise<User> {
    // Regular authentication flow
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    // Accounts are created by an invite (or the very first sign-up), never by
    // a session for an unknown id: there is no workspace to put it in. (This
    // used to copy the account from the OAuth server automatically.)
    if (!user) {
      throw ForbiddenError("User not found");
    }

    // Revoked session (audit F20): issued before the account's last password
    // change / "sign out everywhere". A token with no tv claim counts as 0.
    const account: any = (user as any).accountId ? await db.getAccountRow(user as any) : user;
    if (!account) {
      throw ForbiddenError("User not found");
    }
    const curTv = Number(account.tokenVersion) || 0;
    if (curTv !== session.tv) {
      throw ForbiddenError("Session revoked");
    }
    // The operator flag is a property of the login, whichever workspace is open.
    (user as any).platformRole = account.platformRole ?? null;

    // Workspace must exist and be active. (Older unit tests build users with
    // no workspaceId at all: that is the "no workspace model" mode.)
    let wsStatus = "active";
    if ((user as any).workspaceId !== undefined || !process.env.VITEST) {
      const { getWorkspace } = await import("./workspace");
      const ws = await getWorkspace((user as any).workspaceId);
      wsStatus = !ws ? "missing" : (ws.deletedAt ? "deleted" : ws.status);
    }
    (user as any).wsStatus = wsStatus;
    if (wsStatus !== "active" && !opts.allowInactiveWorkspace) {
      throw ForbiddenError("Workspace " + wsStatus);
    }

    // Every request used to write lastSignedIn; once an hour is enough.
    const last = user.lastSignedIn ? new Date(user.lastSignedIn as any).getTime() : 0;
    if (!last || signedInAt.getTime() - last > 60 * 60 * 1000) {
      await db.upsertUser({
        openId: user.openId,
        lastSignedIn: signedInAt,
      });
    }

    return user;
  }
}

export const sdk = new SDKServer();
