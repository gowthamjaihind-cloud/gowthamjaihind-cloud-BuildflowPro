import React, { useEffect, useRef, useState } from "react";
import { UploadSimple, Trash, FloppyDisk } from "@phosphor-icons/react";
import { useCompanyProfile } from "../../hooks/useCompanyProfile";
import { useOrgSettings } from "../../hooks/useOrgSettings";
import { useAuthStore } from "../../store";
import { logoToDataUrl } from "../../lib/logoImage";
import { toast } from "../../lib/feedback";
import type { CompanyProfile } from "../../types";

/**
 * Settings → Organisation → Company details.
 *
 * The address, contact details, PAN, logo and standard terms that are printed
 * on the company's purchase orders. Before this a PO could only say the
 * vendor's name and a total: there was nowhere to keep the buyer's own
 * letterhead.
 */

const FIELDS: Array<{ key: keyof CompanyProfile; label: string; placeholder: string; wide?: boolean; max: number }> = [
  { key: "addressLine1", label: "Address line 1", placeholder: "Building, street", wide: true, max: 120 },
  { key: "addressLine2", label: "Address line 2", placeholder: "Area, landmark (optional)", wide: true, max: 120 },
  { key: "city", label: "City", placeholder: "City", max: 60 },
  { key: "state", label: "State", placeholder: "State", max: 60 },
  { key: "pincode", label: "PIN code", placeholder: "6 digits", max: 6 },
  { key: "phone", label: "Phone", placeholder: "Office or mobile number", max: 20 },
  { key: "email", label: "Email", placeholder: "accounts@yourcompany.com", max: 120 },
  { key: "website", label: "Website", placeholder: "Optional", max: 120 },
  { key: "pan", label: "PAN", placeholder: "e.g. ABCDE1234F", max: 10 },
];

export const CompanyProfilePanel: React.FC = () => {
  const { profile, loading, save } = useCompanyProfile();
  const { settings: org } = useOrgSettings();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "Owner" || role === "Admin";
  const [draft, setDraft] = useState<CompanyProfile>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(profile), [profile]);

  const set = (key: keyof CompanyProfile, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      set("logo", await logoToDataUrl(file));
    } catch (err: any) {
      toast.error(err?.message || "Couldn't use that image.");
    }
  };

  const submit = async () => {
    const pin = String(draft.pincode || "").trim();
    if (pin && !/^[1-9][0-9]{5}$/.test(pin)) return toast.error("A PIN code is 6 digits.");
    const pan = String(draft.pan || "").trim().toUpperCase();
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return toast.error("A PAN is 10 characters, like ABCDE1234F.");
    const email = String(draft.email || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email address.");
    const phone = String(draft.phone || "").trim();
    if (phone && (!/^[+()\d\s-]+$/.test(phone) || phone.replace(/\D/g, "").length < 10)) return toast.error("Enter a valid phone number (at least 10 digits).");
    setSaving(true);
    try {
      await save({ ...draft, pan: pan || undefined });
      toast.success("Company details saved. They will appear on your purchase orders.");
    } catch (err: any) {
      toast.error(err?.code === "permission-denied" ? "Only an Owner or Admin can change company details." : "Couldn't save company details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full bg-surface border border-divider px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-ink disabled:opacity-60";

  return (
    <section className="soft-card p-8 squircle-24">
      <h3 className="text-xl font-bold text-ink mb-1">{"Company details for documents"}</h3>
      <p className="text-ink-muted text-sm mb-6">
        {"Your logo, address and contact details. They are printed at the top of every purchase order you raise."}
      </p>
      {loading ? (
        <p className="text-sm text-ink-muted">{"Loading…"}</p>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-ink mb-2">{"Logo"}</label>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-48 h-24 rounded-xl border border-divider bg-white flex items-center justify-center overflow-hidden">
                {draft.logo ? (
                  <img src={draft.logo} alt="Company logo" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-xs text-ink-muted">{"No logo yet"}</span>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickLogo} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-panel border border-divider text-ink hover:bg-surface apple-transition">
                    <UploadSimple className="w-4 h-4" /> {draft.logo ? "Replace logo" : "Upload logo"}
                  </button>
                  {draft.logo && (
                    <button type="button" onClick={() => set("logo", "")} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-ink-muted hover:text-danger apple-transition">
                      <Trash className="w-4 h-4" /> {"Remove"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="text-[11px] text-ink-muted mt-1.5">{"PNG or JPG. A wide logo on a white or transparent background prints best. It is resized automatically."}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-ink mb-2">{"Company name and GSTIN"}</label>
              <p className="text-sm text-ink bg-panel border border-divider px-4 py-3 rounded-xl">
                <b>{org.companyName || "No company name set"}</b>
                {org.gstin ? ` · GSTIN ${org.gstin}` : " · no GSTIN set"}
                <span className="text-ink-muted">{" · change these in the section above"}</span>
              </p>
            </div>
            {FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
                <label className="block text-sm font-semibold text-ink mb-2">{f.label}</label>
                <input
                  type="text"
                  value={(draft[f.key] as string) || ""}
                  onChange={(e) => set(f.key, f.key === "pan" ? e.target.value.toUpperCase() : e.target.value)}
                  maxLength={f.max}
                  placeholder={f.placeholder}
                  disabled={!canEdit}
                  className={`${input} ${f.key === "pan" || f.key === "pincode" ? "font-mono" : ""}`}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-ink mb-2">{"Standard terms on purchase orders"}</label>
              <textarea
                value={draft.poTerms || ""}
                onChange={(e) => set("poTerms", e.target.value)}
                maxLength={1200}
                rows={4}
                disabled={!canEdit}
                placeholder={"Optional. For example: payment within 30 days of delivery; material to match the approved sample; quote the PO number on every invoice."}
                className={input}
              />
              <p className="text-[11px] text-ink-muted mt-1.5">{"Printed at the foot of every purchase order. One term per line."}</p>
            </div>
          </div>

          {canEdit ? (
            <div className="pt-4 border-t border-surface-dark/5">
              <button onClick={submit} disabled={saving} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-primary-deep transition-colors disabled:opacity-60">
                <FloppyDisk className="w-5 h-5" /> {saving ? "Saving…" : "Save company details"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{"Only an Owner or Admin can change these details."}</p>
          )}
        </div>
      )}
    </section>
  );
};

export default CompanyProfilePanel;
