import {
  fromBridge,
  toBridge,
  registerFromBridgeProxyHandlerMiddleware,
} from "./data-bridge";
import { getDefaultProxyHandlers } from "./default-proxy-handlers";

import type {
  Bridge,
  HostBridge,
  PluginBridge,
  HostId,
  PluginUrl,
  ProxyId,
  BridgeValue,
  LocalBridgeState,
  RenderRootId,
  Props,
  ReconciliationUpdate,
  HostValue,
  FromBridgeProxyHandler,
  ProxyHandler,
} from "./types";

const intermediateFrameScript = `
  (function() {
    var sendCommand = window.sendCommand;
    window.onReceiveCommand(function(cmd) {
      var payload = cmd.payload;
      if ( cmd.cmd === "send" ) {
        payload.targetWindow.postMessage(payload.msg, payload.targetOrigin);
      }
    });
    window.addEventListener(
      "message",
      function receiveMessage(evt) {
        sendCommand({cmd: "message", payload: {data: evt.data, origin: evt.origin, source: evt.source}});
      },
      false
    );
    sendCommand({cmd: "ready"});
  })();
`;

const loadSameOriginFrameScript = (
  { scriptNonce }: HostConfig,
  iframe: HTMLIFrameElement,
  scriptBody: string
): void => {
  if (!iframe.contentDocument) {
    throw new Error("Failed to access frame document");
  }
  const script = iframe.contentDocument.createElement("script");
  script.nonce = scriptNonce;
  script.type = "application/javascript";
  script.innerText = scriptBody;
  iframe.contentDocument.body.appendChild(script);
};

interface ReadyCommand {
  cmd: "ready";
}

interface SendCommand {
  cmd: "send";
  payload: {
    msg: any;
    targetWindow: Window;
    targetOrigin: string;
  };
}

interface MessageCommand {
  cmd: "message";
  payload: {
    data: PluginMessage;
    origin: string;
    source: Window;
  };
}

/**
 * Command is the interface between the intermediate frame and the
 * host window.
 **/
type Command = ReadyCommand | SendCommand | MessageCommand;

type OnReceiveCallback = (cmd: Command) => void;

const resolvablePromise = () => {
  let resolve: (val?: any) => void;
  let reject: (err?: any) => void;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    // @ts-ignore
    resolve,
    // @ts-ignore
    reject,
    promise,
  };
};

type HostBridgeMaker = (pluginUrl: PluginUrl) => Promise<HostBridge>;

const initializeIntermediateToPluginBridge = (
  intermediateFrameWindow: Window,
  hostId: HostId,
  pluginUrl: PluginUrl
): Promise<{ frame: HTMLIFrameElement; targetOrigin: string }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(pluginUrl);
    const frame = intermediateFrameWindow.document.createElement("iframe");
    frame.style.display = "none";
    frame.width = "0";
    frame.height = "0";
    frame.src = pluginUrl;

    const supportsSandbox = "sandbox" in frame;
    if (supportsSandbox) {
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    }

    frame.onload = () => {
      resolve({
        frame,
        targetOrigin: url.origin,
      });
    };

    intermediateFrameWindow.document.body.appendChild(frame);
  });
};

type InvocationId = number;

interface PluginReadyMessage {
  msg: "plugin-ready";
}

interface InvokeMessage {
  msg: "invoke";
  payload: {
    invocationId: InvocationId;
    fnId: ProxyId;
    argsBridgeValue: BridgeValue;
  };
}

interface InvocationResponseMessage {
  msg: "invocation-response";
  payload:
    | {
        resultType: "result";
        invocationId: InvocationId;
        resultBridgeValue: BridgeValue;
      }
    | {
        resultType: "error";
        invocationId: InvocationId;
        errorBridgeValue: BridgeValue;
      };
}

interface RenderMessage {
  msg: "render";
  payload: {
    rootId: RenderRootId;
    props: BridgeValue;
  };
}

