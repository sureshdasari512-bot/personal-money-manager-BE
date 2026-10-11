import { db } from '../config/database.js';
import type {
  SqlQuery,
  TransactionInterestConfig,
  UpsertInterestConfigInput,
} from '../types/index.js';

interface InterestConfigRow {
  id: string;
  transaction_id: string;
  user_id: string;
  interest_rate_bps: number;
  interest_period: TransactionInterestConfig['interestPeriod'];
  deleted_at: Date | null;
  deleted_by: string | null;
  created_at: Date;
  created_by: string | null;
  updated_at: Date;
  updated_by: string | null;
}

const INTEREST_CONFIG_COLUMNS = `
  id, transaction_id, user_id, interest_rate_bps, interest_period,
  deleted_at, deleted_by, created_at, created_by, updated_at, updated_by
`;

/**
 * Maps a `transaction_interest_configs` row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase interest config
 */
function mapInterestConfig(row: InterestConfigRow): TransactionInterestConfig {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    interestRateBps: Number(row.interest_rate_bps),
    interestPeriod: row.interest_period,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Finds the active interest config for a transaction, if any.
 *
 * @param transactionId - Parent transaction id
 * @returns The interest config or null if none exists
 */
export async function findByTransactionId(
  transactionId: string,
): Promise<TransactionInterestConfig | null> {
  const result = await db.query<InterestConfigRow>(
    `SELECT ${INTEREST_CONFIG_COLUMNS} FROM transaction_interest_configs
     WHERE transaction_id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [transactionId],
  );
  return result.rows[0] ? mapInterestConfig(result.rows[0]) : null;
}

/**
 * Finds active interest configs for many transactions in one query.
 *
 * @param transactionIds - Parent transaction ids
 * @returns Map of transaction id → interest config
 */
export async function findByTransactionIds(
  transactionIds: string[],
): Promise<Record<string, TransactionInterestConfig>> {
  if (transactionIds.length === 0) {
    return {};
  }
  const result = await db.query<InterestConfigRow>(
    `SELECT ${INTEREST_CONFIG_COLUMNS} FROM transaction_interest_configs
     WHERE transaction_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [transactionIds],
  );
  return Object.fromEntries(
    result.rows.map((row) => [row.transaction_id, mapInterestConfig(row)]),
  );
}

/**
 * Inserts a new interest config for a transaction.
 *
 * @param userId - Acting user (owner + audit columns)
 * @param transactionId - Parent transaction
 * @param input - Rate and period
 * @param query - Optional query bound to an open DB transaction
 * @returns The created config
 */
export async function createInterestConfig(
  userId: string,
  transactionId: string,
  input: UpsertInterestConfigInput,
  query: SqlQuery = db.query,
): Promise<TransactionInterestConfig> {
  const result = await query<InterestConfigRow>(
    `INSERT INTO transaction_interest_configs
       (transaction_id, user_id, interest_rate_bps, interest_period, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $2, $2)
     ON CONFLICT ON CONSTRAINT transaction_interest_configs_transaction_unique DO UPDATE
       SET interest_rate_bps = EXCLUDED.interest_rate_bps,
           interest_period    = EXCLUDED.interest_period,
           deleted_at         = NULL,
           deleted_by         = NULL,
           updated_by         = $2
     RETURNING ${INTEREST_CONFIG_COLUMNS}`,
    [transactionId, userId, input.interestRateBps, input.interestPeriod],
  );
  return mapInterestConfig(result.rows[0]);
}

/**
 * Updates the rate and period on an existing interest config.
 *
 * @param userId - Acting user (audit columns)
 * @param transactionId - Parent transaction
 * @param input - Updated rate and period
 * @param query - Optional query bound to an open DB transaction
 * @returns The updated config, or null if none was found
 */
export async function updateInterestConfig(
  userId: string,
  transactionId: string,
  input: UpsertInterestConfigInput,
  query: SqlQuery = db.query,
): Promise<TransactionInterestConfig | null> {
  const result = await query<InterestConfigRow>(
    `UPDATE transaction_interest_configs
     SET interest_rate_bps = $3,
         interest_period = $4,
         updated_by = $2
     WHERE transaction_id = $1 AND deleted_at IS NULL
     RETURNING ${INTEREST_CONFIG_COLUMNS}`,
    [transactionId, userId, input.interestRateBps, input.interestPeriod],
  );
  return result.rows[0] ? mapInterestConfig(result.rows[0]) : null;
}

/**
 * Soft-deletes the interest config for a transaction.
 *
 * @param userId - Acting user
 * @param transactionId - Parent transaction
 * @param query - Optional query bound to an open DB transaction
 * @returns Whether a row was updated
 */
export async function softDeleteInterestConfig(
  userId: string,
  transactionId: string,
  query: SqlQuery = db.query,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `UPDATE transaction_interest_configs
     SET deleted_at = NOW(),
         deleted_by = $2,
         updated_by = $2
     WHERE transaction_id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [transactionId, userId],
  );
  return result.rows.length > 0;
}
