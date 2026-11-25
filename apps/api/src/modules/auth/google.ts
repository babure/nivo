import { randomBytes } from "node:crypto";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleOAuthEnabled(cfg: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }): boolean {
  // ID-token (GIS) needs client id only; secret is for the legacy redirect code flow.
  return Boolean(cfg.GOOGLE_CLIENT_ID);
}

export function buildGoogleAuthorizeUrl(
  cfg: GoogleOAuthConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

/** Verifies a Google Identity Services ID token (JWT). No redirect URI required. */
export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?" + new URLSearchParams({ id_token: idToken }));
  if (!res.ok) {
    throw new Error(`Google id_token invalid: ${res.status}`);
  }
  const data = (await res.json()) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  if (data.aud !== clientId) throw new Error("Google id_token audience mismatch");
  const iss = data.iss ?? "";
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    throw new Error("Google id_token issuer mismatch");
  }
  if (!data.sub || !data.email) throw new Error("Google id_token missing sub/email");
  const emailVerified = data.email_verified === true || data.email_verified === "true";
  if (!emailVerified) throw new Error("Google email is not verified");
  return {
    sub: data.sub,
    email: data.email.trim().toLowerCase(),
    emailVerified: true,
    name: (data.name ?? data.email.split("@")[0] ?? "Student").slice(0, 80),
    picture: typeof data.picture === "string" && data.picture.startsWith("https://") ? data.picture.slice(0, 512) : null,
  };
}

/** Resolves profile from a GIS OAuth access token (custom-button / token client flow). */
export async function profileFromGoogleAccessToken(accessToken: string): Promise<GoogleProfile> {
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) {
    throw new Error(`Google userinfo failed: ${userRes.status}`);
  }
  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    picture?: string;
  };
  if (!profile.sub || !profile.email) {
    throw new Error("Google profile missing sub/email");
  }
  const emailVerified = profile.email_verified === true || profile.email_verified === "true";
  if (!emailVerified) {
    throw new Error("Google email is not verified");
  }
  return {
    sub: profile.sub,
    email: profile.email.trim().toLowerCase(),
    emailVerified: true,
    name: (profile.name ?? profile.email.split("@")[0] ?? "Student").slice(0, 80),
    picture: typeof profile.picture === "string" && profile.picture.startsWith("https://") ? profile.picture.slice(0, 512) : null,
  };
}

export async function exchangeGoogleCode(
  cfg: GoogleOAuthConfig,
  code: string,
): Promise<GoogleProfile> {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${text.slice(0, 200)}`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
  if (!tokens.access_token) throw new Error("Google token response missing access_token");
  return profileFromGoogleAccessToken(tokens.access_token);
}
