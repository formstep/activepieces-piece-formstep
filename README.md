# Formstep for Activepieces

An [Activepieces](https://www.activepieces.com) community piece for [Formstep](https://formstep.io). A flow creates a **request** (one form, one recipient), the recipient completes a branded form, and the flow continues with the answers.

## What it does

Triggers, each subscribed to one form when the flow is published and removed when it is turned off:

- **Request Completed**: a recipient completed a request, with the answers and the outcome.
- **Request Expired**: a request reached its expiry without being completed.
- **Request Canceled**: a request was canceled, with the reason when one was given.
- **Public Link Submission Created**: someone submitted the form through its public link.

Actions:

- **Create Request**: ask one recipient to complete a published form, with prefilled answers, hidden context values, read-only fields, delivery, reminders and an expiry.
- **Get Request**: read a request, with its answers once it is completed.
- **Send Reminder**: email the recipient a reminder now.
- **Cancel Request**: withdraw a pending request so its link stops working.
- **Find Request**: find requests by the External ID a Create Request step gave them.

The Form dropdown and the Fields of Create Request load from your workspace.

## Install

A platform admin installs the piece once for the whole platform: **Platform Admin › Pieces › Install Piece**, Package Type **NPM Registry**, package name `@formstep/piece-formstep`.

Then add a connection with a Formstep API token. Create one in Formstep under **OAuth and API Keys › Create token**, with Expiration set to No expiration. A token reaches one workspace.

Self-hosted Activepieces needs a public HTTPS address (`AP_FRONTEND_URL`): Formstep delivers events to HTTPS addresses only.

## Signed deliveries

Every trigger registers its own signing secret with Formstep. Formstep signs each delivery with HMAC-SHA256 over `{timestamp}.{raw body}` in `X-Formstep-Signature`, and the trigger checks it against the raw body Activepieces passes before the flow runs. A delivery with a wrong or missing signature, or one signed more than five minutes earlier, starts nothing.

## Develop

```bash
npm install
npm test          # Vitest against an in-process fake of the Formstep API
npm run build     # typecheck, then bundle into dist/
```

`npm run build` writes one self-contained CommonJS bundle to `dist/src/index.js`, the shape Activepieces publishes its own pieces in, and `dist/package.json` with no dependencies. Publish from `dist/`:

```bash
npm publish ./dist --access public
```

`FORMSTEP_API_URL` points the piece at another Formstep deployment, such as staging.
