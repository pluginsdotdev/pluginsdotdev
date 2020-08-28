import { fromBridge, toBridge } from '../src/bridge';
import type { FunctionId, BridgeValue, BridgeDataContainer, LocalBridgeState } from '../src/bridge';

expect.extend({
  toMatchMap(received: Map<any, any>, expected: Map<any, any>) {
    const expectedIter = expected.entries();
    for ( let next = expectedIter.next(); !next.done; next = expectedIter.next() ) {
      const [expectedKey, expectedValue] = next.value;
      if ( !received.has(expectedKey) ) {
        return {
          message: () => 
            this.utils.matcherHint('toMatchMap')
            + '\n\n'
            + `Expected: to contain '${this.utils.printExpected(expectedKey)}'`
            + '\n'
            + `Received: does not contain key`,
          pass: false
        };
      }
      const receivedValue = expected.get(expectedKey);
      const expectReceived = this.isNot ? expect(receivedValue).not : expect(receivedValue);
      const valsMatch = typeof receivedValue === 'object'
                      ? expectReceived.toMatchObject(expectedValue)
                      : expectReceived.toEqual(expectedValue);
    }

    return {
      message: () => 'Expected map to match',
      pass: true
    };
  },
  toMatchBridgeDataContainer(received: BridgeDataContainer, expected: Omit<BridgeDataContainer, "localFns"> & { localFnsByPath: Map<string, Function> }) {
    expect(received).toMatchObject({
      bridgeData: expected.bridgeData
    });
    expect(received.bridgeFns).toMatchMap(expected.bridgeFns);
    const expectedLocalFns = new Map<FunctionId, Function>();
    const bridgeIter = expected.bridgeFns.keys();
    for ( let next = bridgeIter.next(); !next.done; next = bridgeIter.next() ) {
      const path = next.value;
      const fnId = received.bridgeFns.get(path);
      if ( !fnId ) {
        return {
          message: () => `Could not find received.bridgeFns.get(${path}), but '${path}' was specified in bridgeFns`,
          pass: false
        };
      }
      const fn = expected.localFnsByPath.get(path);
      if ( !fn ) {
        return {
          message: () => `Could not find localFnsByPath.get(${path}), but '${path}' was specified in bridgeFns`,
          pass: false
        };
      }
      expectedLocalFns.set(fnId, fn);
    }
    expect(received.localFns).toMatchMap(expectedLocalFns);
    return {
      message: () => 'Expected matching BridgeDataContainers',
      pass: true
    };
  }
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchMap(expected: Map<any, any>): R;
      toMatchBridgeDataContainer(expected: Omit<BridgeDataContainer, "localFns"> & { localFnsByPath: Map<string, Function> }): R;
    }
  }
}

describe('toBridge', () => {
  it('basic examples', () => {
    expect(toBridge(4)).toMatchBridgeDataContainer({
      bridgeData: 4,
      bridgeFns: new Map(),
      localFnsByPath: new Map()
    });
    expect(toBridge(true)).toMatchBridgeDataContainer({
      bridgeData: true,
      bridgeFns: new Map(),
      localFnsByPath: new Map()
    });
    expect(toBridge('hello world')).toMatchBridgeDataContainer({
      bridgeData: 'hello world',
      bridgeFns: new Map(),
      localFnsByPath: new Map()
    });
    expect(toBridge({aString: "a", aBool: true, aNumber: 7.34})).toMatchBridgeDataContainer({
      bridgeData: {aString: "a", aBool: true, aNumber: 7.34},
      bridgeFns: new Map(),
      localFnsByPath: new Map()
    });

    const fn = () => 4;
    const fnBridge = toBridge(fn);
    expect(fnBridge).toMatchBridgeDataContainer({
      bridgeData: null,
      bridgeFns: new Map([['$', expect.any(Number)]]),
      localFnsByPath: new Map([['$', fn]])
    });
  });
  it('nested examples', () => {
    const fn1 = () => {};
    const fn2 = () => {};
    const fn3 = () => {};
    const nestedBridge = toBridge({
      a: "hi",
      b: 4,
      c: fn1,
      d: {
        e: fn2,
        f: [fn3, "hello"]
      }
    });
    expect(nestedBridge).toMatchBridgeDataContainer({
      bridgeData: {
        a: "hi",
        b: 4,
        d: {
          f: [null, "hello"]
        }
      },
      bridgeFns: new Map([
        ['$.c', expect.any(Number)],
        ['$.d.e', expect.any(Number)],
        ['$.d.f.0', expect.any(Number)]
      ]),
      localFnsByPath: new Map([
        ['$.c', fn1],
        ['$.d.e', fn2],
        ['$.d.f.0', fn3]
      ])
    });
  });
});

const bridgeFromLocalFns = (localFns: BridgeDataContainer['localFns']) => {
  const localState = { localFns };
  return {
    appendLocalState: ({ localFns }: LocalBridgeState) => {
      localFns.forEach((fn, fnId) => {
        localState.localFns.set(fnId, fn);
      });
    },
    invokeFn: (fnId: FunctionId, args: any[]): Promise<BridgeValue> => {
      const fn = localFns.get(fnId);
      return !!fn
        ? Promise.resolve(fn.apply(null, args)).then(toBridge)
        : Promise.reject(`No function with id '${fnId}'`);
    }
  }
};

describe('fromBridge', () => {
  it('basic examples', () => {
    const fn1 = () => {};
    const fn2 = () => {};
    const fn3 = () => {};
    const bridgeValue = toBridge({
      a: "hi",
      b: 4,
      c: fn1,
      d: {
        e: fn2,
        f: [fn3, "hello"]
      }
    });
    const bridge = bridgeFromLocalFns(bridgeValue.localFns);
    expect(fromBridge(bridge, bridgeValue)).toMatchObject({
      a: "hi",
      b: 4,
      c: expect.any(Function),
      d: {
        e: expect.any(Function),
        f: [expect.any(Function), "hello"]
      }
    });
  });
});
