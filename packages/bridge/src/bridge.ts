interface InternalBridgeDataContainer {
  // bridgeFns is a map from paths in bridgeData to function ids the host will recognize (through localFns)
  bridgeFns: { [path: string]: string };
  // localFns is a map from function ids to the actual host function
  localFns: { [fnId: string]: Readonly<(...args: any[]) => any> };
}

interface BridgeDataContainer extends InternalBridgeDataContainer {
  // bridgeData is the data that is safe to pass to the plugin
  bridgeData: any;
}

type HostValue = Readonly<any> | number | string | boolean | null;

const isObject = (o: any) => Object(o) === o;

let globalFnId = 0;

const _toBridge = (
  hostValue: HostValue,
  hdc: InternalBridgeDataContainer,
  path: Array<string | number>
): [InternalBridgeDataContainer, any] => {
  if (typeof hostValue === "function") {
    // functions are referred to by fnId on the plugin side and are looked up and invoked by fnId on the host side.
    // a map of json path in the bridgeData to fnId is passed alongside bridgeData to avoid any possibility of
    // contamination by hosts
    const fnId = "" + ++globalFnId;
    hdc.bridgeFns[path.join("/")] = fnId;
    hdc.localFns[fnId] = hostValue;
    return [hdc, null];
  } else if (Array.isArray(hostValue)) {
    // arrays are traversed item by item, each is converted from host->plugin
    // TODO: for large arrays, we may want to bail if they are monomorphic (by declaration or partial testing)
    const pluginObj = hostValue.map((hostVal, idx) => {
      const [_hdc, pluginVal] = _toBridge(hostVal, hdc, path.concat(idx));
      hdc = _hdc;
      return pluginVal;
    });
    return [hdc, pluginObj];
  } else if (
    typeof hostValue === "object" &&
    hostValue &&
    isObject(hostValue)
  ) {
    // objects are traversed property by property, each is converted from host->plugin
    const pluginObj = Object.keys(hostValue).reduce(
      (p: { [key: string]: any }, key: string) => {
        const [_hdc, val] = _toBridge(hostValue[key], hdc, path.concat(key));
        p[key] = val;
        hdc = _hdc;
        return p;
      },
      {}
    );
    return [hdc, pluginObj];
  }

  return [hdc, hostValue];
};

/**
 * Construct a BridgeDataContainer from a host object.
 * The BridgeDataContainer contains a representation of hostValue suitable for
 * transport to across domains and the state needed to bridge further interactions
 * between the host and plugin. This state can be used, for example, to lookup a
 * function by ID.
 **/
const toBridge = (hostValue: HostValue): BridgeDataContainer => {
  const internalHdc = {
    bridgeFns: {},
    localFns: {}
  };

  const [hdc, bridgeData] = _toBridge(hostValue, internalHdc, []);

  return {
    ...hdc,
    bridgeData
  };
};

export { toBridge };
