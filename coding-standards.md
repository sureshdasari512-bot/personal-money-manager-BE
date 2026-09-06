# Coding Standards — Personal Money Manager
## Frontend (React + TypeScript) & Backend (Node.js + Express + TypeScript)

**Purpose:** A shared rulebook so the codebase stays consistent, testable, and easy for another developer (or future-you) to read — regardless of which layer they're working in.

---

## 1. Guiding Principles (apply to both FE and BE)

### SOLID (5 principles for maintainable object-oriented / modular design)
| Principle | Plain-English meaning | Example in this app |
|---|---|---|
| **S** — Single Responsibility | A class/function/module should have exactly one reason to change | `transactionService.ts` only handles transaction business logic; it never sends emails or talks to Express directly |
| **O** — Open/Closed | Open for extension, closed for modification | Adding a new notification channel (e.g., SMS later) should mean *adding* a new `NotificationChannel` implementation, not editing the existing email logic |
| **L** — Liskov Substitution | A subtype should be usable anywhere its base type is expected without breaking behavior | If you have a `Repository<T>` interface, any concrete repository (e.g., `TransactionRepository`) must honor the same contract |
| **I** — Interface Segregation | Don't force a module to depend on methods it doesn't use | Split a fat `UserService` into `AuthService`, `InvitationService`, `UserProfileService` rather than one god-object |
| **D** — Dependency Inversion | Depend on abstractions, not concrete implementations | Services depend on a `Database` interface/type, not directly on the `pg` driver — makes testing with mocks possible |

### DRY (Don't Repeat Yourself)
🟢 If you copy-paste a block of logic a third time, extract it into a shared function/hook/utility.
⚠️ **Common mistake:** over-applying DRY too early ("premature abstraction") — two similar-looking pieces of code that *happen* to look alike today but represent different business rules should **not** be merged just to avoid duplication. Duplicate first, abstract once the pattern is proven (rule of three).

### KISS (Keep It Simple, Stupid)
🟢 Prefer the boring, obvious solution over a clever one. If a teammate needs your explanation to understand a piece of code, it's probably too clever.
⚠️ **Common mistake:** reaching for a design pattern because it's "enterprise," not because the problem needs it. A single `if/else` doesn't need a Strategy pattern.

---

## 2. Documentation Standard (mandatory for every function)

Every exported function/method — on both FE and BE — must have a **TSDoc/JSDoc** block: what it does, its parameters, its return value, and any thrown errors.

```typescript
/**
 * Calculates the outstanding balance for a single transaction.
 *
 * @param amountCents - Original transaction amount, in smallest currency unit (paise/cents)
 * @param repayments - List of repayment amounts (in cents) made against this transaction
 * @returns The remaining outstanding amount in cents. Returns 0 if fully repaid.
 * @throws {Error} If any repayment amount is negative
 */
function calculateOutstandingBalance(amountCents: number, repayments: number[]): number {
  const totalRepaid = repayments.reduce((sum, r) => {
    if (r < 0) throw new Error('Repayment amount cannot be negative');
    return sum + r;
  }, 0);
  return Math.max(amountCents - totalRepaid, 0);
}
```

Internal (non-exported) helper functions can have a shorter one-line `//` comment if their name is already self-explanatory — don't force TSDoc on a trivial 2-line private helper, that's documentation for documentation's sake (violates KISS).

---

## 3. Backend Standards (Node.js + Express + TypeScript)

### 3.1 Layered architecture (Design Pattern: Layered / Repository / Service)
```
src/
  controllers/     -- HTTP layer only: parse req, call service, shape res. No business logic.
  services/        -- Business logic. No knowledge of Express (req/res).
  repositories/     -- Data access only (SQL queries). No business logic.
  middlewares/      -- auth, error handling, validation
  validators/        -- zod/express-validator schemas per route
  types/              -- shared TypeScript interfaces/types
  utils/                -- pure helper functions (date formatting, currency conversion)
  routes/                -- Express route definitions, wire controller to path
  config/                  -- env loading, DB connection setup
```

