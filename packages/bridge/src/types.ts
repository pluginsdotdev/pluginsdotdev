export type HostId = string;

export type PluginId = string;

export type FunctionId = number;

export type ObjectPath = string;

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
}

export interface Bridge {
  invokeFn: (fnId: FunctionId, args: any[]) => Promise<BridgeValue>;
  appendLocalState: (localState: LocalBridgeState) => void;
}
