"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

function cleanSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function randomSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 4 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
}

type ClipResponse = {
  slug: string;
  content: string;
  updatedAt: string | null;
  exists?: boolean;
  error?: string;
};

export function ClipBoard({ initialSlug }: { initialSlug?: string }) {
  const [slug, setSlug] = useState(initialSlug || "");
  const [loadedSlug, setLoadedSlug] = useState("");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("Enter a code or make a new one.");
  const [isSaving, setIsSaving] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);

  const normalizedSlug = useMemo(() => cleanSlug(slug), [slug]);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !normalizedSlug) return "";
    return `${window.location.origin}/${normalizedSlug}`;
  }, [normalizedSlug]);

  const loadClip = useCallback(async (targetSlug: string, quiet = false, force = false) => {
    const safeSlug = cleanSlug(targetSlug);
    if (!safeSlug) {
      setStatus("Enter a code.");
      return;
    }

    try {
      if (!quiet) setStatus("Loading...");
      const response = await fetch(`/api/clips/${safeSlug}`, { cache: "no-store" });
      const data = (await response.json()) as ClipResponse;
      if (!response.ok) throw new Error(data.error || "Load failed.");

      const hasLocalChanges = contentRef.current !== savedContentRef.current;
      if (!quiet || force || !hasLocalChanges) {
        setContent(data.content);
        setSavedContent(data.content);
      }
      setLoadedSlug(data.slug);
      setSlug(data.slug);
      setUpdatedAt(data.updatedAt);
      setStatus(data.exists ? "Loaded." : "New code. Type something and save it.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Load failed.");
    }
  }, []);

  useEffect(() => {
    const pathSlug = cleanSlug(window.location.pathname.replace(/^\/+/, ""));
    const startingSlug = pathSlug || randomSlug();
    void loadClip(startingSlug);
  }, []);

  useEffect(() => {
    if (!autoRefresh || !loadedSlug) return;
    const timer = window.setInterval(() => {
      void loadClip(loadedSlug, true, true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loadedSlug, loadClip]);

  function openClip(event: FormEvent) {
    event.preventDefault();
    const safeSlug = normalizedSlug || randomSlug();
    window.history.pushState(null, "", `/${safeSlug}`);
    void loadClip(safeSlug);
  }

  async function saveClip() {
    const safeSlug = normalizedSlug || loadedSlug || randomSlug();
    setIsSaving(true);
    setStatus("Saving...");

    try {
      const response = await fetch(`/api/clips/${safeSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json()) as ClipResponse;
      if (!response.ok) throw new Error(data.error || "Save failed.");

      setSlug(data.slug);
      setLoadedSlug(data.slug);
      setSavedContent(data.content);
      setUpdatedAt(data.updatedAt);
      window.history.pushState(null, "", `/${data.slug}`);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function clearClip() {
    if (!loadedSlug && !normalizedSlug) {
      setContent("");
      return;
    }

    const safeSlug = loadedSlug || normalizedSlug;
    setIsSaving(true);
    setStatus("Clearing...");

    try {
      const response = await fetch(`/api/clips/${safeSlug}`, { method: "DELETE" });
      const data = (await response.json()) as ClipResponse;
      if (!response.ok) throw new Error(data.error || "Clear failed.");

      setContent("");
      setSavedContent("");
      setUpdatedAt(data.updatedAt);
      setStatus("Cleared.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Clear failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy failed. Select the URL manually.");
    }
  }

  function refreshClip() {
    const safeSlug = loadedSlug || normalizedSlug;
    if (!safeSlug) {
      setStatus("Open a code first.");
      return;
    }

    void loadClip(safeSlug, false, true);
  }

  function newClip() {
    const nextSlug = randomSlug();
    window.history.pushState(null, "", `/${nextSlug}`);
    void loadClip(nextSlug);
  }

  const dirty = content !== savedContent;

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/60 bg-sky-400/15 text-sm font-black tracking-[.08em]">
              CTS
            </div>
            <div>
              <p className="text-base font-black">Clear Technology Solutions</p>
              <p className="text-sm text-slate-400">Shared clipboards</p>
            </div>
          </div>
          <button
            type="button"
            onClick={newClip}
            className="rounded-md border border-sky-300/40 bg-sky-300/10 px-4 py-2 text-sm font-bold text-sky-100 hover:bg-sky-300/20"
          >
            New code
          </button>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-white/10 bg-white/[.05] p-5 shadow-2xl shadow-black/25">
            <h1 className="text-3xl font-black tracking-tight">Clipboard</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Give each person a simple URL like /abcd. Anyone with that link can view, edit, save, or clear that board.
            </p>

            <form onSubmit={openClip} className="mt-6 space-y-3">
              <label htmlFor="clipName" className="block text-sm font-bold text-slate-300">
                URL code
              </label>
              <input
                id="clipName"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-sky-300/40 focus:ring-4"
                spellCheck={false}
              />
              <button
                type="submit"
                className="h-11 w-full rounded-md bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300"
              >
                Open
              </button>
            </form>

            <div className="mt-5 rounded-md border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Share link</p>
              <p className="mt-2 break-all text-sm text-slate-200">{shareUrl || "Open a code first."}</p>
            </div>

            <label className="mt-5 flex items-center gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                className="h-4 w-4 accent-sky-400"
              />
              Auto-refresh every 5 seconds
            </label>

            <div className="mt-5 text-sm text-slate-400">
              <p>Status: <span className="text-slate-100">{dirty ? "Unsaved changes" : status}</span></p>
              {updatedAt ? <p className="mt-1">Last saved: {new Date(updatedAt).toLocaleString()}</p> : null}
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col rounded-lg border border-white/10 bg-white/[.05] shadow-2xl shadow-black/25">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.14em] text-sky-200">
                  /{loadedSlug || normalizedSlug || "new"}
                </p>
                <p className="text-sm text-slate-400">Plain text whiteboard</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshClip}
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={clearClip}
                  disabled={isSaving}
                  className="rounded-md border border-red-300/30 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-400/10 disabled:opacity-60"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveClip}
                  disabled={isSaving}
                  className="rounded-md bg-white px-5 py-2 text-sm font-black text-slate-950 hover:bg-sky-100 disabled:opacity-60"
                >
                  {isSaving ? "Saving" : "Save"}
                </button>
              </div>
            </div>

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste notes, commands, config snippets, meeting notes, or whatever you need to pull up somewhere else."
              className="min-h-[520px] flex-1 resize-none rounded-b-lg border-0 bg-slate-950/55 p-5 font-mono text-base leading-7 text-slate-50 outline-none placeholder:text-slate-500"
              spellCheck={false}
            />
          </section>
        </section>
      </div>
    </main>
  );
}
