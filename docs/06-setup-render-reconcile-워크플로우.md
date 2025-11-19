# setup → render → reconcile 워크플로우 완전 가이드

## 전체 흐름 한눈에 보기

```
사용자 코드
   ↓
setup(<App />, container)  ← 시작점
   ↓
context.root.reset()        ← 초기화
   ↓
render()                    ← 실제 렌더링
   ↓
reconcile()                 ← VNode → Instance 변환
   ↓
mount() / update()          ← DOM 생성/업데이트
   ↓
DOM에 표시!
```

---

## Phase 1: setup - 애플리케이션 시작

### setup의 역할

**"React 애플리케이션을 시작하는 버튼을 누르는 것"**

```typescript
// 사용자가 호출
setup(<App />, document.getElementById('root'));
```

### setup이 하는 일

```typescript
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  // 1️⃣ 유효성 검사
  if (!container) throw Error("타깃 엘리먼트가 없습니다.");
  if (!rootNode) throw Error("root node가 없습니다.");

  // 2️⃣ 컨텍스트 초기화 (가장 중요!)
  context.root.reset({ container, node: rootNode });

  // 3️⃣ (여기는 아직 구현 안 했지만 필요할 것)
  // - 기존 DOM 정리
  // - 첫 렌더링 호출
};
```

### context.root.reset이 하는 일

```typescript
reset({ container, node }) {
  this.container = container;  // DOM 컨테이너 저장
  this.node = node;            // 루트 VNode 저장
  this.instance = null;        // 이전 Instance 초기화
}
```

**핵심**: context는 **전역 상태 저장소**예요!

```typescript
context = {
  root: {
    container: <div id="root">,     // 어디에 렌더링할지
    node: <App />,                  // 무엇을 렌더링할지
    instance: null,                 // 이전에 렌더링한 결과 (처음엔 null)
  },
  hooks: { ... },                   // useState, useEffect 상태
  effects: { ... },                 // useEffect 큐
}
```

### setup이 끝나면?

render 함수를 호출해서 실제 렌더링을 시작해야 해요!

---

## Phase 2: render - 렌더링 실행

### render의 역할

**"저장된 정보를 바탕으로 실제로 화면을 그리는 작업자"**

```typescript
export const render = (): void => {
  // 1️⃣ 훅 컨텍스트 초기화
  context.hooks.visited.clear();  // 어떤 컴포넌트를 방문했는지 추적

  // 2️⃣ reconcile 호출 - 핵심!
  const newInstance = reconcile(
    context.root.container,   // 부모 DOM
    context.root.instance,    // 이전 Instance (처음엔 null)
    context.root.node,        // 새로운 VNode
    "",                       // 루트 경로
  );

  // 3️⃣ 새 Instance 저장
  context.root.instance = newInstance;

  // 4️⃣ 사용 안 된 훅 정리
  cleanupUnusedHooks();
};
```

### render가 왜 필요한가요?

1. **첫 렌더링**: setup → render
2. **업데이트**: setState 호출 → enqueueRender → render

render는 **여러 번 호출**될 수 있어요!

```typescript
// 첫 렌더링
setup(<App />, container);  // render 호출

// 사용자가 버튼 클릭
setState(newValue);         // render 다시 호출!
```

### enqueueRender란?

```typescript
export const enqueueRender = withEnqueue(render);
```

**중복 렌더링 방지 장치!**

```typescript
// 같은 프레임에서 여러 번 setState 호출해도
setState(1);
setState(2);
setState(3);

// render는 딱 한 번만 실행됨! (마이크로태스크 큐 사용)
```

---

## Phase 3: reconcile - 비교 & 결정

### reconcile의 역할

**"이전과 새로운 것을 비교해서 뭘 할지 결정하는 심판"**

```typescript
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,  // 이전 렌더링 결과
  node: VNode | null,         // 새로운 VNode
  path: string,
): Instance | null => {

  // Case 1: 새 노드가 없다 → 제거
  if (node === null) {
    return unmount(parentDom, instance);
  }

  // Case 2: 이전 Instance가 없다 → 새로 생성
  if (instance === null) {
    return mount(parentDom, node, path);
  }

  // Case 3: 타입이 다르다 → 교체
  if (instance.node.type !== node.type || instance.key !== node.key) {
    unmount(parentDom, instance);
    return mount(parentDom, node, path);
  }

  // Case 4: 타입이 같다 → 업데이트
  return update(parentDom, instance, node, path);
};
```

