# Reconciler DOM 순서 문제 해결 피드백

**작성일**: 2025-11-21 04:20
**관련 파일**: `packages/react/src/core/reconciler.ts`, `packages/react/src/core/dom.ts`, `packages/react/src/core/render.ts`

---

## 문제 상황

### 증상
`PageWrapper` 컴포넌트에서 Footer가 페이지 최상단에 렌더링됨.

### 예상 순서
```
header → main → CartModal → Toast → Footer
```

### 실제 순서
```
Footer → header → main → CartModal → Toast
```

---

## 원본 코드의 문제점

### 1. `getFirstDom` 재귀 호출 누락

```typescript
// Before
export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  if (!instance) return null;
  if (instance.dom) return instance.dom;
  for (const child of instance.children) {
    if (child?.dom) return child.dom;  // 문제! 재귀 호출이 아님
  }
  return null;
};
```

**문제**: 자식이 컴포넌트나 Fragment인 경우, `child.dom`이 null이므로 실제 DOM을 찾지 못함.

### 2. `mount`에서 자식을 순서대로 삽입

```typescript
// Before - mount 내부
if (props.children) {
  instance.children = props.children
    .filter((child) => !!child)
    .map((child, index) => {
      const childPath = createChildPath(path, child.key, index, child.type);
      return reconcile(dom, null, child, childPath);  // 순서대로 삽입
    });
}
```

**문제**: `reconcile`이 내부에서 `insertInstance`를 호출하면서 순서대로 삽입하는데, 이후 `reconcileChildren`에서 역순 삽입을 시도하면 이미 삽입된 DOM과 충돌.

### 3. `reconcileChildren`의 anchor 계산

```typescript
// Before
for (let i = newInstances.length - 1; i >= 0; i--) {
  const instance = newInstances[i];
  if (!instance) continue;

  const nextInstance = newInstances[i + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;  // 다음 instance에서 anchor 계산
  insertInstance(dom, instance, anchor);
}
```

**문제**: `nextInstance`에서 anchor를 계산하는데, 이미 삽입된 DOM이면 위치가 맞지 않을 수 있음.

### 4. 컴포넌트 반환값 정규화 누락

```typescript
// CartModal 컴포넌트
if (!isOpen) {
  return "";  // 빈 문자열 반환
}
```

**문제**: 빈 문자열이 VNode로 처리되지 않아 `mount`에서 오류 발생.

---

## 해결 과정

### 시도 1: `getFirstDom` 재귀 호출 수정

```typescript
// After
export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  if (!instance) return null;
  if (instance.dom) return instance.dom;
  for (const child of instance.children) {
    const dom = getFirstDom(child);  // 재귀 호출
    if (dom) return dom;
  }
  return null;
};
```

**결과**: 부분적으로 개선되었으나 여전히 순서 문제 존재.

### 시도 2: `mountChildren` 함수 분리

DOM 생성과 삽입을 분리하는 패턴 적용:

```typescript
// After
const mountChildren = (parentDom: HTMLElement, children: VNode[], parentPath: string): (Instance | null)[] => {
  // 1. 모든 자식 인스턴스 생성 (DOM 삽입 없이)
  const instances = children.map((child, index) => {
    if (!child) return null;
    const childPath = createChildPath(parentPath, child.key, index, child.type, children);
    return mount(parentDom, child, childPath);
  });

  // 2. 역순으로 DOM 삽입 (올바른 순서 보장)
  let anchor: HTMLElement | Text | null = null;
  for (let i = instances.length - 1; i >= 0; i--) {
    const instance = instances[i];
    if (!instance) continue;
    insertInstance(parentDom, instance, anchor);
    anchor = getFirstDom(instance);  // 방금 삽입한 DOM을 다음 anchor로
  }

  return instances;
};
```

**결과**: mount 시 순서는 올바르게 됨.

### 시도 3: `reconcile`에서 삽입 로직 분리