🟢 **Why layers matter (Feynman-style):** Imagine your controller as a waiter, your service as the chef, and your repository as the person stocking the pantry. The waiter (controller) never cooks — they just take the order and hand back the plate. The chef (service) never goes to the pantry themselves — they ask the stock person (repository) for ingredients. If you swap the pantry's location (change database), the chef's recipe doesn't change.

### 3.2 Example: Controller → Service → Repository

```typescript
// repositories/transactionRepository.ts
/**
 * Fetches all non-deleted transactions for a given user and person.
 * @param userId - ID of the authenticated user
 * @param personId - ID of the person whose transactions to fetch
 * @returns Array of transaction rows
 */
export async function findTransactionsByPerson(
  userId: string,
  personId: string
): Promise<Transaction[]> {
  const result = await db.query(
    `SELECT * FROM transactions
     WHERE user_id = $1 AND person_id = $2 AND deleted_at IS NULL
     ORDER BY transaction_date DESC`,
    [userId, personId]
  );
  return result.rows;
}
```

```typescript
// services/transactionService.ts
/**
 * Retrieves the transaction history and net outstanding balance for a person.
 * @param userId - Authenticated user's ID
 * @param personId - Target person's ID
 * @returns Transaction history plus the computed net balance
 */
export async function getPersonLedger(userId: string, personId: string) {
  const transactions = await transactionRepository.findTransactionsByPerson(userId, personId);
  const netBalance = calculateNetBalance(transactions); // pure function, unit-testable in isolation
  return { transactions, netBalance };
}
```

```typescript
// controllers/transactionController.ts
/**
 * GET /people/:personId/ledger
 * Returns transaction history and net balance for a person.
 */
export async function getPersonLedgerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { personId } = req.params;
    const userId = req.user.id; // set by auth middleware
    const ledger = await transactionService.getPersonLedger(userId, personId);
    res.status(200).json(ledger);
  } catch (err) {
    next(err); // centralized error-handling middleware takes over
  }
}
```

⚠️ **Common mistake:** writing SQL queries directly inside controllers. This couples HTTP handling to data access and makes both harder to test and reuse (violates Single Responsibility).

### 3.3 Error handling (Design Pattern: centralized error middleware)
```typescript
/**
 * Centralized Express error-handling middleware.
 * Catches errors thrown/passed via next(err) from any controller.
 */
export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.statusCode ?? 500;
  logger.error({ err, path: req.path }, 'Request failed');
  res.status(statusCode).json({
    message: statusCode === 500 ? 'Internal server error' : err.message,
  });
}
```
🟢 Never leak raw stack traces or DB error messages to the client in production — log them server-side, return a generic message.

### 3.4 Validation (Design Pattern: schema validation at the boundary)
Every route's input is validated with `zod` **before** it reaches the service layer:
```typescript
export const createTransactionSchema = z.object({
  personId: z.string().uuid(),
  type: z.enum(['lend', 'borrow']),
  amountCents: z.number().int().positive(),
  transactionDate: z.string().date(),
  dueDate: z.string().date().optional(),
});
```

### 3.5 Authentication: token issuance & storage (httpOnly cookies)
JWTs (JSON Web Tokens) are issued on login and stored in an **httpOnly cookie**, never in `localStorage`/`sessionStorage`. JavaScript cannot read an httpOnly cookie, which blocks token theft via XSS (Cross-Site Scripting). Because the frontend (Vercel) and backend (Render) are on different domains, the cookie must be configured for cross-site use and CORS (Cross-Origin Resource Sharing) must explicitly allow credentials.

```typescript
/**
 * Issues a signed JWT and sets it as an httpOnly cookie on successful login.
 */
function issueAccessTokenCookie(res: Response, user: { id: string; role: 'admin' | 'user' }) {
  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: '15m',
  });
  res.cookie('accessToken', token, {
    httpOnly: true,     // blocks JS access — mitigates XSS token theft
    secure: true,        // cookie only sent over HTTPS
    sameSite: 'none',     // required: FE and BE are different domains
    maxAge: 15 * 60 * 1000,
  });
}
```

