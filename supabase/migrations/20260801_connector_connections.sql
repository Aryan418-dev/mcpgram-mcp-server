-- Connector OAuth connections (GitHub, Slack, Notion, …)
-- Tokens encrypted at rest (AES-256-GCM). Service role only.

create table if not exists public.connector_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text default 'bearer',
  scope text,
  external_account_id text,
  external_account_name text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create index if not exists connector_connections_user_idx
  on public.connector_connections (user_id);
create index if not exists connector_connections_provider_idx
  on public.connector_connections (provider);

alter table public.connector_connections enable row level security;
-- Service role only (MCP server). No client policies.
