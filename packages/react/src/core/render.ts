import { context } from "./context";
import { reconcile } from "./reconciler";
import { cleanupUnusedHooks } from "./hooks";
import { withEnqueue, enqueue } from "../utils";

/**
 * 루트 컴포넌트의 렌더링을 수행하는 함수입니다.
 * `enqueueRender`에 의해 스케줄링되어 호출됩니다.
 */
export const render = (): void => {
  const { root, hooks, effects } = context;

  if (!root.container || !root.node) {
    return;
  }

  // 1. 훅 컨텍스트 초기화
  hooks.cursor.clear();
  hooks.visited.clear();

  // 2. 루트 노드 재조정
  const newInstance = reconcile(root.container, root.instance, root.node, "0");
  root.instance = newInstance;

  // 3. 사용되지 않은 훅들 정리
  cleanupUnusedHooks();

  // 4. 예약된 이펙트 실행 (비동기)
  const effectsToRun = [...effects.queue];
  effects.queue = [];

  if (effectsToRun.length > 0) {
    enqueue(() => {
      effectsToRun.forEach(({ path, cursor }) => {
        const hookState = hooks.state.get(path);
        if (hookState) {
          const effectHook = hookState[cursor] as import("./types").EffectHook;
          if (effectHook && effectHook.kind === "effect") {
            // 이전 클린업 함수 실행
            if (effectHook.cleanup) {
              effectHook.cleanup();
            }

            // 이펙트 실행
            const cleanup = effectHook.effect();
            if (cleanup) {
              effectHook.cleanup = cleanup;
            }
          }
        }
      });
    });
  }
};

/**
 * `render` 함수를 마이크로태스크 큐에 추가하여 중복 실행을 방지합니다.
 */
export const enqueueRender = withEnqueue(render);
