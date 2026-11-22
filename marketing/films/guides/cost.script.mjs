/**
 * Module guide: Cost Management.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-cost.
 */
export default {
  "id": "guide-cost",
  "title": "Cost Management",
  "description": "Budget against actual for every task, direct costs, and the project cash book.",
  "order": 9,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Cost Management shows where the money is going, against the budget.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Cost Management"
        }
      ]
    },
    {
      "id": "overview",
      "vo": "The overview shows cost by category and the latest transactions.",
      "hold": 0.5,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "tasks",
      "vo": "Task Costs breaks it down by WBS task: material, labour and direct costs, planned against actual, with a status for each.",
      "hold": 0.7,
      "do": [
        {
          "tab": "Task Costs"
        }
      ]
    },
    {
      "id": "direct",
      "vo": "Direct Costs are expenses that aren't material or labour. Press Add Transaction to record one, with its amount, type, category and date.",
      "hold": 0.8,
      "do": [
        {
          "tab": "Direct Costs"
        },
        {
          "tab": "Add Transaction"
        }
      ]
    },
    {
      "id": "report",
      "vo": "Full Report is the project cost analysis with the variance on every task, and Payments is the cash book: money in, money out, and the balance.",
      "hold": 0.8,
      "do": [
        {
          "esc": true
        },
        {
          "tab": "Full Report"
        },
        {
          "tab": "Payments"
        }
      ]
    }
  ]
};
