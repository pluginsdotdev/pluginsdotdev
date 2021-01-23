import { initializePluginBridge } from "@pluginsdotdev/bridge";

import type {
  PluginBridge,
  Props,
  EventOptions,
  EventHandler,
  RenderRootId,
  ReconciliationUpdate,
  ReconciliationPropUpdate,
  ReconciliationHandlerUpdate,
} from "@pluginsdotdev/bridge";

type ExposedComponents = Record<
  keyof JSX.IntrinsicElements,
  keyof JSX.IntrinsicElements
>;

interface PluginConfig {
  pluginId: string;
  hostId: string;
  userId: string;
  exposedComponents: ExposedComponents;
}

type PluginFactory = (
  pluginConfig: PluginConfig
) => (props: Props, container: HTMLElement) => void;

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

const makeExposedComponents = (
  exposedComponentsList: Array<keyof ExposedComponents>
): ExposedComponents => {
  return exposedComponentsList.reduce((exposedComponents, component) => {
    exposedComponents[
      component
    ] = `host:${component}` as keyof JSX.IntrinsicElements;
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

class NodeIdContainer {
  private nextId = 0;
  private nodesById = new WeakMap<Node, number>();
  private reconcile: Reconcile;
  private queuedUpdates = new WeakMap<Node, ReconciliationUpdate>();
  private updateOrder: Array<Node> = [];

  constructor(reconcile: Reconcile) {
    this.reconcile = reconcile;
  }

  addNode(node: Node): number {
    const id = this.nextId++;
    this.nodesById.set(node, id);
    return id;
  }

  getOrAddNode(node: Node): number {
    const id = this.getId(node);
    return typeof id === "undefined" ? this.addNode(node) : id;
  }

  getId(node: Node): number | undefined {
    return this.nodesById.get(node);
  }

  isRoot(node: Node): boolean {
    return this.getId(node) === 0;
  }

  hasNode(node: Node): boolean {
    return typeof this.getId(node) !== "undefined";
  }

  queueUpdate(node: Node, update: PartialReconciliationUpdate) {
    const previouslyQueued = globalEventHandlerQueue.get(node);
    globalEventHandlerQueue.delete(node);

    const type = this.isRoot(node)
      ? "root"
      : node.nodeType === Node.TEXT_NODE
      ? "text"
      : node.nodeName.toLowerCase();
    const fullUpdate = {
      ...mergePartialUpdates(update, previouslyQueued),
      nodeId: this.getOrAddNode(node),
      type,
    };
    const existingUpdate = this.queuedUpdates.get(node);
    if (!existingUpdate) {
      this.updateOrder.push(node);
    }
    this.queuedUpdates.set(node, mergeUpdates(existingUpdate, fullUpdate));
  }

  flushUpdates() {
    const orderedUpdates = this.updateOrder.map(
      (node) => this.queuedUpdates.get(node)!
    );
    this.reconcile(orderedUpdates);
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
  const propUpdates: Array<ReconciliationPropUpdate> = attrs.map((attr) => ({
    op: "set",
    prop: attr.name === "class" ? "className" : attr.name,
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

const renderRootById = new Map<RenderRootId, HTMLElement>();

const constructRenderRootIfNeeded = (
  rootId: RenderRootId,
  pluginBridge: PluginBridge
): HTMLElement => {
  const prevRoot = renderRootById.get(rootId);
  if (prevRoot) {
    return prevRoot;
  }

  const root = document.createElement("div");
  document.body.appendChild(root);
  renderRootById.set(rootId, root);

  const nodeIdContainer = new NodeIdContainer(
    (updates: Array<ReconciliationUpdate>) =>
      pluginBridge.reconcile(rootId, updates)
  );
  nodeIdContainers.add(nodeIdContainer);
  nodeIdContainer.addNode(root);
  const obs = new MutationObserver((mutationList, observer) => {
    mutationList.forEach(({ type, target, addedNodes, removedNodes }) => {
      const added = Array.from(addedNodes);
      const removed = Array.from(removedNodes);

      added.forEach((node) => {
        queueTreeUpdates(nodeIdContainer, target, node);
      });

      removed.forEach((node) => {
        queueRemovedUpdates(nodeIdContainer, target, node);
      });
    });
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

const makeListener = (
  node: Node,
  type: string,
  eventOptions: EventOptions,
  listener: EventListener | EventListenerObject
): EventHandler => (nodeId: number, eventType: string, event: any) => {
  // TODO: properly fire events
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

  if (!(this as any).nodeType || !listener) {
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

export { registerPlugin };
