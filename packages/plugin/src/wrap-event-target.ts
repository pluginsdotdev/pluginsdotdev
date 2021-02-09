import type {
  EventOptions,
  EventHandler,
  ProxyId,
  NodeId,
  ReconciliationHandlerUpdate,
} from "@pluginsdotdev/bridge";
import type { QueueHandlerUpdate } from "./types";

type EventKey = string;

const getEventKey = (type: string, opts: EventOptions): EventKey => {
  return `${type}:${opts.capture}:${opts.passive}`;
};

interface Listeners {
  localListeners: Set<EventListener | EventListenerObject>;
  remoteListener: EventHandler;
}

export const wrapEventTarget = (queueHandlerUpdate: QueueHandlerUpdate) => {
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
};
