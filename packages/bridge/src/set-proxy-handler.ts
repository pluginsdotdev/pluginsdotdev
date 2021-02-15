import type {
  Bridge,
  ProxyId,
  ProxyIdFactory,
  LocalBridgeState,
  HostValue,
  ProxyHandlerToBridge,
} from "./types";

export const toBridgeHandler = (
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

export const fromBridgeHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  const setItems = value as Array<any>;
  const regular = setItems.filter((item) => item !== set);
  const set = new Set(setItems);
  const hasSelf = setItems.find((item) => item === setItems);
  if (hasSelf) {
    set.add(set);
  }
  return set;
};