```typescript
// CORS must allow the exact frontend origin + credentials — never '*' with credentials
app.use(cors({
  origin: 'https://your-frontend.vercel.app',
  credentials: true,
}));
```

```typescript
/**
 * Reads and verifies the JWT from the httpOnly cookie, attaching the user to req.
 */
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
```

⚠️ **Common mistake:** setting `sameSite: 'none'` without `secure: true` — browsers reject that combination outright and the cookie silently never gets set.

🔴 **CSRF (Cross-Site Request Forgery) mitigation required:** since browsers auto-attach cookies to any request to your domain, add a CSRF token (e.g., via `csrf-csrf`) verified on every state-changing (`POST`/`PUT`/`DELETE`) request. This pairs with the RBAC/RLS defense-in-depth already in §3.6 — cookies solve XSS, CSRF tokens solve the tradeoff cookies introduce.

### 3.6 RBAC (Role-Based Access Control) enforcement
The backend is the **only** authoritative layer for role checks — never rely on the frontend to decide what's allowed.

```typescript
/**
 * Restricts a route to users with one of the given roles.
 * @param allowedRoles - Roles permitted to access this route
 */
function requireRole(...allowedRoles: Array<'admin' | 'user'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

// Applied per route, after authenticate():
router.post('/invitations', authenticate, requireRole('admin'), invitationController.create);
```

🔴 **Defense-in-depth:** also enable Supabase RLS (Row Level Security) policies on every table, so a bug in this middleware doesn't become a data leak. `requireRole` blocks the *request*; RLS blocks the *row* at the database level, independently.

### 3.7 Naming conventions
| Item | Convention | Example |
|---|---|---|
| Files | camelCase | `transactionService.ts` |
| Classes/Interfaces | PascalCase | `TransactionRepository`, `AppError` |
| Functions/variables | camelCase | `calculateOutstandingBalance` |
| Constants | UPPER_SNAKE_CASE | `MAX_INVITE_EXPIRY_HOURS` |
| DB tables/columns | snake_case | `transaction_date`, `amount_cents` |

---

## 4. Frontend Standards (React + TypeScript)

### 4.1 Folder structure (Design Pattern: feature-based / co-location)
```
src/
  features/
    transactions/
      components/       -- TransactionList.tsx, TransactionForm.tsx
      hooks/             -- useTransactions.ts (data fetching + local logic)
      api.ts              -- API calls scoped to this feature
      types.ts
    people/
    dashboard/
    admin/              -- InvitationsPage, UserManagementPage — role-gated (see §4.4 RoleGuard); Option A: lives in the same app, not a separate admin app
  components/          -- truly shared, reusable UI (Button, Modal, Input)
  hooks/                  -- shared hooks (useAuth, useDebounce)
  lib/                      -- api client setup, date/currency utils
  types/                      -- global shared types
```

🟢 **Feynman-style reasoning:** Group code by *feature*, not by *file type*. If you delete the "transactions" feature folder, nothing about "people" or "dashboard" should break. This is far easier to navigate than a giant `components/` folder with 80 unrelated files.

### 4.2 Component design (Single Responsibility applied to UI)
```typescript
/**
 * Displays a single transaction row with amount, date, and status badge.
 * Purely presentational — receives all data via props, no data fetching here.
 */
interface TransactionRowProps {
  transaction: Transaction;
  onRepaymentClick: (transactionId: string) => void;
}

export function TransactionRow({ transaction, onRepaymentClick }: TransactionRowProps) {
  return (
    <div className="flex justify-between p-3 border-b">
      <span>{transaction.personName}</span>
      <span>{formatCurrency(transaction.amountCents)}</span>
      <button onClick={() => onRepaymentClick(transaction.id)}>Add Repayment</button>
    </div>
  );
}
```

⚠️ **Common mistake:** fetching data *inside* presentational components (`useEffect` + `fetch` directly in `TransactionRow`). This mixes concerns and makes the component impossible to reuse/test in isolation. Data-fetching belongs in a **custom hook** or a parent "container" component.

