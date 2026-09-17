"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ClipSession } from "./clip-session";

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

export function ClipBoard({ initialSlug }: { initialSlug?: string }) {
  const sessionRef = useRef<ClipSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new ClipSession();
  const session = sessionRef.current;
  const [state, setState] = useState(session.state);
  const [slug, setSlug] = useState(initialSlug || "");
  const [notice, setNotice] = useState("");
  const loadedSlug = state.slug;
  const content = state.content;
  const updatedAt = state.updatedAt;
  const status = notice || state.status;
  const dirty = content !== state.savedContent;
  const busy = state.busy !== null;
  const writing = state.busy === "save" || state.busy === "clear";
  const normalizedSlug = cleanSlug(slug);
  const shareUrl = typeof window !== "undefined" && loadedSlug
    ? window.location.origin + "/" + loadedSlug : "";

  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    try { session.setStorage(window.sessionStorage); }
    catch { session.setStorage(null); }
    const startingSlug = cleanSlug(initialSlug || window.location.pathname.replace(/^\/+/, "")) || randomSlug();
    setSlug(startingSlug);
    window.history.replaceState(null, "", "/" + startingSlug);
    void session.open(startingSlug);
    const onPopState = () => {
      const target = cleanSlug(window.location.pathname.replace(/^\/+/, "")) || randomSlug();
      setSlug(target);
      setNotice("");
      void session.open(target);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      unsubscribe();
      window.removeEventListener("popstate", onPopState);
    };
  }, [session, initialSlug]);

  function openClip(event: FormEvent) {
    event.preventDefault();
    if (writing) return;
    const target = normalizedSlug || randomSlug();
    setSlug(target);
    setNotice("");
    window.history.pushState(null, "", "/" + target);
    void session.open(target);
  }

  function newClip() {
    if (writing) return;
    const target = randomSlug();
    setSlug(target);
    setNotice("");
    window.history.pushState(null, "", "/" + target);
    void session.open(target);
  }

  function refreshClip() {
    setNotice("");
    void session.refresh();
  }

  function saveClip() {
    setNotice("");
    void session.save();
  }

  function clearClip() {
    setNotice("");
    void session.clear();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Link copied.");
    } catch { setNotice("Copy failed. Select the URL manually."); }
  }

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-base font-black">Clip</p>
              <p className="text-sm text-slate-400">Shared clipboards · Build 10</p>
            </div>
          </div>
          <button
            type="button"
            onClick={newClip}
            disabled={writing}
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
                disabled={writing}
                className="h-11 w-full rounded-md bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300"
              >
                Open
              </button>
            </form>

            <div className="mt-5 rounded-md border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Share link</p>
              <p className="mt-2 break-all text-sm text-slate-200">{shareUrl || "Open a code first."}</p>
            </div>

            <p className="mt-5 text-sm leading-6 text-slate-300">
              Press Save to share your text. Press Refresh to see the other person&apos;s saved updates.
              Refresh keeps your unsaved text.
            </p>

            <div className="mt-5 text-sm text-slate-400">
              <p role="status">Status: <span className="text-slate-100">{status}</span></p>
              {dirty ? <p className="mt-1 text-amber-200">Unsaved changes</p> : null}
              {state.storageWarning ? <p className="mt-1 text-amber-200">{state.storageWarning}</p> : null}
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
                  disabled={busy || !loadedSlug}
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                >
                  {state.busy === "load" ? "Refreshing..." : "Refresh"}
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
                  disabled={busy || !state.loaded}
                  className="rounded-md border border-red-300/30 px-4 py-2 text-sm font-bold text-red-100 hover:bg-red-400/10 disabled:opacity-60"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveClip}
                  disabled={busy || !state.loaded}
                  className="rounded-md bg-white px-5 py-2 text-sm font-black text-slate-950 hover:bg-sky-100 disabled:opacity-60"
                >
                  {state.busy === "save" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            <textarea
              aria-label="Your clipboard text"
              value={content}
              disabled={writing}
              onChange={(event) => { setNotice(""); session.edit(event.target.value); }}
              placeholder="Paste notes, commands, config snippets, meeting notes, or whatever you need to pull up somewhere else."
              className="min-h-[520px] flex-1 resize-none rounded-b-lg border-0 bg-slate-950/55 p-5 font-mono text-base leading-7 text-slate-50 outline-none placeholder:text-slate-500"
              spellCheck={false}
            />
            {state.remote ? (
              <div className="border-t border-sky-300/30 bg-sky-300/5 p-4">
                <h2 className="text-sm font-bold text-sky-100">Latest saved text</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Your text above was kept. Copy anything you need from this version into your draft, then Save.
                </p>
                <textarea
                  aria-label="Latest saved text"
                  readOnly
                  value={state.remote.content}
                  placeholder="The shared clipboard is empty. Your text above has been kept."
                  className="mt-3 min-h-40 w-full rounded-md border border-white/15 bg-slate-950/60 p-3 font-mono text-sm text-slate-100"
                />
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