문제: `reconcile`이 mount 후 항상 `insertInstance(parentDom, newInstance, null)`로 맨 끝에 삽입.

```typescript
// Before
if (instance === null) {
  const newInstance = mount(parentDom, node, path);
  if (newInstance) {
    insertInstance(parentDom, newInstance, null);  // 항상 맨 끝에 삽입!
  }
  return newInstance;
}
```

**해결**: mount 시 삽입을 제거하고 호출자가 삽입을 담당하도록 변경.

```typescript
// After
if (instance === null) {
  return mount(parentDom, node, path);  // 삽입 없이 반환만
}
```

**결과**: 테스트 실패 - 루트 레벨에서 삽입이 안 됨.

### 시도 4: `render.ts`에서 루트 삽입 처리

```typescript
// After
export const render = (): void => {
  // ...
  const oldInstance = context.root.instance;
  const newInstance = reconcile(context.root.container!, oldInstance, context.root.node, "");
  context.root.instance = newInstance;

  // 최초 마운트 시 루트 인스턴스를 컨테이너에 삽입
  if (!oldInstance && newInstance) {
    insertInstance(context.root.container!, newInstance, null);
  }
  // ...
};
```

### 시도 5: 타입 변경 시 anchor 유지

```typescript
// After
if (instance.node.type !== node.type || instance.key !== node.key) {
  // 제거 전에 다음 sibling을 anchor로 저장
  const firstDom = getFirstDom(instance);
  const anchor = firstDom?.nextSibling as HTMLElement | Text | null;
  removeInstance(parentDom, instance);
  const newInstance = mount(parentDom, node, path);
  if (newInstance) {
    insertInstance(parentDom, newInstance, anchor);
  }
  return newInstance;
}
```

### 시도 6: 컴포넌트 반환값 정규화

```typescript
// After - mount 내 함수형 컴포넌트 처리
if (typeof type === "function") {
  context.hooks.componentStack.push(path);
  context.hooks.visited.add(path);
  const rawVNode = type(props);
  const childVNode = normalizeNode(rawVNode);  // 정규화 추가
  context.hooks.componentStack.pop();

  const childInstance = childVNode ? mount(parentDom, childVNode, path) : null;
  // ...
}

// After - update의 component 케이스
case "component": {
  // ...
  const rawVNode = (node.type as (props: unknown) => VNode)(node.props || {});
  const childVNode = normalizeNode(rawVNode);  // 정규화 추가
  // ...
}
```

---

## 최종 해결책

### 핵심 변경사항

1. **DOM 생성과 삽입 분리**
   - `mount`는 DOM을 생성만 하고 삽입하지 않음
   - `mountChildren`과 `reconcileChildren`에서 역순 삽입으로 순서 보장

2. **anchor 계산 방식 변경**
   - 이전: 다음 instance에서 anchor 계산
   - 이후: 방금 삽입한 DOM을 다음 anchor로 사용

3. **컴포넌트 반환값 정규화**
   - `normalizeNode`로 빈 문자열, null 등 처리

4. **삽입 책임 명확화**
   - 루트 레벨: `render.ts`에서 삽입
   - 자식들: `mountChildren`/`reconcileChildren`에서 역순 삽입
   - 타입 변경: `reconcile`에서 anchor를 사용하여 삽입

### 역순 삽입 패턴의 원리

```
자식: [A, B, C]

역순 삽입:
1. C 삽입 (anchor=null) → [C]
2. B 삽입 (anchor=C) → [B, C]
3. A 삽입 (anchor=B) → [A, B, C]
```

이 패턴이 올바른 순서를 보장하는 이유:
- 마지막 요소부터 삽입하면 항상 이전에 삽입한 요소를 anchor로 사용 가능
- `insertBefore(dom, anchor)`로 anchor 앞에 삽입

---

## 학습 포인트

### 1. DOM 삽입 전략

