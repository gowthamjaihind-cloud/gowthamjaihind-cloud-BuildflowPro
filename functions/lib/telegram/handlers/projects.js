"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showProjects = showProjects;
exports.pickProject = pickProject;
const admin = require("firebase-admin");
const session_1 = require("../session");
const db = admin.firestore();
async function showProjects(tg, chatId, session) {
    let projectsQuery = db.collection("projects");
    if (session.orgId) {
        projectsQuery = db.collection(`organizations/${session.orgId}/projects`);
    }
    const snap = await projectsQuery.where("status", "in", ["Active", "Planning"]).get();
    const buttons = [];
    // To avoid too many buttons, let's limit to 10 for now.
    snap.docs.slice(0, 10).forEach(doc => {
        buttons.push([{ text: doc.data().name || "Unnamed Project", callback_data: `prj:${doc.id}` }]);
    });
    if (buttons.length === 0) {
        await tg.sendMessage(chatId, "No active projects found.");
        return;
    }
    await (0, session_1.setSession)(chatId, { step: "projects:pick" });
    await tg.sendMessage(chatId, "<b>Select an active project:</b>", buttons);
}
async function pickProject(tg, chatId, messageId, session, projectId) {
    await (0, session_1.setSession)(chatId, { activeProjectId: projectId, step: null, draft: admin.firestore.FieldValue.delete() });
    let projectName = "Selected project";
    const projectPath = session.orgId ? `organizations/${session.orgId}/projects/${projectId}` : `projects/${projectId}`;
    const snap = await db.doc(projectPath).get();
    if (snap.exists) {
        projectName = snap.data().name || projectName;
    }
    await tg.editMessage(chatId, messageId, `✅ Active project set to: <b>${projectName}</b>`);
}
//# sourceMappingURL=projects.js.map