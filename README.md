# Sitetru Bot & Dashboard 🏗️

Welcome to Sitetru, a construction project management dashboard with a built-in Telegram bot for workers and managers to log progress and material consumption on the go.

## 🚀 Telegram Bot Setup

To enable the Telegram integration, you need to provide a bot token.

### 1. Create a Bot
1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the instructions to get your **API Token**.

### 2. Configure Environment Variables
Add your token to the application settings:
1. Go to the **Settings** menu in the AI Studio environment.
2. Add a new environment variable:
   - **Key:** `TELEGRAM_BOT_TOKEN`
   - **Value:** `your_telegram_bot_token_here`
3. Restart the development server.

### 3. Usage
- Send `/start` to the bot to see available commands.
- Use `/projects` to list active projects.
- Use `/tasks PROJECT_ID` to view tasks for a specific project.
- Use `/update TASK_ID PROJECT_ID` to start a guided progress update.

## 🛠️ Troubleshooting: Permission Errors

If you see an error like `7 PERMISSION_DENIED: Cloud Firestore API has not been used...` or `Missing or insufficient permissions`:

### 1. Enable Firestore API
The bot communicates with Firestore using the Firebase Admin SDK. You must ensure the Firestore API is enabled for your project:
1. Click the link provided in the bot's debug message (it will look like `https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=YOUR_PROJECT_ID`).
2. Click the **Enable** button.
3. Wait 2-3 minutes for the changes to propagate.

### 2. Verify Database ID
If your project uses a "managed" or "named" database (other than the default one), ensure it is correctly defined in your `firebase-applet-config.json`. The current application automatically picks this up.

### 3. Firestore Rules
The dashboard uses the Firebase Web SDK. If you get permission errors in the browser dashboard:
1. Ensure you have run the `set_up_firebase` tool.
2. The `firestore.rules` must be deployed. The current rules allow the bot to manage `bot_sessions` and strictly control manual updates to project data based on user roles.

## 📊 Dashboard Features
- **Project Overview:** Real-time stats on progress and budgets.
- **Task Tracking:** Visual progress bars for all construction phases.
- **Material Logs:** Detailed tracking of what materials are used where.
- **Labor Deployment:** Track manpower allocation daily.
