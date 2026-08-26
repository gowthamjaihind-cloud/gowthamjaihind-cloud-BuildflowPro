// Reusable WBS starter structures.
//
// A template is a tree of phases and tasks with indicative durations, drafted
// from common Indian construction practice. Applying one gives a project a real
// breakdown in one click; every name, duration and date stays editable
// afterwards — the template is a starting point, not a constraint.

export interface WbsNode {
  name: string;
  /** Working days this task is expected to take. Ignored for phases (parents). */
  days?: number;
  /**
   * Phases only. Fraction of the PREVIOUS phase that must elapse before this
   * one starts. 1 = strictly after it (the default); 0.5 = starts halfway
   * through it. Real sites overlap heavily — MEP begins while the frame is
   * still going up — and without this a template reads as absurdly long.
   */
  startAfter?: number;
  children?: WbsNode[];
}

export interface WbsTemplate {
  id: string;
  name: string;
  /** Grouping shown in the picker. */
  category: "Residential" | "Multi-storey" | "Commercial" | "Industrial" | "Interior";
  /** One line explaining who it's for. */
  description: string;
  nodes: WbsNode[];
}

// ---------------------------------------------------------------------------
// Shared blocks. Indian residential practice runs the same sequence per floor,
// so floors are generated rather than repeated by hand.
// ---------------------------------------------------------------------------

const preConstruction: WbsNode = {
  name: "Pre-construction",
  children: [
    { name: "Site survey & soil test", days: 3 },
    { name: "Drawings & plan sanction", days: 21 },
    { name: "Site clearing & levelling", days: 3 },
    { name: "Temporary shed, water & power", days: 3 },
    { name: "Setting out & marking", days: 2 },
  ],
};

const foundation: WbsNode = {
  name: "Substructure",
  children: [
    { name: "Excavation for footings", days: 5 },
    { name: "PCC bed", days: 2 },
    { name: "Footing reinforcement", days: 4 },
    { name: "Footing concreting", days: 2 },
    { name: "Column starters up to plinth", days: 4 },
    { name: "Plinth beam shuttering & reinforcement", days: 5 },
    { name: "Plinth beam concreting", days: 2 },
    { name: "Anti-termite treatment", days: 1 },
    { name: "Back filling & plinth filling", days: 4 },
  ],
};

/** One floor of an RCC frame: columns, walls, and the slab above it. */
function floorBlock(label: string, slabLabel: string): WbsNode {
  return {
    name: label,
    children: [
      { name: "Column reinforcement & shuttering", days: 5 },
      { name: "Column concreting", days: 2 },
      { name: "Brickwork / blockwork", days: 12 },
      { name: "Lintel & sunshade", days: 4 },
      { name: `${slabLabel} shuttering`, days: 5 },
      { name: `${slabLabel} reinforcement`, days: 4 },
      { name: `${slabLabel} concreting`, days: 2 },
      { name: "Curing", days: 14 },
    ],
  };
}

const roofWorks: WbsNode = {
  name: "Roof & terrace",
  startAfter: 0.8,
  children: [
    { name: "Staircase headroom / mumty", days: 7 },
    { name: "Parapet wall", days: 5 },
    { name: "Roof waterproofing", days: 4 },
    { name: "Overhead tank", days: 4 },
  ],
};

const mepFirstFix: WbsNode = {
  name: "MEP — first fix",
  // Conduiting starts while the last slab is still curing.
  startAfter: 0.55,
  children: [
    { name: "Electrical conduiting & chasing", days: 8 },
    { name: "Plumbing — water supply lines", days: 6 },
    { name: "Plumbing — drainage & sewage", days: 6 },
  ],
};

