import { cookies } from "next/headers";
import type { Role } from "./types";

const ROLE_COOKIE = "portside_role";

/**
 * Read the current viewer role from the httpOnly session cookie.
 * Defaults to "em" (the internal delivery team is the primary user).
 *
 * This cookie is the ONLY input to the access-control decision. It is
 * httpOnly, so browser JavaScript cannot read or forge it — only the
 * server's setRole action can write it.
 */
export async function getRole(): Promise<Role> {
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value;
  if (value === "em") return "em";
  if (value === "client_exec") return "client_exec";
  // Default (including no cookie) is a non-privileged client tier, never EM:
  // an unknown visitor must not be handed the internal workspace. "client" is
  // the legacy single-tier value; treat it as the project lead.
  return "client_contact";
}

/**
 * Persist the viewer role. Only ever called from a Server Action.
 */
export async function writeRole(role: Role): Promise<void> {
  const store = await cookies();
  store.set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}
