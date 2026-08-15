import React, { useState, useRef, useEffect } from "react";
import {
  Buildings,
  CaretDown,
  Check,
  CircleNotch as Loader2,
} from "@phosphor-icons/react";
import { useMyOrgs } from "../hooks/useMyOrgs";

// Dropdown to switch the active organization. Renders nothing unless the user
// belongs to more than one org, so single-org users never see clutter.
export const OrgSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { orgs, currentOrgId, loading, switching, switchTo } = useMyOrgs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (orgs.length <= 1) return null; // nothing to switch between

  const current = orgs.find((o) => o.orgId === currentOrgId);

  return (
    <div className={`relative ${className || ""}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-divider hover:bg-panel transition-colors text-sm font-semibold text-ink max-w-[220px]"
      >
        {switching ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Buildings className="w-4 h-4 text-primary shrink-0" />}
        <span className="truncate">{current?.name || "Organization"}</span>
        <CaretDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-surface border border-divider rounded-2xl shadow-xl z-[120] overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-muted border-b border-divider">
            Switch organization
          </div>
          {loading && (
            <div className="p-4 text-center text-ink-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            </div>
          )}
          {orgs.map((o) => (
            <button
              key={o.orgId}
              onClick={() => { setOpen(false); switchTo(o.orgId); }}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-panel transition-colors text-left"
            >
              <span className="truncate text-sm font-semibold text-ink">{o.name}</span>
              {o.orgId === currentOrgId && <Check weight="bold" className="w-4 h-4 text-[#059669] shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
