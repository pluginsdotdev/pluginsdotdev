import {
  initializePluginBridge,
  registerFromBridgeProxyHandler,
} from "@pluginsdotdev/bridge";

import type {
  Bridge,
  ProxyId,
  PluginBridge,
  Props,
  EventOptions,
  EventHandler,
  NodeId,
  RenderRootId,
  ReconciliationUpdate,
  ReconciliationPropUpdate,
  ReconciliationHandlerUpdate,
} from "@pluginsdotdev/bridge";

export interface ExposedComponent {
  type: string;
  props: Record<string, string>;
  el: () => HTMLElement;
}

type ExposedComponents = Record<string, ExposedComponent>;

interface PluginConfig {
  pluginId: string;
  hostId: string;
  userId: string;
  exposedComponents: ExposedComponents;
}

type PluginFactory = (
  pluginConfig: PluginConfig
) => (props: Props, container: Element | DocumentFragment) => void;

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

const hostComponentAttr = `data-pluginsdotdev-host-component-${Math.floor(
  Math.random() * 10000
)}`;

const nodeIdAttr = `data-pluginsdotdev-node-id-${Math.floor(
  Math.random() * 10000
)}`;

const ignoredAttrs = new Set<string>([hostComponentAttr, nodeIdAttr, "is"]);

const makeExposedComponents = (
  exposedComponentsList: Array<keyof ExposedComponents>
): ExposedComponents => {
  return exposedComponentsList.reduce((exposedComponents, component) => {
    const type = "div";
    const props: Record<string, string> = {
      [hostComponentAttr]: component,
    };
    exposedComponents[component] = {
      type,
      props,
      el: () => {
        const el = document.createElement(type);
        Object.keys(props).forEach((prop) => {
          el.setAttribute(prop, props[prop]);
        });
        return el;
      },
    };
    return exposedComponents;
  }, {} as ExposedComponents);
};

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

type NodeHandle = (Node | DocumentFragment) & {
  _NodeHandle: true;
};

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
    this.rootId = this.addNode(root);
  }

  addNode(node: Node): NodeId {
    const id = `${nextId++}`;
    this.nodeToId.set(nodeHandle(node), id);
    const el = node as HTMLElement;
    if (el.setAttribute) {
      el.setAttribute(nodeIdAttr, "" + id);
    }
    return id;
  }

  getOrAddNode(node: Node): NodeId {
    const id = this.getId(node);
    return typeof id === "undefined" ? this.addNode(nodeHandle(node)) : id;
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

  queueUpdate(node: Node, update: PartialReconciliationUpdate) {
    const previouslyQueued = globalEventHandlerQueue.get(node);
    globalEventHandlerQueue.delete(node);

    const el = node as HTMLElement;
    const hostComponent = el.getAttribute
      ? el.getAttribute(hostComponentAttr)
      : null;
    const type = this.isRoot(node)
      ? "root"
      : node.nodeType === Node.TEXT_NODE
      ? "text"
      : hostComponent
      ? `host:${hostComponent}`
      : node.nodeName.toLowerCase();
    const fullUpdate = {
      ...mergePartialUpdates(update, previouslyQueued),
      nodeId: this.getOrAddNode(node),
      type,
    };
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

const calculateChildIdx = (node: Node): number => {
  let childIdx = 0;
  let currentNode = node;
  while (currentNode.previousSibling !== null) {
    currentNode = currentNode.previousSibling;
    ++childIdx;
  }
  return childIdx;
};

const queueTreeUpdates = (
  nodeIdContainer: NodeIdContainer,
  target: Node,
  child: Node
): void => {
  const childId = nodeIdContainer.getOrAddNode(child);
  const targetId = nodeIdContainer.getId(target)!;
  const targetUpdate: PartialReconciliationUpdate = {
    childUpdates: [
      {
        op: "set",
        childIdx: calculateChildIdx(child),
        childId,
      },
    ],
  };
  // TODO: handle other node types https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
  const attrs: Array<Attr> =
    child.nodeType === Node.ELEMENT_NODE
      ? Array.from((child as Element).attributes)
      : [];
  const propUpdates: Array<ReconciliationPropUpdate> = attrs
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
  const children: Array<Node> = Array.from(child.childNodes);
  children.forEach((grandchild) => {
    queueTreeUpdates(nodeIdContainer, child, grandchild);
  });

  // queue our updates
  nodeIdContainer.queueUpdate(child, childUpdate);
  nodeIdContainer.queueUpdate(target, targetUpdate);
};

const queueRemovedUpdates = (
  nodeIdContainer: NodeIdContainer,
  target: Node,
  child: Node
): void => {
  const childId = nodeIdContainer.getId(child)!;
  nodeIdContainer.queueUpdate(target, {
    childUpdates: [
      {
        op: "delete",
        childId,
      },
    ],
  });
};

const renderRootById = new Map<RenderRootId, DocumentFragment>();

const constructRenderRootIfNeeded = (
  rootId: RenderRootId,
  pluginBridge: PluginBridge
): Element | DocumentFragment => {
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
  const obs = new MutationObserver((mutationList, observer) => {
    mutationList.forEach(
      ({ type, target, addedNodes, removedNodes, attributeName }) => {
        const added = Array.from(addedNodes);
        const removed = Array.from(removedNodes);

        added.forEach((node) => {
          queueTreeUpdates(nodeIdContainer, target, node);
        });

        removed.forEach((node) => {
          queueRemovedUpdates(nodeIdContainer, target, node);
        });

        const targetEl = target as HTMLElement;

        if (
          attributeName &&
          targetEl.getAttribute &&
          !ignoredAttrs.has(attributeName)
        ) {
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
          nodeIdContainer.queueUpdate(target, update);
        }
      }
    );
    nodeIdContainer.flushUpdates();
    console.log(mutationList);
  });

  obs.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  });

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
  const pluginBridge: PluginBridge = await initializePluginBridge(
    hostOrigin,
    onRender
  );

  function onRender(rootId: RenderRootId, props: Props) {
    const root = constructRenderRootIfNeeded(rootId, pluginBridge);

    plugin(props, root);
  }
};

