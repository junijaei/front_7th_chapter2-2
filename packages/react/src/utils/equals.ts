/**
 * 두 값의 얕은 동등성을 비교합니다.
 * 객체와 배열은 1단계 깊이까지만 비교합니다.
 */
export const shallowEquals = (a: unknown, b: unknown): boolean => {
  // 1. 동일 참조이거나 기본 타입이 같으면 true
  if (Object.is(a, b)) {
    return true;
  }

  // 2. 둘 중 하나라도 null이거나 객체가 아니면 false
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  // 3. 배열인 경우
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // 4. 배열 타입이 다른 경우
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // 5. 객체인 경우
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
};

/**
 * 두 값의 깊은 동등성을 비교합니다.
 * 객체와 배열의 모든 중첩된 속성을 재귀적으로 비교합니다.
 */
export const deepEquals = (a: unknown, b: unknown): boolean => {
  // 1. 동일 참조이거나 기본 타입이 같으면 true
  if (Object.is(a, b)) {
    return true;
  }

  // 2. 둘 중 하나라도 null이거나 객체가 아니면 false
  if (a == null || b == null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  // 3. 배열인 경우
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // 4. 배열 타입이 다른 경우
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // 5. 객체인 경우
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !deepEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
};
