import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200">404</h1>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          Placement not found
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          This placement doesn&apos;t exist. Please check the URL.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
