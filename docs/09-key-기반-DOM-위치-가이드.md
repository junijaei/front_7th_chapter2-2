# Key 기반 DOM 위치 지정 가이드

## 시작하기 전에

React의 reconciliation에서 key는 단순히 "같은 요소인지 식별"하는 것뿐만 아니라, **DOM의 올바른 위치에 삽입**하는 데도 중요한 역할을 합니다. 이 문서에서는 anchor와 insertBefore를 활용한 DOM 위치 지정 방법을 설명합니다.

---

## 1. 문제 상황 이해하기

### 현재 코드의 문제점

```typescript
// reconcileChildren에서
const newInstances = newChildren.map((newChild, index) => {
  const key = newChild.key || String(index);
  const oldChild = oldChildrenMap[key] || null;
  if (oldChild) delete oldChildrenMap[key];
  const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
  return reconcile(dom, oldChild, newChild, childPath);  // 위치 정보 없음!
});
```

### 왜 문제인가?

```typescript
// 초기 상태: [A, B, C]
// DOM: <ul><li>A</li><li>B</li><li>C</li></ul>

// 변경 후: [B, C, A]  (A를 맨 뒤로 이동)
// 기대: <ul><li>B</li><li>C</li><li>A</li></ul>

// 현재 코드 결과:
// - B: oldChild 찾음 → update만 함 (위치 그대로)
// - C: oldChild 찾음 → update만 함 (위치 그대로)
// - A: oldChild 찾음 → update만 함 (위치 그대로)
// 실제: <ul><li>A</li><li>B</li><li>C</li></ul>  ← 순서 안 바뀜!
```

---

## 2. Anchor 개념 이해하기

### Anchor란?

**Anchor**는 "이 요소 앞에 삽입하라"는 기준점입니다.

```typescript
parentDom.insertBefore(newNode, anchor);
// anchor가 null이면 맨 뒤에 삽입 (appendChild와 동일)
```

### 왜 Anchor가 필요한가?

```
목표 순서: [B, C, A]

B를 처리할 때:
  - B의 다음 요소는 C
  - C의 DOM을 anchor로 사용
  - B를 C 앞에 삽입

C를 처리할 때:
  - C의 다음 요소는 A
  - A의 DOM을 anchor로 사용
  - C를 A 앞에 삽입

A를 처리할 때:
  - A의 다음 요소 없음
  - anchor = null
  - A를 맨 뒤에 삽입
```

---

## 3. Anchor 계산 방법

### 핵심 아이디어

현재 처리 중인 요소의 **다음 형제 요소의 첫 번째 DOM**을 anchor로 사용합니다.

```typescript
// newChildren: [B, C, A]
// index = 0 (B를 처리 중)
// anchor = newInstances[1]의 첫 번째 DOM = C의 DOM
```

### 문제점: 아직 생성되지 않은 요소

위 방식의 문제는 newInstances[1]이 아직 생성되지 않았을 수 있다는 것입니다.

**해결책 1: 두 번 순회**
1. 첫 번째 순회: 모든 인스턴스 생성/업데이트
2. 두 번째 순회: DOM 위치 조정

**해결책 2: 역순 처리**
뒤에서부터 처리하면 anchor가 항상 이미 처리된 요소입니다.

**해결책 3: oldChildren에서 anchor 찾기**
아직 처리되지 않은 oldChild 중 다음 위치에 있는 것을 anchor로 사용

---

## 4. 구현 방법 (두 번 순회 방식)

