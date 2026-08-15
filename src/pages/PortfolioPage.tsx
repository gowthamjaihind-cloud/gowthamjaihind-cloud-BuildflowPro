import React, { useState } from "react";
import { motion } from "motion/react";
import { CountUp, useCardTilt } from "../components/motion";
import {
  Plus,
  ArrowsClockwise,
  Trash,
  ArrowRight,
  GearSix,
  SignOut,
  Image as ImageIcon,
  PencilSimple,
  HardHat,
  Buildings,
} from "@phosphor-icons/react";
import { Project } from "../types";
import { useAuthStore, useProjectStore, useUIStore } from "../store";
import { useProjectsQuery } from "../hooks/queries";
import { CreateProjectModal } from "../features/projects/components/CreateProjectModal";
import { EditProjectModal } from "../features/projects/components/EditProjectModal";
import { SyncStatus } from "../components/SyncStatus";
import { TelegramBotStatus } from "../components/TelegramBotStatus";
import { OrgSwitcher } from "../components/OrgSwitcher";

const statusPillClasses = (status?: string) => {
  switch (status) {
    case "Active":
      return "text-success bg-success/15 dark:text-success dark:bg-success/10";
    case "On Hold":
      return "text-[#B85F3B] bg-primary/12 dark:text-[#E29677] dark:bg-primary/15";
    case "Completed":
      return "text-ink-muted bg-[#6E8CA0]/12";
    default:
      return "text-primary bg-primary/10";
  }
};

