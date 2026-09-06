# Software Requirements Specification (SRS)
## Personal Money Manager

**Version:** 1.0
**Document Type:** Phase-wise SRS
**Prepared for:** Personal / small-scale production deployment
**Constraint:** All infrastructure, tools, and services used must be on free tiers (no paid subscriptions)

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements for the **Personal Money Manager**, a mobile-first web application used to track personal lending and borrowing activity between the user and other individuals ("people"). It defines requirements in **phases**, so the system can be built and shipped incrementally while still following enterprise-grade engineering practices (security, data integrity, testability, observability).

### 1.2 Scope
The system will:
- Track money lent to and borrowed from individuals.
- Record partial repayments and compute outstanding balances.
- Track due dates and send email reminders.
- Support two roles: **Admin** and **User**, with invite-only account creation.
- Provide a dashboard summarizing net financial position across all people.

The system will **not**:
- Move, hold, or process real money (no payment gateway integration).
- Support public self-registration.

### 1.3 Definitions, Acronyms, Abbreviations
| Term | Meaning |
|---|---|
| SRS | Software Requirements Specification |
| JWT | JSON Web Token |
| RLS | Row Level Security (PostgreSQL/Supabase feature restricting row access per user) |
| RBAC | Role-Based Access Control |
| CRUD | Create, Read, Update, Delete |
| API | Application Programming Interface |
| CI/CD | Continuous Integration / Continuous Deployment |
| PWA | Progressive Web App |
| NFR | Non-Functional Requirement |

### 1.4 Intended Audience
Solo developer or small team building and maintaining the application; useful as a reference during implementation, code review, and future onboarding.

---

## 2. Overall Description

### 2.1 Product Perspective
A standalone full-stack web application:
- **Frontend:** React + TypeScript + Vite (mobile-first responsive UI)
- **Backend:** Node.js + Express.js REST API
- **Database:** PostgreSQL (via Supabase free tier)
- **Auth:** JWT-based (either self-issued or via Supabase Auth — see §7.2 architecture decision)
- **Hosting (all free tier):**
  | Layer | Service | Free-tier notes |
  |---|---|---|
  | Frontend | Vercel | Free Hobby plan, generous bandwidth for personal use |
  | Backend | Render | Free web service tier (spins down on inactivity — see NFR §6.4) |
  | Database | Supabase | Free tier: 500MB DB, 50k monthly active users, pauses after 7 days inactivity |
  | Domain | DuckDNS | Free dynamic DNS subdomain |
  | Email | Brevo (formerly Sendinblue) or Resend | Free tier: ~300 emails/day (Brevo) or 100/day (Resend) |
  | Cron/Scheduling | GitHub Actions (scheduled workflow) | Free for public/private repos within free minutes quota |
  | Error monitoring | Sentry | Free developer tier |
  | Uptime monitoring | UptimeRobot | Free tier, 5-minute checks (also mitigates Render cold-start) |

### 2.2 User Classes
| Role | Description |
|---|---|
| Admin | Invites new users via email, manages user accounts (enable/disable), no lending/borrowing data of their own required |
| User | Manages own contacts ("people"), lending/borrowing records, repayments; views own dashboard |

### 2.3 Operating Environment
- Client: Modern mobile/desktop browsers (Chrome, Safari, Firefox — last 2 versions)
- Server: Node.js LTS runtime on Render
- Database: PostgreSQL 15+ (Supabase managed)

### 2.4 Assumptions & Constraints
- Single-currency support at launch (currency configurable per deployment, not per-transaction) to keep Phase 1 scope small.
- Free-tier services impose limits (cold starts, email caps, DB size) — these are documented as constraints, not defects.
- No real payment processing; the app is a ledger only.

---

## 3. System-Wide Non-Functional Requirements (apply to all phases)

