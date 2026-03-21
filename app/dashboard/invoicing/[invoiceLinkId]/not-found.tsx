import Link from "next/link";

export default function InvoiceNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Invoice not found</h1>
      <p className="mt-2 text-sm text-gray-500">
        This invoice link does not exist or is no longer available.
      </p>
      <Link
        href="/dashboard/invoicing"
        className="mt-6 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Back to Invoicing
      </Link>
    </div>
  );
}
