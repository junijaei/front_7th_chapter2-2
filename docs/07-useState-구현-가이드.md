# useState 구현 가이드

## 시작하기 전에

useState를 구현하기 전에, React의 훅 시스템이 어떻게 동작하는지 이해하는 것이 중요합니다.
이 문서는 완전한 해답을 제공하기보다는, 스스로 구현할 수 있도록 방향을 제시합니다.

---

## 1. 훅 커서(Hook Cursor)란?

### 개념
**훅 커서**는 컴포넌트가 렌더링될 때 "현재 어떤 훅을 실행하고 있는지"를 추적하는 인덱스입니다.

### 왜 필요한가?

React 훅의 핵심 규칙을 떠올려보세요:
- "훅은 항상 같은 순서로 호출되어야 한다"
- "조건문 안에서 훅을 호출하면 안 된다"

이 규칙이 필요한 이유는 React가 **호출 순서**로 훅을 식별하기 때문입니다.

```javascript
function Counter() {
  const [count, setCount] = useState(0);      // 첫 번째 훅 (index: 0)
  const [name, setName] = useState("홍길동");  // 두 번째 훅 (index: 1)
  useEffect(() => { ... }, []);                // 세 번째 훅 (index: 2)

  return <div>{count}</div>;
}
```

컴포넌트가 처음 렌더링될 때:
- useState(0) 호출 → 커서 = 0, 상태 배열[0]에 0 저장
- useState("홍길동") 호출 → 커서 = 1, 상태 배열[1]에 "홍길동" 저장
- useEffect(...) 호출 → 커서 = 2, 이펙트 배열[2]에 저장

리렌더링될 때:
- useState(0) 호출 → 커서 = 0, 상태 배열[0]에서 값 읽어옴
- useState("홍길동") 호출 → 커서 = 1, 상태 배열[1]에서 값 읽어옴
- useEffect(...) 호출 → 커서 = 2, 이펙트 배열[2]에서 값 읽어옴

---

## 2. 컨텍스트 구조 파악하기

`packages/react/src/core/context.ts` 파일을 다시 살펴보세요.

### 핵심 구조

```typescript
context.hooks = {
  state: new Map(),        // 컴포넌트 경로 → 훅 상태 배열
  cursor: new Map(),       // 컴포넌트 경로 → 현재 커서 위치
  visited: new Set(),      // 방문한 컴포넌트 경로
  componentStack: [],      // 현재 실행 중인 컴포넌트 스택

  currentPath,            // getter: 현재 컴포넌트 경로
  currentCursor,          // getter: 현재 커서 인덱스
  currentHooks,           // getter: 현재 훅 배열
}
```

### 왜 Map을 사용하는가?

여러 컴포넌트가 동시에 훅을 사용할 수 있기 때문에, 각 컴포넌트마다 독립적인 훅 상태를 관리해야 합니다.

```
컴포넌트 트리:
  App (path: "0")
    ├─ Counter (path: "0.0")
    └─ UserInfo (path: "0.1")

state Map:
  "0" → [상태1, 상태2]
  "0.0" → [count]
  "0.1" → [name, age]
```

---

## 3. useState 구현 단계

### 단계 1: 현재 컴포넌트 정보 가져오기

**생각해볼 질문:**
- 현재 어떤 컴포넌트가 실행 중인가? → `context.hooks.currentPath`
- 이 컴포넌트의 훅 배열은? → `context.hooks.currentHooks`
- 현재 몇 번째 훅인가? → `context.hooks.currentCursor`

**힌트:**
```typescript
const path = context.hooks.currentPath;
const hooks = context.hooks.currentHooks;
const cursor = context.hooks.currentCursor;
```

### 단계 2: 첫 렌더링인지 확인하기

**생각해볼 질문:**
- 첫 렌더링이면 어떻게 알 수 있나?
  → 현재 커서 위치에 훅 데이터가 없으면 첫 렌더링!

- 첫 렌더링이면 무엇을 해야 하나?
  → initialValue를 평가해서 저장해야 함

**주의사항:**
- `initialValue`는 값일 수도 있고, 함수일 수도 있음!
- `useState(0)` vs `useState(() => expensiveCalculation())`
- 함수인 경우 실행해서 반환값을 사용해야 함

**힌트:**
```typescript
if (hooks[cursor] === undefined) {
  // 첫 렌더링: 초기값 설정
  const initialState = typeof initialValue === 'function'
    ? (initialValue as () => T)()
    : initialValue;

  hooks[cursor] = initialState;
}
```

### 단계 3: setState 함수 구현하기

**setState의 역할:**
1. 새 값을 계산한다 (값 또는 함수)
2. 이전 값과 비교한다
3. 같으면 아무것도 안 함
4. 다르면 상태를 업데이트하고 리렌더링을 예약

