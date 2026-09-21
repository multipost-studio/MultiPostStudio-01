"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  createPortalLinkAction,
  updatePortalBrandingAction,
  extendPortalLinkAction,
  revokePortalLinkAction,
} from "@/app/actions/portal";
import { ArrowLeft, Copy, ExternalLink, ShieldCheck, Palette, Plus, Clock } from "lucide-react";

interface PortalLinkData {
  id: string;
  label: string;
  token: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
}

export function ClientDetailView({
  workspace,
  portalLinks: initialLinks,
}: {
  workspace: {
    id: string;
    name: string;
    clientName?: string | null;
    industry?: string | null;
    kind: string;
    postCount: number;
    conversationCount: number;
  };
  portalLinks: PortalLinkData[];
}) {
  const { toast } = useToast();
  const [links, setLinks] = React.useState<PortalLinkData[]>(initialLinks);

  // New link form state
  const [newLabel, setNewLabel] = React.useState("");
  const [newDays, setNewDays] = React.useState("30");
  const [newLogoUrl, setNewLogoUrl] = React.useState("");
  const [newColor, setNewColor] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // Edit branding state
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(null);
  const [editLogoUrl, setEditLogoUrl] = React.useState("");
  const [editColor, setEditColor] = React.useState("");
  const [savingBranding, setSavingBranding] = React.useState(false);

  function startEditBranding(link: PortalLinkData) {
    setSelectedLinkId(link.id);
    setEditLogoUrl(link.logoUrl || "");
    setEditColor(link.primaryColor || "");
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLinkId) return;
    setSavingBranding(true);
    const res = await updatePortalBrandingAction({
      linkId: selectedLinkId,
      logoUrl: editLogoUrl,
      primaryColor: editColor,
    });
    setSavingBranding(false);

    if (res.ok) {
      toast({ title: "Branding updated successfully", tone: "success" });
      setLinks((prev) =>
        prev.map((l) =>
          l.id === selectedLinkId
            ? { ...l, logoUrl: editLogoUrl || null, primaryColor: editColor || null }
            : l
        )
      );
      setSelectedLinkId(null);
    } else {
      toast({ title: "Failed to update branding", description: res.error, tone: "error" });
    }
  }

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) {
      toast({ title: "Label is required", tone: "error" });
      return;
    }
    setCreating(true);
    const days = parseInt(newDays, 10) || 30;
    const res = await createPortalLinkAction({
      label: newLabel,
      expiresInDays: days,
      logoUrl: newLogoUrl || undefined,
      primaryColor: newColor || undefined,
    });
    setCreating(false);

    if (res.ok && res.data) {
      toast({ title: "Portal link created", tone: "success" });
      const newEntry: PortalLinkData = {
        id: `pl_${Date.now()}`,
        label: newLabel,
        token: res.data.token,
        logoUrl: newLogoUrl || null,
        primaryColor: newColor || null,
        expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        createdAt: new Date().toISOString(),
      };
      setLinks((prev) => [newEntry, ...prev]);
      setNewLabel("");
      setNewLogoUrl("");
      setNewColor("");
    } else {
      toast({ title: "Failed to create link", description: res.error, tone: "error" });
    }
  }

  async function handleExtend(linkId: string) {
    const res = await extendPortalLinkAction({ linkId, extraDays: 30 });
    if (res.ok && res.data) {
      toast({ title: "Link extended by 30 days", tone: "success" });
      setLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, expiresAt: res.data?.expiresAt } : l))
      );
    } else {
      toast({ title: "Failed to extend link", description: res.error, tone: "error" });
    }
  }

  async function handleRevoke(linkId: string) {
    if (!confirm("Are you sure you want to revoke this link? The client will immediately lose access.")) return;
    const res = await revokePortalLinkAction(linkId);
    if (res.ok) {
      toast({ title: "Link revoked", tone: "success" });
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    } else {
      toast({ title: "Failed to revoke link", description: res.error, tone: "error" });
    }
  }

  function copyUrl(token: string) {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Portal URL copied to clipboard", tone: "success" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/agency"
          className="flex items-center gap-1 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Agency</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold text-[var(--text)]">{workspace.name}</h1>
            <Badge tone="primary">{workspace.kind === "client" ? "Client Workspace" : "Brand"}</Badge>
          </div>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            {workspace.clientName ?? "Client"} · {workspace.industry ?? "General"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/composer`}>
            <Button size="sm">Create Content</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] text-[var(--text-muted)]">Posts in System</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[24px] font-bold text-[var(--text)]">{workspace.postCount}</div>
            <p className="text-[12px] text-[var(--text-subtle)]">Active and scheduled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] text-[var(--text-muted)]">Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[24px] font-bold text-[var(--text)]">{workspace.conversationCount}</div>
            <p className="text-[12px] text-[var(--text-subtle)]">Community inbox threads</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] text-[var(--text-muted)]">Active Client Portals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-[24px] font-bold text-[var(--text)]">{links.length}</div>
            <p className="text-[12px] text-[var(--text-subtle)]">Magic links with access</p>
          </CardContent>
        </Card>
      </div>

      {/* Portal Links Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-[var(--text)]">Client Portal Magic Links</h2>
          </div>

          {links.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[14px] text-[var(--text-muted)]">
              No active portal links found for this client. Generate a link to provide client guest access.
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => {
                const isExpired = link.expiresAt && new Date(link.expiresAt).getTime() < Date.now();
                return (
                  <Card key={link.id} className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[14px] text-[var(--text)]">{link.label}</p>
                          {isExpired ? (
                            <Badge tone="danger">Expired</Badge>
                          ) : (
                            <Badge tone="success">Active</Badge>
                          )}
                          {link.primaryColor && (
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full border border-black/20"
                              style={{ backgroundColor: link.primaryColor }}
                              title={`Brand Color: ${link.primaryColor}`}
                            />
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-subtle)]">
                          <span>Token: {link.token.slice(0, 14)}…</span>
                          {link.expiresAt && (
                            <span>
                              Expires: {new Date(link.expiresAt).toLocaleDateString("en-US")}
                            </span>
                          )}
                          {link.logoUrl && <span>Custom Logo Configured</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyUrl(link.token)}
                          title="Copy client portal URL"
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copy Link
                        </Button>
                        <a
                          href={`/portal/${link.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="outline" size="sm" title="Preview portal view">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditBranding(link)}
                          title="Edit branding"
                        >
                          <Palette className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExtend(link.id)}
                          title="Extend 30 days"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(link.id)}
                          className="text-[var(--danger)] hover:text-[var(--danger)]"
                          title="Revoke access"
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate / Edit Form */}
        <div>
          {selectedLinkId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px] flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[var(--primary)]" />
                  Edit Portal Branding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveBranding} className="space-y-4">
                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Client Logo URL
                    </label>
                    <Input
                      placeholder="https://cdn.client.com/logo.png"
                      value={editLogoUrl}
                      onChange={(e) => setEditLogoUrl(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                      Displayed on client portal header.
                    </p>
                  </div>

                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Primary Brand Color (Hex)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="#4F46E5"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                      />
                      {editColor && (
                        <div
                          className="h-9 w-9 shrink-0 rounded border border-[var(--border)]"
                          style={{ backgroundColor: editColor }}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={savingBranding}>
                      {savingBranding ? "Saving…" : "Save Branding"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedLinkId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px] flex items-center gap-2">
                  <Plus className="h-4 w-4 text-[var(--primary)]" />
                  Generate New Portal Link
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateLink} className="space-y-3">
                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Recipient / Label
                    </label>
                    <Input
                      placeholder="e.g. Sarah Connor (CEO)"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Expires In (Days)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      value={newDays}
                      onChange={(e) => setNewDays(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] text-[var(--text-subtle)]">0 = never expires</p>
                  </div>

                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Client Logo URL (Optional)
                    </label>
                    <Input
                      placeholder="https://client.com/logo.svg"
                      value={newLogoUrl}
                      onChange={(e) => setNewLogoUrl(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[12px] font-medium text-[var(--text-muted)]">
                      Primary Color (Optional Hex)
                    </label>
                    <Input
                      placeholder="#0EA5E9"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                    />
                  </div>

                  <Button type="submit" size="sm" className="w-full" disabled={creating}>
                    {creating ? "Generating…" : "Generate Magic Link"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[12px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
              <ShieldCheck className="h-4 w-4 text-[var(--success)]" />
              <span>Scoped Security</span>
            </div>
            <p className="mt-1">
              Portal links allow guest review without requiring a Cadence login. They can only see content explicitly in client review, calendar, and summary reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
