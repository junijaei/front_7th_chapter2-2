# Reconciler unmount/mount 구현 피드백

**작성일**: 2025-11-20 12:38
**대상 파일**: `packages/react/src/core/reconciler.ts:24-137`
**학습 목표**: React Reconciliation의 핵심 개념과 VNode → Instance 변환 이해

---

## 현재 코드

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
  if (instance.kind !== node.type || instance.key !== node.key) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path);
  }
  return update(parentDom, instance, node, path);
};

const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  removeInstance(parentDom, instance);
  return instance;
};

const mount = (parentDom: HTMLElement, node: VNode, path: string) => {
  const { key } = node;

  // TEXT_ELEMENT 처리
  if (node.type === TEXT_ELEMENT) { ... }

  // Fragment 처리
  if (node.type === Fragment) { ... }

  // Host element 처리 (div, span 등)
  if (typeof node.type === "string") { ... }

  // Component 처리
  if (typeof node.type === "function") { ... }
};

const update = (parentDom: HTMLElement, instance: Instance | null, node: VNode | null, path: string) => {
  return instance;
};
```

---

## 피드백

### ✅ 잘한 점

#### 1. reconcile 함수의 분기 로직이 완벽합니다

```typescript
if (node === null) {
  return unmount(parentDom, instance);
}
if (instance === null) {
  return mount(parentDom, node, path);
}
if (instance.kind !== node.type || instance.key !== node.key) {
  unmount(parentDom, instance);
  return mount(parentDom, node, path);
}
return update(parentDom, instance, node, path);
```

React의 Reconciliation 핵심 알고리즘을 정확히 이해하고 구현했어요!
- `node === null`: 새 노드 없음 → unmount
- `instance === null`: 기존 노드 없음 → mount
- 타입/키 다름: 교체 (unmount → mount)
- 같음: update

이 4가지 분기가 Reconciliation의 전부입니다!

#### 2. mount 함수의 노드 타입별 분기가 체계적입니다

```typescript
if (node.type === TEXT_ELEMENT) { ... }
if (node.type === Fragment) { ... }
if (typeof node.type === "string") { ... }
if (typeof node.type === "function") { ... }
```

4가지 노드 타입을 명확히 구분했어요:
1. **TEXT_ELEMENT**: 텍스트 노드
2. **Fragment**: 가상 컨테이너 (DOM 없음)
3. **string**: 실제 DOM 요소
4. **function**: 컴포넌트

이 분류가 React의 VNode 타입 시스템의 핵심입니다!

#### 3. Instance 구조를 정확하게 생성했습니다

```typescript
const instance = {
  kind: "host",
  dom,
  children: [],
  key,
  node,
  path,
} as Instance;
```

모든 필수 필드를 빠짐없이 설정했어요:
- `kind`: Instance 타입 식별
- `dom`: 실제 DOM 노드 참조
- `children`: 자식 Instance 배열
- `key`: Reconciliation에서 매칭용
- `node`: 원본 VNode 저장
- `path`: Hook 상태 식별자

#### 4. 자식 노드의 재귀 처리가 올바릅니다

```typescript
instance.children = children
  .filter((child) => !!child)
  .map((child, index) => {
    const childPath = createChildPath(path, child.key, index, child.type);
    return reconcile(dom, null, child, childPath);
  });
