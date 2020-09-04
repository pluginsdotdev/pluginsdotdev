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
  intermediateFrame: HTMLIFrameElement,
  hostId: HostId,
  pluginId: PluginId
): { frame: HTMLIFrameElement; domain: string } => {
  if (
    !intermediateFrame.contentWindow ||
    !intermediateFrame.contentWindow.document
  ) {
    throw new Error("Intermediate frame uninitialized");
  }

  const url = "http://localhost:8081/tests/plugin.html"; // TODO: `https://${pluginId}.${hostId}.live.plugins.dev`;
  const frame = intermediateFrame.contentWindow.document.createElement(
    "iframe"
  );
  frame.style.display = "none";
  frame.width = "0";
  frame.height = "0";
  frame.src = url;
  frame.setAttribute("sandbox", "allow-scripts");
  intermediateFrame.contentWindow.document.body.appendChild(frame);

  return {
    frame,
    domain: intermediateFrame.contentWindow.document.domain,
  };
};

interface HostBridge extends Bridge {
  onReceiveMessageFromPlugin: (origin: string, data: any) => void;
  pluginFrameWindow: Window;
}

interface PluginReadyMessage {
  cmd: "plugin-ready";
}

interface InvokeMessage {
  cmd: "invoke";
  payload: {
    fnId: FunctionId;
    args: Array<any>;
  };
}

interface InvocationResponseMessage {
  cmd: "invocation-response";
  payload: {
    result?: any;
    error?: any;
  };
}

interface RenderMessage {
  cmd: "render";
  payload: {
    id: string;
    component?: string;
    props: { [key: string]: any };
  };
}

interface ReconcileMessage {
  cmd: "reconcile";
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

const makeBridge = (
  intermediateFrame: HTMLIFrameElement,
  hostId: HostId,
  pluginId: PluginId
): HostBridge => {
  const { frame, domain } = initializePluginBridge(
    intermediateFrame,
    hostId,
    pluginId
  );
  const queuedMessagesToSend = [];
  let isReady = false;

  return {
    pluginFrameWindow: <Window>frame.contentWindow,
    onReceiveMessageFromPlugin: (origin: string, data: PluginMessage) => {
      // origin should always be 'null' for sandboxed iframes and we only deal with sandboxed iframes
      // but... older browsers ignore sandboxing and will give us an origin to check.
      // we already know that the message was sent from the window we expect so this is somewhat redundant.
      if (origin !== "null" || origin !== domain) {
        return;
      }

      // TODO: handle plugin-ready message, etc.
      // ideally, we don't even return the bridge until the plugin is ready
      console.log("message!!!", origin, JSON.stringify(data));
    },
    invokeFn: (fnId: FunctionId, args: any[]): Promise<BridgeValue> => {
      return Promise.reject("f");
    },
    appendLocalState: (localState: LocalBridgeState): void => {},
  };
};

const initializeBridge = (hostId: HostId): Promise<BridgeMaker> => {
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
      const bridge = makeBridge(intermediateFrame, hostId, pluginId);
      bridgeByWindow.set(bridge.pluginFrameWindow, bridge);
      return bridge;
    }
  );
};

export { initializeBridge };
