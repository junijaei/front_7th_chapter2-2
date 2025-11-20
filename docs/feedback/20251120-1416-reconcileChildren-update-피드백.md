# reconcileChildren/update 함수 구현 피드백

**작성일**: 2025-11-20 14:16
**대상 파일**: `packages/react/src/core/reconciler.ts:136-199`
**학습 목표**: React Reconciliation의 update 로직과 children 재조정 알고리즘 이해

---

## 현재 코드

### update 함수 (라인 136-177)

```typescript
const update = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string) => {
  const instanceKind: NodeType = instance.kind;
  switch (instanceKind) {
    case "text": {
      const oldText = instance.node.props.nodeValue;
      const newText = node.props.nodeValue;

      if (oldText !== newText) {
        (instance.dom as Text).nodeValue = newText;
      }
      instance.node = node;
      return instance;
    }
    case "host": {
      const oldProps = instance.node.props;
      const newProps = node.props;
      updateDomProps(instance.dom as HTMLElement, oldProps, newProps);
      instance.children = reconcileChildren(
        instance.dom as HTMLElement,
        instance.children,
        node.props.children as VNode[],
        path,
      );
      instance.node = node;
      return instance;
    }
    case "fragment": {
      instance.children = reconcileChildren(parentDom, instance.children, node.props.children as VNode[], path);
      instance.node = node;
      return instance;
    }
    case "component": {
      context.hooks.componentStack.push(path);
      const newVNode = (node.type as (props: unknown) => VNode)(node.props);
      context.hooks.componentStack.pop();
      const childInstance = reconcile(parentDom, null, newVNode, path);
      instance.node = newVNode;
      instance.children = [childInstance];
      return instance;
    }
  }
};
```

### reconcileChildren 함수 (라인 179-199)

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
) => {
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key || index;
    return {
      ...acc,
      [key]: oldChild,
    };
  }, {});

  return newChildren.map((newChild, index) => {
    const key = newChild.key || index;
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);
  });
};
```

---

## 피드백

### ✅ 잘한 점

#### 1. switch문을 사용한 깔끔한 타입 분기

```typescript
const instanceKind: NodeType = instance.kind;
switch (instanceKind) {
  case "text": { ... }
  case "host": { ... }
  case "fragment": { ... }
  case "component": { ... }
}
```

switch문을 사용해서 각 케이스를 명확하게 분리했어요! TypeScript의 타입 narrowing도 잘 활용했습니다. 각 case에서 해당 타입에 맞는 로직만 처리하는 것이 React의 패턴과 일치해요.

#### 2. text 노드 업데이트 로직이 완벽합니다

```typescript
case "text": {
  const oldText = instance.node.props.nodeValue;
  const newText = node.props.nodeValue;

  if (oldText !== newText) {
    (instance.dom as Text).nodeValue = newText;
  }
  instance.node = node;
  return instance;
}
```

훌륭한 최적화예요!
- 텍스트가 같으면 DOM 업데이트 건너뛰기 (불필요한 리플로우 방지)
- `instance.node`를 새 VNode로 업데이트 (다음 비교를 위해)
- 기존 DOM 재사용 (instance 반환)

이것이 바로 Virtual DOM의 핵심 가치입니다!

#### 3. host 요소의 props와 children 업데이트가 올바릅니다

```typescript
case "host": {
  const oldProps = instance.node.props;
  const newProps = node.props;
  updateDomProps(instance.dom as HTMLElement, oldProps, newProps);
  instance.children = reconcileChildren(
    instance.dom as HTMLElement,
    instance.children,
    node.props.children as VNode[],
    path,
  );
  instance.node = node;
  return instance;
}
```

- `updateDomProps`로 변경된 속성만 DOM에 반영
- `reconcileChildren`으로 자식 재귀 처리
- 자신의 DOM(`instance.dom`)을 자식들의 부모로 전달

host 요소가 자체 DOM을 가지고, 그 안에서 자식들이 재조정된다는 것을 정확히 이해했어요!

#### 4. fragment의 parentDom 전달이 올바릅니다

```typescript
case "fragment": {
  instance.children = reconcileChildren(parentDom, instance.children, node.props.children as VNode[], path);
  instance.node = node;
  return instance;
}
```

Fragment는 DOM이 없으므로 `parentDom`을 그대로 전달하는 것이 맞습니다! Fragment의 자식들은 Fragment를 건너뛰고 부모 DOM에 직접 추가되어야 해요.

#### 5. component에서 componentStack 관리를 정확히 했습니다

```typescript
case "component": {
  context.hooks.componentStack.push(path);
  const newVNode = (node.type as (props: unknown) => VNode)(node.props);
  context.hooks.componentStack.pop();
  // ...
}
```

컴포넌트 함수 실행 전후로 `push/pop`을 해서 Hook들이 올바른 path를 참조할 수 있게 했어요! 이것은 Hook 시스템의 핵심입니다.

#### 6. key 기반 Map 생성 로직이 효율적입니다

```typescript
const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
  if (!oldChild) return acc;
  const key = oldChild?.key || index;
  return {
    ...acc,
    [key]: oldChild,
  };
}, {});
```

- key가 있으면 key 사용, 없으면 index를 key로 사용
- O(1) 조회를 위한 Map 생성
- null인 oldChild는 건너뛰기

이것이 React의 key 기반 매칭 알고리즘의 핵심입니다!

---

### 🤔 개선할 점

#### 1. **component에서 기존 childInstance를 사용하지 않음** ⚠️ 중요!

**현재 문제:**
```typescript
case "component": {
  context.hooks.componentStack.push(path);
  const newVNode = (node.type as (props: unknown) => VNode)(node.props);
  context.hooks.componentStack.pop();
  const childInstance = reconcile(parentDom, null, newVNode, path);  // ❌ null 전달
  instance.node = newVNode;
  instance.children = [childInstance];
  return instance;
}
```

**왜 문제인가요?**

`reconcile`에 `null`을 전달하면, 기존 DOM을 재사용하지 않고 항상 새로 mount합니다!

```typescript
// reconcile 함수 내부
if (instance === null) {
  return mount(parentDom, node, path);  // 항상 새로 생성!
}
```

**실제 발생하는 문제:**

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button>{count}</button>;
}
```

