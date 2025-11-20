import { context } from "./context";
import { Fragment, NodeType, NodeTypes, TEXT_ELEMENT } from "./constants";
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
  if (node === null) {
    // 1. 새 노드가 null이면 기존 인스턴스를 제거합니다. (unmount)
    return unmount(parentDom, instance);
  }
  if (instance === null) {
    // 2. 기존 인스턴스가 없으면 새 노드를 마운트합니다. (mount)
    return mount(parentDom, node, path);
  }
  if (instance.node.type !== node.type || instance.key !== node.key) {
    // 3. 타입이나 키가 다르면 기존 인스턴스를 제거하고 새로 마운트합니다.
    unmount(parentDom, instance);
    return mount(parentDom, node, path);
  }

  // 4. 타입과 키가 같으면 인스턴스를 업데이트합니다. (update)
  return update(parentDom, instance, node, path);
};

const unmount = (parentDom: HTMLElement, instance: Instance | null) => {
  removeInstance(parentDom, instance);
  return instance;
};
const mount = (parentDom: HTMLElement, node: VNode, path: string) => {
  const { key } = node;
  const { children, ...props } = node.props;

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
    context.hooks.componentStack.push(path);
    const newVNode = node.type(node.props);
    context.hooks.componentStack.pop();

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
const update = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string) => {
  const instanceKind: NodeType = instance.kind;
  switch (instanceKind) {
    case "text": {
      const oldText = instance.node.props.nodeValue;
      const newText = node.props.nodeValue;

      if (oldText !== newText) {
        (instance.dom as Text).nodeValue = newText;
      }
      instance.node = node;
      return instance;
    }
    case "host": {
      const oldProps = instance.node.props;
      const newProps = node.props;
      updateDomProps(instance.dom as HTMLElement, oldProps, newProps);
      instance.children = reconcileChildren(
        instance.dom as HTMLElement,
        instance.children,
        node.props.children as VNode[],
        path,
      );
      instance.node = node;
      return instance;
    }
    case "fragment": {
      instance.children = reconcileChildren(parentDom, instance.children, node.props.children as VNode[], path);
      instance.node = node;
      return instance;
    }
    case "component": {
      context.hooks.componentStack.push(path);
      const newVNode = (node.type as (props: unknown) => VNode)(node.props);
      context.hooks.componentStack.pop();
      const childInstance = reconcile(parentDom, instance.children[0], newVNode, path);
      instance.node = node;
      instance.children = [childInstance];
      return instance;
    }
  }
};

const reconcileChildren = (
  dom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[] = [],
  parentPath: string,
) => {
  const oldChildrenMap: Record<string, Instance | null> = oldChildren.reduce((acc, oldChild, index) => {
    if (!oldChild) return acc;
    const key = oldChild?.key || String(index);
    return {
      ...acc,
      [key]: oldChild,
    };
  }, {});

  const newInstances = newChildren.map((newChild, index) => {
    const key = newChild.key || String(index);
    const oldChild = oldChildrenMap[key] || null;
    if (oldChild) delete oldChildrenMap[key];
    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type);
    return reconcile(dom, oldChild, newChild, childPath);
  });

  Object.values(oldChildrenMap).forEach((oldChild) => {
    unmount(dom, oldChild);
  });

  return newInstances;
};
