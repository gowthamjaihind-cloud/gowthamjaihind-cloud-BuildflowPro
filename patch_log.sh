sed -i 's/    createdByUid: session.userId,/    createdByUid: session.userId,\n    createdByName: session.email || "Telegram Bot",/' functions/src/telegram/handlers/log.ts
