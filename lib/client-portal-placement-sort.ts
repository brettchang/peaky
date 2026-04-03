import type { ClientPlacementRow, Placement } from "@/lib/types";

export function comparePlacementsChronologically(
  a: Pick<Placement, "scheduledDate" | "id" | "type" | "publication">,
  b: Pick<Placement, "scheduledDate" | "id" | "type" | "publication">
): number {
  const dateCompare = compareScheduledDatesAscending(a.scheduledDate, b.scheduledDate);
  if (dateCompare !== 0) return dateCompare;

  const publicationCompare = a.publication.localeCompare(b.publication);
  if (publicationCompare !== 0) return publicationCompare;

  const typeCompare = a.type.localeCompare(b.type);
  if (typeCompare !== 0) return typeCompare;

  return a.id.localeCompare(b.id);
}

export function compareClientPlacementRowsChronologically(
  a: ClientPlacementRow,
  b: ClientPlacementRow
): number {
  const dateCompare = comparePlacementsChronologically(a.placement, b.placement);
  if (dateCompare !== 0) return dateCompare;

  const campaignCompare = a.campaignName.localeCompare(b.campaignName);
  if (campaignCompare !== 0) return campaignCompare;

  return a.campaignId.localeCompare(b.campaignId);
}

function compareScheduledDatesAscending(dateA?: string, dateB?: string): number {
  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;
  return dateA.localeCompare(dateB);
}
