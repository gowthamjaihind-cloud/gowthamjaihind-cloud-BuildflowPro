import React, { useEffect, useState } from "react";
import {
  PaperPlaneTilt as Send,
} from "@phosphor-icons/react";
import { demoRequested } from "../demo";

export const TelegramBotStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [botName, setBotName] = useState<string | null>(null);

  const checkBotStatus = async () => {
    // The public demo has no functions backend, so the status probe falls
    // through to the SPA shell and the badge would sit red on the very
    // feature the product is sold on. Report the bot as up instead.
    if (__DEMO__ && demoRequested()) {
      setIsOnline(true);
      setBotName("@SitetruBot");
      return;
    }
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
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-panel text-ink-muted rounded-full text-[10px] font-bold tracking-wide border border-divider shadow-sm"
        title="Checking Telegram Bot status..."
      >
        <Send className="w-3 h-3 animate-pulse text-ink-muted" />
        <span className="text-[10px] font-bold">Bot Checking...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        id="telegram-bot-status-indicator"
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-500/10 text-danger rounded-full text-[10px] font-bold tracking-wide border border-rose-500/20 shadow-sm"
        title="Telegram Bot Disconnected / Offline"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
        </span>
        <span className="text-[10px] font-bold">Bot Offline</span>
      </div>
    );
  }

  return (
    <div
      id="telegram-bot-status-indicator"
      className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-[#56778E]/10 text-[#56778E] rounded-full text-[10px] font-bold tracking-wide border border-[#56778E]/20 shadow-sm"
      title={botName ? `Telegram Bot Connected (${botName})` : "Telegram Bot Connected & Active"}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
      </span>
      <span className="text-[10px] font-bold">Bot Online</span>
    </div>
  );
};
