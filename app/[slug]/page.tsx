import { ClipBoard } from "../clip-board";

export default async function ClipPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClipBoard initialSlug={slug} />;
}
