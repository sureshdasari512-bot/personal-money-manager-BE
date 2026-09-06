-- Local bootstrap only. Change this password after first login.
-- Email: admin@local.test
-- Password: Admin@1234

insert into users (email, password_hash, role, is_active)
values (
  'admin@local.test',
  '$2b$10$ApVJmthjrgRxrDNpkRJeVuz3O4GHVhIqznOMXwCtuUcB97ysFo.ge',
  'admin',
  true
);
