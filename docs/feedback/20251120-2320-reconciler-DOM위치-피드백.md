# reconcileChildren DOM 위치 지정 피드백

**작성일**: 2025-11-20 23:20
**대상 파일**: `packages/react/src/core/reconciler.ts:181-217`
**학습 목표**: key 기반 reconciliation과 DOM 위치 재정렬 알고리즘 이해

---

## 테스트 실패 현황

총 60개 테스트 중 **2개 실패**, 58개 통과

### 실패한 테스트

1. **8단계: key가 있는 자식을 재배치할 때 기존 DOM을 재사용한다**
   - 기대값: `[B, C, A]` (data-id 기준)
   - 실제값: `[C, B, A]`
   - DOM 순서가 뒤바뀜

2. **10단계: 동일 참조 객체 deps 비교에서 예상과 다른 동작**
   - 기대값: `effectRuns.length > 1`
   - 실제값: `effectRuns.length === 1`
   - 새 객체로 setState할 때 effect가 재실행되어야 함

---

## 현재 코드

### reconcileChildren 함수

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[] = [],
  parentPath: string,
) => {
  // 1. oldChildrenMap 생성
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key || String(index);
    return {
      ...acc,
      [key]: oldChild,
    };
  }, {});

  // 2. reconcile 호출
  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key || String(index);
    const oldChild = oldChildrenMap[key] || null;
    if (oldChild) delete oldChildrenMap[key];
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChild, newChild, childPath);
  });

  // 3. 남은 old children unmount
  Object.values(oldChildrenMap).forEach((oldChild) => {
    unmount(dom, oldChild);
  });

  // 4. DOM 위치 조정 (정방향 순회)
  newInstances.forEach((instance, index) => {
    if (!instance) return;

    const nextInstance = newInstances[index + 1];
    const anchor = nextInstance ? getFirstDom(nextInstance) : null;
    insertInstance(dom, instance, anchor);
  });

  return newInstances;
};
```

### getFirstDomFromChildren 함수 (dom.ts)

```typescript
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    if (child?.dom) return child.dom;
  }
  return null;
};
```

---

## 피드백

### ✅ 잘한 점

#### 1. oldChildrenMap을 사용한 O(1) 키 매칭

```typescript
const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
  if (!oldChild) return acc;
  const key = oldChild?.key || String(index);
  return { ...acc, [key]: oldChild };
}, {});
```

키를 Map으로 관리해서 효율적인 O(1) 조회를 구현했습니다. React의 reconciliation 알고리즘의 핵심 아이디어를 잘 이해하고 있어요!

#### 2. 사용된 oldChild를 Map에서 삭제하는 패턴

```typescript
if (oldChild) delete oldChildrenMap[key];
```

매칭된 인스턴스를 즉시 삭제해서 나중에 unmount할 대상을 자연스럽게 남기는 패턴이 깔끔합니다. 이렇게 하면 별도의 Set 없이도 사용되지 않은 old children을 식별할 수 있어요.

#### 3. mount/update/unmount 분리 구현

reconcile 함수에서 세 가지 케이스를 명확하게 분리한 구조가 좋습니다:
- `node === null` → unmount
- `instance === null` → mount
- 타입/키 변경 → unmount + mount
- 그 외 → update

이 구조는 유지보수성이 높고 React의 동작을 잘 반영하고 있어요.

#### 4. 컴포넌트 스택 관리

```typescript
context.hooks.componentStack.push(path);
context.hooks.visited.add(path);
const newVNode = node.type(node.props);
context.hooks.componentStack.pop();
```

hook이 올바른 컴포넌트 컨텍스트에서 실행되도록 스택을 관리하는 것이 정확합니다!

---

### 🤔 개선할 점

#### 1. **정방향 순회로 인한 anchor 계산 오류** ⚠️ 중요!

**현재 문제:**
```typescript
newInstances.forEach((instance, index) => {
  const nextInstance = newInstances[index + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
  insertInstance(dom, instance, anchor);
});
```

**왜 문제인가요?**

정방향으로 순회하면 `nextInstance`가 아직 올바른 위치에 있지 않을 수 있습니다!

예를 들어, `[A, B, C]` → `[B, C, A]`로 재배치할 때:

1. **index=0 (B 삽입)**: `anchor = getFirstDom(C)` → C의 위치가 아직 변경 안됨, C는 원래 위치에 있음
2. **index=1 (C 삽입)**: `anchor = getFirstDom(A)` → A도 아직 원래 위치에 있음
3. **index=2 (A 삽입)**: `anchor = null` → 맨 뒤에 삽입

하지만 문제는:
- B가 C 앞에 삽입됨 → `[B, A, C]` (A가 원래 맨 앞에 있었으므로)
- 결과가 예상과 다르게 됨

**해결 방법:**

```typescript
// ❌ 현재: 정방향 순회
newInstances.forEach((instance, index) => {
  const nextInstance = newInstances[index + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
  insertInstance(dom, instance, anchor);
});

// ✅ 개선: 역방향 순회
for (let i = newInstances.length - 1; i >= 0; i--) {
  const instance = newInstances[i];
  if (!instance) continue;

  const nextInstance = newInstances[i + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
  insertInstance(dom, instance, anchor);
}
```

**왜 역방향인가요?**

역방향으로 순회하면:
1. 마지막 요소부터 삽입하므로 anchor가 항상 이미 올바른 위치에 있음
2. `[B, C, A]`로 재배치할 때:
   - index=2 (A): anchor=null → 맨 뒤에 삽입
   - index=1 (C): anchor=A → A 앞에 삽입
   - index=0 (B): anchor=C → C 앞에 삽입
3. 결과: `[B, C, A]` ✅

---

#### 2. **getFirstDomFromChildren이 중첩된 fragment/component를 처리하지 않음** ⚠️ 필수

**현재 문제:**
```typescript
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    if (child?.dom) return child.dom;
  }
  return null;
};
```

**왜 문제인가요?**

이 함수는 직접 자식만 확인하고, 손자(grandchildren)는 확인하지 않습니다. Fragment나 Component는 `dom: null`이므로, 그 자식들을 재귀적으로 탐색해야 합니다.

예를 들어:
```jsx
<Fragment>
  <Fragment>
    <div>Actual DOM</div>
  </Fragment>
</Fragment>
```

이 경우 첫 번째 Fragment의 자식은 두 번째 Fragment이고, `dom: null`이므로 현재 코드는 `null`을 반환합니다.

**해결 방법:**

```typescript
// ❌ 현재: 직접 자식만 확인
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    if (child?.dom) return child.dom;
  }
  return null;
};

