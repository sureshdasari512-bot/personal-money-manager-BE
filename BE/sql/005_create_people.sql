create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  name text not null,
  phone text,
  email citext,
  notes text,

  deleted_at timestamptz,
  deleted_by uuid references users(id),

  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint people_name_not_blank check (btrim(name) <> '')
);

comment on table people is
  'Contacts a user lends money to or borrows money from — not app login accounts.';

create trigger trg_people_updated_at
before update on people
for each row
execute function set_updated_at();

create index idx_people_user_id on people (user_id);

create index idx_people_active on people (user_id) where deleted_at is null;