### 4.3 Custom hooks (Design Pattern: separation of data logic from UI)
```typescript
/**
 * Fetches and caches transactions for a given person.
 * @param personId - The person whose transactions to load
 * @returns transactions array, loading state, and error state
 */
export function useTransactions(personId: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchTransactionsByPerson(personId)
      .then((data) => { if (!cancelled) setTransactions(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  return { transactions, isLoading, error };
}
```

### 4.4 API client setup (auth cookies)
Since auth now lives in an httpOnly cookie (§3.5) instead of a token you attach manually, every request must tell the browser to send credentials — otherwise the cookie is silently omitted and every request looks unauthenticated.

```typescript
// lib/api-client.ts
/**
 * Base fetch wrapper. `credentials: 'include'` is required on every call so
 * the httpOnly auth cookie is sent cross-origin (frontend and backend are
 * on different domains).
 */
export async function apiFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}
```

⚠️ **Common mistake:** forgetting `credentials: 'include'` on a one-off `fetch` call outside this wrapper — always go through `apiFetch` rather than calling `fetch` directly in a component or hook (this is also a DRY win, not just a security one).

### 4.5 Role-based UI guarding (RoleGuard) — UX only, not security
```typescript
/**
 * Wraps a route and redirects away if the current user's role isn't allowed.
 * NOTE: UX convenience only — the backend's requireRole (§3.6) is the real enforcement.
 */
function RoleGuard({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const { role, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
  if (!role || !allowedRoles.includes(role)) return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
```
⚠️ **Common mistake:** hiding admin controls with CSS (`display: none`) or a `disabled` attribute instead of not rendering them at all (`{role === 'admin' && <Button/>}`) — the disabled element and its click handler still ship in the JS bundle.

### 4.6 Type safety
🟢 No `any`. If a type is genuinely unknown (e.g., a third-party response), use `unknown` and narrow it explicitly.
🟢 Define API response types once in `types.ts` and reuse across the feature — don't inline object shapes repeatedly (DRY).

### 4.7 Naming conventions
| Item | Convention | Example |
|---|---|---|
| Components | PascalCase | `TransactionForm.tsx` |
| Hooks | camelCase, `use` prefix | `useTransactions.ts` |
| Non-component files | camelCase | `api.ts`, `formatCurrency.ts` |
| CSS classes (if not using Tailwind utility classes) | kebab-case | `transaction-row` |

### 4.8 UI/UX Design Principles (Enterprise-level)
🟢 **The core idea (Feynman-style):** enterprise-grade UI isn't about looking fancy — it's about a user *never having to guess*. Every screen should answer three questions instantly: "Where am I? What can I do here? What just happened?" The principles below exist to make those three answers obvious every time.

