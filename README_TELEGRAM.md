# Telegram Bot Setup Guide

To connect the Telegram bot to this app, you need to deploy the Firebase Cloud Function and tell Telegram where to send the messages.

## Step 1: Set up Firebase Secrets
Your function requires two secrets to run securely. Run these commands in your terminal (make sure you have the Firebase CLI installed and are logged in):
```bash
firebase secrets:set TELEGRAM_BOT_TOKEN
# Paste your bot token from BotFather when prompted

firebase secrets:set TELEGRAM_WEBHOOK_SECRET
# Make up a random secure string (e.g., "my_super_secret_webhook_token_123") and paste it
```

## Step 2: Deploy the Function
Deploy the backend code to Firebase:
```bash
cd functions
npm install
npm run deploy
```
Once the deployment completes, it will print a **Function URL** for `telegramWebhook`. It will look something like:
`https://telegramwebhook-[hash]-as.a.run.app`

## Step 3: Set the Webhook
Now you need to tell Telegram to send messages to that URL. 
You can use the included `set_webhook.sh` script, or run this curl command directly:

```bash
curl -F "url=YOUR_FUNCTION_URL_FROM_STEP_2" \
     -F "secret_token=YOUR_WEBHOOK_SECRET_FROM_STEP_1" \
     "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook"
```

After doing this, type `/help` to the bot in Telegram and it should respond!
