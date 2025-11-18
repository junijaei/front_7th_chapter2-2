import { context } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT } from "./constants";
import { Instance, VNode } from "./types";
import {
  getFirstDom,
  getFirstDomFromChildren,
  insertInstance,
  removeInstance,
  setDomProps,
  updateDomProps,
} from "./dom";
import { createChildPath } from "./elements";
import { isEmptyValue } from "../utils";

/**
 * 이전 인스턴스와 새로운 VNode를 비교하여 DOM을 업데이트하는 재조정 과정을 수행합니다.
 *
 * @param parentDom - 부모 DOM 요소
 * @param instance - 이전 렌더링의 인스턴스
 * @param node - 새로운 VNode
 * @param path - 현재 노드의 고유 경로
 * @returns 업데이트되거나 새로 생성된 인스턴스
 */
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
): Instance | null => {
  // 여기를 구현하세요.
  // 1. 새 노드가 null이면 기존 인스턴스를 제거합니다. (unmount)
  // 2. 기존 인스턴스가 없으면 새 노드를 마운트합니다. (mount)
  // 3. 타입이나 키가 다르면 기존 인스턴스를 제거하고 새로 마운트합니다.
  // 4. 타입과 키가 같으면 인스턴스를 업데이트합니다. (update)
  //    - DOM 요소: updateDomProps로 속성 업데이트 후 자식 재조정
  //    - 컴포넌트: 컴포넌트 함수 재실행 후 자식 재조정
  if (node === null) {
    return unmount(parentDom, instance);
  }
  if (instance === null) {
    return mount(parentDom, node, path);
  }

  return null;
};

const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  return instance;
};
const mount = (parentDom: HTMLElement, node: VNode, path: string) => {
  const { key } = node;
  if (node.type === TEXT_ELEMENT) {
    const dom = document.createTextNode(node.props.nodeValue);
    const instance = {
      kind: "text",
      dom,
      children: [],
      key,
      node,
      path,
    } as Instance;
    insertInstance(parentDom, instance);
    return instance;
  }

  if (node.type === Fragment) {
    const { children } = node.props;
    const instance = {
      kind: "fragment",
      dom: null,
      children: [],
      key,
      path,
      node,
    } as Instance;
    if (children) {
      instance.children = children
        .filter((child) => !!child)
        .map((child, index) => {
          const childPath = createChildPath(path, child.key, index, child.type);
          return reconcile(parentDom, null, child, childPath);
        });
    }
    return instance;
  }

  if (typeof node.type === "string") {
    const dom = document.createElement(node.type);

    const { children, ...props } = node.props;

    setDomProps(dom, props);

    const instance = {
      kind: "host",
      dom,
      children: [],
      key,
      node,
      path,
    } as Instance;

    if (children) {
      instance.children = children
        .filter((child) => !!child)
        .map((child, index) => {
          const childPath = createChildPath(path, child.key, index, child.type);
          return reconcile(dom, null, child, childPath);
        });
    }

    insertInstance(parentDom, instance);
    return instance;
  }

  if (typeof node.type === "function") {
    const newVNode = node.type(node.props);

    const childInstance = reconcile(parentDom, null, newVNode, path);
    const instance = {
      kind: "component",
      dom: null,
      children: [childInstance],
      key,
      node,
      path,
    } as Instance;
    return instance;
  }

  throw new Error(`알 수 없는 노드 타입: ${String(node.type)}`);
};
const update = () => {};
