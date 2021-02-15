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
  ToBridgeProxyValueProxyId,
  ToBridgeProxyValueReplacementValue,
  ProxyIdFactory,
  ProxyHandlerToBridge,
} from "./types";

export type ObjectPathParts = Array<string | number>;

const { stringify, parse } = JSON;

export const pathPartsToObjectPath = (parts: ObjectPathParts): ObjectPath =>
  stringify(parts);

export const objectPathToPathParts = (p: ObjectPath): ObjectPathParts =>
  parse(p);

const isObject = (o: any) => Object(o) === o;

const validPrototypes = [
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
];

/**
 * Check if we have a custom prototype.
 * No custom prototypes will make it over the bridge
 * (and we don't want them to)
 * Prototypes taken from the structured clone docs:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
 **/
const hasValidPrototype = (v: object): boolean => {
  const p = Object.getPrototypeOf(v);
  const idx = validPrototypes.indexOf(p);
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
  hostValue: HostValue,
  toBridge: ProxyHandlerToBridge
) => ToBridgeProxyValue | null;
const toBridgeProxyHandlers: Array<{
  type: ProxyType;
  handler: ToBridgeProxyHandlerWithId;
}> = [];
const fromBridgeProxyHandlers = new Map<ProxyType, FromBridgeProxyHandler>();

type FromBridgeProxyHandlerMiddleware = (
  handler: FromBridgeProxyHandler,
  bridge: Bridge,
  proxyId: ProxyId,
  value?: any
) => any;

let fromBridgeProxyHandlerMiddleware = (
  handler: FromBridgeProxyHandler,
  bridge: Bridge,
  proxyId: ProxyId,
  value?: any
) => handler(bridge, proxyId, value);

export const registerFromBridgeProxyHandlerMiddleware = (
  middleware: FromBridgeProxyHandlerMiddleware
): void => {
  const prev = fromBridgeProxyHandlerMiddleware;
  fromBridgeProxyHandlerMiddleware = (
    handler: FromBridgeProxyHandler,
    bridge: Bridge,
    proxyId: ProxyId,
    value?: any
  ) => middleware(prev.bind(null, handler), bridge, proxyId, value);
};

type UnwrappedProxyId = {
  id: number;
  type: ProxyType;
};

const wrapProxyId = (unwrapped: UnwrappedProxyId): ProxyId =>
  stringify(unwrapped) as ProxyId;

const unwrapProxyId = (proxyId: ProxyId): UnwrappedProxyId =>
  parse(proxyId) as UnwrappedProxyId;

// TODO: proxy id needs to be a string. maps don't handle object equality
const makeProxyIdFactory = (type: ProxyType) => {
  let nextId = 0;

  return (localState: LocalBridgeState, hostValue: HostValue): ProxyId => {
    const knownProxy = localState.knownProxies.get(hostValue);
    if (knownProxy) {
      return knownProxy;
    }

    const id = ++nextId;
    return wrapProxyId({
      id,
      type,
    });
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
  "plugins.dev/function",
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
    retainedValue: hostValue,
  };
};

registerToBridgeProxyHandler("plugins.dev/function", toBridgeFnProxyHandler);

const fromBridgeErrorProxyHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  const error: any = new Error(value.message);
  error.name = value.name;
  return error;
};

registerFromBridgeProxyHandler(
  "plugins.dev/error",
  fromBridgeErrorProxyHandler
);

const toBridgeErrorProxyHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!(hostValue instanceof Error)) {
    return null;
  }

  return {
    proxyId: proxyId(localState, hostValue),
    replacementValue: {
      name: hostValue.name,
      message: hostValue.message,
    },
  };
};

registerToBridgeProxyHandler("plugins.dev/error", toBridgeErrorProxyHandler);

const toBridgeDateProxyHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue
) => {
  if (!(hostValue instanceof Date)) {
    return null;
  }

  // dates can pass through as-is, structured cloning handles them properly
  return {
    replacementValue: hostValue,
  };
};

