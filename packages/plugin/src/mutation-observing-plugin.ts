import React from "react";
import ReactDOM from "react-dom";
import {
  initializePluginBridge,
  RenderRootId,
  ReconciliationUpdate,
  ReconciliationPropUpdate
} from "@pluginsdotdev/bridge";

import type { ComponentType, ElementType } from "react";
import type { PluginBridge, Props } from "@pluginsdotdev/bridge";

type ExposedComponents = Record<
  keyof JSX.IntrinsicElements,
  keyof JSX.IntrinsicElements
>;

interface PluginConfig {
  pluginId: string;
  hostId: string;
  userId: string;
  exposedComponents: ExposedComponents;
}

type PluginFactory = (pluginConfig: PluginConfig) => ComponentType<Props>;

interface BrowserData {
  pluginId: string;
  hostId: string;
  userId: string;
  hostOrigin: string;
  exposedComponentsList: Array<keyof ExposedComponents>;
}

const browserData = async (): Promise<BrowserData> => {
  return new Promise((resolve, reject) => {
    document.addEventListener("DOMContentLoaded", () => {
      resolve({
        pluginId: document.body.getAttribute("data-plugin-id")!,
        hostId: document.body.getAttribute("data-host-id")!,
        userId: document.body.getAttribute("data-user-id")!,
        hostOrigin: document.body.getAttribute("data-host-origin")!,
        exposedComponentsList: JSON.parse(
          document.body.getAttribute("data-exposed-components")!
        ) as Array<keyof ExposedComponents>,
      });
    });
  });
};

const makeExposedComponents = (
  exposedComponentsList: Array<keyof ExposedComponents>
): ExposedComponents => {
  return exposedComponentsList.reduce((exposedComponents, component) => {
    exposedComponents[
      component
    ] = `host:${component}` as keyof JSX.IntrinsicElements;
    return exposedComponents;
  }, {} as ExposedComponents);
};

class NodeIdContainer {
  private nextId = 0;
  private nodesById = new WeakMap<Node, number>();

  constructor() { }

  addNode(node: Node): number {
    const id = this.nextId++;
    this.nodesById.set(node, id);
    return id;
  }

  getOrAddNode(node: Node): number {
    const id = this.getId(node);
    return typeof id === 'undefined'
      ? this.addNode(node)
      : id;
  }

  getId(node: Node): number | undefined {
    return this.nodesById.get(node);
  }

  isRoot(node: Node): boolean {
    return this.getId(node) === 0;
  }
}

const calculateChildIdx = (node: Node): number => {
  let childIdx = 0;
  let currentNode = node;
  while ( currentNode.previousSibling !== null ) {
    currentNode = currentNode.previousSibling;
    ++childIdx;
  }
  return childIdx;
};

type Updates = Record<string, ReconciliationUpdate>;

const mergeUpdates = (a: Updates, b: Updates): Updates => {
  const allKeys = Array.from(
    new Set(Object.keys(a).concat(Object.keys(b)))
  );
  return allKeys.reduce((result, k) => {
    const first = result[k];
    const second = b[k];

    if ( !first ) {
      result[k] = second;
      return result;
    }

    if ( !second ) {
      return result;
    }

    first.childUpdates = (first.childUpdates || []).concat(second.childUpdates || []);
    first.propUpdates = (first.propUpdates || []).concat(second.propUpdates || []);
    first.textUpdate = first.textUpdate || second.textUpdate;
    return result;
  }, a);
};

const getTreeUpdates = (nodeIdContainer: NodeIdContainer, target: Node, child: Node): [Updates, Array<number>] => {
  const childId = nodeIdContainer.getOrAddNode(child);
  const targetId = nodeIdContainer.getId(target)!;
  const targetUpdate: ReconciliationUpdate = {
    nodeId: targetId,
    type: nodeIdContainer.isRoot(target)
        ? "root"
        : target.nodeName.toLowerCase(),
    childUpdates: [
      {
        op: "set",
        childIdx: calculateChildIdx(child),
        childId
      }
    ]
  };
  // TODO: handle other node types https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
  const attrs: Array<Attr> = child.nodeType === Node.ELEMENT_NODE
                           ? Array.from((child as Element).attributes)
                           : [];
  const propUpdates: Array<ReconciliationPropUpdate> = attrs.map(
    attr => ({
      op: "set",
      prop: attr.name === 'class' ? 'className' : attr.name,
      value: attr.value
    })
  );
  const childUpdate: ReconciliationUpdate = child.nodeType === Node.TEXT_NODE
    ? {
      nodeId: childId,
      type: "text",
      textUpdate: {
        text: child.textContent || ''
      }
    } : {
      nodeId: childId,
      type: child.nodeName.toLowerCase(),
      propUpdates
    };
  const ourUpdates: Updates = {
    [targetId]: targetUpdate,
    [childId]: childUpdate
  };
  const children: Array<Node> = Array.from(child.childNodes);
  const [updates, order] = children.reduce(
    ([updates, order], grandchild) => {
      const [treeUpdates, treeOrder] = getTreeUpdates(nodeIdContainer, child, grandchild);
      return [mergeUpdates(updates, treeUpdates), order.concat(treeOrder)];
    },
    [ourUpdates, []] as [Updates, Array<number>]
  );
  return [updates, order.concat([childId, targetId])];
};

const registerPlugin = async (pluginFactory: PluginFactory) => {
  const {
    hostOrigin,
    exposedComponentsList,
    ...pluginConfig
  } = await browserData();
  const plugin = pluginFactory({
    ...pluginConfig,
    exposedComponents: makeExposedComponents(exposedComponentsList),
  });
  const pluginBridge: PluginBridge = await initializePluginBridge(hostOrigin, onRender);

  function onRender(rootId: RenderRootId, props: Props) {
    const root = document.createElement('div');
    document.body.appendChild(root);

    const nodeIdContainer = new NodeIdContainer();
    nodeIdContainer.addNode(root);
    const obs = new MutationObserver((mutationList, observer) => {
      const [updates, order] = mutationList.reduce(
        ([updatesById, order], {type, target, addedNodes}) => {
          const added = Array.from(addedNodes);
          return added.reduce(
            ([updates, order], node) => {
              const [treeUpdates, treeOrder] = getTreeUpdates(nodeIdContainer, target, node);
              return [mergeUpdates(updates, treeUpdates), order.concat(treeOrder)];
            },
            [updatesById, order]
          );
        },
        [{}, []] as [Updates, Array<number>]
      );
      const orderKeys = new Set<number>(order);
      const nonOrderedKeys = Object.keys(updates).map(id => +id).filter(id => !orderKeys.has(id));
      const allKeys = order.concat(Array.from(nonOrderedKeys));
      const [orderedUpdates, _] = allKeys.reduce(
        ([ups, seen], k) => {
          const useK = !seen.has(k);
          seen.add(k);
          if ( useK ) {
            return [ups.concat([updates[k]]), seen];
          }

          return [ups, seen];
        },
        [[], new Set<number>()] as [Array<ReconciliationUpdate>, Set<number>]
      );
      pluginBridge.reconcile(rootId, orderedUpdates);
      console.log(mutationList);
    });

    obs.observe(
      root,
      {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true
      }
    );

    ReactDOM.render(
      React.createElement(plugin, props),
      root
    );
  }
};

export { registerPlugin };
