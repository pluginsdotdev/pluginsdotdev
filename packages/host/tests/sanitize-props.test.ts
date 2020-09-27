import { sanitizeProps, safePrefix } from "../src/sanitize-props";

const defaultSanitizeParams = {
  hostId: "host",
  pluginPoint: "plugin-point",
  pluginDomain: "https://plugins.dev",
  pluginUrl: "https://plugins.dev/my-plugin/v1/",
};

describe("sanitize-props", () => {
  it("should sanitize dangerouslySetInnerHTML", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "div",
        props: {
          className: "hello-world",
          dangerouslySetInnerHTML: "oops",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should sanitize unsafe ids", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "div",
        props: {
          className: "hello-world",
          id: "oops",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should sanitize unsafe names", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "div",
        props: {
          className: "hello-world",
          name: "oops",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should allow safe names", () => {
    const name = `${safePrefix(
      defaultSanitizeParams.pluginPoint,
      defaultSanitizeParams.pluginDomain
    )}oops}`;
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "div",
        props: {
          className: "hello-world",
          name,
        },
      })
    ).toEqual({ className: "hello-world", name });
  });

  it("should allow safe ids", () => {
    const id = `${safePrefix(
      defaultSanitizeParams.pluginPoint,
      defaultSanitizeParams.pluginDomain
    )}oops}`;
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "div",
        props: {
          className: "hello-world",
          id,
        },
      })
    ).toEqual({ className: "hello-world", id });
  });

  it("should reject urls with unknown protocols", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          href: "spotify:track:12345",
          className: "hello-world",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should reject javascript urls", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          href: "javascript:alert(document.title)",
          className: "hello-world",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should accept normal urls (TODO: for now, until we whitelist)", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          href: "plugins.dev/hello",
          className: "hello-world",
        },
      })
    ).toEqual({
      href: "plugins.dev/hello",
      className: "hello-world",
    });
  });

  it("should reject non-function event handlers", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          onClick: "javascript:alert(document.title)",
          className: "hello-world",
        },
      })
    ).toEqual({ className: "hello-world" });
  });

  it("should accept function event handlers", () => {
    const onClick = () => {};

    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          onClick,
          className: "hello-world",
        },
      })
    ).toEqual({
      onClick,
      className: "hello-world",
    });
  });

  it("should reject incorrect src domains", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          src: "https://not-plugins.dev/something",
          className: "hello-world",
        },
      })
    ).toEqual({
      className: "hello-world",
    });
  });

  it("should accept correct src domains", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          src: "https://plugins.dev/something",
          className: "hello-world",
        },
      })
    ).toEqual({
      src: "https://plugins.dev/something",
      className: "hello-world",
    });
  });

  it("should handle superfluous domain ports", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          src: "https://plugins.dev:443/something",
          className: "hello-world",
        },
      })
    ).toEqual({
      src: "https://plugins.dev:443/something",
      className: "hello-world",
    });
  });

  it("should resolve relative src urls", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          src: "assets/something",
          className: "hello-world",
        },
      })
    ).toEqual({
      src: "https://plugins.dev/my-plugin/v1/assets/something",
      className: "hello-world",
    });
  });

  it("should accept any href domains", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          href: "https://not-plugins.dev/something",
          className: "hello-world",
        },
      })
    ).toEqual({
      href: "https://not-plugins.dev/something",
      className: "hello-world",
    });
  });

  it("should disallow style attributes with bad url domains", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          style: {
            color: "red",
            background:
              'lightblue url("http://not-plugins.dev/background.png") no-repeat fixed center',
            width: 100,
          },
          className: "hello-world",
        },
      })
    ).toEqual({
      style: {
        color: "red",
        width: 100,
      },
      className: "hello-world",
    });
  });

  it("should allow style attributes with good url domains", () => {
    expect(
      sanitizeProps({
        ...defaultSanitizeParams,
        tagName: "a",
        props: {
          style: {
            color: "red",
            background:
              'lightblue url("https://plugins.dev/background.png") no-repeat fixed center',
            width: 100,
          },
          className: "hello-world",
        },
      })
    ).toEqual({
      style: {
        color: "red",
        background:
          'lightblue url("https://plugins.dev/background.png") no-repeat fixed center',
        width: 100,
      },
      className: "hello-world",
    });
  });
});
