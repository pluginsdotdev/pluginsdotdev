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
    function receiveMessage(event) {
      window.sendCommand({cmd: 'message', payload: event});
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
    data: any;
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
): Promise<HTMLIFrameElement> => {
  if (
    !intermediateFrame.contentWindow ||
    !intermediateFrame.contentWindow.document
  ) {
    return Promise.reject(new Error("Intermediate frame uninitialized"));
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

  // wait for ready
  return Promise.resolve(frame);
};

const makeBridge = (
  intermediateFrame: HTMLIFrameElement,
  hostId: HostId,
  pluginId: PluginId
): Promise<Bridge> => {
  return initializePluginBridge(intermediateFrame, hostId, pluginId).then(
    (frame: HTMLIFrameElement) => ({
      invokeFn: (fnId: FunctionId, args: any[]): Promise<BridgeValue> => {
        return Promise.reject("f");
      },
      appendLocalState: (localState: LocalBridgeState): void => {},
    })
  );
};

const initializeBridge = (hostId: HostId): Promise<BridgeMaker> => {
  let sendCommandToIntermediateFrame: null | OnReceiveCallback = null;
  let { resolve: onReady, promise: ready } = resolvablePromise();
  const onReceiveCommandFromIntermediateFrame = (command: Command) => {
    switch (command.cmd) {
      case "ready":
        onReady();
        return;
      case "message":
        const { data, origin, source } = command.payload;
        // TODO: allow plugin bridges to register for messages from their source and check origin
        return;
    }
  };

  return Promise.all([
    new Promise<HTMLIFrameElement>((resolve, reject) => {
      const intermediateFrame = document.createElement("iframe");
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
  ]).then(([intermediateFrame, _]: [HTMLIFrameElement, any]) =>
    makeBridge.bind(null, intermediateFrame, hostId)
  );
};

export { initializeBridge };
