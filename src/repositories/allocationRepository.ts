import type { CreateAllocationInput, RepaymentAllocation, SqlQuery } from '../types/index.js';
import { toIsoDate } from '../utils/isoDate.js';

interface AllocationRow {
  id: string;
  user_id: string;
  person_id: string;
  total_amount_cents: string | number;
  paid_on: Date | string;
  notes: string | null;
  unallocated_cents: string | number;
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const ALLOCATION_COLUMNS = `
  id, user_id, person_id, total_amount_cents, paid_on, notes, unallocated_cents,
  deleted_at, deleted_by, created_at, created_by, updated_at, updated_by
`;

/**
 * Maps a `repayment_allocations` table row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase allocation
 */
function mapAllocation(row: AllocationRow): RepaymentAllocation {
  return {
    id: row.id,
    userId: row.user_id,
    personId: row.person_id,
    totalAmountCents: Number(row.total_amount_cents),
    paidOn: toIsoDate(row.paid_on),
    notes: row.notes,
    unallocatedCents: Number(row.unallocated_cents),
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Inserts a person-level payment header. Slices are written separately on repayments.
 *
 * @param userId - Acting user (owner and audit columns)
 * @param input - Total amount, date, optional notes
 * @param query - Query bound to the open DB transaction
 * @returns The created allocation
 */
export async function createAllocation(
  userId: string,
  input: CreateAllocationInput,
  query: SqlQuery,
): Promise<RepaymentAllocation> {
  const result = await query<AllocationRow>(
    `INSERT INTO repayment_allocations
       (user_id, person_id, total_amount_cents, paid_on, notes, unallocated_cents, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, 0, $1, $1)
     RETURNING ${ALLOCATION_COLUMNS}`,
    [userId, input.personId, input.totalAmountCents, input.paidOn, input.notes ?? null],
  );
  return mapAllocation(result.rows[0]);
}
