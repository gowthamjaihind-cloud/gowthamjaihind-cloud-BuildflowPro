import { serverTimestamp, deleteField, where } from "firebase/firestore";


import { doc, getDoc, collection, query, getDocs, setDoc, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase_client.ts";
import { getSession, setSession, clearStep } from "../session.ts";

export async function showProjects(tg: any, chatId: number, session) {
    const path = session.orgId ? `organizations/${session.orgId}/projects` : "projects";
    const snap = await getDocs(query(collection(db, path), where("status", "in", ["Active", "Planning"])));
    const buttons = [];
    // To avoid too many buttons, let's limit to 10 for now.
    snap.docs.slice(0, 10).forEach(doc => {
        buttons.push([{ text: doc.data().name || "Unnamed Project", callback_data: `prj:${doc.id}` }]);
    });
    if (buttons.length === 0) {
        await tg.sendMessage(chatId, "No active projects found.");
        return;
    }
    await setSession(chatId, { step: "projects:pick" });
    await tg.sendMessage(chatId, "<b>Select an active project:</b>", buttons);
}
export async function pickProject(tg: any, chatId: number, messageId, session, projectId) {
    await setSession(chatId, { activeProjectId: projectId, step: null, draft: deleteField() });
    let projectName = "Selected project";
    const projectPath = session.orgId ? `organizations/${session.orgId}/projects/${projectId}` : `projects/${projectId}`;
    const snap = await getDoc(doc(db, projectPath));
    if (snap.exists()) {
        projectName = snap.data().name || projectName;
    }
    await tg.editMessage(chatId, messageId, `✅ Active project set to: <b>${projectName}</b>`);
}
