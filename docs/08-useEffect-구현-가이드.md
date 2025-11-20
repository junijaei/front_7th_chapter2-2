# useEffect 구현 가이드

## 시작하기 전에

useEffect를 구현하기 전에, useState를 먼저 구현하고 테스트를 통과해야 합니다.
useEffect는 useState와 같은 훅 시스템을 공유하며, 추가로 **의존성 비교**와 **비동기 실행**이라는 개념이 필요합니다.

---

## 1. useEffect란?

### 개념
**useEffect**는 컴포넌트가 렌더링된 **이후에** 사이드 이펙트를 실행하는 훅입니다.

### 왜 "렌더링 이후"인가?

```javascript
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    console.log("Effect 실행!");  // DOM이 업데이트된 후 실행
    const timer = setInterval(() => {
      setCount(c => c + 1);
    }, 1000);

    return () => {
      console.log("Cleanup 실행!");  // 다음 effect 전 또는 언마운트 시
      clearInterval(timer);
    };
  }, []);

  return <div>{count}</div>;
}
```

실행 순서:
1. 컴포넌트 함수 실행 → JSX 반환
2. DOM 업데이트
3. **그 후에** useEffect의 콜백 실행
4. 다음 렌더링 시, 이전 cleanup → 새 effect

---

## 2. useEffect의 세 가지 동작 모드

### 모드 1: 매 렌더링마다 실행 (deps 없음)
```javascript
useEffect(() => {
  console.log("매번 실행");
});
```

### 모드 2: 마운트 시 한 번만 실행 (빈 배열)
```javascript
useEffect(() => {
  console.log("마운트 시에만");
  return () => console.log("언마운트 시에만");
}, []);
```

### 모드 3: 의존성 변경 시 실행
```javascript
useEffect(() => {
  console.log("count가 변경될 때만");
}, [count]);
```

---

## 3. 훅 데이터 구조 설계

### useState와의 차이점

useState는 단순히 값을 저장하면 됩니다:
```typescript
hooks[cursor] = value;  // 상태값
```

useEffect는 더 많은 정보가 필요합니다:
```typescript
hooks[cursor] = {
  type: HookTypes.EFFECT,
  deps: [...],           // 의존성 배열
  effect: () => {},      // 이펙트 함수
  cleanup: () => {},     // 클린업 함수 (이펙트가 반환한 함수)
};
```

### 생각해볼 질문
- 왜 deps를 저장해야 할까? → 다음 렌더링에서 비교하기 위해
- 왜 cleanup을 저장해야 할까? → 다음 이펙트 실행 전에 호출하기 위해

---

## 4. useEffect 구현 단계

### 단계 1: 현재 훅 정보 가져오기

useState와 동일하게 시작합니다:

```typescript
const path = context.hooks.currentPath;
const hooks = context.hooks.currentHooks;
const cursor = context.hooks.currentCursor;
```

### 단계 2: 이전 훅 데이터 확인

**생각해볼 질문:**
- 첫 렌더링인지 어떻게 알 수 있나?
- 첫 렌더링이면 이펙트를 실행해야 할까? → 예!

**힌트:**
```typescript
const prevHook = hooks[cursor] as EffectHook | undefined;
const prevDeps = prevHook?.deps;
```

### 단계 3: 의존성 변경 확인

**생각해볼 질문:**
- deps가 undefined면? (매번 실행)
- deps가 []면? (첫 렌더링만)
- prevDeps가 없으면? (첫 렌더링)

**의존성 비교 로직:**
```typescript
// 이펙트를 실행해야 하는 조건
const shouldRun =
  prevDeps === undefined ||           // 첫 렌더링
  deps === undefined ||                // deps 없음 (매번 실행)
  !shallowEquals(prevDeps, deps);      // 의존성 변경
```

**주의사항:**
- `shallowEquals`로 배열의 각 요소를 비교합니다
- `[1, 2]`와 `[1, 2]`는 같다고 판단해야 합니다
- `[obj]`와 `[obj]`는 obj가 같은 참조면 같습니다

