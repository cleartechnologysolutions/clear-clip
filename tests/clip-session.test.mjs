import test from "node:test";
import assert from "node:assert/strict";
import { ClipSession } from "../app/clip-session.ts";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function sharedServer(initial = "Original note") {
  const boards = new Map([["abcd", initial]]);
  const calls = [];
  let fail = false;
  const fetcher = async (url, options = {}) => {
    const slug = String(url).split("/").pop();
    const method = options.method || "GET";
    calls.push({ method, slug });
    if (fail) throw new Error("Offline");
    if (method === "PUT") boards.set(slug, JSON.parse(options.body).content);
    if (method === "DELETE") boards.set(slug, "");
    return Response.json({ slug, content: boards.get(slug) ?? "", exists: boards.has(slug), updatedAt: null });
  };
  return { boards, calls, fetcher, offline: value => { fail = value; } };
}

test("two people refresh repeatedly without writing or clearing either copy", async () => {
  const server = sharedServer();
  const sender = new ClipSession(server.fetcher);
  const receiver = new ClipSession(server.fetcher);
  await sender.open("abcd");
  await receiver.open("abcd");
  sender.edit("Updated note from sender");
  await sender.save();
  const writes = server.calls.filter(call => call.method !== "GET").length;
  await receiver.refresh();
  await sender.refresh();
  await receiver.refresh();
  assert.equal(receiver.state.content, "Updated note from sender");
  assert.equal(sender.state.content, "Updated note from sender");
  assert.equal(server.boards.get("abcd"), "Updated note from sender");
  assert.equal(server.calls.filter(call => call.method !== "GET").length, writes);
});

test("refresh shows the other person's saved changes while keeping both local drafts", async () => {
  const server = sharedServer();
  const sender = new ClipSession(server.fetcher);
  const receiver = new ClipSession(server.fetcher);
  await sender.open("abcd");
  await receiver.open("abcd");
  sender.edit("New saved information");
  await sender.save();
  sender.edit("Sender's next unsaved draft");
  receiver.edit("Receiver's unsaved draft");
  await receiver.refresh();
  await sender.refresh();
  assert.equal(receiver.state.content, "Receiver's unsaved draft");
  assert.equal(receiver.state.remote.content, "New saved information");
  assert.equal(sender.state.content, "Sender's next unsaved draft");
  assert.equal(server.boards.get("abcd"), "New saved information");
});

test("browser reload restores drafts and shows newer remote content separately", async () => {
  const server = sharedServer();
  const store = storage();
  const beforeReload = new ClipSession(server.fetcher);
  beforeReload.setStorage(store);
  await beforeReload.open("abcd");
  beforeReload.edit("Do not lose this unsaved note");
  server.boards.set("abcd", "Other person's new information");
  const afterReload = new ClipSession(server.fetcher);
  afterReload.setStorage(store);
  await afterReload.open("abcd");
  assert.equal(afterReload.state.content, "Do not lose this unsaved note");
  assert.equal(afterReload.state.remote.content, "Other person's new information");
  assert.ok(server.calls.every(call => call.method === "GET"));
});

test("empty or deleted remote boards never blank an existing local copy on refresh/reload", async () => {
  const server = sharedServer();
  const store = storage();
  const client = new ClipSession(server.fetcher);
  client.setStorage(store);
  await client.open("abcd");
  server.boards.delete("abcd");
  await client.refresh();
  assert.equal(client.state.content, "Original note");
  assert.equal(client.state.remote.content, "");
  const reloaded = new ClipSession(server.fetcher);
  reloaded.setStorage(store);
  await reloaded.open("abcd");
  assert.equal(reloaded.state.content, "Original note");
  assert.equal(reloaded.state.remote.content, "");
  assert.equal(server.boards.has("abcd"), false);
});

test("typing while a GET is pending survives its response", async () => {
  let deliver;
  const client = new ClipSession(() => new Promise(resolve => { deliver = resolve; }));
  const loading = client.open("abcd");
  client.edit("Typed during request");
  deliver(Response.json({ slug: "abcd", content: "Remote note", updatedAt: null }));
  await loading;
  assert.equal(client.state.content, "Typed during request");
  assert.equal(client.state.remote.content, "Remote note");
});

test("late responses for another code cannot replace the current code's text", async () => {
  const pending = new Map();
  const client = new ClipSession(url => new Promise(resolve => pending.set(url, resolve)));
  const old = client.open("abcd");
  client.edit("Draft for abcd");
  const current = client.open("efgh");
  pending.get("/api/clips/efgh")(Response.json({ slug: "efgh", content: "Current board", updatedAt: null }));
  await current;
  pending.get("/api/clips/abcd")(Response.json({ slug: "abcd", content: "Stale response", updatedAt: null }));
  await old;
  assert.equal(client.state.slug, "efgh");
  assert.equal(client.state.content, "Current board");
  const back = client.open("abcd");
  pending.get("/api/clips/abcd")(Response.json({ slug: "abcd", content: "Remote abcd", updatedAt: null }));
  await back;
  assert.equal(client.state.content, "Draft for abcd");
});

test("failed and malformed reads retain existing text", async () => {
  const server = sharedServer();
  const client = new ClipSession(server.fetcher);
  await client.open("abcd");
  client.edit("Local draft");
  server.offline(true);
  await client.refresh();
  assert.equal(client.state.content, "Local draft");
  assert.equal(client.state.busy, null);
  assert.equal(client.state.status, "Offline");
  const malformed = new ClipSession(async () => Response.json({ slug: "abcd" }));
  malformed.edit("Still here");
  const loading = malformed.open("abcd");
  malformed.edit("Keep this");
  await loading;
  assert.equal(malformed.state.content, "Keep this");
  assert.match(malformed.state.status, /invalid clipboard/);
});

test("Clear is an explicit write; the other side retains its copy when it refreshes", async () => {
  const server = sharedServer();
  const a = new ClipSession(server.fetcher), b = new ClipSession(server.fetcher);
  await a.open("abcd");
  await b.open("abcd");
  await a.clear();
  await b.refresh();
  assert.equal(a.state.content, "");
  assert.equal(server.boards.get("abcd"), "");
  assert.equal(b.state.content, "Original note");
  assert.equal(b.state.remote.content, "");
  assert.equal(server.calls.filter(call => call.method === "DELETE").length, 1);
});

test("storage errors warn without blocking updates or destroying the draft", async () => {
  const client = new ClipSession(sharedServer().fetcher);
  client.setStorage({ getItem: () => null, setItem: () => { throw new Error("quota"); } });
  await client.open("abcd");
  client.edit("Protected in this tab");
  await client.refresh();
  assert.equal(client.state.content, "Protected in this tab");
  assert.match(client.state.storageWarning, /backup unavailable/);
});
