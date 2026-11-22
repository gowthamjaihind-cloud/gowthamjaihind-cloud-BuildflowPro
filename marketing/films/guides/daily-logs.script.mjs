/**
 * Module guide: Daily Logs and the Telegram bot.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-daily-logs.
 */
export default {
  "id": "guide-daily-logs",
  "title": "Daily Logs and the Telegram bot",
  "description": "Record each day's progress, labour and material, from the app or from Telegram.",
  "order": 4,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Daily Logs is the diary of the site. Each log records the day's progress on a task, the labour, the material used and photos.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Daily Logs"
        }
      ]
    },
    {
      "id": "list",
      "vo": "Logs are listed by date. Edit or delete one if something was entered wrongly.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "new",
      "vo": "Press Log Another to add one: choose the location and the task, then the work date, the progress so far, and what was used.",
      "hold": 0.8,
      "do": [
        {
          "tab": "Log Another"
        }
      ]
    },
    {
      "id": "telegram",
      "vo": "Your site engineers don't need the app for this. They send the day's work to the Sitetru bot on Telegram, in Tamil or English, and it appears here as a daily log.",
      "hold": 1.0,
      "do": [
        {
          "esc": true
        },
        {
          "wait": 400
        }
      ],
      "cutTo": "telegram-beat-16x9.png",
      "cutAfter": 3
    }
  ]
};
