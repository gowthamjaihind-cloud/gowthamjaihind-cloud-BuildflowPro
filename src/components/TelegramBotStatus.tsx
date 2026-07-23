import React, { useEffect, useState } from "react";
import { Send } from "lucide-react";

export const TelegramBotStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [botName, setBotName] = useState<string | null>(null);

  const checkBotStatus = async () => {
    try {
      const res = await fetch("/api/telegram-status");
      const data = await res.json();
      if (data && data.online === true) {
        setIsOnline(true);
        if (data.bot?.first_name || data.bot?.username) {
          setBotName(data.bot.username ? `@${data.bot.username}` : data.bot.first_name);
        }
      } else {
        setIsOnline(false);
      }
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    checkBotStatus();
    const interval = setInterval(checkBotStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  if (isOnline === null) {
    return (
      <div
        id="telegram-bot-status-indicator"
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-panel text-ink-muted rounded-full text-[11px] font-bold tracking-wide border border-divider shadow-sm"
        title="Checking Telegram Bot status..."
      >
        <Send className="w-3 h-3 animate-pulse text-ink-muted" />
        <span className="text-[11px] font-bold">Bot Checking...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        id="telegram-bot-status-indicator"
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-500/10 text-rose-600 rounded-full text-[11px] font-bold tracking-wide border border-rose-500/20 shadow-sm"
        title="Telegram Bot Disconnected / Offline"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
        <span className="text-[11px] font-bold">Bot Offline</span>
      </div>
    );
  }

  return (
    <div
      id="telegram-bot-status-indicator"
      className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-[#0088cc]/10 text-[#0088cc] rounded-full text-[11px] font-bold tracking-wide border border-[#0088cc]/20 shadow-sm"
      title={botName ? `Telegram Bot Connected (${botName})` : "Telegram Bot Connected & Active"}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34C759] opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#34C759]" />
      </span>
      <span className="text-[11px] font-bold">Bot Online</span>
    </div>
  );
};
