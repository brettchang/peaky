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
  getPlacementInvoiceLinks,
  getAllInvoiceLinks,
  getCapacityForDateRange,
  getSetting,
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
  updatePlacementOnboardingRound,
  updatePlacementLink,
  updateCampaignMetadata,
  updatePlacementMetadata,
  syncPlacementBeehiivStats,
  bulkSchedulePlacements,
  saveOnboardingForm,
  submitOnboardingForm,
  saveBillingOnboardingForm,
  submitBillingOnboardingForm,
  updateBillingOnboardingByAdmin,
  upsertSetting,
  deleteCampaign,
} from "./mutations";
