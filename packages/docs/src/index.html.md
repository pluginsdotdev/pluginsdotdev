---
title: Plugins.dev Documentation

language_tabs: # must be one of https://git.io/vQNgJ
  - javascript

toc_footers:
  - <a target="_blank" href='https://plugins.dev/hosts'>Sign up as a plugin host</a>
  - <a target="_blank" href='https://plugins.dev/authors'>Sign up as a plugin author</a>
  - <a target="_blank" href='https://plugins.dev'>Learn more</a>

includes:

search: true

code_clipboard: true
---

# Introduction

Plugins.dev allows any website to add support for safe, in-page 3rd-party plugins in 15 minutes.

When you render it, a plugin controls a UI within your app and can interact with your host app via normal React props.
You can even pass it whitelisted host components that it can render.
This is all done securely so that plugins can only access the data you pass them and plugins can only interact with your app through callback props that you provide.

As a b2b-targeted host, you can allow your enterprise customers to enhance your app with plugins they can deploy across their organization.

As a consumer-targeted host, plugins.dev will host an app store to allow users to install (and even purchase) plugins for use within your app.

# Authenticating your users

## Motivation
In order for plugins.dev to determine which plugins are available or enabled for a given session, it must know the current user id.

If your app supports the notion of users belonging to an organization (e.g. many b2b apps), you can also tell plugins.dev which organizations a user belongs to and whether they are a `OrgRoles.MEMBER` or `OrgRoles.ADMIN` for that organization.
Admins can enable approved plugins for everyone in their organization. Members will have access to organization-wide plugins.

If you choose to allow users to purchase plugins, you can allow plugins.dev to collect their payment (and remit a portion of it to you!) through your existing Stripe relationship with the user.
This reduces user friction by allowing them to use their existing payment methods and will increase conversion.

## Implementing it
> Your host secret should never be shared so this must be run server-side

```javascript
import { makeJWT, OrgRoles } from '@pluginsdotdev/server';

const secret = process.env.PLUGINS_DOT_DEV_SECRET;

const uid = "any-user-identifier";
const orgs = { "org-identifier": OrgRoles.MEMBER };
const stripeCustomer = "my-stripe-customer-id";
const jwt = makeJWT(secret, { uid, stripeCustomer, orgs });
```

> This example demonstrates retrieving your secret from the environment; you can use any secret storage you like.

> Make sure to replace `any-user-identifier` and `my-stripe-customer-id` with a string representation of the current user id and Stripe customer id.
When you register as a plugins.dev host, you will be able to retrieve a secret.

<aside class="notice">
You must retrieve your plugins.dev secret from the plugins.dev console.
</aside>

As a plugin host, you will generate a standard [JWT](https://jwt.io/) on your server and pass it into your [PluginPoint](#plugin-point).
Plugins.dev will use the authenticated data in this JWT to determine which plugins to enable in a given session and to authorize further user interactions with the app store.

Plugins.dev will use the following properties (custom claims in the JWT):

Property | Required | Description
--------- | ------- | -----------
uid | true | The id of the current user
stripeCustomer | false | If provided and if you have previously connected your stripe account in the plugins.dev console, this stripe customer will be used for all plugin purchases.
orgs | false | If provided, should be a map from an organization identifier to the user's role in that organization (`OrgRoles.ADMIN` or `OrgRoles.MEMBER`). An admin may enable plugins for everyone in their organization and a member will have access to the plugins enabled in their organization.