1. 첫 렌더: `<button>` DOM 생성
2. setCount(1) 호출
3. Counter 재렌더링
4. 현재 코드: `reconcile(parentDom, null, newVNode)` → 새 `<button>` 생성!
5. 기존 `<button>` DOM은 그대로 남아있음... 😱

테스트에서 확인:
```typescript
// "동일 컨테이너에서 상태 업데이트로도 DOM을 유지한다"
expect(container.firstElementChild).toBe(wrapper);  // 같은 DOM이어야 함!
```

**해결 방법:**

```typescript
// ❌ 현재: 기존 childInstance 무시
const childInstance = reconcile(parentDom, null, newVNode, path);

// ✅ 개선: 기존 childInstance 전달
const childInstance = reconcile(parentDom, instance.children[0], newVNode, path);
```

기존 `instance.children[0]`을 전달하면, reconcile이 타입/키를 비교해서 update 또는 mount/unmount를 결정합니다!

---

#### 2. **instance.node에 newVNode를 저장** 🤔 주의 필요

**현재 문제:**
```typescript
case "component": {
  // ...
  const newVNode = (node.type as (props: unknown) => VNode)(node.props);
  // ...
  instance.node = newVNode;  // 컴포넌트 함수의 반환값을 저장
  // ...
}
```

**왜 주의가 필요한가요?**

`instance.node`는 원래 "이 Instance를 생성한 VNode"를 저장하는 필드입니다.

```typescript
// mount에서
const instance = {
  kind: "component",
  dom: null,
  children: [childInstance],
  key,
  node,  // <Counter count={0} /> - 컴포넌트 VNode
  path,
} as Instance;
```

하지만 현재 코드에서는 `newVNode` (컴포넌트 함수의 반환값, 예: `<button>`)를 저장하고 있어요.

