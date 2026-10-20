export const BLOB_HOST_SUFFIX = '.blob.vercel-storage.com';
export const BLOB_URL_REGEX = /^https:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.blob\.vercel-storage\.com\/[^?#]*$/;

export function isValidBlobUrl(url: any): boolean {
  if (typeof url !== 'string') return false;
  return BLOB_URL_REGEX.test(url);
}
