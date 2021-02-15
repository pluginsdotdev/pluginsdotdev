import type {
  Bridge,
  ProxyId,
  ProxyIdFactory,
  LocalBridgeState,
  HostValue,
} from "./types";

export const toBridgeHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!(hostValue instanceof Date)) {
    return null;
  }

  // dates can pass through as-is, structured cloning handles them properly
  return {
    replacementValue: hostValue,
  };
};