| Category | Requirement |
|---|---|
| **Security** | Passwords hashed with bcrypt (min. cost factor 10); all traffic over HTTPS; JWT access tokens short-lived (15 min) with refresh token rotation, **stored in an httpOnly, secure, `SameSite=None` cookie** (never in `localStorage`) since frontend and backend are on different domains — this blocks token theft via XSS; CSRF (Cross-Site Request Forgery) protection required on state-changing requests as a consequence of using cookies; input validation on every endpoint (e.g., using `zod` or `express-validator`); RLS enabled on all Supabase tables as defense-in-depth even if Express also enforces auth |
| **Data Integrity** | All multi-step writes (e.g., repayment + balance update) wrapped in DB transactions; monetary values stored as integers (smallest currency unit), never floats |
| **Auditability** | `created_at`/`updated_at` timestamps on all tables; soft-delete (`deleted_at`) instead of hard delete for transactions and repayments |
| **Performance** | API responses < 500ms for standard CRUD under normal load; balance calculations done via SQL aggregation, not application-loop iteration |
| **Availability** | Best-effort on free tier; Render free web services cold-start after ~15 min idle — mitigated via UptimeRobot ping (§2.1) |
| **Observability** | Structured logging (e.g., `pino`) on backend; errors reported to Sentry free tier |
| **Testability** | Unit tests for balance-calculation logic and auth middleware at minimum; integration tests for critical API endpoints |
| **Accessibility** | Mobile-first responsive layout; minimum tap-target sizing; readable contrast ratios (WCAG AA where feasible) |

---

## 4. Phase-Wise Functional Requirements

### **Phase 1 — Foundation: Auth, Roles, Invitations, People**
Goal: a securely accessible, empty shell where an Admin can onboard Users and Users can manage contacts.

| ID | Requirement |
|---|---|
| FR-1.1 | System shall support Admin-initiated user invitations via email (invite link with expiring token, e.g. 48 hours) |
| FR-1.2 | Invited user shall set a password and activate their account via the invite link; no public sign-up route shall exist |
| FR-1.3 | System shall support login with email + password, issuing a JWT access token and refresh token stored in httpOnly cookies (see §3 Security NFR) |
| FR-1.4 | System shall enforce RBAC middleware distinguishing Admin vs. User routes |
| FR-1.5 | Admin shall be able to view all users and disable/re-enable a user's access |
| FR-1.6 | User shall be able to create, edit, and delete "People" (contacts) — name, optional phone/email, optional notes |
| FR-1.7 | System shall prevent a User from viewing/modifying another User's people or data (enforced by both API auth checks and DB RLS) |

**Phase 1 exit criteria:** Admin can invite a user; user can log in and manage their contact list; no cross-user data leakage (verified by test).

---

### **Phase 2 — Core Ledger: Lending, Borrowing, Repayments**
Goal: the actual money-tracking functionality.

| ID | Requirement |
|---|---|
| FR-2.1 | User shall be able to record a "lend" transaction against a person: amount, date, optional due date, notes |
| FR-2.2 | User shall be able to record a "borrow" transaction against a person with the same fields |
| FR-2.3 | User shall be able to record a partial or full repayment against any transaction, with amount and payment date |
| FR-2.4 | System shall reject a repayment that would cause the outstanding balance on a transaction to go negative |
| FR-2.5 | System shall compute outstanding balance per transaction as `amount - sum(repayments)` via SQL aggregation |
| FR-2.6 | System shall compute net balance per person as `sum(outstanding lends) - sum(outstanding borrows)` |
| FR-2.7 | User shall be able to view full transaction + repayment history per person, sorted by date |
| FR-2.8 | User shall be able to edit or soft-delete a transaction only if it has no repayments (to preserve ledger integrity); deleting a transaction with repayments requires explicit confirmation and cascades a soft-delete |
| FR-2.9 | All monetary fields stored as integers in the smallest currency unit (e.g., paise) |

**Phase 2 exit criteria:** A user can fully record and settle a lending/borrowing relationship with correct balances at every step, verified with automated tests covering rounding and partial-repayment edge cases.

---

### **Phase 3 — Dashboard, Due Dates, Email Reminders**
Goal: turn raw records into actionable insight.

| ID | Requirement |
|---|---|
| FR-3.1 | System shall provide a dashboard showing: total amount owed to user, total amount user owes, count of overdue items, count of upcoming (next 7 days) due items |
| FR-3.2 | System shall list all people with a non-zero net balance, sorted by largest outstanding amount |
| FR-3.3 | System shall flag any transaction past its due date as "Overdue" |
| FR-3.4 | System shall send an email reminder to the User (not the counterparty) for transactions due within a configurable window (default: 3 days before due date) |
| FR-3.5 | System shall send an overdue-summary email on a recurring schedule (e.g., weekly) if any transaction is overdue |
| FR-3.6 | Reminder scheduling shall be implemented via a scheduled job (GitHub Actions cron calling a protected backend endpoint, or Supabase `pg_cron` + Edge Function) — not an in-process `setInterval`, since Render free tier processes can spin down |
| FR-3.7 | User shall be able to opt out of email reminders per notification type |

