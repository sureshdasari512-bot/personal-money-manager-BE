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
  paidOn: string;
  notes?: string;
  allocationId?: string;
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

export interface LedgerTransaction extends Transaction {
  outstandingCents: number;
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
}

export interface DashboardDueItem {
  transactionId: string;
  personId: string;
  personName: string;
  type: TransactionType;
  amountCents: number;
  outstandingCents: number;
  transactionDate: string;
  dueDate: string;
}

export interface DashboardSummary {
  totalOwedToUserCents: number;
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
