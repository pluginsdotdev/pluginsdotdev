import type {
  Bridge,
  BridgeValue,
  LocalBridgeState,
  ObjectPath,
  ProxyId,
  HostValue,
  ProxyType,
  FromBridgeProxyHandler,
  ToBridgeProxyHandler,
  ToBridgeProxyValue,
  ProxyIdFactory,
} from "./types";

export type ObjectPathParts = Array<string | number>;

export const pathPartsToObjectPath = (parts: ObjectPathParts): ObjectPath =>
  JSON.stringify(parts);

export const objectPathToPathParts = (p: ObjectPath): ObjectPathParts =>
  JSON.parse(p);

const isObject = (o: any) => Object(o) === o;

/**
 * Check if we have a custom prototype.
 * No custom prototypes will make it over the bridge
 * (and we don't want them to)
 * Prototypes taken from the structured clone docs:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
 **/
const hasValidPrototype = (v: object): boolean => {
  const p = Object.getPrototypeOf(v);
  const idx = [
    typeof Object !== "undefined" && Object.prototype,
    typeof Date !== "undefined" && Date.prototype,
    typeof String !== "undefined" && String.prototype,
    typeof Boolean !== "undefined" && Boolean.prototype,
    typeof RegExp !== "undefined" && RegExp.prototype,
    typeof Blob !== "undefined" && Blob.prototype,
    typeof File !== "undefined" && File.prototype,
    typeof FileList !== "undefined" && FileList.prototype,
    typeof ArrayBuffer !== "undefined" && ArrayBuffer.prototype,
    typeof Int8Array !== "undefined" && Int8Array.prototype,
    typeof Uint8Array !== "undefined" && Uint8Array.prototype,
    typeof Uint8ClampedArray !== "undefined" && Uint8ClampedArray.prototype,
    typeof Int16Array !== "undefined" && Int16Array.prototype,
    typeof Uint16Array !== "undefined" && Uint16Array.prototype,
    typeof Int32Array !== "undefined" && Int32Array.prototype,
    typeof Uint32Array !== "undefined" && Uint32Array.prototype,
    typeof Float32Array !== "undefined" && Float32Array.prototype,
    typeof Float64Array !== "undefined" && Float64Array.prototype,
    typeof DataView !== "undefined" && DataView.prototype,
    typeof ImageBitmap !== "undefined" && ImageBitmap.prototype,
    typeof ImageData !== "undefined" && ImageData.prototype,
    typeof Map !== "undefined" && Map.prototype,
    typeof Set !== "undefined" && Set.prototype,
  ].indexOf(p);
  return idx >= 0;
};

/**
 * DuplicateProxyTypeError indicates that multiple proxy types were registered
 * for the same type identifier.
 **/
export class DuplicateProxyTypeError extends Error {
  static _code = "DuplicateProxyTypeError";

  code = DuplicateProxyTypeError._code;

  static is(error: Error) {
    return (error as any).code === DuplicateProxyTypeError._code;
  }

  constructor(public type: string) {
    super(`Duplicate proxy type: ${type}`);
  }
}

/**
 * UnregisteredProxyTypeError indicates that a proxy type was encountered
 * that was not previously registered.
 **/
export class UnregisteredProxyTypeError extends Error {
  static _code = "UnregisteredProxyTypeError";

  code = UnregisteredProxyTypeError._code;

  static is(error: Error) {
    return (error as any).code === UnregisteredProxyTypeError._code;
  }

  constructor(public type: string) {
    super(`Unregistered proxy type: ${type}`);
  }
}

type ToBridgeProxyHandlerWithId = (
  localState: LocalBridgeState,
  hostValue: HostValue
) => ToBridgeProxyValue | null;
const toBridgeProxyHandlers: Array<{
  type: ProxyType;
  handler: ToBridgeProxyHandlerWithId;
}> = [];
const fromBridgeProxyHandlers = new Map<ProxyType, FromBridgeProxyHandler>();

const makeProxyIdFactory = (type: ProxyType) => {
  let nextId = 0;

  return (localState: LocalBridgeState, hostValue: HostValue): ProxyId => {
    const knownProxy = localState.knownProxies.get(hostValue);
    if (knownProxy) {
      return knownProxy;
    }

    const id = ++nextId;
    return {
      id,
      type,
    };
  };
};

/**
 * registerFromBridgeProxyHandler expects a namespaced type
 * ("namespace/name") a FromBridgeProxyHandler. The FromBridgeProxyHandler
 * will be called to re-hydrate any identifiers for its proxyType.
 *
 * @throws DuplicateProxyTypeError if multiple proxies of the same type are registered.
 **/
export const registerFromBridgeProxyHandler = (
  proxyType: string,
  handler: FromBridgeProxyHandler
): void => {
  const type = proxyType as ProxyType;
  if (fromBridgeProxyHandlers.has(type)) {
    throw new DuplicateProxyTypeError(proxyType);
  }
  fromBridgeProxyHandlers.set(type, handler);
};

