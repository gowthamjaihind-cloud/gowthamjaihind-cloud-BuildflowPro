import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Image as ImageIcon,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { useProjectStore } from "../../../store";
import { Project } from "../../../types";

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const [editedProject, setEditedProject] = useState<Partial<Project>>({});
  const updateProject = useProjectStore((state) => state.updateProject);

  useEffect(() => {
    if (project) {
      setEditedProject({
        name: project.name,
        description: project.description,
        startDate: project.startDate,
        endDate: project.endDate,
        status: project.status,
        imageUrl: project.imageUrl,
      });
    }
  }, [project]);

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
          setEditedProject({
            ...editedProject,
            imageUrl: canvas.toDataURL("image/jpeg", 0.85),
          });
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editedProject.name?.trim()) {
      alert("Please enter a workspace name.");
      return;
    }

    if (project) {
      await updateProject(project.id, {
        ...editedProject,
        name: editedProject.name.trim()
      });
    }
    
    onClose();
  };

  if (!project) return null;

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
            onSubmit={handleUpdateProject}
            className="soft-card w-full max-w-2xl rounded-[40px] p-6 md:p-12 shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <div className="relative z-10 mb-12 flex justify-between items-start">
              <div>
                <h2 className="text-[34px] font-bold text-ink mb-2 tracking-tight">
                  Edit Workspace
                </h2>
                <p className="text-[17px] text-ink-muted font-medium">
                  Modify Project Parameters
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
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition font-bold text-lg md:text-xl"
                  placeholder="Project Horizon"
                  value={editedProject.name || ""}
                  onChange={(e) =>
                    setEditedProject({ ...editedProject, name: e.target.value })
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Project Image (Optional)
                </label>
                <div className="flex items-center gap-4">
                  {editedProject.imageUrl ? (
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md flex-shrink-0">
                      <img
                        src={editedProject.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-divider flex flex-shrink-0 items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-ink-muted" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label className="bg-surface border border-divider hover:bg-white/40 cursor-pointer apple-transition px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Upload Cover
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                    {editedProject.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditedProject({ ...editedProject, imageUrl: "" })
                        }
                        className="text-[#EF4444] hover:bg-[#EF4444]/8 text-sm font-medium px-4 py-1.5 rounded-lg apple-transition"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Description
                </label>
                <textarea
                  required
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition min-h-[120px] resize-none"
                  placeholder="Brief overview of the project scope and objectives..."
                  value={editedProject.description || ""}
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      description: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Start Date
                </label>
                <input
                  required
                  type="date"
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition"
                  value={editedProject.startDate || ""}
                  onChange={(e) =>
                    setEditedProject({
                      ...editedProject,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-3">
                <label className="text-[13px] font-bold text-ink-muted ml-1">
                  Target End Date
                </label>
                <input
                  required
                  type="date"
                  className="w-full bg-surface/50 border border-divider rounded-2xl p-4 md:p-5 focus:bg-surface outline-none apple-transition"
                  value={editedProject.endDate || ""}
                  onChange={(e) =>
                    setEditedProject({ ...editedProject, endDate: e.target.value })
                  }
                />
              </div>

              <div className="md:col-span-2 mt-8">
                <button
                  type="submit"
                  className="w-full bg-primary text-white py-4 md:py-5 rounded-2xl font-bold text-[17px] hover:bg-[#B85F3B] apple-transition shadow-xl hover:shadow-2xl active:scale-[0.98]"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