const finishing: WbsNode = {
  name: "Finishing",
  startAfter: 0.5,
  children: [
    { name: "Internal plastering", days: 14 },
    { name: "External plastering", days: 12 },
    { name: "Waterproofing — bathrooms", days: 3 },
    { name: "Flooring — tiles / granite", days: 12 },
    { name: "Bathroom & kitchen dadoing", days: 7 },
    { name: "Door & window frames", days: 6 },
    { name: "Shutters & fittings", days: 8 },
    { name: "Putty & primer", days: 8 },
    { name: "Painting — internal", days: 10 },
    { name: "Painting — external", days: 8 },
    { name: "Grills & railings", days: 6 },
  ],
};

const mepSecondFix: WbsNode = {
  name: "MEP — second fix",
  startAfter: 0.6,
  children: [
    { name: "Electrical wiring, switches & DB", days: 8 },
    { name: "Light fittings", days: 4 },
    { name: "Sanitary fixtures", days: 5 },
    { name: "CP fittings", days: 3 },
    { name: "Pump & motor installation", days: 2 },
  ],
};

const externalWorks: WbsNode = {
  name: "External works",
  startAfter: 0.35,
  children: [
    { name: "Sump & septic tank", days: 8 },
    { name: "Compound wall", days: 10 },
    { name: "Gate", days: 3 },
    { name: "Paving & driveway", days: 6 },
    { name: "Landscaping", days: 5 },
  ],
};

const handover: WbsNode = {
  name: "Handover",
  children: [
    { name: "Snagging & rectification", days: 7 },
    { name: "Deep cleaning", days: 3 },
    { name: "EB service connection", days: 10 },
    { name: "Final inspection with client", days: 2 },
    { name: "Completion certificate & handover", days: 3 },
  ],
};

