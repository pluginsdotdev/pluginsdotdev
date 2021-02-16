import { initializePluginBridge } from "@pluginsdotdev/bridge";
import { extractStylesheetRules } from "@pluginsdotdev/style-utils";
import { setupPluginEnvironment } from "./setup-plugin-environment";
import { getEventProxyHandler } from "./event-proxy-handler";
import { isCustomElement } from "./is-custom-element";
import { browserData } from "./browser-data";

import type {
  Bridge,
  ProxyId,
  PluginBridge,
  Props,
  EventHandler,
  NodeId,
  RenderRootId,
  ReconciliationUpdate,
  ReconciliationPropUpdate,
  ReconciliationHandlerUpdate,
  ReconciliationSetPropUpdate,
  ReconciliationDeletePropUpdate,
} from "@pluginsdotdev/bridge";
import type { QueueHandlerUpdate, GetNodeById } from "./types";
import type { ExposedComponents } from "./browser-data";

interface PluginConfig {
  pluginId: string;
  hostId: string;
  userId: string;
  exposedComponents: ExposedComponents;
}

type PluginFactory = (
  pluginConfig: PluginConfig
) => (props: Props, container: Element | DocumentFragment) => void;

const hostComponentAttr = `data-pluginsdotdev-host-component-${Math.floor(
  Math.random() * 10000
)}`;

const hostComponentPropsAttr = `data-pluginsdotdev-host-component-props-${Math.floor(
  Math.random() * 10000
)}`;

const hostComponentOldPropsAttr = `data-pluginsdotdev-host-component-old-props-${Math.floor(
  Math.random() * 10000
)}`;

const nodeIdAttr = `data-pluginsdotdev-node-id-${Math.floor(
  Math.random() * 10000
)}`;

const ignoredAttrs = new Set<string>([hostComponentAttr, nodeIdAttr, "is"]);

const makeExposedComponents = (
  exposedComponentsList: Array<keyof ExposedComponents>
): ExposedComponents =>
  exposedComponentsList.reduce((exposedComponents, component) => {
    const type = "div";
    const hostProps: Record<string, string> = {
      [hostComponentAttr]: component,
    };
    exposedComponents[component] = {
      type,
      attrs: (props?: Record<string, any>) => ({
        ...hostProps,
        ...(props ? { [hostComponentPropsAttr]: props } : {}),
      }),
      el: (props: object) => {
        const el = document.createElement(type);
        (el as any)[hostComponentPropsAttr] = props;
        Object.keys(hostProps).forEach((prop) => {
          el.setAttribute(prop, hostProps[prop]);
        });
        return el;
      },
    };
    return exposedComponents;
  }, {} as ExposedComponents);

type PartialReconciliationUpdate = Omit<
  ReconciliationUpdate,
  "nodeId" | "type"
>;

const mergePartialUpdates = (
  a: PartialReconciliationUpdate | null | undefined,
  b: PartialReconciliationUpdate | null | undefined
): PartialReconciliationUpdate => {
  if (!a) {
    return b!;
  }

  if (!b) {
    return a!;
  }

  const textUpdate = a.textUpdate || b.textUpdate;
  const childUpdates = (a.childUpdates || []).concat(b.childUpdates || []);
  const propUpdates = (a.propUpdates || []).concat(b.propUpdates || []);
  const handlerUpdates = (a.handlerUpdates || []).concat(
    b.handlerUpdates || []
  );

  return {
    childUpdates,
    propUpdates,
    handlerUpdates,
    textUpdate,
  };
};

const mergeUpdates = (
  a: ReconciliationUpdate | null | undefined,
  b: ReconciliationUpdate | null | undefined
): ReconciliationUpdate => {
  if (a && b && (a.nodeId !== b.nodeId || a.type !== b.type)) {
    throw new Error("Can only merge updates for the same nodeId and type");
  }

  const partial = mergePartialUpdates(a, b);
  const either = (a || b)!;

  return {
    nodeId: either.nodeId,
    type: either.type,
    ...partial,
  };
};

// the globalEventHandlerQueue holds ReconciliationUpdates for events that are registered to
// nodes that have not yet been assigned a node id
const globalEventHandlerQueue = new WeakMap<
  Node,
  PartialReconciliationUpdate
>();

type Reconcile = (updates: Array<ReconciliationUpdate>) => Promise<void>;

