import React, { useEffect, useState } from "react";
import {
  ArrowsClockwise as RefreshCw,
} from "@phosphor-icons/react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Tooltip } from "./Tooltip";

export const SyncStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const isSyncing = isFetching > 0 || isMutating > 0;

  if (!isOnline) {
    return (
      <Tooltip label="Network Disconnected (Offline)">
        <div
          id="network-status-indicator"
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-500/10 text-danger rounded-full text-[10px] font-bold tracking-wide border border-rose-500/20 shadow-sm"
         
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
          </span>
          <span className="text-[10px] font-bold">Offline</span>
        </div>
      </Tooltip>
    );
  }

  if (isSyncing) {
    return (
      <Tooltip label="Syncing with cloud...">
        <div
          id="network-status-indicator"
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-primary/10 text-primary rounded-full text-[10px] font-bold tracking-wide border border-primary/20 shadow-sm"
         
        >
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span className="hidden sm:inline text-[10px] font-bold">Syncing</span>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip label="Network Connected (Online)">
      <div
        id="network-status-indicator"
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-success/10 text-success rounded-full text-[10px] font-bold tracking-wide border border-success/20 shadow-sm"
       
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
        </span>
        <span className="text-[10px] font-bold">Online</span>
      </div>
    </Tooltip>
  );
};

