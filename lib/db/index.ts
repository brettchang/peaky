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
  getInvoiceLinkById,
  getCapacityForDateRange,
  getPlacementsScheduledOn,
  getSetting,
} from "./queries";

export {
  updatePlacementStatus,
  savePlacementRevisionNotes,
  updatePlacementCopy,
  updatePlacementScheduledDate,
  createOnboardingRound,
  updateOnboardingRoundLabel,
  createCampaign,
  markOnboardingComplete,
  markBillingOnboardingComplete,
  updateAdLineItems,
  addPlacement,
  publishPlacementToBeehiiv,
  updatePlacementOnboardingRound,
  updatePlacementLink,
  updateCampaignMetadata,
  updateCampaignPandaDoc,
  updatePlacementMetadata,
  syncPlacementBeehiivStats,
  bulkSchedulePlacements,
  saveOnboardingForm,
  submitOnboardingForm,
  saveBillingOnboardingForm,
  submitBillingOnboardingForm,
  updateBillingOnboardingByAdmin,
  updateCampaignInvoiceDashboardStatus,
  updateCampaignInvoiceNotes,
  addCampaignManagerNote,
  upsertSetting,
  deleteCampaign,
  deletePlacement,
} from "./mutations";