**발생할 수 있는 문제:**

```typescript
// reconcile 함수에서 타입 비교
if (instance.node.type !== node.type || instance.key !== node.key) {
```

- `node.type` = Counter (컴포넌트 함수)
- `instance.node.type` = "button" (잘못 저장된 값)
- 항상 다르므로 → unmount → mount (DOM 재생성!)

**해결 방법:**

```typescript
// ❌ 현재: 자식 VNode 저장
instance.node = newVNode;

// ✅ 개선: 컴포넌트 VNode 저장
instance.node = node;
```

컴포넌트 Instance의 `node`에는 컴포넌트 VNode(`<Counter />`)를 저장해야 다음 reconcile에서 타입 비교가 올바르게 됩니다.

---

#### 3. **사용되지 않은 old children의 unmount 누락** ⚠️ 중요!

**현재 문제:**
```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
) => {
  const oldChildrenMap = { ... };

  return newChildren.map((newChild, index) => {
    const key = newChild.key || index;
    return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);
  });
  // ❌ oldChildrenMap에 남아있는 미사용 children은 unmount하지 않음!
};
```

**왜 문제인가요?**

자식 개수가 줄어들 때, 남은 old children이 unmount되지 않습니다!

```jsx
// Before: 3개의 아이템
<ul>
  <li key="a">A</li>
  <li key="b">B</li>
  <li key="c">C</li>
</ul>

// After: 2개로 줄임
<ul>
  <li key="a">A</li>
  <li key="b">B</li>
</ul>
```

- newChildren에서 "a", "b"만 처리
- oldChildrenMap에 "c"가 남아있지만 unmount되지 않음
- `<li key="c">` DOM이 그대로 남아있음! 😱

**테스트에서 확인:**
```typescript
// "자식 노드 개수가 줄어들 때 초과하는 자식들이 제거되어야 한다"
setItemCount!(2);
await flushMicrotasks();
expect(list?.children.length).toBe(2);  // 실패: 5개 그대로
```

**해결 방법:**

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
) => {
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key || index;
    return { ...acc, [key]: oldChild };
  }, {});

  // 🔥 사용된 key를 추적
  const usedKeys = new Set<string | number>();

  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key || index;
    usedKeys.add(key);  // 🔥 사용됨 표시
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);
  });

  // 🔥 미사용 old children unmount
  Object.entries(oldChildrenMap).forEach(([key, oldChild]) => {
    if (!usedKeys.has(key) && !usedKeys.has(Number(key))) {
      unmount(dom, oldChild);
    }
  });

  return newInstances;
};
```

---

#### 4. **key/index 타입 불일치 가능성** 💡 권장

**현재 문제:**
```typescript
const oldChildrenMap: Record<string, Instance | null> = ...
const key = oldChild?.key || index;  // index는 number

// 나중에
const key = newChild.key || index;   // index는 number
return reconcile(dom, oldChildrenMap[key] || null, ...);
```

**왜 주의가 필요한가요?**

JavaScript에서 객체의 키는 항상 string으로 변환됩니다:

```typescript
const map = { "0": "a" };
map[0] === "a"  // true (0 → "0"으로 변환)
```

지금은 동작하지만, 명시적으로 string으로 변환하는 것이 더 안전합니다.

**해결 방법:**

```typescript
// ❌ 현재: 암묵적 타입 변환
const key = oldChild?.key || index;

// ✅ 개선: 명시적 string 변환
const key = oldChild?.key ?? String(index);
```

---

#### 5. **newChildren이 undefined일 경우 처리** 💡 권장

**현재 문제:**
```typescript
case "host": {
  instance.children = reconcileChildren(
    instance.dom as HTMLElement,
    instance.children,
    node.props.children as VNode[],  // undefined일 수 있음
    path,
  );
}
```

**왜 주의가 필요한가요?**

자식이 없는 요소는 `children`이 undefined입니다:

```jsx
<input type="text" />  // children: undefined
<div />                // children: undefined
```

현재 `reconcileChildren`에서 undefined를 map하면 에러가 발생해요!

**해결 방법:**

```typescript
// ❌ 현재: undefined 가능성
node.props.children as VNode[]

