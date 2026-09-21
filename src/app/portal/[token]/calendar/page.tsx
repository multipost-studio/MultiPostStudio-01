import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { InlineEmpty } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/brand";
import { PortalHeader } from "../portal-header";
import { groupPostsByDate, type PortalCalendarPost } from "@/lib/portal-branding";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

async function loadLink(token: string) {
  if (!/^port_[a-f0-9]{20,64}$/.test(token)) return null;
  const link = await db.portalLink.findUnique({
    where: { token },
    select: {
      id: true,
      label: true,
      logoUrl: true,
      primaryColor: true,
      expiresAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true } },
    },
  });
  if (!link || link.revokedAt || (link.expiresAt && link.expiresAt.getTime() < Date.now())) return null;
  return link;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await loadLink(token);
  return {
    title: link ? `Content Calendar — ${link.workspace.name}` : "Client Calendar",
    robots: { index: false, follow: false },
  };
}

export default async function PortalCalendarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await loadLink(token);
  if (!link) notFound();

  const postsRaw = await db.post.findMany({
    where: {
      workspaceId: link.workspace.id,
      status: { in: ["scheduled", "published", "approved"] },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      channels: true,
      media: { include: { media: true }, orderBy: { order: "asc" } },
    },
    take: 100,
  });

  const calendarPosts: PortalCalendarPost[] = postsRaw.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    channels: p.channels.map((c) => ({ platform: c.platform, body: c.body })),
    mediaUrls: p.media.map((m) => m.media.url),
  }));

  const groupedDays = groupPostsByDate(calendarPosts);

  return (
    <main className="min-h-screen bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <PortalHeader
          token={token}
          workspaceName={link.workspace.name}
          linkLabel={link.label}
          logoUrl={link.logoUrl}
          primaryColor={link.primaryColor}
          activeTab="calendar"
        />

        {groupedDays.length === 0 ? (
          <InlineEmpty
            title="No scheduled content found"
            hint="Approved and scheduled campaigns will appear on this calendar."
          />
        ) : (
          <div className="space-y-8">
            {groupedDays.map((day) => (
              <section key={day.dateKey} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                  <CalendarIcon className="h-4 w-4 text-[var(--text-muted)]" />
                  <h2 className="text-[15px] font-semibold text-[var(--text)]">
                    {day.displayDate}
                  </h2>
                  {day.isToday && (
                    <Badge tone="primary">Today</Badge>
                  )}
                  {day.isPast && !day.isToday && (
                    <span className="text-[12px] text-[var(--text-subtle)]">Past</span>
                  )}
                </div>

                <div className="grid gap-3">
                  {day.posts.map((post) => {
                    const postDate = post.scheduledAt || post.publishedAt;
                    const timeStr = postDate
                      ? new Date(postDate).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : null;

                    return (
                      <div
                        key={post.id}
                        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[14px] text-[var(--text)]">
                              {post.title || "Untitled post"}
                            </span>
                            <Badge
                              tone={
                                post.status === "published"
                                  ? "success"
                                  : post.status === "scheduled"
                                  ? "primary"
                                  : "neutral"
                              }
                            >
                              {post.status}
                            </Badge>
                          </div>
                          {timeStr && (
                            <span className="flex items-center gap-1 text-[12px] text-[var(--text-subtle)]">
                              <Clock className="h-3 w-3" />
                              {timeStr}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {post.channels.map((c, i) => (
                            <PlatformBadge key={i} platform={c.platform} />
                          ))}
                        </div>

                        {post.channels[0]?.body && (
                          <p className="mt-2.5 line-clamp-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
                            {post.channels[0].body}
                          </p>
                        )}

                        {post.mediaUrls.length > 0 && (
                          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {post.mediaUrls.slice(0, 4).map((url, i) => (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                key={i}
                                src={url}
                                alt="Attachment"
                                className="h-16 w-16 rounded-md border border-[var(--border)] object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