### 4.1 reconcileChildren 수정

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[] = [],
  parentPath: string,
) => {
  // 1. oldChildren을 key로 매핑
  const oldChildrenMap: Record<string, Instance | null> = {};
  oldChildren.forEach((oldChild, index) => {
    if (!oldChild) return;
    const key = oldChild.key ?? String(index);
    oldChildrenMap[key] = oldChild;
  });

  // 2. 첫 번째 순회: 인스턴스 생성/업데이트
  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key ?? String(index);
    const oldChild = oldChildrenMap[key] ?? null;
    if (oldChild) delete oldChildrenMap[key];

    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChild, newChild, childPath);
  });

  // 3. 사용되지 않은 oldChildren 제거
  Object.values(oldChildrenMap).forEach((oldChild) => {
    unmount(dom, oldChild);
  });

  // 4. 두 번째 순회: DOM 위치 조정
  newInstances.forEach((instance, index) => {
    if (!instance) return;

    // 다음 형제의 첫 번째 DOM을 anchor로
    const nextInstance = newInstances[index + 1];
    const anchor = nextInstance ? getFirstDom(nextInstance) : null;

    // 현재 인스턴스의 DOM을 올바른 위치에 삽입
    insertInstance(dom, instance, anchor);
  });

  return newInstances;
};
```

### 4.2 insertInstance 수정

현재 `insertInstance`는 fragment와 component를 처리하지 못합니다:

```typescript
// 현재 코드 (문제)
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance?.dom) return;  // fragment/component는 dom이 null!
  if (anchor) parentDom.insertBefore(instance.dom, anchor);
  else parentDom.appendChild(instance.dom);
};
```

**수정:**

```typescript
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) return;

  // fragment나 component는 여러 DOM을 가질 수 있음
  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // 이미 올바른 위치에 있으면 건너뛰기 (최적화)
    if (dom.nextSibling === anchor) return;

    if (anchor) {
      parentDom.insertBefore(dom, anchor);
    } else {
      parentDom.appendChild(dom);
    }
  });
};
```

---

## 5. 구현 방법 (역순 처리 방식)

역순으로 처리하면 anchor가 항상 이전에 처리된 요소입니다.

```typescript
const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[] = [],
  parentPath: string,
) => {
  // 1. oldChildren을 key로 매핑
  const oldChildrenMap: Record<string, Instance | null> = {};
  oldChildren.forEach((oldChild, index) => {
    if (!oldChild) return;
    const key = oldChild.key ?? String(index);
    oldChildrenMap[key] = oldChild;
  });

  // 2. 정방향으로 인스턴스 생성 (reconcile만)
  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key ?? String(index);
    const oldChild = oldChildrenMap[key] ?? null;
    if (oldChild) delete oldChildrenMap[key];

    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChild, newChild, childPath);
  });

  // 3. 사용되지 않은 oldChildren 제거
  Object.values(oldChildrenMap).forEach((oldChild) => {
    unmount(dom, oldChild);
  });

  // 4. 역순으로 DOM 위치 조정
  let anchor: HTMLElement | Text | null = null;
  for (let i = newInstances.length - 1; i >= 0; i--) {
    const instance = newInstances[i];
    if (!instance) continue;

    insertInstance(dom, instance, anchor);

    // 현재 요소의 첫 번째 DOM이 다음 요소의 anchor가 됨
    anchor = getFirstDom(instance);
  }

  return newInstances;
};
```

---

## 6. 최적화: 불필요한 이동 방지

모든 요소를 매번 insertBefore하는 것은 비효율적입니다. DOM이 이미 올바른 위치에 있으면 건너뛰어야 합니다.

### 위치 확인 방법

```typescript
const needsMove = (dom: Node, anchor: Node | null): boolean => {
  // anchor가 null이면 맨 뒤에 있어야 함
  if (anchor === null) {
    return dom.nextSibling !== null;
  }
  // dom의 다음 형제가 anchor여야 함
  return dom.nextSibling !== anchor;
};
```

### 최적화된 insertInstance

```typescript
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  if (!instance) return;

  const domNodes = getDomNodes(instance);

  domNodes.forEach((dom) => {
    // 이미 올바른 위치에 있으면 건너뛰기
    if (dom.nextSibling === anchor && dom.parentNode === parentDom) {
      return;
    }

    if (anchor) {
      parentDom.insertBefore(dom, anchor);
    } else {
      parentDom.appendChild(dom);
    }
  });
};
```

---

## 7. Fragment 처리 주의사항

Fragment는 여러 개의 DOM 노드를 가질 수 있습니다.

```typescript
// Fragment의 자식들
<>
  <span>A</span>
  <span>B</span>