type NodeHandle = (Node | ShadowRoot) & {
  _NodeHandle: true;
};

const getHostComponent = (el: HTMLElement): string | null =>
  el.getAttribute ? el.getAttribute(hostComponentAttr) : null;

const getHostComponentProps = (el: Element): Record<string, any> =>
  (el as any)[hostComponentPropsAttr] as Record<string, any>;

const nodeHandle = (node: Node): NodeHandle =>
  ((node as any).shadowRoot || node) as NodeHandle;

let nextId = 0;
class NodeIdContainer {
  private rootId: NodeId;
  private nodeToId = new WeakMap<NodeHandle, NodeId>();
  private reconcile: Reconcile;
  private queuedUpdates = new WeakMap<Node, ReconciliationUpdate>();
  private updateOrder: Array<Node> = [];
  private isFlushQueued: boolean = false;

  constructor(root: Node, reconcile: Reconcile) {
    this.reconcile = reconcile;
    this.rootId = this.addNode(root, "");
  }

  addNode(node: Node, parentContext: NodeId): NodeId {
    const id = `${!!parentContext ? parentContext + "." : ""}${nextId++}`;
    this.nodeToId.set(nodeHandle(node), id);
    const el = node as any;
    // attrHolder is the element or, if el is a document fragment, its host
    const attrHolder = el.setAttribute
      ? el
      : el?.host?.setAttribute
      ? el.host
      : null;
    if (attrHolder && attrHolder.setAttribute) {
      attrHolder.setAttribute(nodeIdAttr, "" + id);
    }
    return id;
  }

  getOrAddNode(node: Node, parentContext: NodeId): NodeId {
    const id = this.getId(node);
    return typeof id === "undefined" ? this.addNode(node, parentContext) : id;
  }

  getId(node: Node): NodeId | undefined {
    return this.nodeToId.get(nodeHandle(node));
  }

  isRoot(node: Node): boolean {
    return this.getId(node) === this.rootId;
  }

  hasNode(node: Node): boolean {
    return typeof this.getId(node) !== "undefined";
  }

  getNodeType(node: Node): string {
    if (this.isRoot(node)) {
      return "root";
    }

    if (node.nodeType === Node.TEXT_NODE) {
      return "text";
    }

    const el = node as HTMLElement;
    if (isCustomElement(el.localName)) {
      return "shadow:span";
    }

    const hostComponent = getHostComponent(el);
    if (hostComponent) {
      return `host:${hostComponent}`;
    }

    const nodeName = node.nodeName.toLowerCase();

    if (el.shadowRoot) {
      return `shadow:${nodeName}`;
    }

    return nodeName;
  }

  queueUpdate(
    node: Node,
    update: PartialReconciliationUpdate,
    parentContext: NodeId
  ) {
    const previouslyQueued = globalEventHandlerQueue.get(node);
    globalEventHandlerQueue.delete(node);

    const type = this.getNodeType(node);
    const fullUpdate = this.updateCreationHook(node, {
      ...mergePartialUpdates(update, previouslyQueued),
      nodeId: this.getOrAddNode(node, parentContext),
      type,
    });
    const existingUpdate = this.queuedUpdates.get(node);
    if (
      existingUpdate &&
      fullUpdate.childUpdates &&
      fullUpdate.childUpdates.length
    ) {
      // TODO: fix correctness in the general case
      // if our new update is adding children, we move ourselves back
      // in the ordering. this is not correct in general unless we ensure
      // that we never move behind any update that lists us as a child.
      this.updateOrder = this.updateOrder.filter((n) => n !== node);
      this.updateOrder.push(node);
    } else if (!existingUpdate) {
      this.updateOrder.push(node);
    }
    this.queuedUpdates.set(node, mergeUpdates(existingUpdate, fullUpdate));

    if (!this.isFlushQueued) {
      this.isFlushQueued = true;
      setTimeout(() => {
        this.isFlushQueued = false;
        this.flushUpdates();
      }, 10);
    }
  }

