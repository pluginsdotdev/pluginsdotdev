import { sanitizeProps, safePrefix } from "../src/sanitize-props";

describe("sanitize-props", () => {
  it("should sanitize dangerouslySetInnerHTML", () => {
    expect(
      sanitizeProps("host", "plugin", "div", {
        className: "hello-world",
        dangerouslySetInnerHTML: "oops",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should sanitize unsafe ids", () => {
    expect(
      sanitizeProps("host", "plugin", "div", {
        className: "hello-world",
        id: "oops",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should sanitize unsafe names", () => {
    expect(
      sanitizeProps("host", "plugin", "div", {
        className: "hello-world",
        name: "oops",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should allow safe names", () => {
    const name = `${safePrefix()}oops}`;
    expect(
      sanitizeProps("host", "plugin", "div", { className: "hello-world", name })
    ).toEqual({ className: "hello-world", name });
  });

  it("should allow safe ids", () => {
    const id = `${safePrefix()}oops}`;
    expect(
      sanitizeProps("host", "plugin", "div", { className: "hello-world", id })
    ).toEqual({ className: "hello-world", id });
  });
});
