// Stand-in for the demo fixtures in any build that is not a demo build.
//
// vite.config aliases "@demo" to this file unless VITE_DEMO=1, so the real
// fixtures are never added to the module graph. That is deterministic — unlike
// relying on the bundler to tree-shake a dead branch, which it would not do
// reliably here because the fixture objects reference one another.
export const DEMO_ORG_ID = "";
export const DEMO_PROJECT_ID = "";
export const demoProjects: any[] = [];
export const demoTasks: any[] = [];
export const demoCollections: Record<string, any[]> = {};
export const demoInsights: any = null;
