import {ensureClipOrigins} from "../../../clip-origin";
import { clearAllImages } from "../../../clip-images";
import { desc } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { clips } from "../../../../db/schema";

function getAdminPassword() {
  const value = (env as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD;
  return typeof value === "string" && value ? value : "@dm!N4CtS";
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "Storage is not ready yet. Create the clips table in D1 first.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const adminPassword = getAdminPassword();
    if (!adminPassword) {
      return Response.json(
        { error: "Admin password is not configured." },
        { status: 503 }
      );
    }

    if (getBearerToken(request) !== adminPassword) {
      return Response.json({ error: "Wrong password." }, { status: 401 });
    }

    await ensureClipOrigins();
    const db = getDb();
    const rows = await db
      .select()
      .from(clips)
      .orderBy(desc(clips.updatedAt))
      .limit(200);

    const origins=await env.DB.prepare('SELECT o.slug,o.public_ip FROM clip_origins o JOIN (SELECT slug FROM clips ORDER BY updated_at DESC LIMIT 200) c ON c.slug=o.slug').all<{slug:string;public_ip:string|null}>();
    const ips=new Map(origins.results.map(row=>[row.slug,row.public_ip]));
    return Response.json({
      clips: rows.map((clip) => ({
        slug: clip.slug,
        publicIp: ips.get(clip.slug) ?? null,
        content: clip.content,
        updatedAt: clip.updatedAt.toISOString(),
      })),
    }, {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const adminPassword = getAdminPassword();
    if (!adminPassword) {
      return Response.json(
        { error: "Admin password is not configured." },
        { status: 503 }
      );
    }

    if (getBearerToken(request) !== adminPassword) {
      return Response.json({ error: "Wrong password." }, { status: 401 });
    }

    await ensureClipOrigins();
    const db = getDb();
    await clearAllImages();
    await env.DB.batch([env.DB.prepare('DELETE FROM clips'),env.DB.prepare('DELETE FROM clip_origins')]);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
