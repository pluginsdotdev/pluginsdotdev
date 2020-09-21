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

describe("react-plugin", () => {
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
      nodeId: expect.any(Number),
      type: "text",
      textUpdate: {
        text: "Hello World!",
      },
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "p",
      propUpdates: [],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "div",
      propUpdates: [
        {
          op: "set",
          prop: "className",
          value: "my-class",
        },
      ],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: 0,
      type: "root",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
  });

  it("rendering with host component should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge(
          "host",
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
          bridge.render(123, {
            className: "my-class",
            title: "Hello World!",
            useHostComponent: true,
          });
        });
    });
    await page.waitForSelector("div#target");
    const json = await page.evaluate(
      () => document.getElementById("target")!.textContent
    );
    const { rootId, updates } = JSON.parse(json!);
    expect(rootId).toEqual(123);

    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "text",
      textUpdate: {
        text: "Hello World!",
      },
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "p",
      propUpdates: [],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "div",
      propUpdates: [
        {
          op: "set",
          prop: "className",
          value: "my-class",
        },
      ],
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
        {
          op: "set",
          childIdx: 1,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "host:MyHostComponent",
      propUpdates: [
        {
          op: "set",
          prop: "myProp",
          value: "plugin-provided-prop",
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: 0,
      type: "root",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
  });
});
