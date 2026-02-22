import { BillingOnboarding } from "@/lib/types";

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

export function BillingDetails({ billing }: { billing: BillingOnboarding }) {
  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white px-6 py-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-700">Billing Details</h3>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
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
        {billing.poNumber && (
          <div>
            <p className="text-xs text-gray-500">PO Number</p>
            <p className="text-sm font-medium text-gray-900">{billing.poNumber}</p>
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
          <p className="text-xs text-gray-500">Special Instructions</p>
          <p className="mt-1 text-sm text-gray-700">{billing.specialInstructions}</p>
        </div>
      )}
    </div>
  );
}