  updateCreationHook(
    node: Node,
    update: ReconciliationUpdate
  ): ReconciliationUpdate {
    if (node.nodeName === "CANVAS") {
      const canvas = node as HTMLCanvasElement;
      let url = canvas.toDataURL("image/png");
      update.propUpdates = (update.propUpdates || []).concat([
        {
          op: "set",
          prop: "src",
          value: url,
        },
      ]);

      const handle = setInterval(() => {
        if (!canvas.isConnected) {
          clearInterval(handle);
          return;
        }

        const newUrl = canvas.toDataURL("image/png");
        if (url === newUrl) {
          return;
        }
        url = newUrl;
        this.queueUpdate(
          node,
          {
            propUpdates: [
              {
                op: "set",
                prop: "src",
                value: url,
              },
            ],
          },
          ""
        );
      }, 32);
    }

    return update;
  }

  flushUpdates() {
    const orderedUpdates = this.updateOrder.map(
      (node) => this.queuedUpdates.get(node)!
    );
    this.queuedUpdates = new WeakMap<Node, ReconciliationUpdate>();
    this.updateOrder = [];
    if (orderedUpdates.length) {
      this.reconcile(orderedUpdates);
    }
  }
}

const nodeIdContainers = new Set<NodeIdContainer>();

const countNodeWidth = (node: Node): number => {
  if (node.nodeName !== "SLOT") {
    return 1;
  }

  const assigned = (node as HTMLSlotElement).assignedNodes({ flatten: true });
  return assigned.length;
};

const calculateChildIdx = (node: Node): number => {
  let childIdx = 0;
  let currentNode = node;
  while (currentNode.previousSibling !== null) {
    currentNode = currentNode.previousSibling;
    childIdx = childIdx + countNodeWidth(currentNode);
  }
  return childIdx;
};

type Observe = (node: Node | null) => void;

const propUpdatesForHostComponent = (
  el: Element
): Array<ReconciliationPropUpdate> => {
  const oldProps = ((el as any)[hostComponentOldPropsAttr] || {}) as Record<
    string,
    any
  >;
  const hostComponentProps = getHostComponentProps(el) || {};
  (el as any)[hostComponentOldPropsAttr] = hostComponentProps;
  const curPropNames: Array<string> = Object.keys(hostComponentProps);
  const oldPropNames: Array<string> = Object.keys(oldProps);
  const addedPropNames = curPropNames.filter(
    (n: string) => oldPropNames.indexOf(n) < 0
  );
  const removedPropNames = oldPropNames.filter(
    (n: string) => curPropNames.indexOf(n) < 0
  );
  return (addedPropNames.map((prop) => ({
    op: "set",
    prop,
    value: hostComponentProps[prop],
  })) as Array<ReconciliationPropUpdate>).concat(
    removedPropNames.map((prop) => ({
      op: "delete",
      prop,
    })) as Array<ReconciliationPropUpdate>
  );
};

const isIgnoredNodeType = (nodeType: number): boolean =>
  nodeType !== Node.ELEMENT_NODE &&
  nodeType !== Node.TEXT_NODE &&
  nodeType !== Node.DOCUMENT_NODE &&
  nodeType !== Node.DOCUMENT_FRAGMENT_NODE;

const isSlotted = (node: Node): boolean => !!(node as HTMLElement).assignedSlot;

const shouldIgnoreNode = (node: Node, isProcessingSlot: boolean): boolean =>
  // we ignore some node types
  isIgnoredNodeType(node.nodeType) ||
  // we also ignore slotted elements unless we're intentionally processing a slot
  (!isProcessingSlot && isSlotted(node));

