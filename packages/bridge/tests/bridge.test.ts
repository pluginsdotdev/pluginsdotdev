import { toBridge } from '../src/bridge';

describe('toBridge', () => {
  it('basic examples', () => {
    expect(toBridge(4)).toMatchObject({
      bridgeData: 4,
      bridgeFns: {},
      localFns: {}
    });
    expect(toBridge(true)).toMatchObject({
      bridgeData: true,
      bridgeFns: {},
      localFns: {}
    });
    expect(toBridge('hello world')).toMatchObject({
      bridgeData: 'hello world',
      bridgeFns: {},
      localFns: {}
    });
    expect(toBridge({aString: "a", aBool: true, aNumber: 7.34})).toMatchObject({
      bridgeData: {aString: "a", aBool: true, aNumber: 7.34},
      bridgeFns: {},
      localFns: {}
    });

    const fn = () => 4;
    const fnBridge = toBridge(fn);
    const rootPath = '';
    expect(fnBridge).toMatchObject({
      bridgeData: null,
      bridgeFns: {[rootPath]: expect.any(String)}
    });
    expect(fnBridge.localFns).toHaveProperty(fnBridge.bridgeFns[rootPath], fn);
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
    expect(nestedBridge).toMatchObject({
      bridgeData: {
        a: "hi",
        b: 4,
        d: {
          f: [null, "hello"]
        }
      },
      bridgeFns: {
        'c': expect.any(String),
        'd/e': expect.any(String),
        'd/f/0': expect.any(String)
      }
    });
    expect(nestedBridge.localFns)
      .toHaveProperty(nestedBridge.bridgeFns['c'], fn1);
    expect(nestedBridge.localFns)
      .toHaveProperty(nestedBridge.bridgeFns['d/e'], fn2);
    expect(nestedBridge.localFns)
      .toHaveProperty(nestedBridge.bridgeFns['d/f/0'], fn3);
  });
});