interface ReconcileMessage {
  msg: "reconcile";
  payload: {
    rootId: RenderRootId;
    updates: BridgeValue;
  };
}

interface DisposeMessage {
  msg: "dispose";
  payload: {
    proxyIds: Array<ProxyId>;
  };
}

/**
 * PluginMessage is the interface between the host and the plugin frame.
 * PluginMessages are passed through Commands (i.e. they are sent in a
 * Command envelope through the intermediate frame).
 **/
type PluginMessage =
  | PluginReadyMessage
  | InvokeMessage
  | InvocationResponseMessage
  | RenderMessage
  | ReconcileMessage
  | DisposeMessage;

interface PluginMessageEnvelope {
  secret: string;
}

type PluginMessageWithEnvelope = PluginMessage & PluginMessageEnvelope;

type PluginMessageHandler = (msg: PluginMessage) => void;

const assertNever = (n: never): never => {
  throw new Error("Unexpected branch");
};

type InternalBridge = Bridge & {
  registerDisposalWatcher: (proxyId: ProxyId, value: any) => void;
};

const isInternalBridge = (bridge: Bridge): bridge is InternalBridge =>
  typeof (bridge as InternalBridge).registerDisposalWatcher === "function";

registerFromBridgeProxyHandlerMiddleware(
  (handler, bridge, proxyId, value, mutableValue) => {
    const result = handler(bridge, proxyId, value, mutableValue);
    if (isInternalBridge(bridge)) {
      bridge.registerDisposalWatcher(proxyId, result);
    }
    return result;
  }
);

const FinalizationRegistry =
  "FinalizationRegistry" in window
    ? (window as any).FinalizationRegistry
    : null;

