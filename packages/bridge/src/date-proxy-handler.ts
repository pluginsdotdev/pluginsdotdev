import type {
  Bridge,
  ProxyId,
  ProxyIdFactory,
  LocalBridgeState,
  HostValue,
  ProxyType,
  ProxyHandler,
} from "./types";

const type = "plugins.dev/date" as ProxyType;

const toBridgeHandler = (
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

export const handler: ProxyHandler = { type, toBridgeHandler };
