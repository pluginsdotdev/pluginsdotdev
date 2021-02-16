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

const type = "plugins.dev/special-array" as ProxyType;

const toBridgeHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!(ArrayBuffer.isView(hostValue) || hostValue instanceof ArrayBuffer)) {
    return null;
  }

  // ArrayBuffers, TypedArrays, and other views can pass through as-is, structured cloning handles them properly
  return {
    replacementValue: hostValue,
  };
};

export const handler: ProxyHandler = { type, toBridgeHandler };
