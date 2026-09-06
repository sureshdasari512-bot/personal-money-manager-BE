import type { ZodError } from 'zod';
import type { FieldErrors } from '../types/index.js';

/**
 * Maps Zod issues to one message per field. The first issue for a field wins.
 *
 * @param error - Zod validation error
 * @returns Field-name to message map
 */
export function mapZodFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && fields[key] === undefined) {
      fields[key] = issue.message;
    }
  }

  return fields;
}
