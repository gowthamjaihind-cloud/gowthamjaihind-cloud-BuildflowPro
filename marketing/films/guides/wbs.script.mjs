/**
 * Module guide: WBS: planning the work.
 *
 * Generated from the module's real screens (headings, tabs, form labels),
 * so every line describes something the viewer can see. Recorded by
 * walkthrough/record.mjs with FILM=guide-wbs.
 */
export default {
  "id": "guide-wbs",
  "title": "WBS: planning the work",
  "description": "Break the job into phases and tasks, with dates and budgets, and log work against them.",
  "order": 3,
  "speed": 0.96,
  "bpm": 90,
  "beats": [
    {
      "id": "open",
      "vo": "The WBS, or work breakdown, is the plan for the job: phases, and the tasks inside each phase.",
      "hold": 0.5,
      "do": [
        {
          "open": "Sample Residence — Plot 12"
        },
        {
          "nav": "WBS"
        }
      ]
    },
    {
      "id": "tree",
      "vo": "Each task has its own dates, progress and budget. Open a phase to see the tasks under it.",
      "hold": 0.6,
      "do": [
        {
          "wait": 600
        }
      ]
    },
    {
      "id": "add",
      "vo": "To plan new work, press Add Task. Name the activity, pick its phase, location and parent task, then set the planned start and finish. The resources and budget go in further down.",
      "hold": 0.8,
      "do": [
        {
          "tab": "Add Task"
        }
      ]
    },
    {
      "id": "log",
      "vo": "When work is done on a task, press Log Work. Enter the date and progress, the materials used, the labour on site and any equipment, then add a note or photos.",
      "hold": 0.8,
      "do": [
        {
          "esc": true
        },
        {
          "tab": "Log Work"
        }
      ]
    }
  ]
};
