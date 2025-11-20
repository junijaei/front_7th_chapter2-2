# Reconciler, Render, useState 종합 피드백

**작성일**: 2025-11-20 14:54
**대상 파일**:
- `packages/react/src/core/reconciler.ts`
- `packages/react/src/core/render.ts`
- `packages/react/src/core/hooks.ts`
- `packages/react/src/core/dom.ts`
- `packages/react/src/core/context.ts`

**학습 목표**: Virtual DOM reconciliation, 상태 관리, DOM 속성 업데이트의 핵심 원리 이해

---

## 테스트 실패 현황

### 실패 테스트 목록 (28개)

| 단계 | 테스트 이름 | 실패 원인 |
|------|-------------|----------|
| 3단계 | className 속성이 DOM에 올바르게 반영된다 | DOM이 재사용되지 않음 |
| 3단계 | data attributes가 DOM에 올바르게 설정된다 | 동일 |
| 3단계 | 이벤트 핸들러가 올바르게 등록되고 실행된다 | 이벤트 핸들러 중복 등록 |
| 3단계 | 일반 HTML 속성들이 DOM에 올바르게 설정된다 | DOM 재생성으로 속성 손실 |
| 4단계 | useState 함수 이니셜라이저는 최초 한 번만 실행된다 | DOM 재생성 |
| 4단계 | 상태가 변경되면 다시 렌더링한다 | 동일 |
| 4단계 | 중첩된 컴포넌트에서 useState가 각각 독립적으로 동작한다 | 동일 |
| 4단계 | 중간 아이템 삭제 시 상태가 올바르게 보존된다 | 동일 |
| 5단계 | useEffect 관련 모든 테스트 | useEffect 미구현 |
| 6단계 | DOM 재사용과 reconciliation | DOM이 재생성됨 |
| 7-10단계 | 대부분 실패 | reconcileChildren, update 로직 문제 |

### 핵심 에러 메시지

```
TypeError: Cannot read properties of undefined (reading 'map')
 ❯ reconcileChildren src/core/reconciler.ts:195:36
```

---

## 현재 코드

### 1. reconciler.ts - update 함수의 component case

```typescript
case "component": {
  context.hooks.componentStack.push(path);
  const newVNode = (node.type as (props: unknown) => VNode)(node.props);
  context.hooks.componentStack.pop();
  const childInstance = reconcile(parentDom, instance.children[0], newVNode, path);
  instance.node = node;
  instance.children = [childInstance];
  return instance;
}
```

