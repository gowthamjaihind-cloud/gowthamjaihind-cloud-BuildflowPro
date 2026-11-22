/**
 * Module guide: Labour & Billing.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-labour.
 */
export default {
  "id": "guide-labour",
  "title": "Labour & Billing",
  "description": "Rates for each labour role and contractor, and running account bills.",
  "order": 5,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Labour and Billing is where you keep what you pay for labour.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Labour & Billing"
        }
      ]
    },
    {
      "id": "rates",
      "vo": "Under Pricing, each contractor has a rate card: a rate for each role, such as mason or helper. The headcounts from the daily logs are priced with these rates.",
      "hold": 0.7,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "ra",
      "vo": "Under RA Billing, you prepare running account bills for each contractor for a bill period, and see the gross and net amount and the status of each.",
      "hold": 0.8,
      "do": [
        {
          "tab": "RA Billing"
        }
      ]
    },
    {
      "id": "export",
      "vo": "Export any of it to CSV or PDF to share with your accountant.",
      "hold": 0.6,
      "do": [
        {
          "tab": "Pricing"
        }
      ]
    }
  ]
};
