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
      "hold": 0.6,
      "do": [
        { "tab": "Log Another" },
        { "pick": { "select": "-- Choose Location --", "option": 1 } },
        { "pick": { "select": "-- Choose Task --", "option": 1 } }
      ]
    },
    {
      "id": "week",
      "vo": "Catching up on several days? Choose A whole week, pick the week, and untick any day with no work.",
      "hold": 0.6,
      "do": [
        { "click": "A whole week" },
        { "click": "Last week" },
        { "wait": 500 }
      ]
    },
    {
      "id": "day",
      "vo": "Each day has its own labour, materials and equipment. Enter Monday's gang.",
      "hold": 0.4,
      "do": [
        { "click": "Add labour" },
        { "pick": { "select": "Select Role", "option": "Mason" } },
        { "type": { "after": "Select Role", "value": "4" } },
        { "click": "Add labour" },
        { "pick": { "select": "Select Role", "option": "Helper" } },
        { "type": { "after": "Select Role", "value": "6" } }
      ]
    },
    {
      "id": "copy",
      "vo": "Copy it to the rest of the week, then open any day and change only what was different. A lump sum takes its own amount on each day.",
      "hold": 0.6,
      "do": [
        { "click": "Copy to all days" },
        { "click": "Next day →" },
        { "wait": 600 }
      ]
    },
    {
      "id": "save",
      "vo": "Save, and each day becomes its own daily log, counted in stock, cost and the contractor's RA bill.",
      "hold": 0.5,
      "do": [
        { "wait": 800 }
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
