import { browserTest } from "@pluginsdotdev/test-utils";

import type {
  PluginUrl,
  HostBridge,
  RenderRootId,
  ReconciliationUpdate,
} from "@pluginsdotdev/bridge";

const hostPort = 8080;
const pluginPort = 8081;

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`
);

describe("mutation-observing-plugin", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("basic rendering should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge(
          "host",
          {},
          (rootId: RenderRootId, updates: Array<ReconciliationUpdate>) => {
            const d = document.createElement("div");
            d.id = "target";
            d.textContent = JSON.stringify({ rootId, updates });
            document.body.appendChild(d);
          }
        )
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
          makeBridge("http://localhost:8081/tests/plugin.html")
        )
        .then((bridge: HostBridge) => {
          bridge.render(123, { className: "my-class", title: "Hello World!" });
        });
    });
    await page.waitForSelector("div#target");
    const json = await page.evaluate(
      () => document.getElementById("target")!.textContent
    );
    const { rootId, updates } = JSON.parse(json!);
    expect(rootId).toEqual(123);
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "text",
      textUpdate: {
        text: "Hello World!",
      },
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "p",
      propUpdates: [],
      handlerUpdates: [],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "div",
      handlerUpdates: [],
      propUpdates: [
        {
          op: "set",
          prop: "class",
          value: "my-class",
        },
      ],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: "0",
      type: "root",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
      ],
    });
  });

  it("rendering with host component should work", async () => {
    const page = t.page();
    const { rootId, updates } = await page.evaluate(
      () =>
        new Promise<{ rootId: number; updates: Array<ReconciliationUpdate> }>(
          (resolve, reject) => {
            (<any>window).index
              .initializeHostBridge(
                "host",
                {},
                (
                  rootId: RenderRootId,
                  updates: Array<ReconciliationUpdate>
                ) => {
                  resolve({ rootId, updates });
                }
              )
              .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
                makeBridge("http://localhost:8081/tests/plugin.html")
              )
              .then((bridge: HostBridge) => {
                bridge.render(123, {
                  className: "my-class",
                  title: "Hello World!",
                  useHostComponent: true,
                });
              });
          }
        )
    );
    expect(rootId).toEqual(123);

    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "text",
      textUpdate: {
        text: "Hello World!",
      },
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "p",
      propUpdates: [],
      handlerUpdates: [],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "div",
      handlerUpdates: [],
      propUpdates: [
        {
          op: "set",
          prop: "class",
          value: "my-class",
        },
      ],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
        {
          op: "set",
          childIdx: 1,
          childId: expect.any(String),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(String),
      type: "host:MyHostComponent",
      propUpdates: [], // TODO: props get filled in on the next turn
    });
    expect(updates.find((u) => u.type === "root")).toMatchObject({
      nodeId: "0",
      type: "root",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(String),
        },
      ],
    });
  });
});
