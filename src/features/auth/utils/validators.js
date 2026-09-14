export function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const MIN_PASSWORD_LENGTH = 12;

export function isValidPassword(value) {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && value.length <= 128;
}

export function validateEmailField(value) {
  if (!value || !value.trim()) return "Email address is required.";
  if (!isValidEmail(value)) return "Enter a valid email address.";
  return null;
}

export function validatePasswordField(value) {
  if (!value) return "Password is required.";
  if (value.length > 128) return "Password must be no more than 128 characters.";
  if (!isValidPassword(value)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateConfirmPasswordField(password, confirmPassword) {
  if (!confirmPassword) return "Please confirm your password.";
  if (confirmPassword !== password) return "Passwords do not match.";
  return null;
}