**잘못된 방식**: 생성하면서 바로 삽입
```typescript
children.map(child => {
  const instance = mount(parentDom, child, path);
  insertInstance(parentDom, instance, null);  // 순서대로 삽입
});
```

**올바른 방식**: 모두 생성 후 역순 삽입
```typescript
const instances = children.map(child => mount(parentDom, child, path));
for (let i = instances.length - 1; i >= 0; i--) {
  insertInstance(parentDom, instances[i], anchor);
  anchor = getFirstDom(instances[i]);
}
```

### 2. Reconciliation에서 책임 분리

- `reconcile`: 단일 노드의 mount/update/unmount 결정
- `reconcileChildren`: 자식들의 재조정 및 DOM 위치 조정
- `mount`: DOM 생성만 (삽입은 호출자 책임)
- `update`: 기존 인스턴스 업데이트

### 3. 컴포넌트 반환값 처리

React에서 컴포넌트는 다양한 값을 반환할 수 있음:
- VNode
- 문자열/숫자 → 텍스트 노드로 변환
- null/undefined/false → 렌더링하지 않음
- 빈 문자열 → null로 처리

이를 일관되게 처리하기 위해 `normalizeNode` 사용.

---

## Before/After 비교

### reconcileChildren

**Before**:
```typescript
const newInstances = newChildren
  .filter((child) => !!child)
  .map((newChild, index) => {
    const key = newChild.key || String(index);
    const oldChild = oldChildrenMap[key] || null;
    if (oldChild) delete oldChildrenMap[key];
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChild, newChild, childPath);
  });

// anchor 계산: 다음 instance에서
for (let i = newInstances.length - 1; i >= 0; i--) {
  const nextInstance = newInstances[i + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
  insertInstance(dom, instance, anchor);
}
```

**After**:
```typescript
const newInstances = newChildren.map((newChild, index) => {
  if (!newChild) return null;
  const key = newChild.key ?? String(index);
  const oldChild = oldChildrenMap.get(key) || null;
  if (oldChild) oldChildrenMap.delete(key);
  const childPath = createChildPath(parentPath, newChild.key, index, newChild.type, newChildren);

  if (oldChild) {
    if (oldChild.node.type === newChild.type && oldChild.key === newChild.key) {
      return update(parentDom, oldChild, newChild, childPath);
    }
    removeInstance(parentDom, oldChild);
  }
  return mount(parentDom, newChild, childPath);
});

// anchor 계산: 방금 삽입한 DOM에서
let anchor: HTMLElement | Text | null = null;
for (let i = newInstances.length - 1; i >= 0; i--) {
  insertInstance(parentDom, instance, anchor);
  anchor = getFirstDom(instance);
}
```

---

## 테스트 결과

모든 테스트 통과:
- basic.mini-react.test.tsx: 52 tests passed
- basic.equals.test.tsx: 8 tests passed
- advanced.hooks.test.tsx: 8 tests passed
- advanced.hoc.test.tsx: 4 tests passed

---

## 향후 개선 사항

1. **성능 최적화**: `insertInstance`에서 이미 올바른 위치에 있으면 건너뛰는 최적화 검증

2. **타입 안전성**: `normalizeNode` 반환 타입 명확화

3. **디버깅 지원**: 개발 모드에서 잘못된 반환값에 대한 경고 추가

---

## 요약

| 문제 | 원인 | 해결 |
|------|------|------|
| Footer가 최상단에 렌더링 | mount 시 순서대로 삽입 | 역순 삽입 패턴 적용 |
| getFirstDom이 DOM 못 찾음 | 재귀 호출 누락 | 재귀 호출 추가 |
| 빈 문자열 오류 | 컴포넌트 반환값 정규화 안됨 | normalizeNode 적용 |
| 타입 변경 시 위치 이탈 | 삽입 시 anchor 없음 | nextSibling을 anchor로 사용 |

**핵심 교훈**: DOM 삽입은 생성과 분리하여 역순으로 처리해야 올바른 순서가 보장됨.
