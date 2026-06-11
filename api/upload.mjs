// Owner-only image upload → Vercel Blob. ESM (.mjs) so it can import the
// ESM-only @vercel/blob SDK. Exported as a named POST handler so Vercel
// invokes it with a Web-standard Request (giving request.headers.get() and
// request.formData()), rather than the Node (req, res) style.
import { put } from '@vercel/blob';
import authLib from '../lib/auth.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 6 * 1024 * 1024; // 6MB (the admin resizes before upload)

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function POST(request) {
  const cookie = request.headers.get('cookie') || '';
  if (!authLib.isAuthed({ headers: { cookie: cookie } })) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({
      error: 'Image storage is not configured. Add a Vercel Blob store to the project (it provides BLOB_READ_WRITE_TOKEN).'
    }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    console.error('upload: formData parse failed:', e && e.message);
    return json({ error: 'Invalid upload.' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'No file provided.' }, 400);
  if (ALLOWED.indexOf(file.type) === -1) return json({ error: 'Unsupported image type.' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'Image too large (max 6MB).' }, 400);

  try {
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const blob = await put('products/photo.' + ext, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type
    });
    return json({ url: blob.url }, 200);
  } catch (e) {
    console.error('upload: blob put failed:', e && e.stack ? e.stack : e);
    return json({ error: 'Upload failed: ' + (e && e.message ? e.message : 'unknown error') }, 500);
  }
}
