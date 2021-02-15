import * as functionProxy from "./function-proxy-handler";
import * as errorProxy from "./error-proxy-handler";
import * as dateProxy from "./date-proxy-handler";
import * as mapProxy from "./map-proxy-handler";
import * as setProxy from "./set-proxy-handler";
import * as specialArrayProxy from "./special-array-proxy-handler";

import type { FromBridgeProxyHandler, ToBridgeProxyHandler } from "./types";

export const registerDefaultProxyHandlers = (
  registerToBridgeProxyHandler: (
    proxyType: string,
    handler: ToBridgeProxyHandler
  ) => void,
  registerFromBridgeProxyHandler: (
    proxyType: string,
    handler: FromBridgeProxyHandler
  ) => void
) => {
  registerFromBridgeProxyHandler(
    "plugins.dev/function",
    functionProxy.fromBridgeHandler
  );
  registerToBridgeProxyHandler(
    "plugins.dev/function",
    functionProxy.toBridgeHandler
  );

  registerFromBridgeProxyHandler(
    "plugins.dev/error",
    errorProxy.fromBridgeHandler
  );
  registerToBridgeProxyHandler("plugins.dev/error", errorProxy.toBridgeHandler);

  registerToBridgeProxyHandler("plugins.dev/date", dateProxy.toBridgeHandler);

  registerFromBridgeProxyHandler("plugins.dev/map", mapProxy.fromBridgeHandler);
  registerToBridgeProxyHandler("plugins.dev/map", mapProxy.toBridgeHandler);

  registerFromBridgeProxyHandler("plugins.dev/set", setProxy.fromBridgeHandler);
  registerToBridgeProxyHandler("plugins.dev/set", setProxy.toBridgeHandler);

  registerToBridgeProxyHandler(
    "plugins.dev/special-array",
    specialArrayProxy.toBridgeHandler
  );
};
