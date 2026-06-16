-- Run against the Postgres database used by PgDataSource.
-- CONCURRENTLY avoids long table write blocking; run outside an explicit transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_message_task_id
  ON log_message (task_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_message_event_lookup
  ON log_message (event_id, event_type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_log_message_msg_id
  ON log_message (msg_id);
