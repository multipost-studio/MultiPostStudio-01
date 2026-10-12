"use client";

import * as React from "react";
import { PlatformBadge } from "@/components/brand";
import { Input, Select } from "@/components/ui/input";
import { getPinterestBoardsAction, type BoardChoice } from "@/app/actions/pinterest";
import { PIN_LINK_MAX, PIN_TITLE_MAX, safePinLink } from "@/lib/integrations/pinterest";

/**
 * Pinterest options for one post: which board it goes to, the title, and the destination link. They are saved with the
 * post's channel; a board left on "account default" uses the one chosen in Integrations (else the first board).
 */
export function PinterestOptions({
  accountId,
  contentType,
  meta,
  onChange,
  disabled,
}: {
  accountId?: string;
  contentType: string;
  meta: Record<string, string>;
  onChange: (updates: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [boards, setBoards] = React.useState<BoardChoice[] | null>(null);
  const [defaultId, setDefaultId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    if (!accountId) return;
    getPinterestBoardsAction(accountId).then((res) => {
      if (!live) return;
      if (res.ok && res.data) {
        setBoards(res.data.boards);
        setDefaultId(res.data.defaultBoardId);
        setError(null);
      } else {
        setError(res.error ?? "Couldn't load your boards");
      }
    });
    return () => {
      live = false;
    };
  }, [accountId]);

  const link = meta.link ?? "";
  const linkBad = link.trim() !== "" && !safePinLink(link);
  const defaultName = boards?.find((b) => b.id === defaultId)?.name;
  const chosenMissing = !!meta.boardId && !!boards && !boards.some((b) => b.id === meta.boardId);

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]/60 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text)]">
        <PlatformBadge platform="pinterest" size={13} />
        Pinterest options
      </p>

      <div>
        <label htmlFor="pin-board" className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">Board</label>
        <Select id="pin-board" size="sm" disabled={disabled || !boards} value={meta.boardId ?? ""} onChange={(e) => onChange({ boardId: e.target.value })}>
          <option value="">{defaultName ? `Account default (${defaultName})` : "Account default"}</option>
          {boards?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}{b.privacy === "SECRET" ? " (secret)" : ""}
            </option>
          ))}
        </Select>
        {error && <p role="status" className="mt-1 text-[12px] text-[var(--text-muted)]">{error} The post will use your default board.</p>}
        {chosenMissing && <p role="status" className="mt-1 text-[12px] text-[var(--danger)]">The board saved for this post isn&apos;t on your account any more. Pick another.</p>}
      </div>

      <div>
        <label htmlFor="pin-title" className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
          Pin title <span className="text-[11px] text-[var(--text-subtle)]">(optional, max {PIN_TITLE_MAX}; otherwise the first line of the text)</span>
        </label>
        <Input id="pin-title" disabled={disabled} maxLength={PIN_TITLE_MAX} value={meta.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} />
      </div>

      <div>
        <label htmlFor="pin-link" className="mb-1 block text-[12px] font-medium text-[var(--text-muted)]">
          Destination link <span className="text-[11px] text-[var(--text-subtle)]">(where people go when they click the Pin)</span>
        </label>
        <Input id="pin-link" disabled={disabled} maxLength={PIN_LINK_MAX} inputMode="url" placeholder="https://yourshop.com/page" value={link} onChange={(e) => onChange({ link: e.target.value })} aria-invalid={linkBad || undefined} />
        {linkBad && <p role="status" className="mt-1 text-[12px] text-[var(--danger)]">The link must be a full https address. It will not be sent until it is fixed.</p>}
      </div>

      <p className="text-[11.5px] text-[var(--text-subtle)]">
        {contentType === "carousel_pin" ? "Carousel: 2 to 5 images, all linking to the destination above." : contentType === "video_pin" ? "Video: the first image attached, if any, is used as the cover." : "Attach one 2:3 or 1:1 image. Alt text from the media library is sent too."}
      </p>
    </div>
  );
}