### 4가지 경우의 수

| 이전 | 새로운 | 동작 | 설명 |
|-----|-------|------|------|
| Instance 있음 | VNode 없음 | **unmount** | 제거 |
| Instance 없음 | VNode 있음 | **mount** | 새로 생성 |
| Instance 있음 | VNode 있음 (다른 타입) | **replace** | 제거 + 생성 |
| Instance 있음 | VNode 있음 (같은 타입) | **update** | 재사용 + 수정 |

---

## Phase 4: mount - 새로 생성 (당신이 만든 부분!)

### mount의 역할

**"설계도(VNode)를 보고 실제 건물(DOM)을 짓는 건축가"**

```typescript
const mount = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
): Instance => {

  // 1. TEXT_ELEMENT
  if (node.type === TEXT_ELEMENT) {
    const dom = document.createTextNode(node.props.nodeValue);
    return { kind: "text", dom, node, children: [], key: node.key, path };
  }

  // 2. DOM 요소 (문자열)
  if (typeof node.type === "string") {
    const dom = document.createElement(node.type);
    setDomProps(dom, props);

    // 자식들도 mount! (재귀)
    const instance = { kind: "host", dom, node, children: [], key, path };
    instance.children = children.map((child, index) => {
      const childPath = createChildPath(path, child.key, index);
      return reconcile(dom, null, child, childPath);  // 재귀!
    });

    insertInstance(parentDom, instance);
    return instance;
  }

  // 3. 컴포넌트 (함수)
  if (typeof node.type === "function") {
    const childVNode = node.type(node.props);  // 함수 실행
    const childInstance = reconcile(parentDom, null, childVNode, path);
    return { kind: "component", dom: null, node, children: [childInstance], key, path };
  }
};
```

---

## 전체 예제로 이해하기

### 코드

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  );
}

setup(<Counter />, document.getElementById('root'));
```

### 단계별 실행 흐름

#### 1. setup 호출

```typescript
setup(<Counter />, rootElement)
  ↓
context.root = {
  container: rootElement,
  node: { type: Counter, props: {} },  // VNode
  instance: null,
}
  ↓
render()  // 첫 렌더링 시작!
```

#### 2. render 호출

```typescript
render()
  ↓
context.hooks.visited.clear()  // 훅 추적 초기화
  ↓
reconcile(
  rootElement,           // parentDom
  null,                  // instance (처음이라 없음)
  { type: Counter, ... },  // node
  "",                    // path (루트)
)
```

#### 3. reconcile 판단

```typescript
reconcile(rootElement, null, <Counter />, "")
  ↓
instance === null이므로
  ↓
mount(rootElement, <Counter />, "")
```

#### 4. mount - Counter 컴포넌트

```typescript
mount(rootElement, <Counter />, "")
  ↓
typeof Counter === "function"이므로
  ↓
// 1. 함수 실행
const childVNode = Counter({})
// 반환: <div className="counter">...</div>
  ↓
// 2. 결과를 reconcile
reconcile(rootElement, null, <div className="counter">...</div>, "")
  ↓
// 3. Instance 생성
{
  kind: "component",
  dom: null,
  node: { type: Counter, ... },
  children: [div Instance],  // div를 reconcile한 결과
  key: null,
  path: "",
}
```

#### 5. mount - div 요소

```typescript
mount(rootElement, <div className="counter">...</div>, "")
  ↓
typeof "div" === "string"이므로
  ↓
// 1. DOM 생성
const dom = document.createElement("div")
  ↓
// 2. 속성 적용
setDomProps(dom, { className: "counter" })
  ↓
// 3. 자식들 처리 (<p>, <button>)
children.map((child, index) => {
  const childPath = createChildPath("", child.key, index)
  // "0", "1"
  return reconcile(dom, null, child, childPath)
})
  ↓
// 4. DOM에 삽입
insertInstance(rootElement, instance)
  ↓
