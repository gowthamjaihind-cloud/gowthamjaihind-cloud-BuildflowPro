import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

old_code = """export async function handlePhoto(tg: any, chatId: number, session: any, photoArray: any[]) {
    await tg.sendMessage(chatId, "⏳ Saving photo...");
    const base = projPath(session.orgId, session.activeProjectId);
    const d = session.draft || {};
    
    // get best res
    const p = photoArray.sort((a, b) => b.width - a.width)[0];
    const filePath = await tg.getFile(p.file_id);
    if (!filePath) {
        await tg.sendMessage(chatId, "Couldn't get file.");
        return;
    }
    const url = `https://api.telegram.org/file/bot${tg.botToken}/${filePath}`;
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const fileName = `${Date.now()}_${p.file_id}.jpg`;
    const storagePath = `${base}/dailyLogs/${d.logId}/${fileName}`;
    
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, new Uint8Array(arrayBuffer), {
        contentType: "image/jpeg"
    });
    
    const downloadUrl = await getDownloadURL(storageRef);
    const photoUrls = [...(d.photoUrls || []), downloadUrl];
    await setSession(chatId, { draft: { ...d, photoUrls } });
    
    const s = await getSession(chatId);
    await showMenu(tg, chatId, null, s);
}"""

new_code = """export async function handlePhoto(tg: any, chatId: number, session: any, photoArray: any[]) {
    await tg.sendMessage(chatId, "⏳ Saving photo...");
    try {
        const base = projPath(session.orgId, session.activeProjectId);
        const d = session.draft || {};
        
        // get best res
        const p = photoArray.sort((a, b) => b.width - a.width)[0];
        const filePath = await tg.getFile(p.file_id);
        if (!filePath) {
            await tg.sendMessage(chatId, "Couldn't get file path from Telegram.");
            return;
        }
        const url = `https://api.telegram.org/file/bot${tg.botToken}/${filePath}`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Telegram fetch failed: ${res.status} ${res.statusText}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        const fileName = `${Date.now()}_${p.file_id}.jpg`;
        const storagePath = `${base}/dailyLogs/${d.logId}/${fileName}`;
        
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, new Uint8Array(arrayBuffer), {
            contentType: "image/jpeg"
        });
        
        const downloadUrl = await getDownloadURL(storageRef);
        const photoUrls = [...(d.photoUrls || []), downloadUrl];
        await setSession(chatId, { draft: { ...d, photoUrls } });
        
        const s = await getSession(chatId);
        await showMenu(tg, chatId, null, s);
    } catch (e: any) {
        console.error("Photo upload error:", e);
        await tg.sendMessage(chatId, "❌ Failed to save photo: " + e.message);
    }
}"""

if "try {" not in text.split("export async function handlePhoto")[1]:
    text = text.replace(old_code, new_code)
    with open("src/server/telegram/handlers/log.ts", "w") as f:
        f.write(text)
