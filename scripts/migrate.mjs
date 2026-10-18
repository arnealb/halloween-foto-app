// Applies pending SQL migrations from supabase/migrations to SUPABASE_DB_URL.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --status list applied / pending, change nothing
//
// Each file runs in its own transaction and is recorded in
// public.schema_migrations, so it is applied exactly once. Files are applied in
// filename order (0001_..., 0002_...). An advisory lock prevents two runners
// from migrating at the same time.
//
// Migration files must NOT contain their own BEGIN/COMMIT/ROLLBACK: the runner
// wraps each file in a transaction, and a nested COMMIT would break that.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);
const LOCK_ID = 7_315_002_001; // arbitrary, unique to this app

async function main() {
  const statusOnly = process.argv.includes("--status");
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is not set (see .env.example)");
  }

  // Supabase requires TLS; its pooler certificate is not in Node's default CA
  // store, so encrypt without verifying the chain. Drop any sslmode from the
  // URL so it does not override this.
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      create table if not exists public.schema_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      );
      alter table public.schema_migrations enable row level security;
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const { rows } = await client.query("select name from public.schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const pending = files.filter((f) => !applied.has(f));

    if (statusOnly) {
      for (const f of files) console.log(`${applied.has(f) ? "applied" : "pending"}  ${f}`);
      return;
    }
    if (pending.length === 0) {
      console.log(`Database is up to date (${files.length} migration(s) applied).`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log("done");
      } catch (error) {
        // Swallow rollback failures (e.g. a dropped connection) so the
        // original error is the one that surfaces.
        await client.query("rollback").catch(() => {});
        console.log("FAILED");
        throw error;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
