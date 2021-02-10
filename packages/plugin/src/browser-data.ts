export interface ExposedComponent {
  type: string;
  attrs: (props?: Record<string, any>) => Record<string, any>;
  el: (props: Record<string, any>) => HTMLElement;
}

export type ExposedComponents = Record<string, ExposedComponent>;

export interface BrowserData {
  pluginId: string;
  hostId: string;
  userId: string;
  hostOrigin: string;
  exposedComponentsList: Array<keyof ExposedComponents>;
  allowedDomains: Array<string>;
}

const { parse } = JSON;

let cachedBrowserData: BrowserData | null = null;

export const browserData = async (): Promise<BrowserData> => {
  return new Promise((resolve, reject) => {
    if (cachedBrowserData) {
      return resolve(cachedBrowserData);
    }

    document.addEventListener("DOMContentLoaded", () => {
      cachedBrowserData = {
        pluginId: document.body.getAttribute("data-plugin-id")!,
        hostId: document.body.getAttribute("data-host-id")!,
        userId: document.body.getAttribute("data-user-id")!,
        hostOrigin: document.body.getAttribute("data-host-origin")!,
        allowedDomains: parse(
          document.body.getAttribute("data-allowed-domains")!
        ) as Array<string>,
        exposedComponentsList: parse(
          document.body.getAttribute("data-exposed-components")!
        ) as Array<keyof ExposedComponents>,
      };
      resolve(cachedBrowserData);
    });
  });
};
