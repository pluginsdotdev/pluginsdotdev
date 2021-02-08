import fc from "fast-check";
import clone = require("clone");
import {
  fromBridge,
  toBridge,
  pathPartsToObjectPath,
} from "../src/data-bridge";
import type {
  ObjectPath,
  ProxyId,
  BridgeValue,
  LocalBridgeState,
  RenderRootId,
  Props,
} from "../src/types";

expect.extend({
  toMatchMap(received: Map<any, any>, expected: Map<any, any>) {
    const expectedIter = expected.entries();
    for (
      let next = expectedIter.next();
      !next.done;
      next = expectedIter.next()
    ) {
      const [expectedKey, expectedValue] = next.value;
      if (!received.has(expectedKey)) {
        return {
          message: () =>
            this.utils.matcherHint("toMatchMap") +
            "\n\n" +
            `Expected: to contain '${this.utils.printExpected(expectedKey)}'` +
            "\n" +
            `Received: does not contain key`,
          pass: false,
        };
      }
      const receivedValue = expected.get(expectedKey);
      const expectReceived = this.isNot
        ? expect(receivedValue).not
        : expect(receivedValue);
      const valsMatch =
        typeof receivedValue === "object"
          ? expectReceived.toMatchObject(expectedValue)
          : expectReceived.toEqual(expectedValue);
    }

    return {
      message: () => "Expected map to match",
      pass: true,
    };
  },
  toMatchBridgeValue(received: BridgeValue, expected: BridgeValue) {
    expect(received).toMatchObject({
      bridgeData: expected.bridgeData,
    });
    expect(received.bridgeProxyIds).toMatchMap(expected.bridgeProxyIds);
    return {
      message: () => "Expected matching BridgeDataContainers",
      pass: true,
    };
  },
  toMatchLocalState(
    received: LocalBridgeState,
    bridgeValue: BridgeValue,
    localProxiesByPath: Map<ObjectPath, Function>
  ) {
    const expectedLocalProxies = new Map<ProxyId, Function>();
    const expectedKnownProxies = new Map<Function, ProxyId>();

    for (const [path, fnId] of bridgeValue.bridgeProxyIds) {
      const fn = localProxiesByPath.get(path);
      expect(fn).toBeTruthy();

      expect(received.localProxies.get(fnId)).toBe(fn);
      expect(received.knownProxies.get(fn!)).toEqual(fnId);
    }

    return {
      message: () => "Expected matching BridgeDataContainers",
      pass: true,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchMap(expected: Map<any, any>): R;
      toMatchBridgeValue(expected: BridgeValue): R;
      toMatchLocalState(
        bridgeValue: BridgeValue,
        localProxiesByPath: Map<ObjectPath, Function>
      ): R;
    }
  }
}

describe("toBridge", () => {
  it("basic examples", () => {
    const localState = {
      localProxies: new Map<ProxyId, Function>(),
      knownProxies: new Map<Function, ProxyId>(),
    };

    expect(toBridge(localState, 4)).toMatchBridgeValue({
      bridgeData: 4,
      bridgeProxyIds: new Map(),
    });
    expect(localState.localProxies.size).toEqual(0);
    expect(localState.knownProxies.size).toEqual(0);

    expect(toBridge(localState, true)).toMatchBridgeValue({
      bridgeData: true,
      bridgeProxyIds: new Map(),
    });
    expect(localState.localProxies.size).toEqual(0);
    expect(localState.knownProxies.size).toEqual(0);

    expect(toBridge(localState, "hello world")).toMatchBridgeValue({
      bridgeData: "hello world",
      bridgeProxyIds: new Map(),
    });
    expect(localState.localProxies.size).toEqual(0);
    expect(localState.knownProxies.size).toEqual(0);

    expect(
      toBridge(localState, { aString: "a", aBool: true, aNumber: 7.34 })
    ).toMatchBridgeValue({
      bridgeData: { aString: "a", aBool: true, aNumber: 7.34 },
      bridgeProxyIds: new Map(),
    });
    expect(localState.localProxies.size).toEqual(0);
    expect(localState.knownProxies.size).toEqual(0);

    const fn = () => 4;
    const fnBridge = toBridge(localState, fn);
    expect(fnBridge).toMatchBridgeValue({
      bridgeData: null,
      bridgeProxyIds: new Map([
        [pathPartsToObjectPath([]), expect.any(Number)],
      ]),
    });
    expect(localState).toMatchLocalState(
      fnBridge,
      new Map([[pathPartsToObjectPath([]), fn]])
    );
  });
  it("should dedup functions", () => {
    const localState = {
      localProxies: new Map<ProxyId, Function>(),
      knownProxies: new WeakMap<Function, ProxyId>(),
    };

    const fn = () => {};
    const bridgeVal = toBridge(localState, { f1: fn, f2: fn });
    expect(bridgeVal).toMatchBridgeValue({
      bridgeData: {},
      bridgeProxyIds: new Map([
        [pathPartsToObjectPath(["f1"]), expect.any(Number)],
        [pathPartsToObjectPath(["f2"]), expect.any(Number)],
      ]),
    });
    expect(localState.localProxies.size).toEqual(1);

    expect(toBridge(localState, { f1: fn, f2: fn })).toMatchObject(bridgeVal);
    expect(localState.localProxies.size).toEqual(1);
    expect(localState.knownProxies.has(fn)).toBeTruthy();
  });
  it("should reject custom prototypes in development but not in production", () => {
    const localState = {
      localProxies: new Map<ProxyId, Function>(),
      knownProxies: new WeakMap<Function, ProxyId>(),
    };

    const a = Object.create({ myInheritedProp: 4 });

    process.env.NODE_ENV = "development";
    expect(() => toBridge(localState, a)).toThrow();

    process.env.NODE_ENV = "production";
    expect(toBridge(localState, a)).toMatchBridgeValue({
      bridgeData: {},
      bridgeProxyIds: new Map(),
    });
  });
  it("nested examples", () => {
    const localState = {
      localProxies: new Map<ProxyId, Function>(),
      knownProxies: new WeakMap<Function, ProxyId>(),
    };

    const fn1 = () => {};
    const fn2 = () => {};
    const fn3 = () => {};
    const nestedBridge = toBridge(localState, {
      a: "hi",
      b: 4,
      c: fn1,
      d: {
        e: fn2,
        f: [fn3, "hello"],
      },
    });
    expect(nestedBridge).toMatchBridgeValue({
      bridgeData: {
        a: "hi",
        b: 4,
        d: {
          f: [null, "hello"],
        },
      },
      bridgeProxyIds: new Map([
        [pathPartsToObjectPath(["c"]), expect.any(Number)],
        [pathPartsToObjectPath(["d", "e"]), expect.any(Number)],
        [pathPartsToObjectPath(["d", "f", 0]), expect.any(Number)],
      ]),
    });
    expect(localState).toMatchLocalState(
      nestedBridge,
      new Map([
        [pathPartsToObjectPath(["c"]), fn1],
        [pathPartsToObjectPath(["d", "e"]), fn2],
        [pathPartsToObjectPath(["d", "f", 0]), fn3],
      ])
    );
  });
});

const bridgeFromLocalState = (localState: LocalBridgeState) => {
  return {
    render: (rootId: RenderRootId, props: Props): Promise<void> => {
      return Promise.resolve();
    },
    invokeFn: (fnId: ProxyId, args: any[]): Promise<BridgeValue> => {
      const fn = localState.localProxies.get(fnId);
      return !!fn
        ? Promise.resolve(fn.apply(null, args)).then(
            toBridge.bind(null, localState)
          )
        : Promise.reject(`No function with id '${fnId}'`);
    },
  };
};

describe("fromBridge", () => {
  it("basic examples", () => {
    const localState = {
      localProxies: new Map<ProxyId, Function>(),
      knownProxies: new WeakMap<Function, ProxyId>(),
    };

    const fn1 = () => {};
    const fn2 = () => {};
    const fn3 = () => {};
    const bridgeValue = toBridge(localState, {
      a: "hi",
      b: 4,
      c: fn1,
      d: {
        e: fn2,
        f: [fn3, "hello"],
      },
    });
    const bridge = bridgeFromLocalState(localState);
    expect(fromBridge(bridge, bridgeValue)).toMatchObject({
      a: "hi",
      b: 4,
      c: expect.any(Function),
      d: {
        e: expect.any(Function),
        f: [expect.any(Function), "hello"],
      },
    });
  });
});

const setAtPath = (obj: any, path: Array<string>, val: any) => {
  path.reduce((obj, key, idx) => {
    if (idx === path.length - 1) {
      obj[key] = val;
    } else if (!obj[key]) {
      obj[key] = {};
    }

    return obj[key];
  }, obj);

  return obj;
};

const getAtPath = (obj: any, path: Array<string>) =>
  path.reduce((obj, key, idx) => !!obj && obj[key], obj);

describe("properties", () => {
  it("should be symmetric for simple data", () => {
    fc.assert(
      fc.property(fc.object(), (obj) => {
        const localState = {
          localProxies: new Map<ProxyId, Function>(),
          knownProxies: new WeakMap<Function, ProxyId>(),
        };
        const bridgeValue = toBridge(localState, obj);
        const bridge = bridgeFromLocalState(localState);
        expect(fromBridge(bridge, bridgeValue)).toEqual(obj);
      })
    );
  });
  it("should be identical other than functions, which should proxy", () => {
    fc.assert(
      fc.property(
        // we ensure that object keys won't conflict with function keys by restricting lengths
        fc.object({ key: fc.string(0, 5) }),
        fc.array(fc.array(fc.string(6, 8), 1, 10)),
        (simpleObj, fnPaths) => {
          const localState = {
            localProxies: new Map<ProxyId, Function>(),
            knownProxies: new WeakMap<Function, ProxyId>(),
          };
          const preBridgeVal = fnPaths.reduce(
            (obj, fnPath) =>
              setAtPath(
                obj,
                fnPath,
                jest.fn(() => {})
              ),
            clone(simpleObj)
          );
          const bridgeValue = toBridge(localState, preBridgeVal);
          const bridge = bridgeFromLocalState(localState);
          const localVal = fromBridge(bridge, bridgeValue);
          expect(localVal).toMatchObject(simpleObj);
          fnPaths.forEach((fnPath) => {
            expect(getAtPath(preBridgeVal, fnPath)).not.toBe(
              getAtPath(localVal, fnPath)
            );
            getAtPath(localVal, fnPath)();
            expect(getAtPath(preBridgeVal, fnPath)).toHaveBeenCalled();
          });
        }
      )
    );
  });
});
