curl -X POST http://localhost:3000/api/telegram-webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $(node -e 'console.log(process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN || "")')" \
  -d '{
    "update_id": 10000,
    "message": {
      "message_id": 1,
      "from": {
        "id": 123456789,
        "is_bot": false,
        "first_name": "Test",
        "username": "testuser"
      },
      "chat": {
        "id": 123456789,
        "type": "private"
      },
      "date": 1690000000,
      "text": "/start"
    }
  }'
