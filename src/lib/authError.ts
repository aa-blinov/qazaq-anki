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
