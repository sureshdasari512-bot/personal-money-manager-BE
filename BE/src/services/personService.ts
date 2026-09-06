import * as personRepository from '../repositories/personRepository.js';
import { AppError, type Person, type UpsertPersonInput } from '../types/index.js';

/**
 * Lists contacts owned by the authenticated user.
 *
 * @param userId - Authenticated user
 * @returns The user's people
 */
export async function listPeople(userId: string): Promise<Person[]> {
  return personRepository.findPeopleByUser(userId);
}

/**
 * Loads one contact owned by the authenticated user.
 *
 * @param userId - Authenticated user
 * @param personId - Person id
 * @returns The person
 * @throws {AppError} If the person is missing or not owned by the user
 */
export async function getPerson(userId: string, personId: string): Promise<Person> {
  const person = await personRepository.findPersonById(userId, personId);
  if (!person) {
    throw new AppError('Person not found', 404);
  }
  return person;
}

/**
 * Creates a contact for the authenticated user.
 *
 * @param userId - Authenticated user
 * @param input - Contact fields
 * @returns The created person
 */
export async function createPerson(userId: string, input: UpsertPersonInput): Promise<Person> {
  return personRepository.createPerson(userId, normalizePersonInput(input));
}

/**
 * Updates a contact owned by the authenticated user.
 *
 * @param userId - Authenticated user
 * @param personId - Person id
 * @param input - Updated fields
 * @returns The updated person
 * @throws {AppError} If the person is missing or not owned by the user
 */
export async function updatePerson(
  userId: string,
  personId: string,
  input: UpsertPersonInput,
): Promise<Person> {
  const person = await personRepository.updatePerson(userId, personId, normalizePersonInput(input));
  if (!person) {
    throw new AppError('Person not found', 404);
  }
  return person;
}

/**
 * Soft-deletes a contact owned by the authenticated user.
 *
 * @param userId - Authenticated user
 * @param personId - Person id
 * @throws {AppError} If the person is missing or not owned by the user
 */
export async function deletePerson(userId: string, personId: string): Promise<void> {
  const deleted = await personRepository.softDeletePerson(userId, personId);
  if (!deleted) {
    throw new AppError('Person not found', 404);
  }
}

/**
 * Trims optional contact fields so blank strings become omitted values.
 *
 * @param input - Raw upsert payload
 * @returns Normalized payload
 */
function normalizePersonInput(input: UpsertPersonInput): UpsertPersonInput {
  return {
    name: input.name.trim(),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
}
