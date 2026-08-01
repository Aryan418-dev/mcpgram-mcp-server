-- Run in Supabase SQL editor (MCPGRAM project).
-- Links Auth0 users to MCPGRAM (auth.users) and stores encrypted
-- workspace API keys for Claude OAuth (raw keys never leave the MCP server).

create table if not exists public.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'auth0',
  provider_user_id text not null,
  email text,
  active_workspace_id uuid references public.workspaces(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create index if not exists auth_identities_user_id_idx on public.auth_identities (user_id);
create index if not exists auth_identities_email_idx on public.auth_identities (lower(email));

alter table public.auth_identities enable row level security;
-- Service role only (MCP server). No client policies.

create table if not exists public.oauth_workspace_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  -- AES-256-GCM ciphertext (base64): iv.tag.ciphertext — only MCP server decrypts
  key_ciphertext text not null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

create index if not exists oauth_workspace_keys_workspace_idx on public.oauth_workspace_keys (workspace_id);

alter table public.oauth_workspace_keys enable row level security;
-- Service role only.

-- key_prefix on api_keys may already exist in production from earlier migrations
alter table public.api_keys add column if not exists key_prefix text;