### 2. reconcileChildren 함수

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
) => {
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key || String(index);
    return {
      ...acc,
      [key]: oldChild,
    };
  }, {});

  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key || String(index);
    const oldChild = oldChildrenMap[key] || null;
    if (oldChild) delete oldChildrenMap[key];
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);  // 버그!
  });

  Object.values(oldChildrenMap).forEach((oldChild) => {
    unmount(dom, oldChild);
  });

  return newInstances;
};
```

### 3. dom.ts - updateDomProps 함수

```typescript
export const updateDomProps = (
  dom: HTMLElement,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  const changedProps = Object.entries(nextProps)
    .filter(([nextKey, nextValue]) => {
      return !prevProps[nextKey] || prevProps[nextKey] !== nextValue;
    })
    .reduce((acc, [nextKey, nextValue]) => {
      return { ...acc, [nextKey]: nextValue };
    }, {});
  setDomProps(dom, changedProps);
};
```

### 4. hooks.ts - useState 함수

```typescript
export const useState = <T>(initialValue: T | (() => T)): [T, (nextValue: T | ((prev: T) => T)) => void] => {
  const path = context.hooks.currentPath;
  const hooks = context.hooks.currentHooks;
  const cursor = context.hooks.currentCursor;

  if (hooks[cursor] === undefined) {
    hooks[cursor] = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
  }

  const currentCursor = cursor;
  const setState = (nextValue: T | ((prev: T) => T)) => {
    const next = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(hooks[currentCursor]) : nextValue;
    if (!shallowEquals(hooks[currentCursor], next)) {
      hooks[currentCursor] = next;
      enqueueRender();
    }
  };
  context.hooks.cursor.set(path, cursor + 1);
  return [hooks[cursor], setState];
};
```

---

## 피드백

### ✅ 잘한 점

#### 1. reconcile 함수의 기본 구조가 올바릅니다

```typescript
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
): Instance | null => {
  if (node === null) {
    return unmount(parentDom, instance);
  }
  if (instance === null) {
    return mount(parentDom, node, path);
  }
  if (instance.node.type !== node.type || instance.key !== node.key) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path);
  }
  return update(parentDom, instance, node, path);
};
```

React의 reconciliation 핵심 알고리즘을 잘 이해하고 구현했습니다:
- null 처리 (unmount)
- 새 노드 처리 (mount)
- 타입/키 변경 처리 (unmount + mount)
- 동일 노드 업데이트 (update)

#### 2. mount 함수에서 componentStack 관리를 올바르게 구현했습니다

```typescript
if (typeof node.type === "function") {
  context.hooks.componentStack.push(path);
  const newVNode = node.type(node.props);
  context.hooks.componentStack.pop();
  // ...
}
```

컴포넌트 함수 실행 전후로 componentStack을 push/pop하여 훅이 올바른 컴포넌트 경로에서 실행되도록 했습니다.

#### 3. useState의 커서 캡처를 올바르게 구현했습니다

```typescript
const currentCursor = cursor;
const setState = (nextValue: T | ((prev: T) => T)) => {
  const next = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(hooks[currentCursor]) : nextValue;
  // currentCursor를 사용!
};
```

클로저에서 커서를 캡처하여 setState가 항상 올바른 인덱스를 참조하도록 했습니다. 이것은 훅 구현의 핵심 포인트입니다!

#### 4. setDomProps에서 다양한 속성 타입을 올바르게 처리했습니다

```typescript
if (key === "className") {
  dom.setAttribute("class", value);
  return;
}
if (key === "style") {
  Object.entries(value).forEach(([styleKey, styleValue]) => {
    (dom.style as any)[styleKey] = styleValue;
  });
  return;
}
if (key.startsWith("on") && typeof value === "function") {
  const eventName = key.toLowerCase().substring(2);
  dom.addEventListener(eventName, value);
  return;
}
```

className, style, event handler 등 특수 속성 처리가 잘 되어 있습니다.

#### 5. Fragment 처리를 올바르게 구현했습니다

```typescript
if (node.type === Fragment) {
  const instance = {
    kind: "fragment",
    dom: null,  // Fragment는 실제 DOM이 없음
    children: [],
    // ...
  } as Instance;
  // 자식을 부모 DOM에 직접 추가
  instance.children = children.map((child, index) => {
    return reconcile(parentDom, null, child, childPath);
  });
  return instance;
}
```

Fragment가 DOM을 가지지 않고 자식들을 부모에 직접 추가하는 것을 올바르게 이해했습니다.

---

### 🤔 개선할 점

#### 1. **reconcileChildren에서 oldChild를 삭제 후 다시 접근** ⚠️ 중요!

**현재 문제:**
```typescript
const newInstances = newChildren.map((newChild, index) => {
  const key = newChild.key || String(index);
  const oldChild = oldChildrenMap[key] || null;
  if (oldChild) delete oldChildrenMap[key];  // 여기서 삭제
  const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
  return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);  // 삭제된 값 접근!
});
```

**왜 문제인가요?**

`delete oldChildrenMap[key]`로 삭제한 후 바로 다음 줄에서 `oldChildrenMap[key]`를 다시 접근합니다. 이미 삭제된 값이므로 항상 `null`이 전달되어 **DOM이 재사용되지 않고 항상 새로 생성**됩니다.

이것이 3단계 이후 대부분의 테스트 실패 원인입니다!

**해결 방법:**
```typescript
// ❌ 현재
const oldChild = oldChildrenMap[key] || null;
if (oldChild) delete oldChildrenMap[key];
return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);  // 버그!

// ✅ 개선
const oldChild = oldChildrenMap[key] || null;
if (oldChild) delete oldChildrenMap[key];
return reconcile(dom, oldChild, newChild, childPath);  // oldChild 변수 사용
```

---

#### 2. **newChildren이 undefined일 때 처리 누락** ⚠️ 중요!

**현재 문제:**
```typescript
const newInstances = newChildren.map((newChild, index) => {
  // newChildren이 undefined이면 에러 발생!
});
```

**에러 메시지:**
```
TypeError: Cannot read properties of undefined (reading 'map')
```

**왜 문제인가요?**

`node.props.children`이 `undefined`일 수 있습니다. 예를 들어 `<div />` 처럼 자식이 없는 경우입니다.

**해결 방법:**
```typescript
// ❌ 현재
instance.children = reconcileChildren(
  instance.dom as HTMLElement,
  instance.children,
  node.props.children as VNode[],  // undefined 가능!
  path,
);

