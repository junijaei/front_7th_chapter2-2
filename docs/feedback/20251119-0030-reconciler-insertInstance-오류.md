# reconciler 함수 insertInstance 오류 피드백

**작성일**: 2025-11-19 00:30
**대상 파일**: `packages/react/src/core/reconciler.ts:50-127`
**학습 목표**: mount 함수에서 DOM 삽입 로직의 문제점 이해하기

## 현재 코드

```typescript
const mount = (parentDom: HTMLElement, node: VNode, path: string) => {
  const { key } = node;
  let instance: Instance | null = null;

  if (node.type === TEXT_ELEMENT) {
    const dom = document.createTextNode(node.props.nodeValue);
    instance = {
      kind: "text",
      dom,
      children: [],
      key,
      node,
      path,
    };
  }

  if (node.type === Fragment) {
    const { children } = node.props;
    instance = {
      kind: "fragment",
      dom: null,
      children: [],
      key,
      path,
      node,
    };
    if (children) {
      instance.children = children
        .filter((child) => !!child)
        .map((child) => {
          return reconcile(parentDom, null, child, path);
        });
    }
  }

  if (typeof node.type === "string") {
    const dom = document.createElement(node.type);
    const { children, ...props } = node.props;

    setDomProps(dom, props);

    instance = {
      kind: "host",
      dom,
      children: [],
      key,
      node,
      path,
    };

    if (children) {
      instance.children = children
        .filter((child) => !!child)
        .map((child, index) => {
          const childPath = createChildPath(path, child.key, index, child.type);
          return reconcile(dom, null, child, childPath);
        });
    }
  }

  if (typeof node.type === "function") {
    const newVNode = node.type(node.props);
    const childInstance = reconcile(parentDom, null, newVNode, path);
    instance = {
      kind: "component",
      dom: null,
      children: [childInstance],
      key,
      node,
      path,
    };
  }

  insertInstance(parentDom, instance);  // ← 모든 경우에 실행!
  return instance;
}
```

## 테스트 결과

```
✓ createElement 테스트들 (모두 통과)
× 렌더는 컨테이너 내용을 새 DOM으로 교체한다
  → expected to have a length of 1 but got +0
× 네이티브 요소를 DOM으로 생성한다
  → expected null not to be null
× boolean 속성의 토글이 DOM에서 올바르게 처리되어야 한다
  → Cannot read properties of null
```

**container가 비어있어요!** (length = 0)

---

## 피드백

### ✅ 잘한 점

#### 1. if문을 연속으로 사용한 구조 개선

이전 코드에서는 `if-else if` 구조였는데, 이제는 모든 `if`를 독립적으로 사용하고 있어요:

```typescript
if (node.type === TEXT_ELEMENT) { ... }
if (node.type === Fragment) { ... }
if (typeof node.type === "string") { ... }
if (typeof node.type === "function") { ... }
```

이 방식은 각 타입을 체크하고 instance를 만드는 패턴이네요!

#### 2. instance를 null로 초기화

```typescript
let instance: Instance | null = null;
```

각 조건문에서 instance를 할당하는 방식으로 통일했어요.

#### 3. children 필터링 추가

```typescript
.filter((child) => !!child)
```

null/undefined children을 걸러내는 로직을 추가했어요! 이전 피드백을 잘 반영했습니다.

#### 4. Fragment와 모든 타입 처리 구현

TEXT_ELEMENT, Fragment, DOM 요소, 컴포넌트 모두 처리하고 있어요!

---

### 🤔 개선할 점

#### 1. **insertInstance가 Fragment와 Component에도 실행되고 있어요** ⚠️ 치명적!

**현재 문제:**
```typescript
if (typeof node.type === "function") {
  // ...
  instance = {
    kind: "component",
    dom: null,  // ← DOM이 없는데
    // ...
  };
}

insertInstance(parentDom, instance);  // ← 이게 실행됨!
```

**왜 문제인가요?**

`insertInstance`는 `instance.dom`을 부모에 추가하는 함수예요:

```typescript
// dom.ts (추정)
export const insertInstance = (parentDom: HTMLElement, instance: Instance) => {
  if (instance.dom) {
    parentDom.appendChild(instance.dom);
  }
};
```

**문제:**
1. **Fragment**: `dom: null` → insertInstance 실행해도 아무 일 안 일어남 (괜찮음)
2. **Component**: `dom: null` → insertInstance 실행해도 아무 일 안 일어남 (괜찮음)
3. **BUT**: 논리적으로 불필요한 호출!

**더 큰 문제:**

컴포넌트와 Fragment는 **자식이 이미 DOM에 추가되어 있어요!**

