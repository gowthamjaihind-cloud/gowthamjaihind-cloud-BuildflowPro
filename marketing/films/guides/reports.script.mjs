/**
 * Module guide: Progress Reports.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-reports.
 */
export default {
  "id": "guide-reports",
  "title": "Progress Reports",
  "description": "Daily, weekly and monthly progress reports, ready to send.",
  "order": 12,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Reports turns the daily logs into progress reports you can send.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Reports"
        }
      ]
    },
    {
      "id": "daily",
      "vo": "The daily report shows each task's progress for the day, and the logs behind it.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "weekly",
      "vo": "Weekly and monthly reports add up the period: material used, labour deployed and progress on every task.",
      "hold": 0.7,
      "do": [
        {
          "tab": "Weekly"
        },
        {
          "tab": "Monthly"
        }
      ]
    },
    {
      "id": "export",
      "vo": "Export any report as a PDF or CSV.",
      "hold": 0.6,
      "do": [
        {
          "tab": "Daily"
        }
      ]
    }
  ]
};