type EventKey = string;

const getEventKey = (type: string, opts: EventOptions): EventKey => {
  return `${type}:${opts.capture}:${opts.passive}`;
};

interface Listeners {
  localListeners: Set<EventListener | EventListenerObject>;
  remoteListener: EventHandler;
}

const eventHandlerRegistry = new WeakMap<Node, Record<string, Listeners>>();

const maxRecentEventIds = 100;
const recentlySeenEventIds: Array<ProxyId> = [];

const makeListener = (
  node: Node,
  type: string,
  eventOptions: EventOptions,
  listener: EventListener | EventListenerObject
): EventHandler => (nodeId: NodeId, eventType: string, event: any) => {
  const eventId = event._id;
  if (recentlySeenEventIds.indexOf(eventId) >= 0) {
    // an event that bubbles may have multiple handlers triggered
    // we must de-dupe on our side
    return;
  }

  if (recentlySeenEventIds.length >= maxRecentEventIds) {
    recentlySeenEventIds.pop();
  }
  recentlySeenEventIds.unshift(eventId);

  const {
    _target: { checked, value, selectedIndex, node },
  } = event as any;
  if (!node) {
    return;
  }

  if (typeof checked !== "undefined") {
    node.checked = checked;
  }
  if (typeof value !== "undefined") {
    node.value = value;
  }
  if (typeof selectedIndex !== "undefined") {
    node.selectedIndex = selectedIndex;
  }
  node.dispatchEvent(event);

  if (eventOptions.once) {
    // TODO: if we remove this, we can re-use the same host listener for every handler
    //       at the expense of additional events sent across the bridge that we will just ignore
    //       (local handler would be removed anyway). not sure which makes more sense.
    node.removeEventListener(type, listener, eventOptions);
  }
};

/**
 * Primary assumption behind getEventHandler:
 *  - we register events with the expectation that when a handler for the provided type and options
 *    is triggered on the host, we will trigger the same event on the node coresponding to the event
 *    target on the plugin.
 *  - this means that we don't actually care about the plugin-provided handler except to maintain our
 *    count and update the host whenever our event count crosses 0<>1.
 *  - specifically, we *must* de-dupe to prevent firing multiple events for multiple handlers.
 **/
const getEventHandler = (
  node: Node,
  addHandler: boolean,
  type: string,
  eventOptions: EventOptions,
  listener: EventListener | EventListenerObject
): EventHandler | null => {
  const listenersByEventKey = eventHandlerRegistry.get(node) || {};
  const eventKey = getEventKey(type, eventOptions);
  const listeners = listenersByEventKey[eventKey] || {
    localListeners: new Set<EventListener | EventListenerObject>(),
    remoteListener: makeListener(node, type, eventOptions, listener),
  };
  if (addHandler) {
    listeners.localListeners.add(listener);
  } else {
    listeners.localListeners.delete(listener);
  }
  listenersByEventKey[eventKey] = listeners;
  eventHandlerRegistry.set(node, listenersByEventKey);

  const needHandlerForAdd = addHandler && listeners.localListeners.size === 1;
  const needHandlerForRemove =
    !addHandler && listeners.localListeners.size === 0;

  return needHandlerForAdd || needHandlerForRemove
    ? listeners.remoteListener
    : null;
};

