import { describe, expect, it } from 'vitest';
import { buildAccountReadyEmail } from './accountReadyEmail.js';

describe('buildAccountReadyEmail', () => {
  it('includes a signed-in confirmation and the app origin', () => {
    const email = buildAccountReadyEmail({ frontendOrigin: 'http://localhost:5173/' });
    expect(email.subject.toLowerCase()).toContain('signed in');
    expect(email.text).toContain('successfully signed in');
    expect(email.text).toContain('http://localhost:5173');
    expect(email.html).toContain('http://localhost:5173');
    expect(email.html).not.toContain('http://localhost:5173/');
  });
});
