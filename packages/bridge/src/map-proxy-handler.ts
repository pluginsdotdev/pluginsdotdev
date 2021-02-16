import type {
  Bridge,
  ProxyId,
  ProxyIdFactory,
  LocalBridgeState,
  HostValue,
  ProxyHandlerToBridge,
  ProxyType,
  ProxyHandler,
} from "./types";

const type = "plugins.dev/map" as ProxyType;

const fromBridgeHandler = (bridge: Bridge, proxyId: ProxyId, value: any) => {
  const arr = value as Array<[any, any]>;
  const m = new Map(arr);
  arr.forEach(([k, v]) => {
    const kIsArr = k === arr;
    const vIsArr = v === arr;
    const km = kIsArr ? m : k;
    const vm = vIsArr ? m : v;
    if (kIsArr || vIsArr) {
      m.set(km, vm);
    }
  });
  return m;
};

const toBridgeHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue,
  toBridge: ProxyHandlerToBridge
) => {
  if (!(hostValue instanceof Map)) {
    return null;
  }

  const pId = proxyId(localState, hostValue);

  return {
    proxyId: pId,
    replacementValue: toBridge(Array.from(hostValue.entries()), [], pId),
  };
};

export const handler: ProxyHandler = {
  type,
  toBridgeHandler,
  fromBridgeHandler,
};