// ✅ 개선 - 호출부에서 기본값 제공
instance.children = reconcileChildren(
  instance.dom as HTMLElement,
  instance.children,
  (node.props.children as VNode[]) || [],  // 기본값 추가
  path,
);

// 또는 함수 내부에서 처리
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[] = [],  // 기본값
  parentPath: string,
) => {
  // ...
};
```

---

#### 3. **updateDomProps에서 제거된 속성 처리 누락** ⚠️ 필수

**현재 문제:**
```typescript
export const updateDomProps = (
  dom: HTMLElement,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  const changedProps = Object.entries(nextProps)
    .filter(([nextKey, nextValue]) => {
      return !prevProps[nextKey] || prevProps[nextKey] !== nextValue;
    })
    // ...
  setDomProps(dom, changedProps);
};
```

**왜 문제인가요?**

`prevProps`에는 있지만 `nextProps`에는 없는 속성(제거된 속성)을 처리하지 않습니다. 예를 들어:
- `{ className: "old" }` → `{}` 로 변경 시 `class` 속성이 DOM에 남아있음
- 이벤트 핸들러가 변경되면 이전 핸들러가 제거되지 않아 **중복 등록**됨

이것이 "이벤트 핸들러가 올바르게 등록되고 실행된다" 테스트 실패 원인입니다.

**해결 방법:**
```typescript
// ✅ 개선
export const updateDomProps = (
  dom: HTMLElement,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  // 1. 제거된 속성 처리
  Object.keys(prevProps).forEach((key) => {
    if (key === "children") return;
    if (!(key in nextProps)) {
      // 속성 제거
      if (key === "className") {
        dom.removeAttribute("class");
      } else if (key.startsWith("on")) {
        const eventName = key.toLowerCase().substring(2);
        dom.removeEventListener(eventName, prevProps[key]);
      } else {
        dom.removeAttribute(key);
      }
    }
  });

  // 2. 이벤트 핸들러 변경 처리
  Object.keys(nextProps).forEach((key) => {
    if (key.startsWith("on") && typeof nextProps[key] === "function") {
      const eventName = key.toLowerCase().substring(2);
      // 이전 핸들러 제거
      if (prevProps[key]) {
        dom.removeEventListener(eventName, prevProps[key]);
      }
      // 새 핸들러 등록
      dom.addEventListener(eventName, nextProps[key]);
      return;
    }
    // ...
  });

  // 3. 변경된 속성 적용
  const changedProps = Object.entries(nextProps)
    .filter(([nextKey, nextValue]) => {
      if (nextKey.startsWith("on")) return false;  // 이벤트는 위에서 처리
      return prevProps[nextKey] !== nextValue;
    })
    .reduce((acc, [nextKey, nextValue]) => {
      return { ...acc, [nextKey]: nextValue };
    }, {});
  setDomProps(dom, changedProps);
};
```

---

#### 4. **useEffect가 구현되지 않음** ⚠️ 필수

**현재 문제:**
```typescript
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  // 여기를 구현하세요.
  // 비어있음!
};
```

**왜 문제인가요?**

5단계의 모든 useEffect 테스트가 실패하고, 8-10단계의 cleanup 관련 테스트도 실패합니다.

**구현 가이드:**
```typescript
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  const path = context.hooks.currentPath;
  const hooks = context.hooks.currentHooks;
  const cursor = context.hooks.currentCursor;

  // 1. 이전 훅 상태 가져오기
  const prevHook = hooks[cursor] as EffectHook | undefined;

  // 2. 의존성 비교
  const hasChanged = !prevHook ||
    !deps ||
    !shallowEquals(prevHook.deps, deps);

  // 3. 훅 상태 업데이트
  const hook: EffectHook = {
    type: HookTypes.EFFECT,
    deps,
    cleanup: prevHook?.cleanup,
    effect,
  };
  hooks[cursor] = hook;

  // 4. 의존성이 변경되었으면 이펙트 실행 예약
  if (hasChanged) {
    context.effects.queue.push({ path, cursor });
  }

  // 5. 커서 증가
  context.hooks.cursor.set(path, cursor + 1);
};
```

그리고 `render.ts`에서 이펙트를 실행하는 로직이 필요합니다:
```typescript
export const render = (): void => {
  context.hooks.visited.clear();
  context.hooks.cursor.clear();

  const newInstance = reconcile(
    context.root.container!,
    context.root.instance,
    context.root.node,
    ""
  );
  context.root.instance = newInstance;

  cleanupUnusedHooks();

  // 이펙트 실행 예약
  queueMicrotask(flushEffects);
};