/**
 * registerToBridgeProxyHandler expects a namespaced type
 * ("namespace/name") a FromBridgeProxyHandler. The FromBridgeProxyHandler
 * will be called to re-hydrate any identifiers for its proxyType.
 *
 * @throws DuplicateProxyTypeError if multiple proxies of the same type are registered.
 **/
export const registerToBridgeProxyHandler = (
  proxyType: string,
  handler: ToBridgeProxyHandler
): void => {
  const type = proxyType as ProxyType;
  if (toBridgeProxyHandlers.some((handler) => handler.type === type)) {
    throw new DuplicateProxyTypeError(proxyType);
  }
  toBridgeProxyHandlers.push({
    type,
    handler: handler.bind(null, makeProxyIdFactory(type)),
  });
};

const fromBridgeFnProxyHandler = (bridge: Bridge, proxyId: ProxyId) => {
  // TODO: catch and unwrap any exception
  return (...args: any[]): Promise<any> => bridge.invokeFn(proxyId, args);
};

registerFromBridgeProxyHandler(
  "pluginsdotdev/function",
  fromBridgeFnProxyHandler
);

const toBridgeFnProxyHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (typeof hostValue !== "function") {
    return null;
  }

  // functions are replaced by ids, which are used to communicate
  // invocations in future messages.
  // a map of json path in the bridgeData to proxyId is passed alongside
  // bridgeData
  return {
    proxyId: proxyId(localState, hostValue),
  };
};

registerToBridgeProxyHandler("pluginsdotdev/function", toBridgeFnProxyHandler);

const _toBridge = (
  localState: LocalBridgeState,
  bridgeProxyIds: Map<ObjectPath, ProxyId>,
  hostValue: HostValue,
  path: Array<string | number>
): any => {
  const handlerValue = toBridgeProxyHandlers.reduce(
    (value, { handler }) => value || handler(localState, hostValue),
    null as ToBridgeProxyValue | null
  );

  if (handlerValue) {
    if (typeof handlerValue.proxyId !== "undefined") {
      const { proxyId } = handlerValue;
      localState.localProxies.set(proxyId, hostValue);
      localState.knownProxies.set(hostValue, proxyId);
      bridgeProxyIds.set(pathPartsToObjectPath(path), proxyId);
      return null;
    }

    if (typeof handlerValue.replacementValue !== "undefined") {
      return handlerValue.replacementValue;
    }
  } else if (Array.isArray(hostValue)) {
    // arrays are traversed item by item, each is converted from host->bridge
    // TODO: for large arrays, we may want to bail if they are monomorphic (by declaration or partial testing)
    const bridgeVal = hostValue.map((hostVal, idx) =>
      _toBridge(localState, bridgeProxyIds, hostVal, path.concat(idx))
    );
    return bridgeVal;
  } else if (
    typeof hostValue === "object" &&
    hostValue &&
    isObject(hostValue)
  ) {
    if (process.env.NODE_ENV !== "production") {
      if (!hasValidPrototype(hostValue)) {
        console.error(
          "Attempted to send an object with a custom prototype over the bridge.",
          hostValue
        );
        throw new Error(
          "Attempted to send an object with a custom prototype over the bridge."
        );
      }
    }

    // objects are traversed property by property, each is converted from host->bridge
    const bridgeVal = Object.keys(hostValue).reduce(
      (p: { [key: string]: any }, key: string) => {
        p[key] = _toBridge(
          localState,
          bridgeProxyIds,
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
export const toBridge = (
  localState: LocalBridgeState,
  hostValue: HostValue
): BridgeValue => {
  const bridgeProxyIds = new Map<ObjectPath, ProxyId>();

  const bridgeData = _toBridge(localState, bridgeProxyIds, hostValue, []);

  return {
    bridgeData,
    bridgeProxyIds,
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

/**
 * Given a bridge and a bridgeValue, construct a regular object with all
 * functions on the bridgeValue proxied back over the bridge.
 * By nature of our proxy logic, bridge may be mutated on future invocations
 * of properties of the returned object.
 **/
export const fromBridge = (
  bridge: Bridge,
  bridgeValue: Readonly<BridgeValue>
): any => {
  const { bridgeProxyIds } = bridgeValue;
  let stubbedBridgeValue = bridgeValue.bridgeData;
  const iter = bridgeValue.bridgeProxyIds.entries();
  for (let next = iter.next(); !next.done; next = iter.next()) {
    const [path, proxyId] = next.value;
    const { type } = proxyId;
    if (!fromBridgeProxyHandlers.has(type)) {
      throw new UnregisteredProxyTypeError(type);
    }
    const handler = fromBridgeProxyHandlers.get(type)!;
    stubbedBridgeValue = assignAtPath(
      stubbedBridgeValue,
      objectPathToPathParts(path),
      handler(bridge, proxyId)
    );
  }

  return stubbedBridgeValue;
};