/** Residential RCC building with `floors` levels above ground. */
function residential(floors: number): WbsNode[] {
  const blocks: WbsNode[] = [floorBlock("Ground floor", "First floor slab")];
  for (let i = 1; i <= floors; i++) {
    const ord = i === 1 ? "First" : i === 2 ? "Second" : i === 3 ? "Third" : `Floor ${i}`;
    const above =
      i === floors ? "Roof slab" : `${i === 1 ? "Second" : i === 2 ? "Third" : `Floor ${i + 1}`} floor slab`;
    blocks.push(floorBlock(`${ord} floor`, above));
  }
  return [
    preConstruction,
    foundation,
    ...blocks,
    roofWorks,
    mepFirstFix,
    finishing,
    mepSecondFix,
    externalWorks,
    handover,
  ];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const WBS_TEMPLATES: WbsTemplate[] = [
  {
    id: "res-g1",
    name: "Residential G+1",
    category: "Residential",
    description: "Independent house, ground plus one floor. The most common private build.",
    nodes: residential(1),
  },
  {
    id: "res-g2",
    name: "Residential G+2",
    category: "Residential",
    description: "Ground plus two floors — typical for a rental or joint-family house.",
    nodes: residential(2),
  },
  {
    id: "res-g3",
    name: "Residential G+3",
    category: "Residential",
    description: "Ground plus three floors, at the limit of most local sanction rules.",
    nodes: residential(3),
  },
  {
    id: "villa",
    name: "Villa / Duplex",
    category: "Residential",
    description: "Single premium unit with landscaping and higher-spec finishes.",
    nodes: [
      preConstruction,
      foundation,
      floorBlock("Ground floor", "First floor slab"),
      floorBlock("First floor", "Roof slab"),
      roofWorks,
      mepFirstFix,
      {
        name: "Finishing — premium",
        startAfter: 0.5,
        children: [
          { name: "Internal plastering", days: 14 },
          { name: "External plastering & cladding", days: 14 },
          { name: "Waterproofing — bathrooms & terrace", days: 5 },
          { name: "Flooring — imported marble / wooden", days: 15 },
          { name: "Bathroom & kitchen dadoing", days: 8 },
          { name: "Joinery — doors, wardrobes", days: 15 },
          { name: "Modular kitchen", days: 10 },
          { name: "False ceiling & cove lighting", days: 10 },
          { name: "Putty, primer & painting", days: 16 },
          { name: "Railings & MS works", days: 7 },
        ],
      },
      mepSecondFix,
      {
        name: "External & amenities",
        startAfter: 0.35,
        children: [
          { name: "Sump & septic tank", days: 8 },
          { name: "Compound wall & gate", days: 12 },
          { name: "Driveway & paving", days: 7 },
          { name: "Swimming pool / water feature", days: 20 },
          { name: "Landscaping & irrigation", days: 10 },
        ],
      },
      handover,
    ],
  },
  {
    id: "apartment",
    name: "Apartment block",
    category: "Multi-storey",
    description: "Multi-storey residential with basement, lift, and common amenities.",
    nodes: [
      {
        name: "Pre-construction & approvals",
        children: [
          { name: "Soil investigation report", days: 7 },
          { name: "Architectural & structural drawings", days: 30 },
          { name: "Plan sanction & CMDA/DTCP approval", days: 60 },
          { name: "Site mobilisation & labour camp", days: 10 },
          { name: "Setting out & benchmarks", days: 3 },
        ],
      },
      {
        name: "Piling & basement",
        children: [
          { name: "Piling works", days: 25 },
          { name: "Pile cap excavation", days: 10 },
          { name: "Raft / pile cap reinforcement", days: 12 },
          { name: "Raft concreting", days: 5 },
          { name: "Basement retaining walls", days: 20 },
          { name: "Basement waterproofing", days: 8 },
          { name: "Basement slab", days: 10 },
        ],
      },
      {
        name: "Superstructure",
        children: [
          { name: "Ground floor frame & slab", days: 25 },
          { name: "Typical floor cycle — repeat per floor", days: 120 },
          { name: "Terrace slab", days: 15 },
          { name: "Lift machine room & headroom", days: 10 },
          { name: "Staircase flights", days: 20 },
        ],
      },
      {
        name: "Blockwork & plastering",
        startAfter: 0.55,
        children: [
          { name: "External blockwork", days: 30 },
          { name: "Internal blockwork", days: 35 },
          { name: "External plastering & scaffolding", days: 30 },
          { name: "Internal plastering", days: 35 },
        ],
      },
      {
        name: "MEP — first fix",
        startAfter: 0.5,
        children: [
          { name: "Electrical conduiting", days: 25 },
          { name: "Plumbing shafts & risers", days: 20 },
          { name: "Drainage & sewage lines", days: 20 },
          { name: "Fire-fighting piping", days: 18 },
          { name: "Lift shaft preparation", days: 10 },
        ],
      },
      {
        name: "Finishing",
        startAfter: 0.5,
        children: [
          { name: "Waterproofing — bathrooms & terrace", days: 12 },
          { name: "Flooring — units", days: 30 },
          { name: "Dadoing — bathrooms & kitchens", days: 20 },
          { name: "Doors & windows", days: 25 },
          { name: "Putty, primer & painting — internal", days: 30 },
          { name: "External painting / texture", days: 20 },
          { name: "Common area finishes & lobby", days: 20 },
        ],
      },
      {
        name: "MEP — second fix & systems",
        startAfter: 0.45,
        children: [
          { name: "Electrical wiring, DBs & meters", days: 25 },
          { name: "Sanitary & CP fittings", days: 18 },
          { name: "Lift installation & commissioning", days: 30 },
          { name: "Fire alarm & sprinklers", days: 20 },
          { name: "Pumps, sump & OHT", days: 15 },
          { name: "STP installation", days: 20 },
          { name: "DG set & transformer", days: 20 },
        ],
      },
      {
        name: "External development",
        startAfter: 0.4,
        children: [
          { name: "Compound wall & main gate", days: 20 },
          { name: "Driveway & parking marking", days: 12 },
          { name: "Landscaping & amenities", days: 20 },
          { name: "Rainwater harvesting", days: 10 },
        ],
      },
      {
        name: "Handover",
        children: [
          { name: "Snagging — unit by unit", days: 20 },
          { name: "Statutory clearances (fire, EB, CMWSSB)", days: 30 },
          { name: "Completion certificate", days: 15 },
          { name: "Unit handover & documentation", days: 20 },
        ],
      },
    ],
  },
  {
    id: "commercial",
    name: "Commercial building",
    category: "Commercial",
    description: "Office or retail block with façade, HVAC, lifts and fire systems.",
    nodes: [
      {
        name: "Pre-construction & approvals",
        children: [
          { name: "Soil investigation", days: 7 },
          { name: "Design & structural drawings", days: 30 },
          { name: "Statutory approvals & NOCs", days: 60 },
          { name: "Site mobilisation", days: 10 },
        ],
      },
      {
        name: "Substructure",
        children: [
          { name: "Piling / footings", days: 25 },
          { name: "Raft & pile caps", days: 15 },
          { name: "Basement & retaining walls", days: 25 },
          { name: "Waterproofing", days: 10 },
        ],
      },
      {
        name: "Superstructure",
        children: [
          { name: "RCC frame — floor cycles", days: 90 },
          { name: "Terrace & machine rooms", days: 15 },
          { name: "Staircases & cores", days: 25 },
        ],
      },
      {
        name: "Envelope & façade",
        startAfter: 0.6,
        children: [
          { name: "Blockwork", days: 30 },
          { name: "Plastering", days: 30 },
          { name: "Structural glazing / ACP façade", days: 45 },
          { name: "Terrace waterproofing", days: 10 },
        ],
      },
      {
        name: "MEP",
        startAfter: 0.45,
        children: [
          { name: "Electrical — conduiting & cabling", days: 35 },
          { name: "HVAC — ducting & AHU", days: 40 },
          { name: "HVAC — chillers & commissioning", days: 25 },
          { name: "Fire-fighting & sprinklers", days: 30 },
          { name: "Plumbing & drainage", days: 25 },
          { name: "Lifts & escalators", days: 35 },
          { name: "BMS & access control", days: 20 },
          { name: "DG set & transformer", days: 25 },
        ],
      },
      {
        name: "Interior finishing",
        startAfter: 0.55,
        children: [
          { name: "Flooring — vitrified / granite", days: 30 },
          { name: "False ceiling", days: 25 },
          { name: "Partitions & glazing", days: 20 },
          { name: "Toilets — dadoing & fixtures", days: 20 },
          { name: "Painting & texture", days: 25 },
          { name: "Signage & wayfinding", days: 10 },
        ],
      },
      {
        name: "External development",
        startAfter: 0.4,
        children: [
          { name: "Parking & paving", days: 20 },
          { name: "Compound wall & gates", days: 15 },
          { name: "Landscaping", days: 15 },
          { name: "External lighting", days: 10 },
        ],
      },
      {
        name: "Handover",
        children: [
          { name: "Testing & commissioning", days: 20 },
          { name: "Snagging & rectification", days: 20 },
          { name: "Fire & statutory NOCs", days: 30 },
          { name: "Occupancy certificate", days: 20 },
          { name: "Client handover & O&M manuals", days: 10 },
        ],
      },
    ],
  },
  {
    id: "industrial",
    name: "Industrial shed (PEB)",
    category: "Industrial",
    description: "Pre-engineered steel building — factory, warehouse or godown.",
    nodes: [
      {
        name: "Pre-construction",
        children: [
          { name: "Soil test & survey", days: 5 },
          { name: "PEB design & approval drawings", days: 21 },
          { name: "Statutory approvals (factory licence, fire)", days: 45 },
          { name: "Site levelling & mobilisation", days: 10 },
        ],
      },
      {
        name: "Foundation",
        children: [
          { name: "Excavation for pedestals", days: 8 },
          { name: "PCC & footing reinforcement", days: 8 },
          { name: "Footing concreting", days: 4 },
          { name: "Pedestal & anchor bolt setting", days: 8 },
          { name: "Plinth beam & backfilling", days: 10 },
        ],
      },
      {
        name: "PEB structure",
        children: [
          { name: "Steel fabrication & delivery", days: 30 },
          { name: "Column erection", days: 10 },
          { name: "Rafter & truss erection", days: 12 },
          { name: "Purlins & bracing", days: 10 },
          { name: "Crane gantry girder", days: 10 },
          { name: "Roof sheeting & skylights", days: 12 },
          { name: "Wall cladding", days: 12 },
          { name: "Gutters & downpipes", days: 6 },
        ],
      },
      {
        name: "Civil works",
        startAfter: 0.5,
        children: [
          { name: "Sub-base & compaction", days: 10 },
          { name: "VDF / trimix flooring", days: 15 },
          { name: "Floor hardener & joints", days: 6 },
          { name: "Masonry — offices & utilities", days: 20 },
          { name: "Plastering & painting", days: 18 },
          { name: "Roller shutters & doors", days: 8 },
        ],
      },
      {
        name: "Utilities & MEP",
        startAfter: 0.45,
        children: [
          { name: "Electrical — LT panel & cabling", days: 20 },
          { name: "High-bay lighting", days: 10 },
          { name: "Transformer & HT line", days: 25 },
          { name: "Compressed air lines", days: 12 },
          { name: "Fire hydrant & sprinklers", days: 20 },
          { name: "Plumbing & drainage", days: 12 },
          { name: "EOT crane installation", days: 15 },
        ],
      },
      {
        name: "External works",
        startAfter: 0.4,
        children: [
          { name: "Approach road & hardstanding", days: 15 },
          { name: "Compound wall & security gate", days: 15 },
          { name: "Weighbridge", days: 12 },
          { name: "Storm water drains", days: 10 },
          { name: "ETP / STP", days: 20 },
        ],
      },
      {
        name: "Handover",
        children: [
          { name: "Testing & commissioning", days: 12 },
          { name: "Snagging", days: 10 },
          { name: "Statutory inspections & NOCs", days: 25 },
          { name: "Handover & documentation", days: 7 },
        ],
      },
    ],
  },
  {
    id: "interior",
    name: "Interior fit-out",
    category: "Interior",
    description: "Office or retail fit-out inside an existing shell.",
    nodes: [
      {
        name: "Pre-work",
        children: [
          { name: "Site measurement & survey", days: 3 },
          { name: "Design & GFC drawings", days: 15 },
          { name: "Building permissions & work permit", days: 7 },
          { name: "Material selection & approvals", days: 10 },
        ],
      },
      {
        name: "Demolition & civil",
        children: [
          { name: "Dismantling & debris removal", days: 5 },
          { name: "Civil modifications & levelling", days: 8 },
          { name: "Waterproofing — wet areas", days: 4 },
        ],
      },
      {
        name: "Partitions & ceiling",
        children: [
          { name: "Gypsum / glass partitions", days: 12 },
          { name: "False ceiling framework", days: 10 },
          { name: "Ceiling boarding & finishing", days: 8 },
        ],
      },
      {
        name: "MEP",
        startAfter: 0.6,
        children: [
          { name: "Electrical conduiting & wiring", days: 14 },
          { name: "HVAC ducting & diffusers", days: 12 },
          { name: "Fire sprinkler modification", days: 8 },
          { name: "Data & networking cabling", days: 10 },
          { name: "Plumbing — pantry & toilets", days: 8 },
        ],
      },
      {
        name: "Finishes",
        startAfter: 0.55,
        children: [
          { name: "Flooring — vinyl / carpet / tiles", days: 12 },
          { name: "Wall panelling & cladding", days: 10 },
          { name: "Painting & texture", days: 10 },
          { name: "Joinery & storage units", days: 15 },
          { name: "Pantry & washroom fit-out", days: 10 },
          { name: "Glazing & film", days: 6 },
        ],
      },
      {
        name: "Loose items & handover",
        children: [
          { name: "Light fittings & controls", days: 6 },
          { name: "Furniture delivery & placement", days: 8 },
          { name: "Signage & branding", days: 5 },
          { name: "Deep cleaning", days: 3 },
          { name: "Snagging & rectification", days: 7 },
          { name: "Handover", days: 2 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Applying a template
// ---------------------------------------------------------------------------

export interface PlannedTask {
  name: string;
  type: "Summary" | "Task";
  /** Index into the produced array; -1 for a top-level phase. */
  parentIndex: number;
  startDate: string; // yyyy-mm-dd
  endDate: string;   // yyyy-mm-dd
  duration: number;
  phase: string;
}

const iso = (d: Date) => d.toISOString().split("T")[0];
const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

/**
 * Lay a template out from a start date. Leaf tasks run back-to-back in order;
 * a phase spans its children. The result is a straightforward linear baseline —
 * deliberately simple, because the planner will re-sequence it against the real
 * site anyway. Every date remains editable afterwards.
 */
export function planFromTemplate(template: WbsTemplate, startDate: Date): PlannedTask[] {
  const out: PlannedTask[] = [];
  let prevStart = new Date(startDate);
  let prevDuration = 0;

  template.nodes.forEach((phase, pi) => {
    // Where this phase begins, allowing for overlap with the previous one.
    const phaseStart =
      pi === 0
        ? new Date(startDate)
        : addDays(prevStart, Math.round(prevDuration * (phase.startAfter ?? 1)));

    const phaseIndex = out.length;
    out.push({
      name: phase.name,
      type: "Summary",
      parentIndex: -1,
      startDate: iso(phaseStart),
      endDate: iso(phaseStart),
      duration: 1,
      phase: phase.name,
    });

    let cursor = new Date(phaseStart);
    let phaseEnd = new Date(phaseStart);
    for (const child of phase.children || []) {
      const days = Math.max(1, child.days || 1);
      const s = new Date(cursor);
      const e = addDays(s, days - 1);
      out.push({
        name: child.name,
        type: "Task",
        parentIndex: phaseIndex,
        startDate: iso(s),
        endDate: iso(e),
        duration: days,
        phase: phase.name,
      });
      cursor = addDays(e, 1);
      phaseEnd = e;
    }

    const dur = Math.max(
      1,
      Math.round((phaseEnd.getTime() - phaseStart.getTime()) / 86400000) + 1,
    );
    out[phaseIndex].endDate = iso(phaseEnd);
    out[phaseIndex].duration = dur;

    prevStart = phaseStart;
    prevDuration = dur;
  });

  return out;
}

/**
 * Calendar days from the first task to the last, accounting for phase overlap.
 * This is what the picker shows — the sum of task durations would overstate it.
 */
export function templateCalendarDays(template: WbsTemplate): number {
  const plan = planFromTemplate(template, new Date("2026-01-01"));
  if (!plan.length) return 0;
  const starts = plan.map((n) => Date.parse(n.startDate));
  const ends = plan.map((n) => Date.parse(n.endDate));
  return Math.round((Math.max(...ends) - Math.min(...starts)) / 86400000) + 1;
}

/** Total calendar days a template spans, for the picker's summary line. */
export function templateSpanDays(template: WbsTemplate): number {
  return template.nodes.reduce(
    (sum, phase) => sum + (phase.children || []).reduce((s, c) => s + Math.max(1, c.days || 1), 0),
    0,
  );
}

/** Number of leaf tasks in a template. */
export function templateTaskCount(template: WbsTemplate): number {
  return template.nodes.reduce((sum, phase) => sum + (phase.children || []).length, 0);
}