const flushEffects = () => {
  const queue = context.effects.queue;
  context.effects.queue = [];

  queue.forEach(({ path, cursor }) => {
    const hooks = context.hooks.state.get(path);
    if (!hooks) return;

    const hook = hooks[cursor] as EffectHook;
    if (!hook) return;

    // 클린업 실행
    if (hook.cleanup) {
      hook.cleanup();
    }

    // 새 이펙트 실행
    hook.cleanup = hook.effect() || undefined;
  });
};
```

---

#### 5. **useState에서 Object.is 대신 shallowEquals 사용** 💡 권장

**현재 문제:**
```typescript
if (!shallowEquals(hooks[currentCursor], next)) {
  hooks[currentCursor] = next;
  enqueueRender();
}
```

**왜 문제인가요?**

React의 `useState`는 `Object.is()`를 사용하여 **참조 동등성**을 비교합니다. `shallowEquals`는 객체 내부 값을 비교하므로 예상과 다른 동작이 발생할 수 있습니다.

**해결 방법:**
```typescript
// ❌ 현재
if (!shallowEquals(hooks[currentCursor], next)) {

// ✅ 개선 - React와 동일하게 Object.is 사용
if (!Object.is(hooks[currentCursor], next)) {
```

---

#### 6. **cleanupUnusedHooks가 구현되지 않음** 💡 권장

**현재 문제:**
```typescript
export const cleanupUnusedHooks = () => {
  // 여기를 구현하세요.
  // 비어있음!
};
```

**왜 문제인가요?**

언마운트된 컴포넌트의 훅 상태가 메모리에 남아있어 재마운트 시 이전 상태가 유지됩니다. 이는 "언마운트된 컴포넌트의 훅 상태를 정리한다" 테스트 실패 원인입니다.

**구현 가이드:**
```typescript
export const cleanupUnusedHooks = () => {
  const visited = context.hooks.visited;
  const state = context.hooks.state;

  // visited에 없는 컴포넌트의 훅 상태 제거
  for (const [path] of state) {
    if (!visited.has(path)) {
      // 이펙트 클린업 실행
      const hooks = state.get(path);
      hooks?.forEach((hook) => {
        if (hook && typeof hook === 'object' && 'cleanup' in hook) {
          (hook as EffectHook).cleanup?.();
        }
      });
      // 상태 제거
      state.delete(path);
    }
  }
};
```

그리고 컴포넌트가 렌더링될 때 `visited`에 추가해야 합니다. `reconciler.ts`의 `mount`와 `update`의 component case에서:

```typescript
// mount 함수의 component case
if (typeof node.type === "function") {
  context.hooks.visited.add(path);  // 추가!
  context.hooks.componentStack.push(path);
  // ...
}

// update 함수의 component case
case "component": {
  context.hooks.visited.add(path);  // 추가!
  context.hooks.componentStack.push(path);
  // ...
}
```

---

#### 7. **update 함수의 host case에서 children 기본값 처리 누락** 📝 참고

**현재 문제:**
```typescript
case "host": {
  // ...
  instance.children = reconcileChildren(
    instance.dom as HTMLElement,
    instance.children,
    node.props.children as VNode[],  // undefined 가능
    path,
  );
  // ...
}
```

---

### 💡 학습 포인트

#### 1. Virtual DOM Reconciliation의 핵심 원리

```
              oldInstance 있음?
                    │
          ┌─────────┴─────────┐
          │                   │
        없음                있음
          │                   │
        mount             타입 같음?
                              │
                    ┌─────────┴─────────┐
                    │                   │
                  다름                 같음
                    │                   │
            unmount + mount          update
```

**핵심**: 같은 타입이면 DOM을 재사용하고, 다르면 새로 생성합니다.

#### 2. key가 중요한 이유

```typescript
// key가 없는 경우 - 인덱스 기반 매칭
[A, B, C] → [B, C]
// 결과: A의 상태 → B, B의 상태 → C (잘못된 매핑!)

// key가 있는 경우 - key 기반 매칭
[A(key:a), B(key:b), C(key:c)] → [B(key:b), C(key:c)]
// 결과: B는 B의 상태 유지, C는 C의 상태 유지 (올바른 매핑!)
```

#### 3. DOM 속성 업데이트 시 고려사항

| 케이스 | 처리 |
|--------|------|
| 추가된 속성 | `setAttribute()` 또는 프로퍼티 설정 |
| 변경된 속성 | 기존 값 제거 후 새 값 설정 |
| 제거된 속성 | `removeAttribute()` 또는 프로퍼티 초기화 |
| 이벤트 핸들러 | 이전 핸들러 `removeEventListener()` 후 새 핸들러 등록 |

#### 4. Hook의 실행 순서와 커서

```
Component 렌더링
    │
    ▼
componentStack.push(path)
    │
    ▼
cursor = 0
    │
    ├── useState() 호출 → hooks[0] 접근 → cursor = 1
    │
    ├── useState() 호출 → hooks[1] 접근 → cursor = 2
    │
    ├── useEffect() 호출 → hooks[2] 접근 → cursor = 3
    │
    ▼
componentStack.pop()
```

**중요**: 훅의 호출 순서가 변경되면 상태가 꼬입니다. 이것이 조건문 안에서 훅을 호출하면 안 되는 이유입니다.

#### 5. Effect 실행 타이밍

```
render() 호출
    │
    ▼
reconcile() - DOM 업데이트
    │
    ▼
브라우저 페인팅
    │
    ▼
마이크로태스크 큐
    │
    ▼
flushEffects() - 이펙트 실행
```

Effect는 DOM 업데이트 후 비동기로 실행되므로 사용자에게 부드러운 경험을 제공합니다.

---

## 다음 단계

### 🔥 즉시 수정해야 할 것 (테스트 통과 필수)

1. **reconcileChildren에서 oldChild 변수 사용** (가장 중요!)
   ```typescript
   return reconcile(dom, oldChild, newChild, childPath);
   ```

2. **newChildren undefined 처리**
   ```typescript
   (node.props.children as VNode[]) || []
   ```

3. **updateDomProps에서 제거된 속성 및 이벤트 핸들러 처리**

### 📝 구현해야 할 것

4. **useEffect 구현** - 5단계 테스트 통과
5. **cleanupUnusedHooks 구현** - 9단계 테스트 통과
6. **visited 추가** - 컴포넌트 렌더링 시 `context.hooks.visited.add(path)`

### 💡 개선하면 좋은 것

7. **useState에서 Object.is 사용** - React와 동일한 동작
8. **console.log("update") 제거** - 디버깅 코드 정리

---

## 수정 우선순위

| 순위 | 수정 항목 | 영향 범위 | 예상 통과 테스트 |
|------|----------|----------|-----------------|
| 1 | reconcileChildren oldChild 버그 수정 | 3-10단계 전체 | 15+ |
| 2 | newChildren undefined 처리 | 7단계 등 | 3+ |
| 3 | updateDomProps 제거된 속성 처리 | 3단계 | 4 |
| 4 | useEffect 구현 | 5, 8, 10단계 | 6+ |
| 5 | cleanupUnusedHooks 구현 | 9단계 | 1+ |

**예상**: 1-3번 수정만으로 20개 이상의 테스트가 통과할 것입니다.

---

## 참고 자료

- `docs/01-implementation-guide.md` - 전체 구현 가이드
- `docs/07-useState-구현-가이드.md` - useState 상세 구현
- `packages/react/src/core/types.ts` - Instance, VNode, EffectHook 타입 정의
- `docs/03-fundamental-knowledge.md` - 핵심 개념 설명

---

## 마무리

전체적으로 reconciliation의 핵심 구조를 잘 이해하고 구현했습니다! 특히:
- reconcile 함수의 분기 처리
- mount 함수의 각 케이스별 처리
- useState의 커서 캡처

이 부분들은 React 내부 동작을 정확히 이해한 것입니다. 👍

다만 `reconcileChildren`의 작은 버그(`oldChild` 변수 미사용)가 대부분의 테스트 실패를 야기하고 있습니다. 이 한 줄만 수정해도 많은 테스트가 통과할 것입니다.

**"작은 실수가 큰 영향을 미친다"**는 것을 배울 수 있는 좋은 경험입니다. 디버깅할 때 변수가 의도한 값을 가지고 있는지 확인하는 습관을 들이면 이런 버그를 빠르게 잡을 수 있습니다.

화이팅! 🚀
