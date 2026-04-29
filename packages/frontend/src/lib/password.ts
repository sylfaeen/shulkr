export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function getPasswordStrength(password: string): PasswordStrength | null {
  if (!password) return null;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const types = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (password.length < 8 || types <= 1) return 'weak';
  if (types >= 3) return 'strong';
  return 'medium';
}
