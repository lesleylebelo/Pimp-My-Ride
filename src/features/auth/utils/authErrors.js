export function authError(error) {
 const messages = {
 'auth/invalid-credential': 'Email or password is incorrect.',
 'auth/wrong-password': 'Email or password is incorrect.',
 'auth/user-not-found': 'Email or password is incorrect.',
 'auth/email-already-in-use': 'Unable to create this account. Try signing in or requesting a password reset.',
 'auth/invalid-email': 'Enter a valid email address.',
 'auth/weak-password': 'Choose a stronger password with at least 12 characters.',
 'auth/password-does-not-meet-requirements': 'Your password does not meet the project password policy.',
 'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
 'auth/network-request-failed': 'Check your internet connection and try again.',
 'auth/user-disabled': 'This account has been disabled. Contact the project administrator.',
 'auth/expired-action-code': 'This reset link has expired. Request a new email.',
 'auth/invalid-action-code': 'This reset link is invalid or already used. Request a new email.',
 'permission-denied': 'Unable to access your profile. Ask the project administrator to check the database rules.',
 'storage/unauthorized': 'Upload access was denied. Check your account and storage rules.',
 'storage/retry-limit-exceeded': 'The upload timed out. Check your connection and try again.',
 };
 return messages[error?.code] || (error?.code ? 'Something went wrong. Please try again.' : error?.message) || 'Something went wrong. Please try again.';
}
