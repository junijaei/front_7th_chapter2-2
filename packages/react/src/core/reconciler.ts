import { context } from "./context";
import { Fragment, NodeType, TEXT_ELEMENT } from "./constants";
import { Instance, VNode } from "./types";
import { getFirstDom, insertInstance, removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath, normalizeNode } from "./elements";

/**
 * 이전 인스턴스와 새로운 VNode를 비교하여 DOM을 업데이트하는 재조정 과정을 수행합니다.
 */
export const reconcile = (
  parentDom: HTMLElement,
  instance: Instance | null,
  node: VNode | null,
  path: string,
): Instance | null => {
  // 1. 새 노드가 null이면 기존 인스턴스를 제거합니다
  if (node === null) {
    if (instance) removeInstance(parentDom, instance);
    return null;
  }

  // 2. 기존 인스턴스가 없으면 새 노드를 마운트합니다
  if (instance === null) {
    return mount(parentDom, node, path);
  }

  // 3. 타입이나 키가 다르면 기존 인스턴스를 제거하고 새로 마운트합니다
  if (instance.node.type !== node.type || instance.key !== node.key) {
    // 제거 전에 다음 sibling을 anchor로 저장
    const firstDom = getFirstDom(instance);
    const anchor = firstDom?.nextSibling as HTMLElement | Text | null;
    removeInstance(parentDom, instance);
    const newInstance = mount(parentDom, node, path);
    if (newInstance) {
      insertInstance(parentDom, newInstance, anchor);
    }
    return newInstance;
  }

  // 4. 타입과 키가 같으면 인스턴스를 업데이트합니다
  return update(parentDom, instance, node, path);
};

/**
 * 새로운 VNode를 DOM으로 마운트합니다.
 * mount는 DOM을 생성하지만, 자신을 parentDom에 삽입하지 않습니다.
 * 대신 자식들은 올바른 순서로 삽입됩니다.
 */
const mount = (parentDom: HTMLElement, node: VNode, path: string): Instance | null => {
  const { key, props = {}, type } = node || {};

  // TEXT 노드
  if (type === TEXT_ELEMENT) {
    const dom = document.createTextNode(props.nodeValue);
    return {
      kind: "text",
      dom,
      children: [],
      key,
      node,
      path,
    } as Instance;
  }

  // Fragment
  if (type === Fragment) {
    const children = mountChildren(parentDom, props.children || [], path);
    return {
      kind: "fragment",
      dom: null,
      children,
      key,
      path,
      node,
    } as Instance;
  }

  // Host 요소 (div, span 등)
  if (typeof type === "string") {
    const dom = document.createElement(type);
    setDomProps(dom, props);

    // host 요소의 자식은 dom에 삽입됨
    const children = mountChildren(dom, props.children || [], path);

    return {
      kind: "host",
      dom,
      children,
      key,
      node,
      path,
    } as Instance;
  }

  // 함수형 컴포넌트
  if (typeof type === "function") {
    context.hooks.componentStack.push(path);
    context.hooks.visited.add(path);
    const rawVNode = type(props);
    const childVNode = normalizeNode(rawVNode!);
    context.hooks.componentStack.pop();

    // 컴포넌트의 자식 VNode를 마운트 (삽입은 하지 않음 - 호출자가 처리)
    // 자식이 컴포넌트인 경우 고유한 path를 생성해야 함
    const childPath = childVNode ? createChildPath(path, childVNode.key, 0, childVNode.type) : path;
    const childInstance = childVNode ? mount(parentDom, childVNode, childPath) : null;

    return {
      kind: "component",
      dom: null,
      children: [childInstance],
      key,
      node,
      path,
    } as Instance;
  }

  return null;
};

/**
 * 자식 VNode들을 마운트하고 올바른 순서로 DOM에 삽입합니다.
 */
const mountChildren = (parentDom: HTMLElement, children: VNode[], parentPath: string): (Instance | null)[] => {
  // 1. 모든 자식 인스턴스 생성 (DOM 삽입 없이)
  const instances = children.map((child, index) => {
    if (!child) return null;
    const childPath = createChildPath(parentPath, child.key, index, child.type, children);
    return mount(parentDom, child, childPath);
  });

  // 2. 역순으로 DOM 삽입 (올바른 순서 보장)
  let anchor: HTMLElement | Text | null = null;
  for (let i = instances.length - 1; i >= 0; i--) {
    const instance = instances[i];
    if (!instance) continue;
    insertInstance(parentDom, instance, anchor);
    anchor = getFirstDom(instance);
  }

  return instances;
};

