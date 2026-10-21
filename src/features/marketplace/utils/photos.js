export const PHOTO_LIMIT = 5;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg','image/png','image/webp'];
export const PICKER_PHOTO_TYPES = [...PHOTO_TYPES,'image/heic','image/heif'];

// HEIC/HEIF is decoded locally; the server still validates JPEG/PNG/WebP bytes.
export async function preparePhoto(asset,manipulator) {
 const name=asset?.fileName||asset?.name||'photo.jpg';
 const mimeType=asset?.mimeType||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','webp':'image/webp','heic':'image/heic','heif':'image/heif'}[name.split('.').pop().toLowerCase()]);
 if(!asset?.uri||!PICKER_PHOTO_TYPES.includes(mimeType))throw new Error('Choose a JPEG, PNG, WebP or HEIC photo.');
 const size=asset.fileSize??asset.size;
 if(size!==undefined&&size!==null){const issue=photoFileError({uri:asset.uri,name,size,mimeType:'image/jpeg'});if(issue)throw new Error(issue);}
 const result=await manipulator.manipulateAsync(asset.uri,[{resize:{width:Math.min(asset.width||1600,1600)}}],{compress:0.78,format:manipulator.SaveFormat.JPEG,base64:true});
 const bytes=typeof result.base64==='string'?result.base64.length*3/4-(result.base64.endsWith('==')?2:result.base64.endsWith('=')?1:0):result.fileSize;
 const file={uri:result.uri,name:name.replace(/\.[^.]+$/,'')+'.jpg',size:bytes,mimeType:'image/jpeg'};
 const issue=photoFileError(file);if(issue)throw new Error(issue);
 return file;
}

export function photoFileError(file) {
 if (!file?.uri || !file?.name) return 'Choose a photo first.';
 if (!PHOTO_TYPES.includes(file.mimeType)) return 'Choose a JPEG, PNG or WebP photo.';
 if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'The photo size could not be read. Choose the photo again.';
 if (file.size > PHOTO_MAX_BYTES) return 'Each photo must be 5 MB or smaller.';
 return '';
}