const makeCommonBridge = (
  sendMessage: (msg: PluginMessage) => Promise<void>,
  firstClassHandlers: Array<
    (bridge: InternalBridge, msg: PluginMessage) => boolean
  >,
  proxyHandlers?: Array<ProxyHandler>
): {
  bridge: Bridge & { handleMessage: (pluginMsg: PluginMessage) => void };
  fromThisBridge: (bridgeValue: Readonly<BridgeValue>) => any;
  toThisBridge: (hostValue: HostValue) => BridgeValue;
} => {
  let nextInvocationId = 0;

  const msgHandlers = new Set<PluginMessageHandler>();

  const waitForMsg = <M extends PluginMessage>(
    filter: (msg: PluginMessage) => msg is M
  ): Promise<M> => {
    return new Promise((resolve, reject) => {
      const handler = (msg: PluginMessage): void => {
        if (filter(msg)) {
          resolve(msg);
          msgHandlers.delete(handler);
        }
      };
      msgHandlers.add(handler);
    });
  };

  const localState: LocalBridgeState = {
    localProxies: new Map(),
    knownProxies: new WeakMap(),
  };

  const toThisBridge = (value: any): BridgeValue => {
    return toBridge(localState, value, proxyHandlers);
  };

  const handleInvokeMessage = (bridge: Bridge, msg: InvokeMessage) => {
    const { invocationId, fnId, argsBridgeValue } = msg.payload;
    const fn = localState.localProxies.get(fnId);
    if (!fn) {
      console.log("Unknown function invoked");
      // TODO: return error?
      return;
    }

    const args: Array<any> = fromBridge(bridge, argsBridgeValue, proxyHandlers);

    try {
      const result = fn.apply(null, args);

      if (result instanceof Promise) {
        result
          .then((res) => {
            sendMessage({
              msg: "invocation-response",
              payload: {
                resultType: "result",
                invocationId,
                resultBridgeValue: toThisBridge(res),
              },
            });
          })
          .catch((err) => {
            sendMessage({
              msg: "invocation-response",
              payload: {
                resultType: "error",
                invocationId,
                errorBridgeValue: toThisBridge(err),
              },
            });
          });

        return;
      }

      sendMessage({
        msg: "invocation-response",
        payload: {
          resultType: "result",
          invocationId,
          resultBridgeValue: toThisBridge(result),
        },
      });
    } catch (error) {
      sendMessage({
        msg: "invocation-response",
        payload: {
          resultType: "error",
          invocationId,
          errorBridgeValue: toThisBridge(error),
        },
      });
    }
  };

  const handleDisposeMessage = (bridge: Bridge, msg: DisposeMessage) => {
    const { proxyIds } = msg.payload;
    proxyIds.forEach((proxyId) => {
      localState.localProxies.delete(proxyId);
    });
  };

  let disposeScheduled = false;
  let disposeQueue = [] as Array<ProxyId>;

  const scheduleDispose = () => {
    if (disposeScheduled) {
      return;
    }

    disposeScheduled = true;

    setTimeout(() => {
      const disposeMessage: DisposeMessage = {
        msg: "dispose",
        payload: {
          proxyIds: disposeQueue,
        },
      };
      disposeQueue = [];
      disposeScheduled = false;
      sendMessage(disposeMessage);
    }, 1000);
  };

  const dispose = (proxyId: ProxyId): void => {
    disposeQueue.push(proxyId);
    scheduleDispose();
  };

  const finalizationRegistry =
    FinalizationRegistry === null ? null : new FinalizationRegistry(dispose);

  const bridge = {
    registerDisposalWatcher(proxyId: ProxyId, value: any): void {
      if (finalizationRegistry && value === Object(value)) {
        finalizationRegistry.register(value, proxyId);
      }
    },
    handleMessage(pluginMsg: PluginMessage) {
      // we handle all proactive (i.e. non-response) messages directly
      if (pluginMsg.msg === "invoke") {
        handleInvokeMessage(this, pluginMsg);
        return;
      }

      if (pluginMsg.msg === "dispose") {
        handleDisposeMessage(this, pluginMsg);
      }

      const handled = firstClassHandlers?.filter((handler) =>
        handler(bridge, pluginMsg)
      );
      if (handled && !!handled.length) {
        return;
      }

      // responses are handled by dynamic handlers
      msgHandlers.forEach((handler) => handler(pluginMsg));
    },
    async invokeFn(fnId: ProxyId, args: any[]): Promise<BridgeValue> {
      const invocationId = ++nextInvocationId;
      const argsBridgeValue = toThisBridge(args);
      const pluginMsg: InvokeMessage = {
        msg: "invoke",
        payload: {
          invocationId,
          fnId,
          argsBridgeValue,
        },
      };
      await sendMessage(pluginMsg);
      const invocationResponseMsg: InvocationResponseMessage = await waitForMsg(
        (pluginMsg: PluginMessage): pluginMsg is InvocationResponseMessage =>
          pluginMsg.msg === "invocation-response" &&
          pluginMsg.payload.invocationId === invocationId
      );

      const { payload } = invocationResponseMsg;

      switch (payload.resultType) {
        case "error":
          throw fromBridge(this, payload.errorBridgeValue, proxyHandlers);
        case "result":
          return fromBridge(this, payload.resultBridgeValue, proxyHandlers);
      }
    },
  };

  const fromThisBridge = (bridgeValue: BridgeValue) =>
    fromBridge(bridge, bridgeValue, proxyHandlers);

  return {
    bridge,
    toThisBridge,
    fromThisBridge,
  };
};