// ✅ 개선: 재귀적으로 탐색
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  for (const child of children) {
    const dom = getFirstDom(child); // getFirstDom이 재귀 처리를 함
    if (dom) return dom;
  }
  return null;
};
```

이미 `getFirstDom`이 재귀적으로 동작하도록 구현되어 있으므로, 이를 활용하면 됩니다!

---

#### 3. **useState에서 Object.is 대신 shallowEquals 사용** ⚠️ 중요!

**현재 문제:**
```typescript
// hooks.ts의 useState
const setState = (nextValue: T | ((prev: T) => T)) => {
  const next = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(hooks[currentCursor]) : nextValue;
  if (!shallowEquals(hooks[currentCursor], next)) {
    hooks[currentCursor] = next;
    enqueueRender();
  }
};
```

**왜 문제인가요?**

React의 `useState`는 `Object.is`를 사용하여 **참조 동등성**을 비교합니다. `shallowEquals`는 객체의 속성까지 비교하므로 React의 동작과 다릅니다.

테스트 시나리오:
```typescript
const [obj, setObj] = useState({ id: 1 });
const currentObj = { id: 1 };  // 새 객체 생성
setObj(currentObj);  // 속성은 같지만 다른 참조
```

- `shallowEquals({ id: 1 }, { id: 1 })` → `true` → 재렌더 안함 ❌
- `Object.is({ id: 1 }, { id: 1 })` → `false` → 재렌더 함 ✅

**해결 방법:**

```typescript
// ❌ 현재: shallowEquals 사용
if (!shallowEquals(hooks[currentCursor], next)) {

// ✅ 개선: Object.is 사용 (React 표준)
if (!Object.is(hooks[currentCursor], next)) {
```

**참고**: 테스트 이름이 "동일 참조 객체 deps 비교에서 예상과 다른 동작"인데, 이는 `shallowEquals`의 문제점을 테스트하는 것입니다. 새 객체를 전달하면 참조가 다르므로 재렌더되어야 하고, 그에 따라 useEffect도 재실행되어야 합니다.

---

#### 4. **mount에서 중복 insertInstance 호출** 💡 권장

**현재 문제:**
```typescript
// reconcileChildren에서
const newInstances = newChildren.map((newChild, index) => {
  return reconcile(dom, oldChild, newChild, childPath);  // mount 호출 시 insertInstance 실행
});

// 그리고 다시
newInstances.forEach((instance, index) => {
  insertInstance(dom, instance, anchor);  // 또 insertInstance 실행
});
```

`mount` 함수 내에서 이미 `insertInstance`를 호출하고 있는데, `reconcileChildren`에서 다시 호출하고 있습니다.

**왜 문제인가요?**

- 불필요한 DOM 조작이 발생
- 성능 저하 가능성

**하지만 이건 괜찮을 수 있습니다!**

```typescript
// insertInstance 내부
if (dom.nextSibling === anchor && dom.parentNode === parentDom) return;
```

이미 올바른 위치에 있으면 skip하는 로직이 있어서 실제 DOM 조작은 최소화됩니다. 다만, 코드의 의도를 명확히 하기 위해 mount에서의 insertInstance를 제거하거나, reconcileChildren에서의 DOM 재정렬을 update 케이스로만 제한하는 것을 고려해볼 수 있습니다.

---

### 💡 학습 포인트

#### 1. DOM 삽입 순서와 anchor의 관계

```
DOM 삽입 시 anchor 활용:
┌─────────────────────────┐
│ parent                  │
│ ┌─────┐ ┌─────┐ ┌─────┐│
│ │  A  │ │  B  │ │  C  ││
│ └─────┘ └─────┘ └─────┘│
└─────────────────────────┘

insertBefore(A, B): A를 B 앞에 삽입
insertBefore(A, null): A를 맨 뒤에 삽입 (appendChild와 동일)
```

**역방향 순회가 필요한 이유:**
- 마지막 요소부터 삽입하면 anchor가 항상 **이미 올바른 위치**에 있음
- 정방향으로 하면 anchor 자체가 아직 잘못된 위치에 있을 수 있음

#### 2. React의 상태 비교 전략

| 비교 방식 | 사용처 | 특징 |
|-----------|--------|------|
| `Object.is` | useState | 참조 동등성, 빠름 |
| `shallowEquals` | memo, useEffect deps | 1depth 속성 비교 |
| `deepEquals` | deepMemo | 전체 깊이 비교, 느림 |

**useState가 Object.is를 쓰는 이유:**
- 성능: O(1)
- 예측 가능성: 새 객체 = 새 상태
- React 철학: 불변성(immutability)

#### 3. Fragment와 Component의 DOM 탐색

```
Instance 트리:
┌──────────────┐
│  Fragment    │ dom: null
│  ├─ Comp     │ dom: null
│  │  └─ div   │ dom: <div>  ← 실제 DOM
│  └─ span     │ dom: <span> ← 실제 DOM
└──────────────┘

getFirstDom(Fragment) → <div>
getFirstDomFromChildren([Comp, span]) → <div>
```

Fragment와 Component는 실제 DOM이 없으므로, 재귀적으로 자식을 탐색해야 실제 DOM을 찾을 수 있습니다.

---

## 다음 단계

### 🔥 지금 바로 해야 할 것

- [ ] **reconcileChildren의 DOM 재정렬을 역방향 순회로 변경**
  - 이것이 "key가 있는 자식을 재배치할 때" 테스트 실패의 직접적 원인

- [ ] **useState에서 shallowEquals를 Object.is로 변경**
  - 이것이 "동일 참조 객체 deps 비교" 테스트 실패의 원인

- [ ] **getFirstDomFromChildren에서 getFirstDom 재귀 호출 사용**
  - 중첩된 Fragment/Component 처리를 위해 필요

### 📝 나중에 해도 되는 것

- [ ] mount에서 insertInstance 호출 제거 검토
  - reconcileChildren에서만 DOM 위치 조정하는 것으로 통일할지 결정

- [ ] 성능 최적화: DOM 이동이 필요한 경우만 insertInstance 호출
  - 위치가 변경되지 않은 경우 skip 로직 강화

### 💡 추가로 학습하면 좋은 것

- [ ] React의 Fiber reconciliation 알고리즘 살펴보기
  - 왜 역방향 순회가 효율적인지 더 깊이 이해

- [ ] key 없이 리스트 렌더링할 때의 문제점
  - index를 key로 쓰면 안 되는 케이스 학습

---

## 참고 자료

- `docs/01-implementation-guide.md` - reconcileChildren 의사코드
- `docs/03-fundamental-knowledge.md` - Virtual DOM과 reconciliation 개념
- `packages/react/src/core/dom.ts:86-91` - getFirstDom 구현
- `packages/react/src/__tests__/basic.mini-react.test.tsx:1410-1446` - 테스트 코드

---

## 마무리

전체적으로 reconciliation의 핵심 개념을 잘 이해하고 구현했습니다! 🎉

key 기반 매칭과 oldChildrenMap 패턴은 React의 실제 동작과 매우 유사합니다. 지금 발생하는 문제들은 세부적인 알고리즘 선택(정방향 vs 역방향, Object.is vs shallowEquals)에서 오는 것이므로, 위에서 제안한 수정사항만 적용하면 테스트가 통과할 것입니다.

특히 **역방향 순회**의 필요성은 직관적이지 않을 수 있는데, 한 번 이해하면 React의 DOM 업데이트 전략을 깊이 이해할 수 있게 됩니다. 좋은 학습 포인트예요! 🚀

---

## 추가 질문과 답변

### Q: anchor의 원리와 필요성이 잘 이해가 안 가요. 좀 더 쉽게 설명해주세요.

#### 🎯 한 줄 요약

**anchor는 "이 요소 앞에 넣어줘"라고 알려주는 기준점입니다.**

---

#### 📦 실생활 비유: 책꽂이 정리

책꽂이에 책을 정리한다고 생각해보세요.

```
현재 책꽂이: [수학책] [영어책] [국어책]
목표 순서:   [영어책] [국어책] [수학책]
```

**appendChild만 사용하면?**
```
1. 영어책을 꺼내서 맨 뒤에 넣음 → [수학책] [국어책] [영어책]
2. 국어책을 꺼내서 맨 뒤에 넣음 → [수학책] [영어책] [국어책]
3. 수학책을 꺼내서 맨 뒤에 넣음 → [영어책] [국어책] [수학책] ✅
```

매번 맨 뒤에 넣으면 3번 이동해야 합니다.

**anchor(insertBefore)를 사용하면?**
```
"수학책을 국어책 뒤에 넣어줘" (anchor = null, 맨 뒤)
→ [영어책] [국어책] [수학책] ✅
```

한 번만 이동하면 됩니다! **anchor는 "어디에 넣을지" 정확한 위치를 알려주는 역할**입니다.

---

#### 🔧 실제 DOM API

```javascript
// appendChild: 항상 맨 뒤에 추가
parent.appendChild(element);

// insertBefore: anchor 앞에 추가
parent.insertBefore(element, anchor);

// anchor가 null이면 appendChild와 동일
parent.insertBefore(element, null);  // === parent.appendChild(element)
```

---

#### 🎬 애니메이션으로 이해하기

**상황:** `[A, B, C]` → `[B, C, A]`로 변경

```
초기 DOM:
┌─────────────────────┐
│ [A] [B] [C]         │
└─────────────────────┘

목표:
┌─────────────────────┐
│ [B] [C] [A]         │
└─────────────────────┘
```

**역방향 순회로 처리:**

```
Step 1: A를 맨 뒤에 (anchor = null)
┌─────────────────────┐
│ [B] [C] [A]         │  ← A가 맨 뒤로 이동
└─────────────────────┘

Step 2: C를 A 앞에 (anchor = A)
┌─────────────────────┐
│ [B] [C] [A]         │  ← C는 이미 A 앞에 있음 (이동 없음)
└─────────────────────┘

Step 3: B를 C 앞에 (anchor = C)
┌─────────────────────┐
│ [B] [C] [A]         │  ← B는 이미 C 앞에 있음 (이동 없음)
└─────────────────────┘

결과: [B] [C] [A] ✅
```

실제로 A만 이동하면 됩니다!

---

#### ❓ 왜 역방향이어야 하나요?

**정방향 문제:**
```
Step 1: B를 C 앞에 넣으려고 함
       하지만 C는 아직 원래 위치(index 2)에 있음!
       → B가 잘못된 위치에 삽입됨
```

**역방향 해결:**
```
Step 1: A를 맨 뒤에 → A의 위치 확정 ✅
Step 2: C를 A 앞에 → A가 이미 올바른 위치에 있으므로 정확한 위치 ✅
Step 3: B를 C 앞에 → C가 이미 올바른 위치에 있으므로 정확한 위치 ✅
```

**핵심:** 역방향으로 처리하면 **anchor가 항상 이미 올바른 위치에 있습니다!**

---

#### 🧩 코드로 이해하기

```typescript
// newInstances = [B, C, A] (목표 순서)

// 역방향 순회
for (let i = newInstances.length - 1; i >= 0; i--) {
  const instance = newInstances[i];
  const nextInstance = newInstances[i + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;

  insertInstance(dom, instance, anchor);
}

// i=2: A를 삽입, anchor=null (맨 뒤)
//      → A가 맨 뒤로 이동
//
// i=1: C를 삽입, anchor=A의 DOM
//      → C가 A 앞에 (이미 그 위치면 이동 안 함)
//
// i=0: B를 삽입, anchor=C의 DOM
//      → B가 C 앞에 (이미 그 위치면 이동 안 함)
```

---

#### 📝 요약

| 개념 | 설명 |
|------|------|
| **anchor** | "이 요소 앞에 삽입하라"는 기준점 |
| **insertBefore(element, anchor)** | element를 anchor 앞에 삽입 |
| **anchor = null** | 맨 뒤에 삽입 (appendChild와 동일) |
| **역방향 순회 이유** | anchor가 항상 이미 올바른 위치에 있도록 보장 |

---

#### 💡 기억할 포인트

1. **appendChild만으로는 순서를 바꿀 수 없습니다** - 항상 맨 뒤에만 추가하니까요
2. **anchor는 "여기 앞에!"라고 알려주는 표지판**입니다
3. **역방향 순회**는 anchor가 항상 정확한 위치에 있도록 보장합니다
4. **이미 올바른 위치에 있으면** insertBefore를 호출해도 이동하지 않습니다 (브라우저가 최적화)

이제 anchor가 왜 필요한지 이해되셨나요? 더 궁금한 점이 있으면 질문해주세요! 😊

---

### Q: anchor 개념은 이해했는데, 코드로 구현하는 게 연결이 안 돼요.

#### 🎯 핵심: 3단계로 나눠서 생각하기

1. **어떤 인스턴스를 이동할지** (instance)
2. **어디 앞에 넣을지** (anchor)
3. **실제로 DOM 이동** (insertInstance)

---

#### 📍 Step 1: 현재 코드의 구조 이해

```typescript
const reconcileChildren = (dom, oldChildren, newChildren, parentPath) => {
  // 1️⃣ 매칭: key로 old/new 연결
  const oldChildrenMap = { ... };

  // 2️⃣ reconcile: 인스턴스 생성/업데이트
  const newInstances = newChildren.map((newChild, index) => {
    return reconcile(dom, oldChild, newChild, childPath);
  });

  // 3️⃣ 정리: 안 쓰는 old 제거
  Object.values(oldChildrenMap).forEach(unmount);

  // 4️⃣ 위치 조정: anchor로 DOM 이동 ⬅️ 여기가 핵심!
  for (let i = newInstances.length - 1; i >= 0; i--) {
    // ...
  }

  return newInstances;
};
```

---

#### 📍 Step 2: 위치 조정 코드 한 줄씩 분석

```typescript
// 역방향 순회 (뒤에서부터)
for (let i = newInstances.length - 1; i >= 0; i--) {
```

**왜 역방향?** → anchor가 항상 이미 처리된(올바른 위치의) 요소를 가리키도록

```typescript
  const instance = newInstances[i];
  if (!instance) continue;
```

**현재 처리할 인스턴스** → 이 인스턴스의 DOM을 올바른 위치로 이동할 것

```typescript
  const nextInstance = newInstances[i + 1];
```

**다음 인스턴스** (배열에서 바로 뒤에 있는 것)
- `i = 2`면 `nextInstance = newInstances[3]` (없으면 undefined)
- `i = 1`면 `nextInstance = newInstances[2]`
- `i = 0`면 `nextInstance = newInstances[1]`

```typescript
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
```

**anchor 계산**
- nextInstance가 있으면 → 그 DOM을 anchor로
- nextInstance가 없으면 → null (맨 뒤에 삽입)

```typescript
  insertInstance(dom, instance, anchor);
}
```

**실제 이동** → instance의 DOM을 anchor 앞에 삽입

---

#### 📍 Step 3: 구체적인 예시로 따라가기

**상황:** `[A, B, C]` → `[C, A, B]`

```typescript
newInstances = [C_instance, A_instance, B_instance]
// index:         0           1           2
```

**역방향 순회:**

```typescript
// i = 2: B 처리
const instance = newInstances[2];     // B_instance
const nextInstance = newInstances[3]; // undefined
const anchor = null;                  // 맨 뒤에

insertInstance(dom, B_instance, null);
// DOM: [...] [B]  (B가 맨 뒤로)
```

```typescript
// i = 1: A 처리
const instance = newInstances[1];     // A_instance
const nextInstance = newInstances[2]; // B_instance
const anchor = getFirstDom(B_instance); // B의 DOM

insertInstance(dom, A_instance, B의DOM);
// DOM: [...] [A] [B]  (A가 B 앞으로)
```

```typescript
// i = 0: C 처리
const instance = newInstances[0];     // C_instance
const nextInstance = newInstances[1]; // A_instance
const anchor = getFirstDom(A_instance); // A의 DOM

insertInstance(dom, C_instance, A의DOM);
// DOM: [C] [A] [B]  (C가 A 앞으로)
```

**결과:** `[C] [A] [B]` ✅

---

#### 📍 Step 4: insertInstance가 실제로 하는 일

```typescript
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) return;

  // 인스턴스의 실제 DOM 노드들 가져오기
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // 최적화: 이미 올바른 위치면 건너뛰기
    if (dom.nextSibling === anchor && dom.parentNode === parentDom) {
      return;
    }

    // 실제 DOM 이동
    if (anchor) {
      parentDom.insertBefore(dom, anchor);
    } else {
      parentDom.appendChild(dom);
    }
  });
};
```

**핵심 포인트:**
- `getDomNodes`: Fragment/Component는 여러 DOM을 가질 수 있음
- `dom.nextSibling === anchor`: 이미 올바른 위치면 이동 안 함 (최적화)
- `insertBefore` vs `appendChild`: anchor 유무에 따라 선택

---

#### 🔗 전체 흐름 연결

```
┌─────────────────────────────────────────────────────┐
│ reconcileChildren                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. oldChildrenMap 생성                              │
│     { "a": A_instance, "b": B_instance, ... }       │
│                                                     │
│  2. newChildren.map으로 reconcile                    │
│     → newInstances = [C, A, B] (인스턴스들)          │
│     → 이 시점에 DOM은 아직 원래 위치                  │
│                                                     │
│  3. 미사용 oldChildren unmount                       │
│                                                     │
│  4. 역방향 순회로 DOM 위치 조정                       │
│     ┌─────────────────────────────────────┐         │
│     │ i=2: B → anchor=null → 맨 뒤        │         │
│     │ i=1: A → anchor=B    → B 앞         │         │
│     │ i=0: C → anchor=A    → A 앞         │         │
│     └─────────────────────────────────────┘         │
│                                                     │
│  5. return newInstances                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

