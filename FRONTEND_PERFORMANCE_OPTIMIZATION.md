# Frontend Performance Optimization Strategy

## Overview
Enterprise construction management platforms must handle massive datasets such as WBS tasks, inventory ledgers, procurement logs, and labor records. Rendering all DOM nodes at once causes deep call stacks in React, severe main-thread blocking, and poor scroll performance. We have implemented a Virtualization Strategy to overcome these bottlenecks.

## Virtualization Architecture
We utilize `@tanstack/react-virtual` to window out elements outside the visible viewport.
- **`VirtualTable`**: A reusable, headless-compatible UI wrapper component built on top of `useVirtualizer`.
- **Dynamic Row Measurements**: Rows that require variable heights are supported using `virtualizer.measureElement`.
- **React.memo Constraints**: We pass generic extractors to ensure references don't break.

## Implementations
### 1. Stock Ledger (Inventory)
- **Previous Bottleneck**: The inventory grid mapped 1000s of stock items, causing heavy layout thrashing upon search or category filtering.
- **Optimization**: Swapped the native `<table>` implementation with `<VirtualTable data={filteredItems} />`. Sticky headers and category groupings are now natively handled by the generic layout without heavy nesting.

### 2. Cost Ledgers
- **Previous Bottleneck**: Rendering large financial records inline with input validations triggered rerenders up the entire component tree.
- **Optimization**: Component splitting and React.memo applied to individual cost row entries. We now debounce updates globally rather than saving changes eagerly.

### 3. WBS / Gantt rendering
- Gantt charts require massive horizontal and vertical scaling. 
- Using 2D continuous virtualization (rendering both columns (dates) and rows (tasks) virtually) prevents freezing on 5-year project timelines.

## Best Practices Implemented
1. **Memoization of Derived Data**: \`categories\`, \`filteredItems\`, and \`groupedItems\` use \`useMemo\` to prevent recalculating array filter loops during independent state changes (like opening a modal).
2. **Stable Callbacks**: Functions explicitly passed into mapped components or Virtual Tables use \`useCallback\`.
3. **Optimized Layout Thrashing**: Replaced \`border-collapse\` tables with CSS Grid layout structures inside Virtual elements, explicitly defining \`gridTemplateColumns\` for fluid responsiveness without relying on browser table layout heuristics.

## Future Recommendations
- Implement offscreen Canvas rendering for the exact Timeline markers in the Gantt chart if DOM element counts still exceed 10,000 in viewport.
- Leverage the React \`useTransition\` hook for layout filters.
