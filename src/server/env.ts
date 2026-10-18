import "server-only";

/** Server-only environment. Names match `.env.example`. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name} (see .env.example)`);
  }
  return value;
}

/**
 * Whether the Supabase variables are set. False only in a build without them:
 * the build then prerenders with default settings instead of failing.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export const serverEnv = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get sessionSecret() {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters");
    }
    return secret;
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  /**
   * Raw public base URL the QR codes point to; may be missing or wrong (the
   * Admin warns about it, see `resolveJoinUrl`). Read it at request time only.
   */
  get publicBaseUrl(): string | undefined {
    return process.env.PUBLIC_BASE_URL;
  },
};
