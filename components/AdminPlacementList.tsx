"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Placement,
  OnboardingRound,
  AdLineItem,
  DateRangeCapacity,
  PODCAST_PUBLICATION,
  getPlacementStatusesFor,
  isClientReviewStatus,
  isPodcastInterviewType,
} from "@/lib/types";
import type { PlacementInvoiceLink } from "@/lib/xero-types";
import { AddPlacementForm } from "@/components/AddPlacementForm";
import { CopyEditor } from "@/components/CopyEditor";
import { InvoiceLinkModal } from "@/components/InvoiceLinkModal";
import { InvoiceStatusBadge } from "@/components/InvoiceStatusBadge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ADMIN_SCHEDULE_WINDOW_DAYS,
  ensureDateOption,
  getPlacementAvailableCapacityDates,
  getTodayDateKey,
  isPastDateKey,
} from "@/lib/schedule-capacity";

function isPodcastRollType(type: Placement["type"]): boolean {
  return type === ":30 Pre-Roll" || type === ":30 Mid-Roll";
}

function hasHistoricalDateOverride(placement: Placement, todayKey: string): boolean {
  return Boolean(placement.scheduledDate && isPastDateKey(placement.scheduledDate, todayKey));
}

function getHistoricalDateDraft(placement: Placement, todayKey: string): string {
  return hasHistoricalDateOverride(placement, todayKey) ? placement.scheduledDate ?? "" : "";
}

interface AdminPlacementListProps {
  placements: Placement[];
  campaignId: string;
  portalUrl: string;
  onboardingRounds?: OnboardingRound[];
  isEvergreen?: boolean;
  invoiceLinksByPlacement?: Record<string, PlacementInvoiceLink[]>;
  adLineItems?: AdLineItem[];
  xeroConnected?: boolean;
}

