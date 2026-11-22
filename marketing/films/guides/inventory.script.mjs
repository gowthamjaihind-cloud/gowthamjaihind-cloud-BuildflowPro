/**
 * Module guide: Inventory and the stock card.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-inventory.
 */
export default {
  "id": "guide-inventory",
  "title": "Inventory and the stock card",
  "description": "Stock on site, what's running low, and each material's history.",
  "order": 6,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Inventory is the stock on site: every material, how much is in hand, and its value.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Inventory"
        }
      ]
    },
    {
      "id": "card",
      "vo": "Click any material to open its stock card. It shows every delivery, who it came from, and where it was used, with the balance after each.",
      "hold": 0.8,
      "do": [
        {
          "open": "OPC 53 Grade Cement"
        }
      ]
    },
    {
      "id": "recon",
      "vo": "Under Reconciliation, enter a physical count, and Sitetru shows the difference from what the system expects.",
      "hold": 0.7,
      "do": [
        {
          "esc": true
        },
        {
          "tab": "Reconciliation"
        }
      ]
    },
    {
      "id": "add",
      "vo": "To stock a new material, press Add Item, or bring one in from your company's master list with From Master.",
      "hold": 0.7,
      "do": [
        {
          "tab": "Stock Ledger"
        }
      ]
    }
  ]
};
