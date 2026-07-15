import { Pool, types, type QueryResultRow } from "pg";
import type { Role } from "./types";

// Return `date` columns (OID 1082) as raw "YYYY-MM-DD" strings instead of JS
// Date objects, so target dates compare and format as plain calendar dates.
types.setTypeParser(1082, (value) => value);

// Return `timestamptz` columns (OID 1184) as ISO strings, matching the `string`
// types the app declares — otherwise these come back as JS Date objects, a
// latent trap for any string operation on a timestamp field.
types.setTypeParser(1184, (value) =>
  value === null ? value : new Date(value).toISOString(),
);

/**
 * Direct Postgres access — the database half of Pit Wall's two-layer enforcement.
 *
 * The app connects through Supabase's transaction pooler as a privileged user,
 * but every role-scoped query first drops to the non-privileged `authenticated`
 * role and injects the viewer's `app_role` claim ("em" | "client") into the
 * request. Row Level Security policies (see supabase/schema.sql) read that claim,
 * so the database itself decides what each role may see:
 *
 *     begin;
 *     set local role authenticated;              -- give up superuser; RLS now applies
 *     select set_config('request.jwt.claims', '{"app_role":"client"}', true);
 *     <the actual query>                          -- RLS filters it
 *     commit;
 *
 * Because the role and claim are set LOCAL to the transaction, this is safe to
 * run over a shared connection pool.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "Missing DATABASE_URL. Copy .env.local.example to .env.local and fill it in.",
      );
    }
    pool = new Pool({
      connectionString,
      // Supabase's pooler uses TLS with a chain Node doesn't ship a root for;
      // encryption still applies, we just don't verify the CA in this demo.
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
  }
  return pool;
}

/**
 * Run a query AS the given role, with RLS enforced. Returns the result rows.
 */
export async function queryAsRole<T extends QueryResultRow = QueryResultRow>(
  role: Role,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ app_role: role }),
    ]);
    const result = await client.query<T>(text, params);
    await client.query("commit");
    return result.rows;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run a query as the privileged pooler user (RLS bypassed). Used only for the
 * append-only audit log, which no role may write to directly.
 */
export async function queryAsAdmin<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}
