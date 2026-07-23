import { startPolling, handleTelegramWebhook, getTelegramBotStatus } from './src/server/telegram';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import fs from "fs";

// --- Firebase Admin Setup ---
const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
let db: FirebaseFirestore.Firestore;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized securely.");
  } catch (e) {
    console.error("Failed to initialize Firebase Admin with service account:", e);
    process.exit(1);
  }
} else {
  console.warn("⚠️ firebase-service-account.json not found! Falling back to unauthenticated connection.");
  initializeApp({
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId
  });
}

// In preview environments where custom DBs are created, we must honor the databaseId
const dbOptions: FirebaseFirestore.Settings = {
  ignoreUndefinedProperties: true
};

if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
  dbOptions.databaseId = firebaseConfig.firestoreDatabaseId;
}

db = getFirestore();
db.settings(dbOptions);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  
  app.post("/api/telegram-webhook", handleTelegramWebhook);
  app.get("/api/telegram-status", getTelegramBotStatus);

  app.get("/api/health", async (req, res) => {
    res.json({ status: "ok" });
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

  
  // Start Telegram bot polling

  
  // Start Telegram bot polling
  

  
  // Start Telegram bot polling

  
  // Start Telegram bot polling
  

  startPolling();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
