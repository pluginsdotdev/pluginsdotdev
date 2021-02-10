const { customElements } = window;

export const isCustomElement = (localName: string): boolean =>
  customElements && customElements.get && customElements.get(localName);
