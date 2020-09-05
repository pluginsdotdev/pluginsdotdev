import { fromBridge, toBridge } from "./data-bridge";

import type {
  Bridge,
  HostId,
  PluginId,
  FunctionId,
  BridgeValue,
  LocalBridgeState,
} from "./types";

const intermediateFrameScript = `
  window.onReceiveCommand(function(cmd) {
    var payload = cmd.payload;
    if ( cmd.cmd === 'send' ) {
      cmd.targetWindow.postMessage(payload.msg, payload.targetOrigin);
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
  iframe: HTMLIFrameElement,
  scriptBody: string
): void => {
  if (!iframe.contentDocument) {
    throw new Error("Failed to access frame document");
  }
  const script = iframe.contentDocument.createElement("script");
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

type BridgeMaker = (pluginId: PluginId) => Promise<Bridge>;

const initializePluginBridge = (
  intermediateFrameWindow: Window,
  hostId: HostId,
  pluginId: PluginId
): Promise<{ frame: HTMLIFrameElement; domain: string }> => {
  return new Promise((resolve, reject) => {
    const url = "http://localhost:8081/tests/plugin.html"; // TODO: `https://${pluginId}.${hostId}.live.plugins.dev`;
    const frame = intermediateFrameWindow.document.createElement("iframe");
    frame.style.display = "none";
    frame.width = "0";
    frame.height = "0";
    frame.src = url;
    frame.setAttribute("sandbox", "allow-scripts");

    frame.onload = () => {
      resolve();
    };

    intermediateFrameWindow.document.body.appendChild(frame);

    return {
      frame,
      domain: intermediateFrameWindow.document.domain,
    };
  });
};

interface HostBridge extends Bridge {
  onReceiveMessageFromPlugin: (origin: string, data: any) => void;
  pluginFrameWindow: Window;
}

type InvocationId = number;

interface PluginReadyMessage {
  msg: "plugin-ready";
}

interface InvokeMessage {
  msg: "invoke";
  payload: {
    invocationId: InvocationId;
    fnId: FunctionId;
    argsBridgeValue: BridgeValue;
  };
}

interface InvocationResponseMessage {
  msg: "invocation-response";
  payload: {
    invocationId: InvocationId;
    result?: any;
    error?: any;
  };
}

interface RenderMessage {
  msg: "render";
  payload: {
    id: string;
    component?: string;
    props: { [key: string]: any };
  };
}

interface ReconcileMessage {
  msg: "reconcile";
  payload: {
    id: string;
    updates: Array<ReconciliationUpdate>;
  };
}

type PluginMessage =
  | PluginReadyMessage
  | InvokeMessage
  | InvocationResponseMessage
  | RenderMessage
  | ReconcileMessage;

type NodeId = number | "root";

interface ReconciliationPropUpdate {
  op: "set" | "delete";
  prop: string;
  value?: string;
}

interface ReconciliationChildUpdate {
  op: "set" | "delete";
  childIdx: number;
  childId: NodeId;
}

interface ReconciliationUpdate {
  nodeId: NodeId;
  propUpdate: ReconciliationPropUpdate;
  childUpdate: ReconciliationChildUpdate;
}

type PluginMessageHandler = (msg: PluginMessage) => void;

const makeBridge = async (
  intermediateFrameWindow: Window,
  sendCommandToIntermediateFrame: OnReceiveCallback,
  hostId: HostId,
  pluginId: PluginId
): Promise<HostBridge> => {
  const { frame, domain } = await initializePluginBridge(
    intermediateFrameWindow,
    hostId,
    pluginId
  );
  const frameContentWindow = frame.contentWindow;
  if (!frameContentWindow) {
    // initializePluginBridge waits for onload so this should never happen
    throw new Error("plugin frame content window unexpectedly null");
  }
  const queuedMessagesToSend = [];
  let isReady = false;
  let { resolve: onReady, promise: ready } = resolvablePromise();
  ready.then(() => {
    isReady = true;
  });

  let nextInvocationId = 0;

  const run = (msg: PluginMessage): void => {
    sendCommandToIntermediateFrame({
      cmd: "send",
      payload: {
        msg,
        targetWindow: frameContentWindow,
        targetOrigin: domain,
      },
    });
  };

  const queueOrRun = async (msg: PluginMessage): Promise<void> => {
    if (!isReady) {
      await ready;
    }

    return run(msg);
  };

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
    localFns: new Map(),
  };

  const appendLocalState = (localFns: Map<FunctionId, Function>): void => {
    for (const [fnId, fn] of localFns) {
      localState.localFns.set(fnId, fn);
    }
  };

  const bridge = {
    pluginFrameWindow: <Window>frameContentWindow,
    onReceiveMessageFromPlugin(origin: string, pluginMsg: PluginMessage) {
      // origin should always be 'null' for sandboxed iframes and we only deal with sandboxed iframes
      // but... older browsers ignore sandboxing and will give us an origin to check.
      // we already know that the message was sent from the window we expect so this is somewhat redundant.
      if (origin !== "null" && origin !== domain) {
        return;
      }

      if (pluginMsg.msg === "plugin-ready") {
        onReady();
        return;
      }

      msgHandlers.forEach((handler) => handler(pluginMsg));
    },
    async invokeFn(fnId: FunctionId, args: any[]): Promise<BridgeValue> {
      const invocationId = ++nextInvocationId;
      const { bridgeData, localFns, bridgeFns } = toBridge(args);
      appendLocalState(localFns);
      const argsBridgeValue = { bridgeData, bridgeFns };
      const pluginMsg: InvokeMessage = {
        msg: "invoke",
        payload: {
          invocationId,
          fnId,
          argsBridgeValue,
        },
      };
      await queueOrRun(pluginMsg);
      const invocationResponseMsg: InvocationResponseMessage = await waitForMsg(
        (pluginMsg: PluginMessage): pluginMsg is InvocationResponseMessage =>
          pluginMsg.msg === "invocation-response" &&
          pluginMsg.payload.invocationId === invocationId
      );
      const {
        payload: { result, error },
      } = invocationResponseMsg;
      if (error) {
        throw fromBridge(bridge, error);
      }

      return fromBridge(bridge, error);
    },
  };
  return bridge;
};

const initializeHostBridge = (hostId: HostId): Promise<BridgeMaker> => {
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

          loadSameOriginFrameScript(intermediateFrame, intermediateFrameScript);

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
      pluginId: PluginId
    ) => {
      const intermediateFrameWindow = intermediateFrame.contentWindow;
      if (!intermediateFrameWindow || !sendCommandToIntermediateFrame) {
        // we wait for onload so this should never happen
        throw new Error("intermediate frame content window unexpectedly null");
      }
      const bridge = await makeBridge(
        intermediateFrameWindow,
        sendCommandToIntermediateFrame,
        hostId,
        pluginId
      );
      bridgeByWindow.set(bridge.pluginFrameWindow, bridge);
      return bridge;
    }
  );
};

export { initializeHostBridge };