// 5. Instance 반환
{
  kind: "host",
  dom: <div class="counter">,
  node: { type: "div", ... },
  children: [p Instance, button Instance],
  key: null,
  path: "",
}
```

#### 6. mount - p 요소 (재귀)

```typescript
mount(divDom, <p>Count: {count}</p>, "0")
  ↓
// DOM 생성
const dom = document.createElement("p")
  ↓
// 자식들 처리 (텍스트 "Count: ", 텍스트 "0")
children.map((child, index) => {
  const childPath = createChildPath("0", child.key, index)
  // "0.0", "0.1"
  return reconcile(dom, null, child, childPath)
})
```

#### 7. mount - 텍스트 노드 (재귀)

```typescript
mount(pDom, { type: TEXT_ELEMENT, props: { nodeValue: "Count: " } }, "0.0")
  ↓
const dom = document.createTextNode("Count: ")
  ↓
{
  kind: "text",
  dom: TextNode("Count: "),
  node: { type: TEXT_ELEMENT, ... },
  children: [],
  key: null,
  path: "0.0",
}
```

### 최종 결과 - Instance 트리

```
{
  kind: "component",    // Counter
  dom: null,
  children: [
    {
      kind: "host",     // div
      dom: <div class="counter">,
      children: [
        {
          kind: "host", // p
          dom: <p>,
          children: [
            { kind: "text", dom: TextNode("Count: "), path: "0.0" },
            { kind: "text", dom: TextNode("0"), path: "0.1" },
          ],
          path: "0",
        },
        {
          kind: "host", // button
          dom: <button>,
          children: [
            { kind: "text", dom: TextNode("+"), path: "1.0" },
          ],
          path: "1",
        },
      ],
      path: "",
    }
  ],
  path: "",
}
```

### 최종 결과 - 실제 DOM

```html
<div id="root">
  <div class="counter">
    <p>Count: 0</p>
    <button>+</button>
  </div>
