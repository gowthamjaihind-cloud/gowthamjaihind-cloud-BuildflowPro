import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

// Load config
const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
initializeApp({
    credential: applicationDefault(),
    projectId: config.projectId
});
const db = getFirestore();

async function migrate() {
    const projectsSnap = await db.collection('projects').get();
    for (const project of projectsSnap.docs) {
        const projectId = project.id;
        console.log(`Processing project ${projectId}...`);
        
        const reportsSnap = await db.collection(`projects/${projectId}/daily_site_reports`).get();
        console.log(`Found ${reportsSnap.size} reports.`);
        
        for (const report of reportsSnap.docs) {
            const data = report.data();
            const dayTasks = data.dayTasks || [];
            
            for (const task of dayTasks) {
                // Create a dailyLogs entry
                const logData = {
                    projectId,
                    taskId: task.taskId,
                    workDate: data.date,
                    progressPercent: task.progressUpdate || 0,
                    markComplete: task.progressUpdate === 100,
                    note: (task.remarks || "") + "\n\n[Materials and Labor for this Telegram log are preserved in the legacy system.]",
                    createdAt: data.createdAt || data.date,
                    createdByUid: "telegram-bot",
                    createdByName: "Telegram Bot",
                    materials: [],
                    labour: [],
                    photoUrls: data.photos || []
                };
                
                await db.collection(`projects/${projectId}/dailyLogs`).add(logData);
                console.log(`Migrated task ${task.taskId} from report ${report.id}`);
            }
            
            // Delete the old report
            await report.ref.delete();
            console.log(`Deleted report ${report.id}`);
        }
    }
    console.log("Migration complete!");
}

migrate().catch(console.error);
