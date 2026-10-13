export type UserRole = 'admin' | 'user';

export type TransactionType = 'lend' | 'borrow';

export type TransactionStatus = 'pending' | 'partially_paid' | 'paid' | 'cancelled';

export type NotificationType = 'due_reminder' | 'overdue_summary';

export type DueReminderWindow = 'due_minus_2' | 'due_minus_1' | 'due_today';

export interface DueReminderItem {
  transactionId: string;
  userId: string;
  userEmail: string;
  personId: string;
  personName: string;
  type: TransactionType;
  amountCents: number;
  outstandingCents: number;
  dueDate: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  email: string;
  role: UserRole;
  isActive: boolean;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  token: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: string;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PublicInvitation extends Invitation {
  status: InvitationStatus;
}

export interface CreateInvitationInput {
  email: string;
  role: UserRole;
}

export interface Person {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface UpsertPersonInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface PeopleCursorParams {
  /** Opaque base64 cursor encoding (created_at, id) of the last seen row */
  cursor?: string;
  /** Maximum records to return (default 20, max 100) */
  limit: number;
  /** Optional free-text filter — matched case-insensitively against name, phone, and email */
  q?: string;
}

export interface PeoplePage {
  people: Person[];
  /** Cursor to pass as ?cursor= on the next request. Absent when no more rows exist. */
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  personId: string;
  type: TransactionType;
  status: TransactionStatus;
  amountCents: number;
  transactionDate: string;
  dueDate: string | null;
  notes: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface UpsertTransactionInput {
  personId: string;
  type: TransactionType;
  amountCents: number;
  transactionDate: string;
  dueDate?: string;
  notes?: string;
}

export interface Repayment {
  id: string;
  transactionId: string;
  amountCents: number;
  /** Portion of amountCents that reduced the outstanding principal. The rest went to interest. */
  towardPrincipalCents: number;
  paidOn: string;
  notes: string | null;
  allocationId: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface CreateRepaymentInput {
  amountCents: number;
  towardPrincipalCents: number;
  paidOn: string;
  notes?: string;
  allocationId?: string;
}

/**
 * Breakdown shown to the user before they confirm a repayment.
 * Interest is always cleared first; any remainder reduces principal.
 */
export interface RepaymentPreview {
  amountCents: number;
  accruedInterestCents: number;
  /** Portion of the payment that goes toward clearing interest (≤ accruedInterestCents) */
  towardInterestCents: number;
  /** Portion of the payment that goes toward reducing principal */
  towardPrincipalCents: number;
  outstandingPrincipalBefore: number;
  outstandingPrincipalAfter: number;
  /** Interest still unpaid after this payment */
  remainingInterestCents: number;
  /** True when both principal and remaining interest hit zero */
  willFullySettle: boolean;
}

export interface RepaymentAllocation {
  id: string;
  userId: string;
  personId: string;
  totalAmountCents: number;
  paidOn: string;
  notes: string | null;
  unallocatedCents: number;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface CreateAllocationInput {
  personId: string;
  totalAmountCents: number;
  paidOn: string;
  notes?: string;
}

export interface PersonRepaymentResult {
  allocation: RepaymentAllocation;
  repayments: Repayment[];
}

export type InterestPeriod = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export interface TransactionInterestConfig {
  id: string;
  transactionId: string;
  userId: string;
  interestRateBps: number;
  interestPeriod: InterestPeriod;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface UpsertInterestConfigInput {
  interestRateBps: number;
  interestPeriod: InterestPeriod;
}

/**
 * One rate segment in the interest rate history log.
 * effective_from is inclusive, effective_to is exclusive (null = still active).
 */
export interface InterestRateHistory {
  id: string;
  transactionId: string;
  userId: string;
  interestRateBps: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * One accrual segment where both the rate and the outstanding principal
 * were constant.  A new segment is created whenever the rate changes or
 * a repayment is made.
 * period_start_date is inclusive; period_end_date is exclusive (null = open).
 * daily_interest_cents = floor(opening_balance_cents × rate_bps / 10000 / 30)
 * accrued_interest_cents = daily_interest_cents × days_count
 */
export interface InterestAccrual {
  id: string;
  transactionId: string;
  userId: string;
  periodStartDate: string;
  periodEndDate: string | null;
  openingBalanceCents: number;
  interestRateBps: number;
  daysCount: number;
  dailyInterestCents: number;
  accruedInterestCents: number;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Data needed to notify a user that interest has been posted for a period. */
export interface InterestReminderItem {
  transactionId: string;
  userId: string;
  userEmail: string;
  personId: string;
  personName: string;
  type: TransactionType;
  amountCents: number;
  outstandingCents: number;
  accruedInterestCents: number;
  interestRateBps: number;
  interestPeriod: InterestPeriod;
  periodEndDate: string;
}

export interface LedgerTransaction extends Transaction {
  outstandingCents: number;
  accruedInterestCents: number;
  interestConfig: TransactionInterestConfig | null;
  repayments: Repayment[];
}

export interface PersonLedger {
  transactions: LedgerTransaction[];
  netBalanceCents: number;
}

export interface DashboardPersonBalance {
  personId: string;
  personName: string;
  netBalanceCents: number;
  /** Unpaid accrued interest across all transactions with this person */
  accruedInterestCents: number;
  /** Earliest interest accrual start date for this person (YYYY-MM-DD), null if no interest */
  interestPeriodFrom: string | null;
  /** Latest interest accrual end date (or today if open) for this person (YYYY-MM-DD), null if no interest */
  interestPeriodTo: string | null;
}

export interface DashboardDueItem {
  transactionId: string;
  personId: string;
  personName: string;
  type: TransactionType;
  amountCents: number;
  /** True outstanding = principal + unpaid interest */
  outstandingCents: number;
  /** Outstanding principal only (excludes interest) */
  outstandingPrincipalCents: number;
  /** Unpaid accrued interest for this transaction */
  accruedInterestCents: number;
  transactionDate: string;
  dueDate: string;
}

export interface DashboardSummary {
  /** Total outstanding (principal + interest) that others owe the user */
  totalOwedToUserCents: number;
  /** Principal-only portion of totalOwedToUserCents */
  totalOwedToUserPrincipalCents: number;
  /** Total outstanding (principal + interest) that the user owes others */
  totalUserOwesCents: number;
  overdueCount: number;
  upcomingDueCount: number;
  people: DashboardPersonBalance[];
  overdue: DashboardDueItem[];
  upcomingDue: DashboardDueItem[];
}

export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface QueryResult<T> {
  rows: T[];
}

export type SqlQuery = <T>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;

/**
 * Database abstraction so services/repositories depend on a contract, not `pg`.
 */
export interface Database {
  query: SqlQuery;
  withTransaction<T>(work: (query: SqlQuery) => Promise<T>): Promise<T>;
}

export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  message: string;
  fields: FieldErrors | null;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly fields: FieldErrors | null;

  /**
   * Creates an HTTP-aware application error for the centralized error middleware.
   *
   * @param message - Safe client-facing message (never raw DB/driver text)
   * @param statusCode - HTTP status to return
   * @param fields - Per-field messages, or null for a global-only error
   */
  constructor(message: string, statusCode: number, fields: FieldErrors | null = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.fields = fields;
  }
}
