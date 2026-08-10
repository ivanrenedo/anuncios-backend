-- Required extensions for the Explore search bar (matchingIdsByText helper
-- and the pg_trgm similarity fallback in products.service.ts).
--
-- Production note: `CREATE EXTENSION unaccent` requires superuser in Postgres
-- 13-16. When Prisma is not connecting as a superuser, install the extension
-- out of band (see infra/README.md, "unaccent" section) with:
--   sudo -u postgres psql -d <db> -c "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;"
--   sudo -u postgres psql -d <db> -c "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;"
-- Once installed, the IF NOT EXISTS below is a no-op and this migration
-- deploys cleanly.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Immutable wrapper around unaccent() so it can be used in expression indexes.
-- The stock unaccent(regdictionary, text) form is STABLE, not IMMUTABLE, so
-- Postgres refuses to build a functional index on it directly.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent($1) $$;

-- GIN trigram indexes matching the exact expressions used by matchingIdsByText
-- (`immutable_unaccent(lower(col))`), so ILIKE '%q%' stays fast even on big
-- tables. Without a matching expression the planner would fall back to a
-- sequential scan.
CREATE INDEX IF NOT EXISTS products_title_unaccent_trgm_idx
  ON products USING gin (immutable_unaccent(lower(title)) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_description_unaccent_trgm_idx
  ON products USING gin (immutable_unaccent(lower(description)) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS users_name_unaccent_trgm_idx
  ON users USING gin (immutable_unaccent(lower(name)) public.gin_trgm_ops);

-- Category label is also probed by matchingIdsByText (menus.label and the
-- parent's label). Small table but the index costs nothing and keeps the
-- planner honest.
CREATE INDEX IF NOT EXISTS menus_label_unaccent_trgm_idx
  ON menus USING gin (immutable_unaccent(lower(label)) public.gin_trgm_ops);
