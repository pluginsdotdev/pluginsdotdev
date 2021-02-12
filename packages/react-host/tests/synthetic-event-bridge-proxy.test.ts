/**
 * @jest-environment jsdom
 **/

import fc from "fast-check";

class Event {}
class EventTarget {
  constructor(vals: { [key: string]: string }) {
    Object.keys(vals).forEach((prop) => ((this as any)[prop] = vals[prop]));
  }
}
(global as any).EventTarget = EventTarget;
(global as any).Event = Event;

import { proxyHandler } from "../src/synthetic-event-bridge-proxy";

import type {
  LocalBridgeState,
  HostValue,
  ProxyId,
} from "@pluginsdotdev/bridge";

describe("proxyHandler", () => {
  it("should not proxy non-synthetic events", () => {
    fc.assert(
      fc.property(fc.anything(), (hostValue: any) => {
        const idFactory = jest.fn(
          (_: LocalBridgeState, _1: HostValue) => "fake-id" as ProxyId
        );
        const localState: LocalBridgeState = {
          localProxies: new Map(),
          knownProxies: new Map(),
        };
        expect(proxyHandler(idFactory, localState, hostValue)).toBe(null);
      })
    );
  });

  it("should proxy synthetic events", () => {
    fc.assert(
      fc.property(
        fc.record({
          bubbles: fc.boolean(),
          cancelable: fc.boolean(),
          defaultPrevented: fc.boolean(),
          eventPhase: fc.integer(),
          isTrusted: fc.boolean(),
          timeStamp: fc.float(),
          type: fc.asciiString(1, 10),
        }),
        fc.record({
          preventDefault: fc.func(fc.boolean()),
          isDefaultPrevented: fc.func(fc.boolean()),
          stopPropagation: fc.func(fc.boolean()),
          isPropagationStopped: fc.func(fc.boolean()),
          persist: fc.func(fc.boolean()),
        }),
        fc.record({
          checked: fc.boolean(),
          value: fc.string(),
          selectedIndex: fc.integer(),
        }),
        fc.record({
          checked: fc.boolean(),
          value: fc.string(),
          selectedIndex: fc.integer(),
        }),
        (
          evt: any,
          evtFns: any,
          currentTargetOpts: object,
          targetOpts: object
        ) => {
          const currentTarget = new EventTarget(
            currentTargetOpts as { [key: string]: string }
          );
          const target = new EventTarget(
            targetOpts as { [key: string]: string }
          );
          const event = {
            ...evt,
            ...evtFns,
            currentTarget,
            target,
            nativeEvent: new Event(),
          };

          const idFactory = jest.fn(
            (_: LocalBridgeState, _1: HostValue) => "fake-id" as ProxyId
          );
          const localState: LocalBridgeState = {
            localProxies: new Map(),
            knownProxies: new Map(),
          };
          const proxied = proxyHandler(idFactory, localState, event);
          expect(proxied).toBeTruthy();
          const { replacementValue } = proxied!;
          expect(replacementValue).toBeTruthy();
          expect(replacementValue).toMatchObject(evt);
          expect(replacementValue.currentTarget).toMatchObject(
            currentTargetOpts
          );
          expect(replacementValue.target).toMatchObject(targetOpts);
        }
      )
    );
  });

  it("should proxy synthetic events if all properties check out", () => {
    fc.assert(
      fc.property(
        fc.record({
          bubbles: fc.boolean(),
          cancelable: fc.boolean(),
          defaultPrevented: fc.boolean(),
          eventPhase: fc.boolean(),
          isTrusted: fc.boolean(),
          timeStamp: fc.boolean(),
          type: fc.boolean(),
          preventDefault: fc.boolean(),
          isDefaultPrevented: fc.boolean(),
          stopPropagation: fc.boolean(),
          isPropagationStopped: fc.boolean(),
          persist: fc.boolean(),
          currentTarget: fc.boolean(),
          target: fc.boolean(),
          nativeEvent: fc.boolean(),
        }),
        fc.record({
          bubbles: fc.boolean(),
          cancelable: fc.boolean(),
          defaultPrevented: fc.boolean(),
          eventPhase: fc.integer(),
          isTrusted: fc.boolean(),
          timeStamp: fc.float(),
          type: fc.asciiString(1, 10),
        }),
        fc.record({
          preventDefault: fc.func(fc.boolean()),
          isDefaultPrevented: fc.func(fc.boolean()),
          stopPropagation: fc.func(fc.boolean()),
          isPropagationStopped: fc.func(fc.boolean()),
          persist: fc.func(fc.boolean()),
        }),
        fc.record({
          checked: fc.boolean(),
          value: fc.string(),
          selectedIndex: fc.integer(),
        }),
        fc.record({
          checked: fc.boolean(),
          value: fc.string(),
          selectedIndex: fc.integer(),
        }),
        (
          propsToKeep: any,
          evt: any,
          evtFns: any,
          currentTargetOpts: object,
          targetOpts: object
        ) => {
          const currentTarget = new EventTarget(
            currentTargetOpts as { [key: string]: string }
          );
          const target = new EventTarget(
            targetOpts as { [key: string]: string }
          );
          const event = {
            ...evt,
            ...evtFns,
            currentTarget,
            target,
            nativeEvent: new Event(),
          };
          let isSyntheticEvent = true;
          Object.keys(propsToKeep).forEach((prop) => {
            if (!propsToKeep[prop]) {
              isSyntheticEvent = false;
              delete event[prop];
            }
          });

          const idFactory = jest.fn(
            (_: LocalBridgeState, _1: HostValue) => "fake-id" as ProxyId
          );
          const localState: LocalBridgeState = {
            localProxies: new Map(),
            knownProxies: new Map(),
          };
          const proxied = proxyHandler(idFactory, localState, event);

          if (!isSyntheticEvent) {
            expect(proxied).toBe(null);
            return;
          }

          expect(proxied).toBeTruthy();
          const { replacementValue } = proxied!;
          expect(replacementValue).toBeTruthy();
          expect(replacementValue).toMatchObject(evt);
          expect(replacementValue.currentTarget).toMatchObject(
            currentTargetOpts
          );
          expect(replacementValue.target).toMatchObject(targetOpts);
        }
      )
    );
  });
});
