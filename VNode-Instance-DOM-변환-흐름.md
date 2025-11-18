# VNode → Instance → DOM 변환 흐름 분석

## 당신의 질문 핵심
> "VNode에서 Instance로 변환하는 함수가 없는 것 같은데, 다른 함수에 포함되어 있는 건가요?"

정답부터 말하자면: **네, 다른 함수에 포함되어 있습니다!** 바로 `reconcile` 함수 안에 들어갑니다.

## 현재 코드 구조 분석

### 1단계: JSX → VNode (✅ 이미 완료)
```typescript
// elements.ts
createElement(type, props, ...children) → VNode
```
- JSX가 VNode 객체로 변환됨
- `{ type, key, props }` 구조

### 2단계: VNode → Instance → DOM (🔴 아직 미구현)
이 단계가 바로 당신이 찾고 있는 부분입니다!

## Instance란 무엇인가?

`types.ts`를 보면 Instance의 구조는:
```typescript
interface Instance {
  kind: NodeType;           // DOM, COMPONENT, TEXT 등
  dom: HTMLElement | Text | null;  // 실제 DOM 노드
  node: VNode;              // 원본 VNode
  children: (Instance | null)[];   // 자식 Instance들
  key: string | null;
  path: string;             // 컴포넌트 경로 (훅 관리용)
}
```

**Instance는 VNode와 실제 DOM 사이를 연결하는 중간 표현**입니다.

### 왜 VNode를 바로 DOM으로 만들지 않고 Instance를 거칠까요?

React의 핵심 아이디어를 생각해보세요:

1. **상태 관리**: 컴포넌트의 훅 상태를 어디에 저장할까요?
2. **재조정(Reconciliation)**: 업데이트 시 이전과 새 VNode를 비교하려면 이전 정보를 어디에 보관할까요?
3. **DOM 재사용**: 같은 타입의 요소면 DOM을 재사용해야 하는데, 어떻게 추적할까요?

→ **Instance**가 이 모든 것을 담는 그릇입니다!

## Reconciliation: VNode → Instance 변환이 일어나는 곳

`reconciler.ts`의 주석을 다시 보세요:

```typescript
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,  // 이전 렌더링의 Instance
  node: VNode | null,         // 새로운 VNode
  path: string,
): Instance | null => {
  // 1. 새 노드가 null이면 기존 인스턴스를 제거 (unmount)
  // 2. 기존 인스턴스가 없으면 새 노드를 마운트 (mount) ← 여기!
  // 3. 타입이나 키가 다르면 제거 후 재마운트
  // 4. 타입과 키가 같으면 업데이트 (update)
};
```

**2번 "마운트(mount)" 단계가 바로 VNode → Instance 변환입니다!**

## 구현 선택지: 어디에 작성할 것인가?

### 선택지 1: reconcile 함수 내부에 직접 작성
```typescript
export const reconcile = (...) => {
  // ...
  if (!instance && node) {
    // VNode → Instance 변환 로직을 여기에 직접 작성
    const newInstance: Instance = {
      kind: ...,
      dom: document.createElement(...),
      node,
      children: [],
      key: node.key,
      path,
    };
    return newInstance;
  }
  // ...
};
```

**장점:**
- 함수 개수가 적어서 단순함
- reconcile 로직이 한 곳에 모여있음

**단점:**
- reconcile 함수가 너무 길어질 수 있음
- mount, update, unmount 로직이 섞여서 가독성 떨어질 수 있음

### 선택지 2: 별도 mount 함수로 분리
```typescript
// reconciler.ts에 추가
const mount = (
  parentDom: HTMLElement,
  node: VNode,
  path: string,
): Instance => {
  // VNode → Instance 변환 로직
  // DOM 생성 로직
  // 자식 재귀 처리
  return instance;
};

export const reconcile = (...) => {
  // ...
  if (!instance && node) {
    return mount(parentDom, node, path);
  }
  // ...
};
```

