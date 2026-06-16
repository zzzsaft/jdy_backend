CREATE TABLE IF NOT EXISTS quote_agent.agent_generated_configs (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES quote_agent.agent_runs(id) ON DELETE CASCADE,
  session_id bigint NOT NULL REFERENCES quote_agent.agent_sessions(id) ON DELETE CASCADE,
  title text NULL,
  status varchar(50) NOT NULL DEFAULT 'draft',
  config_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  share_token text NULL,
  share_token_expires_at timestamp NULL,
  share_token_revoked_at timestamp NULL,
  owner_user_id text NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_generated_configs_share_token UNIQUE (share_token)
);

CREATE INDEX IF NOT EXISTS idx_agent_generated_configs_run_id ON quote_agent.agent_generated_configs(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_generated_configs_session_id ON quote_agent.agent_generated_configs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_generated_configs_owner_user_id ON quote_agent.agent_generated_configs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_generated_configs_status ON quote_agent.agent_generated_configs(status);

ALTER TABLE quote_agent.agent_generated_configs
  ADD COLUMN IF NOT EXISTS share_token_expires_at timestamp NULL,
  ADD COLUMN IF NOT EXISTS share_token_revoked_at timestamp NULL;

CREATE INDEX IF NOT EXISTS idx_agent_generated_configs_share_token_expires_at ON quote_agent.agent_generated_configs(share_token_expires_at);
