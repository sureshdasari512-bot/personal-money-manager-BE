import { db } from '../config/database.js';
import type { Invitation, UserRole } from '../types/index.js';

interface InvitationRow {
  id: string;
  email: string;
  token: string;
  role: UserRole;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  invited_by: string;
  revoked_by: string | null;
  created_at: Date;
  updated_at: Date;
  updated_by: string | null;
}

const INVITATION_COLUMNS = `
  id, email, token, role,
  expires_at, accepted_at, revoked_at,
  invited_by, revoked_by,
  created_at, updated_at, updated_by
`;

/**
 * Maps an `invitations` table row to the domain type.
 *
 * @param row - Raw snake_case database row
 * @returns CamelCase invitation
 */
function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    email: row.email,
    token: row.token,
    role: row.role,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    invitedBy: row.invited_by,
    revokedBy: row.revoked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Inserts a pending invitation.
 *
 * @param email - Invitee email
 * @param token - Opaque invite token
 * @param role - Role granted on accept
 * @param expiresAt - Expiry timestamp
 * @param invitedBy - Admin user id
 * @returns The inserted invitation
 */
export async function createInvitation(
  email: string,
  token: string,
  role: UserRole,
  expiresAt: Date,
  invitedBy: string,
): Promise<Invitation> {
  const result = await db.query<InvitationRow>(
    `INSERT INTO invitations (email, token, role, expires_at, invited_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING ${INVITATION_COLUMNS}`,
    [email, token, role, expiresAt, invitedBy],
  );
  return mapInvitation(result.rows[0]);
}

/**
 * Lists invitations newest first for the admin view.
 *
 * @returns All invitation rows
 */
export async function findAllInvitations(): Promise<Invitation[]> {
  const result = await db.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM invitations
     ORDER BY created_at DESC`,
  );
  return result.rows.map(mapInvitation);
}

/**
 * Finds one invitation by id.
 *
 * @param id - Invitation id
 * @returns The invitation or null
 */
export async function findInvitationById(id: string): Promise<Invitation | null> {
  const result = await db.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapInvitation(result.rows[0]) : null;
}

/**
 * Finds an invitation by its token.
 *
 * @param token - Invite token from the email link
 * @returns The invitation or null
 */
export async function findInvitationByToken(token: string): Promise<Invitation | null> {
  const result = await db.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM invitations WHERE token = $1 LIMIT 1`,
    [token],
  );
  return result.rows[0] ? mapInvitation(result.rows[0]) : null;
}

/**
 * Finds a still-pending invitation for an email, if one exists.
 *
 * @param email - Invitee email
 * @returns The pending invitation or null
 */
export async function findPendingInvitationByEmail(email: string): Promise<Invitation | null> {
  const result = await db.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM invitations
     WHERE email = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapInvitation(result.rows[0]) : null;
}

/**
 * Marks an invitation as accepted.
 *
 * @param id - Invitation id
 * @param updatedBy - Acting user id, or null when the invitee is not yet a user
 */
export async function markInvitationAccepted(id: string, updatedBy: string | null): Promise<void> {
  await db.query(
    `UPDATE invitations
     SET accepted_at = NOW(), updated_by = $2
     WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [id, updatedBy],
  );
}

/**
 * Revokes a pending invitation.
 *
 * @param id - Invitation id
 * @param revokedBy - Acting admin id
 * @returns The revoked invitation or null
 */
export async function revokeInvitation(id: string, revokedBy: string): Promise<Invitation | null> {
  const result = await db.query<InvitationRow>(
    `UPDATE invitations
     SET revoked_at = NOW(),
         revoked_by = $2,
         updated_by = $2
     WHERE id = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
     RETURNING ${INVITATION_COLUMNS}`,
    [id, revokedBy],
  );
  return result.rows[0] ? mapInvitation(result.rows[0]) : null;
}
