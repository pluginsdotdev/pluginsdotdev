import { registerToBridgeProxyHandler } from "@pluginsdotdev/bridge";

import type {
  NodeId,
  LocalBridgeState,
  HostValue,
  ProxyIdFactory,
} from "@pluginsdotdev/bridge";

const isEvent = (e: any): e is Event => {
  return e instanceof Event;
};

const allKeys = (obj: object): Array<string> => {
  const keys = [];
  for (let k in obj) {
    keys.push(k);
  }
  return keys;
};

const ignoredProps = new Set<string>(["currentTarget", "srcElement", "view"]);

const proxyEventTarget = (
  nodeIdByNode: WeakMap<EventTarget, NodeId>,
  val: EventTarget
) => ({
  nodeId: nodeIdByNode.get(val),
  checked: (val as any).checked,
  value: (val as any).value,
  selectedIndex: (val as any).selectedIndex,
});

const toSimpleObj = (
  nodeIdByNode: WeakMap<EventTarget, NodeId>,
  orig: { [key: string]: any }
) => {
  return allKeys(orig).reduce((o, key) => {
    const val = orig[key];

    if (ignoredProps.has(key)) {
      return o;
    }

    if (typeof val === "function") {
      // we don't pass any functions at this point
      return o;
    }

    if (
      key === "target" &&
      (orig.path || typeof orig.composedPath === "function")
    ) {
      const path = orig.path || orig.composedPath();
      const target = (path && path[0]) || val;
      o[key] = proxyEventTarget(nodeIdByNode, target);
      return o;
    }

    if (val instanceof EventTarget) {
      o[key] = proxyEventTarget(nodeIdByNode, val);
      return o;
    }

    if (Object(val) === val) {
      o[key] = toSimpleObj(nodeIdByNode, val);
      return o;
    }

    o[key] = val;
    return o;
  }, {} as { [key: string]: any });
};

export const proxyHandler = (
  nodeIdByNode: WeakMap<EventTarget, NodeId>,
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!isEvent(hostValue)) {
    return null;
  }

  return {
    proxyId: proxyId(localState, hostValue),
    replacementValue: {
      type: Object.getPrototypeOf(hostValue).constructor.name,
      data: toSimpleObj(nodeIdByNode, hostValue),
    },
  };
};

export const registerHandler = (nodeIdByNode: WeakMap<EventTarget, NodeId>) => {
  registerToBridgeProxyHandler(
    "plugins.dev/Event",
    proxyHandler.bind(null, nodeIdByNode)
  );
};
