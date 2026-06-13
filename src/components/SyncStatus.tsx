import React, { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

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
      <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-red-500/20">
        <CloudOff className="w-3 h-3" />
        <span>Offline</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-500/20">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>Syncing...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#34C759]/10 text-[#34C759] rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-[#34C759]/20">
      <div className="w-1.5 h-1.5 bg-[#34C759] rounded-full animate-pulse shadow-sm" />
      <span>Online</span>
    </div>
  );
};
