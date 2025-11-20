# CLAUDE.md

ALWAYS RESPOND IN KOREAN

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a learning project that implements React's core features from scratch using vanilla JavaScript/TypeScript. The goal is to understand React's internal workings by implementing Virtual DOM, reconciliation, hooks system, and component lifecycle.

## Learning Context

**IMPORTANT**: This is a learning repository. When helping the user:
- Provide guidance and direction rather than complete solutions
- Ask follow-up questions when requests are unclear or too broad
- Offer hints that enable self-implementation
- Reference `.claude/context.md` for detailed learning approach

## Common Commands

### Testing
```bash
# Run all tests
npm test

# Basic tests (Phase 1-6)
npm run test:basic

# Advanced tests (Phase 7: hooks & HOC)
npm run test:advanced

# Run specific test file
npm test -- <test-file-name>
# Example:
npm test -- advanced.hooks.test.tsx
npm test -- basic.mini-react.test.tsx
```

### Development
```bash
# Install dependencies
pnpm install

# Run dev server
npm run dev

# Build
npm run build

# Lint and format
npm run lint:fix
npm run prettier:write
```

## Architecture

### Core Rendering Flow

```
setup() → render() → reconcile() → DOM operations
   ↓         ↓           ↓
context   enqueue    mount/update/unmount
  reset     queue      + child reconciliation
```

1. **setup** (`core/setup.ts`): Initializes root context and triggers first render
2. **render** (`core/render.ts`): Orchestrates the render cycle, cleans up hooks
3. **reconcile** (`core/reconciler.ts`): Compares old/new VNodes and updates DOM
4. **enqueueRender** (`utils/enqueue.ts`): Batches renders using microtask queue

### Component Path System

Each component instance has a unique path (e.g., `"0.c0.i1.c2"`):
- `c` = child index
- `i` = array item index
- Used to isolate hook state per component instance
- Critical for multi-instance components to maintain separate state

### Hook System Architecture

**Global Context** (`core/context.ts`):
```typescript
context.hooks = {
  state: Map<path, hookArray[]>,     // Hook values per component
  cursor: Map<path, number>,          // Current hook index per component
  visited: Set<path>,                 // Tracks visited components this render
  componentStack: string[]            // Call stack for currentPath
}
```

**Hook Call Order Enforcement**:
- Hooks rely on **call order**, not names
- Each hook call increments the cursor
- First render: stores initial values at cursor position
- Re-renders: retrieves values from same cursor position
- This is why hooks must not be called conditionally

**Hook Execution Flow**:
```
Component renders → componentStack.push(path)
  → useState() called → currentCursor = 0
  → useState() called → currentCursor = 1
  → useEffect() called → currentCursor = 2
Component returns → componentStack.pop()
```

### Reconciliation Strategy

**Key Matching** (`reconciler.ts`):
- Compares `instance.node.type` and `instance.key` with new VNode
- If types/keys differ: unmount old, mount new
- If same: update in place

**Child Reconciliation**:
- Maps old children by key for O(1) lookup
- Processes new children, finding matches or creating new instances
- Unmounts remaining old children not found in new list

**Anchor Calculation**:
- When moving/inserting DOM nodes, finds the next sibling DOM element
- Handles fragments and components (which have no DOM themselves)
- Ensures correct insertion order

### Fragment Handling

Fragments (`Fragment` symbol):
- Have `dom: null` (no real DOM node)
- Children are inserted directly into parent DOM
- `getFirstDomFromChildren()` traverses fragment tree to find actual DOM

### Effects Queue

Effects run **after** render completes:
```
render() → reconcile() → DOM updated
  → microtask → flushEffects() → run all effects
```

Stored in `context.effects.queue` as `{path, cursor}` entries.

## Module Responsibilities

### Core Modules

**`core/elements.ts`**: VNode creation and normalization
- `createElement()`: JSX transform target
- `normalizeNode()`: Converts primitives/null to VNode
- `createChildPath()`: Generates unique component paths

**`core/context.ts`**: Global state management
- Root context (container, root VNode, root Instance)
- Hooks context (state Map, cursor Map, componentStack)
- Effects queue

