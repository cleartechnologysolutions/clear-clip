import { desc } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { clips } from "../../../../db/schema";

function getAdminPassword() {
  const value = (env as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD;
  return typeof value === "string" ? value : "";
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

    const db = getDb();
    const rows = await db
      .select()
      .from(clips)
      .orderBy(desc(clips.updatedAt))
      .limit(200);

    return Response.json({
      clips: rows.map((clip) => ({
        slug: clip.slug,
        content: clip.content,
        updatedAt: clip.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
