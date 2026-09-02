import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Image as ImageIcon,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { projectService } from "../../../services/projectService";
import { useProjectsQuery } from "../../../hooks/queries";
import { usePlan } from "../../../hooks/usePlan";
import { projectCapState } from "../../../lib/plans";
import { UserProfile } from "../../../types";
import { AddCapacityModal } from "../../../components/AddCapacityModal";
import { useTranslation, useL } from "../../../i18n";
import {
  WBS_TEMPLATES,
  planFromTemplate,
  templateTaskCount,
  templateCalendarDays,
} from "../../../lib/wbsTemplates";
import {
  listSavedTemplates,
  asTemplate,
  deleteTemplate,
  SavedWbsTemplate,
} from "../../../services/wbsTemplateService";
import { collection, doc, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { getProjectSubCollectionPath } from "../../../utils/projectPath";
import { confirmDialog, toast } from "../../../lib/feedback";

// Order the built-in groups the way a contractor would scan them.
const CATEGORY_ORDER = [
  "Residential",
  "Multi-storey",
  "Commercial",
  "Industrial",
  "Interior",
] as const;

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const { t } = useTranslation();
  const L = useL();
  // Optional WBS starter structure. "" = start with an empty breakdown.
  const [templateId, setTemplateId] = useState<string>("");
  // The org's own saved structures sit alongside the built-in starters, and
  // come first — a customer's real breakdown beats a generic one.
  const [saved, setSaved] = useState<SavedWbsTemplate[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    listSavedTemplates().then((rows) => { if (alive) setSaved(rows); });
    return () => { alive = false; };
  }, [isOpen]);
  const allTemplates = useMemo(
    () => [...saved.map(asTemplate), ...WBS_TEMPLATES],
    [saved],
  );

  const chosenTemplate = useMemo(
    () => allTemplates.find((x) => x.id === templateId) || null,
    [allTemplates, templateId],
  );

  // Saved templates need a way out, or the picker silently fills with junk.
  const removeSaved = async (savedId: string, name: string) => {
    if (!(await confirmDialog({ title: L(`Delete the template "${name}"? Projects already created from it are not affected.`, `"${name}" டெம்ப்ளேட்டை நீக்கவா? அதிலிருந்து ஏற்கனவே உருவாக்கின செயல்திட்டங்கள் பாதிக்கப்படாது.`) }))) return;
    try {
      await deleteTemplate(savedId);
      setSaved((rows) => rows.filter((r) => r.id !== savedId));
      setTemplateId((cur) => (cur === `saved:${savedId}` ? "" : cur));
    } catch {
      toast.error(L("Couldn't delete that template.", "அந்த டெம்ப்ளேட்டை நீக்க முடியல."));
    }
  };
  const [newProject, setNewProject] = useState({
    name: "",
    projectCode: "",
    description: "",
    startDate: "",
    endDate: "",
    status: "Planning",
    imageUrl: "",
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 900;
          const MAX_HEIGHT = 600;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0, width, height);
          setNewProject({
            ...newProject,
            imageUrl: canvas.toDataURL("image/jpeg", 0.82),
          });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const { data: projects = [] } = useProjectsQuery();
  const plan = usePlan();
  const [showCapacity, setShowCapacity] = useState(false);

  // The actual create. Called directly when within cap, or after the user adds
  // capacity (buys slots / upgrades) from the AddCapacityModal.
  // Write the chosen template's phases and tasks into the new project. Parents
  // are created first so each child can carry its parentId; everything goes in
  // one batch so a project is never left half-seeded.
  const seedWbs = async (projectId: string) => {
    const template = allTemplates.find((x) => x.id === templateId);
    if (!template) return;
    const start = newProject.startDate ? new Date(newProject.startDate) : new Date();
    const planned = planFromTemplate(template, isNaN(start.getTime()) ? new Date() : start);
    const path = getProjectSubCollectionPath(projectId, "tasks");
    const batch = writeBatch(db);
    const ids: string[] = planned.map(() => doc(collection(db, path)).id);
    planned.forEach((node, i) => {
      batch.set(doc(db, path, ids[i]), {
        projectId,
        parentId: node.parentIndex === -1 ? null : ids[node.parentIndex],
        name: node.name,
        type: node.type,
        phase: node.phase,
        startDate: node.startDate,
        endDate: node.endDate,
        duration: node.duration,
        progress: 0,
        status: "Pending",
        dependencies: [],
        budgetedCost: 0,
        createdAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  };

  const doCreate = async () => {
    const newId = await projectService.createProject(
      {
        ...newProject,
        strictDataEntry: true,
      },
      user.uid
    );
    if (newId && templateId) {
      try {
        await seedWbs(newId);
      } catch (err) {
        // The project exists either way — surface the seeding failure without
        // losing it, so the user can add the breakdown manually.
        console.error("WBS template seeding failed", err);
        toast.error(L(
          "The project was created, but the task breakdown could not be added. You can add it from the WBS tab.",
          "செயல்திட்டம் உருவாக்கப்பட்டது, ஆனா பணிப் பட்டியலைச் சேர்க்க முடியல. WBS தாவல்ல சேர்த்துக்கலாம்."
        ));
      }
    }

    setNewProject({
      name: "",
      projectCode: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "Planning",
      imageUrl: "",
    });
    onClose();
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) {
      toast.error("Please enter a workspace name.");
      return;
    }

    if (projects.some(p => p.name.trim().toLowerCase() === newProject.name.trim().toLowerCase())) {
      toast.info("A workspace with this name already exists.");
      return;
    }

    // Plan project-cap enforcement. Free is a hard cap (upgrade to add more);
    // a paid plan at its cap opens the Add-capacity modal (buy ₹99 slots or
    // upgrade) and creates the project once capacity is added.
    const cap = projectCapState(plan, projects.length);
    if (cap.capped && cap.atOrOver) {
      if (cap.isFree) {
        toast.info(`Your Free plan includes ${cap.included} project. Upgrade to a paid plan to add more projects.`,);
        return;
      }
      setShowCapacity(true);
      return;
    }

    await doCreate();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-onyx/60 backdrop-blur-md z-[100] flex items-center justify-center p-6"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onSubmit={handleCreateProject}
            className="soft-card w-full max-w-2xl rounded-[40px] p-6 md:p-12 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <div className="relative z-10 mb-12 flex justify-between items-start">
              <div>
                <h2 className="text-[34px] font-bold text-ink mb-2 tracking-tight">
                  {t("cpm.newWorkspace")}
                </h2>
                <p className="text-[17px] text-ink-muted font-medium">
                  {t("cpm.initParams")}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-3 hover:bg-panel rounded-full transition-colors text-ink-muted hover:text-ink"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  {t("cpm.workspaceName")}
                </label>
                <input
                  required
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition font-bold text-lg md:text-xl"
                  placeholder={t("cpm.workspacePlaceholder")}
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-ink-muted mb-2">
                  {t("cpm.projectCode")}
                </label>
                <input
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-3 md:p-4 focus:bg-surface outline-none apple-transition font-bold"
                  placeholder={t("cpm.projectCodePlaceholder")}
                  value={newProject.projectCode}
                  onChange={(e) =>
                    setNewProject({ ...newProject, projectCode: e.target.value })
                  }
                />
                <p className="text-[11px] text-ink-muted mt-1.5">
                  {t("cpm.projectCodeHint")}
                </p>
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  {t("cpm.projectImage")}
                </label>
                <div className="flex items-center gap-4">
                  {newProject.imageUrl ? (
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md flex-shrink-0">
                      <img
                        src={newProject.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-divider flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-6 h-6 text-ink-muted" />
                    </div>
                  )}
                  <label className="cursor-pointer bg-surface/50 border border-divider rounded-xl px-4 py-3 flex-1 flex items-center justify-center hover:bg-surface apple-transition text-sm font-bold text-ink">
                    <ImageIcon className="w-4 h-4 mr-2" /> {t("cpm.uploadIcon")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                  {newProject.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setNewProject({ ...newProject, imageUrl: "" })
                      }
                      className="p-3 text-danger hover:bg-danger/10 rounded-xl app-transition flex-shrink-0"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  {t("cpm.missionProfile")}
                </label>
                <textarea
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-medium"
                  rows={3}
                  placeholder={t("cpm.missionPlaceholder")}
                  value={newProject.description}
                  onChange={(e) =>
                    setNewProject({
                      ...newProject,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  {t("cpm.status")}
                </label>
                <select
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.status}
                  onChange={(e) =>
                    setNewProject({ ...newProject, status: e.target.value })
                  }
                >
                  <option value="Planning">{t("status.planning")}</option>
                  <option value="Active">{t("status.active")}</option>
                  <option value="On Hold">{t("status.onHold")}</option>
                  <option value="Completed">{t("status.completed")}</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink ml-1">
                  {t("cpm.commencement")}
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.startDate}
                  onChange={(e) =>
                    setNewProject({ ...newProject, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink ml-1">
                  {t("cpm.provisionalCompletion")}
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.endDate}
                  onChange={(e) =>
                    setNewProject({ ...newProject, endDate: e.target.value })
                  }
                />
              </div>
            </div>

            {/* WBS starter template — seeds the breakdown so a new project
                doesn't open empty. Every task stays editable afterwards. */}
            <div className="mt-8 relative z-10 space-y-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <label htmlFor="wbs-template" className="text-[13px] font-bold text-ink-muted ml-1">
                  {L("Start from a template", "டெம்ப்ளேட்டில் இருந்து தொடங்கு")}
                </label>
                <span className="text-[11px] text-ink-muted">
                  {L("Optional · every task stays editable", "விருப்பம் · எல்லா பணியும் மாற்றக்கூடியது")}
                </span>
              </div>

              <select
                id="wbs-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
              >
                <option value="">{L("Empty breakdown — build the WBS yourself", "காலி பட்டியல் — நீங்களே WBS உருவாக்குங்க")}</option>
                {saved.length > 0 && (
                  <optgroup label={L("Your saved templates", "உங்கள் சேமித்த டெம்ப்ளேட்கள்")}>
                    {saved.map((sv) => (
                      <option key={sv.id} value={`saved:${sv.id}`}>
                        {sv.name} — {sv.taskCount} {L("tasks", "பணிகள்")}
                      </option>
                    ))}
                  </optgroup>
                )}
                {CATEGORY_ORDER.map((cat) => {
                  const inCat = WBS_TEMPLATES.filter((x) => x.category === cat);
                  if (!inCat.length) return null;
                  return (
                    <optgroup key={cat} label={cat}>
                      {inCat.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} — {templateTaskCount(tpl)} {L("tasks", "பணிகள்")}, ~{templateCalendarDays(tpl)} {L("days", "நாட்கள்")}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>

              {/* What the chosen template will do, and a way to remove a saved one. */}
              {chosenTemplate && (
                <div className="flex items-start justify-between gap-3 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/25">
                  <p className="text-[12px] text-ink-muted">
                    {chosenTemplate.description}
                    <span className="block font-mono text-[11px] text-primary mt-1">
                      {L("Adds", "சேர்க்கும்")} {templateTaskCount(chosenTemplate)} {L("tasks", "பணிகள்")} · ~{templateCalendarDays(chosenTemplate)} {L("days", "நாட்கள்")}
                    </span>
                  </p>
                  {templateId.startsWith("saved:") && (
                    <button
                      type="button"
                      onClick={() => removeSaved(templateId.slice(6), chosenTemplate.name)}
                      className="text-[11px] font-bold text-ink-muted hover:text-danger apple-transition shrink-0"
                    >
                      {L("Delete", "நீக்கு")}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-6 mt-16 relative z-10">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 font-bold text-[17px] text-ink-muted hover:text-ink apple-transition"
              >
                {t("cpm.discard")}
              </button>
              <button
                type="submit"
                className="bg-onyx text-white px-10 py-4 rounded-3xl font-bold text-[17px] shadow-xl hover:bg-onyx/80 apple-transition"
              >
                {t("cpm.initProject")}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
      <AddCapacityModal
        isOpen={showCapacity}
        onClose={() => setShowCapacity(false)}
        onSuccess={doCreate}
      />
    </AnimatePresence>
  );
};