const queueTreeUpdates = (
  observe: Observe,
  nodeIdContainer: NodeIdContainer,
  target: Node,
  child: Node,
  parentIdContext: NodeId = "",
  baseChildIdx: number = 0,
  processingSlot: boolean = false
): void => {
  if (shouldIgnoreNode(child, processingSlot)) {
    return;
  }

  if (child.nodeName === "SLOT") {
    const assigned = (child as HTMLSlotElement).assignedNodes({
      flatten: true,
    });
    assigned.forEach((a: Node) => {
      queueTreeUpdates(
        observe,
        nodeIdContainer,
        target,
        a,
        parentIdContext,
        calculateChildIdx(child),
        true
      );
    });
    return;
  }

  const childId = nodeIdContainer.getOrAddNode(child, parentIdContext);
  const targetId = nodeIdContainer.getId(target)!;
  const childIdx = baseChildIdx + calculateChildIdx(child);
  const targetUpdate: PartialReconciliationUpdate = {
    childUpdates: [
      {
        op: "set",
        childIdx,
        childId,
      },
    ],
  };

  const elChild = child as HTMLElement;
  const attrs: Array<Attr> =
    child.nodeType === Node.ELEMENT_NODE
      ? Array.from((child as Element).attributes)
      : [];
  const isHostComponent = getHostComponent(elChild);
  const propUpdates: Array<ReconciliationPropUpdate> =
    child.nodeName === "STYLE"
      ? [
          {
            op: "set",
            prop: "stylesheet",
            value: extractStylesheetRules((child as HTMLStyleElement).sheet),
          },
        ]
      : child.nodeName === "LINK"
      ? [
          {
            op: "set",
            prop: "stylesheet",
            value: extractStylesheetRules((child as HTMLLinkElement).sheet),
          },
        ]
      : isHostComponent
      ? propUpdatesForHostComponent(elChild)
      : attrs
          .filter((attr) => !ignoredAttrs.has(attr.name))
          .map((attr) => ({
            op: "set",
            prop: attr.name,
            value: attr.value,
          }));
  const childUpdate =
    child.nodeType === Node.TEXT_NODE
      ? {
          textUpdate: {
            text: child.textContent || "",
          },
        }
      : {
          propUpdates,
        };

  // queue children updates first
  const children: Array<Node> = Array.from(
    elChild.shadowRoot ? elChild.shadowRoot.childNodes : child.childNodes
  );
  const childContext = !!elChild.shadowRoot ? childId : parentIdContext;

  if (elChild.shadowRoot) {
    // need to monitor shadow roots individually
    // observe de-dupes for us
    observe(elChild.shadowRoot);
  }

  children.forEach((grandchild) =>
    queueTreeUpdates(observe, nodeIdContainer, child, grandchild, childContext)
  );

  // queue our updates
  nodeIdContainer.queueUpdate(child, childUpdate, parentIdContext);
  // TODO: not sure if parentIdContext is valid for target...
  //       but we never actually create an id here so doesn't matter
  nodeIdContainer.queueUpdate(target, targetUpdate, parentIdContext);
};

const queueRemovedUpdates = (
  nodeIdContainer: NodeIdContainer,
  target: Node,
  child: Node
): void => {
  const childId = nodeIdContainer.getId(child)!;
  // "" is ok as parentContext since we know we're removing (so already have an id)
  nodeIdContainer.queueUpdate(
    target,
    {
      childUpdates: [
        {
          op: "delete",
          childId,
        },
      ],
    },
    ""
  );
};

const renderRootById = new Map<RenderRootId, ShadowRoot>();

const isStyleNode = (node: Node | null): node is HTMLStyleElement =>
  node?.nodeName === "STYLE";

const getStyleUpdate = (
  style: HTMLStyleElement
): PartialReconciliationUpdate => ({
  propUpdates: [
    {
      op: "set",
      prop: "stylesheet",
      value: extractStylesheetRules(style.sheet),
    },
  ],
});

