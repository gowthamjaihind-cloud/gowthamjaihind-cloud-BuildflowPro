import re

content = """import { Request, Response } from "express";
import { TelegramApi } from "./api";
import { getSession, setSession, clearStep } from "./session";
import { checkRateLimit, redeemLinkCode, validateSession } from "./auth";
import { db } from "../firebase_client";
import { collection, doc, getDoc, getDocs, query, setDoc, addDoc, updateDoc } from "firebase/firestore";

export const handleTelegramWebhook = async (req: Request, res: Response) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'buildflow_secret_123';
  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    console.error("Telegram bot is not configured (missing env vars)");
    res.status(500).send("Bot not configured");
    return;
  }
  const expected = WEBHOOK_SECRET;
  const received = req.get("X-Telegram-Bot-Api-Secret-Token");
  
  if (!expected || received !== expected) {
    console.warn("Rejected unauthenticated webhook request");
    res.status(401).send("Unauthorized");
    return;
  }
  
  res.status(200).send("OK");
  
  const tg = new TelegramApi(BOT_TOKEN);
  try {
    await handleUpdate(tg, req.body);
  } catch (err) {
    console.error("Error handling update:", err);
  }
};

async function getProjectBasePath(projectId: string, orgId?: string): Promise<string> {
    if (orgId) {
      const orgProjRef = doc(db, `organizations/${orgId}/projects/${projectId}`);
      const snap = await getDoc(orgProjRef);
      if (snap.exists()) {
        return `organizations/${orgId}/projects/${projectId}`;
      }
    }
    return `projects/${projectId}`;
}

export async function handleUpdate(tg: TelegramApi, update: any) {
  const msg = update.message;
  const cb = update.callback_query;

  if (cb) {
    const chatId = cb.message.chat.id;
    const data = cb.data;
    try { await tg.answerCallback(cb.id); } catch {}
    
    const session = await getSession(chatId);
    if (!session || !(await validateSession(chatId, session))) return;
    
    if (data.startsWith("proj_")) {
      const projectId = data.replace("proj_", "");
      await setSession(chatId, { activeProjectId: projectId, step: null, draft: {} });
      await tg.sendMessage(chatId, `✅ Active project set. Send /log to log progress.`);
    } else if (data.startsWith("task_")) {
      const taskId = data.replace("task_", "");
      await setSession(chatId, { step: "AWAIT_PROGRESS", draft: { taskId } });
      await tg.sendMessage(chatId, `Enter progress percentage (0-100) for this task:`);
    } else if (data === "skip_note") {
      if (session.step === "AWAIT_NOTE") {
         await finishLog(tg, chatId, session);
      }
    }
    return;
  }

  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const text: string = msg.text.trim();

  if (text.startsWith("/link")) {
    const arg = text.slice(5).trim();
    try { await tg.deleteMessage(chatId, msg.message_id); } catch { /* not fatal */ }
    
    if (!arg) {
      await tg.sendMessage(chatId, "Ask your admin for a link code, then send:\\n<code>/link ABCD-EFGH</code>");
      return;
    }
    
    if (!(await checkRateLimit(chatId))) {
      await tg.sendMessage(chatId, "Too many attempts. Wait an hour and ask your admin for a fresh code.");
      return;
    }
    
    const code = arg.replace(/[\s-]/g, "").toUpperCase();
    let result = await redeemLinkCode(code, chatId);
    
    if (!result.ok && code.length === 8) {
      const hyphenCode = `${code.slice(0,4)}-${code.slice(4,8)}`;
      result = await redeemLinkCode(hyphenCode, chatId);
    }
    
    if (!result.ok) {
      await tg.sendMessage(chatId, "That code isn't valid. It may have expired or already been used.");
      return;
    }
    
    // fetch orgId
    const snap = await getDoc(doc(db, "users", result.userId!));
    const orgId = snap.exists() ? snap.data()?.currentOrgId : null;
    
    await setSession(chatId, { userId: result.userId, email: result.email, orgId, linkedAt: Date.now() });
    await tg.sendMessage(chatId, `✅ Linked as <b>${result.email}</b>\\n\\nSend /help to see what I can do.`);
    return;
  }

  const session = await getSession(chatId);
  if (!(await validateSession(chatId, session))) {
    await tg.sendMessage(chatId, "You're not linked. Ask your admin for a link code, then send:\\n<code>/link ABCD-EFGH</code>");
    return;
  }

  if (text === "/cancel") {
    await clearStep(chatId);
    await tg.sendMessage(chatId, "Cancelled.");
    return;
  }

  if (text === "/help" || text === "/start") {
    await tg.sendMessage(chatId,
      `<b>BuildFlow Bot</b>\\n\\n/log — log today's site progress\\n/projects — switch active project\\n/cancel — cancel what you're doing\\n/help — this message`
    );
    return;
  }
  
  if (text === "/projects") {
    const projects: any[] = [];
    const seenIds = new Set<string>();
    
    const rootSnap = await getDocs(query(collection(db, "projects")));
    rootSnap.docs.forEach(d => {
        if (!seenIds.has(d.id)) { seenIds.add(d.id); projects.push({ id: d.id, ...d.data() }); }
    });
    
    if (session.orgId) {
        const orgSnap = await getDocs(query(collection(db, `organizations/${session.orgId}/projects`)));
        orgSnap.docs.forEach(d => {
            if (!seenIds.has(d.id)) { seenIds.add(d.id); projects.push({ id: d.id, ...d.data() }); }
        });
    }
    
    if (projects.length === 0) {
        await tg.sendMessage(chatId, "No projects found.");
        return;
    }
    
    const buttons = projects.map(p => [{ text: p.name, callback_data: `proj_${p.id}` }]);
    await tg.sendMessage(chatId, "Select active project:", buttons);
    return;
  }
  
  if (text === "/log") {
    if (!session.activeProjectId) {
      await tg.sendMessage(chatId, "No active project set. Send /projects first.");
      return;
    }
    
    const projBasePath = await getProjectBasePath(session.activeProjectId, session.orgId);
    const tasksSnap = await getDocs(query(collection(db, `${projBasePath}/tasks`)));
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((t:any) => t.status !== "Completed");
    
    if (tasks.length === 0) {
      await tg.sendMessage(chatId, "No active tasks to log.");
      return;
    }
    
    const buttons = tasks.slice(0, 50).map(t => [{ text: (t as any).name, callback_data: `task_${t.id}` }]);
    await tg.sendMessage(chatId, "Select task to log:", buttons);
    return;
  }

  // Handle steps
  if (session.step === "AWAIT_PROGRESS") {
    const progress = parseInt(text);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      await tg.sendMessage(chatId, "Please enter a valid number between 0 and 100.");
      return;
    }
    
    const draft = session.draft || {};
    draft.progressPercent = progress;
    await setSession(chatId, { step: "AWAIT_NOTE", draft });
    await tg.sendMessage(chatId, "Any notes? (Or click Skip)", [[{ text: "Skip", callback_data: "skip_note" }]]);
    return;
  }
  
  if (session.step === "AWAIT_NOTE") {
    const draft = session.draft || {};
    draft.note = text;
    await setSession(chatId, { draft });
    await finishLog(tg, chatId, session);
    return;
  }

  await tg.sendMessage(chatId, "I didn't understand that. Send /help.");
}

async function finishLog(tg: TelegramApi, chatId: number, session: any) {
    if (!session.activeProjectId || !session.draft?.taskId) return;
    
    const draft = session.draft;
    const projBasePath = await getProjectBasePath(session.activeProjectId, session.orgId);
    
    const todayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    
    // get user name
    let userName = session.email;
    if (session.userId) {
        const uSnap = await getDoc(doc(db, "users", session.userId));
        if (uSnap.exists()) {
            const uData = uSnap.data()!;
            userName = uData.displayName || uData.email || session.email;
        }
    }

    const logEntry = {
        taskId: draft.taskId,
        projectId: session.activeProjectId,
        workDate: todayString,
        createdAt: new Date().toISOString(),
        createdByUid: session.userId || "telegram-bot",
        createdByName: userName,
        progressPercent: draft.progressPercent || 0,
        markComplete: draft.progressPercent === 100,
        materials: [],
        labour: [],
        note: draft.note || ""
    };
    
    const newDoc = doc(collection(db, `${projBasePath}/dailyLogs`));
    await setDoc(newDoc, { ...logEntry, id: newDoc.id });
    
    // Update task progress
    const taskRef = doc(db, `${projBasePath}/tasks`, draft.taskId);
    const updates: any = { progress: draft.progressPercent };
    if (draft.progressPercent === 100) updates.status = "Completed";
    else if (draft.progressPercent > 0) updates.status = "In Progress";
    
    await updateDoc(taskRef, updates);
    
    await clearStep(chatId);
    await tg.sendMessage(chatId, `✅ Log saved successfully!`);
}

export function startPolling() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.warn("No TELEGRAM_BOT_TOKEN found. Bot polling disabled.");
    return;
  }

  const tg = new TelegramApi(BOT_TOKEN);
  let offset = 0;
  
  console.log("Starting Telegram Bot Polling...");
  
  tg.call("deleteWebhook", { drop_pending_updates: false }).catch(() => {}).then(() => {
    const poll = async () => {
      try {
        const res = await tg.call("getUpdates", { offset, timeout: 30 });
        if (res && res.result) {
          for (const update of res.result) {
            offset = update.update_id + 1;
            await handleUpdate(tg, update);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes("Conflict: terminated by other getUpdates request")) {
          // Ignore conflict errors from multiple instances running in preview
        } else if (err.message && !err.message.includes("timeout")) {
          console.error("Polling error:", err.message);
        }
      }
      
      setTimeout(poll, 1000);
    };
    
    poll();
  });
}
"""

with open("src/server/telegram/index.ts", "w") as f:
    f.write(content)
print("done")
