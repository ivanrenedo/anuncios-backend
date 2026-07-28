-- Accent-insensitive search across products.title, products.description and
-- users.name. Combines two Postgres extensions:
--   * unaccent — strips diacritics so "café" indexes as "cafe"
--   * pg_trgm  — trigram matching for ILIKE '%q%' with a usable index
--
-- unaccent() is marked STABLE by default (its dictionary can, in theory, be
-- reloaded). GIN expression indexes require IMMUTABLE, so we wrap it. This
-- is a well-known Postgres idiom: if you ever change the unaccent dictionary
-- (nobody does in practice), REINDEX the three indexes below.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Unqualified `unaccent` — Postgres resolves via search_path so this works
-- whether the extension landed in public or in another schema (some Windows
-- installs use `extensions`).
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT unaccent($1) $$;

-- Three trigram GIN indexes, one per column we search.
-- lower() + immutable_unaccent() means a single index covers case AND accents.
CREATE INDEX IF NOT EXISTS "products_title_unaccent_trgm_idx"
  ON "products" USING GIN (immutable_unaccent(lower("title")) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "products_description_unaccent_trgm_idx"
  ON "products" USING GIN (immutable_unaccent(lower("description")) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_name_unaccent_trgm_idx"
  ON "users" USING GIN (immutable_unaccent(lower("name")) gin_trgm_ops);
