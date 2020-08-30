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
    console.log('in iframe', cmd);
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

const createBridgeToPlugin = (pluginId: PluginId): Promise<Bridge> =>
  new Promise((resolve, reject) => {
    const intermediateFrame = document.createElement("iframe");
    let onReceiveCallback: null | OnReceiveCallback = null;
    intermediateFrame.onload = () => {
      try {
        if (!intermediateFrame.contentWindow) {
          throw new Error("No window access");
        }
        (<any>intermediateFrame.contentWindow).onReceiveCommand = (
          cb: OnReceiveCallback
        ) => {
          onReceiveCallback = cb;
        };
        (<any>intermediateFrame.contentWindow).sendCommand = (
          cmd: Command
        ): void => {
          console.log("in parent", cmd);
        };
        loadSameOriginFrameScript(intermediateFrame, intermediateFrameScript);
        resolve({
          invokeFn: (fnId: FunctionId, args: any[]): Promise<BridgeValue> => {
            return Promise.reject("f");
          },
          appendLocalState: (localState: LocalBridgeState): void => {},
        });
      } catch (err) {
        reject(err);
      }
    };
    document.body.appendChild(intermediateFrame);
  });
