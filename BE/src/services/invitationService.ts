import crypto from 'node:crypto';
import { env, MAX_INVITE_EXPIRY_HOURS } from '../config/env.js';
import * as invitationRepository from '../repositories/invitationRepository.js';
import * as userRepository from '../repositories/userRepository.js';
import {
  AppError,
  type CreateInvitationInput,
  type Invitation,
  type PublicInvitation,
  type PublicUser,
} from '../types/index.js';
import { buildInvitationEmail } from '../utils/invitationEmail.js';
import { getInvitationStatus } from '../utils/invitationStatus.js';
import { toPublicUser } from '../utils/userMapper.js';
import { hashPassword } from './authService.js';
import { getEmailChannel } from './resendEmailChannel.js';

/**
 * Adds the derived status used by admin screens.
 *
 * @param invitation - Domain invitation
 * @returns Invitation plus status
 */
function toPublicInvitation(invitation: Invitation): PublicInvitation {
  return {
    ...invitation,
    status: getInvitationStatus(invitation),
  };
}

/**
 * Lists invitations for the admin management screen.
 *
 * @returns Public invitation records
 */
export async function listInvitations(): Promise<PublicInvitation[]> {
  const invitations = await invitationRepository.findAllInvitations();
  return invitations.map((invitation) => toPublicInvitation(invitation));
}

/**
 * Loads one invitation by id.
 *
 * @param invitationId - Invitation id
 * @returns Public invitation
 * @throws {AppError} If the invitation does not exist
 */
export async function getInvitation(invitationId: string): Promise<PublicInvitation> {
  const invitation = await invitationRepository.findInvitationById(invitationId);
  if (!invitation) {
    throw new AppError('Invitation not found', 404);
  }
  return toPublicInvitation(invitation);
}

/**
 * Creates an invite-only account invitation (admin only).
 *
 * @param input - Invitee email and role
 * @param invitedBy - Admin user id
 * @returns The created invitation (token is needed to build the email link)
 * @throws {AppError} If the email is taken, a pending invite exists, or mail fails
 */
export async function createInvitation(
  input: CreateInvitationInput,
  invitedBy: string,
): Promise<PublicInvitation> {
  const existingUser = await userRepository.findUserByEmail(input.email);
  if (existingUser) {
    throw new AppError('A user with this email already exists', 409, {
      email: 'A user with this email already exists',
    });
  }

  const pending = await invitationRepository.findPendingInvitationByEmail(input.email);
  if (pending) {
    throw new AppError('A pending invitation already exists for this email', 409, {
      email: 'A pending invitation already exists for this email',
    });
  }

  const channel = getEmailChannel();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + MAX_INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  const invitation = await invitationRepository.createInvitation(
    input.email,
    token,
    input.role,
    expiresAt,
    invitedBy,
  );

  const content = buildInvitationEmail({
    token,
    frontendOrigin: env.frontendOrigin,
  });
  await channel.send({
    to: input.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  return toPublicInvitation(invitation);
}

/**
 * Revokes a pending invitation so the token can no longer be accepted.
 *
 * @param invitationId - Invitation id
 * @param revokedBy - Acting admin id
 * @returns The revoked invitation
 * @throws {AppError} If the invitation is missing or not pending
 */
export async function revokeInvitation(
  invitationId: string,
  revokedBy: string,
): Promise<PublicInvitation> {
  const current = await invitationRepository.findInvitationById(invitationId);
  if (!current) {
    throw new AppError('Invitation not found', 404);
  }

  const status = getInvitationStatus(current);
  if (status !== 'pending') {
    throw new AppError(`Only pending invitations can be revoked (current status: ${status})`, 400);
  }

  const invitation = await invitationRepository.revokeInvitation(invitationId, revokedBy);
  if (!invitation) {
    throw new AppError('Invitation not found', 404);
  }
  return toPublicInvitation(invitation);
}

/**
 * Activates an invited account by setting a password.
 *
 * @param token - Invite token from the email link
 * @param password - Password chosen by the invitee
 * @returns The newly created public user
 * @throws {AppError} If the invite is missing, used, revoked, or expired
 */
export async function acceptInvitation(token: string, password: string): Promise<PublicUser> {
  const invitation = await invitationRepository.findInvitationByToken(token);
  if (!invitation) {
    throw new AppError('Invitation is invalid or already used', 400);
  }

  const status = getInvitationStatus(invitation);
  if (status !== 'pending') {
    throw new AppError('Invitation is invalid or already used', 400);
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.createUser(
    invitation.email,
    passwordHash,
    invitation.role,
    invitation.invitedBy,
  );
  await invitationRepository.markInvitationAccepted(invitation.id, user.id);

  return toPublicUser(user);
}
