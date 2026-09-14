import NetInfo from '@react-native-community/netinfo';
export const isOffline = state => state.isConnected === false || state.isInternetReachable === false;
export async function requireConnection() {
 const state = await NetInfo.fetch();
 if (isOffline(state)) throw new Error('You are offline. Connect to the internet to continue.');
}
export function isNetworkError(error) {
 return ['auth/network-request-failed','unavailable','deadline-exceeded','app/offline'].includes(error?.code);
}
