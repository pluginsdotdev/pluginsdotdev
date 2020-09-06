import type {
  Bridge,
  BridgeValue,
  LocalBridgeState,
  ObjectPath,
  FunctionId,
} from "./types";

export type ObjectPathParts = Array<string | number>;

type HostValue = Readonly<any> | number | string | boolean | null;

const pathPartsToObjectPath = (parts: ObjectPathParts): ObjectPath =>
  JSON.stringify(parts);

const objectPathToPathParts = (p: ObjectPath): ObjectPathParts => JSON.parse(p);

const isObject = (o: any) => Object(o) === o;

let globalFnId = 0;

const _toBridge = (
  localState: LocalBridgeState,
  bridgeFns: Map<ObjectPath, FunctionId>,
  hostValue: HostValue,
  path: Array<string | number>
): any => {
  if (typeof hostValue === "function") {
    // functions are replaced by ids, which are used to communicate invocations
    // in future messages.
    // a map of json path in the bridgeData to fnId is passed alongside bridgeData
    const fnId = localState.knownFns.get(hostValue) ?? ++globalFnId;
    bridgeFns.set(pathPartsToObjectPath(path), fnId);
    localState.localFns.set(fnId, hostValue);
    localState.knownFns.set(hostValue, fnId);
    return null;
  } else if (Array.isArray(hostValue)) {
    // arrays are traversed item by item, each is converted from host->bridge
    // TODO: for large arrays, we may want to bail if they are monomorphic (by declaration or partial testing)
    const bridgeVal = hostValue.map((hostVal, idx) =>
      _toBridge(localState, bridgeFns, hostVal, path.concat(idx))
    );
    return bridgeVal;
  } else if (
    typeof hostValue === "object" &&
    hostValue &&
    isObject(hostValue)
  ) {
    // objects are traversed property by property, each is converted from host->bridge
    const bridgeVal = Object.keys(hostValue).reduce(
      (p: { [key: string]: any }, key: string) => {
        p[key] = _toBridge(
          localState,
          bridgeFns,
          hostValue[key],
          path.concat(key)
        );
        return p;
      },
      {}
    );
    return bridgeVal;
  }

  return hostValue;
};

/**
 * Construct a BridgeValue from local state and a host object.
 * The BridgeValue contains a representation of hostValue suitable for
 * transport to across domains.
 * The local state is needed to bridge further interactions
 * between the host and plugin. This state can be used, for example,
 * to lookup a function by ID.
 **/
const toBridge = (
  localState: LocalBridgeState,
  hostValue: HostValue
): BridgeValue => {
  const bridgeFns = new Map<ObjectPath, FunctionId>();

  const bridgeData = _toBridge(localState, bridgeFns, hostValue, []);

  return {
    bridgeData,
    bridgeFns,
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

const wrapFnFromBridge = (
  bridge: Bridge,
  fnId: FunctionId
): ((...args: any[]) => any) => {
  return (...args: any[]): any => bridge.invokeFn(fnId, args); // TODO: catch and unwrap any exception
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
