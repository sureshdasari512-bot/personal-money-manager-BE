import dotenv from 'dotenv';

dotenv.config();

/**
 * Reads a required environment variable or throws at boot.
 *
 * @param name - Process environment key
 * @returns The non-empty string value
 * @throws {Error} If the variable is missing or blank
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtRefreshSecret: requireEnv('JWT_REFRESH_SECRET'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  bcryptCost: Number(process.env.BCRYPT_COST ?? 10),
  smtpHost: process.env.SMTP_HOST ?? 'smtp-relay.brevo.com',
  smtpPort: Number(process.env.SMTP_PORT ?? 2525),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
  redisUrl: requireEnv('REDIS_URL'),
  cronSecret: process.env.CRON_SECRET ?? '',
} as const;

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_INVITE_EXPIRY_HOURS = 48;
