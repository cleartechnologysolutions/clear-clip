export type ClipSnapshot = {
  slug: string;
  content: string;
  updatedAt: string | null;
  exists?: boolean;
};

export type ClipState = {
  slug: string;
  content: string;
  savedContent: string;
  updatedAt: string | null;
  remote: ClipSnapshot | null;
  loaded: boolean;
  busy: "load" | "save" | "clear" | null;
  status: string;
  storageWarning: string;
};

type DraftStore = Pick<Storage, "getItem" | "setItem">;
const emptyState = (): ClipState => ({
  slug: "", content: "", savedContent: "", updatedAt: null,
  remote: null, loaded: false, busy: null,
  status: "Enter a code or make a new one.", storageWarning: "",
});

function snapshot(value: unknown, slug: string): ClipSnapshot {
  const data = value as ClipSnapshot;
  if (!data || data.slug !== slug || typeof data.content !== "string" ||
      !(data.updatedAt === null || typeof data.updatedAt === "string")) {
    throw new Error("The server returned an invalid clipboard. Your text was kept.");
  }
  return data;
}

// All remote reads go through GET. Only explicit Save/Clear actions write.
export class ClipSession {
  state = emptyState();
  private requestId = 0;
  private listener: ((state: ClipState) => void) | null = null;
  private drafts = new Map<string, ClipState>();
  private storage: DraftStore | null = null;
  private fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.fetcher = fetcher;
  }

  subscribe(listener: (state: ClipState) => void) {
    this.listener = listener;
    listener(this.state);
    return () => { this.listener = null; this.requestId++; };
  }

  setStorage(storage: DraftStore | null) {
    this.storage = storage;
    if (!storage) this.update({ storageWarning: "Draft backup unavailable. Keep this tab open until you save." });
  }

  private update(patch: Partial<ClipState>) {
    this.state = { ...this.state, ...patch };
    this.listener?.(this.state);
  }

  private persist() {
    if (!this.state.slug) return;
    this.drafts.set(this.state.slug, { ...this.state });
    if (!this.storage) return;
    try {
      this.storage.setItem("clip:draft:v1:" + this.state.slug, JSON.stringify(this.state));
      if (this.state.storageWarning) this.update({ storageWarning: "" });
    } catch {
      this.update({ storageWarning: "Draft backup unavailable. Keep this tab open until you save." });
    }
  }

  private restore(slug: string): ClipState | null {
    const cached = this.drafts.get(slug);
    if (cached) return cached;
    try {
      const raw = this.storage?.getItem("clip:draft:v1:" + slug);
      if (!raw) return null;
      const value = JSON.parse(raw) as ClipState;
      if (value.slug !== slug || typeof value.content !== "string" ||
          typeof value.savedContent !== "string") return null;
      return { ...emptyState(), slug, content: value.content, savedContent: value.savedContent };
    } catch {
      return null;
    }
  }

  edit(content: string) {
    this.update({ content });
    this.persist(); // Synchronous: a browser reload cannot beat an effect.
  }

  async open(slug: string) {
    if (this.state.busy === "save" || this.state.busy === "clear") return;
    if (slug === this.state.slug) return this.refresh();
    this.persist();
    this.requestId++;
    const restored = this.restore(slug);
    this.update({ ...emptyState(), ...(restored || {}), slug, loaded: false, busy: null,
      remote: null, storageWarning: this.state.storageWarning });
    await this.refresh();
  }

  private receive(data: ClipSnapshot) {
    const { content, savedContent } = this.state;
    if (content === data.content) {
      this.update({ savedContent: data.content, remote: null, status: "Up to date." });
    } else if (content !== savedContent || (content.length > 0 && data.content.length === 0)) {
      // Keep both versions, including an empty/deleted remote board.
      this.update({
        remote: data.content !== savedContent || data.content === "" ? data : null,
        status: data.content === savedContent
          ? "No new saved text. Your draft was kept."
          : "Updates loaded below. Your text was kept.",
      });
    } else {
      this.update({ content: data.content, savedContent: data.content, remote: null,
        status: data.exists === false ? "New code. Type something and save it." : "Updated." });
    }
    this.update({ updatedAt: data.updatedAt, loaded: true, busy: null });
    this.persist();
  }

  async refresh() {
    if (!this.state.slug || this.state.busy === "save" || this.state.busy === "clear") return;
    const slug = this.state.slug;
    const id = ++this.requestId;
    this.update({ busy: "load", status: "Checking for updates..." });
    try {
      const response = await this.fetcher("/api/clips/" + slug, { method: "GET", cache: "no-store" });
      const body = await response.json();
      if (id !== this.requestId) return;
      if (!response.ok) throw new Error(body.error || "Refresh failed. Your text was kept.");
      this.receive(snapshot(body, slug));
    } catch (error) {
      if (id === this.requestId) this.update({ busy: null, status: error instanceof Error ? error.message : "Refresh failed. Your text was kept." });
    }
  }

  async save() {
    if (this.state.busy || !this.state.loaded) return;
    const { slug, content } = this.state;
    const id = ++this.requestId;
    this.update({ busy: "save", status: "Saving..." });
    try {
      const response = await this.fetcher("/api/clips/" + slug, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await response.json();
      if (id !== this.requestId) return;
      if (!response.ok) throw new Error(body.error || "Save failed.");
      const data = snapshot(body, slug);
      this.update({ savedContent: data.content, updatedAt: data.updatedAt, remote: null, status: "Saved.", busy: null });
      this.persist();
    } catch (error) {
      if (id === this.requestId) this.update({ busy: null, status: error instanceof Error ? error.message : "Save failed." });
    }
  }

  async clear() {
    if (this.state.busy || !this.state.loaded) return;
    const slug = this.state.slug;
    const id = ++this.requestId;
    this.update({ busy: "clear", status: "Clearing..." });
    try {
      const response = await this.fetcher("/api/clips/" + slug, { method: "DELETE" });
      const body = await response.json();
      if (id !== this.requestId) return;
      if (!response.ok) throw new Error(body.error || "Clear failed.");
      const data = snapshot(body, slug);
      this.update({ content: "", savedContent: "", remote: null, updatedAt: data.updatedAt, busy: null, status: "Cleared." });
      this.persist();
    } catch (error) {
      if (id === this.requestId) this.update({ busy: null, status: error instanceof Error ? error.message : "Clear failed." });
    }
  }
}
