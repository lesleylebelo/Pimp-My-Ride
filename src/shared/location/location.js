export function validCoordinates(value) {
  return value && typeof value.latitude === 'number' && typeof value.longitude === 'number' &&
    Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180
    ? {latitude: value.latitude, longitude: value.longitude} : null;
}
export function parseCoordinates(latitude, longitude) {
  const number = text => typeof text === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()) ? Number(text) : NaN;
  return validCoordinates({latitude: number(latitude), longitude: number(longitude)});
}
export function coordinateLabel(value) {
  const location = validCoordinates(value);
  return location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'No location selected. Distance unavailable.';
}
export async function currentLocation() {
  // Loading this module, opening a form or browsing the map never asks for permission.
  const Location = require('expo-location');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission was not granted. Choose a map pin or enter coordinates instead.');
  let timer;
  const result = await Promise.race([
    Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced}),
    new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Current location timed out. Choose a map pin or enter coordinates.')), 20000);}),
  ]).finally(() => clearTimeout(timer));
  const value = validCoordinates(result?.coords);
  if (!value) throw new Error('Your device did not return valid coordinates. Choose a location manually.');
  return value;
}
