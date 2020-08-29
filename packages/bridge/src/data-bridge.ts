export type FunctionId = number;

export type ObjectPath = string;
export type ObjectPathParts = Array<string | number>;

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

/**
 * BridgeDataContainer contains data suitable for transmission over the bridge and the
 * state required to be kept to facilitate further invocations of any transmitted
 * functions.
 **/
export type BridgeDataContainer = BridgeValue & LocalBridgeState;

/**
 * InternalBridgeDataContainer is an implementation detail we use because
 * we fill in the bridgeData after filling in bridgeFns and localFns.
 **/
type InternalBridgeDataContainer = Omit<BridgeDataContainer, "bridgeData">;

type HostValue = Readonly<any> | number | string | boolean | null;

const pathPartsToObjectPath = (parts: ObjectPathParts): ObjectPath =>
  JSON.stringify(parts);

const objectPathToPathParts = (p: ObjectPath): ObjectPathParts => JSON.parse(p);

const isObject = (o: any) => Object(o) === o;

let globalFnId = 0;

const _toBridge = (
  hostValue: HostValue,
  bdc: InternalBridgeDataContainer,
  path: Array<string | number>
): [InternalBridgeDataContainer, any] => {
  if (typeof hostValue === "function") {
    // functions are referred to by fnId on the plugin side and are looked up and invoked by fnId on the host side.
    // a map of json path in the bridgeData to fnId is passed alongside bridgeData to avoid any possibility of
    // contamination by hosts
    const fnId = ++globalFnId;
    bdc.bridgeFns.set(pathPartsToObjectPath(path), fnId);
    bdc.localFns.set(fnId, hostValue);
    return [bdc, null];
  } else if (Array.isArray(hostValue)) {
    // arrays are traversed item by item, each is converted from host->plugin
    // TODO: for large arrays, we may want to bail if they are monomorphic (by declaration or partial testing)
    const pluginObj = hostValue.map((hostVal, idx) => {
      const [_bdc, pluginVal] = _toBridge(hostVal, bdc, path.concat(idx));
      bdc = _bdc;
      return pluginVal;
    });
    return [bdc, pluginObj];
  } else if (
    typeof hostValue === "object" &&
    hostValue &&
    isObject(hostValue)
  ) {
    // objects are traversed property by property, each is converted from host->plugin
    const pluginObj = Object.keys(hostValue).reduce(
      (p: { [key: string]: any }, key: string) => {
        const [_bdc, val] = _toBridge(hostValue[key], bdc, path.concat(key));
        p[key] = val;
        bdc = _bdc;
        return p;
      },
      {}
    );
    return [bdc, pluginObj];
  }

  return [bdc, hostValue];
};

/**
 * Construct a BridgeDataContainer from a host object.
 * The BridgeDataContainer contains a representation of hostValue suitable for
 * transport to across domains and the state needed to bridge further interactions
 * between the host and plugin. This state can be used, for example, to lookup a
 * function by ID.
 **/
const toBridge = (hostValue: HostValue): BridgeDataContainer => {
  const internalBdc = {
    bridgeFns: new Map<ObjectPath, FunctionId>(),
    localFns: new Map<FunctionId, Function>()
  };

  const [bdc, bridgeData] = _toBridge(hostValue, internalBdc, []);

  return {
    ...bdc,
    bridgeData
  };
};

/**
 * Assign container@path the value, val.
 **/
const assignAtPath = (container: any, path: ObjectPathParts, val: any): any => {
  const pathLen = path.length;
  if (!pathLen) {
    return val;
  }

  path.reduce((o, part, idx) => {
    if (idx === pathLen - 1) {
      // last item
      o[part] = val;
    } else if (!o[part]) {
      o[part] = typeof part === "number" ? [] : {};
    }
    return o[part];
  }, container);

  return container;
};

interface Bridge {
  invokeFn: (fnId: FunctionId, args: any[]) => Promise<BridgeValue>;
  appendLocalState: (localState: LocalBridgeState) => void;
}

const wrapFnFromBridge = (
  bridge: Bridge,
  fnId: FunctionId
): ((...args: any[]) => any) => {
  return (...args: any[]): any => {
    // convert our args to something we can send over the bridge
    const { bridgeData, localFns, bridgeFns } = toBridge({ args });
    // update our local state to capture any passed functions
    bridge.appendLocalState({ localFns });
    // invoke the function
    return bridge.invokeFn(fnId, bridgeData).then(
      // unwrap the function's return value
      fromBridge.bind(null, bridge)
    ); // TODO: catch and unwrap any exception
  };
};

/**
 * Given a bridge and a bridgeValue, construct a regular object with all
 * functions on the bridgeValue proxied back over the bridge.
 * By nature of our proxy logic, bridge may be mutated on future invocations
 * of properties of the returned object.
 **/
const fromBridge = (
  bridge: Bridge,
  bridgeValue: Readonly<BridgeValue>
): any => {
  const { bridgeFns } = bridgeValue;
  let stubbedBridgeValue = bridgeValue.bridgeData;
  const iter = bridgeValue.bridgeFns.entries();
  for (let next = iter.next(); !next.done; next = iter.next()) {
    const [path, fn] = next.value;
    stubbedBridgeValue = assignAtPath(
      stubbedBridgeValue,
      objectPathToPathParts(path),
      wrapFnFromBridge(bridge, fn)
    );
  }

  return stubbedBridgeValue;
};

export { pathPartsToObjectPath, objectPathToPathParts, toBridge, fromBridge };
