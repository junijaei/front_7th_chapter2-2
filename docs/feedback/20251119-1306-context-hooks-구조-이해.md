# Context & Hooks 구조 이해 피드백

**날짜**: 2025-11-19
**주제**: context.ts와 hooks.ts의 state, cursor, path 개념 이해

---

## 현재 구현 상태 검토

### ✅ 잘 구현된 부분

1. **currentPath getter**
   ```typescript
   get currentPath() {
     if (!this.componentStack.length) throw Error("훅은 컴포넌트 내부에서만 호출되어야 합니다");
     return this.componentStack[this.componentStack.length - 1];
   }
   ```
   - 스택이 비어있을 때 에러 처리 ✓
   - 마지막 요소 반환 ✓

2. **currentCursor getter**
   ```typescript
   get currentCursor() {
     const currentPath = this.currentPath;
     return this.cursor.get(currentPath) || 0;
   }
   ```
   - currentPath를 사용하여 올바르게 조회 ✓
   - 기본값 0 반환 ✓

### ⚠️ 수정이 필요한 부분

**currentHooks getter** - 중요한 버그!
```typescript
// 현재 코드 (잘못됨)
get currentHooks() {
  const currentPath = this.currentPath;
  return this.state.get(currentPath) || [];  // ❌ 문제!
}
```

**문제점**: 빈 배열 `[]`을 반환하면 매번 새로운 배열이 생성됩니다.
- Map에 저장되지 않은 새로운 배열을 반환
- 이 배열에 값을 추가해도 다음번에 또 빈 배열 반환
- **상태가 저장되지 않음!**

**수정 방법**:
```typescript
get currentHooks() {
  const currentPath = this.currentPath;

  // Map에 없으면 새 배열을 생성해서 Map에 저장
  if (!this.state.has(currentPath)) {
    this.state.set(currentPath, []);
  }

  return this.state.get(currentPath)!;
}
```

**왜 이렇게 해야 하나요?**
```javascript
// 잘못된 방식
const arr = map.get(key) || [];
arr.push(1);  // 임시 배열에 추가
// 다음 호출 시 map.get(key)는 여전히 undefined → 또 빈 배열 반환

// 올바른 방식
if (!map.has(key)) {
  map.set(key, []);
}
const arr = map.get(key);
arr.push(1);  // Map에 저장된 배열에 추가
// 다음 호출 시 map.get(key)는 [1] 반환
```

---

## 핵심 개념 설명

### Q1. state 내부에 들어가야 하는 건 상태인지, 아니면 hook인지?

**답변**: **"훅 데이터 배열"**입니다. 정확히 말하면:

```typescript
context.hooks.state: Map<string, any[]>
//                    ^^^^^^  ^^^^^^
//                    경로     훅 데이터 배열
```

**각 컴포넌트 경로마다 배열 하나씩 가지고, 이 배열의 각 인덱스가 각 훅 호출을 나타냅니다.**

#### 예시로 이해하기

```javascript
function Counter() {
  const [count, setCount] = useState(0);        // 첫 번째 훅
  const [name, setName] = useState("홍길동");    // 두 번째 훅
  useEffect(() => { ... }, []);                  // 세 번째 훅

  return <div>{count}</div>;
}
```

이 컴포넌트의 경로가 `"0.c0"`이라면:

```javascript
context.hooks.state.get("0.c0") === [
  0,                              // index 0: useState(0)의 상태 값
  "홍길동",                        // index 1: useState("홍길동")의 상태 값
  {                               // index 2: useEffect의 훅 객체
    kind: "effect",
    deps: [],
    cleanup: null,
    effect: [Function]
  }
]
```

**핵심 포인트**:
- useState → 배열에 **값**(숫자, 문자열, 객체 등) 저장
- useEffect → 배열에 **객체**(EffectHook 타입) 저장
- useRef → 배열에 **객체**({ current: ... }) 저장

**"state"라는 이름이 혼란스러울 수 있지만, "모든 훅의 데이터를 저장하는 곳"이라고 이해하세요.**

---

### Q2. state에 저장되는 게 상태라면 hook 자체를 저장하는 곳은 어딘지?

**답변**: **같은 곳(state Map)입니다!**

혼란의 원인은 이름 때문입니다. `state`라는 이름이지만 실제로는:
- useState의 값도 저장하고
- useEffect의 훅 객체도 저장하고
- useRef의 ref 객체도 저장합니다

**더 정확한 이름은 `hookStorage` 또는 `hookData`였을 것입니다.**

#### 타입으로 이해하기

```typescript
type HookData = any; // useState의 값, useEffect의 EffectHook 객체, useRef의 ref 객체 등

context.hooks.state: Map<string, HookData[]>
//                        ^^^^^^  ^^^^^^^^^^^
//                        경로     각 훅의 데이터들
```

