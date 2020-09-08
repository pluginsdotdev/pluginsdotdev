export type HostId = string;

export type PluginUrl = string;

export type FunctionId = number;

export type ObjectPath = string;

export type HostValue = Readonly<any> | number | string | boolean | null;

/**
 * BridgeValue contains data suitable for transmission over the bridge
 **/
export interface BridgeValue {
  /**
   * bridgeData is the data that is safe to pass to the plugin
   **/
  bridgeData: any;
  /**
   * bridgeFns is a map from paths in bridgeData to function ids the host will recognize (through localFns)
   **/
  bridgeFns: Map<ObjectPath, FunctionId>;
}

/**
 * LocalBridgeState contains the state necessary to support invocation of functions passed
 * to a bridge through the corresponding BridgeValue.
 **/
export interface LocalBridgeState {
  /**
   * localFns is a map from function ids to the actual host function
   **/
  localFns: Map<FunctionId, Function>;
  /**
   * knownFns is a map from functions to function ids. This allows us
   * to re-use function ids for known functions.
   **/
  knownFns: Map<Function, FunctionId>;
}

export type RenderRootId = number;

export type Props = { [key: string]: any };

export interface Bridge {
  invokeFn: (fnId: FunctionId, args: any[]) => Promise<BridgeValue>;
}

export interface HostBridge extends Bridge {
  onReceiveMessageFromPlugin: (origin: string, data: any) => void;
  pluginFrameWindow: Window;
  render: (rootId: RenderRootId, props: Props) => Promise<void>;
}

export type NodeId = number | "root";

export interface ReconciliationPropUpdate {
  op: "set" | "delete";
  prop: string;
  value?: string;
}

export interface ReconciliationSetChildUpdate {
  op: "set";
  childIdx: number;
  childId: NodeId;
}

export interface ReconciliationDeleteChildUpdate {
  op: "delete";
  childId: NodeId;
}

export type ReconciliationChildUpdate =
  | ReconciliationSetChildUpdate
  | ReconciliationDeleteChildUpdate;

export interface ReconciliationTextUpdate {
  text: string;
}

export type ReconciliationUpdateTypes =
  | { propUpdates: Array<ReconciliationPropUpdate> }
  | { childUpdates: Array<ReconciliationChildUpdate> }
  | { textUpdate: ReconciliationTextUpdate };

export interface BaseReconciliationUpdate {
  nodeId: NodeId;
  type: string;
}

export type ReconciliationUpdate = BaseReconciliationUpdate &
  ReconciliationUpdateTypes;