const ensureEventOpts = (
  useCaptureOrOpts?: boolean | AddEventListenerOptions
): EventOptions => {
  switch (typeof useCaptureOrOpts) {
    case "boolean":
      return { capture: useCaptureOrOpts };
    case "undefined":
      return {};
    default:
      return useCaptureOrOpts || {}; // || ok here since we check for boolean above, we're only handling null here
  }
};

const queueHandlerUpdate = (
  node: Node,
  handlerUpdate: ReconciliationHandlerUpdate
): void => {
  const targetContainer = Array.from(nodeIdContainers).find((container) =>
    container.hasNode(node)
  );
  const update: PartialReconciliationUpdate = {
    handlerUpdates: [handlerUpdate],
  };

  if (targetContainer) {
    targetContainer.queueUpdate(node, update);
  } else {
    globalEventHandlerQueue.set(node, update);
  }
};

// we wrap EventTarget to capture event handlers
const { addEventListener, removeEventListener } = EventTarget.prototype;
EventTarget.prototype.addEventListener = function wrappedAddEventListener(
  type: string,
  listener: EventListener | EventListenerObject | null,
  useCaptureOrOpts?: boolean | AddEventListenerOptions
) {
  const node = this as Node;

  if (
    !(this as any).nodeType ||
    !listener ||
    (node as any) === window ||
    node === document
  ) {
    return addEventListener.call(this, type, listener, useCaptureOrOpts);
  }

  // already checked for nodeType. node should actually be a Node

  const eventOptions = ensureEventOpts(useCaptureOrOpts);
  const handler = getEventHandler(node, true, type, eventOptions, listener);
  if (handler) {
    const update: ReconciliationHandlerUpdate = {
      op: "set",
      eventType: type,
      handler,
      eventOptions,
    };
    queueHandlerUpdate(node, update);
  }

  return addEventListener.call(this, type, listener, useCaptureOrOpts);
};

EventTarget.prototype.removeEventListener = function wrappedRemoveEventListener(
  type: string,
  listener: EventListener | EventListenerObject | null,
  useCaptureOrOpts?: boolean | AddEventListenerOptions
) {
  const node = this as Node;

  if (!(this as any).nodeType || !listener) {
    return removeEventListener.call(this, type, listener, useCaptureOrOpts);
  }

  // already checked for nodeType. node should actually be a Node

  const eventOptions = ensureEventOpts(useCaptureOrOpts);
  const handler = getEventHandler(node, false, type, eventOptions, listener);
  if (handler) {
    const update: ReconciliationHandlerUpdate = {
      op: "delete",
      eventType: type,
      handler,
      eventOptions,
    };
    queueHandlerUpdate(node, update);
  }

  return removeEventListener.call(this, type, listener, useCaptureOrOpts);
};

interface EventCtor {
  new (type: string, data: any): Event;
}

// https://developer.mozilla.org/en-US/docs/Web/API/Event
const eventCtorMap: Record<string, EventCtor> = {
  AnimationEvent: AnimationEvent,
  ClipboardEvent: ClipboardEvent,
  CompositionEvent: CompositionEvent,
  DragEvent: DragEvent,
  FocusEvent: FocusEvent,
  InputEvent: InputEvent,
  KeyboardEvent: KeyboardEvent,
  MouseEvent: MouseEvent,
  PointerEvent: PointerEvent,
  TrackEvent: TrackEvent,
  TransitionEvent: TransitionEvent,
  UIEvent: UIEvent,
  WheelEvent: WheelEvent,
};

const getNodeById = (nodeId: NodeId): Node | null =>
  Array.from(renderRootById.values()).reduce(
    (result, root) =>
      result || root.querySelector(`[${nodeIdAttr}="${nodeId}"]`),
    null as Node | null
  );

const fromBridgeEventHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  const { type, data }: { type: string; data: any } = value;
  const EventCtor = eventCtorMap[type] || Event;
  if (data.sourceCapabilities) {
    // sourceCapabilities must be of type InputDeviceCapabilities if present
    data.sourceCapabilities = new (window as any).InputDeviceCapabilities(
      data.sourceCapabilities
    );
  }
  // not useful to send the host window
  delete data.view;
  const evtInit = { ...data };
  delete evtInit.target;
  delete evtInit.relatedTarget;
  if (data.relatedTarget) {
    evtInit.relatedTarget = getNodeById(data.relatedTarget.nodeId);
  }
  const evt: any = new EventCtor(data.type, evtInit);
  evt._id = proxyId;
  evt._target = {
    node: getNodeById(data.target.nodeId),
    checked: data.target.checked,
    value: data.target.value,
    selectedIndex: data.target.selectedIndex,
  };
  return evt;
};

registerFromBridgeProxyHandler("plugins.dev/Event", fromBridgeEventHandler);

export { registerPlugin };
