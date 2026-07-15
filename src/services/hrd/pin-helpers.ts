import * as bcrypt from 'bcryptjs';

const PIN_SALT_ROUNDS = 10;

/** Hash a 4-6 digit PIN. */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_SALT_ROUNDS);
}

/** Verify PIN against stored hash. Returns false if no hash stored. */
export async function verifyPin(pin: string, pinHash: string | null): Promise<boolean> {
  if (!pinHash) return false;
  return bcrypt.compare(pin, pinHash);
}

/** Validate PIN format: 4-6 digits only. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