### 단계 4: 훅 데이터 저장

이펙트 실행 여부와 관계없이 항상 현재 데이터를 저장합니다:

```typescript
hooks[cursor] = {
  type: HookTypes.EFFECT,
  deps,
  effect,
  cleanup: prevHook?.cleanup,  // 이전 cleanup 유지
};
```

### 단계 5: 이펙트 실행 예약

**핵심 개념:** 이펙트는 즉시 실행하지 않고, **큐에 예약**합니다!

**왜 즉시 실행하면 안 되나?**
1. DOM이 아직 업데이트되지 않았을 수 있음
2. 같은 렌더링의 모든 이펙트를 모아서 처리해야 함
3. 렌더링 중에 사이드 이펙트가 발생하면 예측 불가능

**이펙트 큐 구조:**
```typescript
context.effects.queue.push({
  path,
  cursor,
});
```

**힌트:**
```typescript
if (shouldRun) {
  context.effects.queue.push({ path, cursor });
}
```

### 단계 6: 커서 증가

useState와 동일:
```typescript
context.hooks.cursor.set(path, cursor + 1);
```

---

## 5. 이펙트 실행 시스템 (flushEffects)

### 개념

이펙트는 **렌더링이 끝난 후** 한꺼번에 실행됩니다.
이를 위해 `flushEffects` 함수가 필요합니다.

### 실행 흐름

```
render() 호출
  ↓
컴포넌트 렌더링 (useEffect가 큐에 추가됨)
  ↓
DOM 업데이트
  ↓
render() 종료
  ↓
마이크로태스크: flushEffects() 실행
  ↓
큐의 모든 이펙트 실행
```

### flushEffects 구현 힌트

**생각해볼 질문:**
- 큐에서 이펙트를 어떻게 가져오나?
- 이전 cleanup은 언제 실행하나?
- 새 cleanup은 어디에 저장하나?

**힌트:**
```typescript
export const flushEffects = () => {
  const queue = context.effects.queue;
  context.effects.queue = [];  // 큐 비우기

  for (const { path, cursor } of queue) {
    const hooks = context.hooks.state.get(path);
    if (!hooks) continue;

    const hook = hooks[cursor] as EffectHook;

    // 1. 이전 cleanup 실행
    if (hook.cleanup) {
      hook.cleanup();
    }

    // 2. 새 이펙트 실행 및 cleanup 저장
    const cleanup = hook.effect();
    hook.cleanup = cleanup || undefined;
  }
};
```

### render.ts에서 flushEffects 호출

```typescript
export const render = () => {
  // ... 렌더링 로직

  // 렌더링 완료 후 이펙트 실행 예약
  queueMicrotask(flushEffects);
};
```

---

## 6. 클린업 함수의 실행 시점

### 세 가지 실행 시점

1. **다음 이펙트 실행 전**
   - 같은 훅의 이펙트가 다시 실행될 때
   - `flushEffects`에서 처리

2. **컴포넌트 언마운트 시**
   - `cleanupUnusedHooks`에서 처리

3. **리렌더링 시 (동일 deps)**
   - 실행하지 않음!

### 언마운트 시 cleanup

컴포넌트가 제거될 때 해당 컴포넌트의 모든 cleanup을 실행해야 합니다.

**힌트 (cleanupUnusedHooks):**
```typescript
export const cleanupUnusedHooks = () => {
  for (const [path, hooks] of context.hooks.state.entries()) {
    if (!context.hooks.visited.has(path)) {
      // 이 컴포넌트는 이번 렌더링에서 방문되지 않음 = 언마운트됨
      for (const hook of hooks) {
        if (hook?.type === HookTypes.EFFECT && hook.cleanup) {
          hook.cleanup();
        }
      }
      context.hooks.state.delete(path);
      context.hooks.cursor.delete(path);
    }
  }
};
```

---

## 7. 구현 체크리스트

