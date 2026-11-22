/**
 * Module guide: Project Insights.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-insights.
 */
export default {
  "id": "guide-insights",
  "title": "Project Insights",
  "description": "Analytics on cost, labour, procurement, inventory and progress, with a plain-language digest.",
  "order": 10,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Project Insights reads your costs, schedule and daily logs, and shows what needs attention.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Project Insights"
        }
      ]
    },
    {
      "id": "cost",
      "vo": "Start with cost: budget, spent and variance, and charts of where the money went.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "tabs",
      "vo": "Switch to Labour, Procurement, Inventory or Progress for the same view of each.",
      "hold": 0.6,
      "do": [
        {
          "tab": "Labour"
        },
        {
          "tab": "Progress"
        }
      ]
    },
    {
      "id": "digest",
      "vo": "Below, the executive digest sums it up in plain words: cost variance, schedule slippage and the site report. Press Regenerate to refresh it.",
      "hold": 0.8,
      "do": [
        {
          "scroll": 900
        }
      ]
    }
  ]
};