const constructRenderRootIfNeeded = (
  rootId: RenderRootId,
  pluginBridge: PluginBridge
): Element | ShadowRoot => {
  const prevRoot = renderRootById.get(rootId);
  if (prevRoot) {
    return prevRoot;
  }

  const rootEl = document.createElement("div");
  const root = rootEl.attachShadow({ mode: "open" });
  document.body.appendChild(rootEl);
  renderRootById.set(rootId, root);

  const nodeIdContainer = new NodeIdContainer(
    root,
    (updates: Array<ReconciliationUpdate>) =>
      pluginBridge.reconcile(rootId, updates)
  );
  nodeIdContainers.add(nodeIdContainer);

  const observerCfg = {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  };

  const obs = new MutationObserver((mutationList, observer) => {
    const observe = (node: Node | null) => {
      if (node) {
        observer.observe(node, observerCfg);
      }
    };

    mutationList.forEach(
      ({ type, target, addedNodes, removedNodes, attributeName }) => {
        // we indicate that we are processing a slot here because any updates
        // to un-slotted nodes should be ignored anyway
        if (shouldIgnoreNode(target, true)) {
          return;
        }

        switch (type) {
          case "childList":
            if (isStyleNode(target)) {
              nodeIdContainer.queueUpdate(target, getStyleUpdate(target), "");
              return;
            }

            const added = Array.from(addedNodes);
            const removed = Array.from(removedNodes);

            added.forEach((node) => {
              queueTreeUpdates(observe, nodeIdContainer, target, node);
            });

            removed.forEach((node) => {
              queueRemovedUpdates(nodeIdContainer, target, node);
            });
            return;
          case "attributes":
            const targetEl = target as HTMLElement;
            const isHostComponent = !!getHostComponent(targetEl);

            if (isHostComponent) {
              const update: PartialReconciliationUpdate = {
                propUpdates: propUpdatesForHostComponent(targetEl),
              };
              // TODO: verify "" as parentContext
              nodeIdContainer.queueUpdate(target, update, "");
              return;
            }

            if (
              attributeName &&
              targetEl.getAttribute &&
              !ignoredAttrs.has(attributeName)
            ) {
              if (isStyleNode(target)) {
                nodeIdContainer.queueUpdate(target, getStyleUpdate(target), "");
                return;
              }

              const newValue = targetEl.getAttribute(attributeName);
              const update: PartialReconciliationUpdate = {
                propUpdates: [
                  typeof newValue === "undefined"
                    ? {
                        op: "delete",
                        prop: attributeName,
                      }
                    : {
                        op: "set",
                        prop: attributeName,
                        value: newValue,
                      },
                ],
              };
              // TODO: verify "" as parentContext
              nodeIdContainer.queueUpdate(target, update, "");
            }
            return;
          case "characterData":
            const parentNode = target?.parentNode;
            if (isStyleNode(parentNode)) {
              nodeIdContainer.queueUpdate(
                parentNode,
                getStyleUpdate(parentNode),
                ""
              );
              return;
            }

            const text = target.textContent;
            const update: PartialReconciliationUpdate = {
              textUpdate: {
                text: text || "",
              },
            };
            // TODO: verify "" as parentContext
            nodeIdContainer.queueUpdate(target, update, "");
            return;
        }
      }
    );
    nodeIdContainer.flushUpdates();
  });

  obs.observe(root, observerCfg);

  return root;
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
  const pluginBridge: PluginBridge = await initializePluginBridge({
    origin: hostOrigin,
    render: onRender,
    extraProxyHandlers: [getEventProxyHandler(getNodeById)],
  });

  function onRender(rootId: RenderRootId, props: Props) {
    const root = constructRenderRootIfNeeded(rootId, pluginBridge);

    plugin(props, root);
  }
};

const queueHandlerUpdate: QueueHandlerUpdate = (node, handlerUpdate): void => {
  const targetContainer = Array.from(nodeIdContainers).find((container) =>
    container.hasNode(node)
  );
  const update: PartialReconciliationUpdate = {
    handlerUpdates: [handlerUpdate],
  };

  if (targetContainer) {
    // TODO: "" as parentContext works since we already have an id
    targetContainer.queueUpdate(node, update, "");
  } else {
    globalEventHandlerQueue.set(node, update);
  }
};

type FragAndEl = {
  fragment: ShadowRoot | null;
  element: Element | null;
};

const getNodeById: GetNodeById = (nodeId) => {
  const nodeIds = nodeId.split(".").reduce((nodeIds, nodeId) => {
    const prev = nodeIds[nodeIds.length - 1];
    const next = prev ? `${prev}.${nodeId}` : nodeId;
    return nodeIds.concat([next]);
  }, [] as Array<NodeId>);

  const results: Array<FragAndEl> = nodeIds.reduce(
    (roots: Array<FragAndEl>, nodeId: NodeId) => {
      const nextEl: Element | null = roots.reduce(
        (result: Element | null, { fragment, element }: FragAndEl) => {
          if (result || !fragment) {
            return result;
          }

          const selector = `[${nodeIdAttr}="${nodeId}"]`;

          if (fragment.host && fragment.host.matches(selector)) {
            return fragment.host;
          }

          return fragment.querySelector(selector) || null;
        },
        null as Element | null
      );
      return nextEl
        ? [{ fragment: nextEl.shadowRoot || null, element: nextEl }]
        : [];
    },
    Array.from(renderRootById.values()).map((fragment) => ({
      fragment,
      element: null,
    })) as Array<FragAndEl>
  );

  return results.length ? results[0].element : null;
};

setupPluginEnvironment({
  queueHandlerUpdate,
});

export { registerPlugin };