#### ❓ 자주 하는 실수

**실수 1: 정방향으로 순회**
```typescript
// ❌ 잘못됨
newInstances.forEach((instance, index) => {
  const nextInstance = newInstances[index + 1];
  const anchor = nextInstance ? getFirstDom(nextInstance) : null;
  insertInstance(dom, instance, anchor);
});
```

문제: nextInstance가 아직 원래 위치에 있어서 anchor가 틀림

**실수 2: anchor를 이전 요소로 잡음**
```typescript
// ❌ 잘못됨
const prevInstance = newInstances[i - 1];
const anchor = prevInstance ? getFirstDom(prevInstance) : null;
```

문제: insertBefore는 "앞에" 삽입하므로, **다음** 요소를 anchor로 써야 함

**실수 3: mount에서만 insertInstance 호출**
```typescript
// mount 함수 안에서
insertInstance(parentDom, instance);  // anchor 없이 항상 맨 뒤에
```

문제: 처음 생성할 때는 맨 뒤에 추가되지만, 재정렬이 필요할 때 위치를 못 바꿈

---

#### 💡 구현 팁

1. **reconcile은 인스턴스만 생성/업데이트** → DOM 위치는 신경 안 씀
2. **reconcileChildren에서 위치 조정** → 모든 인스턴스가 준비된 후
3. **역방향 = anchor가 항상 확정된 위치**
4. **nextInstance[i+1]이 anchor** → "다음 것 앞에 넣어라"

---

#### 📝 요약 체크리스트

```typescript
// 위치 조정 구현 체크리스트:

// ✅ 역방향 순회
for (let i = newInstances.length - 1; i >= 0; i--) {

// ✅ 현재 인스턴스
const instance = newInstances[i];

// ✅ 다음 인스턴스 (배열에서 뒤에 있는 것)
const nextInstance = newInstances[i + 1];

// ✅ anchor = 다음 인스턴스의 첫 번째 DOM
const anchor = nextInstance ? getFirstDom(nextInstance) : null;

// ✅ 실제 이동
insertInstance(dom, instance, anchor);
```

이제 코드와 개념이 연결되셨나요? 특정 부분이 더 궁금하시면 질문해주세요! 🚀
