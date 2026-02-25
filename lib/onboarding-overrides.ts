export interface OnboardingOverrideEntry {
  reason: string;
  overriddenAt: string;
}

export interface CampaignOnboardingOverrides {
  rounds: Record<string, OnboardingOverrideEntry>;
  billing?: OnboardingOverrideEntry;
}

export function onboardingOverridesSettingKey(campaignId: string): string {
  return `dashboard.onboarding-overrides.${campaignId}`;
}

export function parseCampaignOnboardingOverrides(
  raw: string | null
): CampaignOnboardingOverrides {
  if (!raw) return { rounds: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<CampaignOnboardingOverrides>;
    const rounds =
      parsed.rounds && typeof parsed.rounds === "object"
        ? Object.entries(parsed.rounds).reduce<Record<string, OnboardingOverrideEntry>>(
            (acc, [roundId, entry]) => {
              if (
                entry &&
                typeof entry === "object" &&
                typeof (entry as OnboardingOverrideEntry).reason === "string" &&
                typeof (entry as OnboardingOverrideEntry).overriddenAt === "string"
              ) {
                acc[roundId] = {
                  reason: (entry as OnboardingOverrideEntry).reason,
                  overriddenAt: (entry as OnboardingOverrideEntry).overriddenAt,
                };
              }
              return acc;
            },
            {}
          )
        : {};

    const billing =
      parsed.billing &&
      typeof parsed.billing.reason === "string" &&
      typeof parsed.billing.overriddenAt === "string"
        ? {
            reason: parsed.billing.reason,
            overriddenAt: parsed.billing.overriddenAt,
          }
        : undefined;

    return { rounds, billing };
  } catch {
    return { rounds: {} };
  }
}

export function serializeCampaignOnboardingOverrides(
  data: CampaignOnboardingOverrides
): string {
  return JSON.stringify(data);
}
