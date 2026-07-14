import { differenceInDays } from "date-fns";
import { Task } from "../../types";

const safeParseDate = (dateStr: string | undefined | null): Date => {
  if (!dateStr) return new Date();
  try {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    return new Date();
  }
};

// Helper: build tree and compute numbering
export function buildTree(tasks: Task[]) {
  const nodeMap = new Map<string, any>();
  const roots: any[] = [];

  tasks.forEach((t) => {
    nodeMap.set(t.id, { ...t, children: [] });
  });

  tasks.forEach((t) => {
    if (t.parentId && nodeMap.has(t.parentId)) {
      nodeMap.get(t.parentId).children.push(nodeMap.get(t.id));
    } else {
      roots.push(nodeMap.get(t.id));
    }
  });

  // Sort children by startDate
  const sortNodes = (nodes: any[]) => {
    nodes.sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  // Compute numbering and rollup progress
  const assignCodesAndComputeProgress = (nodes: any[], prefix: string = "") => {
    nodes.forEach((n, idx) => {
      n.wbsCode = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      assignCodesAndComputeProgress(n.children, n.wbsCode);

      if (n.children.length > 0) {
        let totalWeight = 0;
        let weightedProgress = 0;
        let hasValidDuration = false;

        n.children.forEach((c: any) => {
          const start = safeParseDate(c.startDate);
          const end = safeParseDate(c.endDate);
          const duration = Math.max(1, differenceInDays(end, start) + 1);
          if (c.duration) hasValidDuration = true;
          const weight = c.duration || duration;
          totalWeight += weight;
          weightedProgress += c.progress * weight;
        });

        if (totalWeight > 0) {
          n.computedProgress = Math.round(weightedProgress / totalWeight);
        } else {
          // fallback simple average
          const avg =
            n.children.reduce((acc: number, c: any) => acc + c.progress, 0) /
            n.children.length;
          n.computedProgress = Math.round(avg || 0);
        }
      } else {
        n.computedProgress = n.progress || 0;
      }
    });
  };

  assignCodesAndComputeProgress(roots);

  return { roots, nodeMap };
}

export interface GroupNode {
  id: string; // synthetic id, e.g. "location::Unit 4"
  type: "location";
  name: string;
  children: any[]; // the actual root tasks
  taskCount: number; // to show in UI
}

import { useMemo, useState } from "react";

export function useLocationDrilldown(tasks: Task[]) {
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  const { roots, nodeMap } = useMemo(() => buildTree(tasks), [tasks]);

  const groupedRoots = useMemo(() => buildLocationGroupedTree(tasks), [tasks]);

  const activeLocation = currentLocation;

  const currentNodes = useMemo(() => {
    // Inside a specific task
    if (currentParentId) {
      return nodeMap.get(currentParentId)?.children || [];
    }
    // Inside a specific location -> show actual tasks
    if (activeLocation) {
      const locNode = groupedRoots.find((l) => l.name === activeLocation);
      return locNode?.children || [];
    }
    // At the top level -> show locations
    return groupedRoots;
  }, [currentParentId, activeLocation, groupedRoots, nodeMap]);

  const parentChain = useMemo(() => {
    const chain = [];

    // 1. Task breadcrumbs
    let current = currentParentId ? nodeMap.get(currentParentId) : null;
    while (current) {
      chain.unshift({ id: current.id, name: current.name, type: "task" });
      current = current.parentId ? nodeMap.get(current.parentId) : null;
    }

    // 2. Location breadcrumb
    if (activeLocation) {
      chain.unshift({
        id: `loc::${activeLocation}`,
        name: activeLocation,
        type: "location",
      });
    }

    return chain;
  }, [currentParentId, nodeMap, activeLocation]);

  const navigateDown = (node: any) => {
    if (node.type === "location") {
      setCurrentLocation(node.name);
    } else {
      setCurrentParentId(node.id);
    }
  };

  const navigateUp = () => {
    if (currentParentId) {
      const parent = nodeMap.get(currentParentId)?.parentId;
      setCurrentParentId(parent || null);
    } else if (currentLocation) {
      setCurrentLocation(null);
    }
  };

  const navigateToBreadcrumb = (crumb: any) => {
    if (crumb.type === "location") {
      setCurrentLocation(crumb.name);
      setCurrentParentId(null);
    } else {
      setCurrentParentId(crumb.id);
    }
  };

  const navigateToRoot = () => {
    setCurrentParentId(null);
    setCurrentLocation(null);
  };

  const currentParentNode = useMemo(() => {
    if (currentParentId) return nodeMap.get(currentParentId);
    if (activeLocation)
      return { type: "location", name: activeLocation, parentId: null };
    return null;
  }, [currentParentId, nodeMap, activeLocation]);

  return {
    roots,
    nodeMap,
    groupedRoots,
    currentNodes,
    parentChain,
    currentParentNode,
    navigateDown,
    navigateUp,
    navigateToBreadcrumb,
    navigateToRoot,
    viewModeState: useState<"drilldown" | "outline">("drilldown"),
  };
}

export function buildPhaseLocationGroups(roots: any[]) {
  const pMap = new Map<string, Map<string, any[]>>();
  roots.forEach((t) => {
    const p = t.phase || "Unassigned Phase";
    const l = t.location || "Unassigned Location";
    if (!pMap.has(p)) pMap.set(p, new Map());
    if (!pMap.get(p)!.has(l)) pMap.get(p)!.set(l, []);
    pMap.get(p)!.get(l)!.push(t);
  });
  return Array.from(pMap.keys()).map((p) => ({
    id: `phase::${p}`,
    name: p,
    children: Array.from(pMap.get(p)!.keys()).map((l) => ({
      id: `loc::${p}::${l}`,
      name: l,
      children: pMap.get(p)!.get(l)!,
    })),
  }));
}

export function buildLocationGroupedTree(tasks: Task[]): GroupNode[] {
  const { roots } = buildTree(tasks);

  const locMap = new Map<string, any[]>();

  roots.forEach((rootTask) => {
    const loc = rootTask.location || "Unassigned Location";

    if (!locMap.has(loc)) {
      locMap.set(loc, []);
    }
    locMap.get(loc)!.push(rootTask);
  });

  const getSortScore = (name: string, unassignedNames: string[]) =>
    unassignedNames.includes(name) ? 1 : 0;

  const locations = Array.from(locMap.keys()).sort((a, b) => {
    const aScore = getSortScore(a, ["Unassigned Location"]);
    const bScore = getSortScore(b, ["Unassigned Location"]);
    if (aScore !== bScore) return aScore - bScore;
    return a.localeCompare(b);
  });

  return locations.map((locName) => {
    const locTasks = locMap.get(locName)!;
    return {
      id: `location::${locName}`,
      type: "location",
      name: locName,
      children: locTasks,
      taskCount: locTasks.length,
    };
  });
}
