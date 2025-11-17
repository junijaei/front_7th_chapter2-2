import type { AnyFunction } from "../types";
import { useCallback } from "./useCallback";
import { useRef } from "./useRef";

/**
 * 항상 최신 상태를 참조하면서도, 함수 자체의 참조는 변경되지 않는 콜백을 생성합니다.
 *
 * @param fn - 최신 상태를 참조할 함수
 * @returns 참조가 안정적인 콜백 함수
 */
export const useAutoCallback = <T extends AnyFunction>(fn: T): T => {
  // useRef로 최신 함수를 저장
  const fnRef = useRef(fn);

  // 매 렌더마다 최신 함수로 업데이트
  fnRef.current = fn;

  // useCallback으로 참조가 안정적인 래퍼 함수 생성
  // 빈 deps 배열로 함수 참조가 변경되지 않도록 함
  // 실제 호출 시에는 항상 최신 fnRef.current를 실행
  return useCallback((...args: Parameters<T>) => fnRef.current(...args), []) as T;
};
