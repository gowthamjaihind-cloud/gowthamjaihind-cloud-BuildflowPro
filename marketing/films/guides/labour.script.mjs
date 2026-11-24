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
      "vo": "Under RA Billing, each contractor's work that is not yet certified is gathered into a running account bill for the period you choose. Certify it, and it is added to what you owe them.",
      "hold": 0.8,
      "do": [
        {
          "tab": "RA Billing"
        }
      ]
    },
    {
      "id": "statement",
      "vo": "Click a contractor's name to see their statement: what is certified and paid, and every day's work still waiting to be certified.",
      "hold": 0.6,
      "do": [
        {
          "open": "Sample Labour Contractor"
        },
        {
          "wait": 700
        }
      ]
    },
    {
      "id": "bills",
      "vo": "Each certified bill lists the daily logs it paid for. If a billed day is changed later, the difference is settled on the next bill, and a day already paid is never billed twice.",
      "hold": 0.7,
      "do": [
        {
          "wait": 400
        }
      ]
    },
    {
      "id": "export",
      "vo": "Export any of it to CSV or PDF to share with your accountant.",
      "hold": 0.6,
      "do": [
        {
          "esc": true
        },
        {
          "tab": "Pricing"
        }
      ]
    }
  ]
};
