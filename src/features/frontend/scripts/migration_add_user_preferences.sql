CREATE TABLE IF NOT EXISTS quote_agent.user_preferences (
  id bigserial PRIMARY KEY,
  owner_user_id text NOT NULL,
  preference_key text NOT NULL,
  value_jsonb jsonb NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_preferences_owner_key UNIQUE (owner_user_id, preference_key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_owner_user_id
  ON quote_agent.user_preferences(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_preference_key
  ON quote_agent.user_preferences(preference_key);
