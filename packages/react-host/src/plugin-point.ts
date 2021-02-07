import React, { useRef, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import url from "url";
import {
  initializeHostBridge,
  registerFromBridgeProxyHandler,
} from "@pluginsdotdev/bridge";
import { getStyleSheetRulesStringifier } from "@pluginsdotdev/style-utils";
import {
  isValidElement,
  sanitizeProps,
  safePrefix,
  domainFromUrl,
} from "@pluginsdotdev/sanitizers";
import { applyUpdates, emptyRootNode, eventConfigsMatch } from "./update-utils";
import { registerHandler as registerEventHandler } from "./event-bridge-proxy";
import { registerHandler as registerSyntheticEventHandler } from "./synthetic-event-bridge-proxy";

import type { ComponentType, RefAttributes, ReactNode } from "react";
import type {
  HostId,
  RenderRootId,
  ReconciliationUpdate,
  HostBridge,
  NodeId,
} from "@pluginsdotdev/bridge";
import type { StyleSheetRulesStringifier } from "@pluginsdotdev/style-utils";
import type { StyleSheetRules } from "@pluginsdotdev/style-types";
import type { Node, RootNode, NodeEventConfig } from "./update-utils";

// ok that this is global since each EventTarget is only in a single NodeId namespace
const nodeIdByNode = new WeakMap<EventTarget, NodeId>();

registerEventHandler(nodeIdByNode);
registerSyntheticEventHandler();

const isHostComponent = (type: string) => type.startsWith("host:");
const hostComponentName = (type: string) => type.replace(/^host:/, "");

const resolveElement = (
  exposedComponents: Record<string, ComponentType>,
  nodeType: string
): React.ComponentType | string => {
  if (nodeType === "root") {
    // TODO: root should return Fragment but need to attach event handlers to
    //       the PluginPoint itself
    return "span";
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

const needShadowRoot = (nodeType: string): boolean => nodeType === "root";

const memoized = <A extends string | number, R>(
  cache: Record<A, R>,
  fn: (arg: A) => R
): ((arg: A) => R) => (arg: A) => {
  if (!cache[arg]) {
    cache[arg] = fn(arg);
  }
  return cache[arg];
};

// TODO: I don't care what type of component it is or how it was created.
//       I only care that it can be passed to createElement. Why is this so hard?
type AnyReactComponent = any;

const withShadowDOMCache: Record<string, AnyReactComponent> = {};
const withShadowDOM = memoized(withShadowDOMCache, (C: string) =>
  React.forwardRef<HTMLElement, any>(({ children, ...props }, ref) => {
    const shadowRef = useRef<HTMLElement>(null);
    const [root, setRoot] = useState<ShadowRoot | null>(null);
    useEffect(() => {
      const el = shadowRef.current;

      if (ref && typeof ref === "function") {
        ref(el);
      }

      if (!el || root) {
        return;
      }

      setRoot(el.attachShadow({ mode: "open" }));
    }, [root]);

    return React.createElement(
      C,
      { ...props, ref: shadowRef },
      root
        ? ReactDOM.createPortal(
            React.createElement(React.Fragment, {}, children),
            (root as any) as HTMLElement
          )
        : null
    );
  })
);

type NodeComponentProps = {
  node: Node | undefined;
  nodesById: Map<NodeId, Node>;
  cssVarBindings: Map<string, string>;
  exposedComponents?: Record<string, ComponentType>;
  hostId: HostId;
  pluginPoint: string;
  pluginDomain: string;
  pluginUrl: string;
  isPluginRoot: boolean;
};
const NodeComponent: React.FC<NodeComponentProps> = ({
  node,
  nodesById,
  cssVarBindings,
  exposedComponents,
  hostId,
  pluginPoint,
  pluginDomain,
  pluginUrl,
  isPluginRoot,
}) => {
  const ref = useRef<HTMLElement>(null);
  const prevHandlers = useRef<Array<NodeEventConfig>>([]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !node) {
      return;
    }

    nodeIdByNode.set(el, node.id);

    const existingHandlers = prevHandlers.current;
    const handlersToDelete = existingHandlers.filter(
      (existing) =>
        !node.handlers.find(
          (h) =>
            eventConfigsMatch(h, existing) && h.handler === existing.handler
        )
    );

    handlersToDelete.forEach((h) => {
      el.removeEventListener(
        h.eventType as keyof GlobalEventHandlersEventMap,
        h.handler,
        h.eventOptions
      );
    });

    node.handlers.forEach((h) => {
      el.addEventListener(
        h.eventType as keyof GlobalEventHandlersEventMap,
        h.handler,
        h.eventOptions
      );
    });
    prevHandlers.current = node.handlers || [];
  }, [node && node.handlers]);
  const useShadow = node && needShadowRoot(node.type);

  if (!node) {
    return null;
  }

  const isRoot = node.type === "root";
  const nodeType = resolveElement(exposedComponents ?? {}, node.type);
  const isHtmlElement = typeof nodeType === "string";
  const valid = isHtmlElement ? isValidElement(nodeType as string) : true;

  if (nodeType === "style") {
    const stylesheetRulesToString = getStyleSheetRulesStringifier({
      pluginDomain,
      pluginUrl,
      isPluginRoot,
      allowedStyleValues: {},
    });
    return React.createElement(
      "style",
      {},
      stylesheetRulesToString(node.props.stylesheet as StyleSheetRules)
    );
  }

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

  // since css variables leak across the shadow dom boundary, we reset
  // them to prevent accidental information leakage
  const cssVarReset: ReactNode =
    isRoot && cssVarBindings.size
      ? React.createElement(
          "style",
          { key: "css-var-reset" },
          `:host {
        ${Array.from(cssVarBindings)
          .map(([varName, value]) => `${varName}: ${value}`)
          .join("\n")}
      }`
        )
      : null;

  const contents: Array<ReactNode> = node.text
    ? [node.text]
    : node.children.map((childId: NodeId) =>
        React.createElement(NodeComponent, {
          key: childId,
          node: nodesById.get(childId),
          nodesById,
          cssVarBindings,
          exposedComponents,
          hostId,
          pluginPoint,
          pluginDomain,
          pluginUrl,
          isPluginRoot: useShadow ? isRoot : isPluginRoot,
        })
      );

  const props: RefAttributes<HTMLElement> =
    typeof nodeType === "string"
      ? {
          ...sanitizedProps,
          ref,
        }
      : sanitizedProps;

  const children: Array<ReactNode> = (cssVarReset ? [cssVarReset] : []).concat(
    contents
  );

  return React.createElement(
    useShadow ? withShadowDOM(nodeType as string) : nodeType,
    props,
    children.length ? children : null
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
      cssVarBindings: rootNode.cssVarBindings,
      exposedComponents,
      hostId,
      pluginPoint,
      pluginDomain,
      pluginUrl,
      isPluginRoot: true,
    });
  }
}

export { PluginPoint };
