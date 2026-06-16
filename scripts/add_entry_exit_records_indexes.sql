-- Run against the Postgres database used by PgDataSource.
-- CONCURRENTLY avoids long table write blocking; run outside an explicit transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_exit_records_record_id
  ON entry_exit_records (record_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_exit_records_record_direction
  ON entry_exit_records (record_id, enter_or_exit);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_exit_records_user_time
  ON entry_exit_records (user_id, time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entry_exit_records_car_time
  ON entry_exit_records (car_num, time DESC);
