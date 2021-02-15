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
  ProxyValue,
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
    localProxiesByPath: Map<ObjectPath, ProxyValue>
  ) {
    const expectedLocalProxies = new Map<ProxyId, ProxyValue>();
    const expectedKnownProxies = new Map<ProxyValue, ProxyId>();

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
        localProxiesByPath: Map<ObjectPath, ProxyValue>
      ): R;
    }
  }
}

describe("toBridge", () => {
  it("basic examples", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new Map<ProxyValue, ProxyId>(),
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
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
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
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
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
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
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
  it("should not store proxied values without a retainedValue", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };

    const fn = () => {};
    const error = new Error("message");
    const bridgeVal = toBridge(localState, { error });
    expect(bridgeVal).toMatchBridgeValue({
      bridgeData: { error: { name: error.name, message: error.message } },
      bridgeProxyIds: new Map([
        [pathPartsToObjectPath(["error"]), expect.any(Number)],
      ]),
    });
    expect(localState.localProxies.size).toEqual(0);
    expect(localState.knownProxies.has(error)).toBeFalsy();
  });
  it("should work for self-referential objects", () => {
    const obj: any = {
      a: 4,
      b: 5,
    };
    obj.self = obj;
    obj.selves = [obj];
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };
    const { bridgeData } = toBridge(localState, obj);
    expect(bridgeData.self.a).toEqual(4);
    expect(bridgeData.self.self.b).toEqual(5);
    expect(bridgeData.selves[0].b).toEqual(5);
    expect(bridgeData.selves[0].selves[0].a).toEqual(4);
  });
  it("should work for self-referential arrays", () => {
    const arr: Array<any> = [
      {
        a: 4,
        b: 5,
      },
    ];
    arr[1] = arr;
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };
    const { bridgeData } = toBridge(localState, arr);
    expect(bridgeData[0].a).toEqual(4);
    expect(bridgeData[0].b).toEqual(5);
    expect(bridgeData[1][0].a).toEqual(4);
    expect(bridgeData[1][0].b).toEqual(5);
  });
  it("should work for self-referential maps", () => {
    const map = new Map<string, any>([["a", 4]]);
    map.set("self", map);
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };
    const { bridgeData, bridgeProxyIds } = toBridge(localState, map);
    const entriesGet = (entries: Array<[string, any]>, key: string) =>
      entries.find(([k, v]) => k === key)![1];
    expect(entriesGet(bridgeData, "a")).toEqual(4);
    expect(entriesGet(entriesGet(bridgeData, "self"), "a")).toEqual(4);
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
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
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
  it("should work for self-referential objects", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };

    const obj: any = {
      a: "hi",
    };
    obj.self = obj;
    const bridgeValue = toBridge(localState, obj);
    const bridge = bridgeFromLocalState(localState);
    const fromBridgeVal = fromBridge(bridge, bridgeValue);
    expect(fromBridgeVal.a).toEqual("hi");
    expect(fromBridgeVal.self.a).toEqual("hi");
    expect(fromBridgeVal.self).toBe(fromBridgeVal);
  });
  it("should work for self-referential arrays", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };

    const arr: any = ["hi"];
    arr[1] = arr;
    const bridgeValue = toBridge(localState, arr);
    const bridge = bridgeFromLocalState(localState);
    const fromBridgeVal = fromBridge(bridge, bridgeValue);
    expect(fromBridgeVal[0]).toEqual("hi");
    expect(fromBridgeVal[1][0]).toEqual("hi");
    expect(fromBridgeVal[1]).toBe(fromBridgeVal);
  });
  it("should work for self-referential maps", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };

    const map = new Map<string, any>([["a", "hi"]]);
    map.set("self", map);
    const bridgeValue = toBridge(localState, map);
    const bridge = bridgeFromLocalState(localState);
    const fromBridgeVal = fromBridge(bridge, bridgeValue);
    expect(fromBridgeVal.get("a")).toEqual("hi");
    expect(fromBridgeVal.get("self").get("a")).toEqual("hi");
    expect(fromBridgeVal.get("self")).toBe(fromBridgeVal);
  });
  it("should work for self-referential sets", () => {
    const localState = {
      localProxies: new Map<ProxyId, ProxyValue>(),
      knownProxies: new WeakMap<ProxyValue, ProxyId>(),
    };

    const set = new Set<any>(["a"]);
    set.add(set);
    const bridgeValue = toBridge(localState, set);
    const bridge = bridgeFromLocalState(localState);
    const fromBridgeVal = fromBridge(bridge, bridgeValue);
    expect(fromBridgeVal.has("a")).toBeTruthy();
    expect(fromBridgeVal.has(fromBridgeVal)).toBeTruthy();
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
      fc.property(
        fc.anything({
          withDate: true,
          withMap: true,
          withObjectString: true,
          withSet: true,
          withTypedArray: true,
        }),
        (input: any) => {
          const localState = {
            localProxies: new Map<ProxyId, ProxyValue>(),
            knownProxies: new WeakMap<ProxyValue, ProxyId>(),
          };
          const bridgeValue = toBridge(localState, input);
          const bridge = bridgeFromLocalState(localState);
          expect(fromBridge(bridge, bridgeValue)).toEqual(input);
        }
      ),
      { seed: 1385033816, path: "13:1:1:1", endOnFailure: true }
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
            localProxies: new Map<ProxyId, ProxyValue>(),
            knownProxies: new WeakMap<ProxyValue, ProxyId>(),
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
            expect(localState.localProxies.size).toEqual(fnPaths.length);
          });
        }
      )
    );
  });

  it("should be identical other than Errors, which should be transformed", () => {
    fc.assert(
      fc.property(
        // we ensure that object keys won't conflict with function keys by restricting lengths
        fc.object({ key: fc.string(0, 5) }),
        fc.array(fc.array(fc.string(6, 8), 1, 10)),
        (simpleObj, errorPaths) => {
          const localState = {
            localProxies: new Map<ProxyId, ProxyValue>(),
            knownProxies: new WeakMap<ProxyValue, ProxyId>(),
          };
          const preBridgeVal = errorPaths.reduce(
            (obj, errorPath) =>
              setAtPath(
                obj,
                errorPath,
                new Error("message: " + errorPath.join("."))
              ),
            clone(simpleObj)
          );
          const bridgeValue = toBridge(localState, preBridgeVal);
          const bridge = bridgeFromLocalState(localState);
          const localVal = fromBridge(bridge, bridgeValue);
          expect(localVal).toMatchObject(simpleObj);
          errorPaths.forEach((errorPath) => {
            expect(getAtPath(preBridgeVal, errorPath)).not.toBe(
              getAtPath(localVal, errorPath)
            );
            expect(getAtPath(localVal, errorPath).name).toEqual("Error");
            expect(getAtPath(localVal, errorPath).message).toEqual(
              "message: " + errorPath.join(".")
            );
            expect(localState.localProxies.size).toEqual(0);
          });
        }
      )
    );
  });
});
