"use client";

import { useState } from "react";
import {
  Placement,
  getClientDisplayStatus,
  isApprovedStatus,
  isClientReviewStatus,
  isClientCopyPlacement,
  isPodcastInterviewType,
  isPodcastPublication,
} from "@/lib/types";
import { formatCopy } from "@/lib/format-copy";
import {
  canClientEditApprovedPlacementCopy,
  formatPlacementClientEditCutoff,
} from "@/lib/placement-editability";
import { PerformanceStats } from "./PerformanceStats";
import { ConfirmationScreen } from "./ConfirmationScreen";
import { CopyEditor } from "./CopyEditor";

export function CopyReview({
  placement,
  campaignId,
  clientPortalId,
}: {
  placement: Placement;
  campaignId: string;
  clientPortalId: string;
}) {
  const [confirmationType, setConfirmationType] = useState<
    "approved" | "revised" | "approved-with-edits" | null
  >(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCopy, setSavedCopy] = useState(placement.currentCopy);
  const [editedCopy, setEditedCopy] = useState(placement.currentCopy);
  const [placementLink, setPlacementLink] = useState(
    placement.linkToPlacement ?? ""
  );
  const [imageUrl, setImageUrl] = useState(placement.imageUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(placement.logoUrl ?? "");
  const [uploadingField, setUploadingField] = useState<"imageUrl" | "logoUrl" | null>(null);

  const displayStatus = getClientDisplayStatus(placement.status);
  const isClientCopyPlacementFlow = isClientCopyPlacement(placement);
  const hasEdits = editedCopy !== savedCopy;
  const isClientReviewStage = isClientReviewStatus(displayStatus);
  const isClientSelfServeStage =
    isClientCopyPlacementFlow &&
    !isClientReviewStage &&
    displayStatus !== "Approved" &&
    displayStatus !== "Approved Script" &&
    displayStatus !== "Audio Approved" &&
    displayStatus !== "Approved Interview";
  const canEditApprovedCopy = canClientEditApprovedPlacementCopy(placement);
  const isEditable =
    isClientCopyPlacementFlow ||
    isClientReviewStage ||
    isClientSelfServeStage ||
    canEditApprovedCopy;
  const approvedEditCutoffLabel = formatPlacementClientEditCutoff(
    placement.scheduledDate
  );
  const approvedAndScheduled =
    Boolean(placement.scheduledDate) &&
    Boolean(placement.linkToPlacement?.trim()) &&
    placement.currentCopy.trim().length > 0;
  const canClientViewCopy =
    isClientSelfServeStage ||
    isClientReviewStatus(displayStatus) ||
    displayStatus === "Approved" ||
    displayStatus === "Approved Script" ||
    displayStatus === "Audio Approved" ||
    displayStatus === "Approved Interview" ||
    approvedAndScheduled;

  const reviewAssetLabel = isPodcastPublication(placement.publication)
    ? placement.status === "Audio Sent for Approval" || placement.status === "Audio Sent"
      ? "audio"
      : placement.status === "Questions In Review" ||
          placement.status === "Client Reviewing Interview"
        ? "interview"
        : isClientSelfServeStage && isPodcastInterviewType(placement.type)
          ? "interview"
        : "script"
    : "copy";
  const requiresPlacementLink = !isPodcastPublication(placement.publication);
  const requiresPrimaryAssets = placement.type === "Primary";
  const missingPrimaryAssets = requiresPrimaryAssets && (!imageUrl || !logoUrl);

  if (confirmationType) {
    return <ConfirmationScreen type={confirmationType} />;
  }

  async function handleApprove() {
    if (missingPrimaryAssets) {
      setError("Primary placements require both a logo and image before approval.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          clientId: clientPortalId,
          linkToPlacement: placementLink,
          ...(hasEdits && { editedCopy }),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }
      if (hasEdits) {
        setSavedCopy(editedCopy);
      }
      setConfirmationType(hasEdits ? "approved-with-edits" : "approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssetUpload(field: "logoUrl" | "imageUrl", file: File) {
    setUploadingField(field);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaignId", campaignId);
      formData.append("placementId", placement.id);
      formData.append("field", field);
      formData.append("clientId", clientPortalId);

      const res = await fetch("/api/upload-placement-asset", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      const uploadedUrl = String(data.url || "");
      if (field === "logoUrl") {
        setLogoUrl(uploadedUrl);
      } else {
        setImageUrl(uploadedUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  async function handleRevise() {
    if (!revisionNotes.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          clientId: clientPortalId,
          notes: revisionNotes.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit revision");
      }
      setConfirmationType("revised");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveApprovedChanges() {
    if (!hasEdits) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/update-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          placementId: placement.id,
          clientId: clientPortalId,
          copy: editedCopy,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save changes");
      }
      setSavedCopy(editedCopy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Copy display */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {canClientViewCopy ? (
          <>
            {isEditable && hasEdits && (
              <div className="mb-4">
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Edited
                </span>
              </div>
            )}
            {isEditable ? (
              <CopyEditor value={editedCopy} onChange={setEditedCopy} />
            ) : (
              <div className="prose max-w-none overflow-hidden [overflow-wrap:anywhere] break-words prose-a:break-all">
                {formatCopy(savedCopy)}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              Copy is still in progress and will appear here after Peak team approval.
            </p>
          </div>
        )}
      </div>

      {/* Review stage — client can approve or request revisions */}
      {(isClientReviewStage || isClientSelfServeStage) && (
        <div className="space-y-4">
          {isClientSelfServeStage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800">
                Add the final {reviewAssetLabel} here and approve it when ready. This skips Peak&apos;s drafting stage for this placement.
              </p>
            </div>
          )}
          {hasEdits && (
            <p className="text-sm text-amber-700">
              You&apos;ve made changes to this copy. Your edits will be saved when you approve.
            </p>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label
              htmlFor={`placement-link-${placement.id}`}
              className="block text-sm font-medium text-gray-700"
            >
              {requiresPlacementLink
                ? "What link should we use for this placement?"
                : "Placement link (optional)"}
            </label>
            <input
              id={`placement-link-${placement.id}`}
              type="url"
              value={placementLink}
              onChange={(e) => setPlacementLink(e.target.value)}
              placeholder="https://example.com/landing-page"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {requiresPrimaryAssets && (
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">
                Upload creative assets (required for Primary placements)
              </p>
              <p className="text-sm text-gray-600">
                Your Primary Placement comes with a &quot;Sponsored by&quot; logo placement at the top
                of the newsletter, plus a 600x340 px image for your story.
              </p>
              <div className="space-y-3">
                <label className="block text-sm text-gray-700">
                  Logo
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isSubmitting || uploadingField !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAssetUpload("logoUrl", file);
                      e.currentTarget.value = "";
                    }}
                    className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-300"
                  />
                  {logoUrl ? (
                    <a
                      href={logoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                    >
                      View uploaded logo
                    </a>
                  ) : (
                    <span className="mt-1 block text-xs text-red-600">Logo required</span>
                  )}
                </label>
                <label className="block text-sm text-gray-700">
                  Image
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isSubmitting || uploadingField !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleAssetUpload("imageUrl", file);
                      e.currentTarget.value = "";
                    }}
                    className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-gray-300"
                  />
                  {imageUrl ? (
                    <a
                      href={imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                    >
                      View uploaded image
                    </a>
                  ) : (
                    <span className="mt-1 block text-xs text-red-600">Image required</span>
                  )}
                </label>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={
                isSubmitting ||
                (requiresPlacementLink && !placementLink.trim()) ||
                missingPrimaryAssets
              }
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? "Approving..." : `Approve ${reviewAssetLabel}`}
            </button>
          </div>
          {isClientReviewStage && (
            <div className="space-y-2">
              <label
                htmlFor={`revision-notes-${placement.id}`}
                className="block text-sm font-medium text-gray-700"
              >
                Or request revisions:
              </label>
              <textarea
                id={`revision-notes-${placement.id}`}
                rows={4}
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Describe what changes you'd like to see..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleRevise}
                disabled={isSubmitting || !revisionNotes.trim()}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit Revision Notes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Copywriting in Progress */}
      {displayStatus === "Copywriting in Progress" && (
        <div className="space-y-4">
          {placement.revisionNotes && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Your revision notes:
              </p>
              <p className="mt-1 text-sm text-amber-700">
                {placement.revisionNotes}
              </p>
            </div>
          )}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              Our team is working on this placement. You&apos;ll receive
              the copy for review soon.
            </p>
          </div>
        </div>
      )}

      {/* New Campaign */}
      {displayStatus === "New Campaign" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            This placement is waiting on your copy onboarding form. Once submitted,
            status will move to Copywriting in Progress.
          </p>
        </div>
      )}

      {/* Approved */}
      {isApprovedStatus(displayStatus) && (
        <div
          className={`rounded-lg p-4 ${
            canEditApprovedCopy
              ? "border border-blue-200 bg-blue-50"
              : "border border-green-200 bg-green-50"
          }`}
        >
          <p
            className={`text-sm ${
              canEditApprovedCopy ? "text-blue-700" : "text-green-700"
            }`}
          >
            {canEditApprovedCopy
              ? isClientCopyPlacementFlow
                ? "This placement is approved. You can keep editing the copy here at any time."
                : approvedEditCutoffLabel
                ? `This copy is approved. You can keep editing it until ${approvedEditCutoffLabel}.`
                : "This copy is approved. You can continue editing it until the placement run cutoff."
              : "This copy has been approved and is scheduled for publishing."}
          </p>
          {canEditApprovedCopy && (
            <div className="mt-4 space-y-3">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                onClick={handleSaveApprovedChanges}
                disabled={isSubmitting || !hasEdits}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Performance stats (if available) */}
      {placement.stats && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">
            Placement Performance
          </h3>
          <PerformanceStats stats={placement.stats} />
        </div>
      )}
    </div>
  );
}