| Principle | What it means | How we apply it here |
|---|---|---|
| **Consistency (design system)** | Same component looks/behaves the same everywhere | One shared `Button`, `Input`, `Modal` in `components/` (§4.1) — never a one-off styled button per screen |
| **Visual hierarchy** | The most important thing on screen should be the most visually prominent | On the dashboard, "Net balance" is the largest element; supporting stats are smaller |
| **Feedback for every action** | User always knows the system received their action | Buttons show a loading spinner while a request is in flight; disable the button during submit to prevent double-submit |
| **Error prevention & clear error states** | Don't let users submit bad data; when they do, tell them exactly what's wrong | Inline field-level validation errors (not just a generic toast), e.g. "Amount must be greater than 0" next to the field itself |
| **Empty states** | Every list/screen has a designed "nothing here yet" state, not a blank page | "No transactions yet — add your first lend/borrow" with a call-to-action button, not an empty `<div>` |
| **Accessibility (WCAG AA baseline)** | Usable via keyboard, screen reader, and sufficient color contrast | Every interactive element has a visible focus state; icons paired with text labels, not icon-only buttons |
| **Responsive & mobile-first** | Layout adapts down to the smallest supported screen without breaking | Build the mobile layout first (per the SRS's mobile-first UI requirement), then progressively enhance for larger screens |
| **Perceived performance** | The app should *feel* fast even when a request takes time | Skeleton loaders instead of blank screens/spinners for list views; optimistic UI updates for repayments (show it immediately, roll back only if the API call fails) |

**Design tokens example** (single source of truth for spacing/color/typography — prevents "enterprise app with 12 shades of blue"):
```typescript
// lib/design-tokens.ts
/**
 * Centralized design tokens. Components must reference these instead of
 * hardcoding hex codes or pixel values, so the whole app can be re-themed
 * from one place (e.g., adding dark mode later).
 */
export const tokens = {
  color: {
    primary: '#2563eb',
    danger: '#dc2626',
    success: '#16a34a',
    textMuted: '#6b7280',
  },
  spacing: { sm: '8px', md: '16px', lg: '24px' },
  radius: { sm: '4px', md: '8px' },
} as const;
```

⚠️ **Common mistake:** treating UI/UX as "make it look nice at the end" instead of a standard applied per component as it's built. Retrofitting consistent spacing/colors across 30 already-built screens is far more expensive than enforcing design tokens from Phase 1.

🔴 **Free tooling to enforce this at enterprise level without a design team:**
| Tool | Purpose | Cost |
|---|---|---|
| **shadcn/ui** or **Radix UI + Tailwind** | Accessible, unstyled-but-themeable component primitives — gives you enterprise-grade accessibility (focus management, ARIA (Accessible Rich Internet Applications) attributes) for free instead of building it yourself | Free, open-source |
| **Storybook** | Build/preview components in isolation, catches visual inconsistency before it ships | Free |
| **axe DevTools** (browser extension) | Automated accessibility audit | Free |
| **Lighthouse** (built into Chrome DevTools) | Performance + accessibility + best-practices scoring | Free |

---

## 5. Tooling to Enforce Standards Automatically (all free)

| Tool | Purpose |
|---|---|
| **ESLint** (with `@typescript-eslint`) | Catches SOLID/DRY violations style issues, unused vars, `any` usage |
| **Prettier** | Consistent formatting, no bikeshedding over style in code review |
| **Husky + lint-staged** | Runs ESLint/Prettier automatically on `git commit` |
| **TSDoc ESLint plugin** (`eslint-plugin-tsdoc`) | Enforces that documentation blocks are syntactically valid |
| **Vitest / Jest** | Unit tests for pure functions (balance calculation, formatters) |
| **GitHub Actions** | Runs lint + tests on every PR (ties into FR-4.5 from the SRS) |

⚠️ **Common mistake:** adding these tools *after* the codebase has grown large — retrofitting linting rules onto thousands of existing lines causes a wall of errors that gets ignored. Set this up on day one, even before Phase 1 features.

---

## 6. Design Patterns Reference (used across this app)

| Pattern | Where it's used | Why |
|---|---|---|
| **Repository Pattern** | BE data access layer | Decouples business logic from raw SQL/DB driver |
| **Service Layer Pattern** | BE business logic | Keeps controllers thin, logic reusable/testable |
| **Middleware/Chain of Responsibility** | Express auth, validation, error handling | Each concern handled independently, composable |
| **Custom Hook Pattern** | FE data-fetching, shared stateful logic | Keeps components purely presentational |
| **Factory Function** | Creating typed API request objects (e.g., `createTransactionPayload()`) | Centralizes object construction, avoids duplication |
| **Strategy Pattern** (Phase 4+) | Notification channels (email now, SMS/push later) | New channel = new implementation, no changes to existing code (Open/Closed) |

---

## 7. Code Review Checklist (quick reference)
- [ ] Every exported function has a TSDoc/JSDoc block
- [ ] No business logic in controllers or presentational components
- [ ] No `any` types
- [ ] Money handled as integers, never floats
- [ ] New DB writes wrapped in transactions where multiple tables are touched
- [ ] No duplicated logic that should be a shared util/hook (but not over-abstracted either)
- [ ] Tests added/updated for any pure logic change