```typescript
// Component의 경우
const childInstance = reconcile(parentDom, null, newVNode, path);
// ↑ 여기서 이미 자식이 parentDom에 추가됨!

// Fragment의 경우
instance.children = children.map((child) => {
  return reconcile(parentDom, null, child, path);
  // ↑ 여기서 이미 자식들이 parentDom에 추가됨!
});
```

그런데 마지막에 `insertInstance(parentDom, instance)`를 또 호출하면... 혼란스러워요!

**해결 방법:**

`insertInstance`를 **필요한 곳에서만** 호출:

```typescript
if (node.type === TEXT_ELEMENT) {
  const dom = document.createTextNode(node.props.nodeValue);
  instance = { kind: "text", dom, children: [], key, node, path };
  insertInstance(parentDom, instance);  // ✅ 여기서!
  return instance;
}

if (node.type === Fragment) {
  // ...
  // insertInstance 호출 안 함! (dom이 null)
  return instance;
}

if (typeof node.type === "string") {
  const dom = document.createElement(node.type);
  // ...
  if (children) {
    instance.children = children
      .filter((child) => !!child)
      .map((child, index) => {
        const childPath = createChildPath(path, child.key, index, child.type);
        return reconcile(dom, null, child, childPath);
      });
  }
  insertInstance(parentDom, instance);  // ✅ 여기서!
  return instance;
}

if (typeof node.type === "function") {
  // ...
  // insertInstance 호출 안 함! (dom이 null)
  return instance;
}

// ❌ 제거!
// insertInstance(parentDom, instance);
// return instance;
```

#### 2. **if문이 독립적이라 여러 개가 실행될 수 있어요** ⚠️ 중요!

**현재 문제:**

```typescript
if (node.type === TEXT_ELEMENT) {
  instance = { ... };
}

if (node.type === Fragment) {
  instance = { ... };  // 이전 instance 덮어씀
}

if (typeof node.type === "string") {
  instance = { ... };  // 또 덮어씀
}
```

이론적으로는 한 타입만 매칭되지만, **모든 if문을 체크**하기 때문에 비효율적이에요.

**해결 방법 1: if-else if 사용**

```typescript
if (node.type === TEXT_ELEMENT) {
  // ...
  return instance;
} else if (node.type === Fragment) {
  // ...
  return instance;
} else if (typeof node.type === "string") {
  // ...
  return instance;
} else if (typeof node.type === "function") {
  // ...
  return instance;
}

throw new Error(`알 수 없는 노드 타입: ${String(node.type)}`);
```

**해결 방법 2: early return**

```typescript
// TEXT_ELEMENT
if (node.type === TEXT_ELEMENT) {
  const dom = document.createTextNode(node.props.nodeValue);
  const instance = { kind: "text", dom, children: [], key, node, path };
  insertInstance(parentDom, instance);
  return instance;  // ← 여기서 종료!
}

// Fragment
if (node.type === Fragment) {
  const instance = { kind: "fragment", dom: null, children: [], key, path, node };
  if (node.props.children) {
    instance.children = node.props.children
      .filter((child) => !!child)
      .map((child) => reconcile(parentDom, null, child, path));
  }
  return instance;  // ← 여기서 종료!
}

// 나머지도 동일...
```

**장점:**
- 각 타입 처리가 독립적
- 조건 체크를 일찍 중단
- 코드 흐름이 명확

#### 3. **Fragment children의 childPath가 잘못됐어요** ⚠️ 필수!

**현재 코드:**
```typescript
if (node.type === Fragment) {
  // ...
  if (children) {
    instance.children = children
      .filter((child) => !!child)
      .map((child) => {
        return reconcile(parentDom, null, child, path);
        //                                         ^^^^
        // 같은 path를 사용! 잘못됐어요!
      });
  }
}
```

**문제:**

모든 Fragment 자식이 **같은 path**를 가져요!

```jsx
<>
  <div>First</div>
  <div>Second</div>
</>
```

두 div가 모두 `path: ""`로 같아요. 그러면:
- 훅 state가 섞여요
- 컴포넌트 식별이 안 돼요

**해결 방법:**

```typescript
if (children) {
  instance.children = children
    .filter((child) => !!child)
    .map((child, index) => {  // ← index 추가!
      const childPath = createChildPath(path, child.key, index);
      return reconcile(parentDom, null, child, childPath);
    });
}
```

---

### 💡 학습 포인트

#### 1. DOM 삽입 시점의 차이

| 타입 | DOM 생성 | DOM 삽입 시점 | insertInstance 필요? |
|-----|---------|--------------|-------------------|
| TEXT_ELEMENT | createTextNode | mount에서 | ✅ 필요 |
| DOM 요소 | createElement | mount에서 | ✅ 필요 |
| Fragment | 없음 (null) | 자식들이 추가됨 | ❌ 불필요 |
| Component | 없음 (null) | 자식이 추가됨 | ❌ 불필요 |

