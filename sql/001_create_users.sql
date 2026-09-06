create extension if not exists citext;

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  password_hash text not null,
  role text not null,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  created_by uuid references users(id),
  updated_by uuid references users(id),
  deleted_by uuid references users(id),

  constraint users_role_check check (role in ('admin', 'user')),
  constraint users_email_format_check check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
