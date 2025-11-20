/**
 * 두 값의 얕은 동등성을 비교합니다.
 * 객체와 배열은 1단계 깊이까지만 비교합니다.
 */
export const shallowEquals = (a: unknown, b: unknown): boolean => {
  // 여기를 구현하세요.
  // Object.is(), Array.isArray(), Object.keys() 등을 활용하여 1단계 깊이의 비교를 구현합니다.
  if (typeof a === "object" && a && b) {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return false;
      return a.every((el, i) => Object.is(el, b[i]));
    } else {
      return Object.entries(a).every(([key, item]) => {
        return Object.is(item, b?.[key]);
      });
    }
  }
  return Object.is(a, b);
};

/**
 * 두 값의 깊은 동등성을 비교합니다.
 * 객체와 배열의 모든 중첩된 속성을 재귀적으로 비교합니다.
 */
export const deepEquals = (a: unknown, b: unknown): boolean => {
  // 여기를 구현하세요.
  // 재귀적으로 deepEquals를 호출하여 중첩된 구조를 비교해야 합니다.
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      return a.every((el, i) => deepEquals(el, b[i]));
    } else {
      if (Object.keys(a).length !== Object.keys(b).length) return false;
      return Object.entries(a).every(([key, item]) => {
        return deepEquals(item, b?.[key]);
      });
    }
  }
  return Object.is(a, b);
};
