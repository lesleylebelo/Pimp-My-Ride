import { validateEmailField, validatePasswordField, validateConfirmPasswordField } from './validators';
export const DOCUMENT_KEYS = ['cipcCert', 'proofOfAddress', 'ownerId'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export function fileError(file) {
 if (!file || !file.uri) return 'Choose a document.';
 if (!['application/pdf','image/jpeg','image/png'].includes(file.mimeType)) return 'Choose a PDF, JPG or PNG file.';
 if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_SIZE) return 'Choose a non-empty file up to 5 MB.';
 return null;
}
export function registrationErrors(form, role, step) {
 const e = {};
 if (step === 1) {
  if (!form.fullName?.trim()) e.fullName = 'Full name is required.';
  e.email = validateEmailField(form.email);
  if (!/^(0[0-9]{9}|\+27[0-9]{9})$/.test((form.phone || '').replace(/[\s()-]/g,''))) e.phone = 'Enter a South African number: 0821234567 or +27821234567.';
  e.password = validatePasswordField(form.password);
  e.confirmPassword = validateConfirmPasswordField(form.password, form.confirmPassword);
  if (!form.agreed) e.agreed = 'Please read and accept the terms and privacy notice.';
 }
 if (role === 'shop' && step === 2) {
  for (const key of ['shopName','regNumber','address','city','province','services']) if (!form[key]?.trim()) e[key] = 'This field is required.';
 }
 if (role === 'shop' && step === 3) for (const key of DOCUMENT_KEYS) e[key] = fileError(form[key]);
 return Object.fromEntries(Object.entries(e).filter(([,v]) => v));
}
export function accountStage(user, profile) {
 if (!profile) return 'incomplete';
 if (!['owner','shop','admin'].includes(profile.role)) return 'invalid';
 if (!user.emailVerified) return 'verify';
 if (profile.role === 'shop' && profile.verificationStatus !== 'approved') return profile.verificationStatus === 'rejected' ? 'rejected' : 'pending';
 return 'ready';
}
