/**
 * Module guide: Consumption History.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-consumption.
 */
export default {
  "id": "guide-consumption",
  "title": "Consumption History",
  "description": "Every material and labour entry used on the job, searchable and exportable.",
  "order": 8,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "Consumption History lists everything used on the job, taken from the daily logs.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "Consumption History"
        }
      ]
    },
    {
      "id": "material",
      "vo": "Material consumption shows each material used, on which day, and against which task.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "filters",
      "vo": "Use the search filters to narrow the list, and sort it by date or by quantity. Labour consumption works the same way for the people on site.",
      "hold": 0.8,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "export",
      "vo": "Export to CSV or PDF when you need it outside Sitetru.",
      "hold": 0.6,
      "do": [
        {
          "wait": 400
        }
      ]
    }
  ]
};
