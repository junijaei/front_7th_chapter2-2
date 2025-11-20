/* eslint-disable @typescript-eslint/no-explicit-any */
import { Instance } from "./types";

/**
 * DOM 요소에 속성(props)을 설정합니다.
 * 이벤트 핸들러, 스타일, className 등 다양한 속성을 처리해야 합니다.
 */
export const setDomProps = (dom: HTMLElement, props: Record<string, any>): void => {
  // 여기를 구현하세요.
  Object.keys(props).forEach((key) => {
    if (key === "children") return;

    const attr = key === "className" ? "class" : key;
    const value = props[key];

    if (attr === "style") {
      Object.entries(value).forEach(([styleKey, styleValue]) => {
        (dom.style as any)[styleKey] = styleValue;
      });
    } else if (attr.startsWith("on") && typeof value === "function") {
      const eventName = attr.toLowerCase().substring(2);
      dom.addEventListener(eventName, value);
    } else if (typeof value === "boolean") {
      if (value) dom.setAttribute(key, "");
    } else if (value !== null && value !== undefined) {
      dom.setAttribute(attr, value);
    }
  });
};

/**
 * 이전 속성과 새로운 속성을 비교하여 DOM 요소의 속성을 업데이트합니다.
 * 변경된 속성만 효율적으로 DOM에 반영해야 합니다.
 */
export const updateDomProps = (
  dom: HTMLElement,
  prevProps: Record<string, any> = {},
  nextProps: Record<string, any> = {},
): void => {
  // 삭제된 dom props 처리
  Object.keys(prevProps).forEach((key) => {
    if (!(key in nextProps)) {
      const attr = key === "className" ? "class" : key;
      if (attr.startsWith("on")) {
        const eventName = attr.toLowerCase().substring(2);
        dom.removeEventListener(eventName, prevProps[attr]);
      } else {
        dom.removeAttribute(attr);
      }
    }
  });

  Object.keys(nextProps).forEach((key) => {
    if (key.startsWith("on")) {
      const eventName = key.toLowerCase().substring(2);
      if (prevProps[key]) dom.removeEventListener(eventName, prevProps[key]);
      if (nextProps[key] && typeof nextProps[key] === "function") dom.addEventListener(eventName, nextProps[key]);
    }
  });

  const changedProps = Object.entries(nextProps)
    .filter(([nextKey, nextValue]) => {
      if (nextKey.startsWith("on")) return false;
      return !prevProps[nextKey] || prevProps[nextKey] !== nextValue;
    })
    .reduce((acc, [nextKey, nextValue]) => {
      return { ...acc, [nextKey]: nextValue };
    }, {});
  setDomProps(dom, changedProps);
};

/**
 * 주어진 인스턴스에서 실제 DOM 노드(들)를 재귀적으로 찾아 배열로 반환합니다.
 * Fragment나 컴포넌트 인스턴스는 여러 개의 DOM 노드를 가질 수 있습니다.
 */
export const getDomNodes = (instance: Instance | null): (HTMLElement | Text)[] => {
  // 여기를 구현하세요.
  if (!instance) return [];
  if (instance.dom) return [instance.dom];
  return instance.children.flatMap(getDomNodes);
};

/**
 * 주어진 인스턴스에서 첫 번째 실제 DOM 노드를 찾습니다.
 */
export const getFirstDom = (instance: Instance | null): HTMLElement | Text | null => {
  // 여기를 구현하세요.
  if (!instance) return null;
  if (instance.dom) return instance.dom;
  return getFirstDomFromChildren(instance.children);
};

/**
 * 자식 인스턴스들로부터 첫 번째 실제 DOM 노드를 찾습니다.
 */
export const getFirstDomFromChildren = (children: (Instance | null)[]): HTMLElement | Text | null => {
  // 여기를 구현하세요.
  for (const child of children) {
    if (child?.dom) return child.dom;
  }
  return null;
};

/**
 * 인스턴스를 부모 DOM에 삽입합니다.
 * anchor 노드가 주어지면 그 앞에 삽입하여 순서를 보장합니다.
 */
export const insertInstance = (
  parentDom: HTMLElement,
  instance: Instance | null,
  anchor: HTMLElement | Text | null = null,
): void => {
  // 여기를 구현하세요.
  if (!instance?.dom) return;
  if (anchor) parentDom.insertBefore(instance.dom, anchor);
  else parentDom.appendChild(instance.dom);
};

/**
 * 부모 DOM에서 인스턴스에 해당하는 모든 DOM 노드를 제거합니다.
 */
export const removeInstance = (parentDom: HTMLElement, instance: Instance | null): void => {
  // 여기를 구현하세요.
  if (!instance) return;
  const domNodes = getDomNodes(instance);
  domNodes.forEach((dom) => {
    if (dom.parentNode === parentDom) parentDom.removeChild(dom);
  });
};
