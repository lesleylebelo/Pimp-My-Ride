export function authError(error) {
 if(error?.code?.startsWith('api/'))return error.message;
 const messages = {
 'auth/google-native-unavailable': error?.message,
 'auth/google-native-error': error?.message,
 'auth/google-cancelled': 'Google sign-in cancelled. You remain signed out.',
 'auth/account-exists-with-different-credential': 'This account uses another sign-in method. Sign in with that method before connecting Google.',
 'auth/credential-already-in-use': 'This Google identity is already connected to another account. Contact support.',
 'auth/provider-already-linked': 'Google is already connected. Restart Google sign-in.',
 'auth/invalid-credential': 'Email or password is incorrect.',
 'auth/wrong-password': 'Email or password is incorrect.',
 'auth/user-not-found': 'Email or password is incorrect.',
 'auth/email-already-in-use': 'An account with this email already exists. Sign in or reset your password.',
 'auth/verification-email-failed': error?.message,
 'auth/profile-rollback-failed': error?.message,
 'auth/profile-missing': error?.message,
 'auth/profile-invalid': error?.message,
 'auth/verification-signout-failed': error?.message,
 'auth/email-not-verified': error?.message,
 'auth/email-already-verified': 'Your email is already verified. Return to sign in to continue.',
 'auth/invalid-email': 'Enter a valid email address.',
 'auth/weak-password': 'Choose a stronger password with at least 12 characters.',
 'auth/password-does-not-meet-requirements': 'Your password does not meet the project password policy.',
 'auth/too-many-requests': 'Firebase has temporarily limited sign-in attempts. Please wait a few minutes before trying again.',
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
