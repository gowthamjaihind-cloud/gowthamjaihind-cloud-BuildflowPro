import * as admin from "firebase-admin";
import { setSession } from "../session";
import { db } from "../../db";

export async function showProjects(tg: any, chatId: number, session: any) {
  const path = session.orgId
    ? `organizations/${session.orgId}/projects`
    : "projects";
  const snap = await db
    .collection(path)
    .where("status", "in", ["Active", "Planning"])
    .get();

  const buttons: { text: string; callback_data: string }[][] = [];
  snap.docs.slice(0, 10).forEach((doc) => {
    buttons.push([
      { text: doc.data().name || "Unnamed Project", callback_data: `prj:${doc.id}` },
    ]);
  });

  if (buttons.length === 0) {
    await tg.sendMessage(chatId, "No active projects found.");
    return;
  }

  await setSession(chatId, { step: "projects:pick" });
  await tg.sendMessage(chatId, "<b>Select an active project:</b>", buttons);
}

export async function pickProject(
  tg: any,
  chatId: number,
  messageId: any,
  session: any,
  projectId: string
) {
  await setSession(chatId, {
    activeProjectId: projectId,
    step: null,
    draft: admin.firestore.FieldValue.delete() as any,
  });

  let projectName = "Selected project";
  const projectPath = session.orgId
    ? `organizations/${session.orgId}/projects/${projectId}`
    : `projects/${projectId}`;
  const snap = await db.doc(projectPath).get();
  if (snap.exists) {
    projectName = snap.data()!.name || projectName;
  }

  await tg.editMessage(chatId, messageId, `✅ Active project set to: <b>${projectName}</b>`);
}