**생각해볼 질문:**
- `setState(1)` vs `setState(prev => prev + 1)` 어떻게 처리?
- 값이 같은지 어떻게 비교? → `Object.is()` 사용
- 리렌더링 예약은 어떻게? → `enqueueRender()` 사용

**주의사항:**
- setState 내부에서 현재 커서 위치를 기억해야 함!
- setState는 나중에 호출되므로, 클로저로 cursor를 캡처해야 함

**힌트:**
```typescript
const currentCursor = cursor; // 클로저로 캡처!

const setState = (nextValue: T | ((prev: T) => T)) => {
  const currentState = hooks[currentCursor];

  // 1. 새 값 계산
  const newState = typeof nextValue === 'function'
    ? (nextValue as (prev: T) => T)(currentState)
    : nextValue;

  // 2. 값 비교
  if (Object.is(currentState, newState)) {
    return; // 같으면 종료
  }

  // 3. 상태 업데이트
  hooks[currentCursor] = newState;

  // 4. 리렌더링 예약
  enqueueRender(/* 무엇을 전달? */);
};
```

### 단계 4: 커서 증가 및 반환

**생각해볼 질문:**
- 다음 훅 호출을 위해 무엇을 해야 하나?
  → 커서를 1 증가시켜야 함!

- 커서는 어디에 저장되어 있나?
  → `context.hooks.cursor` Map

**힌트:**
```typescript
context.hooks.cursor.set(path, cursor + 1);
return [hooks[cursor], setState];
```

---

## 4. 막히는 부분들 - 스스로 해결해보기

### Q1: enqueueRender에 무엇을 전달해야 하나?

**힌트:** `packages/react/src/core/render.ts` 파일을 확인해보세요.
- enqueueRender는 어떤 역할을 하나요?
- 어떤 컴포넌트를 리렌더링해야 하나요?

### Q2: context.hooks의 getter들을 먼저 구현해야 하나?

**맞습니다!** useState를 구현하기 전에 context.ts의 getter들을 먼저 구현해야 합니다:
- `currentPath`: componentStack의 마지막 요소
- `currentCursor`: cursor Map에서 현재 path의 값 (없으면 0)
- `currentHooks`: state Map에서 현재 path의 배열 (없으면 빈 배열 생성)

### Q3: 테스트는 어떻게 실행하나?

```bash
npm test -- advanced.hooks.test.tsx
```

---

## 5. 구현 순서 요약

```
1. context.ts 먼저 구현
   └─ currentPath getter
   └─ currentCursor getter
   └─ currentHooks getter

2. hooks.ts의 useState 구현
   └─ 현재 컴포넌트 정보 가져오기
   └─ 첫 렌더링 확인 및 초기값 설정
   └─ setState 함수 구현 (클로저 주의!)
   └─ 커서 증가
   └─ [state, setState] 반환

3. 테스트 실행 및 디버깅
```

---

## 6. 다음 단계 질문

구현을 시작하기 전에 스스로에게 물어보세요:

1. **context.ts의 getter들을 먼저 구현해야 할까요?**
   - 구현해야 한다면, currentPath부터 시작할까요?

2. **enqueueRender는 무엇을 하는 함수일까요?**
   - render.ts 파일을 읽어보셨나요?

3. **테스트 코드를 먼저 읽어볼까요?**
   - advanced.hooks.test.tsx에서 어떤 동작을 기대하나요?

---

## 7. 추가 학습 자료

### 실제 React의 구현
- [React Fiber의 Hooks 구현](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js)
- React는 Fiber 노드에 훅 연결 리스트를 저장합니다

### 참고할 만한 다이어그램

```
렌더링 시작
  ↓
컴포넌트 함수 호출
  ↓
useState() 호출 #1 ─────→ cursor = 0, hooks[0] 읽기/쓰기
  ↓
useState() 호출 #2 ─────→ cursor = 1, hooks[1] 읽기/쓰기
  ↓
useEffect() 호출 ────────→ cursor = 2, hooks[2] 읽기/쓰기
  ↓
JSX 반환
  ↓
렌더링 완료
```

---

## 어디서 막히셨나요?

구현하다가 막히는 부분이 있다면, 다음과 같이 질문해주세요:

- "context.hooks.currentPath를 구현하고 있는데, componentStack이 비어있을 때 어떻게 처리해야 할지 모르겠어요"
- "setState에서 enqueueRender를 호출할 때 뭘 전달해야 하는지 모르겠어요"
- "테스트를 실행했는데 'Hooks can only be called inside a component' 에러가 나요"

구체적인 상황을 말씀해주시면, 그에 맞는 방향성을 제시해드리겠습니다!
