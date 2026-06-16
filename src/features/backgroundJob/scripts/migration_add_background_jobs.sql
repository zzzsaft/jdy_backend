CREATE TABLE IF NOT EXISTS public.background_jobs (
  id varchar(80) PRIMARY KEY,
  type varchar(120) NOT NULL,
  status varchar(24) NOT NULL,
  payload jsonb,
  progress jsonb,
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 1,
  locked_by varchar(120),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status_created
  ON public.background_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_background_jobs_locked_until
  ON public.background_jobs (locked_until)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_created
  ON public.background_jobs (type, created_at DESC);
