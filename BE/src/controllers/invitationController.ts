import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as invitationService from '../services/invitationService.js';
import type { CreateInvitationInput } from '../types/index.js';

/**
 * GET /invitations
 * Admin-only: lists all invitations.
 */
export async function listInvitationsHandler(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const invitations = await invitationService.listInvitations();
    res.status(200).json({ invitations });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /invitations/:invitationId
 * Admin-only: returns one invitation.
 */
export async function getInvitationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { invitationId } = req.params as { invitationId: string };
    const invitation = await invitationService.getInvitation(invitationId);
    res.status(200).json({ invitation });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /invitations
 * Admin-only: creates an expiring invite token for a new user.
 */
export async function createInvitationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const invitation = await invitationService.createInvitation(
      req.body as CreateInvitationInput,
      userId,
    );
    res.status(201).json({ invitation });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /invitations/:invitationId/revoke
 * Admin-only: revokes a pending invitation.
 */
export async function revokeInvitationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { invitationId } = req.params as { invitationId: string };
    const invitation = await invitationService.revokeInvitation(invitationId, userId);
    res.status(200).json({ invitation });
  } catch (err) {
    next(err);
  }
}