</>
```

이 경우 `getDomNodes(fragmentInstance)`는 `[spanA, spanB]`를 반환합니다.

### getFirstDom vs getDomNodes

- `getFirstDom`: anchor 계산용 (첫 번째 DOM만 필요)
- `getDomNodes`: 삽입/제거용 (모든 DOM 필요)

```typescript
// anchor 계산
const anchor = getFirstDom(nextInstance);  // 첫 번째만

// 삽입
const doms = getDomNodes(instance);
doms.forEach(dom => parentDom.insertBefore(dom, anchor));
```

---

## 8. 전체 흐름 다이어그램

```
reconcileChildren 호출
        ↓
┌─────────────────────────────┐
│ 1. oldChildrenMap 생성       │
│    key → oldInstance        │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│ 2. newChildren 순회          │
│    - key로 oldChild 찾기     │
│    - reconcile 호출          │
│    - newInstances 배열 생성  │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│ 3. 미사용 oldChildren 제거   │
│    - unmount 호출            │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│ 4. DOM 위치 조정 (역순)      │
│    - anchor 계산             │
│    - insertInstance 호출     │
│    - anchor 업데이트         │
└─────────────────────────────┘
        ↓
    newInstances 반환
```

---

## 9. 테스트 케이스 검증

### 테스트: key가 있는 자식을 재배치할 때

```typescript
// 초기: [{id: "a"}, {id: "b"}, {id: "c"}]
// 변경: [{id: "b"}, {id: "c"}, {id: "a"}]

// 기대 동작:
// 1. reconcile로 B, C, A 인스턴스 업데이트
// 2. 역순으로 위치 조정:
//    - A: anchor=null, 맨 뒤에
//    - C: anchor=A의 DOM, A 앞에
//    - B: anchor=C의 DOM, C 앞에
// 3. 결과: [B, C, A] 순서로 DOM 배치
```

---

## 10. 구현 체크리스트

```
□ reconcileChildren 수정
  □ oldChildrenMap 생성 로직 유지
  □ 첫 번째 순회: reconcile로 인스턴스 생성/업데이트
  □ 미사용 oldChildren unmount
  □ 두 번째 순회 (또는 역순): DOM 위치 조정
    □ anchor 계산
    □ insertInstance 호출

□ insertInstance 수정
  □ fragment/component 처리 (getDomNodes 사용)
  □ 위치 최적화 (이미 올바른 위치면 건너뛰기)

□ getFirstDom / getDomNodes 확인
  □ null instance 처리
  □ fragment 자식 순회
```

---

## 11. 흔한 실수들

### 실수 1: anchor를 잘못 계산

```typescript
// ❌ 잘못된 방법: 아직 생성 안 된 인스턴스 사용
const anchor = getFirstDom(newInstances[index + 1]);  // undefined일 수 있음

// ✅ 올바른 방법: 역순 처리 또는 두 번 순회
```

### 실수 2: mount에서만 insertInstance 호출

```typescript
// ❌ 문제: mount에서만 DOM 삽입
const mount = (...) => {
  insertInstance(parentDom, instance);  // 항상 맨 뒤에 삽입
};

// ✅ 해결: reconcileChildren에서 위치 조정
// mount에서는 DOM 생성만, 위치는 reconcileChildren에서
```

### 실수 3: fragment의 DOM 처리 누락

```typescript
// ❌ 문제
if (!instance.dom) return;  // fragment는 처리 안 됨

// ✅ 해결
const domNodes = getDomNodes(instance);  // fragment의 자식 DOM들 가져옴
```

---

## 12. 추가 학습 자료

- React의 실제 구현에서는 Fiber와 linked list를 사용합니다
- 이 가이드는 단순화된 버전이지만 핵심 개념은 동일합니다
- `docs/02-sequence-diagrams.md`에서 전체 흐름을 시각적으로 확인하세요

---

## 어디서 막히셨나요?

- "anchor가 항상 null이에요" → insertInstance 호출 전에 anchor 계산 확인
- "DOM이 중복으로 삽입돼요" → getDomNodes가 올바른 DOM을 반환하는지 확인
- "순서가 여전히 안 맞아요" → 역순 처리가 제대로 되는지 console.log로 확인

구체적인 에러 메시지나 상황을 알려주시면 더 정확한 도움을 드릴 수 있습니다!
