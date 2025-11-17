/* eslint-disable @typescript-eslint/no-explicit-any */
import { isEmptyValue } from "../utils";
import { VNode } from "./types";
import { TEXT_ELEMENT } from "./constants";

/**
 * 주어진 노드를 VNode 형식으로 정규화합니다.
 * null, undefined, boolean, 배열, 원시 타입 등을 처리하여 일관된 VNode 구조를 보장합니다.
 */
export const normalizeNode = (node: any): VNode | null => {
  // null, undefined, boolean은 렌더링하지 않음
  if (isEmptyValue(node)) {
    return null;
  }

  // 문자열이나 숫자는 텍스트 노드로 변환
  if (typeof node === "string" || typeof node === "number") {
    return createTextElement(node);
  }

  // 이미 VNode 형식인 경우 그대로 반환
  return node;
};

/**
 * 텍스트 노드를 위한 VNode를 생성합니다.
 */
const createTextElement = (text: string | number): VNode => {
  return {
    type: TEXT_ELEMENT,
    key: null,
    props: {
      children: [],
      nodeValue: String(text),
    },
  };
};

/**
 * JSX로부터 전달된 인자를 VNode 객체로 변환합니다.
 * 이 함수는 JSX 변환기에 의해 호출됩니다. (예: Babel, TypeScript)
 */
export const createElement = (
  type: string | symbol | React.ComponentType<any>,
  originProps?: Record<string, any> | null,
  ...rawChildren: any[]
): VNode => {
  const { key = null, ...props } = originProps || {};

  // 자식들을 평탄화하고 정규화
  const flattenChildren = (children: any[]): any[] => {
    return children.reduce((acc, child) => {
      if (Array.isArray(child)) {
        acc.push(...flattenChildren(child));
      } else {
        acc.push(child);
      }
      return acc;
    }, []);
  };

  const flatChildren = flattenChildren(rawChildren);
  const normalizedChildren = flatChildren.map(normalizeNode).filter((child): child is VNode => child !== null);

  // children이 있을 때만 props에 포함
  if (normalizedChildren.length > 0) {
    return {
      type,
      key,
      props: {
        ...props,
        children: normalizedChildren,
      },
    };
  }

  return {
    type,
    key,
    props,
  };
};

/**
 * 부모 경로와 자식의 key/index를 기반으로 고유한 경로를 생성합니다.
 * 이는 훅의 상태를 유지하고 Reconciliation에서 컴포넌트를 식별하는 데 사용됩니다.
 */
export const createChildPath = (
  parentPath: string,
  key: string | null,
  index: number,
  nodeType?: string | symbol | React.ComponentType,
  siblings?: VNode[],
): string => {
  // key가 있으면 key를 사용, 없으면 타입 기반 카운터 사용
  if (key != null) {
    return `${parentPath}.k${key}`;
  }

  // 타입이 함수(컴포넌트)인 경우 컴포넌트 이름 사용
  if (typeof nodeType === "function") {
    const componentName = nodeType.displayName || nodeType.name || "Component";
    // 같은 타입의 형제들 중 몇 번째인지 계산
    const sameTypeCount =
      siblings?.slice(0, index).filter((sibling) => sibling.type === nodeType && sibling.key == null).length || 0;
    return `${parentPath}.c${componentName}_${sameTypeCount}`;
  }

  // 일반적인 경우 인덱스 사용
  return `${parentPath}.i${index}`;
};