---

## path, hooks, cursor 사용처 정리

### 1. `path` - 컴포넌트 식별자

**용도**: 어떤 컴포넌트인지 식별

```javascript
// hooks.ts
const path = context.hooks.currentPath;
// 예: "0.c0.c1" → 루트의 첫 번째 자식의 두 번째 자식
```

**왜 필요한가?**
- 같은 컴포넌트가 여러 번 렌더링될 수 있음
- 각 인스턴스마다 독립적인 상태 필요

```javascript
<div>
  <Counter />  // path: "0.c0" → 독립적인 count 상태
  <Counter />  // path: "0.c1" → 독립적인 count 상태
</div>
```

**사용 예시**:
```javascript
// 이 컴포넌트의 훅 배열 가져오기
const hooks = context.hooks.state.get(path);

// 이 컴포넌트의 현재 커서 가져오기
const cursor = context.hooks.cursor.get(path);
```

---

### 2. `hooks` - 현재 컴포넌트의 훅 데이터 배열

**용도**: 현재 컴포넌트의 모든 훅 데이터에 접근

```javascript
// hooks.ts
const hooks = context.hooks.currentHooks;
// 예: [0, "홍길동", EffectHook객체]
```

**어떻게 사용하나?**

```javascript
// 첫 번째 훅의 데이터 읽기
const firstHookData = hooks[0];

// 두 번째 훅의 데이터 쓰기
hooks[1] = "새로운 값";

// 세 번째 훅이 처음이라면 초기화
if (hooks[2] === undefined) {
  hooks[2] = { kind: "effect", ... };
}
```

**실제 useState 구현에서**:
```javascript
export const useState = <T>(initialValue: T | (() => T)) => {
  const path = context.hooks.currentPath;
  const hooks = context.hooks.currentHooks;  // 이 컴포넌트의 훅 배열
  const cursor = context.hooks.currentCursor; // 현재 몇 번째 훅인지

  // 첫 렌더링이면 초기화
  if (hooks[cursor] === undefined) {
    const initial = typeof initialValue === 'function'
      ? initialValue()
      : initialValue;
    hooks[cursor] = initial;  // 배열에 저장!
  }

  // 현재 커서 위치의 값 가져오기
  const state = hooks[cursor];

  // ... setState 구현 ...

  return [state, setState];
};
```

---

### 3. `cursor` - 현재 몇 번째 훅 호출인지

**용도**: 현재 컴포넌트에서 몇 번째 훅이 실행 중인지 추적

```javascript
// hooks.ts
const cursor = context.hooks.currentCursor;
// 예: 0 → 첫 번째 훅
//     1 → 두 번째 훅
//     2 → 세 번째 훅
```

**어떻게 증가하나?**

```javascript
// useState 구현 마지막
context.hooks.cursor.set(path, cursor + 1);
//                              ^^^^^^^^^^
//                              다음 훅을 위해 커서 증가
```

**전체 흐름**:
```javascript
function Counter() {
  // 렌더링 시작 → cursor = 0
  const [count, setCount] = useState(0);
  // useState 끝 → cursor = 1로 증가

  const [name, setName] = useState("홍길동");
  // useState 끝 → cursor = 2로 증가

  useEffect(() => { ... }, []);
  // useEffect 끝 → cursor = 3으로 증가

  // 렌더링 끝 → 다음 렌더링 시 cursor는 다시 0부터 시작
}
```

---

## 실전 예제로 이해하기

### 시나리오: Counter 컴포넌트 첫 렌더링

```javascript
function Counter() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}
```

컴포넌트 경로: `"0.c0"`

#### 단계별 실행

**1단계: 컴포넌트 함수 호출 전**
```javascript
// reconciler.ts에서
context.hooks.componentStack.push("0.c0");
// componentStack: ["0.c0"]
```

**2단계: useState(0) 호출**
```javascript
const path = context.hooks.currentPath;
// path = "0.c0" (componentStack의 마지막)

const hooks = context.hooks.currentHooks;
// state.get("0.c0") 확인 → 없음
// 새 배열 생성 및 저장 (수정된 코드 기준)
// hooks = []

const cursor = context.hooks.currentCursor;
// cursor.get("0.c0") 확인 → 없음
// cursor = 0

// 첫 렌더링이므로 초기화
hooks[0] = 0;
// state.get("0.c0") = [0]

// setState 함수 생성 (나중에 호출됨)
const setState = (next) => { ... };

// 커서 증가
context.hooks.cursor.set("0.c0", 1);

return [0, setState];
```

**3단계: 컴포넌트 함수 반환 후**
```javascript
context.hooks.componentStack.pop();
// componentStack: []
```

#### 현재 상태 스냅샷

