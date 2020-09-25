import React from "react";
import {
  initializeHostBridge,
  registerFromBridgeProxyHandler,
} from "@pluginsdotdev/bridge";
import { applyUpdates, emptyRootNode } from "./update-utils";
import { registerHandler } from "./synthetic-event-bridge-proxy";
import { sanitizeProps } from "./sanitize-props";

import type { ComponentType } from "react";
import type {
  HostId,
  RenderRootId,
  ReconciliationUpdate,
  HostBridge,
  NodeId,
} from "@pluginsdotdev/bridge";
import type { Node, RootNode } from "./update-utils";

registerHandler();

const isHostComponent = (type: string) => type.startsWith("host:");
const hostComponentName = (type: string) => type.replace(/^host:/, "");

const getNodeType = (
  exposedComponents: Record<string, ComponentType>,
  nodeType: string
) => {
  if (nodeType === "root" || nodeType === "text") {
    return React.Fragment;
  }

  if (isHostComponent(nodeType)) {
    const cName = hostComponentName(nodeType);
    const HostComponent = exposedComponents[cName];
    if (HostComponent) {
      return HostComponent;
    }

    // TODO: log?
  }

  return nodeType;
};

type NodeComponentProps = {
  node: Node | undefined;
  nodesById: Map<NodeId, Node>;
  exposedComponents?: Record<string, ComponentType>;
  hostId: HostId;
  pluginUrl: string;
};
const NodeComponent: React.FC<NodeComponentProps> = ({
  node,
  nodesById,
  exposedComponents,
  hostId,
  pluginUrl,
}) => {
  if (!node) {
    return null;
  }

  const nodeType = getNodeType(exposedComponents ?? {}, node.type);

  return React.createElement(
    nodeType,
    sanitizeProps(hostId, pluginUrl, node.props),
    node.text ??
      node.children.map((childId: NodeId) =>
        React.createElement(NodeComponent, {
          key: childId,
          node: nodesById.get(childId),
          nodesById,
          exposedComponents,
          hostId,
          pluginUrl,
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

    const { exposedComponents, hostId, pluginUrl } = this.props;

    return React.createElement(NodeComponent, {
      node: rootNode,
      nodesById: rootNode.nodesById,
      exposedComponents,
      hostId,
      pluginUrl,
    });
  }
}

export { PluginPoint };
