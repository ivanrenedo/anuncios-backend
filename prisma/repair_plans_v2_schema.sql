DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanCycle') THEN
    CREATE TYPE public."PlanCycle" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BumpCadence') THEN
    CREATE TYPE public."BumpCadence" AS ENUM ('WEEKLY', 'DAILY');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserPlan')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'UserPlan' AND e.enumlabel = 'BASIC'
    )
  THEN
    ALTER TYPE public."UserPlan" ADD VALUE 'BASIC';
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_reduced_until TIMESTAMP(3);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_verified_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS plan_cycle public."PlanCycle" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER;

ALTER TABLE public.verification_requests
  ADD COLUMN IF NOT EXISTS docs TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS public.plan_activations (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  plan public."UserPlan" NOT NULL,
  months SMALLINT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  discount_pct DECIMAL(5,4) NOT NULL,
  total_paid DECIMAL(12,2) NOT NULL,
  activated_by_admin_id TEXT,
  activated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  starts_at TIMESTAMP(3) NOT NULL,
  ends_at TIMESTAMP(3) NOT NULL,
  notes VARCHAR(500),
  CONSTRAINT plan_activations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pinned_products (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  position SMALLINT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pinned_products_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.auto_bump_slots (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  cadence public."BumpCadence" NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auto_bump_slots_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.premium_carousel_days (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  product_ids TEXT[],
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT premium_carousel_days_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.follower_notify_batches (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  batched_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  product_ids TEXT[],
  CONSTRAINT follower_notify_batches_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS plan_activations_user_id_activated_at_idx
  ON public.plan_activations(user_id, activated_at);
CREATE INDEX IF NOT EXISTS plan_activations_activated_at_idx
  ON public.plan_activations(activated_at);
CREATE UNIQUE INDEX IF NOT EXISTS pinned_products_user_id_position_key
  ON public.pinned_products(user_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS pinned_products_user_id_product_id_key
  ON public.pinned_products(user_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS auto_bump_slots_product_id_key
  ON public.auto_bump_slots(product_id);
CREATE INDEX IF NOT EXISTS auto_bump_slots_user_id_idx
  ON public.auto_bump_slots(user_id);
CREATE INDEX IF NOT EXISTS premium_carousel_days_day_idx
  ON public.premium_carousel_days(day);
CREATE UNIQUE INDEX IF NOT EXISTS premium_carousel_days_user_id_day_key
  ON public.premium_carousel_days(user_id, day);
CREATE INDEX IF NOT EXISTS follower_notify_batches_user_id_batched_at_idx
  ON public.follower_notify_batches(user_id, batched_at);
CREATE INDEX IF NOT EXISTS products_price_reduced_until_idx
  ON public.products(price_reduced_until);
CREATE INDEX IF NOT EXISTS verification_requests_status_created_at_idx
  ON public.verification_requests(status, created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_activations_user_id_fkey') THEN
    ALTER TABLE public.plan_activations
      ADD CONSTRAINT plan_activations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_activations_activated_by_admin_id_fkey') THEN
    ALTER TABLE public.plan_activations
      ADD CONSTRAINT plan_activations_activated_by_admin_id_fkey
      FOREIGN KEY (activated_by_admin_id) REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pinned_products_user_id_fkey') THEN
    ALTER TABLE public.pinned_products
      ADD CONSTRAINT pinned_products_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pinned_products_product_id_fkey') THEN
    ALTER TABLE public.pinned_products
      ADD CONSTRAINT pinned_products_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auto_bump_slots_user_id_fkey') THEN
    ALTER TABLE public.auto_bump_slots
      ADD CONSTRAINT auto_bump_slots_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auto_bump_slots_product_id_fkey') THEN
    ALTER TABLE public.auto_bump_slots
      ADD CONSTRAINT auto_bump_slots_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'premium_carousel_days_user_id_fkey') THEN
    ALTER TABLE public.premium_carousel_days
      ADD CONSTRAINT premium_carousel_days_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follower_notify_batches_user_id_fkey') THEN
    ALTER TABLE public.follower_notify_batches
      ADD CONSTRAINT follower_notify_batches_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