**`core/reconciler.ts`**: Virtual DOM diffing
- `reconcile()`: Main entry point
- `mount()`: Create new Instance + DOM
- `update()`: Update existing Instance
- `unmount()`: Remove Instance and cleanup

**`core/dom.ts`**: DOM manipulation utilities
- `setDomProps()`, `updateDomProps()`: Handle attributes, styles, events
- `insertInstance()`, `removeInstance()`: DOM insertion/removal
- `getFirstDom()`: Traverse Instance tree to find real DOM node

**`core/hooks.ts`**: Built-in hooks
- `useState()`: State management with cursor tracking
- `useEffect()`: Side effects with dependency comparison
- `cleanupUnusedHooks()`: Remove stale hook state

### Utility Modules

**`utils/equals.ts`**: Comparison functions
- `shallowEquals()`: For dependency arrays
- `deepEquals()`: For deep comparisons

**`utils/enqueue.ts`**: Microtask scheduler
- `withEnqueue()`: Batches function calls to prevent redundant work

**`utils/validators.ts`**: Type guards
- `isEmptyValue()`: Checks null/undefined/false

### Extended Modules (Phase 7)

**`hooks/*.ts`**: Additional hooks
- `useRef()`: Mutable ref object
- `useMemo()`, `useCallback()`: Memoization
- `useDeepMemo()`, `useAutoCallback()`: Custom variants

**`hocs/*.ts`**: Higher-Order Components
- `memo()`: Shallow prop comparison
- `deepMemo()`: Deep prop comparison

## Implementation Phases

The codebase follows a 7-phase implementation plan (see `README.md` for details):

1. VNode and utilities
2. Context and setup
3. DOM interface
4. Render scheduling
5. Reconciliation
6. Basic hooks (useState, useEffect)
7. Advanced hooks and HOC

Tests validate each phase:
- Phases 1-6: `test:basic`
- Phase 7: `test:advanced`

## Key Implementation Notes

### useState Implementation

Must capture cursor in closure:
```typescript
const currentCursor = cursor; // Capture for setState closure
const setState = (next) => {
  const current = hooks[currentCursor]; // Use captured cursor
  if (!Object.is(current, newValue)) {
    hooks[currentCursor] = newValue;
    enqueueRender();
  }
};
```

### Component Function Execution

Before calling component function, push path to stack:
```typescript
context.hooks.componentStack.push(path);
const vnode = componentFn(props);
context.hooks.componentStack.pop();
```

This makes `context.hooks.currentPath` return the correct path during hook calls.

### Effect Cleanup

Effects may return cleanup functions:
```typescript
const cleanup = effect(); // Run effect, capture cleanup
hook.cleanup = cleanup;   // Store for next render/unmount
```

Before running a new effect or unmounting, call previous cleanup.

## Documentation

Comprehensive guides in `docs/`:
- `01-implementation-guide.md`: Function interfaces and pseudocode
- `02-sequence-diagrams.md`: Visual flow diagrams
- `03-fundamental-knowledge.md`: Core concepts
- `04-06`: Specific implementation guides
- `07-useState-구현-가이드.md`: useState implementation walkthrough

## Feedback Document Guidelines

**IMPORTANT**: When writing feedback documents for user code, ALWAYS refer to `docs/feedback/README.md` for:
- File naming conventions (YYYYMMDD-HHMM-간단한요약.md)
- Document structure (현재 코드, 잘한 점, 개선할 점, 학습 포인트, 다음 단계)
- Tone and style guidelines (긍정적, 격려하는 톤)
- Code example formatting (Before/After comparisons)

Feedback documents should be saved in `docs/feedback/` directory.

## Testing Strategy

Tests are written **before** implementation. Read test expectations to understand required behavior:
- Test files are in `packages/react/src/__tests__/`
- Use `/** @jsx createElement */` pragma
- Tests use `flushMicrotasks()` to wait for async effects

Example test inspection:
```bash
# See what useState should do:
cat packages/react/src/__tests__/advanced.hooks.test.tsx
```
