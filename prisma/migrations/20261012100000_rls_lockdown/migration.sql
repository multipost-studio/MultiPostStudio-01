-- Defence in depth for a Supabase database. Idempotent, data-free, and a no-op wherever it cannot apply.
--
-- MultiPost Studio reaches Postgres only through Prisma, as the project's owner role (`postgres`, which owns every table
-- here and has BYPASSRLS). It never uses Supabase's REST API (PostgREST) or the anon/authenticated roles. Tables that
-- Prisma creates in `public` come with Supabase's default grants to those roles and with row level security OFF, so if
-- the Data API is exposed for `public`, the project's anon key could read or write every tenant's rows.
--
-- This turns RLS on for every table in `public` with NO policies (nobody but the owner / BYPASSRLS roles can read or
-- write through the API) and removes the anon/authenticated grants, current and default. The application is not
-- affected: the owner and BYPASSRLS roles ignore RLS.
--
-- Safe by construction:
--   * does nothing unless the anon/authenticated roles exist (plain Postgres, CI, PGlite, local dev: skipped);
--   * does nothing unless the role running the migration owns the tables' bypass (BYPASSRLS or superuser), so it can
--     never lock the app's own connection out;
--   * each table is handled in its own block, so one table it does not own never aborts the migration.
-- Re-run it after adding tables: it is idempotent. Rollback: ALTER TABLE ... DISABLE ROW LEVEL SECURITY and re-GRANT.
DO $$
DECLARE
  t record;
  keep_going boolean := true;
BEGIN
  IF to_regrole('anon') IS NULL AND to_regrole('authenticated') IS NULL THEN
    RAISE NOTICE 'rls_lockdown: no anon/authenticated roles on this database, skipping';
    keep_going := false;
  END IF;

  IF keep_going AND NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE NOTICE 'rls_lockdown: % does not bypass RLS, skipping so the application cannot be locked out', current_user;
    keep_going := false;
  END IF;

  IF keep_going THEN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'rls_lockdown: not the owner of public.%, skipped', t.tablename;
      END;
    END LOOP;

    IF to_regrole('anon') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'rls_lockdown: could not change anon grants';
      END;
    END IF;

    IF to_regrole('authenticated') IS NOT NULL THEN
      BEGIN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'rls_lockdown: could not change authenticated grants';
      END;
    END IF;
  END IF;
END
$$;
