#!/bin/bash
BOT_TOKEN="<YOUR_BOT_TOKEN>"
WEBHOOK_URL="<YOUR_FUNCTION_URL>"
SECRET="<YOUR_WEBHOOK_SECRET>"

curl -F "url=${WEBHOOK_URL}" \
     -F "secret_token=${SECRET}" \
     "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook"
echo ""
