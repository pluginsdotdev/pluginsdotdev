import fs from "fs";
import { pem2jwk } from "pem-jwk";
import jwt from "jsonwebtoken";
import { browserTest } from "@pluginsdotdev/test-utils";

import type {
  PluginUrl,
  HostBridge,
  RenderRootId,
  ReconciliationUpdate,
} from "@pluginsdotdev/bridge";

const hostId = "host";
const hostPort = 8080;
const pluginPort = 8081;
const pluginUrl = `http://localhost:${pluginPort}/tests/plugin.html`;
const kid = "123";
const userId = "user-123";
const groups = {
  "group-123": "admin",
};
const jwtString = jwt.sign(
  {
    sub: userId,
    groups,
  },
  fs.readFileSync("tests/private.pem").toString("utf8"),
  {
    algorithm: "RS256",
    audience: `localhost:${pluginPort}`,
    issuer: "plugins.dev",
    keyid: kid,
    expiresIn: "1 day",
  }
);

const jwksHandler = (pathname: string) => {
  if (pathname !== "/.well-known/jwks.json") {
    return null;
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keys: [
        {
          ...pem2jwk(fs.readFileSync("tests/public.pem").toString("utf8")),
          kid,
        },
      ],
    }),
  };
};

const pluginHandler = (pathname: string) => {
  if (pathname !== "/tests/plugin.html") {
    return null;
  }

  return {
    status: 200,
    headers: {
      "Set-Cookie": `${hostId}--jwt=${jwtString}`,
    },
  };
};

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`,
  [jwksHandler, pluginHandler]
);

describe("mutation-observing-plugin", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("basic rendering should work", async () => {
    const page = t.page();
    await page.evaluate(
      (hostId: string, pluginUrl: string) => {
        (<any>window).index
          .initializeHostBridge({
            hostId,
            hostConfig: {},
            reconcile: (
              rootId: RenderRootId,
              updates: Array<ReconciliationUpdate>
            ) => {
              console.log("RECONCILE", JSON.stringify(updates));
              const d = document.createElement("div");
              d.id = "target";
              d.textContent = JSON.stringify({ rootId, updates });
              document.body.appendChild(d);
            },
          })
          .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
            makeBridge(pluginUrl)
          )
          .then((bridge: HostBridge) => {
            bridge.render(123, {
              className: "my-class",
              title: "Hello World!",
            });
          })
          .catch((err: Error) => {
            fail("Failed to initialize: " + err.message);
          });
      },
      hostId,
      pluginUrl
    );
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
      (hostId: string, pluginUrl: string) =>
        new Promise<{ rootId: number; updates: Array<ReconciliationUpdate> }>(
          (resolve, reject) => {
            (<any>window).index
              .initializeHostBridge({
                hostId,
                hostConfig: {},
                reconcile: (
                  rootId: RenderRootId,
                  updates: Array<ReconciliationUpdate>
                ) => {
                  resolve({ rootId, updates });
                },
              })
              .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
                makeBridge(pluginUrl)
              )
              .then((bridge: HostBridge) => {
                bridge.render(123, {
                  className: "my-class",
                  title: "Hello World!",
                  useHostComponent: true,
                });
              });
          }
        ),
      hostId,
      pluginUrl
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
