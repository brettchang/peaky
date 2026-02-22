import { PlacementStatus, CampaignStatus, ClientDisplayStatus } from "@/lib/types";

type AnyStatus = PlacementStatus | CampaignStatus | ClientDisplayStatus;

const statusStyles: Record<string, string> = {
  // Placement statuses (Notion Ad Calendar)
  "New Campaign": "bg-gray-100 text-gray-700",
  "Onboarding Requested": "bg-gray-100 text-gray-700",
  "Copywriting in Progress": "bg-amber-100 text-amber-700",
  "Peak Team Review Complete": "bg-yellow-100 text-yellow-700",
  "Sent for Approval": "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  "Debrief Needed": "bg-orange-100 text-orange-700",
  "Send Debrief": "bg-orange-100 text-orange-700",
  "Client Missed Placement": "bg-red-100 text-red-700",
  Hold: "bg-red-100 text-red-700",
  Done: "bg-purple-100 text-purple-700",

  // Campaign statuses (Notion Campaigns DB)
  "Waiting on Onboarding": "bg-gray-100 text-gray-700",
  "Onboarding Form Complete": "bg-yellow-100 text-yellow-700",
  Active: "bg-green-100 text-green-700",
  "Placements Completed": "bg-blue-100 text-blue-700",
  Wrapped: "bg-purple-100 text-purple-700",

  // Client display statuses
  "In Progress": "bg-gray-100 text-gray-700",
  "Ready for Review": "bg-blue-100 text-blue-700",
  Published: "bg-purple-100 text-purple-700",
  "On Hold": "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
