import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuthStore } from "../store";
import { WbsNode, WbsTemplate } from "../lib/wbsTemplates";

// Org-level WBS templates: saved once, usable on every project in the
// organisation. This is the first of the shared masters, and the path it
// establishes — organizations/{orgId}/<master> — is the one vendors and
// materials will follow.

/** A template saved by the customer, as stored. */
export interface SavedWbsTemplate {
  id: string;
  name: string;
  description: string;
  nodes: WbsNode[];
  taskCount: number;
  savedFromProjectId?: string;
  savedFromProjectName?: string;
  createdAt: string;
  createdByUid: string;
  createdByName: string;
}

function templatesPath(): string | null {
  const orgId = useAuthStore.getState().user?.currentOrgId;
  return orgId ? `organizations/${orgId}/wbs_templates` : null;
}

/** Count the leaves in a node tree — what the picker shows as "tasks". */
export function countLeaves(nodes: WbsNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.children?.length ? countLeaves(n.children) : 1),
    0,
  );
}

export async function listSavedTemplates(): Promise<SavedWbsTemplate[]> {
  const path = templatesPath();
  if (!path) return [];
  try {
    const snap = await getDocs(query(collection(db, path), orderBy("createdAt", "desc")));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // A picker should never block project creation because templates failed to
    // load — fall back to the built-in starters.
    return [];
  }
}

export async function saveTemplate(input: {
  name: string;
  description?: string;
  nodes: WbsNode[];
  projectId?: string;
  projectName?: string;
}): Promise<string> {
  const path = templatesPath();
  if (!path) throw new Error("No organisation selected.");
  const user = useAuthStore.getState().user;
  const ref = doc(collection(db, path));
  const payload: Omit<SavedWbsTemplate, "id"> = {
    name: input.name.trim(),
    description: (input.description || "").trim(),
    nodes: input.nodes,
    taskCount: countLeaves(input.nodes),
    savedFromProjectId: input.projectId,
    savedFromProjectName: input.projectName,
    createdAt: new Date().toISOString(),
    createdByUid: user?.uid || "",
    createdByName: user?.displayName || user?.email || "Unknown",
  };
  await setDoc(ref, payload);
  return ref.id;
}

export async function deleteTemplate(id: string): Promise<void> {
  const path = templatesPath();
  if (!path) return;
  await deleteDoc(doc(db, path, id));
}

/** Present a saved template in the same shape the picker uses for built-ins. */
export function asTemplate(saved: SavedWbsTemplate): WbsTemplate {
  return {
    id: `saved:${saved.id}`,
    name: saved.name,
    category: "Saved",
    description:
      saved.description ||
      (saved.savedFromProjectName ? `Saved from ${saved.savedFromProjectName}` : "Your saved structure"),
    nodes: saved.nodes,
  };
}
