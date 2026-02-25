import Link from "next/link";
import Image from "next/image";

export function BrandMark() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm hover:bg-gray-50"
    >
      <Image
        src="/brand/peak-binoculars.svg"
        alt="The Peak logo"
        width={28}
        height={28}
        className="h-7 w-7"
      />
      <span className="text-sm font-semibold text-gray-900">Peak Portal</span>
    </Link>
  );
}
