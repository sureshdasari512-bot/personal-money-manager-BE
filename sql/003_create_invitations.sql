create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table invitations (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  token text unique not null,
  role text not null default 'user',

  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,

  invited_by uuid not null references users(id),
  revoked_by uuid references users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint invitations_role_check check (role in ('admin', 'user')),
  constraint invitations_not_expired_before_accept check (
    accepted_at is null or accepted_at <= expires_at + interval '1 minute'
  ),
  constraint invitations_not_both_accepted_and_revoked check (
    not (accepted_at is not null and revoked_at is not null)
  )
);

comment on table invitations is
  'Admin-issued invite tokens for account creation; no public self-registration exists.';

create trigger trg_invitations_updated_at
before update on invitations
for each row
execute function set_updated_at();

create index idx_invitations_pending on invitations (expires_at)
  where accepted_at is null and revoked_at is null;

create index idx_invitations_invited_by on invitations (invited_by);
create index idx_invitations_revoked_by on invitations (revoked_by);
