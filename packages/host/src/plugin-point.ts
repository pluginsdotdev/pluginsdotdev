import React from "react";
import { initializeHostBridge } from "@pluginsdotdev/bridge";
import { applyUpdates, emptyRootNode } from "./update-utils";

import type { ComponentType } from "react";
import type {
  HostId,
  RenderRootId,
  ReconciliationUpdate,
  HostBridge,
  NodeId,
} from "@pluginsdotdev/bridge";
import type { Node, RootNode } from "./update-utils";

export interface PluginPointProps<P> {
  hostId: HostId;
  pluginPoint: string;
  jwt: string;
  pluginUrl: string;
  exposedComponents?: Record<string, ComponentType>;
  props: P;
}

type NodeComponentProps = {
  node: Node | undefined;
  nodesById: Map<NodeId, Node>;
};
const NodeComponent: React.FC<NodeComponentProps> = ({ node, nodesById }) => {
  if (!node) {
    return null;
  }

  const nodeType =
    node.type === "root" || node.type === "text" ? React.Fragment : node.type;

  return React.createElement(
    nodeType,
    node.props,
    node.text ??
      node.children.map((childId: NodeId) =>
        React.createElement(NodeComponent, {
          key: childId,
          node: nodesById.get(childId),
          nodesById,
        })
      )
  );
};

const PluginPoint = <P extends {}>(props: PluginPointProps<P>) => {
  const [bridge, setBridge] = React.useState<HostBridge | null>(null);
  const root = emptyRootNode();
  const rootId = 1;
  const [rootNodesById, setRootNodesById] = React.useState<
    Record<RenderRootId, RootNode>
  >({ [rootId]: root });

  const onReconcile = (
    rootId: RenderRootId,
    updates: ReconciliationUpdate[]
  ) => {
    const rootNode = rootNodesById[rootId];
    if (!rootNode) {
      // TODO: log?
      return;
    }
    setRootNodesById({
      ...rootNodesById,
      [rootId]: applyUpdates(rootNode, updates),
    });
  };

  React.useEffect(() => {
    initializeHostBridge(props.hostId, onReconcile)
      .then((bridgeMaker) => bridgeMaker(props.pluginUrl))
      .then((bridge) => {
        setBridge(bridge);
        bridge.render(rootId, props.props);
      });
  }, [props.hostId, props.pluginUrl]);

  React.useEffect(() => {
    if (bridge) {
      bridge.render(rootId, props.props);
    }
  }, [props.props]);

  const rootNode = rootNodesById[rootId];
  if (!rootNode) {
    return null;
  }

  return React.createElement(NodeComponent, {
    node: rootNode,
    nodesById: rootNode.nodesById,
  });
};

export { PluginPoint };
