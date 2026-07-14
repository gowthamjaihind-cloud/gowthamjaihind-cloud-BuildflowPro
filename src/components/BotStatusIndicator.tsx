import React, { useEffect, useState } from "react";
import { Bot, CheckCircle2, AlertCircle, Activity } from "lucide-react";

export function BotStatusIndicator() {
  const [status, setStatus] = useState<{
    active: boolean;
    webhook: string;
  } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // General Bot Status Check
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/health");
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setStatus({
            active: data.botActive,
            webhook: data.webhookStatus || "unknown",
          });
        }
      } catch (e) {
        console.warn("Silent: Failed to fetch bot status");
      }
    };

    fetchStatus();
    // Reduce frequency of health check that re-registers the webhook (from 30s to 60s)
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Performance Hook for RTT
  useEffect(() => {
    const pingBot = async () => {
      if (!status?.active) return;
      try {
        const start = Date.now();
        const res = await fetch("/api/bot-ping");
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
          const data = await res.json();
          // Use the exact Telegram API RTT returned by the server, fallback to fetch time if unavailable
          const fetchRtt = Date.now() - start;
          setLatency(data.rtt !== undefined ? data.rtt : fetchRtt);
        } else {
          // If the ping fails, leave latency as is (or clear it depending on preference)
          console.warn(
            "Silent: Failed to ping bot for latency (invalid response)",
          );
        }
      } catch (e) {
        console.warn("Silent: Bot ping error");
      }
    };

    if (status?.active) {
      pingBot();
      const interval = setInterval(pingBot, 10000); // Ping every 10s
      return () => clearInterval(interval);
    }
  }, [status?.active]);

  if (!status || !status.active) return null;

  const isConnected = status.webhook === "registered";
  const isHighLatency = latency !== null && latency > 1000;
  const isMediumLatency = latency !== null && latency > 400 && latency <= 1000;

  let containerClass = "bg-primary/10 text-primary border-primary/20";
  if (!isConnected) {
    containerClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  } else if (isHighLatency) {
    containerClass = "bg-red-500/10 text-red-500 border-red-500/20";
  } else if (isMediumLatency) {
    containerClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }

  return (
    <div
      className={`hidden md:flex items-center gap-2 sm:gap-3 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] border transition-all duration-500 ease-in-out ${containerClass}`}
      title={
        isConnected
          ? `Telegram Bot Connected (RTT: ${latency || "?"}ms)`
          : `Bot connection issue: ${status.webhook}`
      }
    >
      {isConnected && !isHighLatency && !isMediumLatency ? (
        <Bot className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
      ) : isConnected && (isHighLatency || isMediumLatency) ? (
        <Activity
          className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${isHighLatency ? "animate-pulse" : ""}`}
        />
      ) : (
        <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 shrink-0 animate-pulse" />
      )}
      <div className="hidden lg:flex items-center gap-2">
        <span>
          Bot {!isConnected ? "Error" : isHighLatency ? "Lagging" : "Active"}
        </span>
        {latency !== null && isConnected && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-[4px] bg-black/5 opacity-80">
            {latency}ms
          </span>
        )}
      </div>
    </div>
  );
}
