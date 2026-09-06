import type { NextFunction, Request, Response } from 'express';
import { requireUser } from '../middlewares/requireUser.js';
import * as personService from '../services/personService.js';
import type { UpsertPersonInput } from '../types/index.js';

/**
 * GET /people
 * Lists contacts for the authenticated user.
 */
export async function listPeopleHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const people = await personService.listPeople(userId);
    res.status(200).json({ people });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /people/:personId
 * Returns one contact owned by the authenticated user.
 */
export async function getPersonHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { personId } = req.params as { personId: string };
    const person = await personService.getPerson(userId, personId);
    res.status(200).json({ person });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /people
 * Creates a contact for the authenticated user.
 */
export async function createPersonHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const person = await personService.createPerson(userId, req.body as UpsertPersonInput);
    res.status(201).json({ person });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /people/:personId
 * Updates a contact owned by the authenticated user.
 */
export async function updatePersonHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { personId } = req.params as { personId: string };
    const person = await personService.updatePerson(
      userId,
      personId,
      req.body as UpsertPersonInput,
    );
    res.status(200).json({ person });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /people/:personId
 * Soft-deletes a contact owned by the authenticated user.
 */
export async function deletePersonHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = requireUser(req);
    const { personId } = req.params as { personId: string };
    await personService.deletePerson(userId, personId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
