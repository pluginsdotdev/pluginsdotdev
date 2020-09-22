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

export interface PluginPointProps<P> {
  hostId: HostId;
  pluginPoint: string;
  jwt: string;
  pluginUrl: string;
  exposedComponents?: Record<string, ComponentType>;
  props: P & { [key: string]: any };
}

interface PluginPointState {
  bridge: HostBridge | null;
  rootNodesById: Record<RenderRootId, RootNode>;
}

const rootId = 0;

class PluginPoint<P> extends React.Component<PluginPointProps<P>> {
  state: PluginPointState = {
    bridge: null,
    rootNodesById: { [rootId]: emptyRootNode() },
  };

  onReconcile(rootId: RenderRootId, updates: ReconciliationUpdate[]) {
    const { rootNodesById } = this.state;
    const rootNode = rootNodesById[rootId];
    if (!rootNode) {
      // TODO: log?
      return;
    }
    this.setState({
      rootNodesById: {
        ...rootNodesById,
        [rootId]: applyUpdates(rootNode, updates),
      },
    });
  }

  componentDidMount() {
    // TODO: re-run if pluginUrl or hostId changes??
    const {
      props: { hostId, pluginUrl, props },
    } = this;
    initializeHostBridge(hostId, this.onReconcile.bind(this))
      .then((bridgeMaker) => bridgeMaker(pluginUrl))
      .then((bridge) => {
        this.setState({ bridge });
        bridge.render(rootId, props);
      });
  }

  componentDidUpdate({ props: prevProps }: PluginPointProps<P>) {
    const { props } = this.props;
    const { bridge } = this.state;
    const keys = new Set(Object.keys(prevProps).concat(Object.keys(props)));
    const changed = Array.from(keys).reduce((changed: boolean, key: string) => {
      const newP = props[key];
      const oldP = prevProps[key];
      return changed || newP !== oldP;
    }, false);
    if (changed && bridge) {
      bridge.render(rootId, props);
    }
  }

  render() {
    const rootNode = this.state.rootNodesById[rootId];
    if (!rootNode) {
      return null;
    }

    return React.createElement(NodeComponent, {
      node: rootNode,
      nodesById: rootNode.nodesById,
    });
  }
}

export { PluginPoint };
