/**
 * BridgeValue contains data suitable for transmission over the bridge
 **/
interface BridgeValue {
  /**
   * bridgeData is the data that is safe to pass to the plugin
   **/
  bridgeData: any;
  /**
   * bridgeFns is a map from paths in bridgeData to function ids the host will recognize (through localFns)
   **/
  bridgeFns: { [path: string]: string };
}

/**
 * LocalBridgeState contains the state necessary to support invocation of functions passed
 * to a bridge through the corresponding BridgeValue.
 **/
interface LocalBridgeState {
  /**
   * localFns is a map from function ids to the actual host function
   **/
  localFns: { [fnId: string]: Readonly<(...args: any[]) => any> };
}

/**
 * BridgeDataContainer contains data suitable for transmission over the bridge and the
 * state required to be kept to facilitate further invocations of any transmitted
 * functions.
 **/
type BridgeDataContainer = BridgeValue & LocalBridgeState;

/**
 * InternalBridgeDataContainer is an implementation detail we use because
 * we fill in the bridgeData after filling in bridgeFns and localFns.
 **/
type InternalBridgeDataContainer = Omit<BridgeDataContainer, "bridgeData">;

type HostValue = Readonly<any> | number | string | boolean | null;

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
    const fnId = "" + ++globalFnId;
    bdc.bridgeFns[path.join("/")] = fnId;
    bdc.localFns[fnId] = hostValue;
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
    bridgeFns: {},
    localFns: {}
  };

  const [bdc, bridgeData] = _toBridge(hostValue, internalBdc, []);

  return {
    ...bdc,
    bridgeData
  };
};

export { toBridge };