```javascript
context.hooks.state:
  Map {
    "0.c0" => [0]
  }

context.hooks.cursor:
  Map {
    "0.c0" => 1
  }
```

---

### 시나리오: setCount(1) 호출 → 리렌더링

**1단계: setState 호출**
```javascript
setCount(1);
// → hooks[0] = 1 (배열 업데이트)
// → enqueueRender() (리렌더링 예약)
```

**2단계: 리렌더링 시작**
```javascript
// render.ts
context.hooks.visited.clear();
context.hooks.cursor.clear();  // 모든 커서 0으로 리셋!
```

**3단계: Counter 컴포넌트 재호출**
```javascript
context.hooks.componentStack.push("0.c0");
```

**4단계: useState(0) 다시 호출**
```javascript
const path = "0.c0";

const hooks = context.hooks.currentHooks;
// state.get("0.c0") = [1] (이미 존재!)

const cursor = context.hooks.currentCursor;
// cursor.get("0.c0") = undefined (clear되었음)
// cursor = 0

// hooks[0] === undefined? → 아니요! hooks[0] === 1
// 초기화 건너뜀

const state = hooks[0]; // state = 1

// 커서 증가
context.hooks.cursor.set("0.c0", 1);

return [1, setState];  // 업데이트된 값 반환!
```

---

## 구현 시 주의사항

### 1. cursor는 렌더링마다 리셋됩니다

```javascript
// render.ts
export const render = () => {
  context.hooks.visited.clear();
  context.hooks.cursor.clear();  // ← 여기서 리셋!

  // reconcile 실행 → 컴포넌트들 렌더링 → 훅 호출
};
```

**왜?** 각 렌더링마다 훅은 0번부터 다시 시작해야 하니까!

### 2. state는 렌더링 간에 유지됩니다

```javascript
// state Map은 clear되지 않음!
// 이전 렌더링의 값들이 계속 저장되어 있음
```

### 3. hooks 배열은 참조로 공유됩니다

```javascript
const hooks = context.hooks.currentHooks;
hooks[0] = 10;  // ← Map에 저장된 배열을 직접 수정!

// 이것이 가능한 이유:
// currentHooks getter가 Map에 저장된 배열의 참조를 반환하기 때문
```

---

## useState 구현 힌트

이제 개념을 이해했으니, 다음 순서로 구현해보세요:

### 1단계: context.ts 수정
```typescript
get currentHooks() {
  const currentPath = this.currentPath;

  // 여기를 수정하세요!
  // Map에 없으면 새 배열 생성 및 저장

  return this.state.get(currentPath)!;
}
```

### 2단계: hooks.ts - useState 구현

```typescript
export const useState = <T>(initialValue: T | (() => T)) => {
  const path = context.hooks.currentPath;
  const hooks = context.hooks.currentHooks;
  const cursor = context.hooks.currentCursor;

  // TODO 1: 첫 렌더링이면 초기화
  if (hooks[cursor] === undefined) {
    // initialValue가 함수인지 확인하고 실행
    // hooks[cursor]에 저장
  }

  // TODO 2: setState 구현
  const currentCursor = cursor; // 클로저 캡처!

  const setState = (nextValue: T | ((prev: T) => T)) => {
    // nextValue가 함수인지 확인하고 실행
    // Object.is로 비교
    // 다르면 hooks[currentCursor] 업데이트 + enqueueRender()
  };

  // TODO 3: 커서 증가
  context.hooks.cursor.set(path, cursor + 1);

  // TODO 4: 반환
  return [hooks[cursor], setState];
};
```

---

## 다음 질문들

구현하다가 막히면 이렇게 질문해주세요:

1. **currentHooks getter 수정**
   - "Map에 배열이 없을 때 새로 생성하는 부분을 어떻게 작성하나요?"

2. **initialValue 처리**
   - "initialValue가 함수인지 확인하는 타입 가드는 어떻게 작성하나요?"

3. **setState 구현**
   - "setState에서 enqueueRender를 호출할 때 인자를 전달해야 하나요?"
   - "클로저로 currentCursor를 캡처하는 이유가 정확히 뭔가요?"

4. **테스트**
   - "구현 후 어떤 테스트를 실행하면 되나요?"

---

## 마무리

**핵심 요약**:

1. `state Map` = 모든 훅 데이터 저장소 (useState 값, useEffect 객체 등)
2. `cursor Map` = 현재 몇 번째 훅인지 추적 (렌더링마다 리셋)
3. `path` = 컴포넌트 식별자 (각 인스턴스마다 독립적인 상태)

**변수명이 헷갈린다면**:
- `state` → "hookStorage"라고 생각하기
- `hooks` → "현재 컴포넌트의 훅 데이터 배열"
- `cursor` → "훅 호출 순서 카운터"

구현하면서 궁금한 점 있으면 언제든 질문하세요!
