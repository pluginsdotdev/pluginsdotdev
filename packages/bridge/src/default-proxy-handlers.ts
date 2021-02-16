import { handler as functionProxy } from "./function-proxy-handler";
import { handler as errorProxy } from "./error-proxy-handler";
import { handler as dateProxy } from "./date-proxy-handler";
import { handler as mapProxy } from "./map-proxy-handler";
import { handler as setProxy } from "./set-proxy-handler";
import { handler as specialArrayProxy } from "./special-array-proxy-handler";

import type { FromBridgeProxyHandler, ToBridgeProxyHandler } from "./types";

export const getDefaultProxyHandlers = () => [
  functionProxy,
  errorProxy,
  dateProxy,
  mapProxy,
  setProxy,
  specialArrayProxy,
];
