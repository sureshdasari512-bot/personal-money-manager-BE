create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null,

  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint refresh_tokens_token_hash_unique unique (token_hash)
);

comment on table refresh_tokens is
  'Hashed refresh tokens per session, enabling revocation (logout, force-logout by admin, stolen-session mitigation).';

create trigger trg_refresh_tokens_updated_at
before update on refresh_tokens
for each row
execute function set_updated_at();

create index idx_refresh_tokens_user_id on refresh_tokens (user_id);

create index idx_refresh_tokens_active on refresh_tokens (token_hash)
  where revoked_at is null;
