"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BillingOnboardingFormProps {
  campaignId: string;
  clientPortalId: string;
  complete: boolean;
  initialPrimaryContactName?: string;
  initialPrimaryContactEmail?: string;
  initialRepresentingClient?: boolean;
  initialWantsPeakCopy?: boolean;
  initialCompanyName?: string;
  initialBillingAddress?: string;
  initialBillingContactName?: string;
  initialBillingContactEmail?: string;
  initialSpecificInvoicingInstructions?: string;
}

export function BillingOnboardingForm({
  campaignId,
  clientPortalId,
  complete,
  initialPrimaryContactName,
  initialPrimaryContactEmail,
  initialRepresentingClient,
  initialWantsPeakCopy,
  initialCompanyName,
  initialBillingAddress,
  initialBillingContactName,
  initialBillingContactEmail,
  initialSpecificInvoicingInstructions,
}: BillingOnboardingFormProps) {
  const router = useRouter();
  const [primaryContactName, setPrimaryContactName] = useState(
    initialPrimaryContactName || ""
  );
  const [primaryContactEmail, setPrimaryContactEmail] = useState(
    initialPrimaryContactEmail || ""
  );
  const [representingClient, setRepresentingClient] = useState<boolean>(
    initialRepresentingClient ?? false
  );
  const [wantsPeakCopy, setWantsPeakCopy] = useState<boolean>(
    initialWantsPeakCopy ?? true
  );
  const [companyName, setCompanyName] = useState(initialCompanyName || "");
  const [billingAddress, setBillingAddress] = useState(initialBillingAddress || "");
  const [billingContactName, setBillingContactName] = useState(
    initialBillingContactName || ""
  );
  const [billingContactEmail, setBillingContactEmail] = useState(
    initialBillingContactEmail || ""
  );
  const [specificInvoicingInstructions, setSpecificInvoicingInstructions] =
    useState(initialSpecificInvoicingInstructions || "");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submittedNow, setSubmittedNow] = useState(false);

  const isReadOnly = complete || submittedNow;

  function getPayload() {
    return {
      campaignId,
      portalId: clientPortalId,
      primaryContactName,
      primaryContactEmail,
      representingClient,
      wantsPeakCopy,
      companyName,
      billingAddress,
      billingContactName,
      billingContactEmail,
      specificInvoicingInstructions,
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const res = await fetch("/api/save-billing-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSavedMessage("Draft saved successfully.");
      router.refresh();
      setTimeout(() => setSavedMessage(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const requiredFields = [
      primaryContactName,
      primaryContactEmail,
      companyName,
      billingAddress,
      billingContactName,
      billingContactEmail,
    ];
    if (requiredFields.some((field) => !field.trim())) {
      setError("Please complete all required fields before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit-billing-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getPayload()),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      setSubmittedNow(true);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-10 rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Billing Onboarding</h2>
      <p className="mt-1 text-sm text-gray-500">
        Share campaign and invoicing details so we can set up your IO and billing.
      </p>

      {isReadOnly && (
        <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">
            Billing onboarding has been submitted.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Field label="Who is the primary contact for this campaign?" required>
          <input
            value={primaryContactName}
            onChange={(e) => setPrimaryContactName(e.target.value)}
            readOnly={isReadOnly}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <Field label="What's the primary contact's email?" required>
          <input
            type="email"
            value={primaryContactEmail}
            onChange={(e) => setPrimaryContactEmail(e.target.value)}
            readOnly={isReadOnly}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <YesNoField
          label="Are you representing a client?"
          value={representingClient}
          onChange={setRepresentingClient}
          readOnly={isReadOnly}
        />

        <YesNoField
          label="Would you like for us to produce the copy?"
          value={wantsPeakCopy}
          onChange={setWantsPeakCopy}
          readOnly={isReadOnly}
        />

        <h3 className="pt-2 text-sm font-semibold text-gray-700">Billing Information</h3>

        <Field
          label="What full company name should we use on the IO and invoice?"
          required
        >
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            readOnly={isReadOnly}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <Field
          label="What address should we use on the IO and invoice?"
          required
        >
          <textarea
            value={billingAddress}
            onChange={(e) => setBillingAddress(e.target.value)}
            readOnly={isReadOnly}
            rows={3}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <Field label="Who's the appropriate billing contact?" required>
          <input
            value={billingContactName}
            onChange={(e) => setBillingContactName(e.target.value)}
            readOnly={isReadOnly}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <Field label="What's the billing contact's email?" required>
          <input
            type="email"
            value={billingContactEmail}
            onChange={(e) => setBillingContactEmail(e.target.value)}
            readOnly={isReadOnly}
            className={inputClassName(isReadOnly)}
          />
        </Field>

        <Field label="Do you have any specific invoicing instructions?">
          <textarea
            value={specificInvoicingInstructions}
            onChange={(e) => setSpecificInvoicingInstructions(e.target.value)}
            readOnly={isReadOnly}
            rows={4}
            className={inputClassName(isReadOnly)}
          />
        </Field>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {savedMessage && <p className="mt-4 text-sm text-green-600">{savedMessage}</p>}

      {!isReadOnly && (
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || submitting}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || submitting}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <p className="mb-2 block text-sm font-medium text-gray-700">{label}</p>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={value}
            onChange={() => onChange(true)}
            disabled={readOnly}
          />
          Yes
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            checked={!value}
            onChange={() => onChange(false)}
            disabled={readOnly}
          />
          No
        </label>
      </div>
    </div>
  );
}

function inputClassName(readOnly: boolean): string {
  return `w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none ${
    readOnly
      ? "border-gray-100 bg-gray-50 text-gray-600"
      : "border-gray-300 bg-white"
  }`;
}
