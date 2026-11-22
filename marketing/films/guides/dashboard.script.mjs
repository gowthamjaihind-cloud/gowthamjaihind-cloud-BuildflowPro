/**
 * Module guide: Dashboard.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-dashboard.
 */
export default {
  "id": "guide-dashboard",
  "title": "Dashboard",
  "description": "How your project is doing today: progress, budget, the schedule, and sharing with your client.",
  "order": 2,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Open your project, and the Dashboard is the first thing you see: how the job is going today.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Dashboard"
        }
      ]
    },
    {
      "id": "cost",
      "vo": "The cost snapshot shows how much has been spent against the budget. Press Full cost analytics for the detail.",
      "hold": 0.6,
      "do": [
        {
          "wait": 500
        }
      ]
    },
    {
      "id": "timeline",
      "vo": "Further down, the phase timeline shows each stage of the job, and the schedule below it puts every task on a calendar. Switch it between day, week and month, or show the critical path.",
      "hold": 0.7,
      "do": [
        {
          "scroll": 700
        },
        {
          "tab": "Week"
        },
        {
          "tab": "Critical Path"
        }
      ]
    },
    {
      "id": "share",
      "vo": "Share with client creates a link for your client. You choose what they see: site photos, daily work updates, a payment summary, the number of workers. Your notes, costs and rates are never shown.",
      "hold": 0.8,
      "do": [
        {
          "scroll": 0
        },
        {
          "tab": "Share with client"
        }
      ]
    },
    {
      "id": "close",
      "vo": "Close it when you're done. Links you've shared are listed under Active links.",
      "hold": 0.6,
      "do": [
        {
          "esc": true
        }
      ]
    }
  ]
};
