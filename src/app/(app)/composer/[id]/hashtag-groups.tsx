"use client";

import * as React from "react";
import { Hash, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/input";
import { Dropdown, MenuItem, MenuSeparator } from "@/components/ui/dropdown";
import { useToast } from "@/components/ui/toast";
import {
  listHashtagGroupsAction,
  saveHashtagGroupAction,
  deleteHashtagGroupAction,
} from "@/app/actions/hashtag-groups";

type Group = { id: string; name: string; tags: string[] };

/** Random subset without replacement — avoids posting the exact same 30-tag block every time. */
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Saved hashtag collections, an "auto-shuffle" insert (a random subset rather
 * than the same fixed block every time, to avoid the platform's shadow-ban
 * heuristics for repeated identical tag sets), and a one-click "move
 * hashtags to first comment" for clean-caption hygiene.
 */
export function HashtagGroups({
  initialGroups,
  activeBody,
  onInsertToBody,
  onMoveToFirstComment,
}: {
  initialGroups: Group[];
  activeBody: string;
  onInsertToBody: (tags: string[]) => void;
  onMoveToFirstComment: () => void;
}) {
  const { toast } = useToast();
  // Seeded from the server-rendered prop, not fetched on mount — this page
  // already server-fetches everything else (tags, pillars, media); the
  // refresh after a save/delete happens directly in that handler instead of
  // an effect, matching this codebase's rule against setState-in-effect.
  const [groups, setGroups] = React.useState<Group[]>(initialGroups);
  const [manageOpen, setManageOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    const res = await listHashtagGroupsAction();
    if (res.ok && Array.isArray(res.data)) setGroups(res.data as Group[]);
  }, []);

  const hasHashtagsInBody = /#\w+/.test(activeBody);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown
        trigger={
          <Button size="sm" variant="ghost" disabled={groups.length === 0}>
            <Hash size={13} /> Insert hashtags
          </Button>
        }
      >
        {groups.length === 0 ? (
          <MenuItem disabled>No saved groups yet</MenuItem>
        ) : (
          groups.map((g) => (
            <MenuItem
              key={g.id}
              onClick={() => {
                const count = Math.min(15, g.tags.length);
                onInsertToBody(sample(g.tags, count));
              }}
            >
              #{g.name} ({g.tags.length} tags — inserts {Math.min(15, g.tags.length)} shuffled)
            </MenuItem>
          ))
        )}
        <MenuSeparator />
        <MenuItem onClick={() => setManageOpen(true)}>Manage groups…</MenuItem>
      </Dropdown>

      <Button size="sm" variant="ghost" disabled={!hasHashtagsInBody} onClick={onMoveToFirstComment}>
        Move hashtags to first comment
      </Button>

      <ManageModal open={manageOpen} onClose={() => setManageOpen(false)} groups={groups} onChanged={reload} toast={toast} />
    </div>
  );
}

function ManageModal({
  open,
  onClose,
  groups,
  onChanged,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  onChanged: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [editing, setEditing] = React.useState<Group | null>(null);
  const [name, setName] = React.useState("");
  const [tagsText, setTagsText] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function startNew() {
    setEditing(null);
    setName("");
    setTagsText("");
  }

  function startEdit(g: Group) {
    setEditing(g);
    setName(g.name);
    setTagsText(g.tags.map((t) => `#${t}`).join(" "));
  }

  async function save() {
    setSaving(true);
    const res = await saveHashtagGroupAction({ id: editing?.id, name, tagsText });
    setSaving(false);
    if (res.ok) {
      toast({ title: "Saved", tone: "success" });
      onChanged();
      startNew();
    } else {
      toast({ title: "Couldn't save", description: res.error, tone: "error" });
    }
  }

  async function remove(id: string) {
    const res = await deleteHashtagGroupAction(id);
    if (res.ok) onChanged();
    else toast({ title: "Couldn't delete", description: res.error, tone: "error" });
  }

  return (
    <Modal open={open} onClose={onClose} title="Hashtag groups">
      <div className="space-y-4">
        {groups.length > 0 && (
          <div className="space-y-1.5">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2">
                <button onClick={() => startEdit(g)} className="text-left text-[13.5px] text-[var(--text)] hover:underline">
                  {g.name} <span className="text-[var(--text-subtle)]">({g.tags.length})</span>
                </button>
                <Button size="icon" variant="ghost" aria-label="Delete group" onClick={() => remove(g.id)}>
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-[13px] font-medium text-[var(--text)]">{editing ? `Edit "${editing.name}"` : "New group"}</p>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. SaaS Growth" />
          <Textarea
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="#SaaS #B2BMarketing #GrowthHacking …"
            className="min-h-[80px]"
          />
          <div className="flex justify-end gap-2">
            {editing && (
              <Button size="sm" variant="ghost" onClick={startNew}>
                Cancel edit
              </Button>
            )}
            <Button size="sm" loading={saving} onClick={save}>
              <Plus size={13} /> {editing ? "Update" : "Create"} group
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
