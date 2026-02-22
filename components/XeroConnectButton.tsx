"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface XeroConnectButtonProps {
  connected: boolean;
  tenantName?: string;
}

export function XeroConnectButton({
  connected,
  tenantName,
}: XeroConnectButtonProps) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnect, setShowDisconnect] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/xero/disconnect", { method: "POST" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDisconnecting(false);
      setShowDisconnect(false);
    }
  }

  if (connected) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDisconnect(!showDisconnect)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          {tenantName || "Xero Connected"}
        </button>

        {showDisconnect && (
          <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs text-gray-500">
              Disconnect Xero integration?
            </p>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="w-full rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <a
      href="/api/xero/connect"
      className="inline-flex items-center gap-2 rounded-lg bg-[#13B5EA] px-4 py-2 text-sm font-medium text-white hover:bg-[#0e9ac7]"
    >
      Connect to Xero
    </a>
  );
}
