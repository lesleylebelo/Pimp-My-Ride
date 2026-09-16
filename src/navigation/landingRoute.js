import { accountStage } from '../features/auth/utils/registration';

export function getAuthenticatedRoute(user, profile, error = '') {
  if (!user || error || accountStage(user, profile) !== 'ready') return 'Account';
  return { owner: 'OwnerHome', shop: 'ShopHome', admin: 'AdminHome' }[profile.role] || 'Account';
}
