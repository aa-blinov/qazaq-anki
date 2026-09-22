import { AuthError, type AuthErrorCode } from './auth';

type TFn = (key: string) => string;

/**
 * Map an error thrown by the auth layer to a localized string. Anything
 * that isn't an `AuthError` (network error, storage quota, etc.) is
 * surfaced as a generic fallback — we never want to leak a raw
 * `Error.message` to the UI since those are still in English.
 */
export function translateAuthError(err: unknown, t: TFn): string {
  if (err instanceof AuthError) {
    return t(authKeyFor(err.code));
  }
  if (err instanceof Error) {
    return t('auth.errors.generic');
  }
  return t('auth.errors.generic');
}

function authKeyFor(code: AuthErrorCode): string {
  // codes are e.g. "noSuchUser" → "auth.errors.noSuchUser"
  return `auth.errors.${code}`;
}

/**
 * Which form field an AuthError belongs to. Used to highlight the
 * offending input with a red border and show an inline message
 * directly under it. Returns null for errors that don't map to a
 * single field (network, server) — those stay as a top-of-form
 * banner instead.
 *
 * Mapping is intentional — `noSuchUser` points at the username
 * field because that's where the user typed the wrong handle;
 * `wrongPassword` points at the password field because we don't
 * know whether the username was right.
 */
export function getAuthErrorField(code: AuthErrorCode): 'username' | 'password' | null {
  switch (code) {
    case 'usernameRequired':
    case 'usernameTooShort':
    case 'usernameTooLong':
    case 'usernameInvalid':
    case 'usernameTaken':
    case 'noSuchUser':
      return 'username';
    case 'passwordRequired':
    case 'passwordTooShort':
    case 'passwordTooLong':
    case 'wrongPassword':
      return 'password';
    // Generic / global — no specific field:
    case 'tooManyAccounts':
    case 'invalidUserRecord':
    case 'networkError':
    case 'serverError':
    case 'generic':
      return null;
  }
}

/** Extract the AuthErrorCode if `err` is an AuthError, else null. */
export function getAuthErrorCode(err: unknown): AuthErrorCode | null {
  if (err instanceof AuthError) return err.code;
  return null;
}