**장점:**
- 책임 분리: mount, update, unmount가 명확히 구분됨
- 각 함수의 길이가 적절함
- 테스트하기 쉬움

**단점:**
- 함수 개수가 늘어남

## 어느 방식을 선택해야 할까요?

이건 **당신이 직접 판단**해야 합니다! 다만 힌트를 드리자면:

### 생각해볼 질문들:
1. `reconcile` 함수에서 처리할 경우의 수는 몇 가지인가요?
   - unmount (node가 null)
   - mount (instance가 null)
   - replace (type이나 key가 다름)
   - update (같은 type과 key)

2. 각 경우의 로직은 얼마나 복잡할까요?
   - DOM 요소 생성
   - 컴포넌트 함수 실행
   - 텍스트 노드 처리
   - 자식 재귀 처리

3. 나중에 디버깅할 때 어떤 구조가 더 읽기 쉬울까요?

## VNode → Instance → DOM 전체 흐름

실제로 구현할 때는 이런 흐름을 따릅니다:

```
1. setup 호출
   ↓
2. render 호출
   ↓
3. reconcile 호출
   ↓
4. (instance가 없으면) mount 로직 실행:

   VNode 확인
   ↓
   VNode.type이 뭔가요?

   - 문자열 (예: "div") → DOM 요소
     → document.createElement(type)
     → setDomProps로 속성 설정
     → 자식들도 재귀적으로 reconcile

   - 함수 (컴포넌트) → 컴포넌트 Instance
     → 함수 실행해서 반환된 VNode 얻기
     → 그 VNode를 다시 reconcile

   - TEXT_ELEMENT → 텍스트 노드
     → document.createTextNode(...)

   ↓
   Instance 생성 { kind, dom, node, children, ... }
   ↓
   DOM에 삽입 (insertInstance)
   ↓
   Instance 반환
```

## 다음 단계로 넘어가기 전 체크리스트

스스로 답해보세요:

- [ ] Instance가 왜 필요한지 이해했나요?
- [ ] reconcile 함수가 어떤 역할을 하는지 알겠나요?
- [ ] mount, update, unmount의 차이를 설명할 수 있나요?
- [ ] VNode의 type이 문자열일 때와 함수일 때 어떻게 다르게 처리해야 할지 생각해봤나요?
- [ ] 코드를 reconcile 안에 넣을지, 별도 함수로 뺄지 결정했나요?

## 힌트: 테스트 다시 보기

```typescript
it("렌더는 컨테이너 내용을 새 DOM으로 교체한다", () => {
  const container = document.createElement("div");
  container.appendChild(document.createElement("span")).textContent = "old";

  setup(<p>new</p>, container);

  expect(container.childNodes).toHaveLength(1);
  expect(container.firstChild?.nodeName).toBe("P");
  expect(container.firstChild?.textContent).toBe("new");
});
```

이 테스트가 통과하려면:
1. `<p>new</p>` JSX → VNode 변환 (✅ 이미 됨)
2. VNode → Instance 생성
3. Instance.dom으로 실제 `<p>` 태그 생성
4. `"new"` 텍스트도 Instance와 텍스트 노드로 생성
5. container에 삽입

모두 `reconcile` 함수 (또는 거기서 호출하는 함수들)에서 일어납니다!

## 마무리

**질문에 대한 최종 답변:**

> VNode → Instance 변환 함수는 어디에 작성하나요?

→ `reconcile` 함수 내부의 **mount 로직**에 작성합니다.
→ 별도 `mount` 함수로 분리할 수도, `reconcile` 안에 직접 작성할 수도 있습니다.
→ 둘 다 정답입니다. 중요한 건 **왜 그렇게 선택했는지** 설명할 수 있어야 합니다!

---

다 이해했다면, 이제 직접 코드를 작성해볼 차례입니다. 화이팅! 🚀
