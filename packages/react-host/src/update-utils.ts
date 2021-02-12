import { extractStyleVariables } from "@pluginsdotdev/style-utils";

import type {
  EventHandler,
  EventOptions,
  NodeId,
  ReconciliationUpdate,
  ReconciliationSetPropUpdate,
  ReconciliationDeletePropUpdate,
  ReconciliationSetChildUpdate,
  ReconciliationDeleteChildUpdate,
} from "@pluginsdotdev/bridge";

import type { VarBindings } from "@pluginsdotdev/style-utils";
import type { StyleSheetRules } from "@pluginsdotdev/style-types";

type BaseEventConfig = {
  eventType: string;
  eventOptions: {
    capture?: boolean;
    passive?: boolean;
  };
};

export type NodeEventConfig = BaseEventConfig & {
  handler: (this: HTMLElement, event: Event) => void;
};

export interface Node {
  id: NodeId;
  type: string;
  text?: string;
  children: Array<NodeId>;
  handlers: Array<NodeEventConfig>;
  props: Record<string, any>;
}

export interface RealizedNode {
  id: NodeId;
  type: string;
  text?: string;
  children: RealizedNode[];
  props: Record<string, any>;
}

export type RootNode = Node & {
  nodesById: Map<NodeId, Node>;
  cssVarBindings: Map<string, string>;
};

const rootId = "" + 0;

const emptyRootNode = () => ({
  id: rootId,
  type: "root",
  props: {},
  children: [],
  handlers: [],
  nodesById: new Map<NodeId, Node>(),
  cssVarBindings: new Map<string, string>(),
});

const exhaustive = (x: never): never => x;

export const eventConfigsMatch = (
  a: BaseEventConfig,
  b: BaseEventConfig
): boolean =>
  a.eventType === b.eventType &&
  (a.eventOptions || {}).capture === (b.eventOptions || {}).capture &&
  (a.eventOptions || {}).passive === (b.eventOptions || {}).passive;

const makeHandler = (
  nodeId: NodeId,
  opts: EventOptions,
  handler: EventHandler
) =>
  function (event: Event) {
    if (!opts.passive) {
      event.preventDefault();
    }
    handler(nodeId, event.type, event);
  };

const deleteDescendants = (
  nodesById: Map<NodeId, Node>,
  saved: Set<NodeId>,
  id: NodeId
): void => {
  if (saved.has(id)) {
    return;
  }

  const node = nodesById.get(id);
  if (!node) {
    return;
  }

  nodesById.delete(id);
  node.children.forEach((childId) => {
    deleteDescendants(nodesById, saved, childId);
  });
};

const applyUpdates = (
  rootNode: RootNode,
  updates: ReconciliationUpdate[]
): RootNode => {
  const addedChildren = updates.reduce((added, update) => {
    if (update.childUpdates) {
      update.childUpdates.forEach((update) => {
        if (update.op === "set") {
          added.add(update.childId);
        }
      });
    }
    return added;
  }, new Set<NodeId>());

  return updates.reduce((rootNode: RootNode, update: ReconciliationUpdate) => {
    const { nodesById, cssVarBindings } = rootNode;
    const { nodeId } = update;
    const isRoot = nodeId === rootId;
    if (!isRoot && !nodesById.has(nodeId)) {
      nodesById.set(nodeId, {
        id: nodeId,
        type: update.type,
        children: [],
        handlers: [],
        props: {},
      });
    }

    const node = Object.assign({}, isRoot ? rootNode : nodesById.get(nodeId)!);

    if (update.propUpdates) {
      node.props = update.propUpdates.reduce((props, update) => {
        const prop = update.prop === "class" ? "className" : update.prop;
        if (update.op === "set") {
          props[prop] = update.value;
        } else if (update.op === "delete") {
          delete props[prop];
        } else {
          // TODO: exhaustive(update.op);
        }
        return props;
      }, Object.assign({}, node.props));

      if (node.type === "style" || node.type === "link") {
        const style = update.propUpdates.find((p) => p.prop === "stylesheet");
        if (style) {
          const varBindings = extractStyleVariables(
            style.value as StyleSheetRules
          );
          Object.keys(varBindings).forEach((varName) => {
            cssVarBindings.set(varName, varBindings[varName]);
          });
        }
      }
    }

    if (update.childUpdates) {
      node.children = update.childUpdates.reduce((children, update) => {
        if (update.op === "set") {
          children[update.childIdx] = update.childId;
        } else if (update.op === "delete") {
          deleteDescendants(nodesById, addedChildren, update.childId);
          const idx = children.findIndex((c) => c === update.childId);
          if (idx >= 0) {
            // we can't guarantee the order of replacements vs deletes
            // so we may not have the deleted child in our child list
            // anymore. if we do, delete it.
            children.splice(idx, 1);
          }
        } else {
          // TODO: exhaustive(update.op);
        }
        return children;
      }, node.children.slice());
    }

    if (update.handlerUpdates) {
      node.handlers = update.handlerUpdates.reduce((handlers, update) => {
        if (update.op === "set") {
          handlers.push({
            eventType: update.eventType,
            eventOptions: update.eventOptions,
            handler: makeHandler(nodeId, update.eventOptions, update.handler),
          });
        } else if (update.op === "delete") {
          handlers = handlers.filter((h) => !eventConfigsMatch(h, update));
        } else {
          // TODO: exhaustive(update.op);
        }
        return handlers;
      }, node.handlers.slice());
    }

    if (update.textUpdate) {
      node.text = update.textUpdate.text;
    }

    nodesById.set(node.id, node);
    return {
      ...(isRoot ? node : rootNode),
      nodesById,
      cssVarBindings,
    };
  }, rootNode);
};

const realizeTree = (
  nodesById: Map<NodeId, Node>,
  { id, type, text, props, children }: Node
): RealizedNode => ({
  ...(text ? { text } : {}),
  id,
  type,
  props,
  children: children.map((c) => realizeTree(nodesById, nodesById.get(c)!)),
});

export { applyUpdates, realizeTree, emptyRootNode };
