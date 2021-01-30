import { registerToBridgeProxyHandler } from "@pluginsdotdev/bridge";

import type {
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

const toSimpleObj = (orig: { [key: string]: any }) => {
  return allKeys(orig).reduce((o, key) => {
    const val = orig[key];

    if (typeof val === "function") {
      // we don't pass any functions at this point
      return o;
    }

    if (val instanceof EventTarget) {
      o[key] = {
        // TODO: include nodeId
        checked: (val as any).checked,
        value: (val as any).value,
        selectedIndex: (val as any).selectedIndex,
      };
      return o;
    }

    if (Object(val) === val) {
      o[key] = toSimpleObj(val);
      return o;
    }

    o[key] = val;
    return o;
  }, {} as { [key: string]: any });
};

export const proxyHandler = (
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
      data: toSimpleObj(hostValue),
    },
  };
};

export const registerHandler = () => {
  registerToBridgeProxyHandler("plugins.dev/Event", proxyHandler);
};
