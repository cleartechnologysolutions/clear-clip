"use client";

import { FormEvent, useMemo, useState } from "react";

type AdminClip = {
  slug: string;
  content: string;
  updatedAt: string;
};

type AdminResponse = {
  clips?: AdminClip[];
  error?: string;
};

export function AdminClips() {
  const [password, setPassword] = useState("");
  const [clips, setClips] = useState<AdminClip[]>([]);
  const [status, setStatus] = useState("Enter the admin password.");
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const clipCount = clips.length;
  const totalCharacters = useMemo(
    () => clips.reduce((sum, clip) => sum + clip.content.length, 0),
    [clips]
  );

  async function loadClips(event?: FormEvent) {
    event?.preventDefault();
    setIsLoading(true);
    setStatus("Loading clipboards...");

    try {
      const response = await fetch("/api/admin/clips", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${password}`,
        },
      });
      const data = (await response.json()) as AdminResponse;
      if (!response.ok) throw new Error(data.error || "Admin load failed.");

      setClips(data.clips || []);
      setHasLoaded(true);
      setStatus("Loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin load failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-5 text-slate-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[.04] px-4 py-3">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/60 bg-sky-400/15 text-sm font-black tracking-[.08em]">
              CTS
            </div>
            <div>
              <p className="text-base font-black">Clear Technology Solutions</p>
              <p className="text-sm text-slate-400">Clipboard admin</p>
            </div>
          </a>
          <a
            href="/"
            className="rounded-md border border-sky-300/40 bg-sky-300/10 px-4 py-2 text-sm font-bold text-sky-100 hover:bg-sky-300/20"
          >
            Back to clips
          </a>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-white/10 bg-white/[.05] p-5 shadow-2xl shadow-black/25">
            <h1 className="text-3xl font-black tracking-tight">Admin</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              View every clipboard that has been saved. This page is locked by the admin password.
            </p>

            <form onSubmit={loadClips} className="mt-6 space-y-3">
              <label htmlFor="adminPassword" className="block text-sm font-bold text-slate-300">
                Password
              </label>
              <input
                id="adminPassword"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 text-base text-white outline-none ring-sky-300/40 focus:ring-4"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="h-11 w-full rounded-md bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60"
              >
                {isLoading ? "Loading" : "Unlock"}
              </button>
            </form>

            <div className="mt-5 rounded-md border border-white/10 bg-slate-950/45 p-3">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Summary</p>
              <p className="mt-2 text-sm text-slate-200">{clipCount} clipboards</p>
              <p className="mt-1 text-sm text-slate-400">{totalCharacters.toLocaleString()} total characters</p>
            </div>

            <p className="mt-5 text-sm text-slate-300">
              Status: <span className="text-slate-100">{status}</span>
            </p>
          </aside>

          <section className="min-h-[620px] rounded-lg border border-white/10 bg-white/[.05] shadow-2xl shadow-black/25">
            <div className="border-b border-white/10 p-4">
              <p className="text-sm font-bold uppercase tracking-[.14em] text-sky-200">Saved clipboards</p>
              <p className="mt-1 text-sm text-slate-400">Newest updates appear first.</p>
            </div>

            {!hasLoaded ? (
              <div className="p-5 text-sm text-slate-400">Unlock admin view to list saved clipboards.</div>
            ) : clips.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">No saved clipboards yet.</div>
            ) : (
              <div className="divide-y divide-white/10">
                {clips.map((clip) => (
                  <article key={clip.slug} className="grid gap-3 p-4 md:grid-cols-[180px_1fr_auto]">
                    <div>
                      <a className="font-mono text-base font-black text-sky-200 hover:text-sky-100" href={`/${clip.slug}`}>
                        /{clip.slug}
                      </a>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(clip.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <p className="max-h-24 overflow-hidden whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-300">
                      {clip.content || "(empty)"}
                    </p>
                    <a
                      className="h-10 rounded-md border border-white/15 px-4 py-2 text-center text-sm font-bold text-slate-100 hover:bg-white/10"
                      href={`/${clip.slug}`}
                    >
                      Open
                    </a>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
