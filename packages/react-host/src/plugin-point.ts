import React, { useRef, useEffect } from "react";
import url from "url";
import {
  initializeHostBridge,
  registerFromBridgeProxyHandler,
} from "@pluginsdotdev/bridge";
import { applyUpdates, emptyRootNode } from "./update-utils";
import { registerHandler as registerEventHandler } from "./event-bridge-proxy";
import { registerHandler as registerSyntheticEventHandler } from "./synthetic-event-bridge-proxy";
import { sanitizeProps, safePrefix } from "./sanitize-props";
import { isValidElement } from "./sanitize-element";
import { domainFromUrl } from "./domain-utils";

import type { ComponentType, RefAttributes } from "react";
import type {
  HostId,
  RenderRootId,
  ReconciliationUpdate,
  HostBridge,
  NodeId,
} from "@pluginsdotdev/bridge";
import type { Node, RootNode } from "./update-utils";

// ok that this is global since each EventTarget is only in a single NodeId namespace
const nodeIdByNode = new WeakMap<EventTarget, NodeId>();

registerEventHandler(nodeIdByNode);
registerSyntheticEventHandler();

const isHostComponent = (type: string) => type.startsWith("host:");
const hostComponentName = (type: string) => type.replace(/^host:/, "");

const getNodeType = (
  exposedComponents: Record<string, ComponentType>,
  nodeType: string
) => {
  if (nodeType === "root") {
    // TODO: root should return Fragment but need to attach event handlers to
    //       the PluginPoint itself
    return "div";
  }

  if (nodeType === "text") {
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
  pluginPoint: string;
  pluginDomain: string;
  pluginUrl: string;
};
const NodeComponent: React.FC<NodeComponentProps> = ({
  node,
  nodesById,
  exposedComponents,
  hostId,
  pluginPoint,
  pluginDomain,
  pluginUrl,
}) => {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !node) {
      return;
    }

    nodeIdByNode.set(el, node.id);

    node.handlers.forEach((h) => {
      el.addEventListener(
        h.eventType as keyof GlobalEventHandlersEventMap,
        h.handler,
        h.eventOptions
      );
    });
  }, [node && node.handlers]);

  if (!node) {
    return null;
  }

  const nodeType = getNodeType(exposedComponents ?? {}, node.type);
  const isHtmlElement = typeof nodeType === "string";
  const valid = isHtmlElement ? isValidElement(nodeType as string) : true;

  if (!valid) {
    // TODO: log to server
    return null;
  }

  // TODO: set allowedStyleValues and requiredPropsForTag based on host config
  const sanitizedProps = isHtmlElement
    ? sanitizeProps({
        hostId,
        pluginPoint,
        pluginDomain,
        pluginUrl,
        tagName: node.type,
        props: node.props,
      })
    : node.props;

  const contents =
    node.text ??
    node.children.map((childId: NodeId) =>
      React.createElement(NodeComponent, {
        key: childId,
        node: nodesById.get(childId),
        nodesById,
        exposedComponents,
        hostId,
        pluginPoint,
        pluginDomain,
        pluginUrl,
      })
    );

  const props: RefAttributes<HTMLElement> =
    typeof nodeType === "string"
      ? {
          ...sanitizedProps,
          ref,
        }
      : sanitizedProps;

  return React.createElement(nodeType, props, contents);
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
      props: { hostId, pluginUrl, pluginPoint, props },
    } = this;

    const { search: _, ...parsedPluginUrl } = url.parse(pluginUrl, true);
    const pluginUrlWithParams = url.format({
      ...parsedPluginUrl,
      query: {
        ...parsedPluginUrl.query,
        idPrefix: safePrefix(pluginPoint, domainFromUrl(pluginUrl)),
      },
    });

    initializeHostBridge(hostId, this.onReconcile.bind(this))
      .then((bridgeMaker) => bridgeMaker(pluginUrlWithParams))
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

    const { exposedComponents, hostId, pluginPoint, pluginUrl } = this.props;
    const pluginDomain = domainFromUrl(pluginUrl);

    return React.createElement(NodeComponent, {
      node: rootNode,
      nodesById: rootNode.nodesById,
      exposedComponents,
      hostId,
      pluginPoint,
      pluginDomain,
      pluginUrl,
    });
  }
}

export { PluginPoint };
