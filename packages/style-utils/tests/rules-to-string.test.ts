import { getStyleSheetRulesStringifier } from "../src/rules-to-string";

import type { StyleRule } from "@pluginsdotdev/style-types";

describe("rules-to-string", () => {
  const pluginDomain = "https://plugins.dev";
  const pluginUrl = "https://plugins.dev/my-plugin";
  const stringify = getStyleSheetRulesStringifier({
    pluginDomain,
    pluginUrl,
    allowedStyleValues: {},
    isPluginRoot: false,
  });

  it("stringifies a simple style rule", () => {
    const rule: StyleRule = {
      type: "style",
      selector: "h1.thing > .b, .c",
      style: {
        color: "red",
      },
    };
    const stylesheetRules = {
      rules: [rule],
    };

    expect(stringify(stylesheetRules)).toEqual(
      "h1.thing > .b, .c {\n  color: red;\n}"
    );
  });
});
