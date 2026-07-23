import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('materials: (d.taskId === taskId) ? d.materials : existingMaterials,', 'materials: (d.taskId === taskId && d.materials) ? d.materials : existingMaterials,')
text = text.replace('labour: (d.taskId === taskId) ? d.labour : existingLabour,', 'labour: (d.taskId === taskId && d.labour) ? d.labour : existingLabour,')
text = text.replace('photoUrls: (d.taskId === taskId) ? d.photoUrls : existingPhotoUrls,', 'photoUrls: (d.taskId === taskId && d.photoUrls) ? d.photoUrls : existingPhotoUrls,')
text = text.replace('note: (d.taskId === taskId) ? d.note : existingNote,', 'note: (d.taskId === taskId && d.note !== undefined) ? d.note : existingNote,')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
