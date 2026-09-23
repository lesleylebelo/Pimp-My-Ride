export const PHOTO_LIMIT = 5;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg','image/png'];

export function photoFileError(file) {
 if (!file?.uri || !file?.name) return 'Choose a photo first.';
 if (!PHOTO_TYPES.includes(file.mimeType)) return 'Choose a JPEG or PNG photo.';
 if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'The photo size could not be read. Choose the photo again.';
 if (file.size > PHOTO_MAX_BYTES) return 'Each photo must be 5 MB or smaller.';
 return '';
}