export const PortfolioPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data: projects = [] } = useProjectsQuery();
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const updateProjectImage = useProjectStore(
    (state) => state.updateProjectImage,
  );

  const isCreatingProject = useUIStore((state) => state.isCreatingProject);
  const setIsCreatingProject = useUIStore(
    (state) => state.setIsCreatingProject,
  );
  const setViewingSettings = useUIStore((state) => state.setViewingSettings);
  const companyName = useUIStore((state) => state.companyName);

  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const visibleProjects = projects.filter((p) => {
    if (user?.role === "Admin") return true;
    const access = user?.projectAccess?.[p.id];
    if (access === "none") return false;
    if (access === "read" || access === "write") return true;
    if (p.ownerId === user?.uid) return true;
    return false;
  });

  const activeCount = visibleProjects.filter(
    (p) => p.status === "Active",
  ).length;
  const onHoldCount = visibleProjects.filter(
    (p) => p.status === "On Hold",
  ).length;
  const completedCount = visibleProjects.filter(
    (p) => p.status === "Completed",
  ).length;

  // Time-of-day greeting for the hero (live/dynamic).
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.displayName || "").trim().split(/\s+/)[0] || "there";

  // Pointer-follow tilt for project cards (shared; auto-off in Site Mode).
  const cardTilt = useCardTilt();

  const handleDeleteProjectClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
  };

  const handleEditProjectClick = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setProjectToEdit(project);
  };

  const confirmDeleteProject = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete);
      setProjectToDelete(null);
    }
  };

  const handleUpdateImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    projectId: string,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        updateProjectImage(projectId, dataUrl);
      };
    };
  };

  return (
    <div className="min-h-[100dvh] p-4 sm:p-8 md:p-12 lg:p-24 overflow-x-hidden pt-4 sm:pt-8 bg-page">
      <div className="max-w-7xl mx-auto">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
          className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] md:rounded-[44px] bg-surface-dark text-white mb-8 sm:mb-12 md:mb-16 px-6 py-8 sm:px-10 sm:py-12 md:px-16 md:py-14 shadow-xl shadow-drab/30"
        >
          {/* Ambient palette mesh (animated, motion-safe) */}
          <div className="brand-mesh" aria-hidden="true" />
          {/* Depth wash + floating decorative glyph */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-onyx/70 pointer-events-none"
            aria-hidden="true"
          />
          <Buildings
            weight="duotone"
            aria-hidden="true"
            className="float-y pointer-events-none absolute -top-6 -right-6 sm:-top-8 sm:-right-4 w-40 h-40 sm:w-56 sm:h-56 md:w-72 md:h-72 text-white/[0.06]"
          />

          <div className="relative z-10">
            {/* Top control row */}
            <div className="flex items-center justify-between gap-3 mb-8 sm:mb-12 md:mb-16">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                  <HardHat
                    weight="duotone"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                  />
                </div>
                <span className="hidden sm:inline text-[13px] font-bold uppercase tracking-[0.22em] text-white/60">
                  Portfolio
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <OrgSwitcher />
                <SyncStatus />
                <TelegramBotStatus />
                <button
                  onClick={() => setViewingSettings(true)}
                  className="p-2.5 sm:p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white/90 transition-colors active:scale-95 shrink-0"
                  title="Global Settings"
                >
                  <GearSix weight="duotone" className="w-5 h-5" />
                </button>
                <button
                  onClick={() => logout()}
                  className="p-2.5 sm:p-3 rounded-2xl bg-white/10 hover:bg-danger/25 text-white/90 hover:text-danger transition-colors active:scale-95 shrink-0"
                  title="Sign Out"
                >
                  <SignOut weight="duotone" className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Headline + CTA */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 lg:gap-12">
              <div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.5 }}
                  className="text-[12px] sm:text-sm font-bold uppercase tracking-[0.2em] text-primary mb-2 sm:mb-3"
                >
                  {greeting}, {firstName}
                </motion.div>
                <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-[80px] font-bold tracking-tight leading-[0.95] mb-3 sm:mb-4">
                  {companyName}
                </h1>
                <p className="text-[15px] sm:text-[17px] md:text-lg text-white/70 font-medium leading-relaxed">
                  Truth, reported from site.{" "}
                  <span className="text-white/45">
                    Every project, ledger, and daily log in one place.
                  </span>
                </p>

                {/* Portfolio stats */}
                <div className="flex flex-wrap gap-2.5 sm:gap-3 mt-6 sm:mt-8">
                  <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-2.5">
                    <CountUp
                      value={visibleProjects.length}
                      className="font-display text-2xl font-bold leading-none tabular-nums"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                      Projects
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sage shadow-[0_0_10px_#87BCBF]" />
                    <CountUp
                      value={activeCount}
                      className="font-display text-2xl font-bold leading-none tabular-nums"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    <CountUp
                      value={onHoldCount}
                      className="font-display text-2xl font-bold leading-none tabular-nums"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                      On Hold
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/[0.07] border border-white/10 px-4 py-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sage/70" />
                    <CountUp
                      value={completedCount}
                      className="font-display text-2xl font-bold leading-none tabular-nums"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                      Completed
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsCreatingProject(true)}
                className="cta-shine w-full lg:w-auto justify-center bg-primary text-white px-6 sm:px-8 md:px-10 py-4 md:py-5 rounded-2xl md:rounded-3xl font-bold text-[15px] sm:text-[17px] flex items-center gap-3 shadow-lg shadow-primary/30 hover:bg-primary/90 apple-transition sm:hover:-translate-y-1 active:scale-95 shrink-0"
              >
                <Plus weight="bold" className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <span className="truncate">Initialize Workspace</span>
              </button>
            </div>
          </div>
        </motion.header>

        <CreateProjectModal
          isOpen={isCreatingProject}
          onClose={() => setIsCreatingProject(false)}
          user={user}
        />

        <EditProjectModal
          isOpen={!!projectToEdit}
          onClose={() => setProjectToEdit(null)}
          project={projectToEdit}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 md:gap-10 pb-[100px] sm:pb-0">
          {visibleProjects.map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setActiveProject(project)}
              {...cardTilt}
              className="group soft-card-interactive p-6 sm:p-8 md:p-12 rounded-[24px] sm:squircle-24 relative overflow-hidden [transform-style:preserve-3d]"
            >
              <div className="flex justify-between items-start mb-6 md:mb-8 relative z-10">
                <div className="relative bg-surface-dark text-white p-3 sm:p-4 md:p-5 rounded-[16px] sm:rounded-[20px] md:rounded-[24px] group-hover:bg-primary apple-transition shadow-lg shadow-drab/20 flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 overflow-hidden shrink-0">
                  {project.imageUrl ? (
                    <img
                      src={project.imageUrl}
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon
                      weight="duotone"
                      className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10"
                    />
                  )}
                  <label
                    className="absolute inset-0 bg-onyx/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ImageIcon weight="duotone" className="w-6 h-6" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUpdateImage(e, project.id)}
                    />
                  </label>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span
                    className={`text-[10px] md:text-[12px] font-bold px-3 py-1.5 md:px-4 md:py-2 rounded-full mb-2 md:mb-3 uppercase tracking-widest ${statusPillClasses(
                      project.status,
                    )}`}
                  >
                    {project.status || "Planning"}
                  </span>
                  <div className="flex gap-1">
                    {user?.role === "Admin" && (
                      <button
                        onClick={(e) => handleEditProjectClick(e, project)}
                        className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-ink-muted hover:text-primary hover:bg-page apple-transition"
                        title="Edit Project"
                      >
                        <PencilSimple
                          weight="duotone"
                          className="w-4 h-4 md:w-5 md:h-5"
                        />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteProjectClick(e, project.id)}
                      className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl text-ink-muted hover:text-danger hover:bg-danger/8 apple-transition"
                      title="Delete Project"
                    >
                      <Trash
                        weight="duotone"
                        className="w-4 h-4 md:w-5 md:h-5"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-xl sm:text-2xl md:text-[28px] font-bold text-ink mb-2 sm:mb-3 group-hover:text-primary apple-transition tracking-tight">
                  {project.name}
                </h3>
                <p className="text-[14px] md:text-[15px] text-ink-muted font-medium line-clamp-2 md:line-clamp-3 lg:line-clamp-2 leading-relaxed mb-6 sm:mb-8 md:mb-10 min-h-[42px]">
                  {project.description}
                </p>
              </div>

              <div className="flex items-center justify-end pt-6 md:pt-8 border-t border-divider/60 relative z-10">
                <div className="bg-surface-dark text-white p-2.5 md:p-3 rounded-xl md:rounded-2xl lg:translate-x-4 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 transition-all duration-300 shadow-md">
                  <ArrowRight
                    weight="bold"
                    className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6"
                  />
                </div>
              </div>
            </motion.div>
          ))}
          {visibleProjects.length === 0 && !isCreatingProject && (
            <div className="sm:col-span-2 lg:col-span-3 py-20 sm:py-32 md:py-40 text-center soft-card border-2 border-dashed border-fossil rounded-[24px] sm:rounded-[32px] md:rounded-[48px]">
              <div className="bg-page w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-[20px] sm:rounded-[32px] md:rounded-[40px] flex items-center justify-center mx-auto mb-6 sm:mb-8 md:mb-10 border border-divider/60">
                <ArrowsClockwise
                  weight="duotone"
                  className="w-8 h-8 md:w-12 md:h-12 text-ink-muted"
                />
              </div>
              <h3 className="text-2xl sm:text-3xl md:text-[34px] font-bold text-ink mb-2 sm:mb-3">
                No Active Workspaces
              </h3>
              <p className="text-[15px] sm:text-[17px] text-ink-muted font-medium leading-relaxed max-w-[280px] sm:max-w-md mx-auto">
                Kickstart your work by initializing a new project.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-onyx/50 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="soft-card bg-surface rounded-2xl w-full max-w-sm p-6 relative"
          >
            <h3 className="text-xl font-bold text-ink mb-2">Delete Project?</h3>
            <p className="text-ink-muted mb-6 text-sm">
              Are you sure you want to delete this entire project? This will
              remove all associated data and cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 text-ink font-medium hover:bg-panel rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProject}
                className="px-4 py-2 bg-danger hover:bg-danger text-white font-medium rounded-xl shadow-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
