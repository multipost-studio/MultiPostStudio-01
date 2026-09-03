"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { upsertCmsEntryAction, deleteCmsEntryAction } from "@/app/actions/admin";

type Entry = {
  id: string;
  collection: string;
  slug: string;
  data: string;
  published: boolean;
  sortIndex: number;
};

export function ContentManager({
  collections,
  shapes,
  entries,
}: {
  collections: string[];
  shapes: Record<string, string>;
  entries: Entry[];
}) {
  const [tab, setTab] = React.useState(collections[0]);
  const rows = entries.filter((e) => e.collection === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`rounded-[var(--radius-full)] px-3 py-1 text-[13px] font-semibold ${
              tab === c ? "bg-[var(--primary)] text-[var(--primary-text)]" : "bg-[var(--surface)] text-[var(--text-muted)]"
            }`}
          >
            {c} ({entries.filter((e) => e.collection === c).length})
          </button>
        ))}
      </div>

      <p className="rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3 py-2 font-mono text-[12px] text-[var(--text-muted)]">
        shape: {shapes[tab]}
      </p>

      {rows.map((e) => (
        <EntryEditor key={e.id} entry={e} />
      ))}

      <EntryEditor
        entry={{ id: "", collection: tab, slug: "", data: "{\n  \n}", published: true, sortIndex: rows.length }}
        isNew
      />
    </div>
  );
}

function EntryEditor({ entry, isNew }: { entry: Entry; isNew?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [slug, setSlug] = React.useState(entry.slug);
  const [data, setData] = React.useState(entry.data);
  const [published, setPublished] = React.useState(entry.published);
  const [sortIndex, setSortIndex] = React.useState(entry.sortIndex);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function save() {
    setBusy("save");
    const res = await upsertCmsEntryAction({
      id: entry.id || undefined,
      collection: entry.collection,
      slug,
      data,
      published,
      sortIndex,
    });
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Saved" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }
  async function remove() {
    if (!window.confirm("Delete this entry?")) return;
    setBusy("del");
    const res = await deleteCmsEntryAction(entry.id);
    setBusy(null);
    toast({ title: res.ok ? "Deleted" : "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] text-[var(--text-subtle)]">
            slug
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-8 w-56" placeholder={isNew ? "new-entry" : ""} />
          </label>
          <label className="text-[12px] text-[var(--text-subtle)]">
            sort
            <Input type="number" value={sortIndex} onChange={(e) => setSortIndex(Number(e.target.value))} className="h-8 w-20" />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-subtle)]">
            <Switch checked={published} onCheckedChange={setPublished} srLabel="Published" /> published
          </label>
        </div>
        <textarea
          className="min-h-[140px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px]"
          value={data}
          onChange={(e) => setData(e.target.value)}
          spellCheck={false}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={busy === "save"} onClick={save}>
            {isNew ? "Create" : "Save"}
          </Button>
          {!isNew && (
            <Button size="sm" variant="ghost" loading={busy === "del"} onClick={remove}>
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