</div>
```

---

## 다음에 작성할 코드

### 1단계: setup 완성하기 ✅ 우선순위 높음

**현재 코드:**
```typescript
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  if (!container) throw Error("타깃 엘리먼트가 없습니다.");
  if (!rootNode) throw Error("root node가 없습니다.");

  context.root.reset({ container, node: rootNode });
  // ❌ 끝! render를 호출하지 않았어요!
};
```

**완성된 코드:**
```typescript
export const setup = (rootNode: VNode | null, container: HTMLElement): void => {
  // 1. 유효성 검사
  if (!container) throw Error("타깃 엘리먼트가 없습니다.");
  if (!rootNode) throw Error("root node가 없습니다.");

  // 2. 기존 렌더링 정리
  if (context.root.instance) {
    removeInstance(container, context.root.instance);
  }

  // 3. 훅 상태 초기화
  context.hooks.clear();

  // 4. 컨텍스트 리셋
  context.root.reset({ container, node: rootNode });

  // 5. 첫 렌더링 시작!
  render();
};
```

**왜 필요한가요?**

setup만 호출하고 render를 안 부르면:
- context에만 저장되고
- 실제로 화면에 아무것도 안 그려져요!

### 2단계: render 완성하기 ✅ 우선순위 높음

**현재 코드:**
```typescript
export const render = (): void => {
  // 비어있음!
};
```

**완성된 코드:**
```typescript
export const render = (): void => {
  // 1. 훅 방문 기록 초기화 (매 렌더링마다)
  context.hooks.visited.clear();

  // 2. reconcile 호출
  const newInstance = reconcile(
    context.root.container!,  // 부모 DOM
    context.root.instance,    // 이전 Instance
    context.root.node,        // 새 VNode
    "",                       // 루트 path
  );

  // 3. 새 Instance 저장
  context.root.instance = newInstance;

  // 4. 사용 안 된 훅 정리
  cleanupUnusedHooks();
};
```

### 3단계: context.hooks getter 구현 ✅ 우선순위 중간

**hooks.currentPath:**
```typescript
get currentPath() {
  const path = this.componentStack[this.componentStack.length - 1];
  if (!path) {
    throw new Error("훅은 컴포넌트 내부에서만 호출되어야 합니다");
  }
  return path;
}
```

**hooks.currentCursor:**
```typescript
get currentCursor() {
  return this.cursor.get(this.currentPath) ?? 0;
}
```

**hooks.currentHooks:**
```typescript
get currentHooks() {
  if (!this.state.has(this.currentPath)) {
    this.state.set(this.currentPath, []);
  }
  return this.state.get(this.currentPath)!;
}
```

**hooks.clear:**
```typescript
clear() {
  this.state.clear();
  this.cursor.clear();
  this.visited.clear();
  this.componentStack = [];
}
```

### 4단계: reconcile의 update, unmount 구현 ⏳ 나중에

**unmount:**
```typescript
const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  if (!instance) return null;

  // 1. DOM 제거
  removeInstance(parentDom, instance);

  // 2. 자식들도 재귀적으로 unmount
  instance.children.forEach(child => {
    if (child) unmount(instance.dom as HTMLElement, child);
  });

  return null;
};
```

**update:**
```typescript
const update = (
  parentDom: HTMLElement,
  instance: Instance,
  node: VNode,
  path: string,
) => {
  // 타입별로 다르게 처리
  if (instance.kind === "text") {
    // 텍스트만 업데이트
  } else if (instance.kind === "host") {
    // props 업데이트 + 자식 reconcile
  } else if (instance.kind === "component") {
    // 함수 재실행 + 자식 reconcile
  }
};
```

### 5단계: createChildPath 구현 ⏳ 나중에

```typescript
export const createChildPath = (
  parentPath: string,
  key: string | null,
  index: number,
): string => {
  const prefix = parentPath ? `${parentPath}.` : "";
  return key ? `${prefix}${key}` : `${prefix}${index}`;
};
```

---

## 우선순위 정리

### 🔥 지금 바로 해야 할 것

1. **setup 함수 완성** - render() 호출 추가
2. **render 함수 완성** - reconcile 호출
3. **context.hooks getter 구현** - useState가 동작하려면 필요

이 3가지만 하면 기본 렌더링이 작동해요!

### 📝 테스트 통과를 위해 필요한 것

```typescript
// 이 테스트를 통과하려면:
it("렌더는 컨테이너 내용을 새 DOM으로 교체한다", () => {
  const container = document.createElement("div");
  container.appendChild(document.createElement("span")).textContent = "old";

  setup(<p>new</p>, container);  // ← setup이 render를 호출해야 함

  expect(container.firstChild?.nodeName).toBe("P");
});
```

필요한 것:
- ✅ setup → render 호출
- ✅ render → reconcile 호출
- ✅ reconcile → mount 호출 (이미 완성!)
- ✅ mount → DOM 생성 (이미 완성!)

### ⏰ 나중에 해도 되는 것

- unmount 구현 (조건부 렌더링, 리스트 삭제 시 필요)
- update 구현 (재렌더링 시 필요)
- createChildPath 구현 (훅 state 격리에 필요)

---

## 핵심 개념 정리

### setup vs render

| | setup | render |
|---|-------|--------|
| **언제** | 딱 한 번 (앱 시작) | 여러 번 (업데이트마다) |
| **역할** | 초기화 + 첫 렌더링 | 실제 렌더링 작업 |
| **하는 일** | context 설정 | reconcile 호출 |

### reconcile vs mount

| | reconcile | mount |
|---|-----------|-------|
| **역할** | 판단자 | 실행자 |
| **입력** | 이전 + 새로운 | 새로운만 |
| **출력** | Instance | Instance |
| **하는 일** | 뭘 할지 결정 | 실제로 생성 |

### VNode vs Instance vs DOM

```
VNode (설계도)
   ↓ mount/update
Instance (시공 기록)
   ↓ dom 프로퍼티
DOM (완성된 건물)
```

---

## 다음 단계

1. setup 함수에 `render()` 호출 추가
2. render 함수에 reconcile 호출 로직 작성
3. context.hooks getter 메서드 구현
4. 테스트 실행해보기!

setup과 render만 완성하면 mount가 실제로 동작할 거예요! 🚀

궁금한 점 있으면 언제든 물어보세요!
