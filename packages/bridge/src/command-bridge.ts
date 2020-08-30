import type {
  Bridge,
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

type BridgeMaker = () => Promise<Bridge>;

const initializeBridge = (): Promise<BridgeMaker> => {
  let sendCommandToIntermediateFrame: null | OnReceiveCallback = null;
  let { resolve: onReady, promise: ready } = resolvablePromise();
  const onReceiveCommandFromIntermediateFrame = (command: Command) => {
    if (command.cmd === "ready") {
      onReady();
    }
  };

  return Promise.all([
    new Promise((resolve, reject) => {
      const intermediateFrame = document.createElement("iframe");
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

          resolve();
        } catch (err) {
          reject(err);
        }
      };
      document.body.appendChild(intermediateFrame);
    }),
    ready,
  ]).then(() => () =>
    Promise.resolve({
      invokeFn: (fnId: FunctionId, args: any[]): Promise<BridgeValue> => {
        return Promise.reject("f");
      },
      appendLocalState: (localState: LocalBridgeState): void => {},
    })
  );
};

export { initializeBridge };
