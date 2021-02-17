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

const type = "plugins.dev/set" as ProxyType;

const toBridgeHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue,
  toBridge: ProxyHandlerToBridge
) => {
  if (!(hostValue instanceof Set)) {
    return null;
  }

  const pId = proxyId(localState, hostValue);
  return {
    proxyId: pId,
    replacementValue: toBridge(Array.from(hostValue.values()), [], pId),
  };
};

const mutatingFromBridgeHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any,
  mutableValue: Set<any>
) => {
  const setItems = value as Array<any>;
  setItems.forEach((i) => {
    mutableValue.add(i);
  });
  return mutableValue;
};

export const handler: ProxyHandler = {
  type,
  toBridgeHandler,
  mutatingFromBridgeHandler,
  mutableInit: () => new Set<any>(),
};
