import type {
  Bridge,
  ProxyId,
  ProxyIdFactory,
  LocalBridgeState,
  HostValue,
} from "./types";

export const fromBridgeHandler = (bridge: Bridge, proxyId: ProxyId) => {
  // TODO: catch and unwrap any exception
  return (...args: any[]): Promise<any> => bridge.invokeFn(proxyId, args);
};

export const toBridgeHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (typeof hostValue !== "function") {
    return null;
  }

  // functions are replaced by ids, which are used to communicate
  // invocations in future messages.
  // a map of json path in the bridgeData to proxyId is passed alongside
  // bridgeData
  return {
    proxyId: proxyId(localState, hostValue),
    retainedValue: hostValue,
  };
};
