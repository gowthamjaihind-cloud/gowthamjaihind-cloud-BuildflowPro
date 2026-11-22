/**
 * Module guide: Procurement: POs, goods receipts and bills.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-procurement.
 */
export default {
  "id": "guide-procurement",
  "title": "Procurement: POs, goods receipts and bills",
  "description": "Raise purchase orders with GST, receive material, scan bills and track vendor accounts.",
  "order": 7,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Procurement is everything you buy for the job, from order to payment.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Procurement"
        }
      ]
    },
    {
      "id": "po",
      "vo": "Press New PO to raise a purchase order. Choose the vendor and order date, then add each item with its quantity, rate before tax, HSN code and GST. Transport and loading charges go at the bottom.",
      "hold": 0.8,
      "do": [
        {
          "tab": "New PO"
        }
      ]
    },
    {
      "id": "grn",
      "vo": "When the material arrives, record it under Goods Receipt against its purchase order. The stock goes up by what actually came.",
      "hold": 0.7,
      "do": [
        {
          "esc": true
        },
        {
          "tab": "Goods Receipt"
        }
      ]
    },
    {
      "id": "bills",
      "vo": "Under Bills, each vendor bill is matched to its order. Scan Invoice reads a photo or PDF of a GST invoice and matches it to your PO for you.",
      "hold": 0.8,
      "do": [
        {
          "tab": "Bills"
        }
      ]
    },
    {
      "id": "ledger",
      "vo": "The Ledger shows what you owe each vendor and what you've paid, and Vendors lists everyone you buy from.",
      "hold": 0.7,
      "do": [
        {
          "tab": "Ledger"
        },
        {
          "tab": "Vendors"
        }
      ]
    }
  ]
};
