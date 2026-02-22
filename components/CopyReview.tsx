"use client";

import { useState } from "react";
import { Placement, getClientDisplayStatus } from "@/lib/types";
import { formatCopy } from "@/lib/format-copy";
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
  const [editedCopy, setEditedCopy] = useState(placement.currentCopy);

  const displayStatus = getClientDisplayStatus(placement.status);
  const hasEdits = editedCopy !== placement.currentCopy;

  if (confirmationType) {
    return <ConfirmationScreen type={confirmationType} />;
  }

  async function handleApprove() {
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
          ...(hasEdits && { editedCopy }),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }
      setConfirmationType(hasEdits ? "approved-with-edits" : "approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="space-y-6">
      {/* Copy display */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {displayStatus === "Ready for Review" ? (
          <>
            {hasEdits && (
              <div className="mb-4">
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                  Edited
                </span>
              </div>
            )}
            <CopyEditor value={editedCopy} onChange={setEditedCopy} />
          </>
        ) : (
          <div className="prose max-w-none">
            {formatCopy(placement.currentCopy)}
          </div>
        )}
      </div>

      {/* Ready for Review — client can approve or request revisions */}
      {displayStatus === "Ready for Review" && (
        <div className="space-y-4">
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
          <div className="flex gap-3">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? "Approving..." : "Approve Copy"}
            </button>
          </div>
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
        </div>
      )}

      {/* In Progress — copy is being worked on (includes "Copywriting in Progress" after revision) */}
      {displayStatus === "In Progress" && (
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

      {/* Approved */}
      {displayStatus === "Approved" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-700">
            This copy has been approved and is scheduled for publishing.
          </p>
        </div>
      )}

      {/* Published — show performance stats if available */}
      {displayStatus === "Published" && placement.stats && (
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
