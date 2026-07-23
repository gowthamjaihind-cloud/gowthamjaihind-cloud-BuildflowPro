import https from 'https';
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) { console.log("No token"); process.exit(0); }
const url = "https://api.telegram.org/bot" + botToken + "/setWebhook?url=https://ais-dev-fsf4xhfhdm6lcc76sbf3v5-553346744037.asia-southeast1.run.app/api/telegram-webhook&secret_token=buildflow_secret_123";
https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
