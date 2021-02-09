import { registerEventFromBridgeProxyHandler } from "./event-proxy-handler";
import { ensureOpenShadowRoots } from "./ensure-open-shadow-roots";
import { wrapEventTarget } from "./wrap-event-target";

import type { GetNodeById, QueueHandlerUpdate } from "./types";

type Cfg = {
  getNodeById: GetNodeById;
  queueHandlerUpdate: QueueHandlerUpdate;
};

export const setupPluginEnvironment = ({
  getNodeById,
  queueHandlerUpdate,
}: Cfg): void => {
  ensureOpenShadowRoots();
  wrapEventTarget(queueHandlerUpdate);
  registerEventFromBridgeProxyHandler(getNodeById);
};
