import Link from "next/link";

const portalHomeLinks = [
  {
    label: "Felix Health — 2 campaigns",
    href: "/portal/abc123def456",
  },
  {
    label: "Greenline Supplements — 1 campaign",
    href: "/portal/xyz789ghj234",
  },
  {
    label: "Invalid portal ID → 404",
    href: "/portal/nonexistent",
  },
];

const campaignLinks = [
  {
    label: "Felix Health 1646 — Copy Ready (approve/revise)",
    href: "/portal/abc123def456/campaign-001",
  },
  {
    label: "Felix Health 1702 — Published (with stats + revision history)",
    href: "/portal/abc123def456/campaign-002",
  },
  {
    label: "Greenline Supplements 2201 — Revisions Requested",
    href: "/portal/xyz789ghj234/campaign-003",
  },
  {
    label: "Invalid client ID → 404",
    href: "/portal/nonexistent/campaign-001",
  },
  {
    label: "Invalid campaign ID → 404",
    href: "/portal/abc123def456/nonexistent",
  },
  {
    label: "Client/campaign mismatch → 404",
    href: "/portal/xyz789ghj234/campaign-001",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">
        Peak Client Portal
      </h1>
      <p className="mt-2 text-gray-600">Test links for development.</p>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">
        Dashboard (Phase 3)
      </h2>
      <div className="mt-3 space-y-3">
        <Link
          href="/dashboard"
          className="block rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50"
        >
          Internal Dashboard (password: see .env.local)
          <span className="ml-2 text-gray-400">&rarr;</span>
        </Link>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">
        Portal Home (Phase 2)
      </h2>
      <div className="mt-3 space-y-3">
        {portalHomeLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            {link.label}
            <span className="ml-2 text-gray-400">&rarr;</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-gray-900">
        Campaign Pages (Phase 1)
      </h2>
      <div className="mt-3 space-y-3">
        {campaignLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            {link.label}
            <span className="ml-2 text-gray-400">&rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
