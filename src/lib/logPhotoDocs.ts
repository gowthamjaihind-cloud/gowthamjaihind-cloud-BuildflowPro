import type { ProjectDocument } from "../types";

/** Daily-log photo entries carry this prefix; they are listed, not managed, here. */
export const LOG_PHOTO_PREFIX = "log:";
export const isLogPhoto = (d: { id: string }) => d.id.startsWith(LOG_PHOTO_PREFIX);

/** Every photo on the project's daily logs, as read-only Progress Photos entries. */
export function logPhotoDocs(
  logs: { id: string; taskId?: string; workDate?: string; photoUrls?: string[]; createdVia?: string }[],
  tasks: { id: string; name: string }[],
  projectId: string,
): ProjectDocument[] {
  const out: ProjectDocument[] = [];
  for (const log of logs) {
    const urls = Array.isArray(log.photoUrls) ? log.photoUrls.filter((u) => typeof u === "string" && u.startsWith("https://")) : [];
    const taskName = tasks.find((t) => t.id === log.taskId)?.name || "Site work";
    urls.forEach((url, i) => {
      out.push({
        id: `${LOG_PHOTO_PREFIX}${log.id}:${i}`,
        projectId,
        taskId: log.taskId,
        name: `${taskName}: site photo ${i + 1}`,
        type: "Image",
        url,
        uploadedBy: "",
        uploadedAt: String(log.workDate || ""),
        accessLevel: "Internal",
        category: "Progress Photos",
        tags: ["daily log", ...(log.createdVia === "telegram" ? ["telegram"] : [])],
      });
    });
  }
  return out.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

