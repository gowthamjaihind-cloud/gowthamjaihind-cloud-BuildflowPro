import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import crypto from "crypto";
import TelegramBot from "node-telegram-bot-api";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import fs from "fs";

// Initialize Firebase Admin SDK
let adminApp;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  adminApp = initializeApp({
    credential: cert(serviceAccount)
  });
} else {
  // Fallback to ADC
  adminApp = initializeApp();
}

const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);


async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- Telegram Bot Logic ---
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();
  let webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || process.env.TELEGRAM_WEBHOOK_SECRET)?.trim();
  
  if (!webhookSecret && token) {
    // Automatically derive a static secret from the bot token to ensure security without requiring manual setup
    webhookSecret = crypto.createHash('sha256').update(token + "webhook-secret").digest('hex');
  }

  if (!webhookSecret || webhookSecret.length < 16) {
    console.error("SECURITY: Webhook secret is not set or too short. The webhook is UNAUTHENTICATED and can be forged by anyone.");
  }

  let bot: TelegramBot | null = null;

  if (token) {
    try {
      console.log("Initializing Telegram Bot...");
      
      // Initialize without autoStart polling
      bot = new TelegramBot(token, { polling: false });
      
      // Always register the polling error handler to suppress unhandled errors
      bot.on('polling_error', (error: any) => {
        if (error.message?.includes('409 Conflict') || error.code === 'ETELEGRAM') {
           console.warn("Telegram 409 Conflict: Another instance is still polling. Retrying...");
        } else if (error.message?.includes('EFATAL') || error.message?.includes('ECONNRESET')) {
           console.warn("Telegram Polling Warning: Connection reset. The bot will automatically reconnect.");
        } else {
           console.error("Telegram Polling Error:", error.message || error);
        }
      });
      
      // Override methods to handle unhandled rejections (e.g. 403 Forbidden)
      const originalSendMessage = bot.sendMessage.bind(bot);
      // @ts-ignore
      bot.sendMessage = async (chatId, text, options) => {
          try {
              return await originalSendMessage(chatId, text, options);
          } catch (error: any) {
              if (error.message?.includes('403') || error.message?.includes('blocked')) {
                  console.warn(`User ${chatId} blocked the bot (403 Forbidden).`);
              } else if (error.message?.includes('chat not found')) {
                  console.warn(`Chat ${chatId} not found (likely a test ID).`);
              } else {
                  console.error(`Telegram sendMessage error for chat ${chatId}:`, error.message || error);
              }
              return {} as any;
          }
      };

      const originalAnswerCallbackQuery = bot.answerCallbackQuery.bind(bot);
      // @ts-ignore
      bot.answerCallbackQuery = async (queryId, options) => {
          try {
              return await originalAnswerCallbackQuery(queryId, options as any);
          } catch (error: any) {
              if (!error.message?.includes('query is too old')) {
                 console.error(`Telegram answerCallbackQuery error:`, error.message || error);
              }
              return false;
          }
      };

      const originalEditMessageText = bot.editMessageText.bind(bot);
      // @ts-ignore
      bot.editMessageText = async (text, options) => {
          try {
              return await originalEditMessageText(text, options);
          } catch (error: any) {
              console.error(`Telegram editMessageText error:`, error.message || error);
              return {} as any;
          }
      };

      const originalEditMessageReplyMarkup = bot.editMessageReplyMarkup.bind(bot);
      // @ts-ignore
      bot.editMessageReplyMarkup = async (replyMarkup, options) => {
          try {
              return await originalEditMessageReplyMarkup(replyMarkup, options);
          } catch (error: any) {
              console.error(`Telegram editMessageReplyMarkup error:`, error.message || error);
              return {} as any;
          }
      };

      setupBotHandlers(bot);

      if (webhookUrl && !webhookUrl.includes("your-app-domain.com") && !webhookUrl.includes("example.com")) {
        let cleanWebhookUrl = webhookUrl.trim().replace(/\/+$/, '').replace(/^["']|["']$/g, '');
        if (!cleanWebhookUrl.startsWith('http')) {
            cleanWebhookUrl = `https://${cleanWebhookUrl}`;
        }
        console.log(`Initializing Telegram Webhook at: ${cleanWebhookUrl}/api/telegram-webhook`);
        
        bot.setWebHook(`${cleanWebhookUrl}/api/telegram-webhook`, {
          secret_token: webhookSecret,
        }).then(() => {
          console.log("Telegram Webhook registered successfully.");
        }).catch(err => {
          console.error("Webhook registration failed:", err.message || err);
          console.warn("Falling back to polling due to webhook error.");
          if (bot) bot.startPolling({ restart: true });
        });

        app.post('/api/telegram-webhook', express.json(), async (req, res) => {
          // Reject anything that does not carry the correct secret token.
          const received = req.get('X-Telegram-Bot-Api-Secret-Token');

          if (!webhookSecret || received !== webhookSecret) {
            console.warn(
              `Rejected unauthenticated webhook request from ${req.ip}`
            );
            return res.sendStatus(401);
          }

          if (bot) {
            try {
              await bot.processUpdate(req.body);
            } catch (err) {
              console.error("Error processing update:", err);
            }
          }
          res.sendStatus(200);
        });
      } else {
        console.warn("TELEGRAM_WEBHOOK_URL is not set or uses a dev URL. Falling back to long polling. Note: This may be unstable on serverless environments.");
        // Increased delay to 5 seconds to allow previous revision to release the polling connection
        setTimeout(() => {
          if (bot) {
            bot.deleteWebHook().then(() => {
                bot?.startPolling({ restart: true });
                console.log("Telegram Bot polling started.");
            }).catch(e => {
                console.error("Failed to delete webhook before polling", e);
                bot?.startPolling({ restart: true });
            });
          }
        }, 5000);

        // Graceful shutdown helpers for polling
        const shutdown = async (signal: string) => {
          if (bot && bot.isPolling()) {
            console.log(`[${signal}] Stopping Telegram Bot polling...`);
            try {
              await bot.stopPolling();
              console.log("Polling stopped successfully.");
            } catch (e) {
               console.error("Error stopping polling:", e);
            }
          }
          if (signal !== 'exit') {
            process.exit(0);
          }
        };

        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.on('exit', () => shutdown('exit'));
      }
    } catch (botInitError) {
      console.error("Failed to initialize Telegram Bot:", botInitError);
    }
  } else {
    console.warn("TELEGRAM_BOT_TOKEN not found. Bot disabled.");
  }

function generateCalendar(year: number, month: number): any[][] {
  const keyboard: any[][] = [];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // Header: < Month Year >
  keyboard.push([
    { text: "◀", callback_data: `cal_prev:${year}:${month}` },
    { text: `${monthNames[month]} ${year}`, callback_data: "ignore" },
    { text: "▶", callback_data: `cal_next:${year}:${month}` }
  ]);
  
  // Days of week
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  keyboard.push(days.map(d => ({ text: d, callback_data: "ignore" })));
  
  const date = new Date(year, month, 1);
  const firstDay = date.getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  
  let row: any[] = [];
  for (let i = 0; i < firstDay; i++) {
    row.push({ text: " ", callback_data: "ignore" });
  }
  
  for (let i = 1; i <= lastDate; i++) {
    const formattedMonth = String(month + 1).padStart(2, '0');
    const formattedDay = String(i).padStart(2, '0');
    row.push({ text: String(i), callback_data: `cal_sel:${year}-${formattedMonth}-${formattedDay}` });
    if (row.length === 7) {
      keyboard.push(row);
      row = [];
    }
  }
  
  if (row.length > 0) {
    while (row.length < 7) {
      row.push({ text: " ", callback_data: "ignore" });
    }
    keyboard.push(row);
  }
  
  keyboard.push([{ text: "Today", callback_data: `cal_sel:Today` }]);
  keyboard.push([{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]);
  
  return keyboard;
}

  function setupBotHandlers(botInstance: TelegramBot | null) {
    if (!botInstance) return;

    const sessionCache = new Map<number, any>();

    // Listen to bot_sessions in real-time to prevent eventual consistency issues
    db.collection("bot_sessions").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const chatId = parseInt(change.doc.id);
        if (isNaN(chatId)) return;
        
        if (change.type === "removed") {
          sessionCache.delete(chatId);
        } else {
          sessionCache.set(chatId, change.doc.data());
        }
      });
    }, (error) => {
      console.error("Real-time bot_sessions listener error:", error);
    });

    const getSession = async (chatId: number) => {
      try {
        if (sessionCache.has(chatId)) {
          return sessionCache.get(chatId);
        }
        const doc = await db.collection("bot_sessions").doc(chatId.toString()).get();
        if (doc.exists) {
          const data = doc.data();
          sessionCache.set(chatId, data);
          return data;
        }
        return null;
      } catch (e) {
        console.error("Session fetch error:", e);
        return null;
      }
    };

    const updateSession = async (chatId: number, data: any) => {
      try {
        const current = sessionCache.get(chatId) || {};
        const updated = { ...current };
        for (const key of Object.keys(data)) {
          if (data[key] === FieldValue.delete()) {
            delete updated[key];
          } else {
            updated[key] = data[key];
          }
        }
        sessionCache.set(chatId, updated);
        await db.collection("bot_sessions").doc(chatId.toString()).set(data, { merge: true });
      } catch (e) {
        console.error("Session update error:", e);
      }
    };

    const clearSession = async (chatId: number) => {
      try {
        const session = await getSession(chatId);
        const email = session?.email || null;
        const activeProjectId = session?.activeProjectId || null;
        
        const cleanData: any = {};
        if (email) cleanData.email = email;
        if (activeProjectId) cleanData.activeProjectId = activeProjectId;
        
        sessionCache.set(chatId, cleanData);
        await db.collection("bot_sessions").doc(chatId.toString()).set(cleanData);
      } catch (e) {
        console.error("Session clear error:", e);
      }
    };

    const handleStartProjectSelect = async (chatId: number, prefixText: string = "Welcome to BuildFlow Bot! 🏗️", emailOverride?: string) => {
      try {
        const session = await getSession(chatId);
        const email = emailOverride || session?.email;
        if (!email) {
            botInstance.sendMessage(chatId, "⚠️ Authentication required.\nPlease link your platform account using the command:\n`/link ABCD-EFGH`", { parse_mode: 'Markdown' });
            return;
        }

        const usersSnap = await db.collection("users").where("email", "==", email).get();
        let userDoc = usersSnap.docs[0];
        
        // Fallback for case insensitive match if direct match fails (Note: large user DBs will need a lowercase explicit field)
        if (!userDoc) {
           const allUsersSnap = await db.collection("users").get();
           userDoc = allUsersSnap.docs.find((d: any) => d.data().email?.toLowerCase() === email.toLowerCase());
        }
        
        if (!userDoc) {
            botInstance.sendMessage(chatId, `No platform user found for email: ${email}\nPlease ask your administrator to create your account.`);
            return;
        }

        const userData = userDoc.data();
        const projectsSnapshot = await db.collection("projects").get();
        
        if (projectsSnapshot.empty) {
          botInstance.sendMessage(chatId, "No projects found 📭");
          return;
        }

        // Apply Enterprise Access control filter
        const visibleProjects = projectsSnapshot.docs.filter((doc: any) => {
           const role = (userData.role || '').toLowerCase();
           if (role === 'admin' || role === 'owner') return true;
           if (userData.projectAccess && userData.projectAccess[doc.id] === 'none') return false;
           return true; 
        });

        if (visibleProjects.length === 0) {
            botInstance.sendMessage(chatId, "You do not have access to any projects. Please contact your Enterprise Admin.");
            return;
        }

        const keyboard = visibleProjects.map((doc: any) => ([{
          text: `🏗️ ${doc.data().name}`, 
          callback_data: `set_active_proj:${doc.id}`
        }]));

        if (session.activeProjectId) {
           keyboard.push([{ text: "🔙 Cancel", callback_data: "back_to_home" }]);
        }

        botInstance.sendMessage(chatId, `${prefixText}\n\nPlease select your active project. You won't be asked again:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (error: any) {
        console.error("Error in handleStartProjectSelect:", error);
        botInstance.sendMessage(chatId, "Error fetching projects. Details: " + (error.message || JSON.stringify(error)));
      }
    };

    // --- Home Menu Helper ---
    const sendHomeMenu = async (chatId: number, prefix: string = "") => {
      const session = await getSession(chatId);
      if (!session || !session.email) {
          botInstance.sendMessage(chatId, "Welcome to BuildFlow Bot! 🏗️\n\n⚠️ Authentication required.\nPlease link your platform account using the command:\n`/link ABCD-EFGH`", { parse_mode: 'Markdown' });
          return;
      }
      
      if (!session.activeProjectId) {
          await handleStartProjectSelect(chatId, prefix ? `${prefix}\n\nPlease select a project first:` : "Welcome! Please select your active project:");
          return;
      }

      const msg = prefix ? `${prefix}\n\n🏠 *Main Menu*\nChoose an action below:` : `🏠 *Main Menu*\nChoose an action below:`;
      const keyboard = [
        [{ text: "📝 Log Daily Progress", callback_data: "menu_log" }],
        [{ text: "📦 Material Intake", callback_data: "menu_intake" }, { text: "💸 Vendor Payment", callback_data: "menu_payment" }],
        [{ text: "🏗️ Active Tasks", callback_data: "menu_projects" }, { text: "📊 Report", callback_data: "menu_report" }],
        [{ text: "🔄 Change Project", callback_data: "menu_change_proj" }]
      ];
      botInstance.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });
    };

    // --- Command Handlers ---

    const showPhasesForLog = async (chatId: number, projectId: string) => {
        const tasksSnapshot = await db.collection(`projects/${projectId}/tasks`).get();
        const activeTasks = tasksSnapshot.docs.filter(d => d.data().status !== 'Completed');

        if (activeTasks.length === 0) {
          botInstance.sendMessage(chatId, "No active tasks for your active project.");
          return;
        }

        const phases = Array.from(new Set(activeTasks.map(d => d.data().phase || "Unassigned Phase")));

        const keyboard = phases.map((phase, idx) => ([{
          text: `📁 Phase: ${phase}`, 
          callback_data: `sel_ph_idx:${idx}`
        }]));
        keyboard.push([{ text: "🔙 Main Menu", callback_data: "back_to_home" }]);

        await updateSession(chatId, { step: 'selecting_phase', projectId, availablePhases: phases });
        botInstance.sendMessage(chatId, `🏗️ *Step 1: Select Phase*\nChoose the phase for your update:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
    };

    const showLocationsForLog = async (chatId: number, projectId: string, selectedPhase: string) => {
        const tasksSnapshot = await db.collection(`projects/${projectId}/tasks`).get();
        const activeTasks = tasksSnapshot.docs.filter(d => 
             d.data().status !== 'Completed' && 
             (d.data().phase || "Unassigned Phase") === selectedPhase
        );

        const locations = Array.from(new Set(activeTasks.map(d => d.data().location || "Unassigned Location")));

        const keyboard = locations.map((loc, idx) => ([{
          text: `📍 Location: ${loc}`, 
          callback_data: `sel_loc_idx:${idx}`
        }]));
        keyboard.push([{ text: "🔙 Back to Phases", callback_data: `menu_log` }]);
        keyboard.push([{ text: "🔙 Main Menu", callback_data: "back_to_home" }]);

        await updateSession(chatId, { step: 'selecting_location', selectedPhase, availableLocations: locations });
        botInstance.sendMessage(chatId, `🏗️ *Step 2: Select Location*\nChoose the location:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
    };

    const showTasksForLog = async (chatId: number, projectId: string, selectedPhase: string, selectedLocation: string) => {
        const tasksSnapshot = await db.collection(`projects/${projectId}/tasks`).get();
        const activeTasks = tasksSnapshot.docs.filter(d => 
             d.data().status !== 'Completed' && 
             (d.data().phase || "Unassigned Phase") === selectedPhase &&
             (d.data().location || "Unassigned Location") === selectedLocation
        );

        if (activeTasks.length === 0) {
          botInstance.sendMessage(chatId, "No active tasks for this selection.");
          return;
        }

        const keyboard = activeTasks.map(doc => ([{
          text: `🔹 ${doc.data().name}`, 
          callback_data: `sel_task:${doc.id}`
        }]));
        // We can't safely pass phase idx due to limits when there's many args, but we can easily fall back via generic menus
        keyboard.push([{ text: "🔙 Main Menu", callback_data: "back_to_home" }]);

        await updateSession(chatId, { step: 'selecting_task', selectedLocation });
        botInstance.sendMessage(chatId, `🏗️ *Step 3: Select Task*\nChoose the specific task:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard }
        });
    };

    const handleLogCommand = async (chatId: number) => {
      const session = await getSession(chatId);
      if (!session?.activeProjectId) return handleStartProjectSelect(chatId, "Project required!");
      await showPhasesForLog(chatId, session.activeProjectId);
    };

    const showActiveTasksForProject = async (chatId: number, projectId: string) => {
        const tasksSnapshot = await db.collection(`projects/${projectId}/tasks`).get();
        if (tasksSnapshot.empty) {
          botInstance.sendMessage(chatId, "No tasks found for this project.");
          return sendHomeMenu(chatId);
        }

        let response = `📑 *Active Tasks:*\n\n`;
        tasksSnapshot.forEach(docSnap => {
          const t = docSnap.data();
          response += `🔹 *${t.name}* - ${t.progress || 0}%\n`;
        });
        botInstance.sendMessage(chatId, response, { parse_mode: 'Markdown' }).then(() => {
          sendHomeMenu(chatId);
        });
    };

    const handleProjectsCommand = async (chatId: number) => {
      const session = await getSession(chatId);
      if (!session?.activeProjectId) return handleStartProjectSelect(chatId, "Project required!");
      await showActiveTasksForProject(chatId, session.activeProjectId);
    };

    const generateReportForProject = async (chatId: number, projectId: string) => {
        try {
            const projectDoc = await db.collection("projects").doc(projectId).get();
            if(!projectDoc.exists) {
                botInstance.sendMessage(chatId, "Project not found.");
                return sendHomeMenu(chatId);
            }
            const projectData = projectDoc.data();
            const tasksSnapshot = await db.collection(`projects/${projectId}/tasks`).get();
            
            const total = tasksSnapshot.size;
            const completed = tasksSnapshot.docs.filter(d => (d.data().status === 'Completed')).length;
            const avgProgress = tasksSnapshot.docs.reduce((acc, d) => acc + (d.data().progress || 0), 0) / (total || 1);

            const report = `📊 *Project Report: ${projectData?.name}*\n\n` +
                           `✅ Tasks Completed: ${completed}/${total}\n` +
                           `📈 Average Progress: ${avgProgress.toFixed(1)}%\n\n` +
                           `Keep building! 🚀`;
            
            botInstance.sendMessage(chatId, report, { parse_mode: 'Markdown' }).then(() => {
                sendHomeMenu(chatId);
            });
       } catch(e) {
           botInstance.sendMessage(chatId, "Error generating report.");
           sendHomeMenu(chatId);
       }
    };

    const handleReportCommand = async (chatId: number) => {
      const session = await getSession(chatId);
      if (!session?.activeProjectId) return handleStartProjectSelect(chatId, "Project required!");
      await generateReportForProject(chatId, session.activeProjectId);
    };

    const showIntakeVendorSelection = async (chatId: number, projectId: string) => {
         await updateSession(chatId, { step: 'intake_selecting_vend', projectId });
         const vendorsSnap = await db.collection(`projects/${projectId}/suppliers`).get();
         const vendors = vendorsSnap.docs.filter(doc => {
             const type = doc.data().type;
             return type === 'Material' || type === 'Both' || !type;
         });
         
         if (vendors.length === 0) {
             botInstance.sendMessage(chatId, "No material suppliers found for this project. Please add them in the dashboard.");
             return;
         }
         const keyboard = vendors.map(doc => ([{
             text: `🏢 ${doc.data().name}`,
             callback_data: `in_vend:${doc.id}`
         }]));
         keyboard.push([{ text: "🔙 Main Menu", callback_data: "back_to_home" }]);
         botInstance.sendMessage(chatId, "📦 *Material Intake (GRN)*\nSelect Supplier/Vendor (Party):", {
             parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: keyboard }
         });
    };

    const handleIntakeCommand = async (chatId: number) => {
      const session = await getSession(chatId);
      if (!session?.activeProjectId) return handleStartProjectSelect(chatId, "Project required!");
      await showIntakeVendorSelection(chatId, session.activeProjectId);
    };

    const showIntakeMaterialGroupSelection = async (chatId: number, projectId: string, vendorId: string) => {
         await updateSession(chatId, { step: 'intake_selecting_mat_grp', projectId, currentVendorId: vendorId });
         const invSnap = await db.collection(`projects/${projectId}/inventory`).get();
         if (invSnap.empty) {
             botInstance.sendMessage(chatId, "Inventory empty for this project.");
             return;
         }

         const groups = new Set<string>();
         invSnap.docs.forEach(doc => {
             groups.add(doc.data().groupCode || "Uncategorized");
         });

         const groupList = Array.from(groups);
         await updateSession(chatId, { availableMaterialGroups: groupList });

         const keyboard = groupList.map((grp, idx) => ([{
             text: `📁 ${grp}`,
             callback_data: `in_mat_grp:${idx}`
         }]));
         
         keyboard.push([{ text: "🔙 Back to Vendors", callback_data: "back_to_intake_vend" }, { text: "🔙 Main Menu", callback_data: "back_to_home" }]);
         botInstance.sendMessage(chatId, "📦 *Material Intake (GRN)*\nSelect Material Category:", {
             parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: keyboard }
         });
    };

    const showIntakeMaterialSelection = async (chatId: number, projectId: string, groupCode: string) => {
         const invSnap = await db.collection(`projects/${projectId}/inventory`).get();
         const items = invSnap.docs.filter(doc => (doc.data().groupCode || "Uncategorized") === groupCode);
         
         const keyboard = items.map(doc => ([{
             text: `📦 ${doc.data().name}`,
             callback_data: `in_mat:${doc.id}`
         }]));
         keyboard.push([{ text: "🔙 Back to Categories", callback_data: "back_to_intake_mat_grp" }, { text: "🔙 Main Menu", callback_data: "back_to_home" }]);
         botInstance.sendMessage(chatId, `📦 *Category: ${groupCode}*\nSelect Material Received:`, {
             parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: keyboard }
         });
    };

    const showPaymentVendorSelection = async (chatId: number, projectId: string) => {
         await updateSession(chatId, { step: 'pay_selecting_vend', projectId });
         const vendorsSnap = await db.collection(`projects/${projectId}/suppliers`).get();
         if (vendorsSnap.empty) {
             botInstance.sendMessage(chatId, "No vendors found for this project.");
             return;
         }
         const keyboard = vendorsSnap.docs.map(doc => ([{
             text: `🏢 ${doc.data().name} (Bal: ₹${doc.data().outstandingBalance || 0})`,
             callback_data: `pay_vend:${doc.id}`
         }]));
         keyboard.push([{ text: "🔙 Main Menu", callback_data: "back_to_home" }]);
         botInstance.sendMessage(chatId, "💸 *Vendor Payment*\nSelect Vendor/Contractor:", {
             parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: keyboard }
         });
    };

    const handlePaymentCommand = async (chatId: number) => {
      const session = await getSession(chatId);
      if (!session?.activeProjectId) return handleStartProjectSelect(chatId, "Project required!");
      await showPaymentVendorSelection(chatId, session.activeProjectId);
    };

    // --- Commands ---

    botInstance.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      sendHomeMenu(chatId, "Welcome to BuildFlow Bot! 🏗️\n\nI can help you manage your site directly from the field.");
    });

    botInstance.onText(/\/link (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const code = (match?.[1]?.trim() || '').replace(/[\s-]/g, "").toUpperCase();
      
      if (!code) {
         botInstance.sendMessage(chatId, "Please provide the link code. Example:\n`/link ABCD-EFGH`", { parse_mode: 'Markdown' });
         return;
      }
      
      const ref = db.collection("bot_link_codes").doc(code);
      try {
          const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return { ok: false };
            const data = snap.data()!;
            if (data.used) return { ok: false };
            if (Date.now() > (data.expiresAt || 0)) return { ok: false };

            tx.update(ref, { used: true, usedAt: Date.now(), usedByChatId: chatId });
            tx.update(db.collection("users").doc(data.userId), {
              telegramChatId: chatId,
              telegramLinkedAt: Date.now(),
            });
            return { ok: true, email: data.email, userId: data.userId };
          });

          if (!result.ok) {
             botInstance.sendMessage(chatId, "❌ That code isn't valid. It may have expired or already been used. Ask your admin for a new one.");
             return;
          }

          const email = result.email;
          await updateSession(chatId, { email, userId: result.userId, activeProjectId: FieldValue.delete() });
          await handleStartProjectSelect(chatId, `✅ Successfully linked account: ${email}\n\nPlease select your active project:`, email);
      } catch (err) {
          console.error("Error linking account:", err);
          botInstance.sendMessage(chatId, "❌ An error occurred while linking your account. Please try again.");
      }
    });

    botInstance.onText(/\/link$/, (msg) => {
      botInstance.sendMessage(msg.chat.id, "Please provide your link code. Example:\n`/link ABCD-EFGH`", { parse_mode: 'Markdown' });
    });

    botInstance.onText(/\/log/, (msg) => handleLogCommand(msg.chat.id));
    botInstance.onText(/\/projects/, (msg) => handleProjectsCommand(msg.chat.id));
    botInstance.onText(/\/report/, (msg) => handleReportCommand(msg.chat.id));
    botInstance.onText(/\/intake/, (msg) => handleIntakeCommand(msg.chat.id));
    botInstance.onText(/\/payment/, (msg) => handlePaymentCommand(msg.chat.id));

    botInstance.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      const helpMsg = "🏗️ *BuildFlow Help*\n\n" +
                      "Commands:\n" +
                      "/log - Guided Daily Site Report\n" +
                      "/intake - Log material delivery/receipt\n" +
                      "/payment - Log payments given to vendors\n" +
                      "/projects - List projects (Click to see tasks)\n" +
                      "/report - Get status summary\n" +
                      "/cancel - Abort current update\n\n" +
                      "This bot syncs directly with your project dashboard.";
      botInstance.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
    });

    botInstance.onText(/\/cancel/, async (msg) => {
       const chatId = msg.chat.id;
       await clearSession(chatId);
       botInstance.sendMessage(chatId, "Current operation cancelled. 🛑");
       sendHomeMenu(chatId);
    });

    // --- Interactive Callbacks ---

    botInstance.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const data = query.data;
      if (!chatId || !data) return;

      const session = await getSession(chatId);

      // Home Menu Callbacks
      if (data === 'menu_log') {
        botInstance.answerCallbackQuery(query.id);
        return handleLogCommand(chatId);
      } else if (data === 'menu_intake') {
        botInstance.answerCallbackQuery(query.id);
        return handleIntakeCommand(chatId);
      } else if (data === 'menu_payment') {
        botInstance.answerCallbackQuery(query.id);
        return handlePaymentCommand(chatId);
      } else if (data === 'menu_projects') {
        botInstance.answerCallbackQuery(query.id);
        return handleProjectsCommand(chatId);
      } else if (data === 'menu_report') {
        botInstance.answerCallbackQuery(query.id);
        return handleReportCommand(chatId);
      }

      // Generic Navigation Callbacks
      if (data === 'back_to_home') {
         botInstance.answerCallbackQuery(query.id);
         // Do not completely clear session, just go to home
         // wait, clear session might wipe activeProjectId?
         // We should just reset the step but keep activeProjectId.
         await updateSession(chatId, {
            step: null,
            taskId: null,
            currentMaterialId: null,
            currentVendorId: null,
            currentLaborRole: null,
            currentLaborRate: null,
            materials: [],
            labor: [],
            photos: []
         });
         return sendHomeMenu(chatId);
      }
      if (data === 'back_to_log_vend') {
         botInstance.answerCallbackQuery(query.id);
         if (session?.projectId) {
            return showLaborVendorSelection(chatId, session.projectId);
         }
      }
      if (data === 'back_to_intake_vend') {
         botInstance.answerCallbackQuery(query.id);
         if (session?.projectId || session?.activeProjectId) {
            return showIntakeVendorSelection(chatId, session.projectId || session.activeProjectId);
         }
      }

      // Set Active Project
      if (data.startsWith('set_active_proj:')) {
        const projectId = data.split(':')[1];
        await updateSession(chatId, { activeProjectId: projectId });
        botInstance.answerCallbackQuery(query.id);
        sendHomeMenu(chatId, "✅ Project selected successfully.");
        return;
      }
      
      // Change Project (from menu)
      if (data === 'menu_change_proj') {
        botInstance.answerCallbackQuery(query.id);
        return handleStartProjectSelect(chatId, "🔄 Change active project:");
      }

      // Intake Vendor Selection
      if (data.startsWith('in_vend:')) {
        const vendorId = data.split(':')[1];
        botInstance.answerCallbackQuery(query.id);
        const projectId = session?.projectId || session?.activeProjectId;
        if (!projectId) return;
        return showIntakeMaterialGroupSelection(chatId, projectId, vendorId);
      }

      if (data === 'ignore') {
         botInstance.answerCallbackQuery(query.id);
         return;
      }

      if (data.startsWith('sel_ph_idx:')) {
         const idx = parseInt(data.split(':')[1]);
         const selectedPhase = session.availablePhases?.[idx];
         botInstance.answerCallbackQuery(query.id);
         if (selectedPhase && session.activeProjectId) {
            return showLocationsForLog(chatId, session.activeProjectId, selectedPhase);
         }
         return;
      }

      if (data.startsWith('sel_loc_idx:')) {
         const idx = parseInt(data.split(':')[1]);
         const selectedLocation = session.availableLocations?.[idx];
         botInstance.answerCallbackQuery(query.id);
         if (selectedLocation && session.activeProjectId && session.selectedPhase) {
            return showTasksForLog(chatId, session.activeProjectId, session.selectedPhase, selectedLocation);
         }
         return;
      }

      if (data.startsWith('cal_prev:')) {
         const parts = data.split(':');
         let year = parseInt(parts[1]);
         let month = parseInt(parts[2]) - 1;
         if (month < 0) { month = 11; year--; }
         
         botInstance.editMessageReplyMarkup({ inline_keyboard: generateCalendar(year, month) }, {
            chat_id: chatId,
            message_id: query.message?.message_id
         }).catch(() => {});
         botInstance.answerCallbackQuery(query.id);
         return;
      }

      if (data.startsWith('cal_next:')) {
         const parts = data.split(':');
         let year = parseInt(parts[1]);
         let month = parseInt(parts[2]) + 1;
         if (month > 11) { month = 0; year++; }
         
         botInstance.editMessageReplyMarkup({ inline_keyboard: generateCalendar(year, month) }, {
            chat_id: chatId,
            message_id: query.message?.message_id
         }).catch(() => {});
         botInstance.answerCallbackQuery(query.id);
         return;
      }

      if (data.startsWith('cal_sel:')) {
         const selection = data.split(':')[1];
         let dateToUse = selection;
         if (dateToUse.toLowerCase() === 'today') {
            dateToUse = new Date().toISOString().split('T')[0];
         }
         
         await updateSession(chatId, { step: 'awaiting_progress', reportDate: dateToUse });
         
         botInstance.editMessageText(`📅 Date selected: ${dateToUse}\n\n📝 *Step 3: Progress Update*\nWhat is the current progress percentage (0-100)?`, {
             chat_id: chatId,
             message_id: query.message?.message_id,
             parse_mode: 'Markdown',
             reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
         }).catch(() => {});

         botInstance.answerCallbackQuery(query.id);
         return;
      }

      // Log Flow: Step Select Task
      if (data.startsWith('sel_task:')) {
        const taskId = data.split(':')[1];
        
        let taskName = 'Unknown Task';
        const projectId = session.projectId || session.activeProjectId;
        if (projectId) {
            try {
                const taskSnap = await db.collection(`projects/${projectId}/tasks`).doc(taskId).get();
                if (taskSnap.exists) {
                    taskName = taskSnap.data()?.name || 'Unknown Task';
                }
            } catch (err) {
                console.error("Error fetching task name:", err);
            }
        }
        
        await updateSession(chatId, { step: 'awaiting_date', taskId, taskName });
        const now = new Date();
        const calKeyboard = generateCalendar(now.getFullYear(), now.getMonth());
        botInstance?.sendMessage(chatId, `📅 *Step 4: Report Date*\nPlease select the date for this report:`, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: calKeyboard }
        });
      }

      // Material Group Selection
      else if (data.startsWith('sel_mat_grp:')) {
        const grpIdx = parseInt(data.split(':')[1]);
        const grpName = session.availableMaterialGroups?.[grpIdx];
        if (grpName) {
           await showMaterialsForGroup(chatId, session.projectId, grpName);
        } else {
           botInstance.sendMessage(chatId, "Category not found. Please try again.");
           showMaterialSelection(chatId, session.projectId);
        }
      }

      // Material Selection
      else if (data.startsWith('sel_mat:')) {
        const itemId = data.split(':')[1];
        await updateSession(chatId, { step: 'awaiting_material_qty', currentMaterialId: itemId });
        botInstance.sendMessage(chatId, "How many units were used today?", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
        });
      }

      // Labor Vendor Selection
      else if (data.startsWith('sel_vend:')) {
        const vendorId = data.split(':')[1];
        const rateCardsSnap = await db.collection(`projects/${session.projectId}/labor_rate_cards`).get();
        const vendorRates = rateCardsSnap.docs.filter(d => d.data().vendorId === vendorId);

        if (vendorRates.length === 0) {
          botInstance.sendMessage(chatId, "No roles defined for this vendor. Choose another or skip.");
          showLaborVendorSelection(chatId, session.projectId);
          return;
        }

        const keyboard = vendorRates.map(doc => ([{
          text: `🏷️ ${doc.data().role} (₹${doc.data().rate})`, 
          callback_data: `sel_role:${doc.data().role}:${doc.data().rate}`
        }]));
        keyboard.push([{ text: "🔙 Back to Vendors", callback_data: "back_to_log_vend" }]);
        keyboard.push([{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]);

        await updateSession(chatId, { step: 'selecting_labor_role', currentVendorId: vendorId });
        botInstance.sendMessage(chatId, "Select the labor role/trade:", {
          reply_markup: { inline_keyboard: keyboard }
        });
      }

      // Labor Role Selection
      else if (data.startsWith('sel_role:')) {
        const [_, role, rate] = data.split(':');
        await updateSession(chatId, { 
          step: 'awaiting_labor_headcount', 
          currentLaborRole: role,
          currentLaborRate: parseFloat(rate)
        });
        botInstance.sendMessage(chatId, `How many ${role}(s) were deployed?`, {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
        });
      }

      // Flow Navigation
      else if (data === 'skip_materials') {
        askLaborAdd(chatId);
      }
      else if (data === 'add_more_materials') {
        showMaterialSelection(chatId, session.projectId);
      }
      else if (data === 'skip_labor') {
        askPhotoUpload(chatId);
      }
      else if (data === 'add_more_labor') {
        showLaborVendorSelection(chatId, session.projectId);
      }
      else if (data === 'add_photo') {
        await updateSession(chatId, { step: 'awaiting_photo' });
        botInstance.sendMessage(chatId, "📸 Please upload/send the photo now.", {
          reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
        });
      }
      else if (data === 'finish_log') {
        finishLogging(chatId, false);
      }
      else if (data === 'finish_log_next') {
        finishLogging(chatId, true);
      }

      // Intake Selection Flow
      else if (data.startsWith('in_mat_grp:')) {
         const grpIdx = parseInt(data.split(':')[1]);
         const grpName = session.availableMaterialGroups?.[grpIdx];
         if (grpName) {
            await showIntakeMaterialSelection(chatId, session.projectId || session.activeProjectId || '', grpName);
         } else {
            botInstance.sendMessage(chatId, "Category not found. Please try again.");
            if (session.projectId || session.activeProjectId) {
                showIntakeMaterialGroupSelection(chatId, session.projectId || session.activeProjectId || '', session.currentVendorId || '');
            }
         }
      }
      else if (data === 'back_to_intake_mat_grp') {
          botInstance.answerCallbackQuery(query.id);
          if (session.projectId || session.activeProjectId) {
              showIntakeMaterialGroupSelection(chatId, session.projectId || session.activeProjectId || '', session.currentVendorId || '');
          }
      }
      else if (data.startsWith('in_mat:')) {
         const itemId = data.split(':')[1];
         await updateSession(chatId, { step: 'intake_awaiting_qty', currentMaterialId: itemId });
         botInstance.sendMessage(chatId, "How many units were received?", {
           reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
         });
      }

      // Payment Selection Flow
      else if (data.startsWith('pay_vend:')) {
         const vendorId = data.split(':')[1];
         await updateSession(chatId, { step: 'pay_awaiting_amount', currentVendorId: vendorId });
         botInstance.sendMessage(chatId, "How much was paid?", {
           reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
         });
      }

      botInstance.answerCallbackQuery(query.id);
    });

    // --- Message Input Handler ---

    botInstance.on('message', async (msg) => {
      // @ts-ignore
      const chatId = msg.chat.id;
      const session = await getSession(chatId);
      if (!session) return;

      // Handle photos directly
      if (session.step === 'awaiting_photo' && msg.photo) {
        botInstance.sendMessage(chatId, "📸 Photo received! Processing...");
        const photo = msg.photo[msg.photo.length - 1]; 
        try {
          const fileLink = await botInstance.getFileLink(photo.file_id);
          const photosToSave = session.photos || [];
          photosToSave.push(fileLink);
          await updateSession(chatId, { photos: photosToSave, step: 'awaiting_photo' });
          botInstance.sendMessage(chatId, "Photo added! Send another photo, or save:", {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Save & Log Another ➕", callback_data: "finish_log_next" }],
                  [{ text: "Finish Day ✅", callback_data: "finish_log" }],
                  [{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]
                ]
              }
          });
        } catch (error) {
          console.error("Photo link error", error);
          botInstance.sendMessage(chatId, "Failed to process photo. Try again.");
        }
        return;
      }
      
      if (!msg.text || msg.text.startsWith('/')) return;

      if (session.step === 'awaiting_date') {
        botInstance.sendMessage(chatId, "Please select the date using the calendar buttons above.");
        return;
      }
      else if (session.step === 'awaiting_progress') {
        const progress = parseInt(msg.text);
        if (isNaN(progress) || progress < 0 || progress > 100) {
          botInstance.sendMessage(chatId, "Please enter a valid percentage (0-100).");
          return;
        }
        await updateSession(chatId, { step: 'awaiting_remarks', progress });
        botInstance.sendMessage(chatId, "✅ Progress recorded. \n\n*Step 4: Remarks*\nType any site remarks or milestone notes (or type 'None'):", { 
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
        });
      } 
      
      else if (session.step === 'awaiting_remarks') {
        const remarks = msg.text.toLowerCase() === 'none' ? '' : msg.text;
        await updateSession(chatId, { step: 'selecting_material', remarks });
        showMaterialSelection(chatId, session.projectId);
      }

      else if (session.step === 'awaiting_material_qty') {
        const qty = parseFloat(msg.text);
        if (isNaN(qty) || qty <= 0) {
          botInstance.sendMessage(chatId, "Please enter a valid quantity.");
          return;
        }
        const materials = session.materials || [];
        const invSnap = await db.collection(`projects/${session.projectId}/inventory`).doc(session.currentMaterialId).get();
        const matData = invSnap.data();

        const unitCost = matData?.avgUnitCost || matData?.unitCost || 0;
        const totalPrice = unitCost * qty;

        materials.push({
          itemId: session.currentMaterialId,
          name: matData?.name || 'Unknown',
          quantity: qty,
          unit: matData?.unit || 'Nos',
          unitCost: unitCost,
          totalPrice: totalPrice
        });

        await updateSession(chatId, { materials, currentMaterialId: null });
        botInstance.sendMessage(chatId, `Logged: ${matData?.name} x ${qty}. Add more?`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Add More ➕", callback_data: "add_more_materials" }, { text: "Next Step ➡️", callback_data: "skip_materials" }],
              [{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]
            ]
          }
        });
      }

      else if (session.step === 'awaiting_labor_headcount') {
        const headcount = parseInt(msg.text);
        if (isNaN(headcount) || headcount <= 0) {
          botInstance.sendMessage(chatId, "Please enter a valid count.");
          return;
        }
        const labor = session.labor || [];
        const vendorSnap = await db.collection(`projects/${session.projectId}/suppliers`).doc(session.currentVendorId).get();
        const vendorData = vendorSnap.data();

        labor.push({
          vendorId: session.currentVendorId,
          vendorName: vendorData?.name || 'Unknown',
          role: session.currentLaborRole,
          headcount: headcount,
          rate: session.currentLaborRate,
          cost: headcount * session.currentLaborRate
        });

        await updateSession(chatId, { labor, currentVendorId: null, currentLaborRole: null, currentLaborRate: null });
        botInstance.sendMessage(chatId, `Logged: ${headcount} ${session.currentLaborRole}(s). Add more labor?`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Add More ➕", callback_data: "add_more_labor" }, { text: "Next Step ➡️", callback_data: "skip_labor" }],
              [{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]
            ]
          }
        });
      }
      
      // Intake Handlers
      else if (session.step === 'intake_awaiting_qty') {
         const qty = parseFloat(msg.text);
         if (isNaN(qty) || qty <= 0) {
            botInstance.sendMessage(chatId, "Please enter a valid quantity.");
            return;
         }
         await updateSession(chatId, { step: 'intake_awaiting_rate', intakeQty: qty });
         botInstance.sendMessage(chatId, "What was the unit rate (price per unit) for this delivery?", {
           reply_markup: { inline_keyboard: [[{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]] }
         });
      }
      else if (session.step === 'intake_awaiting_rate') {
         const rate = parseFloat(msg.text);
         if (isNaN(rate) || rate < 0) {
            botInstance.sendMessage(chatId, "Please enter a valid amount.");
            return;
         }
         
         const cost = rate * (session.intakeQty || 0);

         const projectId = session.projectId || session.activeProjectId;
         const materialId = session.currentMaterialId;
         const vendorId = session.currentVendorId;
         const intakeQty = session.intakeQty;

         if (!projectId || !materialId || !vendorId || intakeQty === undefined) {
             console.error("Intake session data missing:", { projectId, materialId, vendorId, intakeQty });
             botInstance.sendMessage(chatId, `Session error: Missing data (Proj: ${!!projectId}, Mat: ${!!materialId}, Vend: ${!!vendorId}, Qty: ${!!intakeQty}). Please restart /intake.`);
             return;
         }

         botInstance.sendMessage(chatId, "💾 *Processing Receipt...*", { parse_mode: 'Markdown' });
         
         try {
             // 1. Get/Check Material
             const matRef = db.collection(`projects/${projectId}/inventory`).doc(materialId);
             const invSnap = await matRef.get();
             if (!invSnap.exists) {
                 throw new Error(`Material with ID ${materialId} not found in project ${projectId}`);
             }
             const matData = invSnap.data();
             
             // 2. Get/Check Vendor
             const vendorSnap = await db.collection(`projects/${projectId}/suppliers`).doc(vendorId).get();
             const vendorName = vendorSnap.exists ? vendorSnap.data()?.name : 'Unknown';

             // 3. Update inventory quantity
             const currentQty = matData?.quantity || 0;
             try {
                 await matRef.update({
                     quantity: currentQty + intakeQty
                 });
             } catch (updateErr: any) {
                 throw new Error(`Update inventory failed: ${updateErr.message}`);
             }
             
             let ledgerId: string | undefined = undefined;
             // 5. Also log to ledger if cost is > 0
             if (cost > 0) {
                 try {
                     const currentBal = vendorSnap.data()?.outstandingBalance || 0;
                     await db.collection(`projects/${projectId}/suppliers`).doc(vendorId).update({
                         outstandingBalance: currentBal + cost
                     });

                     const ledgerRef = await db.collection(`projects/${projectId}/ledger`).add({
                         projectId: projectId,
                         vendorId: vendorId,
                         date: new Date().toISOString(),
                         type: 'CREDIT',
                         amount: cost,
                         referenceType: 'GRN',
                         description: `Intake: ${matData?.name} x ${intakeQty}`
                     });
                     ledgerId = ledgerRef.id;
                 } catch (ledgerErr: any) {
                     console.error("Ledger log error:", ledgerErr);
                     // Non-blocking for the user, but we log it
                 }
             }

             // 4. Create GRN / Receipt record
             const receiptPath = `projects/${projectId}/receipts`;
             const receiptData: any = {
                 projectId: projectId,
                 receiptDate: new Date().toISOString().split('T')[0],
                 invoiceNumber: 'BOT-' + Date.now().toString(),
                 items: [{
                    itemId: materialId,
                    materialId: materialId,
                    name: matData?.name || 'Unknown',
                    quantity: intakeQty,
                    unitRate: rate,
                    totalPrice: cost
                 }],
                 totalAmount: cost,
                 supplierId: vendorId,
                 supplierName: vendorName,
                 status: 'Delivered',
                 createdAt: new Date().toISOString()
             };
             if (ledgerId) {
                 receiptData.ledgerId = ledgerId;
             }

             try {
                 console.log(`Attempting to add receipt to ${receiptPath}`, receiptData);
                 await db.collection(receiptPath).add(receiptData);
             } catch (addErr: any) {
                 console.error("Critical Receipt Add Failure:", addErr);
                 throw new Error(`Add receipt failed (Path: ${receiptPath}): ${addErr.message}`);
             }

             const reportDate = new Date().toISOString().split('T')[0];
             const reportRef = db.collection(`projects/${projectId}/daily_site_reports`).doc(reportDate);
             const reportSnap = await reportRef.get();
             const existingData = reportSnap.exists ? reportSnap.data() : null;

             const newReceipts = [...(existingData?.receipts || [])];
             newReceipts.push({
                vendorId: vendorId,
                materialName: matData?.name || 'Unknown',
                quantity: intakeQty,
                unit: matData?.unit || 'Nos',
                unitCost: rate
             });

             const reportData: any = {
                 projectId: projectId,
                 date: reportDate,
                 activeSubTab: existingData ? 'combined' : 'logistics',
                 receipts: newReceipts,
                 labor: existingData?.labor || [],
                 consumption: existingData?.consumption || [],
                 payments: existingData?.payments || [],
                 photos: existingData?.photos || [],
                 materialsCount: (existingData?.consumption?.length || 0) + newReceipts.length,
                 laborCount: existingData?.labor?.length || 0,
                 paymentCount: existingData?.payments?.length || 0,
                 createdAt: existingData?.createdAt || new Date().toISOString()
             };
             await reportRef.set(reportData, { merge: true });
             
             botInstance.sendMessage(chatId, `✅ *Receipt Logged!*\nAdded ${intakeQty} of ${matData?.name} to inventory.\nTotal Value: ₹${cost.toFixed(2)}`, { parse_mode: 'Markdown' });
             await clearSession(chatId);
             sendHomeMenu(chatId);
         } catch (e: any) {
             console.error("Intake save error:", e);
             botInstance.sendMessage(chatId, `Error saving intake: ${e.message || "Unknown error"}. ❌`);
         }
      }
      
      // Payment Handlers
      else if (session.step === 'pay_awaiting_amount') {
         const amount = parseFloat(msg.text);
         if (isNaN(amount) || amount <= 0) {
            botInstance.sendMessage(chatId, "Please enter a valid amount.");
            return;
         }
         
         const projectId = session.projectId || session.activeProjectId;
         const vendorId = session.currentVendorId;

         if (!projectId || !vendorId) {
             botInstance.sendMessage(chatId, `Session error: Missing data (Proj: ${!!projectId}, Vendor: ${!!vendorId}). Please restart /pay.`);
             return;
         }

         botInstance.sendMessage(chatId, "💾 *Processing Payment...*", { parse_mode: 'Markdown' });
         
         try {
             const vendorRef = db.collection(`projects/${projectId}/suppliers`).doc(vendorId);
             const vendorSnap = await vendorRef.get();
             if (!vendorSnap.exists) {
                 throw new Error(`Vendor with ID ${vendorId} not found`);
             }

             const currentBal = vendorSnap.data()?.outstandingBalance || 0;
             await vendorRef.update({
                 outstandingBalance: currentBal - amount
             });
             
             await db.collection(`projects/${projectId}/ledger`).add({
                 projectId: projectId,
                 vendorId: vendorId,
                 date: new Date().toISOString(),
                 type: 'DEBIT',
                 amount: amount,
                 referenceType: 'PAYMENT',
                 description: 'Advance / Settlement via Telegram'
             });

             const reportDate = new Date().toISOString().split('T')[0];
             const reportRef = db.collection(`projects/${projectId}/daily_site_reports`).doc(reportDate);
             const reportSnap = await reportRef.get();
             const existingData = reportSnap.exists ? reportSnap.data() : null;

             const newPayments = [...(existingData?.payments || [])];
             newPayments.push({
                vendorId: vendorId,
                amount: amount,
                method: 'Telegram Bot',
                reference: 'ADV_SETTLEMENT'
             });

             const reportData: any = {
                 projectId: projectId,
                 date: reportDate,
                 activeSubTab: existingData ? 'combined' : 'logistics',
                 payments: newPayments,
                 receipts: existingData?.receipts || [],
                 labor: existingData?.labor || [],
                 consumption: existingData?.consumption || [],
                 photos: existingData?.photos || [],
                 materialsCount: (existingData?.consumption?.length || 0) + (existingData?.receipts?.length || 0),
                 laborCount: existingData?.labor?.length || 0,
                 paymentCount: newPayments.length,
                 createdAt: existingData?.createdAt || new Date().toISOString()
             };
             await reportRef.set(reportData, { merge: true });
             
             botInstance.sendMessage(chatId, `✅ *Payment Recorded!*\nLogged amount of ${amount} to ${vendorSnap.data()?.name || 'Vendor'}.`, { parse_mode: 'Markdown' });
             await clearSession(chatId);
             sendHomeMenu(chatId);
         } catch (e: any) {
             console.error("Payment save error:", e);
             botInstance.sendMessage(chatId, `Error saving payment: ${e.message || "Unknown error"}. ❌`);
         }
      }
    });

    // --- Helpers ---

    async function showMaterialSelection(chatId: number, projectId: string) {
       const invSnap = await db.collection(`projects/${projectId}/inventory`).get();
       if (invSnap.empty) {
         botInstance.sendMessage(chatId, "No inventory catalog found. Skipping materials...");
         askLaborAdd(chatId);
         return;
       }

       const groups = new Set<string>();
       invSnap.docs.forEach(doc => {
           groups.add(doc.data().groupCode || "Uncategorized");
       });

       const groupList = Array.from(groups);
       await updateSession(chatId, { step: 'selecting_material_group', availableMaterialGroups: groupList });

       const keyboard = groupList.map((grp, idx) => ([{
         text: `📁 ${grp}`, 
         callback_data: `sel_mat_grp:${idx}`
       }]));
       keyboard.push([{ text: "No Materials Today ➡️", callback_data: "skip_materials" }]);
       keyboard.push([{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]);

       botInstance.sendMessage(chatId, "📦 *Step 5: Materials*\nSelect a material category:", {
         parse_mode: 'Markdown',
         reply_markup: { inline_keyboard: keyboard }
       });
    }

    async function showMaterialsForGroup(chatId: number, projectId: string, groupCode: string) {
       const invSnap = await db.collection(`projects/${projectId}/inventory`).get();
       const items = invSnap.docs.filter(doc => (doc.data().groupCode || "Uncategorized") === groupCode);
       
       const keyboard = items.map(doc => ([{
         text: `📦 ${doc.data().name} (${doc.data().quantity} in stock)`, 
         callback_data: `sel_mat:${doc.id}`
       }]));
       keyboard.push([{ text: "🔙 Back to Categories", callback_data: "add_more_materials" }]);
       keyboard.push([{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]);

       botInstance.sendMessage(chatId, `📦 *Category: ${groupCode}*\nSelect a material:`, {
         parse_mode: 'Markdown',
         reply_markup: { inline_keyboard: keyboard }
       });
    }

    async function askLaborAdd(chatId: number) {
      botInstance.sendMessage(chatId, "👷 *Step 6: Manpower*\nWould you like to log labor deployment for today?", {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "Yes, Log Labor 👷", callback_data: "add_more_labor" }, { text: "No Labor Today ➡️", callback_data: "skip_labor" }],
            [{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]
          ]
        }
      });
    }

    async function askPhotoUpload(chatId: number) {
      botInstance.sendMessage(chatId, "📸 *Step 7: Photos*\nWould you like to upload a site photo for this task?", {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "Yes 📸", callback_data: "add_photo" }],
            [{ text: "No, Save & Log Another ➕", callback_data: "finish_log_next" }],
            [{ text: "No, Finish Day ✅", callback_data: "finish_log" }],
            [{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]
          ]
        }
      });
    }

    async function showLaborVendorSelection(chatId: number, projectId: string) {
      const vendorsSnap = await db.collection(`projects/${projectId}/suppliers`).get();
      const vendors = vendorsSnap.docs.filter(doc => {
             const type = doc.data().type;
             return type === 'Labor' || type === 'Both' || !type;
      });

      if (vendors.length === 0) {
        botInstance.sendMessage(chatId, "No labor contractors defined. Skipping labor...");
        finishLogging(chatId);
        return;
      }

      const keyboard = vendors.map(doc => ([{
        text: `🏢 ${doc.data().name}`, 
        callback_data: `sel_vend:${doc.id}`
      }]));
      keyboard.push([{ text: "Done with Labor ➡️", callback_data: "skip_labor" }]);
      keyboard.push([{ text: "🔙 Cancel Update", callback_data: "back_to_home" }]);

      botInstance.sendMessage(chatId, "Select the vendor/contractor providing labor:", {
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    async function finishLogging(chatId: number, continueLogging: boolean = false) {
      const session = await getSession(chatId);
      if (!session) return;

      try {
        botInstance.sendMessage(chatId, "💾 *Submitting Daily Report...*");
        
        const projectId = session.projectId || session.activeProjectId;
        if (!projectId) throw new Error("Missing Project ID");

        // 1. Create consolidated report entry
        const reportDate = session.reportDate || new Date().toISOString().split('T')[0];
        const reportRef = db.collection(`projects/${projectId}/daily_site_reports`).doc(reportDate);
        const reportSnap = await reportRef.get();
        const existingData = reportSnap.exists ? reportSnap.data() : null;

        const newConsumption = [...(existingData?.consumption || []), ...(session.materials || [])];
        const newLabor = [...(existingData?.labor || []), ...(session.labor || [])];
        const newPhotos = [...(existingData?.photos || []), ...(session.photos || [])];
        const sessionRemarks = session.remarks || '';
        const dayTasks = existingData?.dayTasks || [];
        
        if (session.taskId) {
           const existingTaskIndex = dayTasks.findIndex((t: any) => t.taskId === session.taskId);
           if (existingTaskIndex >= 0) {
               dayTasks[existingTaskIndex].progressUpdate = session.progress;
               dayTasks[existingTaskIndex].remarks = sessionRemarks;
           } else {
               dayTasks.push({
                   taskId: session.taskId,
                   taskName: session.taskName || 'N/A',
                   progressUpdate: session.progress,
                   remarks: sessionRemarks
               });
           }
        }

        const reportData: any = {
          projectId: projectId,
          date: reportDate,
          dayTasks: dayTasks,
          taskId: dayTasks.length > 0 ? dayTasks[0].taskId : (existingData?.taskId || null),
          taskName: dayTasks.length > 0 ? dayTasks.map((t: any) => t.taskName).join(', ') : (existingData?.taskName || 'N/A'),
          progressUpdate: dayTasks.length > 0 ? dayTasks[dayTasks.length - 1].progressUpdate : (existingData?.progressUpdate || null),
          remarks: dayTasks.map((t: any) => `${t.taskName}: ${t.remarks}`).join('\n') || existingData?.remarks || '',
          activeSubTab: existingData ? 'combined' : 'production',
          consumption: newConsumption,
          labor: newLabor,
          receipts: existingData?.receipts || [],
          payments: existingData?.payments || [],
          photos: newPhotos,
          materialsCount: newConsumption.length + (existingData?.receipts?.length || 0),
          laborCount: newLabor.length,
          paymentCount: existingData?.payments?.length || 0,
          createdAt: existingData?.createdAt || new Date().toISOString()
        };

        await reportRef.set(reportData, { merge: true });

        // 2. Update task progress status
        if (session.taskId) {
            const status = session.progress === 100 ? 'Completed' : (session.progress > 0 ? 'In Progress' : 'Pending');
            await db.collection(`projects/${projectId}/tasks`).doc(session.taskId).update({
              progress: session.progress,
              status,
              lastProgressUpdate: new Date().toISOString().split('T')[0],
              updatedAt: FieldValue.serverTimestamp()
            });
        }

        // 3. Process Material Consumption in Inventory
        if (session.materials && session.materials.length > 0) {
            for (const mat of session.materials) {
                const invSnap = await db.collection(`projects/${projectId}/inventory`).doc(mat.itemId).get();
                if (invSnap.exists) {
                    const currentQty = invSnap.data().quantity || 0;
                    await db.collection(`projects/${projectId}/inventory`).doc(mat.itemId).update({
                        quantity: currentQty - mat.quantity
                    });
                }
            }
            
            const totalCost = session.materials.reduce((acc: number, m: any) => acc + (m.totalPrice || 0), 0);
            
            // Also add a consumption issue record
            await db.collection(`projects/${projectId}/material_issues`).add({
                projectId: projectId,
                taskId: session.taskId,
                issueDate: new Date().toISOString().split('T')[0],
                items: session.materials.map((m: any) => ({
                    itemId: m.itemId,
                    name: m.name,
                    quantity: m.quantity,
                    unitCost: m.unitCost || 0, 
                    totalPrice: m.totalPrice || 0
                })),
                totalCost: totalCost,
                createdAt: new Date().toISOString()
            });
        }

        // 4. Process Labor Logs and Vendor Balances
        if (session.labor && session.labor.length > 0) {
            for (const lab of session.labor) {
                const vendorSnap = await db.collection(`projects/${projectId}/suppliers`).doc(lab.vendorId).get();
                const cost = lab.cost || 0;

                // Add to ledger first to get ID
                let ledgerId: string | undefined = undefined;
                try {
                    const ledgerRef = await db.collection(`projects/${projectId}/ledger`).add({
                        projectId: projectId,
                        vendorId: lab.vendorId,
                        date: new Date().toISOString(),
                        type: 'CREDIT',
                        amount: cost,
                        referenceType: 'LABOR_DEPLOYMENT',
                        description: `Daily Log - ${lab.role} x ${lab.headcount}`
                    });
                    ledgerId = ledgerRef.id;
                } catch (ledgerErr) {
                    console.error("Ledger log error:", ledgerErr);
                }

                const logData: any = {
                    projectId: projectId,
                    vendorId: lab.vendorId,
                    vendorName: lab.vendorName,
                    date: new Date().toISOString().split('T')[0],
                    totalCost: cost,
                    status: 'Approved',
                    items: [{
                        taskId: session.taskId,
                        role: lab.role,
                        headcount: lab.headcount,
                        shifts: 1,
                        rate: lab.rate,
                        cost: cost
                    }],
                    createdAt: new Date().toISOString()
                };
                if (ledgerId) {
                    logData.ledgerId = ledgerId;
                }

                // Create labor log entry
                await db.collection(`projects/${projectId}/labor_logs`).add(logData);

                // Update vendor balance
                if (vendorSnap.exists) {
                    const currentBal = vendorSnap.data().outstandingBalance || 0;
                    await db.collection(`projects/${projectId}/suppliers`).doc(lab.vendorId).update({
                        outstandingBalance: currentBal + cost
                    });
                }
            }
        }

        // 5. Also add photos to Document Vault for archival
        if (session.photos && session.photos.length > 0) {
            for (const photoUrl of session.photos) {
                const docData: any = {
                    projectId: projectId,
                    name: `Bot Photo Update - ${new Date().toISOString().split('T')[0]}`,
                    size: 'Unknown',
                    type: 'Image',
                    url: photoUrl,
                    uploadedBy: 'Telegram Bot',
                    uploadedAt: new Date().toISOString(),
                    accessLevel: 'Internal',
                    category: 'Site Photos'
                };
                if (session.taskId) docData.taskId = session.taskId;
                await db.collection(`projects/${projectId}/documents`).add(docData);
            }
        }

        // 6. Update task actual costs for backwards compatibility
        if (session.taskId) {
            const taskSnap = await db.collection(`projects/${projectId}/tasks`).doc(session.taskId).get();
            if (taskSnap.exists) {
                const taskData = taskSnap.data();
                const totalMatCost = session.materials ? session.materials.reduce((acc: number, m: any) => acc + (m.totalPrice || 0), 0) : 0;
                const totalLabCost = session.labor ? session.labor.reduce((acc: number, l: any) => acc + (l.cost || 0), 0) : 0;
                
                await db.collection(`projects/${projectId}/tasks`).doc(session.taskId).update({
                    actualMaterialCost: (taskData?.actualMaterialCost || 0) + totalMatCost,
                    actualLaborCost: (taskData?.actualLaborCost || 0) + totalLabCost,
                    actualCost: (taskData?.actualCost || 0) + totalMatCost + totalLabCost
                });
            }
        }

        if (continueLogging) {
            botInstance.sendMessage(chatId, "✨ *Task Saved!* 🏗️\n\nPlease select the next task you'd like to log:", { parse_mode: 'Markdown' });
            
            // Clear only task specific data
            await updateSession(chatId, {
                taskId: null,
                taskName: null,
                materials: [],
                labor: [],
                photos: [],
                remarks: '',
                step: 'selecting_task'
            });
            
            // Provide the task selection keyboard directly again
            if (session.selectedPhase && session.selectedLocation) {
                await showTasksForLog(chatId, projectId, session.selectedPhase, session.selectedLocation);
            } else {
                await showPhasesForLog(chatId, projectId); 
            }
        } else {
            botInstance.sendMessage(chatId, "✨ *Success! Site Report Published.* 🏗️\n\nAll inventory, labor, and progress records have been synced with the central dashboard.", { parse_mode: 'Markdown' });
            await clearSession(chatId);
            sendHomeMenu(chatId);
        }
      } catch (error) {
        console.error("Submission error:", error);
        botInstance.sendMessage(chatId, "❌ *Submission Failed.*\nError connecting to server. Please try again or use the web dashboard.", { parse_mode: 'Markdown' });
      }
    }
  }

  // --- Native Express Middleware ---
  app.use(express.json());

  // API demo route
  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok", botActive: !!bot });
  });

  app.get("/api/bot-ping", async (req, res) => {
    if (!bot) {
      return res.status(503).json({ error: "Bot not initialized" });
    }
    try {
      const start = Date.now();
      await bot.getMe();
      const rtt = Date.now() - start;
      res.json({ status: "ok", rtt });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/firebase-info", async (req, res) => {
    try {
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      const configProjectId = firebaseConfig.projectId || "unknown";
      
      let connectionTest = "untested";
      try {
        await db.collection("projects").limit(1).get();
        connectionTest = "ok";
      } catch (e: any) {
        connectionTest = `error: ${e.message}`;
      }

      res.json({
        configProjectId: configProjectId,
        configDatabaseId: dbId,
        connectionTest
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
