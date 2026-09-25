'use client';
import { useEffect, useRef, useState } from 'react';
type ImageInfo = { slot: number; version: string; expires: number; url: string };

export function ClipImage({ slug, revision, disabled, onBusy }: { slug: string; revision: number; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const current = useRef<ImageInfo[]>([]);
  const sequence = useRef(0);
  const working = useRef(false);
  const endpoint = `/api/clips/${encodeURIComponent(slug)}/image`;
  function replace(next: ImageInfo[]) {
    for (const image of current.current) if (!next.some(item => item.url === image.url)) URL.revokeObjectURL(image.url);
    current.current = next;
    setImages(next);
    setExpanded(value => next.some(item => item.version === value) ? value : null);
  }
  async function refresh() {
    const id = ++sequence.current;
    const created: string[] = [];
    try {
      const response = await fetch(endpoint + '?list=1', { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not load images.');
      const data = await response.json() as { images: ImageInfo[] };
      const next: ImageInfo[] = [];
      for (const info of data.images) {
        if (id !== sequence.current) break;
        const cached = current.current.find(item => item.version === info.version && item.slot === info.slot);
        if (cached) { next.push(cached); continue; }
        const image = await fetch(`${endpoint}?slot=${info.slot}`, { cache: 'no-store' });
        if (image.status === 404) continue; // expired or removed during this refresh
        if (!image.ok) throw new Error('Could not load images. Your previous previews were kept.');
        const url = URL.createObjectURL(await image.blob()); created.push(url);
        next.push({ ...info, url });
      }
      if (id !== sequence.current) { created.forEach(URL.revokeObjectURL); return; }
      replace(next); setMessage(next.length ? `${next.length} of 5 images shared. Click an image to enlarge.` : 'No images shared.');
    } catch (error) {
      created.forEach(URL.revokeObjectURL);
      if (id === sequence.current) setMessage(error instanceof Error ? error.message : 'Could not load images.');
    }
  }
  async function upload(files: File[]) {
    if (working.current || disabled || !files.length) return;
    if (files.some(file => !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))) { setMessage('Use PNG, JPEG, WebP, or GIF images.'); return; }
    if (files.some(file => file.size > 10 * 1024 * 1024)) { setMessage('Each image must be 10 MB or smaller. Your existing images were kept.'); return; }
    if (files.length + current.current.length > 5) { setMessage('Up to 5 images per clip. Remove an image or choose fewer files.'); return; }
    working.current = true; ++sequence.current; setBusy(true); onBusy(true);
    let errorMessage = '';
    try {
      for (let i = 0; i < files.length; i++) {
        setMessage(`Uploading image ${i + 1} of ${files.length}…`);
        const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': files[i].type }, body: files[i] });
        if (!response.ok) throw new Error((await response.json()).error || 'Upload failed.');
      }
    } catch (error) { errorMessage = error instanceof Error ? error.message : 'Upload failed.'; }
    finally {
      await refresh();
      if (errorMessage) setMessage(errorMessage + ' Any images already uploaded were kept.');
      working.current = false; setBusy(false); onBusy(false);
    }
  }
  async function remove(slot: number) {
    if (working.current || disabled) return;
    working.current = true; ++sequence.current; setBusy(true); onBusy(true);
    try {
      const response = await fetch(`${endpoint}?slot=${slot}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Remove failed.');
      replace(current.current.filter(item => item.slot !== slot)); setMessage('Image removed. Text and other images were kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Remove failed.'); }
    finally { working.current = false; setBusy(false); onBusy(false); }
  }
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [slug, revision]);
  useEffect(() => () => { for (const image of current.current) URL.revokeObjectURL(image.url); }, []);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (!files.length) return;
      event.preventDefault(); void upload(files);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [slug, disabled]);
  useEffect(() => {
    if (!images.length) return;
    const timer = setTimeout(() => { replace(current.current.filter(item => item.expires > Date.now())); }, Math.max(0, Math.min(...images.map(item => item.expires)) - Date.now()));
    return () => clearTimeout(timer);
  }, [images]);
  const preview = images.find(image => image.version === expanded);
  return <section className="border-t border-white/10 p-4" aria-label="Shared images">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Screenshots / images · {images.length}/5</h2><p className="text-sm text-slate-400">Paste or choose images. Shared immediately · 10 MB each · each expires after 24 hours.</p></div>
      <label className="rounded border border-white/20 px-3 py-2 text-sm cursor-pointer">Choose images<input aria-label="Choose images" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={disabled || busy || images.length >= 5} onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} /></label>
    </div>
    <p role="status" className="my-3 text-sm text-slate-300">{message}</p>
    {images.length >= 5 && <p className="mb-3 text-sm text-amber-200">All 5 spaces are full. Remove an image to add another.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {images.map((image, index) => <div key={image.version} className="min-w-0 rounded border border-white/10 bg-slate-950/40 p-3">
        <button type="button" onClick={() => setExpanded(image.version)} aria-label={`Enlarge image ${index + 1}`} className="w-full"><img src={image.url} alt={`Shared image ${index + 1}`} className="h-48 w-full rounded object-contain" /></button>
        <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-400">Image {index + 1}</span><button className="rounded border border-red-300/30 px-3 py-2 text-sm" disabled={disabled || busy} onClick={() => remove(image.slot)} aria-label={`Remove image ${index + 1}`}>Remove</button></div>
      </div>)}
    </div>
    {preview && <div role="dialog" aria-modal="true" aria-label="Image preview" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4" onClick={() => setExpanded(null)} onKeyDown={event => { if (event.key === 'Escape') setExpanded(null); }}>
      <button autoFocus className="mb-4 rounded border border-white/30 px-5 py-2" onClick={() => setExpanded(null)}>Close image</button>
      <img src={preview.url} alt="Full size clipboard image" className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </section>;
}
