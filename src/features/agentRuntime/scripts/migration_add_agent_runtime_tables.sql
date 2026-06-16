CREATE TABLE IF NOT EXISTS quote_agent.agent_sessions (
  id bigserial PRIMARY KEY,
  agent_type varchar(100) NOT NULL,
  title text NULL,
  owner_user_id text NULL,
  status varchar(50) NOT NULL DEFAULT 'active',
  metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent_type ON quote_agent.agent_sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_owner_user_id ON quote_agent.agent_sessions(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON quote_agent.agent_sessions(status);

CREATE TABLE IF NOT EXISTS quote_agent.agent_messages (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES quote_agent.agent_sessions(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL,
  content text NULL,
  content_jsonb jsonb NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session_created ON quote_agent.agent_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_messages_role ON quote_agent.agent_messages(role);

CREATE TABLE IF NOT EXISTS quote_agent.agent_runs (
  id bigserial PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES quote_agent.agent_sessions(id) ON DELETE CASCADE,
  agent_type varchar(100) NOT NULL,
  intent varchar(100) NULL,
  status varchar(50) NOT NULL DEFAULT 'running',
  planner_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_summary_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_jsonb jsonb NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_session_created ON quote_agent.agent_runs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_type ON quote_agent.agent_runs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON quote_agent.agent_runs(status);

CREATE TABLE IF NOT EXISTS quote_agent.agent_tool_calls (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES quote_agent.agent_runs(id) ON DELETE CASCADE,
  step_id varchar(100) NOT NULL,
  tool_name varchar(100) NOT NULL,
  args_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_jsonb jsonb NULL,
  status varchar(50) NOT NULL DEFAULT 'running',
  error_jsonb jsonb NULL,
  duration_ms int NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_step ON quote_agent.agent_tool_calls(run_id, step_id);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_tool_name ON quote_agent.agent_tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_status ON quote_agent.agent_tool_calls(status);
