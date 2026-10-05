import React, { useEffect, useState } from "react";
import {
  PaperPlaneTilt as Send,
} from "@phosphor-icons/react";
import { demoRequested } from "../demo";
import { Tooltip } from "./Tooltip";

/**
 * "Bot Online" badge, for the Telegram settings panel.
 *
 * It used to live in Layout -- the shell around every screen -- and poll
 * /api/telegram-status every 15 seconds. That is 240 requests an hour and about
 * 175,000 a month FOR EVERY OPEN TAB, each one also making an outbound call to
 * api.telegram.org, on a product with no customers yet. It is also what the
 * webhook function's minInstances: 1 was there to serve, which reserved a Cloud
 * Run instance around the clock.
 *
 * So it checks ONCE when it mounts, and offers a refresh. The thing it reports
 * changes approximately never -- the bot is up unless the token is revoked or a
 * deploy broke -- and the one place anyone needs to know is the screen where
 * they set Telegram up.
 */
export const TelegramBotStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

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
  }, []);

  const refresh = async () => {
    setChecking(true);
    await checkBotStatus();
    setChecking(false);
  };

  if (isOnline === null) {
    return (
      <Tooltip label="Checking Telegram Bot status...">
        <div
          id="telegram-bot-status-indicator"
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-panel text-ink-muted rounded-full text-[10px] font-bold tracking-wide border border-divider shadow-sm"
         
        >
          <Send className="w-3 h-3 animate-pulse text-ink-muted" />
          <span className="text-[10px] font-bold">Bot Checking...</span>
        </div>
      </Tooltip>
    );
  }

  if (!isOnline) {
    return (
      <Tooltip label="Telegram bot offline — tap to re-check">
        <button
          type="button"
          onClick={refresh}
          disabled={checking}
          aria-label="Re-check Telegram bot status"
          id="telegram-bot-status-indicator"
          className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-500/10 text-danger rounded-full text-[10px] font-bold tracking-wide border border-rose-500/20 shadow-sm disabled:opacity-60"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-danger" />
          </span>
          <span className="text-[10px] font-bold">Bot Offline</span>
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={botName ? `Telegram bot connected (${botName}) — tap to re-check` : "Telegram bot connected — tap to re-check"}>
      <button
        type="button"
        onClick={refresh}
        disabled={checking}
        aria-label="Re-check Telegram bot status"
        id="telegram-bot-status-indicator"
        className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-success/12 text-success rounded-full text-[10px] font-bold tracking-wide border border-success/25 shadow-sm disabled:opacity-60"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
        </span>
        <span className="text-[10px] font-bold">Bot Online</span>
      </button>
    </Tooltip>
  );
};