```

- `filter`로 null/undefined 자식 제거
- `map`으로 각 자식을 Instance로 변환
- `createChildPath`로 고유 경로 생성
- `reconcile` 재귀 호출로 트리 구조 완성

이것이 React 트리 구조의 핵심 패턴입니다!

#### 5. Fragment의 특성을 이해하고 처리했습니다

```typescript
if (node.type === Fragment) {
  const instance = {
    kind: "fragment",
    dom: null,  // Fragment는 DOM이 없음!
    ...
  } as Instance;
  // 자식들을 직접 parentDom에 추가
}
```

Fragment가 `dom: null`이어야 한다는 것을 정확히 이해했어요. Fragment의 자식들은 Fragment를 건너뛰고 부모 DOM에 직접 삽입됩니다.

---

### 🤔 개선할 점

#### 1. **타입/키 비교 오류** ⚠️ 중요!

**현재 문제:**
```typescript
if (instance.kind !== node.type || instance.key !== node.key) {
```

**왜 문제인가요?**

`instance.kind`와 `node.type`은 다른 값입니다!

```typescript
// instance.kind의 값들
"text" | "fragment" | "host" | "component"

// node.type의 값들
TEXT_ELEMENT (Symbol) | Fragment (Symbol) | "div" | "span" | ComponentFunction
```

예시:
```typescript
// <div>Hello</div>의 경우
node.type = "div"
instance.kind = "host"

// "div" !== "host" → 항상 unmount/mount!
```

**해결 방법:**

```typescript
// ❌ 현재: kind와 type 비교 (틀림)
if (instance.kind !== node.type || instance.key !== node.key) {

// ✅ 개선: node.type끼리 비교
if (instance.node.type !== node.type || instance.key !== node.key) {
```

`instance.node`에 원본 VNode가 저장되어 있으므로, `instance.node.type`과 `node.type`을 비교해야 합니다!

---

#### 2. **Component에서 componentStack 관리 누락** ⚠️ 중요!

**현재 문제:**
```typescript
if (typeof node.type === "function") {
  const newVNode = node.type(node.props);  // 컴포넌트 함수 호출
  // ...
}
```

**왜 문제인가요?**

컴포넌트 함수 내부에서 `useState`, `useEffect` 등의 Hook을 호출하면, `context.hooks.currentPath`가 필요합니다. 하지만 `componentStack`이 비어있으면 에러가 발생해요!

```typescript
// context.ts의 currentPath getter
get currentPath() {
  if (!this.componentStack.length)
    throw Error("훅은 컴포넌트 내부에서만 호출되어야 합니다");
  return this.componentStack[this.componentStack.length - 1];
}
```

**해결 방법:**

```typescript
// ❌ 현재: componentStack 관리 없음
if (typeof node.type === "function") {
  const newVNode = node.type(node.props);
  // ...
}

// ✅ 개선: push/pop으로 컴포넌트 실행 컨텍스트 설정
if (typeof node.type === "function") {
  context.hooks.componentStack.push(path);  // 🔥 추가
  const newVNode = node.type(node.props);
  context.hooks.componentStack.pop();       // 🔥 추가
  // ...
}
```

이렇게 하면 컴포넌트 함수 실행 중에 Hook이 올바른 path를 참조할 수 있습니다.

---

#### 3. **unmount에서 cleanup 처리 누락** 💡 권장

**현재 문제:**
```typescript
const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  removeInstance(parentDom, instance);
  return instance;
};
```

**왜 문제인가요?**

컴포넌트가 unmount될 때, `useEffect`의 cleanup 함수가 실행되어야 하고, Hook 상태도 정리되어야 합니다.

테스트 케이스를 보면:
```typescript
// 테스트: "useEffect 클린업은 재실행과 언마운트 시 호출된다"
toggle!();  // Child를 unmount
await flushMicrotasks();
expect(cleanupCount).toBe(2);  // cleanup이 호출되어야 함!
```

**해결 방법:**

이 부분은 나중에 `useEffect` 구현과 함께 처리하면 됩니다. 지금은 일단 넘어가세요!

나중에 구현할 내용:
```typescript
const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  // 1. 자식들도 재귀적으로 unmount
  // 2. useEffect cleanup 실행
  // 3. hooks.state에서 해당 path 삭제
  // 4. DOM 제거
  removeInstance(parentDom, instance);
  return instance;
};
```

---

#### 4. **Fragment 자식에서 insertInstance 누락** 💡 권장

**현재 문제:**
```typescript
if (node.type === Fragment) {
  const instance = { ... } as Instance;
  if (children) {
    instance.children = children
      .filter((child) => !!child)
      .map((child, index) => {
        const childPath = createChildPath(path, child.key, index, child.type);
        return reconcile(parentDom, null, child, childPath);
      });
  }
  return instance;  // Fragment 자체는 insertInstance 안함 (올바름)
}
```

Fragment 처리는 대체로 올바르지만, Fragment의 자식들이 `parentDom`에 삽입될 때 순서가 보장되는지 확인이 필요해요.

현재 `insertInstance`는 단순히 `appendChild`를 사용하는데, 이것은 항상 맨 뒤에 추가합니다. Fragment가 중간에 있을 경우 순서가 맞지 않을 수 있어요.

**나중에 고려할 사항:**
- anchor 노드를 사용한 정확한 위치 삽입
- 형제 노드 순서 보장

---

### 💡 학습 포인트

#### 1. Instance와 VNode의 관계

```
VNode (설계도)          Instance (실제 건물)
─────────────           ─────────────────────
type: "div"             kind: "host"
key: "item-1"    →      dom: <div>
props: {...}            node: VNode (원본 참조)
                        children: [Instance, ...]
                        key: "item-1"
                        path: "0.item-1"
```

**핵심 차이점:**
- VNode: React 엘리먼트의 **설명** (immutable)
- Instance: 실제 **상태와 DOM** 보유 (mutable)

#### 2. kind vs type

| 속성 | 위치 | 값 예시 | 용도 |
|------|------|---------|------|
| `kind` | Instance | "host", "component" | Instance 종류 식별 |
| `type` | VNode | "div", Fragment, fn | VNode 타입 |

**비교 규칙:**
- **같은 종류끼리 비교!**
- Instance → `instance.node.type`
- VNode → `node.type`

#### 3. Component Stack의 역할

```typescript
function Parent() {
  const [count] = useState(0);     // path = "Parent"
  return <Child />;
}

function Child() {
  const [name] = useState("Kim");  // path = "Parent.Child"
  return <div>{name}</div>;
}
```

**실행 흐름:**
```
1. componentStack.push("Parent")
2. useState(0) → currentPath = "Parent"
3. Child 렌더링 시작
   - componentStack.push("Parent.Child")
   - useState("Kim") → currentPath = "Parent.Child"
   - componentStack.pop()
4. componentStack.pop()
```

Stack을 사용하면 중첩된 컴포넌트에서도 각각의 path를 정확히 추적할 수 있습니다!

---

## 추가 질문과 답변

### Q1. 왜 push하고 바로 pop을 하는 거야? 원리가 잘 이해가 안 가.

**정말 좋은 질문이에요!** push/pop이 바로 연속으로 있어서 헷갈릴 수 있어요.

#### 핵심: "바로" pop하는 게 아닙니다!

```typescript
context.hooks.componentStack.push(path);  // 1. push
const newVNode = node.type(node.props);   // 2. 컴포넌트 함수 실행 (여기가 핵심!)
context.hooks.componentStack.pop();       // 3. pop
```

**2번에서 많은 일이 일어납니다!**

#### 실제 실행 순서를 따라가 보면

```typescript
// Counter 컴포넌트
function Counter() {
  const [count, setCount] = useState(0);     // Hook 호출!
  const [name, setName] = useState("Kim");   // Hook 호출!
  return <div>{count}</div>;
}
```

**실행 흐름:**
```
1. componentStack.push("Counter")
   → stack: ["Counter"]

2. Counter() 실행 시작

3. useState(0) 호출
   → currentPath = stack[stack.length - 1] = "Counter"
   → hooks.state.get("Counter") 에서 상태 읽기

4. useState("Kim") 호출
   → currentPath = stack[stack.length - 1] = "Counter"
   → hooks.state.get("Counter") 에서 상태 읽기

5. Counter() 실행 종료, <div>... 반환

6. componentStack.pop()
   → stack: []
```

**push와 pop 사이에 컴포넌트 함수 전체가 실행됩니다!** 그 안에서 호출되는 모든 Hook들이 올바른 path를 참조할 수 있어요.

#### 중첩 컴포넌트에서 더 명확하게

```typescript
function Parent() {
  const [count] = useState(0);  // path = "Parent"
  return <Child />;
}

function Child() {
  const [name] = useState("Kim");  // path = "Parent.Child"
  return <div>{name}</div>;
}
```

**실행 흐름:**
```
1. push("Parent")     → stack: ["Parent"]
2. Parent() 실행
   - useState(0) → currentPath = "Parent"
   - return <Child />

   // Child 렌더링 시작
   3. push("Parent.Child")  → stack: ["Parent", "Parent.Child"]
   4. Child() 실행
      - useState("Kim") → currentPath = "Parent.Child"
      - return <div>...
   5. pop()            → stack: ["Parent"]

6. pop()              → stack: []
```

**Stack 구조의 장점:**
- 중첩된 컴포넌트에서 항상 "현재 실행 중인" 컴포넌트의 path를 알 수 있음
- `stack[stack.length - 1]`이 항상 현재 컴포넌트

#### 만약 Stack이 없다면?

```typescript
// ❌ Stack 없이 단순 변수 사용
let currentPath = "";

// Parent 렌더링
currentPath = "Parent";
Parent();  // 내부에서 Child 호출

  // Child 렌더링
  currentPath = "Parent.Child";  // Parent의 path를 덮어씀!
  Child();
  // Child 끝

  // 다시 Parent로 돌아왔는데...
  // currentPath는 여전히 "Parent.Child"! 😱
```

Stack을 사용하면 Child가 끝날 때 pop()해서 자동으로 Parent의 path로 돌아갑니다!

---

### Q2. Fragment가 다른 요소와 다른 이유는? parentDom에 넣는 건 다 동일하지 않아?

**핵심을 찌르는 질문이에요!** 결론부터 말하면, "**순서**" 때문에 다른 처리가 필요합니다.

#### 먼저 일반 요소의 경우

```jsx
<div>
  <span>First</span>
  <p>Second</p>
  <span>Third</span>
</div>
```

**DOM 구조:**
```
div
├── span (First)
├── p (Second)
└── span (Third)
```

appendChild만 써도 순서대로 추가됩니다. 간단해요!

#### Fragment가 중간에 있는 경우

```jsx
<div>
  <span>First</span>
  <>                    {/* Fragment */}
    <p>Frag-1</p>
    <p>Frag-2</p>
  </>
  <span>Third</span>
</div>
```

**원하는 DOM 구조:**
```
div
├── span (First)
├── p (Frag-1)      ← Fragment의 자식
├── p (Frag-2)      ← Fragment의 자식
└── span (Third)
```

#### 문제: Fragment는 DOM이 없다!

**Instance 구조를 보면:**
```
div (Instance, dom: <div>)
├── span (Instance, dom: <span>First</span>)
├── Fragment (Instance, dom: null)  ← DOM 없음!
│   ├── p (Instance, dom: <p>Frag-1</p>)
│   └── p (Instance, dom: <p>Frag-2</p>)
└── span (Instance, dom: <span>Third</span>)
```

**appendChild만 사용하면 생기는 문제:**

1. `appendChild(span-First)` → OK
2. Fragment의 자식들 삽입
   - `appendChild(p-Frag-1)` → OK
   - `appendChild(p-Frag-2)` → OK
3. `appendChild(span-Third)` → OK

여기까진 괜찮아 보이지만...

#### 진짜 문제: Update 시 순서

**상태 변경으로 Fragment 내용이 바뀌면:**

```jsx
// Before
<div>
  <span>First</span>
  <>
    <p>Frag-1</p>
    <p>Frag-2</p>
  </>
  <span>Third</span>
</div>

// After (Fragment 자식 추가)
<div>
  <span>First</span>
  <>
    <p>Frag-1</p>
    <p>Frag-2</p>
    <p>Frag-3</p>   {/* 새로 추가! */}
  </>
  <span>Third</span>
</div>
```

**appendChild로 Frag-3를 추가하면?**
```
div
├── span (First)
├── p (Frag-1)
├── p (Frag-2)
├── span (Third)
└── p (Frag-3)      ← 맨 뒤에 추가됨! 😱
```

**원하는 결과:**
```
div
├── span (First)
├── p (Frag-1)
├── p (Frag-2)
├── p (Frag-3)      ← Third 앞에 있어야 함!
└── span (Third)
```

#### 해결책: anchor를 사용한 insertBefore

```typescript
// Frag-3를 올바른 위치에 삽입하려면
const anchor = getFirstDom(thirdInstance);  // span (Third)
parentDom.insertBefore(frag3Dom, anchor);   // Third 앞에 삽입!
```

**anchor란?** "이 요소 앞에 삽입해라"는 기준점입니다.

#### 왜 일반 요소는 괜찮은가?

일반 요소(`<div>`, `<span>` 등)는 **자기 자신이 DOM**이므로:
- 자신의 자식들은 **자신의 DOM 안에** 추가됨
- 부모의 다른 형제들에게 영향 없음

```jsx
<div>                    {/* parentDom */}
  <ul>                   {/* DOM 있음 */}
    <li>Item 1</li>      {/* ul 안에 추가 */}
    <li>Item 2</li>      {/* ul 안에 추가 */}
  </ul>
  <span>After</span>     {/* div에 추가, ul과 독립 */}
</div>
```

ul의 자식들은 ul 안에서만 놀아요. span에 영향을 주지 않습니다.

#### Fragment는 DOM이 없으므로

```jsx
<div>                    {/* parentDom */}
  <>                     {/* DOM 없음! */}
    <li>Item 1</li>      {/* div에 직접 추가 */}
    <li>Item 2</li>      {/* div에 직접 추가 */}
  </>
  <span>After</span>     {/* 얘도 div에 추가 */}
</div>
```

Fragment의 자식들이 **parentDom에 직접** 추가되므로, span과 같은 레벨에서 순서를 맞춰야 합니다!

#### 정리

| 요소 타입 | DOM | 자식 삽입 위치 | 순서 이슈 |
|-----------|-----|---------------|-----------|
| Host (`div`, `span`) | 있음 | 자기 DOM 안 | 없음 (자기 안에서만 정렬) |
| Fragment | 없음 | 부모 DOM에 직접 | **있음** (형제들과 순서 맞춰야 함) |
| Component | 없음 | 부모 DOM에 직접 | **있음** (Fragment와 동일) |

**핵심:** DOM이 없는 요소(Fragment, Component)는 자식들이 부모에 직접 삽입되므로, 형제들과의 순서를 신경 써야 합니다!

---

#### 4. Reconciliation의 3가지 케이스

```typescript
reconcile(parentDom, oldInstance, newVNode)
```

| oldInstance | newVNode | 결과 |
|-------------|----------|------|
| null | VNode | **mount** (새로 생성) |
| Instance | null | **unmount** (제거) |
| Instance | VNode | type/key 비교 후 **update** 또는 **교체** |

---

## 개선된 코드 예시

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
  // 🔥 수정: instance.node.type으로 비교
  if (instance.node.type !== node.type || instance.key !== node.key) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path);
  }
  return update(parentDom, instance, node, path);
};

// mount 함수 - Component 부분만 수정
const mount = (parentDom: HTMLElement, node: VNode, path: string) => {
  // ... TEXT_ELEMENT, Fragment, Host element 처리 ...

  if (typeof node.type === "function") {
    // 🔥 추가: componentStack 관리
    context.hooks.componentStack.push(path);
    const newVNode = node.type(node.props);
    context.hooks.componentStack.pop();

    const childInstance = reconcile(parentDom, null, newVNode, path);
    const instance = {
      kind: "component",
      dom: null,
      children: [childInstance],
      key,
      node,
      path,
    } as Instance;
    return instance;
  }

  throw new Error(`알 수 없는 노드 타입: ${String(node.type)}`);
};
```

---

## 다음 단계: update 함수 구현 힌트

### 🔥 지금 바로 수정해야 할 것

- [ ] `instance.kind !== node.type` → `instance.node.type !== node.type` 수정
- [ ] Component mount에서 `componentStack.push/pop` 추가

### 📝 update 함수 구현 가이드

`update` 함수는 "타입과 키가 같은 경우" DOM을 재사용하면서 내용을 업데이트합니다.

#### update가 해야 할 일

1. **텍스트 노드**: `nodeValue` 업데이트
2. **Host element**: props 업데이트 + 자식 재조정
3. **Fragment**: 자식만 재조정
4. **Component**: 함수 재실행 + 자식 재조정

#### 각 케이스별 힌트

**1. 텍스트 노드 (kind === "text")**

```typescript
if (instance.kind === "text") {
  // 기존 텍스트와 새 텍스트 비교
  const oldText = instance.node.props.nodeValue;
  const newText = node.props.nodeValue;

  if (oldText !== newText) {
    // DOM의 nodeValue 업데이트
    (instance.dom as Text).nodeValue = newText;
  }

  // instance 업데이트
  instance.node = node;
  return instance;
}
```

**2. Host element (kind === "host")**

```typescript
if (instance.kind === "host") {
  // 1. props 업데이트 (중요!)
  updateDomProps(
    instance.dom as HTMLElement,
    instance.node.props,  // 이전 props
    node.props            // 새 props
  );

  // 2. 자식 재조정 (핵심!)
  instance.children = reconcileChildren(
    instance.dom as HTMLElement,
    instance.children,
    node.props.children || [],
    path
  );

  // 3. instance 업데이트
  instance.node = node;
  return instance;
}
```

**3. Fragment (kind === "fragment")**

```typescript
if (instance.kind === "fragment") {
  // Fragment는 DOM이 없으므로 자식만 재조정
  instance.children = reconcileChildren(
    parentDom,  // 부모 DOM 사용
    instance.children,
    node.props.children || [],
    path
  );

  instance.node = node;
  return instance;
}
```

**4. Component (kind === "component")**

```typescript
if (instance.kind === "component") {
  // 1. componentStack 관리
  context.hooks.componentStack.push(path);

  // 2. 컴포넌트 함수 재실행
  const newVNode = (node.type as Function)(node.props);

  context.hooks.componentStack.pop();

  // 3. 자식 재조정 (컴포넌트는 자식이 1개)
  const childInstance = reconcile(
    parentDom,
    instance.children[0],  // 기존 자식
    newVNode,              // 새로 렌더링된 VNode
    path
  );

  instance.children = [childInstance];
  instance.node = node;
  return instance;
}
```

#### reconcileChildren 함수 (별도 구현 필요)

자식 재조정은 복잡하므로 별도 함수로 분리하는 것이 좋아요:

```typescript
const reconcileChildren = (
  parentDom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string
): (Instance | null)[] => {
  // 1. key를 기반으로 oldChildren을 Map으로 변환 (O(1) 조회)
  // 2. newChildren을 순회하면서 매칭/생성
  // 3. 남은 oldChildren unmount
  // 4. 결과 반환
};
```

#### update 구현 시 생각해볼 질문들

1. **props가 변경되었을 때** 어떻게 효율적으로 업데이트할까?
   - 힌트: `updateDomProps`가 이전/새 props를 받는 이유

2. **자식 개수가 달라지면** 어떻게 처리할까?
   - 힌트: 기존 자식 재사용 + 남는 건 unmount + 부족한 건 mount

3. **key가 있는 자식**은 어떻게 처리할까?
   - 힌트: Map으로 key → Instance 매핑, O(1) 조회

4. **DOM 순서가 바뀌면** 어떻게 처리할까?
   - 힌트: anchor 노드와 `insertBefore`

### 💡 추가로 학습하면 좋은 것

- [ ] `updateDomProps` 구현 (이전 props와 새 props 비교)
- [ ] key 기반 자식 매칭 알고리즘
- [ ] `getFirstDom`, `getFirstDomFromChildren` 구현 (anchor 계산용)

---

## 참고 자료

### 프로젝트 내 문서
- `docs/01-implementation-guide.md` - 전체 함수 인터페이스
- `docs/05-mount-함수-작성-가이드.md` - mount 구현 상세 가이드
- `packages/react/src/core/types.ts:17-24` - Instance 타입 정의
- `packages/react/src/core/dom.ts:40-46` - updateDomProps 시그니처

### 관련 테스트
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1146-1232` - DOM 재사용 테스트
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1409-1485` - key 기반 처리 테스트

---

## 마무리

mount와 unmount의 기본 구조를 훌륭하게 구현했어요! 🎉

**핵심 수정사항 2가지:**
1. `instance.kind` → `instance.node.type`으로 비교
2. Component에서 `componentStack.push/pop` 추가

이 두 가지만 수정하면 mount가 완벽하게 동작할 거예요!

update 함수는 mount의 구조를 이해했다면 비슷한 패턴으로 구현할 수 있습니다. 핵심은:
- **기존 Instance 재사용**
- **props만 업데이트**
- **자식은 재귀적으로 reconcile**

힌트를 참고해서 직접 구현해보세요. 막히는 부분이 있으면 언제든 질문하세요! 🚀
