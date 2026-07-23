import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Image as ImageIcon,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { projectService } from "../../../services/projectService";
import { useProjectsQuery } from "../../../hooks/queries";
import { UserProfile } from "../../../types";

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
  const [newProject, setNewProject] = useState({
    name: "",
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
          setNewProject({
            ...newProject,
            imageUrl: canvas.toDataURL("image/jpeg", 0.85),
          });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const { data: projects = [] } = useProjectsQuery();

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) {
      alert("Please enter a workspace name.");
      return;
    }

    if (projects.some(p => p.name.trim().toLowerCase() === newProject.name.trim().toLowerCase())) {
      alert("A workspace with this name already exists.");
      return;
    }

    await projectService.createProject(
      {
        ...newProject,
        strictDataEntry: true,
      },
      user.uid
    );
    
    setNewProject({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "Planning",
      imageUrl: "",
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-onyx/20 backdrop-blur-3xl z-[100] flex items-center justify-center p-6"
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
                  New Workspace
                </h2>
                <p className="text-[17px] text-ink-muted font-medium">
                  Initialize Project Parameters
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
                  Workspace Name
                </label>
                <input
                  required
                  className="w-full bg-surface/50 border border-white/20 rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition font-bold text-lg md:text-xl"
                  placeholder="Project Horizon"
                  value={newProject.name}
                  onChange={(e) =>
                    setNewProject({ ...newProject, name: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Project Image (Optional)
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
                    <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-white/20 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-6 h-6 text-ink-muted" />
                    </div>
                  )}
                  <label className="cursor-pointer bg-surface/50 border border-white/20 rounded-xl px-4 py-3 flex-1 flex items-center justify-center hover:bg-surface apple-transition text-sm font-bold text-ink">
                    <ImageIcon className="w-4 h-4 mr-2" /> Upload Icon
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
                      className="p-3 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-xl app-transition flex-shrink-0"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Mission Profile
                </label>
                <textarea
                  className="w-full bg-surface/50 border border-white/20 rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-medium"
                  rows={3}
                  placeholder="Project scope and primary objectives..."
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
                  Status
                </label>
                <select
                  className="w-full bg-surface/50 border border-white/20 rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.status}
                  onChange={(e) =>
                    setNewProject({ ...newProject, status: e.target.value })
                  }
                >
                  <option value="Planning">Planning</option>
                  <option value="Active">Active</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink ml-1">
                  Commencement
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-surface/50 border border-white/20 rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.startDate}
                  onChange={(e) =>
                    setNewProject({ ...newProject, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink ml-1">
                  Provisional Completion
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-surface/50 border border-white/20 rounded-2xl p-5 focus:bg-surface outline-none apple-transition font-bold text-ink"
                  value={newProject.endDate}
                  onChange={(e) =>
                    setNewProject({ ...newProject, endDate: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-6 mt-16 relative z-10">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-4 font-bold text-[17px] text-ink-muted hover:text-ink apple-transition"
              >
                Discard
              </button>
              <button
                type="submit"
                className="bg-surface-dark text-white px-10 py-4 rounded-3xl font-bold text-[17px] shadow-xl hover:bg-onyx apple-transition"
              >
                Initialize Project
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