const makeHostBridge = async (
  intermediateFrameWindow: Window,
  sendCommandToIntermediateFrame: OnReceiveCallback,
  reconcile: (
    rootId: RenderRootId,
    updates: Array<ReconciliationUpdate>
  ) => void,
  hostId: HostId,
  pluginUrl: PluginUrl,
  proxyHandlers?: Array<ProxyHandler>
): Promise<HostBridge> => {
  const { frame, targetOrigin } = await initializeIntermediateToPluginBridge(
    intermediateFrameWindow,
    hostId,
    pluginUrl
  );
  const frameContentWindow = frame.contentWindow;
  if (!frameContentWindow) {
    // initializeIntermediateToPluginBridge waits for onload so this should never happen
    throw new Error("plugin frame content window unexpectedly null");
  }
  let isReady = false;
  let { resolve: onReady, promise: ready } = resolvablePromise();
  ready.then(() => {
    isReady = true;
  });

  const run = (msg: PluginMessage): void => {
    sendCommandToIntermediateFrame({
      cmd: "send",
      payload: {
        msg,
        targetOrigin,
        targetWindow: frameContentWindow,
      },
    });
  };

  const queueOrRun = async (msg: PluginMessage): Promise<void> => {
    if (!isReady) {
      await ready;
    }

    return run(msg);
  };

  const reconcileHandler = (
    bridge: InternalBridge,
    msg: PluginMessage
  ): boolean => {
    if (msg.msg !== "reconcile") {
      return false;
    }

    reconcile(
      msg.payload.rootId,
      fromBridge(bridge, msg.payload.updates, proxyHandlers)
    );

    return true;
  };

  const firstClassHandlers = [reconcileHandler];
  const {
    bridge: commonBridge,
    fromThisBridge,
    toThisBridge,
  } = makeCommonBridge(queueOrRun, firstClassHandlers, proxyHandlers);
  let pluginSecret: string | null = null;

  const bridge = {
    ...commonBridge,
    pluginFrameWindow: frameContentWindow,
    onReceiveMessageFromPlugin(
      origin: string,
      { secret, ...pluginMsg }: PluginMessageWithEnvelope
    ) {
      // origin should always be 'null' for sandboxed, non-allow-same-origin
      // iframes but should match targetOrigin otherwise
      // we already know that the message was sent from the window we expect so this is somewhat redundant.
      if (origin !== "null" && origin !== targetOrigin) {
        return;
      }

      // plugin code is untrusted beyond the assumption that our plugin bridge is initialized before
      // any untrusted code. therefore, we establish a secret on plugin-ready that we check on all
      // subsequent messages to ignore untrusted messages.
      if (pluginMsg.msg === "plugin-ready") {
        pluginSecret = secret;
        onReady();
        return;
      }

      if (!pluginSecret || pluginSecret !== secret) {
        return;
      }

      this.handleMessage(pluginMsg);
    },
    async render(rootId: RenderRootId, props: Props): Promise<void> {
      const pluginMsg: RenderMessage = {
        msg: "render",
        payload: {
          rootId,
          props: toThisBridge(props),
        },
      };
      await queueOrRun(pluginMsg);
    },
  };
  return bridge;
};

interface HostConfig {
  scriptNonce?: string;
  styleNonce?: string;
}

const getProxyHandlers = (
  opts: ProxyHandlerOptions
): Array<ProxyHandler> | undefined => {
  if (opts.proxyHandlers) {
    return opts.proxyHandlers;
  }

  if (opts.extraProxyHandlers) {
    return getDefaultProxyHandlers().concat(opts.extraProxyHandlers);
  }

  return void 0;
};

export type ProxyHandlerOptions = {
  proxyHandlers?: Array<ProxyHandler>;
  extraProxyHandlers?: Array<ProxyHandler>;
};

export type HostBridgeOptions = ProxyHandlerOptions & {
  hostId: HostId;
  reconcile: (
    rootId: RenderRootId,
    updates: Array<ReconciliationUpdate>
  ) => void;
  hostConfig?: HostConfig;
};

