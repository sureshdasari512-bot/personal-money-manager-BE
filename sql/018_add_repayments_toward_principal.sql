-- ---------------------------------------------------------------------------
-- 018_add_repayments_toward_principal.sql
--
-- Adds toward_principal_cents to repayments so outstanding principal is
-- computed correctly when a payment covers interest first.
--
-- Problem (before this migration)
-- ────────────────────────────────
-- outstanding = amount_cents - SUM(repayments.amount_cents)
-- When a ₹66.66 payment goes entirely to interest, the principal was
-- wrongly shown as ₹49,933.34 instead of ₹50,000.
--
-- Fix
-- ────
-- outstanding = amount_cents - SUM(repayments.toward_principal_cents)
-- Only the portion that actually reduces principal is subtracted.
--
-- Back-fill
-- ─────────
-- Existing repayments have no interest context so we conservatively treat
-- their full amount as principal (the safe default for pre-interest data).
-- ---------------------------------------------------------------------------

alter table repayments
  add column if not exists toward_principal_cents bigint not null default 0;

comment on column repayments.toward_principal_cents is
  'Portion of amount_cents that reduced the outstanding principal.
   The remainder (amount_cents - toward_principal_cents) went to interest.
   For repayments recorded before interest was introduced this equals amount_cents.';

-- Back-fill: existing rows had no interest so their full amount reduced principal.
update repayments
set toward_principal_cents = amount_cents
where toward_principal_cents = 0
  and deleted_at is null;

alter table repayments
  add constraint repayments_toward_principal_non_negative
    check (toward_principal_cents >= 0),

  add constraint repayments_toward_principal_lte_amount
    check (toward_principal_cents <= amount_cents);
