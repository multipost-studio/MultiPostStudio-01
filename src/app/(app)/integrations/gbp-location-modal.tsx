"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin, RefreshCw, CheckSquare, Square, AlertCircle, Phone, Tag } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { PlatformBadge } from "@/components/brand";
import {
  getGbpLocationsAction,
  saveGbpLocationsAction,
  type GbpLocationDiscoveryResult,
  type GbpLocationItem,
} from "@/app/actions/gbp-locations";

export function GbpLocationModal({
  accountId,
  open,
  onClose,
  onSaved,
}: {
  accountId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<GbpLocationDiscoveryResult | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const loadLocations = React.useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    const res = await getGbpLocationsAction(accountId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to load Google Business Profile locations");
      return;
    }
    const result = res.data as GbpLocationDiscoveryResult;
    setData(result);
    // Initialize selected with currently connected locations
    const initialSelected = new Set(
      result.locations.filter((l) => l.connected).map((l) => l.name),
    );
    setSelected(initialSelected);
  }, [accountId]);

  React.useEffect(() => {
    if (open && accountId) {
      loadLocations();
    } else {
      setData(null);
      setError(null);
      setSelected(new Set());
    }
  }, [open, accountId, loadLocations]);

  function toggleLocation(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function selectAll() {
    if (!data) return;
    setSelected(new Set(data.locations.map((l) => l.name)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    if (!accountId) return;
    setSaving(true);
    const res = await saveGbpLocationsAction(
      accountId,
      Array.from(selected),
    );
    setSaving(false);

    if (!res.ok) {
      toast({
        title: "Couldn't save locations",
        description: res.error,
        tone: "error",
      });
      return;
    }

    toast({
      title: "Locations updated",
      description: res.message ?? `Connected ${selected.size} Google Business Profile location(s).`,
      tone: "success",
    });
    router.refresh();
    onSaved?.();
    onClose();
  }

  // Group locations by account
  const groupedLocations = React.useMemo(() => {
    if (!data?.locations) return new Map<string, GbpLocationItem[]>();
    const map = new Map<string, GbpLocationItem[]>();

    for (const loc of data.locations) {
      const groupKey = loc.accountTitle || loc.accountName || "Business Profile Account";
      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(loc);
    }

    return map;
  }, [data]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Google Business Profile Locations"
      description="Select the business locations you want to connect and publish to from this workspace."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[12px] text-[var(--text-subtle)]">
            {selected.size} location{selected.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={loading || !data}
              onClick={handleSave}
            >
              Connect Selected Locations
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <RefreshCw className="h-7 w-7 animate-spin text-[var(--primary)] mb-3" />
            <p className="text-[14px] font-medium text-[var(--text)]">
              Discovering Google Business Profile locations…
            </p>
            <p className="text-[12px] text-[var(--text-subtle)] mt-1">
              Querying Google Business Information and Account Management APIs
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-[13px] text-[var(--danger)]">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to discover locations</p>
                <p className="mt-0.5 text-[var(--text-muted)]">{error}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={loadLocations}
                >
                  <RefreshCw size={13} className="mr-1.5" /> Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Account Info Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                  Google Account
                </p>
                <p className="text-[13.5px] font-semibold text-[var(--text)]">
                  {data.accountDisplayName || data.accountEmail}
                  {data.accountDisplayName && data.accountEmail && (
                    <span className="font-normal text-[var(--text-subtle)] ml-1.5 text-[12px]">
                      ({data.accountEmail})
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  disabled={selected.size === data.locations.length}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAll}
                  disabled={selected.size === 0}
                >
                  Deselect All
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadLocations}
                  title="Re-query Google for newly created or verified locations"
                >
                  <RefreshCw size={12} className="mr-1" /> Refresh
                </Button>
              </div>
            </div>

            {/* Empty State */}
            {data.locations.length === 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                <Building2 className="mx-auto h-8 w-8 text-[var(--text-subtle)] mb-2" />
                <p className="text-[14px] font-semibold text-[var(--text)]">
                  No locations found
                </p>
                <p className="text-[12.5px] text-[var(--text-subtle)] max-w-md mx-auto mt-1">
                  We couldn&apos;t find any Business Profile locations for this Google account.
                  Make sure your account has owner or manager access in the Google Business Profile Manager.
                </p>
              </div>
            )}

            {/* Location Groups */}
            {data.locations.length > 0 && (
              <div className="max-h-[380px] overflow-y-auto space-y-4 pr-1">
                {Array.from(groupedLocations.entries()).map(([accountTitle, locs]) => (
                  <div
                    key={accountTitle}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                  >
                    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-sunken)]/60 px-3.5 py-2">
                      <Building2 size={14} className="text-[var(--primary)]" />
                      <span className="text-[12.5px] font-semibold text-[var(--text)]">
                        {accountTitle}
                      </span>
                      <span className="ml-auto text-[11px] text-[var(--text-subtle)]">
                        {locs.length} location{locs.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="divide-y divide-[var(--border)]">
                      {locs.map((loc) => {
                        const isChecked = selected.has(loc.name);
                        const addr = [
                          ...(loc.storefrontAddress?.addressLines ?? []),
                          loc.storefrontAddress?.locality,
                          loc.storefrontAddress?.administrativeArea,
                          loc.storefrontAddress?.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ");
                        const category = loc.categories?.primaryCategory?.displayName;
                        const phone = loc.phoneNumbers?.primaryPhone;

                        return (
                          <div
                            key={loc.name}
                            onClick={() => toggleLocation(loc.name)}
                            className="flex items-start gap-3 p-3.5 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleLocation(loc.name)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13.5px] font-semibold text-[var(--text)]">
                                  {loc.title}
                                </span>
                                {loc.storeCode && (
                                  <span className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-subtle)] border border-[var(--border)]">
                                    #{loc.storeCode}
                                  </span>
                                )}
                                {category && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--primary)]">
                                    <Tag size={10} /> {category}
                                  </span>
                                )}
                              </div>

                              {addr && (
                                <p className="flex items-center gap-1 text-[12px] text-[var(--text-subtle)] mt-1">
                                  <MapPin size={11} className="shrink-0 opacity-70" />
                                  <span className="truncate">{addr}</span>
                                </p>
                              )}

                              {phone && (
                                <p className="flex items-center gap-1 text-[11.5px] text-[var(--text-subtle)] mt-0.5">
                                  <Phone size={10} className="shrink-0 opacity-70" />
                                  <span>{phone}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
