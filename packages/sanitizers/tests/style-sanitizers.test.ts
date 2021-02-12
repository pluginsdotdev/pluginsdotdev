import fc from "fast-check";
import {
  cssSelectorArb,
  cssStyleRuleArb,
  cssConditionArb,
  cssNamespaceURIArb,
  cssNamespacePrefixArb,
} from "./arbs";
import { getStyleSanitizers } from "../src/style-sanitizers";
import { getUnescapedCssValue } from "../src/css-utils";

const pluginDomain = "https://plugins.dev";
const pluginUrl = "https://plugins.dev/my-plugin";
const rootSanitizers = getStyleSanitizers({
  pluginDomain,
  pluginUrl,
  allowedStyleValues: {},
  isPluginRoot: true,
});
const nonRootSanitizers = getStyleSanitizers({
  pluginDomain,
  pluginUrl,
  allowedStyleValues: {},
  isPluginRoot: false,
});

const forRootAndNon = (test: (sanitizers: typeof rootSanitizers) => void) => {
  test(rootSanitizers);
  test(nonRootSanitizers);
};

describe("style-sanitizers", () => {
  describe("getStyleSanitizers", () => {
    describe("selector", () => {
      it("allows good selectors", () => {
        fc.assert(
          fc.property(cssSelectorArb, (selector) => {
            const { styleRuleSanitizer } = nonRootSanitizers;
            expect(styleRuleSanitizer.selector(selector)).toEqual(
              getUnescapedCssValue(selector)
            );

            const { styleRuleSanitizer: rootSanitizer } = rootSanitizers;
            if (/:host/.test(selector)) {
              expect(() => {
                rootSanitizer.selector(selector);
              }).toThrow();
            } else {
              expect(rootSanitizer.selector(selector)).toEqual(
                getUnescapedCssValue(selector)
              );
            }
          })
        );
      });

      it("prevents rules in selectors", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ styleRuleSanitizer }) => {
              expect(() => {
                styleRuleSanitizer.selector(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });

    describe("condition", () => {
      it("allows good conditions", () => {
        fc.assert(
          fc.property(cssConditionArb, (condition) => {
            forRootAndNon(({ mediaRuleSanitizer }) => {
              expect(mediaRuleSanitizer.condition(condition)).toEqual(
                getUnescapedCssValue(condition)
              );
            });
          })
        );
      });

      it("prevents rules in conditions", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ mediaRuleSanitizer }) => {
              expect(() => {
                mediaRuleSanitizer.condition(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });

    describe("namespace", () => {
      it("allows good namespaceURIs", () => {
        fc.assert(
          fc.property(cssNamespaceURIArb, (namespaceURI) => {
            forRootAndNon(({ namespaceRuleSanitizer }) => {
              expect(namespaceRuleSanitizer.namespaceURI(namespaceURI)).toEqual(
                getUnescapedCssValue(namespaceURI)
              );
            });
          })
        );
      });

      it("prevents rules in namespaceURI", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ namespaceRuleSanitizer }) => {
              expect(() => {
                namespaceRuleSanitizer.namespaceURI(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });

    describe("namespace prefix", () => {
      it("allows good namespace prefixes", () => {
        fc.assert(
          fc.property(cssNamespacePrefixArb, (prefix) => {
            forRootAndNon(({ namespaceRuleSanitizer }) => {
              expect(namespaceRuleSanitizer.prefix(prefix)).toEqual(
                getUnescapedCssValue(prefix)
              );
            });
          })
        );
      });

      it("prevents rules in namespace prefixes", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ namespaceRuleSanitizer }) => {
              expect(() => {
                namespaceRuleSanitizer.prefix(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });

    describe("page selector", () => {
      it("allows good selectors", () => {
        fc.assert(
          fc.property(
            cssSelectorArb.filter((s) => s.indexOf(":host") < 0),
            (selector) => {
              forRootAndNon(({ pageRuleSanitizer }) => {
                expect(pageRuleSanitizer.selector(selector)).toEqual(
                  getUnescapedCssValue(selector)
                );
              });
            }
          )
        );
      });

      it("prevents rules in selectors", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ pageRuleSanitizer }) => {
              expect(() => {
                pageRuleSanitizer.selector(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });

    describe("media", () => {
      it("prevents rules in media", () => {
        fc.assert(
          fc.property(
            fc.array(cssStyleRuleArb, { minLength: 1, maxLength: 5 }),
            (styleRules) => {
              forRootAndNon(({ importRuleSanitizer }) => {
                expect(() => {
                  importRuleSanitizer.media(styleRules);
                }).toThrow();
              });
            }
          )
        );
      });
    });
  });
});
