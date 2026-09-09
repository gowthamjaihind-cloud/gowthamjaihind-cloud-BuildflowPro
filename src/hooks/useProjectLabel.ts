import { useProjectStore } from "../store";

/**
 * What a report should call this project.
 *
 * Exports used to print the raw Firestore document id — "P5vv0gHsHBOIcCoJchQl"
 * — which means nothing to the customer receiving the PDF. If the project
 * carries a code the user chose when creating it, that is shown instead.
 */
export function useProjectLabel(projectId: string): string {
  const projects = useProjectStore((s) => s.projects);
  const active = useProjectStore((s) => s.activeProject);
  const project =
    (active?.id === projectId ? active : null) ||
    projects.find((p) => p.id === projectId);
  const code = project?.projectCode?.trim();
  return code || projectId;
}
