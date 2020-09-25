import { registerToBridgeProxyHandler } from "@pluginsdotdev/bridge";

import type { SyntheticEvent } from "react";
import type {
  LocalBridgeState,
  HostValue,
  ProxyIdFactory,
} from "@pluginsdotdev/bridge";

/**
 * From https://reactjs.org/docs/events.html
 **/
const syntheticEventTypes = [
  { prop: "bubbles", type: "boolean" },
  { prop: "cancelable", type: "boolean" },
  { prop: "defaultPrevented", type: "boolean" },
  { prop: "eventPhase", type: "number" },
  { prop: "isTrusted", type: "boolean" },
  { prop: "preventDefault", type: "function" },
  { prop: "isDefaultPrevented", type: "function" },
  { prop: "stopPropagation", type: "function" },
  { prop: "isPropagationStopped", type: "function" },
  { prop: "persist", type: "function" },
  { prop: "timeStamp", type: "number" },
  { prop: "type", type: "string" },
];

/**
 * From https://reactjs.org/docs/events.html
 **/
const syntheticEventSupers = [
  { prop: "currentTarget", spr: EventTarget },
  { prop: "nativeEvent", spr: Event },
  { prop: "target", spr: EventTarget },
];

const isSyntheticEvent = (e: any): e is SyntheticEvent => {
  if (Object(e) !== e) {
    return false;
  }

  const rightTypes = syntheticEventTypes.every(
    ({ prop, type }) => typeof e[prop] === type
  );
  const rightSupers = syntheticEventSupers.every(
    ({ prop, spr }) => e[prop] instanceof spr
  );
  return rightTypes && rightSupers;
};

// TODO: recursive structures?
const toSimpleObj = (orig: { [key: string]: any }) => {
  return Object.keys(orig).reduce((o, key) => {
    const val = orig[key];

    if (key.startsWith("_") || key === "nativeEvent" || key === "view") {
      // no point in sending these
      return o;
    }

    if (typeof val === "function") {
      // we don't pass any synthetic event functions at this point
      return o;
    }

    if (val instanceof EventTarget) {
      o[key] = {
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
  _: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!isSyntheticEvent(hostValue)) {
    return null;
  }

  return {
    replacementValue: toSimpleObj(hostValue),
  };
};

export const registerHandler = () => {
  registerToBridgeProxyHandler("plugins.dev/SyntheticEvent", proxyHandler);
};
