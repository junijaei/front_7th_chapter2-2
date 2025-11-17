# CLAUDE.md

ALWAYS RESPOND IN KOREAN
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React implementation educational project where you build a Mini-React library from scratch to understand React's internal mechanisms. The project is a pnpm monorepo with two packages:
- `@hanghae-plus/react` - The Mini-React implementation
- `@hanghae-plus/shopping` - A demo app using the Mini-React library

## Commands

### Package Manager
This project uses **pnpm** as the package manager. All npm commands should use pnpm instead.

### Testing

```bash
# Run all tests in react package (from project root)
pnpm test

# Run basic tests only
pnpm test:basic

# Run advanced tests only
pnpm test:advanced

# Run specific test file (from packages/react directory)
pnpm test src/__tests__/basic.equals.test.tsx
pnpm test src/__tests__/basic.mini-react.test.tsx
pnpm test src/__tests__/advanced.hooks.test.tsx
pnpm test src/__tests__/advanced.hoc.test.tsx

# Run tests matching a pattern
pnpm test -- --testNamePattern="1단계"
pnpm test -- --testNamePattern="10단계"

# Run tests with UI
pnpm --filter @hanghae-plus/react test:ui
```

### Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Lint and format
pnpm lint:fix
pnpm prettier:write
```

## Architecture

### Core Rendering Flow

The Mini-React implementation follows this high-level flow:

1. **JSX Transform** → VNode creation (`createElement`)
2. **Setup** → Initialize root context and trigger first render
3. **Render Cycle** → Reconciliation, hook management, effect scheduling
4. **Reconciliation** → Diff VNodes and update DOM minimally
5. **Effect Execution** → Run scheduled effects asynchronously

### Key Architectural Concepts

#### 1. Path-Based Component Identification

Each component instance is identified by a unique path string (e.g., `"0.cCounter_0.i1"`):
- `0` - Root
- `.cCounter_0` - First Counter component at this level
- `.i1` - Child at index 1
- `.kMyKey` - Child with explicit key "MyKey"

This path system is crucial for:
- **Hook state storage**: Each component's hooks are stored in a Map keyed by path
- **Component identity**: Determines if a component is new or being updated
- **Hook state persistence**: Same path = same component = preserved hook state

#### 2. Global Context Structure

The `context` object (in `core/context.ts`) is the single source of truth containing:
- **root**: Container element, root VNode, and current Instance tree
- **hooks**: Hook state maps, cursor tracking, component stack, visited paths
- **effects**: Queue of effects to execute after render

#### 3. Hook State Management

Hooks rely on **call order** and **component path**:
- `hooks.state` - Map<path, hookArray> where hookArray[cursor] = hook state
- `hooks.cursor` - Map<path, number> tracking which hook is currently executing
- `hooks.componentStack` - Stack of paths showing current component hierarchy
- `hooks.visited` - Set of paths visited in current render (for cleanup)

When a component calls `useState()` or `useEffect()`:
1. Get current path from `componentStack`
2. Get current cursor position
3. Read/write hook state at `hooks.state.get(path)[cursor]`
4. Increment cursor for next hook call

#### 4. Reconciliation Strategy

The `reconcile()` function compares old Instance vs new VNode to minimize DOM operations:
- **Same type + key**: Update existing instance
- **Different type/key**: Unmount old, mount new
- **Null node**: Unmount
- **Null instance**: Mount

For children, it uses positional comparison (index-based) unless keys are provided.

#### 5. Effect Scheduling

`useEffect` uses a two-phase approach:
1. **During render**: Compare deps, queue effects that need to run
2. **After render**: Asynchronously execute queued effects via microtask

**Critical implementation detail**:
- `deps === undefined` means run on **every render**
- `deps === []` means run **once** (first render only)
- `deps === [a, b]` means run when a or b changes (shallow comparison)

#### 6. VNode Structure

Every element becomes a VNode:
```typescript
{
  type: string | symbol | ComponentFunction,
  key: string | null,
  props: {
    children?: VNode[],
    ...otherProps
  }
}
```

Special types:
- `TEXT_ELEMENT` (symbol) - Text nodes
- `Fragment` (symbol) - Fragment containers
- String - DOM elements (div, span, etc.)
- Function - Components

#### 7. Instance Tree

The Instance tree represents actual rendered state:
```typescript
{
  kind: NodeType, // TEXT, HOST, COMPONENT, FRAGMENT
  dom: HTMLElement | Text | null,
  node: VNode,  // Current VNode
  children: Instance[],
  key: string | null,
  path: string  // Unique path for hook state
}
```

### Module Organization

```
packages/react/src/
├── core/           # Core rendering engine
│   ├── constants.ts   # TEXT_ELEMENT, Fragment, node/hook type enums
│   ├── types.ts       # TypeScript interfaces
│   ├── context.ts     # Global state container
│   ├── elements.ts    # createElement, normalizeNode, createChildPath
│   ├── reconciler.ts  # mount, update, reconcileChildren
│   ├── render.ts      # render loop, enqueueRender
│   ├── hooks.ts       # useState, useEffect, cleanupUnusedHooks
│   ├── dom.ts         # DOM manipulation utilities
│   └── setup.ts       # Root initialization
├── utils/          # Utilities
│   ├── equals.ts      # shallowEquals, deepEquals
│   ├── validators.ts  # isEmptyValue
│   └── enqueue.ts     # Microtask scheduling
├── client/         # Public API
│   └── index.ts       # createRoot export
└── __tests__/      # Test suites
```

## Test Structure

Tests are organized in stages:

**Basic Tests** (`basic.mini-react.test.tsx`):
- Stage 1-10: Core functionality (rendering, Fragment, props, useState, useEffect, reconciliation, keys, cleanup, edge cases)

**Advanced Tests**:
- `advanced.hooks.test.tsx` - useRef, useMemo, useCallback, custom hooks
- `advanced.hoc.test.tsx` - memo, deepMemo HOCs

## Critical Implementation Details

### Never Modify Test Code
Test files are immutable. All fixes must be in implementation code only.

### Hook Dependency Handling
When implementing hooks that accept deps (useEffect, useMemo, useCallback):
```typescript
// ❌ Wrong - converts undefined to null
const depsChanged = !prevHook || !shallowEquals(prevHook.deps, deps ?? null);

// ✅ Correct - preserves undefined
const depsChanged = !prevHook || deps === undefined || !shallowEquals(prevHook.deps, deps);
```

### Props Comparison in Reconciler
When updating instances, store prevProps BEFORE modifying instance.node:
```typescript
// ✅ Correct order
const prevProps = instance.node.props;
instance.node = node;
updateDomProps(dom, prevProps, props);

// ❌ Wrong - prevProps === props
instance.node = node;
const prevProps = instance.node.props;
updateDomProps(dom, prevProps, props);
```

### Children in createElement
Only add children array to props when it has elements:
```typescript
// ✅ Correct
if (normalizedChildren.length > 0) {
  return { type, key, props: { ...props, children: normalizedChildren } };
}
return { type, key, props };

// ❌ Wrong - adds empty children array to function components
return { type, key, props: { ...props, children: normalizedChildren } };
```

### Effect Cleanup Order
1. Run new effects after render (in microtask)
2. Execute previous cleanup before executing new effect
3. Run all cleanups for unmounted components

## Documentation

Comprehensive implementation guides are in the `docs/` directory:
- `01-implementation-guide.md` - Step-by-step implementation roadmap
- `02-sequence-diagrams.md` - Visual flow diagrams
- `03-fundamental-knowledge.md` - Core concepts reference
