import { accountStage } from '../features/auth/utils/registration';

// Select from the trusted profile loaded by AuthContext, never a sign-in tab
// or a caller-supplied navigation parameter. Account keeps all existing gates.
export function getAuthenticatedRoute(user, profile, error = '') {
  if (!user || error || accountStage(user, profile) !== 'ready') return 'Account';
  return { owner: 'OwnerHome', shop: 'ShopHome', admin: 'AdminHome' }[profile.role] || 'Account';
}
