"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BillingOnboarding, InvoiceCadence, InvoiceCadenceType } from "@/lib/types";

function InvoiceCadenceDetails({ cadence }: { cadence: BillingOnboarding["invoiceCadence"] }) {
  if (!cadence) return null;

  switch (cadence.type) {
    case "lump-sum":
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">Lump Sum</p>
          <p className="text-sm text-gray-600">
            ${cadence.totalAmount.toLocaleString()} &middot; {cadence.paymentTerms}
          </p>
        </div>
      );
    case "equal-monthly":
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">Equal Monthly</p>
          <p className="text-sm text-gray-600">
            ${cadence.totalAmount.toLocaleString()} total &middot; {cadence.numberOfMonths} months &middot; ${cadence.monthlyAmount.toLocaleString()}/mo
          </p>
        </div>
      );
    case "per-month-usage":
      return (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900">Per-Month Usage</p>
          <p className="text-sm text-gray-600">
            Billed per placement each month &middot; rates from ad line items
          </p>
        </div>
      );
  }
}

interface BillingDetailsProps {
  campaignId: string;
  billing: BillingOnboarding;
}

type CadenceSelection = InvoiceCadenceType | "";

export function BillingDetails({ campaignId, billing }: BillingDetailsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(
    billing.companyName || billing.poNumber || ""
  );
  const [billingContactName, setBillingContactName] = useState(
    billing.billingContactName || ""
  );
  const [billingContactEmail, setBillingContactEmail] = useState(
    billing.billingContactEmail || ""
  );
  const [billingAddress, setBillingAddress] = useState(
    billing.billingAddress || ""
  );
  const [specialInstructions, setSpecialInstructions] = useState(
    billing.specialInstructions || ""
  );

  const [cadenceType, setCadenceType] = useState<CadenceSelection>(
    billing.invoiceCadence?.type || ""
  );
  const [lumpSumAmount, setLumpSumAmount] = useState(
    billing.invoiceCadence?.type === "lump-sum"
      ? String(billing.invoiceCadence.totalAmount)
      : ""
  );
  const [paymentTerms, setPaymentTerms] = useState(
    billing.invoiceCadence?.type === "lump-sum"
      ? billing.invoiceCadence.paymentTerms
      : "net-30"
  );
  const [equalMonthlyTotal, setEqualMonthlyTotal] = useState(
    billing.invoiceCadence?.type === "equal-monthly"
      ? String(billing.invoiceCadence.totalAmount)
      : ""
  );
  const [equalMonthlyMonths, setEqualMonthlyMonths] = useState(
    billing.invoiceCadence?.type === "equal-monthly"
      ? String(billing.invoiceCadence.numberOfMonths)
      : ""
  );

  function toNumber(value: string): number | null {
    if (!value.trim()) return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    return n;
  }

  function buildCadence(): InvoiceCadence | undefined {
    if (cadenceType === "") return undefined;

    if (cadenceType === "per-month-usage") {
      return { type: "per-month-usage" };
    }

    if (cadenceType === "lump-sum") {
      const totalAmount = toNumber(lumpSumAmount) ?? 0;
      return {
        type: "lump-sum",
        totalAmount,
        paymentTerms: paymentTerms.trim() || "net-30",
      };
    }

    const totalAmount = toNumber(equalMonthlyTotal) ?? 0;
    const numberOfMonths = Math.max(1, Math.floor(toNumber(equalMonthlyMonths) ?? 1));
    return {
      type: "equal-monthly",
      totalAmount,
      numberOfMonths,
      monthlyAmount: numberOfMonths > 0 ? totalAmount / numberOfMonths : totalAmount,
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/update-billing-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          companyName,
          billingContactName,
          billingContactEmail,
          billingAddress,
          invoiceCadence: buildCadence(),
          specialInstructions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update billing details");
      }

      setEditing(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update billing details");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setCompanyName(billing.companyName || billing.poNumber || "");
    setBillingContactName(billing.billingContactName || "");
    setBillingContactEmail(billing.billingContactEmail || "");
    setBillingAddress(billing.billingAddress || "");
    setSpecialInstructions(billing.specialInstructions || "");
    setCadenceType(billing.invoiceCadence?.type || "");
    setLumpSumAmount(
      billing.invoiceCadence?.type === "lump-sum"
        ? String(billing.invoiceCadence.totalAmount)
        : ""
    );
    setPaymentTerms(
      billing.invoiceCadence?.type === "lump-sum"
        ? billing.invoiceCadence.paymentTerms
        : "net-30"
    );
    setEqualMonthlyTotal(
      billing.invoiceCadence?.type === "equal-monthly"
        ? String(billing.invoiceCadence.totalAmount)
        : ""
    );
    setEqualMonthlyMonths(
      billing.invoiceCadence?.type === "equal-monthly"
        ? String(billing.invoiceCadence.numberOfMonths)
        : ""
    );
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Billing Details</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500">Company Name</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Billing Contact</label>
            <input
              value={billingContactName}
              onChange={(e) => setBillingContactName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Billing Email</label>
            <input
              type="email"
              value={billingContactEmail}
              onChange={(e) => setBillingContactEmail(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Billing Address</label>
            <input
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500">Invoice Cadence</label>
            <select
              value={cadenceType}
              onChange={(e) => setCadenceType(e.target.value as CadenceSelection)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Not set</option>
              <option value="lump-sum">Lump Sum</option>
              <option value="equal-monthly">Equal Monthly</option>
              <option value="per-month-usage">Per-Month Usage</option>
            </select>
          </div>

          {cadenceType === "lump-sum" && (
            <>
              <div>
                <label className="block text-xs text-gray-500">Total Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lumpSumAmount}
                  onChange={(e) => setLumpSumAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Payment Terms</label>
                <input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}

          {cadenceType === "equal-monthly" && (
            <>
              <div>
                <label className="block text-xs text-gray-500">Total Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={equalMonthlyTotal}
                  onChange={(e) => setEqualMonthlyTotal(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Number of Months</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={equalMonthlyMonths}
                  onChange={(e) => setEqualMonthlyMonths(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500">
              Billing / Cadence Notes
            </label>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Billing Details</h3>
        <button
          onClick={() => setEditing(true)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          Edit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
        {(billing.companyName || billing.poNumber) && (
          <div>
            <p className="text-xs text-gray-500">Company Name</p>
            <p className="text-sm font-medium text-gray-900">
              {billing.companyName || billing.poNumber}
            </p>
          </div>
        )}
        {billing.billingContactName && (
          <div>
            <p className="text-xs text-gray-500">Billing Contact</p>
            <p className="text-sm font-medium text-gray-900">{billing.billingContactName}</p>
          </div>
        )}
        {billing.billingContactEmail && (
          <div>
            <p className="text-xs text-gray-500">Billing Email</p>
            <p className="text-sm font-medium text-gray-900">{billing.billingContactEmail}</p>
          </div>
        )}
        {billing.billingAddress && (
          <div>
            <p className="text-xs text-gray-500">Billing Address</p>
            <p className="text-sm font-medium text-gray-900">{billing.billingAddress}</p>
          </div>
        )}
        {billing.invoiceCadence && (
          <div>
            <p className="text-xs text-gray-500">Invoice Cadence</p>
            <InvoiceCadenceDetails cadence={billing.invoiceCadence} />
          </div>
        )}
      </div>

      {billing.specialInstructions && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">Billing / Cadence Notes</p>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {billing.specialInstructions}
          </p>
        </div>
      )}
    </div>
  );
}
