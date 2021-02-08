import { fromBridge, toBridge } from "./data-bridge";

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
} from "./types";

const intermediateFrameScript = `
  window.onReceiveCommand(function(cmd) {
    var payload = cmd.payload;
    if ( cmd.cmd === 'send' ) {
      payload.targetWindow.postMessage(payload.msg, payload.targetOrigin);
    }
  });
  window.addEventListener(
    'message',
    function receiveMessage(evt) {
      window.sendCommand({cmd: 'message', payload: {data: evt.data, origin: evt.origin, source: evt.source}});
    },
    false
  );
  window.sendCommand({cmd: 'ready'});
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
  | ReconcileMessage;

type PluginMessageHandler = (msg: PluginMessage) => void;

const assertNever = (n: never): never => {
  throw new Error("Unexpected branch");
};

const makeCommonBridge = (
  sendMessage: (msg: PluginMessage) => Promise<void>,
  firstClassHandlers?: Array<(bridge: Bridge, msg: PluginMessage) => boolean>
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
    knownProxies: new Map(),
  };

  const toThisBridge = (value: any): BridgeValue => {
    return toBridge(localState, value);
  };

  const handleInvokeMessage = (bridge: Bridge, msg: InvokeMessage) => {
    const { invocationId, fnId, argsBridgeValue } = msg.payload;
    const fn = localState.localProxies.get(fnId);
    if (!fn) {
      console.log("Unknown function invoked");
      // TODO: return error?
      return;
    }

    const args: Array<any> = fromBridge(bridge, argsBridgeValue);

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

  const bridge = {
    handleMessage(pluginMsg: PluginMessage) {
      // we handle all proactive (i.e. non-response) messages directly
      if (pluginMsg.msg === "invoke") {
        handleInvokeMessage(this, pluginMsg);
        return;
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
          throw fromBridge(this, payload.errorBridgeValue);
        case "result":
          return fromBridge(this, payload.resultBridgeValue);
      }
    },
  };

  const fromThisBridge = fromBridge.bind(null, bridge);

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
  pluginUrl: PluginUrl
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

  const reconcileHandler = (bridge: Bridge, msg: PluginMessage): boolean => {
    if (msg.msg !== "reconcile") {
      return false;
    }

    reconcile(msg.payload.rootId, fromBridge(bridge, msg.payload.updates));

    return true;
  };

  const firstClassHandlers = [reconcileHandler];
  const {
    bridge: commonBridge,
    fromThisBridge,
    toThisBridge,
  } = makeCommonBridge(queueOrRun, firstClassHandlers);

  const bridge = {
    ...commonBridge,
    pluginFrameWindow: frameContentWindow,
    onReceiveMessageFromPlugin(origin: string, pluginMsg: PluginMessage) {
      // origin should always be 'null' for sandboxed, non-allow-same-origin
      // iframes but should match targetOrigin otherwise
      // we already know that the message was sent from the window we expect so this is somewhat redundant.
      if (origin !== "null" && origin !== targetOrigin) {
        return;
      }

      if (pluginMsg.msg === "plugin-ready") {
        onReady();
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

const initializeHostBridge = (
  hostId: HostId,
  hostConfig: HostConfig = {},
  reconcile: (
    rootId: RenderRootId,
    updates: Array<ReconciliationUpdate>
  ) => void
): Promise<HostBridgeMaker> => {
  let sendCommandToIntermediateFrame: null | OnReceiveCallback = null;
  let { resolve: onReady, promise: ready } = resolvablePromise();
  let bridgeByWindow = new Map<Window, HostBridge>();
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
            hostConfig,
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
        pluginUrl
      );
      bridgeByWindow.set(bridge.pluginFrameWindow, bridge);
      return bridge;
    }
  );
};

const initializePluginBridge = async (
  origin: string,
  render: (rootId: RenderRootId, props: Props) => void
): Promise<PluginBridge> => {
  const renderHandler = (bridge: Bridge, msg: PluginMessage): boolean => {
    if (msg.msg !== "render") {
      return false;
    }

    const { rootId, props } = msg.payload;
    render(rootId, fromBridge(bridge, props));
    return true;
  };
  const firstClassHandlers = [renderHandler];
  const sendMessage = (msg: PluginMessage) => {
    window.parent.postMessage(msg, origin);
    return Promise.resolve();
  };
  const {
    bridge: commonBridge,
    fromThisBridge,
    toThisBridge,
  } = makeCommonBridge(sendMessage, firstClassHandlers);

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

  window.addEventListener(
    "message",
    (evt: MessageEvent) => {
      if (evt.source !== window.parent) {
        console.log("Invalid message source received");
        return;
      }

      const msg: PluginMessage = evt.data;

      bridge.handleMessage(msg);
    },
    false
  );

  window.parent.postMessage({ msg: "plugin-ready" }, origin);

  return bridge;
};

export { initializeHostBridge, initializePluginBridge };
