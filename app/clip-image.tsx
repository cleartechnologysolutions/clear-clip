'use client';
import { useEffect, useRef, useState } from 'react';

export function ClipImage({ slug, revision, disabled, onBusy }: { slug: string; revision: number; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expires, setExpires] = useState(0);
  const current = useRef('');
  const sequence = useRef(0);
  const working = useRef(false);
  const endpoint = `/api/clips/${encodeURIComponent(slug)}/image`;
  function replace(blob?: Blob) {
    if (current.current) URL.revokeObjectURL(current.current);
    current.current = blob ? URL.createObjectURL(blob) : '';
    setUrl(current.current);
  }
  async function refresh() {
    const id = ++sequence.current;
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (id !== sequence.current) return;
      if (response.status === 404) { replace(); setMessage('No image shared.'); return; }
      if (!response.ok) throw new Error((await response.json()).error || 'Could not load image.');
      const blob = await response.blob();
      if (id !== sequence.current) return;
      replace(blob); setExpires(Number(response.headers.get('X-Image-Expires'))); setMessage('Image shared. Click to enlarge.');
    } catch (error) { if (id === sequence.current) setMessage(error instanceof Error ? error.message : 'Could not load image.'); }
  }
  async function upload(file: File) {
    if (working.current || disabled) return;
    if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) { setMessage('Use a PNG, JPEG, WebP, or GIF image.'); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage('Images must be 10 MB or smaller. Your existing image was kept.'); return; }
    working.current = true; ++sequence.current; setBusy(true); onBusy(true); setMessage('Uploading image…');
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed.');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { working.current = false; setBusy(false); onBusy(false); }
  }
  async function remove() {
    if (working.current || disabled) return;
    working.current = true; ++sequence.current; setBusy(true); onBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Remove failed.');
      replace(); setExpanded(false); setMessage('Image removed. Text was kept.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Remove failed.'); }
    finally { working.current = false; setBusy(false); onBusy(false); }
  }
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [slug, revision]); // explicit manual refresh only
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items || []).find(item => item.kind === 'file' && item.type.startsWith('image/'));
      if (!item) return;
      event.preventDefault();
      const file = item.getAsFile(); if (file) void upload(file);
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [slug, disabled]);
  useEffect(() => {
    if (!url || !expires) return;
    const timer = setTimeout(() => { replace(); setExpanded(false); setMessage('Image expired.'); }, Math.max(0, expires - Date.now()));
    return () => clearTimeout(timer);
  }, [url, expires]);
  return <section className="border-t border-white/10 p-4" aria-label="Shared image">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold">Screenshot / image</h2><p className="text-sm text-slate-400">Paste an image or choose a file. Shared immediately · 10 MB max · expires after 24 hours.</p></div>
      <div className="flex gap-3">
        <label className="rounded border border-white/20 px-3 py-2 text-sm cursor-pointer">Choose image<input aria-label="Choose image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ''; }} /></label>
        {url && <button className="rounded border border-red-300/30 px-3 py-2 text-sm" disabled={disabled || busy} onClick={remove}>Remove image</button>}
      </div>
    </div>
    <p role="status" className="my-3 text-sm text-slate-300">{message}</p>
    {url && <button type="button" onClick={() => setExpanded(true)} aria-label="Enlarge image"><img src={url} alt="Shared clipboard image" className="max-h-80 max-w-full rounded object-contain" /></button>}
    {expanded && url && <div role="dialog" aria-modal="true" aria-label="Image preview" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4" onClick={() => setExpanded(false)} onKeyDown={event => { if (event.key === 'Escape') setExpanded(false); }}>
      <button autoFocus className="mb-4 rounded border border-white/30 px-5 py-2" onClick={() => setExpanded(false)}>Close image</button>
      <img src={url} alt="Full size clipboard image" className="max-h-[85vh] max-w-full object-contain" />
    </div>}
  </section>;
}
