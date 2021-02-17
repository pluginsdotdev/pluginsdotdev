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

const mutatingFromBridgeHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any,
  mutableValue: Map<any, any>
) => {
  const arr = value as Array<[any, any]>;
  arr.forEach(([k, v]) => {
    mutableValue.set(k, v);
  });
  return mutableValue;
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
  mutatingFromBridgeHandler,
  mutableInit: () => new Map<any, any>(),
};
