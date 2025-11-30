// Frontend storage service stub. These helpers will call backend asset endpoints
// (e.g., /api/assets/maps) with Bearer tokens once the upload flow is available.
// For now they simply signal that the implementation is pending.

export async function uploadMap(_file: File, _tableId: string): Promise<string> {
  // TODO: Use authenticated fetch to upload maps via backend storage API.
  return Promise.reject(new Error('Not implemented yet'));
}

export async function uploadTokenImage(_file: File, _tableId: string): Promise<string> {
  // TODO: Handle token sprite uploads and return the resulting CDN URL.
  return Promise.reject(new Error('Not implemented yet'));
}

export async function uploadAvatar(_file: File): Promise<string> {
  // TODO: Send avatar image to backend using the current auth token.
  return Promise.reject(new Error('Not implemented yet'));
}
