export const filterLabels = {all: 'All', owner: 'Customer', shop: 'Shop', admin: 'Admin', pending: 'Pending', suspended: 'Suspended', archived: 'Archived'};
const events = {
  'session.active': 'Session started', 'session.inactive': 'Session inactive',
  'profile.created': 'Account registered', 'document.recorded': 'Document uploaded', 'document.view': 'Document viewed',
  'categorySave': 'Category saved', 'categoryArchive': 'Category archive status changed', 'editAccount': 'Account profile updated',
  'account.statusRequested': 'Account status change requested', 'account.statusFailed': 'Account status change failed',
  'account.active': 'Account restored', 'account.suspended': 'Account suspended', 'account.archived': 'Account archived',
  'shop.locationUpdated': 'Workshop location updated', 'profilePhoto.saved': 'Profile photo saved', 'profilePhoto.removed': 'Profile photo removed',
  'post.remove': 'Showcase post removed',
  'shop.pending': 'Workshop resubmission requested', 'shop.approved': 'Workshop approved', 'shop.rejected': 'Workshop rejected',
  'shop.reviewStarted': 'Workshop review started', 'shop.reviewFailed': 'Workshop review failed',
  'shop.reviewRecovered': 'Interrupted workshop review recovered', 'shop.reviewSuperseded': 'Workshop review superseded',
};
export function eventLabel(code) {return events[code] || String(code || 'Unknown event').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').replace(/^./, c => c.toUpperCase());}
export const adminSections = [
  {route: 'AdminDashboard', label: 'Overview', icon: 'grid-outline'},
  {route: 'AdminAccounts', filter: 'all', label: 'Accounts', icon: 'people-outline'},
  {route: 'AdminAccounts', filter: 'pending', label: 'Workshop Applications', icon: 'clipboard-outline'},
  {route: 'AdminCategories', label: 'Service Categories', icon: 'layers-outline'},
  {route: 'AdminPresence', label: 'Online Status', icon: 'pulse-outline'},
  {route: 'AdminServiceReviews', label: 'Service Reviews', icon: 'star-outline'},
  {route: 'AdminAudit', label: 'Activity Log', icon: 'time-outline'},
];
export function activeSection(route) {
  if (route.name === 'AdminConfirm') return {applications:2,accounts:1,categories:3}[route.params?.section] ?? -1;
  if (route.name === 'AdminAccount') return route.params?.section === 'applications' ? 2 : 1;
  if (route.name === 'AdminAccounts') return route.params?.filter === 'pending' ? 2 : 1;
  return adminSections.findIndex(section => section.route === route.name);
}
export function pageTitle(route) {return route.name === 'AdminAccount' ? 'Account details' : route.name === 'AdminConfirm' ? 'Verify identity' : adminSections[activeSection(route)]?.label || 'Administration';}