#### 2. 재귀 호출의 부수 효과

```typescript
// Component
const childInstance = reconcile(parentDom, null, newVNode, path);
// ↑ 이 호출이 끝나면 이미 DOM에 추가되어 있어요!
```

reconcile → mount → insertInstance 순서로 **재귀 안에서** DOM 삽입이 일어나요.

그래서 Component나 Fragment는 **별도로 insertInstance를 안 불러도 돼요**.

#### 3. Early Return 패턴

```typescript
// ❌ 나쁜 예: 모든 조건 체크
if (condition1) { instance = ...; }
if (condition2) { instance = ...; }
if (condition3) { instance = ...; }
return instance;

// ✅ 좋은 예: 조건 만족하면 즉시 반환
if (condition1) { return createInstance1(); }
if (condition2) { return createInstance2(); }
if (condition3) { return createInstance3(); }
```

**장점:**
- 불필요한 조건 체크 생략
- 각 분기가 독립적
- 실수로 instance 덮어쓰는 일 방지

---

## 개선된 코드 예시

```typescript
const mount = (parentDom: HTMLElement, node: VNode, path: string): Instance => {
  const { key } = node;

  // Case 1: TEXT_ELEMENT
  if (node.type === TEXT_ELEMENT) {
    const dom = document.createTextNode(node.props.nodeValue);
    const instance: Instance = {
      kind: "text",
      dom,
      children: [],
      key,
      node,
      path,
    };
    insertInstance(parentDom, instance);
    return instance;
  }

  // Case 2: Fragment
  if (node.type === Fragment) {
    const instance: Instance = {
      kind: "fragment",
      dom: null,
      children: [],
      key,
      path,
      node,
    };

    if (node.props.children) {
      instance.children = node.props.children
        .filter((child) => !!child)
        .map((child, index) => {
          const childPath = createChildPath(path, child.key, index);
          return reconcile(parentDom, null, child, childPath);
        });
    }

    // insertInstance 안 부름! (dom이 null)
    return instance;
  }

  // Case 3: DOM 요소
  if (typeof node.type === "string") {
    const dom = document.createElement(node.type);
    const { children, ...props } = node.props;

    setDomProps(dom, props);

    const instance: Instance = {
      kind: "host",
      dom,
      children: [],
      key,
      node,
      path,
    };

    if (children) {
      instance.children = children
        .filter((child) => !!child)
        .map((child, index) => {
          const childPath = createChildPath(path, child.key, index, child.type);
          return reconcile(dom, null, child, childPath);
        });
    }

    insertInstance(parentDom, instance);
    return instance;
  }

  // Case 4: Component
  if (typeof node.type === "function") {
    const newVNode = node.type(node.props);
    const childInstance = reconcile(parentDom, null, newVNode, path);

    const instance: Instance = {
      kind: "component",
      dom: null,
      children: [childInstance],
      key,
      node,
      path,
    };

    // insertInstance 안 부름! (dom이 null)
    return instance;
  }

  throw new Error(`알 수 없는 노드 타입: ${String(node.type)}`);
};
```

---

## 다음 단계

### 🔥 즉시 수정해야 할 것

- [ ] insertInstance 호출을 TEXT_ELEMENT와 DOM 요소에서만 하도록 수정
- [ ] if문을 early return 패턴으로 변경
- [ ] Fragment children의 childPath에 index 추가
- [ ] 테스트 실행해서 container에 DOM이 제대로 들어가는지 확인

### 📝 수정 후 확인할 것

```typescript
const container = document.createElement("div");
setup(<div>test</div>, container);
console.log(container.innerHTML);  // <div>test</div> 나와야 함!
```

### 💡 다음에 구현할 것

- [ ] unmount 함수 (현재 instance만 반환하고 있음)
- [ ] update 함수 (재렌더링 시 필요)
- [ ] reconcile의 3, 4번 케이스 (타입 변경, 업데이트)

---

## 핵심 정리

**문제:**
- `insertInstance`를 모든 타입에 호출하고 있음
- Fragment와 Component는 dom이 null이라 의미 없음
- 독립적인 if문으로 모든 조건을 체크함

**해결:**
- insertInstance는 **DOM이 있는 타입에서만** 호출
- **Early return**으로 조건 만족 시 즉시 반환
- Fragment children에 **childPath 제대로 생성**

이렇게 수정하면 container에 DOM이 제대로 들어갈 거예요! 🚀

## 참고 자료

- `docs/mount-함수-작성-가이드.md` - mount 함수 전체 가이드
- `docs/setup-render-reconcile-워크플로우.md` - 전체 흐름 이해
- `packages/react/src/core/types.ts:17-24` - Instance 타입 정의
