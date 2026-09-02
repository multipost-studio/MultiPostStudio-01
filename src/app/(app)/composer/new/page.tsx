import { createDraftAction } from "@/app/actions/posts";

// Creating a draft immediately redirects into the editor.
export default async function NewComposerPage() {
  await createDraftAction();
  return null;
}
