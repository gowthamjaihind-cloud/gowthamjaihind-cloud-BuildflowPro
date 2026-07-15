import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

  // --- Native Express Middleware ---
  app.use(express.json());

  // API demo route
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
