import type {
  NodeId,
  ReconciliationUpdate,
  ReconciliationSetPropUpdate,
  ReconciliationDeletePropUpdate,
  ReconciliationSetChildUpdate,
  ReconciliationDeleteChildUpdate,
} from "@pluginsdotdev/bridge";

export interface Node {
  id: NodeId;
  type: string;
  text?: string;
  children: NodeId[];
  props: Record<string, any>;
}

export interface RealizedNode {
  id: NodeId;
  type: string;
  text?: string;
  children: RealizedNode[];
  props: Record<string, any>;
}

export type RootNode = Node & { nodesById: Map<NodeId, Node> };

const rootId = 0;

const emptyRootNode = () => ({
  id: rootId,
  type: "root",
  props: {},
  children: [],
  nodesById: new Map<NodeId, Node>(),
});

const exhaustive = (x: never): never => x;

const applyUpdates = (
  rootNode: RootNode,
  updates: ReconciliationUpdate[]
): RootNode =>
  updates.reduce((rootNode: RootNode, update: ReconciliationUpdate) => {
    const { nodesById } = rootNode;
    const isRoot = update.nodeId === rootId;
    if (!isRoot && !nodesById.has(update.nodeId)) {
      nodesById.set(update.nodeId, {
        id: update.nodeId,
        type: update.type,
        children: [],
        props: {},
      });
    }

    const node = Object.assign(
      {},
      isRoot ? rootNode : nodesById.get(update.nodeId)!
    );

    if (update.propUpdates) {
      node.props = update.propUpdates.reduce((props, update) => {
        if (update.op === "set") {
          props[update.prop] = update.value;
        } else if (update.op === "delete") {
          delete props[update.prop];
        } else {
          // TODO: exhaustive(update.op);
        }
        return props;
      }, Object.assign({}, node.props));
    }

    if (update.childUpdates) {
      // TODO: this doesn't work. need to process in-order due to ids
      node.children = update.childUpdates.reduce((children, update) => {
        if (update.op === "set") {
          children[update.childIdx] = update.childId;
        } else if (update.op === "delete") {
          const idx = children.findIndex((c) => c === update.childId);
          children.splice(idx, 1);
        } else {
          // TODO: exhaustive(update.op);
        }
        return children;
      }, node.children.slice());
    }

    if (update.textUpdate) {
      node.text = update.textUpdate.text;
    }

    nodesById.set(node.id, node);
    return {
      ...(isRoot ? node : rootNode),
      nodesById,
    };
  }, rootNode);

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
