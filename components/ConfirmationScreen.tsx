export function ConfirmationScreen({
  type,
}: {
  type: "approved" | "revised" | "approved-with-edits";
}) {
  const headings: Record<typeof type, string> = {
    approved: "Copy Approved!",
    "approved-with-edits": "Edits Saved & Copy Approved!",
    revised: "Revision Notes Submitted!",
  };

  const messages: Record<typeof type, string> = {
    approved:
      "Your ad copy has been approved and will be scheduled for publishing. No further action is needed.",
    "approved-with-edits":
      "Your edits have been saved and the copy has been approved. It will be scheduled for publishing.",
    revised:
      "Your feedback has been received. Our team will review your notes and update the copy shortly.",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-6 w-6 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900">
        {headings[type]}
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        {messages[type]}
      </p>
    </div>
  );
}
