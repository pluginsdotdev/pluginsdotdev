import { ensureOpenShadowRoots } from "./ensure-open-shadow-roots";
import { wrapEventTarget } from "./wrap-event-target";
import { disableExecFunctions } from "./disable-exec-functions";
import { disableNavigationFunctions } from "./disable-navigation-functions";
import { wrapFetch } from "./wrap-fetch";
import { wrapXMLHttpRequest } from "./wrap-xmlhttprequest";
import { wrapSendBeacon } from "./wrap-sendbeacon";

import type { GetNodeById, QueueHandlerUpdate } from "./types";

type Cfg = {
  queueHandlerUpdate: QueueHandlerUpdate;
};

export const setupPluginEnvironment = ({ queueHandlerUpdate }: Cfg): void => {
  ensureOpenShadowRoots();
  wrapEventTarget(queueHandlerUpdate);
  disableExecFunctions();
  disableNavigationFunctions();
  wrapFetch();
  wrapXMLHttpRequest();
  wrapSendBeacon();
};
