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

import type { ComponentType, RefAttributes, ReactNode, RefObject } from "react";
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
const isShadowComponent = (type: string) => type.startsWith("shadow:");
const isRootComponent = (type: string) => type === "root";
const shadowComponentName = (type: string) => type.replace(/^shadow:/, "");

const resolveElement = (
  exposedComponents: Record<string, ComponentType>,
  nodeType: string
): React.ComponentType | string => {
  if (isRootComponent(nodeType)) {
    // TODO: root should return Fragment but need to attach event handlers to
    //       the PluginPoint itself
    return "span";
  }

  if (nodeType === "text") {
    return React.Fragment;
  }

  if (isShadowComponent(nodeType)) {
    return resolveElement(exposedComponents, shadowComponentName(nodeType));
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

const needShadowRoot = (nodeType: string): boolean =>
  isRootComponent(nodeType) || isShadowComponent(nodeType);

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

      if (typeof ref === "function") {
        ref(el);
      } else if (ref) {
        ref.current = el;
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

const eventConfigSetDiff = (
  all: Array<NodeEventConfig>,
  toRemove: Array<NodeEventConfig>
): Array<NodeEventConfig> =>
  all.filter(
    (a) =>
      !toRemove.find((r) => eventConfigsMatch(a, r) && a.handler === r.handler)
  );

const useEventHandlerWiring = (node: Node | undefined) => {
  const ref = useRef<HTMLElement>(null);
  const prevHandlers = useRef<Array<NodeEventConfig>>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !node) {
      return;
    }

    nodeIdByNode.set(el, node.id);

    const existingHandlers = prevHandlers.current;
    const handlersToDelete = eventConfigSetDiff(
      existingHandlers,
      node.handlers
    );
    const handlersToAdd = eventConfigSetDiff(node.handlers, existingHandlers);

    handlersToDelete.forEach((h) => {
      el.removeEventListener(
        h.eventType as keyof GlobalEventHandlersEventMap,
        h.handler,
        h.eventOptions
      );
    });

    handlersToAdd.forEach((h) => {
      el.addEventListener(
        h.eventType as keyof GlobalEventHandlersEventMap,
        h.handler,
        h.eventOptions
      );
    });
    prevHandlers.current = node.handlers || [];
  }, [node && node.id, node && node.handlers]);

  return ref;
};

const useCustomCanvasHydrator = (
  node: Node | undefined,
  ref: RefObject<Element>
) => {
  useEffect(() => {
    if (!node) {
      return;
    }

    const canvas = ref.current as HTMLCanvasElement;
    if (!canvas || canvas.nodeName !== "CANVAS") {
      return;
    }

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = node.props.src;
  }, [node]);
};

const useCustomHydrator = (node: Node | undefined, ref: RefObject<Element>) => {
  useCustomCanvasHydrator(node, ref);
};

type HostConfig = {
  scriptNonce?: string;
  styleNonce?: string;
};

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
  hostConfig: HostConfig;
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
  hostConfig,
}) => {
  const ref = useEventHandlerWiring(node);
  const useShadow = node && needShadowRoot(node.type);
  useCustomHydrator(node, ref);

  if (!node) {
    return null;
  }

  const isRoot = isRootComponent(node.type);
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
      { nonce: hostConfig.styleNonce },
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
          {
            key: "css-var-reset",
            nonce: hostConfig.styleNonce,
          },
          `:host {
        ${Array.from(cssVarBindings)
          .map(([varName, value]) => `${varName}: ${value};`)
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
          hostConfig,
        })
      );

  const props: any =
    typeof nodeType === "string"
      ? {
          ...sanitizedProps,
          ref,
        }
      : sanitizeProps;

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
  hostConfig?: HostConfig;
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
      props: { hostId, pluginUrl, pluginPoint, props, hostConfig },
    } = this;

    const { search: _, ...parsedPluginUrl } = url.parse(pluginUrl, true);
    const pluginUrlWithParams = url.format({
      ...parsedPluginUrl,
      query: {
        ...parsedPluginUrl.query,
        idPrefix: safePrefix(pluginPoint, domainFromUrl(pluginUrl)),
      },
    });

    initializeHostBridge(hostId, hostConfig, this.onReconcile.bind(this))
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

    const {
      exposedComponents,
      hostId,
      pluginPoint,
      pluginUrl,
      hostConfig,
    } = this.props;
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
      hostConfig: hostConfig || {},
    });
  }
}

export { PluginPoint };
