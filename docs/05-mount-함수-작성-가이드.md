# mount 함수 작성 가이드

## 현재 상황
당신은 이미 TEXT_ELEMENT 처리를 시작했어요! 이제 나머지를 채워봅시다.

## mount 함수가 해야 할 일

```
mount 함수의 책임:
1. VNode를 받아서
2. 실제 DOM을 생성하고
3. Instance 객체를 만들어서
4. DOM에 삽입하고
5. 생성한 Instance를 반환한다
```

## VNode의 3가지 타입

VNode.type은 3가지 경우가 있어요:

### 1. TEXT_ELEMENT (symbol)
```typescript
// 이미 작성하신 코드 - 잘하셨어요!
if (node.type === TEXT_ELEMENT) {
  const dom = document.createTextNode(node.props.nodeValue);
  return {
    kind: "text",
    dom,
    node,  // ⚠️ 원본 VNode를 저장해야 해요!
    children: [],
    key: null,
    path,  // ⚠️ path도 받아야 해요!
  } as Instance;
}
```

### 2. 문자열 (예: "div", "p", "button")
```typescript
// DOM 요소를 만드는 경우
if (typeof node.type === "string") {
  // Q1: document.createElement(???)로 뭘 만들까요?
  // Q2: node.props에 있는 속성들은 어떻게 적용할까요? (힌트: setDomProps)
  // Q3: node.props.children은 어떻게 처리할까요?
}
```

### 3. 함수 (컴포넌트)
```typescript
// 함수 컴포넌트를 실행하는 경우
if (typeof node.type === "function") {
  // Q1: 이 함수를 실행하면 뭐가 나올까요?
  // Q2: 나온 결과물을 어떻게 처리할까요?
  // Q3: 컴포넌트는 DOM이 없는데 instance.dom은 뭘 넣을까요?
}
```

## 단계별 구현 힌트

### Step 1: 문자열 타입 (DOM 요소) 처리

```typescript
if (typeof node.type === "string") {
  // 1-1. DOM 생성
  const dom = document.createElement(node.type);

  // 1-2. 속성 적용 (이미 구현된 함수 사용)
  setDomProps(dom, node.props);

  // 1-3. Instance 뼈대 만들기
  const instance: Instance = {
    kind: "dom",
    dom,
    node,
    children: [],  // 아직 빈 배열
    key: node.key,
    path,
  };

  // 1-4. 자식들 처리 (핵심!)
  // node.props.children이 있다면?
  // 각 자식을 어떻게 처리할까요?
  // 힌트: reconcile을 재귀적으로 호출!

  if (node.props.children) {
    instance.children = node.props.children.map((child, index) => {
      // 여기서 뭘 해야 할까요?
      // 1. child의 경로(path)를 만들어야 해요 (createChildPath)
      // 2. reconcile을 호출해서 child도 Instance로 만들어야 해요
      // 3. 만든 Instance를 배열에 추가해야 해요
    });
  }

  // 1-5. DOM에 삽입 (이미 구현된 함수 사용)
  insertInstance(parentDom, instance);

  return instance;
}
```

**핵심 포인트:**
- `document.createElement`로 진짜 DOM 만들기
- `setDomProps`로 속성 적용하기
- **자식도 Instance로 만들기 위해 reconcile 재귀 호출**
- `insertInstance`로 부모 DOM에 붙이기

### Step 2: 함수 타입 (컴포넌트) 처리

```typescript
if (typeof node.type === "function") {
  // 2-1. 컴포넌트 함수 실행
  // 컴포넌트 함수는 VNode를 반환해요
  const childVNode = node.type(node.props);

  // 2-2. 반환된 VNode를 Instance로 변환
  // 어떻게? reconcile 호출!
  const childInstance = reconcile(
    parentDom,
    null,  // 새로 만드는 거니까 이전 instance는 없어요
    childVNode,
    path,  // 같은 path 사용
  );

  // 2-3. 컴포넌트 Instance 만들기
  return {
    kind: "component",
    dom: null,  // 컴포넌트는 자체 DOM이 없어요!
    node,
    children: [childInstance],  // 반환된 Instance가 자식
    key: node.key,
    path,
  };
}
```

**핵심 포인트:**
- 컴포넌트 함수를 **실행**해서 VNode를 얻기
- 그 VNode를 다시 **reconcile로 처리**
- 컴포넌트 자체는 DOM이 없어요! (dom: null)
- 자식 Instance의 DOM이 실제로 화면에 보이는 거예요

## 전체 mount 함수 구조

```typescript
const mount = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
): Instance => {

  // Case 1: 텍스트 노드
  if (node.type === TEXT_ELEMENT) {
    // ... 이미 작성하셨어요!
  }

  // Case 2: DOM 요소 (문자열)
  if (typeof node.type === "string") {
    // ... Step 1 내용
  }

  // Case 3: 컴포넌트 (함수)
  if (typeof node.type === "function") {
    // ... Step 2 내용
  }

  throw new Error(`알 수 없는 노드 타입: ${node.type}`);
};
```

