import React, { useEffect, useState } from "react";
import { Plus, Trash as Trash2, PencilSimple, Truck, TreeStructure, CircleNotch } from "@phosphor-icons/react";
import {
  listMasterVendors,
  saveMasterVendor,
  deleteMasterVendor,
  findDuplicates,
  MasterVendor,
} from "../../services/masterVendorService";
import {
  listSavedTemplates,
  deleteTemplate,
  SavedWbsTemplate,
} from "../../services/wbsTemplateService";
import { useL } from "../../i18n";

// Organisation master data. These records are shared by every project, so they
// belong with the organisation's settings rather than inside one project.
// Projects consume them (e.g. "From master" on the Parties screen); this is
// where they are created and maintained.

type Tab = "vendors" | "templates";

const emptyVendor = {
  name: "",
  type: "Material" as MasterVendor["type"],
  gstin: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
};

export const MastersPanel: React.FC = () => {
  const L = useL();
  const [tab, setTab] = useState<Tab>("vendors");

  const [vendors, setVendors] = useState<MasterVendor[]>([]);
  const [templates, setTemplates] = useState<SavedWbsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyVendor);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const [v, t] = await Promise.all([listMasterVendors(), listSavedTemplates()]);
    setVendors(v);
    setTemplates(t);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const startAdd = () => { setForm(emptyVendor); setEditingId(null); setShowForm(true); setError(null); };
  const startEdit = (v: MasterVendor) => {
    setForm({
      name: v.name || "", type: v.type || "Material", gstin: v.gstin || "",
      contactPerson: v.contactPerson || "", phone: v.phone || "",
      email: v.email || "", address: v.address || "",
    });
    setEditingId(v.id); setShowForm(true); setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(L("Enter a name.", "பெயரைக் கொடுங்க."));
      return;
    }
    // Only warn about duplicates when adding — editing an existing record will
    // naturally match itself.
    if (!editingId) {
      const dupes = findDuplicates(form, vendors);
      if (dupes.length && !window.confirm(
        L(`"${dupes[0].name}" already looks like the same party. Add "${form.name}" anyway?`,
          `"${dupes[0].name}" ஏற்கனவே இதே பார்ட்டி மாதிரி இருக்கு. இருந்தாலும் "${form.name}" சேர்க்கவா?`),
      )) return;
    }
    setBusy(true); setError(null);
    try {
      await saveMasterVendor(form, editingId || undefined);
      setShowForm(false);
      await reload();
    } catch (err: any) {
      setError(
        err?.code === "permission-denied"
          ? L("Only an Owner, Admin or Manager can change master data.", "உரிமையாளர், நிர்வாகி அல்லது மேலாளர் மட்டுமே மாற்ற முடியும்.")
          : L("Couldn't save. Please try again.", "சேமிக்க முடியல. மீண்டும் முயற்சிக்கவும்."),
      );
    } finally { setBusy(false); }
  };

  const removeVendor = async (v: MasterVendor) => {
    if (!window.confirm(L(
      `Delete "${v.name}" from your master list? Projects already using it keep their own copy and are not affected.`,
      `"${v.name}" ஐ மாஸ்டர் பட்டியலிலிருந்து நீக்கவா? ஏற்கனவே பயன்படுத்தும் செயல்திட்டங்கள் பாதிக்கப்படாது.`,
    ))) return;
    setBusy(true);
    try { await deleteMasterVendor(v.id); await reload(); }
    catch { setError(L("Couldn't delete.", "நீக்க முடியல.")); }
    finally { setBusy(false); }
  };

  const removeTemplate = async (t: SavedWbsTemplate) => {
    if (!window.confirm(L(
      `Delete the template "${t.name}"? Projects already created from it are not affected.`,
      `"${t.name}" டெம்ப்ளேட்டை நீக்கவா? அதிலிருந்து உருவாக்கின செயல்திட்டங்கள் பாதிக்கப்படாது.`,
    ))) return;
    setBusy(true);
    try { await deleteTemplate(t.id); await reload(); }
    catch { setError(L("Couldn't delete.", "நீக்க முடியல.")); }
    finally { setBusy(false); }
  };

  const field = "w-full bg-[#F0F3F4] dark:bg-panel p-3.5 rounded-xl font-medium outline-none border border-transparent focus:border-primary/40 apple-transition text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-black text-ink tracking-tight">
          {L("Master data", "மாஸ்டர் தரவு")}
        </h3>
        <p className="text-sm text-ink-muted mt-1">
          {L(
            "Created once here and reused on every project — so you don't retype the same parties and structures for each new site.",
            "இங்க ஒரு தடவை உருவாக்கினா, எல்லா செயல்திட்டத்திலும் பயன்படுத்தலாம் — ஒவ்வொரு சைட்டுக்கும் மறுபடி டைப் பண்ண வேணாம்.",
          )}
        </p>
      </div>

      <div className="flex gap-2">
        {([
          { id: "vendors" as Tab, label: L("Parties", "பார்ட்டிகள்"), icon: Truck, n: vendors.length },
          { id: "templates" as Tab, label: L("WBS templates", "WBS டெம்ப்ளேட்கள்"), icon: TreeStructure, n: templates.length },
        ]).map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold apple-transition ${
              tab === x.id ? "bg-primary text-white shadow-sm" : "bg-panel border border-divider text-ink-muted hover:text-ink"
            }`}
          >
            <x.icon className="w-4 h-4" /> {x.label} {x.n > 0 && `(${x.n})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-danger/8 text-danger rounded-xl border border-danger/20 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-ink-muted">
          <CircleNotch className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : tab === "vendors" ? (
        <div className="space-y-3">
          {!showForm && (
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-2 bg-surface-dark text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:opacity-90 apple-transition"
            >
              <Plus className="w-4 h-4" /> {L("Add party", "பார்ட்டி சேர்")}
            </button>
          )}

          {showForm && (
            <form onSubmit={submit} className="bg-panel border border-divider rounded-2xl p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={field} placeholder={L("Name *", "பெயர் *")} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <select className={field} value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as MasterVendor["type"] })}>
                  <option value="Material">{L("Material supplier", "பொருள் சப்ளையர்")}</option>
                  <option value="Labor">{L("Labour contractor", "தொழிலாளர் ஒப்பந்தக்காரர்")}</option>
                  <option value="Both">{L("Both", "இரண்டும்")}</option>
                </select>
                <input className={field} placeholder="GSTIN" value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                <input className={field} placeholder={L("Contact person", "தொடர்பு நபர்")} value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                <input className={field} placeholder={L("Phone", "ஃபோன்")} value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className={field} placeholder={L("Email", "மின்னஞ்சல்")} value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <input className={field} placeholder={L("Address", "முகவரி")} value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 text-xs font-bold text-ink-muted hover:text-ink apple-transition">
                  {L("Cancel", "ரத்து")}
                </button>
                <button type="submit" disabled={busy}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">
                  {busy ? L("Saving…", "சேமிக்கிறது…") : editingId ? L("Update", "புதுப்பி") : L("Save", "சேமி")}
                </button>
              </div>
            </form>
          )}

          {vendors.length === 0 && !showForm ? (
            <p className="text-sm text-ink-muted py-8 text-center">
              {L(
                "No parties yet. Add one here, or use the bookmark icon on a project's Parties screen to lift an existing one up.",
                "இன்னும் பார்ட்டி இல்ல. இங்க சேருங்க, அல்லது செயல்திட்டத்தின் பார்ட்டி திரையில் புக்மார்க் ஐகானைப் பயன்படுத்துங்க.",
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {vendors.map((v) => (
                <div key={v.id} className="bg-panel border border-divider rounded-2xl p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-ink text-sm">{v.name}</p>
                      <span className="text-[9px] font-black uppercase tracking-wider text-ink-muted">{v.type}</span>
                    </div>
                    <p className="text-[12px] text-ink-muted mt-0.5 break-words">
                      {[v.phone, v.gstin, v.contactPerson, v.address].filter(Boolean).join(" · ") ||
                        L("No contact details", "தொடர்பு விவரம் இல்ல")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(v)} disabled={busy}
                      className="p-2 text-ink-muted hover:text-primary apple-transition disabled:opacity-40"
                      title={L("Edit", "திருத்து")}>
                      <PencilSimple className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeVendor(v)} disabled={busy}
                      className="p-2 text-ink-muted hover:text-danger apple-transition disabled:opacity-40"
                      title={L("Delete", "நீக்கு")}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <p className="text-sm text-ink-muted py-8 text-center">
              {L(
                "No saved templates yet. Open a project's WBS and use the bookmark icon to save its breakdown for reuse.",
                "இன்னும் சேமித்த டெம்ப்ளேட் இல்ல. ஒரு செயல்திட்டத்தின் WBS ல புக்மார்க் ஐகானைப் பயன்படுத்திச் சேமிக்கவும்.",
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {templates.map((t) => (
                <div key={t.id} className="bg-panel border border-divider rounded-2xl p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-ink text-sm">{t.name}</p>
                    <p className="text-[12px] text-ink-muted mt-0.5">
                      {t.taskCount} {L("tasks", "பணிகள்")}
                      {t.savedFromProjectName ? ` · ${L("from", "இதிலிருந்து")} ${t.savedFromProjectName}` : ""}
                    </p>
                  </div>
                  <button onClick={() => removeTemplate(t)} disabled={busy}
                    className="p-2 text-ink-muted hover:text-danger apple-transition shrink-0 disabled:opacity-40"
                    title={L("Delete", "நீக்கு")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MastersPanel;