/**
 * 기존 인스턴스를 새로운 VNode로 업데이트합니다.
 */
const update = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  const { props = {} } = node || {};
  const kind: NodeType = instance.kind;

  switch (kind) {
    case "text": {
      const newText = props.nodeValue;
      if (instance.node.props.nodeValue !== newText) {
        (instance.dom as Text).nodeValue = newText;
      }
      instance.node = node;
      return instance;
    }

    case "host": {
      updateDomProps(instance.dom as HTMLElement, instance.node.props, props);
      instance.children = reconcileChildren(
        instance.dom as HTMLElement,
        instance.children,
        (props.children || []) as VNode[],
        path,
      );
      instance.node = node;
      return instance;
    }

    case "fragment": {
      instance.children = reconcileChildren(parentDom, instance.children, (props.children || []) as VNode[], path);
      instance.node = node;
      return instance;
    }

    case "component": {
      context.hooks.componentStack.push(path);
      context.hooks.visited.add(path);
      const rawVNode = (node.type as (props: unknown) => VNode)(props);
      const childVNode = normalizeNode(rawVNode);
      context.hooks.componentStack.pop();

      const oldChildInstance = instance.children[0];
      // 자식의 고유한 path 생성
      const childPath = childVNode ? createChildPath(path, childVNode.key, 0, childVNode.type) : path;

      if (childVNode === null) {
        // 새 자식이 null이면 기존 자식 제거
        if (oldChildInstance) {
          removeInstance(parentDom, oldChildInstance);
        }
        instance.children[0] = null;
      } else if (oldChildInstance === null) {
        // 기존 자식이 null이면 새로 마운트하고 삽입
        const newChildInstance = mount(parentDom, childVNode, childPath);
        if (newChildInstance) {
          insertInstance(parentDom, newChildInstance, null);
        }
        instance.children[0] = newChildInstance;
      } else {
        // 둘 다 있으면 reconcile
        instance.children[0] = reconcile(parentDom, oldChildInstance, childVNode, childPath);
      }

      instance.node = node;
      return instance;
    }
  }
};

/**
 * 이전 자식들과 새로운 자식들을 비교하여 재조정합니다.
 */
const reconcileChildren = (
  parentDom: HTMLElement,
  oldChildren: (Instance | null)[],
  newChildren: VNode[],
  parentPath: string,
): (Instance | null)[] => {
  // 1. 이전 자식들을 key로 매핑
  const oldChildrenMap = new Map<string, Instance>();
  oldChildren.forEach((child, index) => {
    if (!child) return;
    const key = child.key ?? String(index);
    oldChildrenMap.set(key, child);
  });

  // 2. 새로운 자식들 처리
  const newInstances = newChildren.map((newChild, index) => {
    if (!newChild) return null;

    const key = newChild.key ?? String(index);
    const oldChild = oldChildrenMap.get(key) || null;

    if (oldChild) {
      oldChildrenMap.delete(key);
    }

    const childPath = createChildPath(parentPath, newChild.key, index, newChild.type, newChildren);

    // 기존 인스턴스가 있으면 업데이트, 없으면 새로 마운트
    if (oldChild) {
      // 타입이나 키가 같으면 업데이트
      if (oldChild.node.type === newChild.type && oldChild.key === newChild.key) {
        return update(parentDom, oldChild, newChild, childPath);
      }
      // 다르면 제거 후 새로 마운트
      removeInstance(parentDom, oldChild);
    }

    return mount(parentDom, newChild, childPath);
  });

  // 3. 사용되지 않은 이전 자식들 제거
  oldChildrenMap.forEach((oldChild) => {
    removeInstance(parentDom, oldChild);
  });

  // 4. DOM 위치 조정 (역순으로)
  let anchor: HTMLElement | Text | null = null;
  for (let i = newInstances.length - 1; i >= 0; i--) {
    const instance = newInstances[i];
    if (!instance) continue;
    insertInstance(parentDom, instance, anchor);
    anchor = getFirstDom(instance);
  }

  return newInstances;
};
