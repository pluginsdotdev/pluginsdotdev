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
  if (!(hostValue instanceof Error)) {
    return null;
  }

  return {
    proxyId: proxyId(localState, hostValue),
    replacementValue: {
      name: hostValue.name,
      message: hostValue.message,
    },
  };
};

export const fromBridgeHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  const error: any = new Error(value.message);
  error.name = value.name;
  return error;
};
