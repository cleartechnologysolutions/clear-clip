import { env } from 'cloudflare:workers';
export const imageKey = (slug: string) => `clips/${slug}`;
export function imageBucket() { return (env as unknown as { CLIP_IMAGES?: R2Bucket }).CLIP_IMAGES; }
export async function clearImage(slug: string) { await imageBucket()?.delete(imageKey(slug)); }
export async function clearAllImages() {
  const bucket = imageBucket();
  if (!bucket) return;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: 'clips/', cursor });
    if (page.objects.length) await bucket.delete(page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
