import { shallowEquals } from "../utils";
import { context } from "./context";
import { EffectHook } from "./types";
import { enqueueRender } from "./render";
import { HookTypes } from "./constants";

/**
 * 사용되지 않는 컴포넌트의 훅 상태와 이펙트 클린업 함수를 정리합니다.
 */
export const cleanupUnusedHooks = () => {
  const { hooks } = context;

  // visited에 없는 경로는 더 이상 사용되지 않는 컴포넌트
  const pathsToDelete: string[] = [];

  hooks.state.forEach((_, path) => {
    if (!hooks.visited.has(path)) {
      pathsToDelete.push(path);
    }
  });

  // 사용되지 않는 훅 상태 제거
  pathsToDelete.forEach((path) => {
    const hookState = hooks.state.get(path);

    // 이펙트 클린업 함수 실행
    if (hookState) {
      hookState.forEach((hook) => {
        if (hook && typeof hook === "object" && "kind" in hook && hook.kind === HookTypes.EFFECT) {
          const effectHook = hook as EffectHook;
          if (effectHook.cleanup) {
            effectHook.cleanup();
          }
        }
      });
    }

    hooks.state.delete(path);
    hooks.cursor.delete(path);
  });
};

/**
 * 컴포넌트의 상태를 관리하기 위한 훅입니다.
 * @param initialValue - 초기 상태 값 또는 초기 상태를 반환하는 함수
 * @returns [현재 상태, 상태를 업데이트하는 함수]
 */
export const useState = <T>(initialValue: T | (() => T)): [T, (nextValue: T | ((prev: T) => T)) => void] => {
  const { hooks } = context;

  // 1. 현재 컴포넌트의 훅 커서와 상태 배열 가져오기
  const path = hooks.currentPath;
  const cursor = hooks.currentCursor;
  const currentHooks = hooks.currentHooks;

  // 2. 첫 렌더링이라면 초기값으로 상태 설정
  if (currentHooks[cursor] === undefined) {
    const initialState = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    currentHooks[cursor] = initialState;
  }

  const state = currentHooks[cursor] as T;

  // 3. 상태 변경 함수(setter) 생성
  const setState = (nextValue: T | ((prev: T) => T)) => {
    const currentState = hooks.state.get(path)?.[cursor] as T;
    const newValue = typeof nextValue === "function" ? (nextValue as (prev: T) => T)(currentState) : nextValue;

    // 새 값이 이전 값과 같으면 재렌더링 건너뛰기
    if (Object.is(currentState, newValue)) {
      return;
    }

    // 상태 업데이트
    const stateArray = hooks.state.get(path);
    if (stateArray) {
      stateArray[cursor] = newValue;
    }

    // 재렌더링 예약
    enqueueRender();
  };

  // 4. 훅 커서 증가
  hooks.cursor.set(path, cursor + 1);

  return [state, setState];
};

/**
 * 컴포넌트의 사이드 이펙트를 처리하기 위한 훅입니다.
 * @param effect - 실행할 이펙트 함수. 클린업 함수를 반환할 수 있습니다.
 * @param deps - 의존성 배열. 이 값들이 변경될 때만 이펙트가 다시 실행됩니다.
 */
export const useEffect = (effect: () => (() => void) | void, deps?: unknown[]): void => {
  const { hooks, effects } = context;

  // 1. 현재 컴포넌트의 훅 커서와 상태 배열 가져오기
  const path = hooks.currentPath;
  const cursor = hooks.currentCursor;
  const currentHooks = hooks.currentHooks;

  // 2. 이전 이펙트 훅 가져오기
  const prevHook = currentHooks[cursor] as EffectHook | undefined;

  // 3. 의존성 비교
  // deps가 undefined면 항상 실행, 그 외에는 deps 변경 여부 확인
  const depsChanged = !prevHook || deps === undefined || !shallowEquals(prevHook.deps, deps);

  // 4. 의존성이 변경되었거나 첫 렌더링일 경우 이펙트 실행 예약
  if (depsChanged) {
    // 새 이펙트 훅 생성/업데이트
    const newHook: EffectHook = {
      kind: HookTypes.EFFECT,
      deps: deps === undefined ? undefined : deps,
      cleanup: prevHook?.cleanup ?? null,
      effect,
    };

    currentHooks[cursor] = newHook;

    // 이펙트 실행 예약
    effects.queue.push({ path, cursor });
  } else if (prevHook) {
    // 의존성이 변경되지 않았으면 이전 훅 유지
    currentHooks[cursor] = prevHook;
  }

  // 5. 훅 커서 증가
  hooks.cursor.set(path, cursor + 1);
};