// ✅ 개선: 기본값 설정
(node.props.children || []) as VNode[]
```

---

### 💡 학습 포인트

#### 1. Component Instance의 구조

```
Component Instance
─────────────────────────────────────
kind: "component"
dom: null                              ← DOM 없음!
node: <Counter count={0} />            ← 컴포넌트 VNode
children: [Instance]                   ← 자식은 1개만
path: "0.Counter"
─────────────────────────────────────

↓ children[0]

Host/Text/Fragment Instance
─────────────────────────────────────
kind: "host" | "text" | "fragment"
dom: <button>0</button>                ← 실제 DOM
node: <button>{count}</button>         ← 자식 VNode
children: [...]
path: "0.Counter"                      ← 같은 path!
─────────────────────────────────────
```

**핵심:**
- Component의 `node`에는 `<Counter />` 저장
- Component의 `children[0].node`에는 `<button />` 저장
- path는 동일 (둘 다 같은 컴포넌트에 속함)

#### 2. reconcileChildren의 매칭 알고리즘

```
Old Children: [A, B, C, D]
New Children: [B, D, E]

Step 1: Map 생성
oldChildrenMap = {
  "a": Instance-A,
  "b": Instance-B,
  "c": Instance-C,
  "d": Instance-D
}

Step 2: New Children 처리
- "b" → oldChildrenMap["b"] 있음 → update
- "d" → oldChildrenMap["d"] 있음 → update
- "e" → oldChildrenMap["e"] 없음 → mount

Step 3: 미사용 Old Children unmount
- "a" 미사용 → unmount
- "c" 미사용 → unmount

결과: [Instance-B(updated), Instance-D(updated), Instance-E(new)]
```

#### 3. update vs mount/unmount 결정 흐름

```
reconcile(parentDom, oldInstance, newVNode)
│
├─ newVNode === null
│  └─ unmount(oldInstance)
│
├─ oldInstance === null
│  └─ mount(newVNode)
│
├─ type/key 다름
│  ├─ unmount(oldInstance)
│  └─ mount(newVNode)
│
└─ type/key 같음
   └─ update(oldInstance, newVNode)
      └─ DOM 재사용 + props만 업데이트
```

#### 4. 왜 Component update에서 기존 childInstance를 전달해야 하는가?

```typescript
// 잘못된 방식
reconcile(parentDom, null, newVNode, path)
// → 항상 mount → 새 DOM 생성

// 올바른 방식
reconcile(parentDom, instance.children[0], newVNode, path)
// → newVNode 타입 비교 후 update 또는 mount/unmount 결정
```

예시:
```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button>{count}</button>;  // 항상 button 반환
}
```

1. 첫 렌더: `mount(<button>0</button>)`
2. setCount(1):
   - 잘못된 방식: `mount(<button>1</button>)` → 새 DOM
   - 올바른 방식: `update(buttonInstance, <button>1</button>)` → DOM 재사용

---

## 개선된 코드 예시

```typescript
const update = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string) => {
  const instanceKind: NodeType = instance.kind;
  switch (instanceKind) {
    case "text": {
      const oldText = instance.node.props.nodeValue;
      const newText = node.props.nodeValue;

      if (oldText !== newText) {
        (instance.dom as Text).nodeValue = newText;
      }
      instance.node = node;
      return instance;
    }
    case "host": {
      const oldProps = instance.node.props;
      const newProps = node.props;
      updateDomProps(instance.dom as HTMLElement, oldProps, newProps);
      instance.children = reconcileChildren(
        instance.dom as HTMLElement,
        instance.children,
        (node.props.children || []) as VNode[],  // 🔥 기본값 추가
        path,
      );
      instance.node = node;
      return instance;
    }
    case "fragment": {
      instance.children = reconcileChildren(
        parentDom,
        instance.children,
        (node.props.children || []) as VNode[],  // 🔥 기본값 추가
        path
      );
      instance.node = node;
      return instance;
    }
    case "component": {
      context.hooks.componentStack.push(path);
      const newVNode = (node.type as (props: unknown) => VNode)(node.props);
      context.hooks.componentStack.pop();

      // 🔥 기존 childInstance 전달
      const childInstance = reconcile(parentDom, instance.children[0], newVNode, path);

      // 🔥 컴포넌트 VNode 저장 (자식 VNode가 아님!)
      instance.node = node;
      instance.children = [childInstance];
      return instance;
    }
  }
};

