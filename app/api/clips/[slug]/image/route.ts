import { getDb } from "../../../../../db";
import { clips } from "../../../../../db/schema";
import { imageBucket, imageKey } from '../../../../clip-images';
const LIMIT = 10 * 1024 * 1024;
const DAY = 86400000;
type Context = { params: Promise<{ slug: string }> };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: Request, context: Context) {
  const { slug } = await context.params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return json({ error: 'Invalid clipboard code.' }, 400);
  const bucket = imageBucket();
  if (!bucket) return json({ error: 'Image storage is not configured. Add the CLIP_IMAGES R2 binding.' }, 503);
  if (request.method !== 'GET' && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid origin.' }, 403);
  const key = imageKey(slug);
  if (request.method === 'GET') {
    const object = await bucket.get(key);
    if (!object || object.uploaded.getTime() + DAY <= Date.now()) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline', 'X-Image-Expires': String(object.uploaded.getTime() + DAY) } });
  }
  if (request.method === 'DELETE') { await bucket.delete(key); return json({ ok: true }); }
  if (Number(request.headers.get('content-length')) > LIMIT) return json({ error: 'Images must be 10 MB or smaller.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Choose an image.' }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > LIMIT) { await reader.cancel(); return json({ error: 'Images must be 10 MB or smaller.' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  const type = bytes[0] === 137 && ascii(1, 4) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) ? 'image/gif'
    : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!type) return json({ error: 'Use a PNG, JPEG, WebP, or GIF image.' }, 415);
  await getDb().insert(clips).values({ slug, content: "", updatedAt: new Date() }).onConflictDoNothing();
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ ok: true });
}
async function route(request: Request, context: Context) {
  try { return await handle(request, context); }
  catch { return json({ error: 'Image storage could not be reached. Please try again.' }, 503); }
}
export { route as GET, route as PUT, route as DELETE };
