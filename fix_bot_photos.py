import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

old_code = """        const arrayBuffer = await res.arrayBuffer();
        const fileName = `${Date.now()}_${p.file_id}.jpg`;
        const storagePath = `${base}/dailyLogs/${d.logId}/${fileName}`;
        
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, new Uint8Array(arrayBuffer), {
            contentType: "image/jpeg"
        });
        
        const downloadUrl = await getDownloadURL(storageRef);
        const photoUrls = [...(d.photoUrls || []), downloadUrl];"""

new_code = """        const arrayBuffer = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        const photoUrls = [...(d.photoUrls || []), dataUrl];"""

text = text.replace(old_code, new_code)

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
