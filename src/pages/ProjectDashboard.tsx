import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Layout } from "../components/Layout";
import { DashboardView } from "../components/DashboardView";
import { WBSView } from "../components/WBSView";
import { InventoryView } from "../components/InventoryView";
import { ProcurementView } from "../components/ProcurementView";
import MaterialConsumptionView from "../components/MaterialConsumptionView";
import { LaborTrackingView } from "../components/LaborTrackingView";
import { CostManagement } from "../components/CostManagement";
import { EstimateTrackerView } from "../components/EstimateTrackerView";
import { ProgressReportsView } from "../components/ProgressReportsView";
import { DocumentVault } from "../components/DocumentVault";
import { ProjectDailyLogsTab } from "../components/schedule/ProjectDailyLogsTab";
import { Project, UserProfile } from "../types";
import { useUIStore, useProjectStore, useTaskStore } from "../store";
import { useTasksQuery } from "../hooks/queries";

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
          {activeTab === "dashboard" && (
            <DashboardView
              activeProjectId={activeProject.id}
              handleAddDependency={handleAddDependency}
            />
          )}
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
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
};