**Phase 3 exit criteria:** Dashboard reflects live data; reminder emails are verified to arrive correctly and only once per due event (idempotency check to avoid duplicate sends).

---

### **Phase 4 — Enterprise Hardening & Enhancements**
Goal: move from "working app" to "production-grade, maintainable system."

| ID | Requirement |
|---|---|
| FR-4.1 | System shall maintain an audit log of sensitive actions (login, invite sent, user disabled, transaction deleted) |
| FR-4.2 | User shall be able to export their full transaction history as CSV |
| FR-4.3 | System shall support rate limiting on auth endpoints (e.g., `express-rate-limit`) to mitigate brute-force attempts |
| FR-4.4 | System shall be installable as a PWA (add-to-home-screen, offline shell) for a native-app-like mobile experience |
| FR-4.5 | System shall have CI/CD via GitHub Actions: lint + test on every PR, auto-deploy to Vercel/Render on merge to `main` |
| FR-4.6 | System shall have a staging environment (free-tier second Render/Vercel/Supabase project) separate from production |
| FR-4.7 | System shall support basic search/filter on transactions (by person, type, date range, status) |

**Phase 4 exit criteria:** Full CI/CD pipeline green; audit log verified for all sensitive actions; staging/production parity confirmed.

---

## 5. Data Model Summary

```
users            (id, email, password_hash, role, is_active, created_at)
invitations      (id, email, token, expires_at, accepted_at, invited_by)
people           (id, user_id, name, phone, email, notes, created_at)
transactions     (id, user_id, person_id, type[lend|borrow], amount_cents,
                   transaction_date, due_date, notes, deleted_at, created_at)
repayments       (id, transaction_id, amount_cents, paid_on, created_at)
notification_log (id, user_id, transaction_id, type, sent_at)   -- Phase 3
audit_log        (id, user_id, action, metadata, created_at)    -- Phase 4
```

---

## 6. Key Architecture Decision Points

1. **Auth ownership:** Choose either (a) fully custom Express + JWT auth, or (b) Supabase Auth + RLS with Express only for business logic (emails, scheduled jobs, balance-critical writes). Option (b) reduces code to maintain but couples you more tightly to Supabase.
2. **Cron strategy:** GitHub Actions scheduled workflow hitting a signed webhook endpoint is the most reliable free option given Render's cold-start behavior.
3. **Currency handling:** Single currency for Phase 1–3; multi-currency deferred to a later phase if ever needed, since it meaningfully complicates balance math.
4. **Repository strategy:** Frontend and backend live in **separate Git repositories** (not a monorepo). Each deploys independently to Vercel and Render respectively.
5. **RBAC (Role-Based Access Control) layering:** the backend `requireRole` middleware and Supabase RLS policies are the only authoritative enforcement layers (FR-1.4, FR-1.5). Frontend route guards and conditional rendering exist purely for UX and must never be treated as a security boundary.
6. **Frontend structure (Admin vs. User):** Option A — a single React app with role-based routing/UI, not a separate admin app. Revisit this only if the admin feature set (currently just invitations + user management) grows substantially in a later phase.
7. **Token storage:** JWT stored in an httpOnly, secure, `SameSite=None` cookie rather than `localStorage`, since the frontend (Vercel) and backend (Render) are separate domains. This requires explicit CORS `credentials: true` configuration on the backend, `credentials: 'include'` on every frontend request, and CSRF token protection on state-changing endpoints as a tradeoff.

---

## 7. Out of Scope (All Phases)
- Real payment processing / payment gateway integration
- Multi-currency support
- Native mobile apps (PWA covers the mobile-app-like need)
- Public user registration

---

## 8. Free-Tier Limits to Track Operationally
| Service | Limit | Mitigation |
|---|---|---|
| Render free web service | Spins down after ~15 min idle; ~750 hrs/month | UptimeRobot 5-min ping keeps it warm during active hours |
| Supabase free project | Pauses after 7 days with no API calls; 500MB DB | Scheduled cron job doubles as a keep-alive ping |
| Brevo/Resend free email | 300/100 emails per day | Batch overdue-summary emails weekly, not daily, to stay well under cap |
| GitHub Actions | 2,000 free minutes/month (private repos) | Keep scheduled jobs short and infrequent (e.g., every 6 hours, not every minute) |