const initializeHostBridge = ({
  hostId,
  hostConfig,
  reconcile,
  ...proxyOpts
}: HostBridgeOptions): Promise<HostBridgeMaker> => {
  let sendCommandToIntermediateFrame: null | OnReceiveCallback = null;
  const { resolve: onReady, promise: ready } = resolvablePromise();
  const bridgeByWindow = new Map<Window, HostBridge>();
  const onReceiveCommandFromIntermediateFrame = (command: Command) => {
    switch (command.cmd) {
      case "ready":
        onReady();
        return;
      case "message":
        const { data, origin, source } = command.payload;
        const bridge = bridgeByWindow.get(source);
        bridge?.onReceiveMessageFromPlugin(origin, data);
        return;
    }
  };

  return Promise.all([
    new Promise<HTMLIFrameElement>((resolve, reject) => {
      const intermediateFrame = document.createElement("iframe");
      intermediateFrame.src = "about:blank";
      intermediateFrame.style.display = "none";
      intermediateFrame.width = "0";
      intermediateFrame.height = "0";
      intermediateFrame.onload = () => {
        try {
          if (!intermediateFrame.contentWindow) {
            throw new Error("No window access");
          }

          (<any>intermediateFrame.contentWindow).onReceiveCommand = (
            cb: OnReceiveCallback
          ) => {
            if (!cb) {
              throw new Error(
                "Received a null sendCommandToIntermediateFrame from the intermediate frame"
              );
            }
            sendCommandToIntermediateFrame = cb;
          };
          (<any>(
            intermediateFrame.contentWindow
          )).sendCommand = onReceiveCommandFromIntermediateFrame;

          loadSameOriginFrameScript(
            hostConfig ?? {},
            intermediateFrame,
            intermediateFrameScript
          );

          resolve(intermediateFrame);
        } catch (err) {
          reject(err);
        }
      };
      document.body.appendChild(intermediateFrame);
    }),
    ready,
  ]).then(
    ([intermediateFrame, _]: [HTMLIFrameElement, any]) => async (
      pluginUrl: PluginUrl
    ) => {
      const intermediateFrameWindow = intermediateFrame.contentWindow;
      if (!intermediateFrameWindow || !sendCommandToIntermediateFrame) {
        // we wait for onload so this should never happen
        throw new Error("intermediate frame content window unexpectedly null");
      }
      const bridge = await makeHostBridge(
        intermediateFrameWindow,
        sendCommandToIntermediateFrame,
        reconcile,
        hostId,
        pluginUrl,
        getProxyHandlers(proxyOpts)
      );
      bridgeByWindow.set(bridge.pluginFrameWindow, bridge);
      return bridge;
    }
  );
};

const { parent, addEventListener } = window;

export type PluginBridgeOptions = ProxyHandlerOptions & {
  origin: string;
  render: (rootId: RenderRootId, props: Props) => void;
};

const initializePluginBridge = async ({
  origin,
  render,
  ...proxyOpts
}: PluginBridgeOptions): Promise<PluginBridge> => {
  const proxyHandlers = getProxyHandlers(proxyOpts);
  const renderHandler = (
    bridge: InternalBridge,
    msg: PluginMessage
  ): boolean => {
    if (msg.msg !== "render") {
      return false;
    }

    const { rootId, props } = msg.payload;
    render(rootId, fromBridge(bridge, props, proxyHandlers));
    return true;
  };
  const firstClassHandlers = [renderHandler];
  const secret = "" + Math.random();
  const sendMessage = (msg: PluginMessage) => {
    parent.postMessage({ ...msg, secret }, origin);
    return Promise.resolve();
  };
  const {
    bridge: commonBridge,
    fromThisBridge,
    toThisBridge,
  } = makeCommonBridge(sendMessage, firstClassHandlers, proxyHandlers);

  const bridge = {
    ...commonBridge,
    async reconcile(
      rootId: RenderRootId,
      updates: Array<ReconciliationUpdate>
    ) {
      return sendMessage({
        msg: "reconcile",
        payload: {
          rootId,
          updates: toThisBridge(updates),
        },
      });
    },
  };

  (addEventListener as any).call(
    window,
    "message",
    (evt: MessageEvent) => {
      if (evt.source !== parent) {
        console.log("Invalid message source received");
        return;
      }

      const msg: PluginMessage = evt.data;

      bridge.handleMessage(msg);
    },
    false
  );

  sendMessage({ msg: "plugin-ready" });

  return bridge;
};

export { initializeHostBridge, initializePluginBridge };