```
□ 1. EffectHook 타입 확인 (types.ts)
    └─ type, deps, effect, cleanup 필드

□ 2. useEffect 함수 구현
    └─ 현재 훅 정보 가져오기
    └─ 이전 deps와 비교
    └─ 훅 데이터 저장
    └─ 조건부로 큐에 추가
    └─ 커서 증가

□ 3. flushEffects 함수 구현
    └─ 큐의 이펙트들 순회
    └─ 이전 cleanup 실행
    └─ 새 이펙트 실행
    └─ 새 cleanup 저장

□ 4. render.ts에서 flushEffects 연결
    └─ queueMicrotask(flushEffects)

□ 5. cleanupUnusedHooks 구현
    └─ visited에 없는 컴포넌트 cleanup 실행
    └─ 상태 삭제

□ 6. visited 관리
    └─ 컴포넌트 렌더링 시 visited.add(path)
    └─ 렌더링 시작 시 visited.clear()
```

---

## 8. 흔한 실수들

### 실수 1: 즉시 이펙트 실행
```typescript
// ❌ 잘못된 방법
if (shouldRun) {
  effect();  // 즉시 실행하면 안 됨!
}

// ✅ 올바른 방법
if (shouldRun) {
  context.effects.queue.push({ path, cursor });
}
```

### 실수 2: cleanup을 effect 안에서 실행
```typescript
// ❌ 잘못된 방법
if (shouldRun && prevHook?.cleanup) {
  prevHook.cleanup();  // 이펙트 큐잉할 때 cleanup 실행
}

// ✅ 올바른 방법: flushEffects에서 실행
```

### 실수 3: deps 비교 순서 오류
```typescript
// ❌ 잘못된 방법
const shouldRun = !shallowEquals(prevDeps, deps);  // prevDeps가 undefined면?

// ✅ 올바른 방법
const shouldRun =
  prevDeps === undefined ||
  deps === undefined ||
  !shallowEquals(prevDeps, deps);
```

### 실수 4: visited 관리 누락
컴포넌트가 렌더링될 때 visited에 추가하지 않으면, cleanupUnusedHooks가 모든 컴포넌트를 언마운트 처리합니다.

---

## 9. 테스트 실행

```bash
# 기본 테스트 (useEffect 포함)
npm run test:basic

# 특정 테스트만 실행
npm test -- basic.mini-react.test.tsx -t "useEffect"
```

### 테스트가 확인하는 것들

1. **비동기 실행**: effect가 렌더링 후에 실행되는지
2. **의존성 비교**: deps 변경 시에만 재실행되는지
3. **cleanup 실행**: 재실행 전과 언마운트 시 cleanup이 호출되는지

---

## 10. 디버깅 팁

### 이펙트가 실행되지 않을 때
```typescript
console.log("shouldRun:", shouldRun);
console.log("queue:", context.effects.queue);
```

### cleanup이 호출되지 않을 때
```typescript
console.log("hook.cleanup:", hook.cleanup);
console.log("visited:", context.hooks.visited);
```

### 무한 루프가 발생할 때
- deps 배열에 매번 새로 생성되는 객체가 있지 않은지 확인
- 이펙트 안에서 해당 deps를 변경하고 있지 않은지 확인

---

## 11. 다음 단계

useEffect를 완성한 후:

1. **useRef 구현**: 렌더링 사이에 값을 유지하는 훅
2. **useMemo/useCallback 구현**: 메모이제이션 훅
3. **HOC 구현**: memo, deepMemo 등

---

## 어디서 막히셨나요?

구현하다가 막히는 부분이 있다면, 다음과 같이 질문해주세요:

- "flushEffects를 어디서 호출해야 할지 모르겠어요"
- "cleanup이 두 번 호출되는 것 같아요"
- "deps가 없을 때와 []일 때의 차이를 어떻게 구현해야 할지 모르겠어요"
- "visited는 어디서 관리해야 하나요?"

구체적인 상황을 말씀해주시면, 그에 맞는 방향성을 제시해드리겠습니다!
