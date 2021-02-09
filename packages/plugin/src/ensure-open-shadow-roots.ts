export const ensureOpenShadowRoots = () => {
  const { attachShadow } = Element.prototype;
  Element.prototype.attachShadow = function wrappedAttachShadow(shadowRootInit: {
    mode: "open" | "closed";
  }) {
    return attachShadow.call(this, { ...shadowRootInit, mode: "open" });
  };
};