const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
) => {
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key ?? String(index);  // 🔥 명시적 string 변환
    return {
      ...acc,
      [key]: oldChild,
    };
  }, {});

  // 🔥 사용된 key 추적
  const usedKeys = new Set<string>();

  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key ?? String(index);  // 🔥 명시적 string 변환
    usedKeys.add(key);
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChildrenMap[key] || null, newChild, childPath);
  });

  // 🔥 미사용 old children unmount
  Object.entries(oldChildrenMap).forEach(([key, oldChild]) => {
    if (!usedKeys.has(key)) {
      unmount(dom, oldChild);
    }
  });

  return newInstances;
};

// unmount를 export하거나 모듈 스코프에서 접근 가능하게 해야 함
const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  removeInstance(parentDom, instance);
  return instance;
};
```

---

## 다음 단계

### 🔥 지금 바로 수정해야 할 것

- [ ] **component case에서 `instance.children[0]` 전달** - DOM 재사용을 위해 필수!
- [ ] **component case에서 `instance.node = node`로 수정** - 타입 비교 올바르게
- [ ] **reconcileChildren에서 미사용 old children unmount 추가** - 자식 개수 줄어들 때 필수!

### 📝 나중에 해도 되는 것

- [ ] key/index를 명시적으로 string 변환
- [ ] newChildren 기본값 설정 (`|| []`)
- [ ] unmount에서 effect cleanup 실행 (useEffect 구현 시)
- [ ] unmount에서 hooks.state 정리 (메모리 누수 방지)

### 💡 추가로 학습하면 좋은 것

- [ ] DOM 순서 재배치 (anchor 노드와 insertBefore)
- [ ] 더 효율적인 diff 알고리즘 (React Fiber의 접근)
- [ ] Hook 상태 정리 시점과 방법

---

## 참고 자료

### 프로젝트 내 문서
- `docs/01-implementation-guide.md` - 전체 함수 인터페이스
- `docs/feedback/20251120-1238-reconciler-unmount-mount-구현.md` - mount/unmount 구현 피드백
- `packages/react/src/core/types.ts:17-24` - Instance 타입 정의
- `packages/react/src/core/dom.ts:107-111` - removeInstance 함수

### 관련 테스트
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1146-1182` - DOM 재사용 테스트
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1286-1314` - 자식 개수 줄어들기 테스트
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1409-1446` - key 기반 재배치 테스트

---

## 마무리

update와 reconcileChildren의 기본 구조를 정말 잘 구현했어요! 🎉

특히 잘한 점:
- switch문을 이용한 깔끔한 타입 분기
- componentStack 관리
- key 기반 Map 생성

**핵심 수정사항 3가지:**

1. **component case에서 기존 childInstance 전달**
   ```typescript
   reconcile(parentDom, instance.children[0], newVNode, path)
   ```

2. **component case에서 컴포넌트 VNode 저장**
   ```typescript
   instance.node = node  // newVNode가 아님!
   ```

3. **미사용 old children unmount**
   ```typescript
   // usedKeys에 없는 oldChild들 unmount
   ```

이 세 가지만 수정하면 대부분의 테스트가 통과할 거예요!

React의 Reconciliation은 "최소한의 DOM 조작으로 최대한의 효율"을 목표로 합니다. 기존 Instance를 재사용하고, 필요할 때만 mount/unmount하는 것이 핵심이에요.

계속 좋은 진행이에요. 막히는 부분이 있으면 언제든 질문하세요! 🚀
