# UX Strategy: Site Mode vs. Executive Mode

## Operational Reasoning

Field operations software must adapt to the physical environment of its users. A Project Director sitting in a climate-controlled office on a 27-inch 4K monitor requires a drastically different interface than a Site Engineer standing on a sunlit 14th-floor concrete slab using a 6-inch Android phone with one hand while wearing PPE.

### Executive Mode (Current State)
- **Environment**: Controlled lighting, desktop/laptop, stable internet.
- **Workflow**: Analytical, contemplative, broad oversight.
- **UX Paradigm**: Glassmorphism, spacious padding (`p-6`, `p-8`), nuanced data visualizations, deep navigational hierarchies, smooth staggered animations.

### Site Mode (New Mode)
- **Environment**: Direct sunlight (high glare), mobile/tablet, fluctuating connectivity, physical constraints.
- **Workflow**: Transactional, rapid, high-frequency data entry.
- **UX Paradigm**: 
  - **High Contrast**: Opaque backgrounds instead of translucent glassmorphism to combat sunlight glare.
  - **Information Density + Large Targets**: Reduced whitespace (`p-2`, `p-3`) to fit more rows on screen, but *increased* touch target sizes (`min-h-[44px]`) to ensure accurate tapping with gloves or one hand.
  - **Ergonomics**: Bottom Navigation to prevent top-screen reaching. Floating Action Buttons (FABs) embedded in the thumb zone for rapid data entry (DPR, Attendance).
  - **Performance**: Reduced animations (`duration-75` instead of `duration-300`, or disabled entirely) to combat battery drain and device thermal throttling in the sun.

## Implementation Architecture

### 1. State Management
We introduce a `uiMode` property to the global UI store. 
```typescript
interface UIState {
  uiMode: "executive" | "site";
  toggleUIMode: () => void;
}
```

### 2. Tailwind Strategy
We inject a `.site-mode` class into the root `div` or `body`. We can then leverage Tailwind's variant system or simply use conditional string concatenation in React, e.g.:
```tsx
className={`p-6 ${uiMode === 'site' ? 'sm:p-3 p-2 bg-white' : 'glass-panel'}`}
```
Alternatively, CSS Variables in `index.css`:
```css
.site-mode {
  --spacing-panel: 0.5rem;
  --bg-panel: #ffffff;
  --glass-blur: 0px;
}
```

### 3. Layout Restructuring (The "Thumb Zone")
In Site Mode on mobile displays:
- Hide the traditional sidebar/hamburger menu.
- Introduce a **Bottom Navigation Bar** with primary tabs (Tasks, Logs, Inventory, More).
- Add a persistent **Quick Action FAB** (Floating Action Button) in the bottom right for the 3 most common actions: "Log Attendance", "Issue Material", "Daily Report".

### 4. Workflow Enhancements
- **Swipe Actions**: For approving tasks or dismissing alerts, swipe gestures replace small click targets.
- **Sticky Headers**: For long inventory lists or task lists, headers remain pinned so context is never lost while scrolling down the site.