## 자주 하는 실수들

### 실수 1: Instance에 node를 저장 안 함
```typescript
// ❌ 나쁜 예
return {
  kind: "text",
  dom,
  // node가 없어요! 나중에 업데이트할 때 비교를 못 해요
  children: [],
  key: null,
  path,
};

// ✅ 좋은 예
return {
  kind: "text",
  dom,
  node,  // 원본 VNode 저장!
  children: [],
  key: null,
  path,
};
```

### 실수 2: 자식 처리를 잊어버림
```typescript
// ❌ 나쁜 예
if (typeof node.type === "string") {
  const dom = document.createElement(node.type);
  return { kind: "dom", dom, node, children: [], key: node.key, path };
  // 자식들을 처리 안 했어요!
}

// ✅ 좋은 예
if (typeof node.type === "string") {
  const dom = document.createElement(node.type);
  const instance = { kind: "dom", dom, node, children: [], key: node.key, path };

  // 자식들도 처리!
  if (node.props.children) {
    instance.children = node.props.children.map((child, index) => {
      const childPath = createChildPath(path, child.key, index);
      return reconcile(parentDom, null, child, childPath);
    });
  }

  return instance;
}
```

### 실수 3: DOM 삽입을 빼먹음
```typescript
// ❌ 나쁜 예
const instance = { ... };
return instance;  // DOM을 만들었는데 화면에 안 붙임!

// ✅ 좋은 예
const instance = { ... };
insertInstance(parentDom, instance);  // 화면에 붙이기!
return instance;
```

## 디버깅 팁

각 단계마다 console.log 찍어보세요:

```typescript
const mount = (parentDom, node, path) => {
  console.log('🔨 mount 호출:', {
    nodeType: node.type,
    path,
    props: node.props,
  });

  if (node.type === TEXT_ELEMENT) {
    console.log('📝 텍스트 노드 생성:', node.props.nodeValue);
    // ...
  }

  if (typeof node.type === "string") {
    console.log('🏗️ DOM 요소 생성:', node.type);
    // ...
  }

  if (typeof node.type === "function") {
    console.log('⚛️ 컴포넌트 실행:', node.type.name || '익명');
    // ...
  }
};
```

## 테스트로 검증하기

간단한 예제로 생각해봅시다:

```jsx
<div className="container">
  <p>Hello</p>
  <button>Click</button>
</div>
```

이게 mount될 때 어떤 일이 일어날까요?

```
1. mount 호출 (node.type = "div")
   └─> DOM 생성: <div>
   └─> setDomProps: className="container" 적용
   └─> 자식 처리:

       1-1. mount 호출 (node.type = "p")
            └─> DOM 생성: <p>
            └─> 자식 처리:

                1-1-1. mount 호출 (node.type = TEXT_ELEMENT)
                       └─> 텍스트 노드 생성: "Hello"
                       └─> Instance 반환

            └─> <p>에 텍스트 노드 삽입
            └─> Instance 반환

       1-2. mount 호출 (node.type = "button")
            └─> DOM 생성: <button>
            └─> 자식 처리:

                1-2-1. mount 호출 (node.type = TEXT_ELEMENT)
                       └─> 텍스트 노드 생성: "Click"
                       └─> Instance 반환

            └─> <button>에 텍스트 노드 삽입
            └─> Instance 반환

   └─> <div>에 <p>와 <button> 삽입
   └─> Instance 반환

최종 결과:
<div class="container">
  <p>Hello</p>
  <button>Click</button>
</div>
```

## 다음 단계

mount를 구현했다면:

1. **unmount**: Instance를 제거하는 로직
   - DOM 제거
   - 자식들도 재귀적으로 unmount

2. **update**: 같은 타입의 Instance를 업데이트
   - DOM 요소: props만 업데이트
   - 컴포넌트: 다시 실행해서 자식 reconcile

3. **replace**: 타입이 다를 때 unmount + mount

## 핵심 개념 정리

```
VNode (가상)  →  mount  →  Instance (연결고리)  →  DOM (진짜)
    ↓                           ↓                      ↓
{ type, props }         { kind, dom, node }      <div>실제</div>
```

- **VNode**: 뭘 그릴지 설명 (설계도)
- **Instance**: VNode와 DOM을 연결 (시공 기록)
- **DOM**: 실제 화면에 보이는 것 (완성된 건물)

## 실전 코딩 순서

1. TEXT_ELEMENT 부분 수정 (node, path 누락 수정)
2. 문자열 타입 처리 (DOM 요소)
   - DOM 생성
   - 속성 적용
   - 자식 처리 (재귀!)
   - 삽입
3. 함수 타입 처리 (컴포넌트)
   - 함수 실행
   - 결과를 reconcile로 처리
   - Instance 반환

하나씩 천천히 구현하고, 테스트 돌려보면서 확인하세요!

화이팅! 🚀
