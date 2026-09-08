import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { clips } from "../../../../db/schema";

const MAX_CONTENT_LENGTH = 200_000;

function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return "Storage is not ready yet. Try again after the first deployment finishes.";
  }
  return message;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    if (!slug) {
      return Response.json({ error: "Clipboard name is required." }, { status: 400 });
    }

    const db = getDb();
    const [clip] = await db.select().from(clips).where(eq(clips.slug, slug)).limit(1);

    return Response.json({
      slug,
      content: clip?.content ?? "",
      updatedAt: clip?.updatedAt?.toISOString() ?? null,
      exists: Boolean(clip),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    const body = (await request.json()) as { content?: string };
    const content = body.content ?? "";

    if (!slug) {
      return Response.json({ error: "Clipboard name is required." }, { status: 400 });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return Response.json({ error: "Text is too large for this clipboard." }, { status: 413 });
    }

    const db = getDb();
    const updatedAt = new Date();

    await db
      .insert(clips)
      .values({ slug, content, updatedAt })
      .onConflictDoUpdate({
        target: clips.slug,
        set: { content, updatedAt },
      });

    return Response.json({
      slug,
      content,
      updatedAt: updatedAt.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = normalizeSlug(rawSlug);
    if (!slug) {
      return Response.json({ error: "Clipboard name is required." }, { status: 400 });
    }

    const db = getDb();
    const updatedAt = new Date();

    await db
      .insert(clips)
      .values({ slug, content: "", updatedAt })
      .onConflictDoUpdate({
        target: clips.slug,
        set: { content: "", updatedAt },
      });

    return Response.json({
      slug,
      content: "",
      updatedAt: updatedAt.toISOString(),
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}
