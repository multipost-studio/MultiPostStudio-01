import { createDraftAction } from "@/app/actions/posts";

// Creating a draft immediately redirects into the editor. A free place in the Queue sends the channel and the time it stands for.
export default async function NewComposerPage({ searchParams }: { searchParams: Promise<{ channel?: string; at?: string }> }) {
  const { channel, at } = await searchParams;
  await createDraftAction({ channelId: typeof channel === "string" ? channel : undefined, at: typeof at === "string" ? at : undefined });
  return null;
}