registerToBridgeProxyHandler("plugins.dev/date", toBridgeDateProxyHandler);

const fromBridgeMapProxyHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  return new Map(value as Array<[any, any]>);
};

registerFromBridgeProxyHandler("plugins.dev/map", fromBridgeMapProxyHandler);
const toBridgeMapProxyHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue,
  toBridge: ProxyHandlerToBridge
) => {
  if (!(hostValue instanceof Map)) {
    return null;
  }

  return {
    proxyId: proxyId(localState, hostValue),
    replacementValue: toBridge(Array.from(hostValue.entries()), []),
  };
};

registerToBridgeProxyHandler("plugins.dev/map", toBridgeMapProxyHandler);

const fromBridgeSetProxyHandler = (
  bridge: Bridge,
  proxyId: ProxyId,
  value: any
) => {
  return new Set(value as Array<any>);
};

registerFromBridgeProxyHandler("plugins.dev/set", fromBridgeSetProxyHandler);
const toBridgeSetProxyHandler = (
  proxyId: ProxyIdFactory,
  localState: LocalBridgeState,
  hostValue: HostValue,
  toBridge: ProxyHandlerToBridge
) => {
  if (!(hostValue instanceof Set)) {
    return null;
  }

  return {
    proxyId: proxyId(localState, hostValue),
    replacementValue: toBridge(Array.from(hostValue.values()), []),
  };
};

registerToBridgeProxyHandler("plugins.dev/set", toBridgeSetProxyHandler);

const isToBridgeProxyValueProxyId = (
  v: ToBridgeProxyValue
): v is ToBridgeProxyValueProxyId =>
  !!v && typeof (v as ToBridgeProxyValueProxyId).proxyId !== "undefined";

const isToBridgeProxyValueReplacementValue = (
  v: ToBridgeProxyValue
): v is ToBridgeProxyValueReplacementValue =>
  !!v &&
  typeof (v as ToBridgeProxyValueReplacementValue).replacementValue !==
    "undefined";

const _toBridge = (
  localState: LocalBridgeState,
  bridgeProxyIds: Map<ObjectPath, ProxyId>,
  hostValue: HostValue,
  path: Array<string | number>
): any => {
  const handlerValue = toBridgeProxyHandlers.reduce(
    (value, { handler }) =>
      value ||
      handler(
        localState,
        hostValue,
        (hostValue: HostValue, relativePath: Array<string | number>) =>
          _toBridge(
            localState,
            bridgeProxyIds,
            hostValue,
            path.concat(relativePath)
          )
      ),
    null as ToBridgeProxyValue | null
  );

  if (handlerValue) {
    if (isToBridgeProxyValueProxyId(handlerValue)) {
      const { proxyId } = handlerValue;
      if (typeof handlerValue.retainedValue !== "undefined") {
        const { retainedValue } = handlerValue;
        localState.localProxies.set(proxyId, retainedValue);
        localState.knownProxies.set(retainedValue, proxyId);
      }
      bridgeProxyIds.set(pathPartsToObjectPath(path), proxyId);
    }

    // TODO: should we recursively process replacementValue? (here and in frombridge?)
    return isToBridgeProxyValueReplacementValue(handlerValue)
      ? handlerValue.replacementValue
      : null;
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

const getAtPath = (container: any, path: ObjectPathParts): any =>
  path.reduce((o, part) => (o ? o[part] : null), container);

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
    const { type } = unwrapProxyId(proxyId);
    if (!fromBridgeProxyHandlers.has(type)) {
      throw new UnregisteredProxyTypeError(type);
    }
    const handler = fromBridgeProxyHandlers.get(type)!;
    const pathParts = objectPathToPathParts(path);
    const val = getAtPath(stubbedBridgeValue, pathParts);
    const replacedValue = fromBridgeProxyHandlerMiddleware(
      handler,
      bridge,
      proxyId,
      val
    );
    stubbedBridgeValue = assignAtPath(
      stubbedBridgeValue,
      pathParts,
      replacedValue
    );
  }

  return stubbedBridgeValue;
};
