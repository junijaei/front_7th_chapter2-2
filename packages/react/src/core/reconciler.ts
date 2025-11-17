import { context } from "./context";
import { Fragment, NodeTypes, TEXT_ELEMENT } from "./constants";
import { Instance, VNode } from "./types";
import { removeInstance, setDomProps, updateDomProps } from "./dom";
import { createChildPath } from "./elements";

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
  // 1. 새 노드가 null이면 기존 인스턴스 제거 (unmount)
  if (node == null) {
    if (instance) {
      removeInstance(parentDom, instance);
    }
    return null;
  }

  // 2. 기존 인스턴스가 없으면 새로 마운트 (mount)
  if (instance == null) {
    return mount(parentDom, node, path);
  }

  // 3. 타입이나 키가 다르면 제거하고 새로 마운트
  if (instance.node.type !== node.type || instance.node.key !== node.key) {
    removeInstance(parentDom, instance);
    return mount(parentDom, node, path);
  }

  // 4. 타입과 키가 같으면 업데이트
  return update(parentDom, instance, node, path);
};

/**
 * 새 노드를 DOM에 마운트합니다.
 */
const mount = (parentDom: HTMLElement, node: VNode, path: string): Instance => {
  const { type, key, props = {} } = node || {};

  // Fragment 처리
  if (type === Fragment) {
    const instance: Instance = {
      kind: NodeTypes.FRAGMENT,
      dom: null,
      node,
      children: [],
      key,
      path,
    };

    const childrenNodes = props.children || [];
    instance.children = reconcileChildren(parentDom, instance, childrenNodes);
    return instance;
  }

  // 컴포넌트 처리
  if (typeof type === "function") {
    const instance: Instance = {
      kind: NodeTypes.COMPONENT,
      dom: null,
      node,
      children: [],
      key,
      path,
    };

    // 컴포넌트 스택에 추가
    context.hooks.componentStack.push(path);
    context.hooks.cursor.set(path, 0);
    context.hooks.visited.add(path);

    // 컴포넌트 함수 실행
    const childNode = type(props);

    // 컴포넌트 스택에서 제거
    context.hooks.componentStack.pop();

    // 자식 재조정
    const childPath = createChildPath(path, null, 0, childNode?.type, [childNode!].filter(Boolean));
    const childInstance = reconcile(parentDom, null, childNode, childPath);
    instance.children = childInstance ? [childInstance] : [];

    return instance;
  }

  // 텍스트 노드 처리
  if (type === TEXT_ELEMENT) {
    const textNode = document.createTextNode(props.nodeValue || "");
    const instance: Instance = {
      kind: NodeTypes.TEXT,
      dom: textNode,
      node,
      children: [],
      key,
      path,
    };
    parentDom.appendChild(textNode);
    return instance;
  }

  // 일반 DOM 요소 처리
  const dom = document.createElement(type as string);
  const instance: Instance = {
    kind: NodeTypes.HOST,
    dom,
    node,
    children: [],
    key,
    path,
  };

  // props 설정
  setDomProps(dom, props);

  // 자식들 재조정
  const childrenNodes = props.children || [];
  instance.children = reconcileChildren(dom, instance, childrenNodes);

  // DOM에 삽입
  parentDom.appendChild(dom);

  return instance;
};

/**
 * 기존 인스턴스를 새 노드로 업데이트합니다.
 */
const update = (parentDom: HTMLElement, instance: Instance, node: VNode, path: string): Instance => {
  const { type, props = {} } = node;

  // prevProps 저장 (instance.node를 업데이트하기 전에)
  const prevProps = instance.node.props || {};

  instance.node = node;
  instance.path = path;

  // Fragment 업데이트
  if (type === Fragment) {
    const childrenNodes = props.children || [];
    instance.children = reconcileChildren(parentDom, instance, childrenNodes);
    return instance;
  }

  // 컴포넌트 업데이트
  if (typeof type === "function") {
    // 컴포넌트 스택에 추가
    context.hooks.componentStack.push(path);
    context.hooks.cursor.set(path, 0);
    context.hooks.visited.add(path);

    // 컴포넌트 함수 실행
    const childNode = type(props);

    // 컴포넌트 스택에서 제거
    context.hooks.componentStack.pop();

    // 자식 재조정
    const oldChild = instance.children[0] || null;
    const childPath = createChildPath(path, null, 0, childNode?.type, [childNode!].filter(Boolean));
    const childInstance = reconcile(parentDom, oldChild, childNode, childPath);
    instance.children = childInstance ? [childInstance] : [];

    return instance;
  }

  // 텍스트 노드 업데이트
  if (type === TEXT_ELEMENT && instance.dom) {
    instance.dom.nodeValue = props.nodeValue || "";
    return instance;
  }

  // DOM 요소 업데이트
  if (instance.kind === NodeTypes.HOST && instance.dom) {
    updateDomProps(instance.dom as HTMLElement, prevProps, props);

    // 자식들 재조정
    const childrenNodes = props.children || [];
    instance.children = reconcileChildren(instance.dom as HTMLElement, instance, childrenNodes);
  }

  return instance;
};

/**
 * 자식 노드들을 재조정합니다.
 */
const reconcileChildren = (
  parentDom: HTMLElement,
  parentInstance: Instance,
  newChildren: VNode[],
): (Instance | null)[] => {
  const oldChildren = parentInstance.children;
  const newInstances: (Instance | null)[] = [];

  const maxLength = Math.max(oldChildren.length, newChildren.length);

  for (let i = 0; i < maxLength; i++) {
    const oldChild = oldChildren[i] || null;
    const newChild = newChildren[i] || null;

    const childPath = newChild
      ? createChildPath(parentInstance.path, newChild.key, i, newChild.type, newChildren)
      : oldChild?.path || `${parentInstance.path}.i${i}`;

    const instance = reconcile(parentDom, oldChild, newChild, childPath);
    newInstances.push(instance);
  }

  return newInstances;
};
