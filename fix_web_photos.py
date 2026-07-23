import re

with open("src/components/DailyLogEntryScreen.tsx", "r") as f:
    text = f.read()

# Replace compressImage call and storage upload
old_upload = """            const compressed = await compressImage(file, 1600, 0.7);
            const name = `photo_${Date.now()}_${i}.jpg`;
            const sRef = storageRef(
              storage,
              `${tenantPathLogs}/${currentLogId}/${name}`,
            );
            await uploadBytes(sRef, compressed);
            const url = await getDownloadURL(sRef);
            urls.push(url);"""

new_upload = """            const compressed = await compressImage(file, 1024, 0.6);
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(compressed);
            });
            urls.push(dataUrl);"""

text = text.replace(old_upload, new_upload)

with open("src/components/DailyLogEntryScreen.tsx", "w") as f:
    f.write(text)
