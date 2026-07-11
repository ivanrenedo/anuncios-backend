-- Trigram similarity for typo-tolerant search. Requires the pg_trgm extension
-- (bundled with PostgreSQL; CREATE EXTENSION needs a role with the privilege —
-- default `postgres` works, managed providers usually allow it too).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index so `title % query` / similarity() scans stay fast.
CREATE INDEX IF NOT EXISTS "products_title_trgm_idx"
  ON "products" USING GIN ("title" gin_trgm_ops);
