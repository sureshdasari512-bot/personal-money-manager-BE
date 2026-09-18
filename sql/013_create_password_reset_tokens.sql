create table password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  token_hash text not null,

  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint password_reset_tokens_token_hash_unique unique (token_hash),
  constraint password_reset_tokens_not_expired_before_use check (
    used_at is null or used_at <= expires_at + interval '1 minute'
  ),
  constraint password_reset_tokens_not_both_used_and_revoked check (
    not (used_at is not null and revoked_at is not null)
  )
);

comment on table password_reset_tokens is
  'Hashed one-hour password-reset tokens. The raw token is emailed once and never stored.';

create trigger trg_password_reset_tokens_updated_at
before update on password_reset_tokens
for each row
execute function set_updated_at();

create index idx_password_reset_tokens_user_id on password_reset_tokens (user_id);

create index idx_password_reset_tokens_active on password_reset_tokens (user_id)
  where used_at is null and revoked_at is null;
