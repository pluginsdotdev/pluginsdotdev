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

  it("should reject urls with unknown protocols", () => {
    expect(
      sanitizeProps("host", "plugin", "a", {
        href: "spotify:track:12345",
        className: "hello-world",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should reject javascript urls", () => {
    expect(
      sanitizeProps("host", "plugin", "a", {
        href: "javascript:alert(document.title)",
        className: "hello-world",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should accept normal urls (TODO: for now, until we whitelist)", () => {
    expect(
      sanitizeProps("host", "plugin", "a", {
        href: "plugins.dev/hello",
        className: "hello-world",
      })
    ).toEqual({
      href: "plugins.dev/hello",
      className: "hello-world",
    });
  });

  it("should reject non-function event handlers", () => {
    expect(
      sanitizeProps("host", "plugin", "a", {
        onClick: "javascript:alert(document.title)",
        className: "hello-world",
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should accept function event handlers", () => {
    const onClick = () => {};

    expect(
      sanitizeProps("host", "plugin", "a", {
        onClick,
        className: "hello-world",
      })
    ).toEqual({
      onClick,
      className: "hello-world",
    });
  });

  it("should reject incorrect src domains", () => {
    expect(
      sanitizeProps("host", "https://plugins.dev", "a", {
        src: "https://not-plugins.dev/something",
        className: "hello-world",
      })
    ).toEqual({
      className: "hello-world",
    });
  });

  it("should accept correct src domains", () => {
    expect(
      sanitizeProps("host", "https://plugins.dev", "a", {
        src: "https://plugins.dev/something",
        className: "hello-world",
      })
    ).toEqual({
      src: "https://plugins.dev/something",
      className: "hello-world",
    });
  });

  it("should accept any href domains", () => {
    expect(
      sanitizeProps("host", "https://plugins.dev", "a", {
        href: "https://not-plugins.dev/something",
        className: "hello-world",
      })
    ).toEqual({
      href: "https://not-plugins.dev/something",
      className: "hello-world",
    });
  });
});
