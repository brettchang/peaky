import { PerformanceStats as Stats } from "@/lib/types";

export function PerformanceStats({ stats }: { stats: Stats }) {
  const rows: { label: string; value: string }[] = [];

  if (stats.totalSends != null)
    rows.push({ label: "Total Sends", value: stats.totalSends.toLocaleString() });
  if (stats.openRate != null)
    rows.push({ label: "Open Rate", value: `${stats.openRate}%` });
  if (stats.totalOpens != null)
    rows.push({ label: "Total Newsletter Opens", value: stats.totalOpens.toLocaleString() });
  if (stats.uniqueOpens != null)
    rows.push({ label: "Unique Newsletter Opens", value: stats.uniqueOpens.toLocaleString() });
  if (stats.totalClicks != null)
    rows.push({ label: "Total Clicks", value: stats.totalClicks.toLocaleString() });
  if (stats.uniqueClicks != null)
    rows.push({ label: "Unique Clicks", value: stats.uniqueClicks.toLocaleString() });

  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-2.5 font-medium text-gray-500">Metric</th>
            <th className="px-4 py-2.5 text-right font-medium text-gray-500">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-2.5 text-gray-700">{row.label}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
