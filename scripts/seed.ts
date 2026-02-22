import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "../lib/db/schema";

const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding database...");

  // Clear tables in FK-safe order
  console.log("Clearing existing data...");
  await sql`DELETE FROM copy_versions`;
  await sql`DELETE FROM placements`;
  await sql`DELETE FROM onboarding_rounds`;
  await sql`DELETE FROM billing_onboarding`;
  await sql`DELETE FROM campaigns`;
  await sql`DELETE FROM clients`;

  // ─── Clients ─────────────────────────────────────────────
  console.log("Inserting clients...");
  await db.insert(schema.clients).values([
    { id: "client-001", name: "Felix Health", portalId: "abc123def456" },
    { id: "client-002", name: "Greenline Supplements", portalId: "xyz789ghj234" },
  ]);

  // ─── Campaigns ───────────────────────────────────────────
  console.log("Inserting campaigns...");
  await db.insert(schema.campaigns).values([
    {
      id: "campaign-001",
      name: "Felix Health 1646",
      clientId: "client-001",
      status: "Active",
      campaignManager: "Matheus",
      contactName: "Sarah Chen",
      contactEmail: "sarah@felixhealth.com",
      adLineItems: [
        { quantity: 2, type: "Primary", pricePerUnit: 3000 },
        { quantity: 2, type: "Secondary", pricePerUnit: 1500 },
      ],
      placementsDescription: "2x Primary (Peak Daily), 2x Secondary (Peak Money)",
      createdAt: new Date("2026-02-15T10:00:00Z"),
    },
    {
      id: "campaign-002",
      name: "Felix Health 1702",
      clientId: "client-001",
      status: "Placements Completed",
      campaignManager: "Will",
      contactName: "Sarah Chen",
      contactEmail: "sarah@felixhealth.com",
      adLineItems: [
        { quantity: 1, type: "Primary", pricePerUnit: 3000 },
        { quantity: 1, type: "Peak Picks", pricePerUnit: 1800 },
      ],
      createdAt: new Date("2026-01-20T10:00:00Z"),
    },
    {
      id: "campaign-003",
      name: "Greenline Supplements 2201",
      clientId: "client-002",
      status: "Active",
      campaignManager: "Matheus",
      contactName: "James Park",
      contactEmail: "james@greenline.co",
      adLineItems: [
        { quantity: 1, type: "Primary", pricePerUnit: 3000 },
        { quantity: 1, type: "Secondary", pricePerUnit: 1500 },
        { quantity: 1, type: "Peak Picks", pricePerUnit: 1800 },
      ],
      placementsDescription:
        "1x Primary (Peak Daily), 1x Secondary (Peak Money), 1x Peak Picks (Peak Daily)",
      createdAt: new Date("2026-02-10T10:00:00Z"),
    },
  ]);

  // ─── Billing Onboarding ──────────────────────────────────
  console.log("Inserting billing onboarding...");
  await db.insert(schema.billingOnboarding).values([
    {
      id: "billing-001",
      campaignId: "campaign-001",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-001&form_type=billing",
      complete: true,
      completedAt: new Date("2026-02-16T14:00:00Z"),
      billingContactName: "Sarah Chen",
      billingContactEmail: "billing@felixhealth.com",
      billingAddress: "123 Health St, Suite 400, San Francisco, CA 94105",
      invoiceCadence: {
        type: "equal-monthly",
        totalAmount: 9000,
        numberOfMonths: 3,
        monthlyAmount: 3000,
      },
    },
    {
      id: "billing-002",
      campaignId: "campaign-002",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-002&form_type=billing",
      complete: true,
      completedAt: new Date("2026-01-22T10:00:00Z"),
      billingContactName: "Sarah Chen",
      billingContactEmail: "billing@felixhealth.com",
      billingAddress: "123 Health St, Suite 400, San Francisco, CA 94105",
      poNumber: "PO-2026-1702",
      invoiceCadence: {
        type: "lump-sum",
        totalAmount: 4800,
        paymentTerms: "net-30",
      },
    },
    {
      id: "billing-003",
      campaignId: "campaign-003",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-003&form_type=billing",
      complete: false,
    },
  ]);

  // ─── Onboarding Rounds ───────────────────────────────────
  console.log("Inserting onboarding rounds...");
  await db.insert(schema.onboardingRounds).values([
    {
      id: "round-001",
      campaignId: "campaign-001",
      label: "Initial Round",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-001&round_id=round-001",
      complete: true,
      onboardingDocUrl: "https://docs.google.com/document/d/felix-1646",
      createdAt: new Date("2026-02-15T10:00:00Z"),
    },
    {
      id: "round-002",
      campaignId: "campaign-002",
      label: "Initial Round",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-002&round_id=round-002",
      complete: true,
      onboardingDocUrl: "https://docs.google.com/document/d/felix-1702",
      createdAt: new Date("2026-01-20T10:00:00Z"),
    },
    {
      id: "round-003",
      campaignId: "campaign-003",
      label: "Initial Round",
      filloutLink:
        "https://thepeakquiz.fillout.com/t/uDNyXt4Ttsus?campaign_id=campaign-003&round_id=round-003",
      complete: true,
      onboardingDocUrl: "https://docs.google.com/document/d/greenline-2201",
      createdAt: new Date("2026-02-10T10:00:00Z"),
    },
  ]);

  // ─── Placements ──────────────────────────────────────────
  console.log("Inserting placements...");
  await db.insert(schema.placements).values([
    // Campaign 001 placements
    {
      id: "placement-001a",
      campaignId: "campaign-001",
      name: "Felix Health 1646 — Primary",
      type: "Primary",
      publication: "The Peak",
      scheduledDate: "2026-02-18",
      status: "Sent for Approval",
      onboardingRoundId: "round-001",
      currentCopy: `**Tired of waiting weeks for a doctor's appointment?**

Felix Health puts board-certified physicians in your pocket — available 24/7 for consultations, prescriptions, and follow-ups.

- Skip the waiting room. See a doctor in under 10 minutes.
- Get prescriptions delivered to your door.
- No insurance needed. Plans start at $29/month.

**Your health shouldn't have to wait.** Try Felix Health free for 14 days.

[Start Your Free Trial →]`,
      copyVersion: 1,
      createdAt: new Date("2026-02-15T10:00:00Z"),
    },
    {
      id: "placement-001b",
      campaignId: "campaign-001",
      name: "Felix Health 1646 — Secondary",
      type: "Secondary",
      publication: "Peak Money",
      scheduledDate: "2026-02-20",
      status: "Sent for Approval",
      onboardingRoundId: "round-001",
      currentCopy: `**Healthcare costs keeping you up at night?**

Felix Health offers unlimited doctor visits for a flat $29/month — no insurance required, no surprise bills.

- See a doctor in minutes, not weeks
- Prescriptions included at no extra cost
- Cancel anytime, no commitments

**Save thousands on healthcare.** Start your free 14-day trial today.

[Get Started →]`,
      copyVersion: 1,
      createdAt: new Date("2026-02-15T12:00:00Z"),
    },
    // Campaign 002 placements
    {
      id: "placement-002a",
      campaignId: "campaign-002",
      name: "Felix Health 1702 — Primary",
      type: "Primary",
      publication: "The Peak",
      scheduledDate: "2026-02-01",
      status: "Done",
      onboardingRoundId: "round-002",
      currentCopy: `**What if your doctor was always just a tap away?**

Felix Health connects you with licensed physicians instantly — no appointments, no waiting rooms, no hassle.

- 24/7 access to board-certified doctors
- Prescriptions sent directly to your pharmacy
- Affordable plans starting at $29/month

Over 50,000 patients trust Felix Health for fast, reliable care.

**Join them today.** Your first consultation is free.

[Get Started Free →]`,
      copyVersion: 3,
      stats: {
        openRate: 42.5,
        totalOpens: 10490,
        uniqueOpens: 8230,
        totalClicks: 935,
        uniqueClicks: 780,
        totalSends: 24650,
        ctr: 3.8,
        adRevenue: 4200,
      },
      beehiivPostId: "post_abc123",
      createdAt: new Date("2026-01-20T10:00:00Z"),
      publishedAt: new Date("2026-02-01T09:00:00Z"),
    },
    {
      id: "placement-002b",
      campaignId: "campaign-002",
      name: "Felix Health 1702 — Peak Picks",
      type: "Peak Picks",
      publication: "The Peak",
      scheduledDate: "2026-02-01",
      status: "Done",
      onboardingRoundId: "round-002",
      currentCopy: `**Felix Health** — See a doctor in under 10 minutes, 24/7. No insurance needed. Plans from $29/mo. [Try it free →]`,
      copyVersion: 1,
      stats: {
        openRate: 38.2,
        totalOpens: 9420,
        uniqueOpens: 7150,
        totalClicks: 518,
        uniqueClicks: 410,
        totalSends: 24650,
        ctr: 2.1,
        adRevenue: 1800,
      },
      beehiivPostId: "post_abc124",
      createdAt: new Date("2026-01-20T12:00:00Z"),
      publishedAt: new Date("2026-02-01T09:00:00Z"),
    },
    // Campaign 003 placements
    {
      id: "placement-003a",
      campaignId: "campaign-003",
      name: "Greenline 2201 — Primary",
      type: "Primary",
      publication: "The Peak",
      scheduledDate: "2026-02-25",
      status: "Copywriting in Progress",
      onboardingRoundId: "round-003",
      currentCopy: `**Fuel your body with what nature intended.**

Greenline Supplements uses only organic, sustainably sourced ingredients — no fillers, no artificial anything.

- 100% organic, third-party tested
- Subscription plans with free shipping
- 30-day money-back guarantee

**Clean supplements for a cleaner you.**

[Shop Greenline →]`,
      copyVersion: 2,
      revisionNotes:
        "Love the direction but can we emphasize the science behind our formulations? Also mention our new protein line.",
      createdAt: new Date("2026-02-10T10:00:00Z"),
    },
    {
      id: "placement-003b",
      campaignId: "campaign-003",
      name: "Greenline 2201 — Secondary",
      type: "Secondary",
      publication: "Peak Money",
      scheduledDate: "2026-02-27",
      status: "Sent for Approval",
      onboardingRoundId: "round-003",
      currentCopy: `**Investing in your health pays the best dividends.**

Greenline Supplements delivers science-backed, organic nutrition straight to your door.

- Third-party tested for purity
- Subscribe & save 20%
- 30-day money-back guarantee

**Your body deserves better.** Try Greenline risk-free.

[Shop Now →]`,
      copyVersion: 1,
      createdAt: new Date("2026-02-10T12:00:00Z"),
    },
  ]);

  // ─── Copy Versions (revision history) ────────────────────
  console.log("Inserting copy versions...");
  await db.insert(schema.copyVersions).values([
    // placement-002a revision history
    {
      id: "cv-001",
      placementId: "placement-002a",
      version: 1,
      copyText: `**Need a doctor? Felix Health has you covered.**

Get connected with a licensed physician in minutes — anytime, anywhere.

- Virtual consultations 24/7
- Prescription delivery available
- Plans from $29/month

[Try Felix Health →]`,
      createdAt: new Date("2026-01-20T10:00:00Z"),
    },
    {
      id: "cv-002",
      placementId: "placement-002a",
      version: 2,
      copyText: `**Your doctor, on demand.**

Felix Health brings board-certified physicians to your phone. Consult, get prescriptions, and follow up — all from home.

- See a doctor in under 10 minutes
- Prescriptions delivered to your door
- No insurance required. Starting at $29/month

50,000+ patients already trust Felix Health.

[Start Your Free Trial →]`,
      revisionNotes:
        "Make it more personal and emphasize the trust factor. Add a stat about existing users.",
      createdAt: new Date("2026-01-25T14:00:00Z"),
    },
    // placement-003a revision history
    {
      id: "cv-003",
      placementId: "placement-003a",
      version: 1,
      copyText: `**Go green with your supplements.**

Greenline offers all-natural supplements for everyday wellness.

- Organic ingredients
- Free shipping on subscriptions
- Money-back guarantee

[Shop Now →]`,
      createdAt: new Date("2026-02-10T10:00:00Z"),
    },
  ]);

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
