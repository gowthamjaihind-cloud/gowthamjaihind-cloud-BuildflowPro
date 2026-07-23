with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

text = text.replace('''export async function showDatePicker(tg: any, chatId: number, messageId: any, session: any) {
    const today = todayISO();
    const rows = [
        [{ text: `✅ Today (${fmtDate(today)})`, callback_data: `dt:${today}` }],
        [{ text: "📅 Choose Previous Date", callback_data: "dt:pick" }],
        [{ text: "◀ Back", callback_data: "dt:back" }]
    ];''', '''export async function showDatePicker(tg: any, chatId: number, messageId: any, session: any) {
    const today = todayISO();
    const rows = [
        [{ text: `✅ Today (${fmtDate(today)})`, callback_data: `dt:${today}` }],
        [{ text: "📅 Choose Previous Date", callback_data: "dt:pick" }],
        [{ text: "✖ Cancel", callback_data: "xx" }]
    ];''')

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
