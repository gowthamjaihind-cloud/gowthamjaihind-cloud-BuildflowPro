import * as admin from "firebase-admin";
import { TelegramApi, InlineButton } from "../api";
import { setSession, BotSession } from "../session";

const db = admin.firestore();

export async function showProjects(tg: TelegramApi, chatId: number, session: BotSession) {
  let projectsQuery = db.collection("projects");
  if (session.orgId) {
    projectsQuery = db.collection(`organizations/${session.orgId}/projects`) as any;
  }
  
  const snap = await projectsQuery.where("status", "in", ["Active", "Planning"]).get();
  const buttons: InlineButton[][] = [];
  
  // To avoid too many buttons, let's limit to 10 for now.
  snap.docs.slice(0, 10).forEach(doc => {
    buttons.push([{ text: doc.data().name || "Unnamed Project", callback_data: `prj:${doc.id}` }]);
  });
  
  if (buttons.length === 0) {
    await tg.sendMessage(chatId, "No active projects found.");
    return;
  }
  
  await setSession(chatId, { step: "projects:pick" });
  await tg.sendMessage(chatId, "<b>Select an active project:</b>", {
    reply_markup: { inline_keyboard: buttons },
    parse_mode: "HTML"
  });
}

export async function pickProject(tg: TelegramApi, chatId: number, messageId: number, session: BotSession, projectId: string) {
  await setSession(chatId, { activeProjectId: projectId, step: null, draft: admin.firestore.FieldValue.delete() as any });
  
  let projectName = "Selected project";
  const projectPath = session.orgId ? `organizations/${session.orgId}/projects/${projectId}` : `projects/${projectId}`;
  const snap = await db.doc(projectPath).get();
  if (snap.exists) {
    projectName = snap.data()!.name || projectName;
  }
  
  await tg.editMessage(chatId, messageId, `✅ Active project set to: <b>${projectName}</b>`, { parse_mode: "HTML" });
}
