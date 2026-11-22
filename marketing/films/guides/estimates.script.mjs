/**
 * Module guide: Client Estimates.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-estimates.
 */
export default {
  "id": "guide-estimates",
  "title": "Client Estimates",
  "description": "Estimates for your client, with margin and GST, from the same breakdown.",
  "order": 11,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Client Estimates is how you price the job for your client.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Client Estimates"
        }
      ]
    },
    {
      "id": "list",
      "vo": "Each estimate shows its status, the contract value, cost to date and your margin, with GST.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "new",
      "vo": "Press New Estimate to make one. Set how long it's valid, the tax rate, and any notes for the client.",
      "hold": 0.7,
      "do": [
        {
          "tab": "New Estimate"
        }
      ]
    }
  ]
};
