export type HostId = string;

export type PluginUrl = string;

export type Opaque<K, T> = T & { __TYPE__: K };

export type ProxyType = Opaque<"ProxyType", string>;
export type ProxyId = Opaque<"ProxyId", string>;

export type ObjectPath = string;

export type HostValue = Readonly<any> | number | string | boolean | null;

export type ProxyValue = any;

/**
 * BridgeValue contains data suitable for transmission over the bridge
 **/
export interface BridgeValue {
  /**
   * bridgeData is the data that is safe to pass to the plugin
   **/
  bridgeData: any;

  /**
   * bridgeProxyIds is a map from paths in bridgeData to ids.
   * This allows for proxying non-cloneable objects across the bridge.
   * For example, functions are automatically maintained in a map and
   * referenced by id.
   **/
  bridgeProxyIds: Map<ObjectPath, ProxyId>;
}

/**
 * LocalBridgeState contains the state necessary to support invocation of functions passed
 * to a bridge through the corresponding BridgeValue.
 **/
export interface LocalBridgeState {
  /**
   * localProxies is a map from proxy ids to the actual host object.
   * For example, this would map from an id to a function, to allow invocation
   * of functions across the bridge.
   **/
  localProxies: Map<ProxyId, ProxyValue>;

  /**
   * knownProxies is a map from proxies to proxy ids. This allows us
   * to re-use proxy ids for known proxies.
   **/
  knownProxies: WeakMap<ProxyValue, ProxyId>;
}

export type ToBridgeProxyValueProxyId = {
  proxyId: ProxyId;
  retainedValue?: HostValue;
};

export type ToBridgeProxyValueReplacementValue = {
  replacementValue: HostValue;
};

/**
 * This is the type returned by a to-bridge proxy (registered via
 * dataBridge::registerToBridgeProxyHandler).
 *
 * proxyId
 *   If a to-bridge proxy returns a proxyId, we will include a mapping from
 *   path of the in-process item to the proxyId in the bridge-ified value.
 *
 *   This map is used to indicate that some special handling must be
 *   performed to fromBridge the value at that path. ProxyIds contain
 *   the type of the proxy, which indicates what that handling should be.
 *
 * replacementValue
 *   If a to-bridge proxy returns a replacementValue, we will include it
 *   instead of the passed hostValue in the bridge-ified data.
 *
 * retainedValue
 *   If a to-bridge proxy returns a retainedValue, we will store a mapping
 *   from the given proxyId to the retainedValue in our localState.
 **/
export type ToBridgeProxyValue =
  | null
  | ToBridgeProxyValueProxyId
  | ToBridgeProxyValueReplacementValue
  | (ToBridgeProxyValueProxyId & ToBridgeProxyValueReplacementValue);

/**
 * ProxyIdFactory generates a new ProxyId
 **/
export type ProxyIdFactory = (
  localState: LocalBridgeState,
  hostValue: HostValue
) => ProxyId;

/**
 * ToBridgeProxyHandler is a handler for a proxy type.
 * This allows the implementer to handle custom proxying to the bridge.
 **/
export type ToBridgeProxyHandler = (
  proxyIdFactory: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => ToBridgeProxyValue | null;

/**
 * FromBridgeProxyHandler is a handler for a proxy type.
 * This allows the implementer to handle custom proxying from the bridge.
 *
 * bridge is the Bridge instance
 * proxyId is the id returned in the corresponding ToBridgeProxyHandler
 * value is the replacement value returned in the corresponding ToBridgeProxyHandler
 **/
export type FromBridgeProxyHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value?: any
) => any;

export type RenderRootId = number;

export type Props = { [key: string]: any };

export interface Bridge {
  invokeFn: (fnId: ProxyId, args: any[]) => Promise<BridgeValue>;
}

export interface HostBridge extends Bridge {
  onReceiveMessageFromPlugin: (origin: string, data: any) => void;
  pluginFrameWindow: Window;
  render: (rootId: RenderRootId, props: Props) => Promise<void>;
}

export interface PluginBridge extends Bridge {
  reconcile: (
    rootId: RenderRootId,
    updates: Array<ReconciliationUpdate>
  ) => Promise<void>;
}

export type NodeId = string;

export interface ReconciliationSetPropUpdate {
  op: "set";
  prop: string;
  value: any;
}

export interface ReconciliationDeletePropUpdate {
  op: "delete";
  prop: string;
  value?: undefined;
}

export type ReconciliationPropUpdate =
  | ReconciliationSetPropUpdate
  | ReconciliationDeletePropUpdate;

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

export type EventHandler = (
  nodeId: NodeId,
  eventType: string,
  event: any
) => void;

export interface EventOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
}

export interface ReconciliationSetHandlerUpdate {
  op: "set";
  eventType: string;
  eventOptions: EventOptions;
  handler: EventHandler;
}

export interface ReconciliationDeleteHandlerUpdate {
  op: "delete";
  eventType: string;
  eventOptions: EventOptions;
  handler: EventHandler;
}

export type ReconciliationHandlerUpdate =
  | ReconciliationSetHandlerUpdate
  | ReconciliationDeleteHandlerUpdate;

export interface ReconciliationUpdate {
  nodeId: NodeId;
  type: string;
  propUpdates?: Array<ReconciliationPropUpdate> | null | undefined;
  childUpdates?: Array<ReconciliationChildUpdate> | null | undefined;
  textUpdate?:
    | {
        text: string;
      }
    | null
    | undefined;
  handlerUpdates?: Array<ReconciliationHandlerUpdate> | null | undefined;
}
