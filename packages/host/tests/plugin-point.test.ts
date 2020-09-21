import { browserTest } from "@pluginsdotdev/test-utils";

const hostPort = 8080;
const pluginPort = 8081;

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`
);

describe("plugin-point", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("basic rendering should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      window.ReactDOM.render(
        window.React.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          props: {
            className: "hello",
            title: "world",
          },
        }),
        document.getElementById("root")
      );
    });
    await page.waitForSelector("div.hello");
    expect(await page.$("div.hello")).toBeTruthy();
    expect(await page.$eval("p", (p) => p.innerHTML)).toEqual("world");
  });
});
