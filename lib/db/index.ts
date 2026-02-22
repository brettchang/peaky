import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "./schema";

export const db = drizzle(sql, { schema });

export {
  getClientByPortalId,
  getCampaignById,
  getPlacement,
  getCampaignPageData,
  getCampaignsForClient,
  getAllCampaignsWithClients,
  getPlacementsForClient,
  getPlacementPageData,
  getClientByCampaignId,
  getAllClients,
  getCampaignInvoiceLinks,
  getAllInvoiceLinks,
} from "./queries";

export {
  updatePlacementStatus,
  savePlacementRevisionNotes,
  updatePlacementCopy,
  updatePlacementScheduledDate,
  createOnboardingRound,
  createCampaign,
  markOnboardingComplete,
  markBillingOnboardingComplete,
  updateAdLineItems,
  addPlacement,
  publishPlacementToBeehiiv,
} from "./mutations";
