import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage access.
 *
 * The database is reached directly via Postgres (see lib/db.ts), where Row Level
 * Security enforces the private/shared boundary. Supabase's client is used here
 * only for the file BYTES: uploading to, and minting signed URLs from, a private
 * Storage bucket. The service_role key never leaves the server.
 */

export const STORAGE_BUCKET = "documents";

export const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
] as const;

/** True only when every required environment variable is present. */
export function isConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]));
}

/** Names of any missing required environment variables. */
export function missingEnv(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key]);
}

function requireEnv(key: (typeof REQUIRED_ENV)[number]): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing environment variable ${key}. Copy .env.local.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Admin Storage client (service_role). Server-only. */
export function serviceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
