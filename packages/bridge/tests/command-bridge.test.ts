import { browserTest } from "@pluginsdotdev/test-utils";

import type { PluginUrl, HostBridge } from "../src/types";

jest.setTimeout(10000);

const hostPort = 8080;
const pluginPort = 8081;
const pluginUrl = "http://localhost:8081/tests/plugin.html";

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`
);

describe("initializeHostBridge", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("intermediate iframe created", async () => {
    const page = t.page();
    await page.evaluate(() =>
      (<any>window).index.initializeHostBridge({
        hostId: "host",
        hostConfig: {
          scriptNonce: "my-nonce",
        },
        reconcile: () => {},
      })
    );
    await page.waitForSelector("iframe");
    expect(await page.$("iframe")).toBeTruthy();
    await page.mainFrame().childFrames()[0].waitForSelector("script");
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector("iframe")!
            .contentDocument!.querySelector("script")!.nonce
      )
    ).toEqual("my-nonce");
  });

  it("plugin iframe created", async () => {
    const page = t.page();
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge({
          hostId: "host",
          reconcile: () => {},
        })
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
          makeBridge("http://localhost:8081/tests/plugin.html")
        );
    });
    await page.waitForSelector("iframe");
    await page.mainFrame().childFrames()[0].waitForSelector("iframe");
    expect(await page.mainFrame().childFrames()[0].$("iframe"));
  });

  it("render works", async () => {
    const page = t.page();
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge({
          hostId: "host",
          reconcile: () => {},
        })
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { hello: "world" });
        });
    });
    await page.waitForSelector("iframe");
    await page.mainFrame().childFrames()[0].waitForSelector("iframe");
    await page
      .mainFrame()
      .childFrames()[0]
      .childFrames()[0]
      .waitForSelector('div[data-root-id="234"]');
    expect(
      await page
        .mainFrame()
        .childFrames()[0]
        .childFrames()[0]
        .$('div[data-root-id="234"]')
    ).toBeTruthy();
  });

  it("render and function invocations work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const basicPropFn = (s: string) => {
        const d = document.createElement("div");
        d.setAttribute("data-prop-fn", s);
        document.body.appendChild(d);
      };
      return (<any>window).index
        .initializeHostBridge({
          hostId: "host",
          reconcile: () => {},
        })
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { basicPropFn });
        });
    });
    await page.waitForSelector('div[data-prop-fn="hello"]');
    expect(await page.$('div[data-prop-fn="hello"]')).toBeTruthy();
  });

  it("render and function 3-level invocations work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const callback2 = (s: string) => {
        const d = document.createElement("div");
        d.setAttribute("data-prop-fn", s);
        document.body.appendChild(d);
      };
      const callbackFn = (
        s: string,
        fn: (val: string, cb2: (s: string) => void) => void
      ) => {
        fn(s + " world", callback2);
      };
      return (<any>window).index
        .initializeHostBridge({
          hostId: "host",
          reconcile: () => {},
        })
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { callbackFn });
        });
    });
    await page.waitForSelector('div[data-prop-fn="hello world!"]');
    expect(await page.$('div[data-prop-fn="hello world!"]')).toBeTruthy();
  });

  it("render and promise-returning invocations work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const promiseFn = (s: string) => {
        return Promise.resolve(s + " world");
      };

      return (<any>window).index
        .initializeHostBridge({
          hostId: "host",
          reconcile: () => {},
        })
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { promiseFn });
        });
    });
    await page
      .mainFrame()
      .childFrames()[0]
      .childFrames()[0]
      .waitForSelector('div[data-promise-result="hello world"]');
    expect(
      await page
        .mainFrame()
        .childFrames()[0]
        .childFrames()[0]
        .$('div[data-promise-result="hello world"]')
    ).toBeTruthy();
  });

  it("ignores messages with bad secrets", async () => {
    const page = t.page();
    const expectedRootId = 234;
    const result = await page.evaluate((expectedRootId: number) => {
      return new Promise((resolve, reject) => {
        (<any>window).index
          .initializeHostBridge({
            hostId: "host",
            reconcile: (rootId: number) => {
              resolve(rootId);
            },
          })
          .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
            return makeBridge(
              "http://localhost:8081/tests/plugin-bad-secret.html"
            );
          })
          .then((bridge: HostBridge) => {
            return bridge.render(expectedRootId, {});
          });
      });
    }, expectedRootId);
    expect(result).toEqual(expectedRootId);
  });
});
