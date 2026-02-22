import { CopyVersion } from "@/lib/types";
import { formatCopy } from "@/lib/format-copy";

export function RevisionHistory({ versions }: { versions: CopyVersion[] }) {
  if (versions.length === 0) return null;

  return (
    <div className="mt-8">
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700">
          <span className="group-open:hidden">
            Show revision history ({versions.length} previous{" "}
            {versions.length === 1 ? "version" : "versions"})
          </span>
          <span className="hidden group-open:inline">
            Hide revision history
          </span>
        </summary>
        <div className="mt-4 space-y-6">
          {[...versions].reverse().map((v) => (
            <div
              key={v.version}
              className="rounded-lg border border-gray-200 bg-gray-50 p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Version {v.version}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(v.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {v.revisionNotes && (
                <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <span className="font-medium">Revision notes:</span>{" "}
                  {v.revisionNotes}
                </div>
              )}
              <div className="prose prose-sm max-w-none text-gray-600">
                {formatCopy(v.copyText)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
