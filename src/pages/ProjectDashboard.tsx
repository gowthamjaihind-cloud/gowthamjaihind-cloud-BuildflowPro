import React, { Suspense, lazy } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleNotch } from "@phosphor-icons/react";
import { Layout } from "../components/Layout";
import { DashboardView } from "../components/DashboardView";
import { WBSView } from "../components/WBSView";
import { Project, UserProfile } from "../types";
import { useUIStore, useProjectStore, useTaskStore } from "../store";
import { useTasksQuery } from "../hooks/queries";

// Heavy per-tab views are code-split so the initial bundle only pays for the
// default dashboard. Each becomes its own async chunk, loaded on first visit.
const InventoryView = lazy(() =>
  import("../components/InventoryView").then((m) => ({ default: m.InventoryView })),
);
const ProcurementView = lazy(() =>
  import("../components/ProcurementView").then((m) => ({ default: m.ProcurementView })),
);
const MaterialConsumptionView = lazy(
  () => import("../components/MaterialConsumptionView"),
);
const LaborTrackingView = lazy(() =>
  import("../components/LaborTrackingView").then((m) => ({ default: m.LaborTrackingView })),
);
const CostManagement = lazy(() =>
  import("../components/CostManagement").then((m) => ({ default: m.CostManagement })),
);
const ProjectInsights = lazy(() =>
  import("../components/ProjectInsights").then((m) => ({ default: m.ProjectInsights })),
);
const EstimateTrackerView = lazy(() =>
  import("../components/EstimateTrackerView").then((m) => ({ default: m.EstimateTrackerView })),
);
const ProgressReportsView = lazy(() =>
  import("../components/ProgressReportsView").then((m) => ({ default: m.ProgressReportsView })),
);
const DocumentVault = lazy(() =>
  import("../components/DocumentVault").then((m) => ({ default: m.DocumentVault })),
);
const ProjectDailyLogsTab = lazy(() =>
  import("../components/schedule/ProjectDailyLogsTab").then((m) => ({
    default: m.ProjectDailyLogsTab,
  })),
);

const ViewFallback: React.FC = () => (
  <div className="flex items-center justify-center py-32 md:py-40">
    <CircleNotch className="w-8 h-8 text-primary animate-spin" />
  </div>
);

interface ProjectDashboardProps {
  user: UserProfile;
  activeProject: Project;
  onBack: () => void;
  onUpdateProject: (updatedProject: Project) => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  user,
  activeProject,
  onBack,
}) => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const { data: tasks = [] } = useTasksQuery(activeProject.id);
  const addDependency = useTaskStore((state) => state.addDependency);
  const updateProjectStatus = useProjectStore(
    (state) => state.updateProjectStatus,
  );

  const handleStatusChange = async (newStatus: string) => {
    await updateProjectStatus(activeProject.id, newStatus);
  };

  const handleAddDependency = (fromId: string, toId: string, type: any) => {
    return addDependency(activeProject.id, fromId, toId, type);
  };

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="h-full"
        >
          <Suspense fallback={<ViewFallback />}>
            {activeTab === "dashboard" && (
              <DashboardView
                activeProjectId={activeProject.id}
                handleAddDependency={handleAddDependency}
              />
            )}
            {activeTab === "insights" && <ProjectInsights projectId={activeProject.id} />}
            {activeTab === "wbs" && <WBSView projectId={activeProject.id} />}
            {activeTab === "dailylogs" && <ProjectDailyLogsTab projectId={activeProject.id} />}
            {activeTab === "inventory" && (
              <InventoryView projectId={activeProject.id} />
            )}
            {activeTab === "procurement" && (
              <ProcurementView projectId={activeProject.id} />
            )}
            {activeTab === "consumption" && (
              <MaterialConsumptionView projectId={activeProject.id} />
            )}
            {activeTab === "labor" && (
              <LaborTrackingView projectId={activeProject.id} />
            )}
            {activeTab === "costs" && (
              <CostManagement projectId={activeProject.id} />
            )}
            {activeTab === "estimates" && (
              <EstimateTrackerView projectId={activeProject.id} />
            )}
            {activeTab === "reports" && (
              <ProgressReportsView projectId={activeProject.id} />
            )}
            {activeTab === "documents" && (
              <DocumentVault projectId={activeProject.id} />
            )}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
};