export function AdminPlacementList({
  placements,
  campaignId,
  portalUrl,
  onboardingRounds,
  isEvergreen = false,
  invoiceLinksByPlacement = {},
  adLineItems = [],
  xeroConnected = false,
}: AdminPlacementListProps) {
  const router = useRouter();
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [copiedLink, setCopiedLink] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editedCopy, setEditedCopy] = useState<Record<string, string>>({});
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessages, setSyncMessages] = useState<
    Record<string, { type: "error" | "success"; text: string }>
  >({});
  const [dateMessages, setDateMessages] = useState<
    Record<string, { type: "error" | "success"; text: string }>
  >({});
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      placements.map((placement) => [placement.id, placement.scheduledDate ?? ""])
    )
  );
  const [historicalDateDrafts, setHistoricalDateDrafts] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        placements.map((placement) => [
          placement.id,
          getHistoricalDateDraft(placement, todayKey),
        ])
      )
  );
  const [historicalDateEnabledById, setHistoricalDateEnabledById] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      placements.map((placement) => [
        placement.id,
        hasHistoricalDateOverride(placement, todayKey),
      ])
    )
  );
  const [capacityDays, setCapacityDays] = useState<DateRangeCapacity["days"]>([]);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [invoiceModalPlacementId, setInvoiceModalPlacementId] = useState<string | null>(null);
  const [unlinkingInvoiceId, setUnlinkingInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    setDateDrafts(
      Object.fromEntries(
        placements.map((placement) => [placement.id, placement.scheduledDate ?? ""])
      )
    );
    setHistoricalDateDrafts(
      Object.fromEntries(
        placements.map((placement) => [
          placement.id,
          getHistoricalDateDraft(placement, todayKey),
        ])
      )
    );
    setHistoricalDateEnabledById(
      Object.fromEntries(
        placements.map((placement) => [
          placement.id,
          hasHistoricalDateOverride(placement, todayKey),
        ])
      )
    );
  }, [placements, todayKey]);

  useEffect(() => {
    let cancelled = false;

    const toDateKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + ADMIN_SCHEDULE_WINDOW_DAYS);

    setCapacityLoading(true);
    setCapacityError(null);

    fetch(
      `/api/schedule-capacity?startDate=${toDateKey(start)}&endDate=${toDateKey(end)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load available dates");
        }
        return (await res.json()) as DateRangeCapacity;
      })
      .then((data) => {
        if (cancelled) return;
        setCapacityDays(data.days || []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCapacityError(
          error instanceof Error ? error.message : "Failed to load available dates"
        );
      })
      .finally(() => {
        if (cancelled) return;
        setCapacityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopyPortalLink() {
    await navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const getEditedCopy = useCallback(
    (placement: Placement) =>
      editedCopy[placement.id] ?? placement.currentCopy,
    [editedCopy]
  );

  function handleCopyChange(placementId: string, value: string) {
    setEditedCopy((prev) => ({ ...prev, [placementId]: value }));
  }

  async function handleSaveCopy(placementId: string) {
    const copy = editedCopy[placementId];
    if (copy === undefined) return;
    setSavingCopyId(placementId);
    try {
      const res = await fetch("/api/update-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId, copy }),
      });
      if (res.ok) {
        setEditedCopy((prev) => {
          const next = { ...prev };
          delete next[placementId];
          return next;
        });
        router.refresh();
      }
    } finally {
      setSavingCopyId(null);
    }
  }

  async function handlePeakTeamApproved(placement: Placement) {
    const placementId = placement.id;
    const draftCopy = editedCopy[placementId];
    const hasDraftChanges =
      draftCopy !== undefined && draftCopy !== placement.currentCopy;

    setSavingCopyId(placementId);
    try {
      if (hasDraftChanges) {
        const saveRes = await fetch("/api/update-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId,
            placementId,
            copy: draftCopy,
          }),
        });
        if (!saveRes.ok) return;
        setEditedCopy((prev) => {
          const next = { ...prev };
          delete next[placementId];
          return next;
        });
      }

      setUpdatingId(placementId);
      const statusRes = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          status:
            placement.status === "Drafting Script" ||
            placement.status === "Revising for Client"
              ? "Script Review by Client"
              : placement.status === "Drafting Questions"
                ? "Questions In Review"
                : "Peak Team Review Complete",
        }),
      });
      if (statusRes.ok) {
        router.refresh();
      }
    } finally {
      setSavingCopyId(null);
      setUpdatingId(null);
    }
  }

  async function handleStatusChange(placementId: string, status: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId, status }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeletePlacement(placementId: string) {
    setDeletingId(placementId);
    try {
      const res = await fetch("/api/delete-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId }),
      });
      if (res.ok) {
        setConfirmDeleteId(null);
        if (expandedId === placementId) {
          setExpandedId(null);
        }
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  }

  function formatDateLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getAvailableDateOptions(placement: Placement): string[] {
    return ensureDateOption(
      getPlacementAvailableCapacityDates({
        capacityDays,
        placement,
        todayKey,
        getReservedCount: (date) =>
          placements.filter((candidate) => {
            if (candidate.id === placement.id) return false;
            return (
              candidate.scheduledDate === date &&
              candidate.type === placement.type &&
              candidate.publication === placement.publication
            );
          }).length,
      }),
      placement.scheduledDate
    );
  }

  async function handleDateChange(
    placement: Placement,
    value: string,
    options?: { historicalDateOverride?: boolean }
  ) {
    const placementId = placement.id;
    const previousHistoricalDate =
      historicalDateDrafts[placementId] ?? getHistoricalDateDraft(placement, todayKey);
    const previousHistoricalEnabled =
      historicalDateEnabledById[placementId] ?? hasHistoricalDateOverride(placement, todayKey);
    setDateDrafts((prev) => ({ ...prev, [placementId]: value }));
    if (options?.historicalDateOverride) {
      setHistoricalDateDrafts((prev) => ({ ...prev, [placementId]: value }));
    }
    setDateMessages((prev) => {
      const next = { ...prev };
      delete next[placementId];
      return next;
    });

    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          scheduledDate: value || null,
          historicalDateOverride:
            options?.historicalDateOverride && isPastDateKey(value, todayKey)
              ? true
              : undefined,
        }),
      });
      if (res.ok) {
        setDateMessages((prev) => {
          const next = { ...prev };
          delete next[placementId];
          return next;
        });
        router.refresh();
      } else {
        const data = await res.json();
        setDateDrafts((prev) => ({
          ...prev,
          [placementId]: placement.scheduledDate ?? "",
        }));
        setHistoricalDateDrafts((prev) => ({
          ...prev,
          [placementId]: previousHistoricalDate,
        }));
        setHistoricalDateEnabledById((prev) => ({
          ...prev,
          [placementId]: previousHistoricalEnabled,
        }));
        setDateMessages((prev) => ({
          ...prev,
          [placementId]: {
            type: "error",
            text: data.error || "Failed to update date",
          },
        }));
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleEndDateChange(placementId: string, value: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          scheduledEndDate: value || null,
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleInterviewScheduledChange(
    placementId: string,
    interviewScheduled: boolean
  ) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          interviewScheduled,
        }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function startEditingLink(placement: Placement) {
    setEditingLinkId(placement.id);
    setLinkDraft(placement.linkToPlacement ?? "");
  }

  async function handleSyncStats(placementId: string) {
    setSyncingId(placementId);
    setSyncMessages((prev) => {
      const next = { ...prev };
      delete next[placementId];
      return next;
    });
    try {
      const res = await fetch("/api/sync-beehiiv-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, placementId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessages((prev) => ({
          ...prev,
          [placementId]: { type: "error", text: data.error ?? "Sync failed" },
        }));
      } else {
        setSyncMessages((prev) => ({
          ...prev,
          [placementId]: { type: "success", text: "Stats synced" },
        }));
        router.refresh();
      }
    } catch {
      setSyncMessages((prev) => ({
        ...prev,
        [placementId]: { type: "error", text: "Network error" },
      }));
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSaveLink(placementId: string) {
    setUpdatingId(placementId);
    try {
      const res = await fetch("/api/update-placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId,
          linkToPlacement: linkDraft || null,
        }),
      });
      if (res.ok) {
        setEditingLinkId(null);
        router.refresh();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function getPlacementCost(placement: Placement): number | null {
    const item = adLineItems.find(
      (li) =>
        li.type === placement.type &&
        (li.publication ? li.publication === placement.publication : true)
    );
    return item ? item.pricePerUnit : null;
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async function handleUnlinkInvoice(linkId: string) {
    setUnlinkingInvoiceId(linkId);
    try {
      const res = await fetch("/api/xero/unlink-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, type: "placement" }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setUnlinkingInvoiceId(null);
    }
  }

  const hasOnboardingRounds = !isEvergreen && (onboardingRounds?.length ?? 0) > 0;
  const roundIdSet = new Set((onboardingRounds ?? []).map((round) => round.id));
  const groupedSections: Array<{
    key: string;
    title?: string;
    subtitle?: string;
    placements: Placement[];
  }> = isEvergreen
    ? [
        {
          key: "evergreen",
          title: "Evergreen Placements",
          subtitle: "Ready-to-publish placements",
          placements,
        },
      ]
    : hasOnboardingRounds
    ? [
        ...(onboardingRounds ?? [])
          .map((round) => ({
            key: `round-${round.id}`,
            title: round.label?.trim() || round.id,
            subtitle: round.complete ? "Onboarding complete" : "Onboarding pending",
            placements: placements.filter((p) => p.onboardingRoundId === round.id),
          }))
          .filter((section) => section.placements.length > 0),
        {
          key: "round-unassigned",
          title: "Unassigned",
          subtitle: "No onboarding round linked",
          placements: placements.filter((p) => !p.onboardingRoundId),
        },
        {
          key: "round-orphaned",
          title: "Other Rounds",
          subtitle: "Linked to rounds not in this campaign list",
          placements: placements.filter(
            (p) => p.onboardingRoundId && !roundIdSet.has(p.onboardingRoundId)
          ),
        },
      ].filter((section) => section.placements.length > 0)
    : [{ key: "all-placements", placements }];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Placements ({placements.length})
        </h2>
        <div className="flex items-center gap-2">
          <AddPlacementForm
            campaignId={campaignId}
            onboardingRounds={onboardingRounds}
            isEvergreen={isEvergreen}
          />
          <button
            onClick={handleCopyPortalLink}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copiedLink ? "Copied!" : "Copy Portal Link"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {groupedSections
          .map((section) => ({
            ...section,
            placements: sortPlacementsByScheduledDate(section.placements, todayKey),
          }))
          .sort((a, b) => {
            const aFirst = a.placements[0];
            const bFirst = b.placements[0];
            if (!aFirst && !bFirst) return 0;
            if (!aFirst) return 1;
            if (!bFirst) return -1;
            return compareScheduledDateOrder(aFirst, bFirst, todayKey);
          })
          .map((section) => (
          <div key={section.key} className="space-y-3">
            {section.title && (
              <div className="px-1">
                <h3 className="text-sm font-semibold text-gray-800">
                  {section.title}{" "}
                  <span className="font-normal text-gray-500">
                    ({section.placements.length})
                  </span>
                </h3>
                {section.subtitle && (
                  <p className="text-xs text-gray-500">{section.subtitle}</p>
                )}
              </div>
            )}
            <div className="space-y-4">
              {section.placements.map((placement) => {
                const isExpanded = expandedId === placement.id;
                return (
                  <div
                    key={placement.id}
                    className="rounded-lg border border-gray-200 bg-white"
                  >
                    <div className="px-5 py-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Link
                              href={`/dashboard/${campaignId}/${placement.id}`}
                              prefetch={false}
                              className="font-medium text-gray-900 hover:text-blue-600 hover:underline"
                            >
                              {placement.name}
                            </Link>
                            {isEvergreen ? (
                              <StatusBadge status="Approved" />
                            ) : (
                              <select
                                value={placement.status}
                                disabled={updatingId === placement.id}
                                onChange={(e) =>
                                  handleStatusChange(placement.id, e.target.value)
                                }
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50"
                              >
                                {getPlacementStatusesFor(
                                  placement.type,
                                  placement.publication
                                ).map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            )}
                            {!isEvergreen && isClientReviewStatus(placement.status) && (
                              <button
                                onClick={() => {
                                  const nextStatus =
                                    placement.status === "Script Review by Client"
                                      ? "Approved Script"
                                      : placement.status === "Audio Sent for Approval" ||
                                          placement.status === "Audio Sent"
                                        ? "Audio Approved"
                                        : placement.status === "Questions In Review" ||
                                            placement.status === "Client Reviewing Interview"
                                          ? "Approved Interview"
                                          : "Approved";
                                  handleStatusChange(placement.id, nextStatus);
                                }}
                                disabled={updatingId === placement.id}
                                className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                Mark Approved
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                            <span className="rounded bg-gray-100 px-2 py-1">
                              {placement.type}
                            </span>
                            <span className="rounded bg-gray-100 px-2 py-1">
                              {placement.publication}
                            </span>
                            <span className="rounded bg-gray-100 px-2 py-1">
                              v{placement.copyVersion}
                            </span>
                            {placement.scheduledDate && placement.scheduledEndDate && (
                              <span className="rounded bg-gray-100 px-2 py-1">
                                {placement.scheduledDate} - {placement.scheduledEndDate}
                              </span>
                            )}
                            {isPodcastInterviewType(placement.type) && (
                              <span className="rounded bg-gray-100 px-2 py-1">
                                Interview:{" "}
                                {placement.interviewScheduled ? "Scheduled" : "Not Scheduled"}
                              </span>
                            )}
                            {isPodcastRollType(placement.type) &&
                              placement.committedImpressions != null && (
                                <span className="rounded bg-gray-100 px-2 py-1">
                                  Committed:{" "}
                                  {placement.committedImpressions.toLocaleString()}
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="w-full space-y-2 xl:w-auto xl:min-w-[26rem]">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={`date-${placement.id}`}
                              className="text-sm text-gray-500 xl:w-12"
                            >
                              {placement.publication === PODCAST_PUBLICATION
                                ? "Start:"
                                : "Scheduled:"}
                            </label>
                            <select
                              id={`date-${placement.id}`}
                              value={dateDrafts[placement.id] ?? ""}
                              disabled={
                                updatingId === placement.id ||
                                capacityLoading ||
                                Boolean(historicalDateEnabledById[placement.id])
                              }
                              onChange={(e) =>
                                handleDateChange(placement, e.target.value)
                              }
                              className="w-[10rem] rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                            >
                              <option value="">No date</option>
                              {getAvailableDateOptions(placement).length === 0 && (
                                <option value="" disabled>
                                  No dates in next 12 months
                                </option>
                              )}
                              {getAvailableDateOptions(placement).map((date) => (
                                <option key={date} value={date}>
                                  {formatDateLabel(date)}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={Boolean(historicalDateEnabledById[placement.id])}
                                disabled={updatingId === placement.id}
                                onChange={(e) =>
                                  setHistoricalDateEnabledById((prev) => ({
                                    ...prev,
                                    [placement.id]: e.target.checked,
                                  }))
                                }
                              />
                              Past date
                            </label>
                            {historicalDateEnabledById[placement.id] && (
                              <input
                                type="date"
                                value={historicalDateDrafts[placement.id] ?? ""}
                                disabled={updatingId === placement.id}
                                onChange={(e) => {
                                  setHistoricalDateDrafts((prev) => ({
                                    ...prev,
                                    [placement.id]: e.target.value,
                                  }));
                                  handleDateChange(placement, e.target.value, {
                                    historicalDateOverride: true,
                                  });
                                }}
                                className="w-[10rem] rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                              />
                            )}
                            {placement.publication === PODCAST_PUBLICATION && (
                              <>
                                <label className="text-sm text-gray-500">End:</label>
                                <input
                                  type="date"
                                  defaultValue={placement.scheduledEndDate ?? ""}
                                  disabled={updatingId === placement.id}
                                  onChange={(e) =>
                                    handleEndDateChange(placement.id, e.target.value)
                                  }
                                  className="w-[10rem] rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                                />
                              </>
                            )}
                            {isPodcastInterviewType(placement.type) && (
                              <label className="flex items-center gap-1 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={Boolean(placement.interviewScheduled)}
                                  disabled={updatingId === placement.id}
                                  onChange={(e) =>
                                    handleInterviewScheduledChange(
                                      placement.id,
                                      e.target.checked
                                    )
                                  }
                                />
                                Interview scheduled
                              </label>
                            )}
                          </div>
                          {dateMessages[placement.id] && (
                            <p
                              className={`text-xs ${
                                dateMessages[placement.id].type === "error"
                                  ? "text-red-600"
                                  : "text-green-600"
                              }`}
                            >
                              {dateMessages[placement.id].text}
                            </p>
                          )}
                          {!dateMessages[placement.id] && capacityError && (
                            <p className="text-xs text-red-600">{capacityError}</p>
                          )}
                          {historicalDateEnabledById[placement.id] && (
                            <p className="text-xs text-gray-500">
                              Past dates bypass inventory checks. Future dates still use
                              the availability picker.
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-3">
                            {confirmDeleteId === placement.id ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="text-red-600">Delete placement?</span>
                                <button
                                  onClick={() => handleDeletePlacement(placement.id)}
                                  disabled={deletingId === placement.id}
                                  className="font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                                >
                                  {deletingId === placement.id ? "Deleting..." : "Yes, delete"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={deletingId === placement.id}
                                  className="font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(placement.id)}
                                className="text-xs font-medium text-red-400 hover:text-red-600"
                              >
                                Delete
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setExpandedId(isExpanded ? null : placement.id)
                              }
                              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              {isExpanded ? "Hide Copy" : "Edit Copy"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Inline link editing + Check Results */}
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="text-xs text-gray-500">Link:</span>
                        {editingLinkId === placement.id ? (
                          <>
                            <input
                              type="url"
                              value={linkDraft}
                              onChange={(e) => setLinkDraft(e.target.value)}
                              placeholder="https://..."
                              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveLink(placement.id);
                                if (e.key === "Escape") setEditingLinkId(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveLink(placement.id)}
                              disabled={updatingId === placement.id}
                              className="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingLinkId(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {placement.linkToPlacement ? (
                              <a
                                href={placement.linkToPlacement}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-xs text-blue-600 hover:text-blue-700"
                              >
                                {placement.linkToPlacement}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Not set</span>
                            )}
                            <button
                              onClick={() => startEditingLink(placement)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              {placement.linkToPlacement ? "Edit" : "Add"}
                            </button>
                            {(placement.linkToPlacement || placement.beehiivPostId) && (
                              <>
                                <span className="text-gray-300">|</span>
                                <button
                                  onClick={() => handleSyncStats(placement.id)}
                                  disabled={syncingId === placement.id}
                                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                                >
                                  {syncingId === placement.id
                                    ? "Checking..."
                                    : placement.stats
                                      ? "Re-check Results"
                                      : "Check Results"}
                                </button>
                              </>
                            )}
                            {syncMessages[placement.id] && (
                              <span
                                className={`text-xs ${
                                  syncMessages[placement.id].type === "error"
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {syncMessages[placement.id].text}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Compact stats row */}
                      {placement.stats && (
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                          {placement.stats.totalSends != null && (
                            <span className="text-xs text-gray-500">
                              Sends:{" "}
                              <span className="font-semibold text-gray-900">
                                {placement.stats.totalSends.toLocaleString()}
                              </span>
                            </span>
                          )}
                          {placement.stats.openRate != null && (
                            <span className="text-xs text-gray-500">
                              Open Rate:{" "}
                              <span className="font-semibold text-gray-900">
                                {placement.stats.openRate}%
                              </span>
                            </span>
                          )}
                          {placement.stats.totalOpens != null && (
                            <span className="text-xs text-gray-500">
                              Total Opens:{" "}
                              <span className="font-semibold text-gray-900">
                                {placement.stats.totalOpens.toLocaleString()}
                              </span>
                            </span>
                          )}
                          {placement.stats.uniqueOpens != null && (
                            <span className="text-xs text-gray-500">
                              Unique Opens:{" "}
                              <span className="font-semibold text-gray-900">
                                {placement.stats.uniqueOpens.toLocaleString()}
                              </span>
                            </span>
                          )}
                          {placement.stats.uniqueClicks != null && (
                            <span className="text-xs text-gray-500">
                              Clicks:{" "}
                              <span className="font-semibold text-gray-900">
                                {placement.stats.uniqueClicks.toLocaleString()}
                              </span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Cost + Invoice row */}
                      {(() => {
                        const cost = getPlacementCost(placement);
                        const links = invoiceLinksByPlacement[placement.id] ?? [];
                        const invoiceTotal = links.reduce(
                          (sum, l) => sum + (l.invoice?.total ?? 0),
                          0
                        );
                        const showRow = cost != null || links.length > 0 || xeroConnected;
                        if (!showRow) return null;
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            {cost != null && (
                              <span className="text-gray-500">
                                Cost:{" "}
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(cost)}
                                </span>
                              </span>
                            )}
                            {links.length > 0 && (
                              <span className="text-gray-500">
                                {links.length} invoice{links.length !== 1 ? "s" : ""} —{" "}
                                <span className="font-semibold text-gray-900">
                                  {formatCurrency(invoiceTotal)}
                                </span>
                              </span>
                            )}
                            {links.map((link) => (
                              <span
                                key={link.id}
                                className="inline-flex items-center gap-1"
                              >
                                <span className="font-medium text-gray-700">
                                  {link.invoice?.invoiceNumber ||
                                    link.xeroInvoiceId.slice(0, 8)}
                                </span>
                                {link.invoice && (
                                  <InvoiceStatusBadge status={link.invoice.status} />
                                )}
                                <button
                                  onClick={() => handleUnlinkInvoice(link.id)}
                                  disabled={unlinkingInvoiceId === link.id}
                                  className="text-red-400 hover:text-red-600 disabled:opacity-50"
                                >
                                  {unlinkingInvoiceId === link.id ? "..." : "×"}
                                </button>
                              </span>
                            ))}
                            {xeroConnected && (
                              <button
                                onClick={() =>
                                  setInvoiceModalPlacementId(placement.id)
                                }
                                className="font-medium text-blue-600 hover:text-blue-700"
                              >
                                + Link Invoice
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-200 px-5 py-4">
                        <CopyEditor
                          value={getEditedCopy(placement)}
                          onChange={(val) => handleCopyChange(placement.id, val)}
                        />

                        {editedCopy[placement.id] !== undefined &&
                          editedCopy[placement.id] !== placement.currentCopy && (
                            <div className="mt-3 flex items-center gap-3">
                              <button
                                onClick={() => handleSaveCopy(placement.id)}
                                disabled={savingCopyId === placement.id}
                                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                              >
                                {savingCopyId === placement.id
                                  ? "Saving..."
                                  : "Save Copy"}
                              </button>
                              <button
                                onClick={() =>
                                  setEditedCopy((prev) => {
                                    const next = { ...prev };
                                    delete next[placement.id];
                                    return next;
                                  })
                                }
                                className="text-sm text-gray-500 hover:text-gray-700"
                              >
                                Discard changes
                              </button>
                            </div>
                          )}

                        {!isEvergreen &&
                          (placement.status === "Copywriting in Progress" ||
                          placement.status === "New Campaign" ||
                          placement.status === "Drafting Script" ||
                          placement.status === "Drafting Questions" ||
                          placement.status === "Revising for Client") && (
                          <div className="mt-3">
                            <button
                              onClick={() => handlePeakTeamApproved(placement)}
                              disabled={
                                savingCopyId === placement.id ||
                                updatingId === placement.id
                              }
                              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingCopyId === placement.id ||
                              updatingId === placement.id
                                ? "Updating..."
                                : "The Peak Team Has Approved"}
                            </button>
                          </div>
                        )}

                        {placement.revisionNotes && (
                          <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3">
                            <p className="text-xs font-medium text-amber-700">
                              Revision Notes
                            </p>
                            <p className="mt-1 text-sm text-amber-800">
                              {placement.revisionNotes}
                            </p>
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {invoiceModalPlacementId && (
        <InvoiceLinkModal
          campaignId={campaignId}
          placementId={invoiceModalPlacementId}
          existingInvoiceIds={
            (invoiceLinksByPlacement[invoiceModalPlacementId] ?? []).map(
              (l) => l.xeroInvoiceId
            )
          }
          onClose={() => setInvoiceModalPlacementId(null)}
        />
      )}
    </div>
  );
}

function sortPlacementsByScheduledDate(
  placements: Placement[],
  todayKey: string
): Placement[] {
  return [...placements]
    .map((placement, index) => ({ placement, index }))
    .sort((a, b) => compareScheduledDateOrder(a.placement, b.placement, todayKey, a.index, b.index))
    .map((entry) => entry.placement);
}

function compareScheduledDateOrder(
  a: Placement,
  b: Placement,
  todayKey: string,
  aIndex = 0,
  bIndex = 0
): number {
  const aDate = a.scheduledDate;
  const bDate = b.scheduledDate;

  if (!aDate && !bDate) return aIndex - bIndex;
  if (!aDate) return 1;
  if (!bDate) return -1;

  const aIsUpcoming = aDate >= todayKey;
  const bIsUpcoming = bDate >= todayKey;
  if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1;

  if (aIsUpcoming && bIsUpcoming) {
    if (aDate !== bDate) return aDate.localeCompare(bDate);
  } else if (aDate !== bDate) {
    // Keep past placements nearest to today before older ones.
    return bDate.localeCompare(aDate);
  }

  return aIndex - bIndex;
}
