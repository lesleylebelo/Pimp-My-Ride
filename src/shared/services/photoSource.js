import {Platform} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

function unavailable(message, code = 'CAMERA_UNAVAILABLE') {
  return Object.assign(new Error(message), {code});
}

// Keep the web launch synchronous with the chooser button's genuine click.
// Never import a module, query permissions or await before opening its file UI.
export function launchPhotoSource(source, options = {}, {picker = ImagePicker, platform = Platform.OS} = {}) {
  const maximum = options.maximum ?? 1;
  const settings = {mediaTypes: ['images'], quality: 1, allowsMultipleSelection: source === 'gallery' && maximum > 1,
    ...(source === 'gallery' && maximum > 1 ? {selectionLimit: maximum} : {}),
    ...(options.crop ? {allowsEditing: true, aspect: [1, 1]} : {})};
  if (source === 'gallery') return picker.launchImageLibraryAsync(settings);
  if (source !== 'camera') throw unavailable('Choose a photo source.');
  if (typeof picker.launchCameraAsync !== 'function') throw unavailable('Camera capture is unavailable here. Choose from gallery instead.');
  if (platform === 'web') {
    if (typeof document === 'undefined' || typeof window === 'undefined') throw unavailable('Camera capture is unavailable here. Choose from gallery instead.');
    if (window.isSecureContext === false) throw unavailable('Camera capture needs HTTPS or localhost. Choose from gallery instead.');
    return picker.launchCameraAsync(settings);
  }
  return (async () => {
    let permission = await picker.getCameraPermissionsAsync();
    if (!permission.granted && permission.canAskAgain !== false) permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) throw unavailable('Camera access needed. Allow camera access to take a photo, or choose from gallery.', permission.canAskAgain === false ? 'CAMERA_SETTINGS' : 'CAMERA_DENIED');
    return picker.launchCameraAsync(settings);
  })();
}

export function photoSourceError(error, source) {
  if (error?.code === 'CAMERA_SETTINGS' || error?.code === 'CAMERA_DENIED' || error?.code === 'CAMERA_UNAVAILABLE') return error.message;
  if (source === 'camera') return 'The camera could not open or return a photo. Check camera access on your device or browser, try again, or choose from gallery.';
  return 'The gallery could not open or return a photo. Try again.';
}
