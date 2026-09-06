import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../types/index.js';
import { mapZodFieldErrors } from '../utils/fieldErrors.js';

type RequestPart = 'body' | 'params' | 'query';

/**
 * Validates a request part with a Zod schema before the controller runs.
 * Failed body/query validation becomes a field-error response.
 *
 * @param schema - Zod schema applied at the HTTP boundary
 * @param part - Which request slice to validate (defaults to body)
 * @returns Express middleware that replaces the part with the parsed value
 */
export function validate(schema: ZodSchema, part: RequestPart = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[part]);
    if (!parsed.success) {
      const fields = mapZodFieldErrors(parsed.error);
      const message =
        part === 'params'
          ? 'The requested resource id is invalid'
          : 'Please fix the highlighted fields';
      next(new AppError(message, 400, part === 'params' ? null : fields));
      return;
    }
    req[part] = parsed.data as never;
    next();
  };
}
