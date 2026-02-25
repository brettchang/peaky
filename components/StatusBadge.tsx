import { PlacementStatus, CampaignStatus, ClientDisplayStatus } from "@/lib/types";

type AnyStatus = PlacementStatus | CampaignStatus | ClientDisplayStatus;

const statusStyles: Record<string, string> = {
  // Placement statuses (Notion Ad Calendar)
  "New Campaign": "bg-gray-100 text-gray-700",
  "Copywriting in Progress": "bg-amber-100 text-amber-700",
  "Peak Team Review Complete": "bg-yellow-100 text-yellow-700",
  "Sent for Approval": "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  "Onboarding Requested": "bg-slate-100 text-slate-700",
  "Drafting Script": "bg-amber-100 text-amber-700",
  "Script Review by Client": "bg-blue-100 text-blue-700",
  "Approved Script": "bg-emerald-100 text-emerald-700",
  "Audio Sent for Approval": "bg-indigo-100 text-indigo-700",
  "Audio Sent": "bg-indigo-100 text-indigo-700",
  "Audio Approved": "bg-green-100 text-green-700",
  "Drafting Questions": "bg-amber-100 text-amber-700",
  "Questions In Review": "bg-blue-100 text-blue-700",
  "Client Reviewing Interview": "bg-violet-100 text-violet-700",
  "Revising for Client": "bg-orange-100 text-orange-700",
  "Approved Interview": "bg-green-100 text-green-700",

  // Campaign statuses (Notion Campaigns DB)
  "Waiting on Onboarding": "bg-gray-100 text-gray-700",
  "Onboarding Form Complete": "bg-yellow-100 text-yellow-700",
  Active: "bg-green-100 text-green-700",
  "Placements Completed": "bg-blue-100 text-blue-700",
  Wrapped: "bg-purple-100 text-purple-700",

  // Client display statuses
  "In Progress": "bg-gray-100 text-gray-700",
  "Ready for Review": "bg-blue-100 text-blue-700",
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
