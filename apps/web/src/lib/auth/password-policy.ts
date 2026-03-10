export const PASSWORD_MIN_LENGTH = 12;

export type PasswordPolicyState = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  symbol: boolean;
};

export function evaluatePasswordPolicy(password: string): PasswordPolicyState {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordPolicySatisfied(password: string) {
  return Object.values(evaluatePasswordPolicy(password)).every(Boolean);
}

export function passwordPolicyItems(password: string) {
  const state = evaluatePasswordPolicy(password);
  return [
    { ok: state.length, label: `At least ${PASSWORD_MIN_LENGTH} characters` },
    { ok: state.upper, label: 'One uppercase letter' },
    { ok: state.lower, label: 'One lowercase letter' },
    { ok: state.number, label: 'One number' },
    { ok: state.symbol, label: 'One symbol' },
  ];
}
