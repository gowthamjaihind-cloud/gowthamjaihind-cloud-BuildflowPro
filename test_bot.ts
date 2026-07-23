import { TelegramApi } from "./src/server/telegram/api";
import { handleUpdate } from "./src/server/telegram/index";

async function run() {
  const BOT_TOKEN = "8128112984:AAGDLyTeGN9IoXiJ6idn9ZpvCC460BTgkA8";
  const tg = new TelegramApi(BOT_TOKEN);
  try {
    await handleUpdate(tg, {
      message: {
        chat: { id: 123456789 },
        text: "/help"
      }
    });
    console.log("Success");
  } catch(e) {
    console.error("Error:", e);
  }
}

run();
