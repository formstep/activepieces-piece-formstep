# Changelog

## 0.2.1

- Create Request: the Reminders help says the form's schedule applies only when Formstep emails the invitation, and that an empty field sends no reminders with Delivery None. Behaviour is unchanged.

## 0.2.0

A rewrite, ported from the n8n node. Flows built on 0.1.0 need changes.

**Instant, signed triggers.** Request Completed now gets a webhook delivery the moment a request completes. It used to poll `requests.list`. Request Expired, Request Canceled and Public Link Submission Created are new. Each trigger subscribes with its own signing secret when the flow is published, and checks `X-Formstep-Signature` against the raw body before the flow runs.

**New actions.** Send Reminder, Cancel Request and Find Request (by External ID) are new.

**Breaking changes from 0.1.0:**

- **Request Completed output.** The trigger now hands over the Formstep event envelope instead of the request. The answers are under `data.answers`, the request is under `data.request`, and the event id is `id`. Update references such as `answers.plan` to `data.answers.plan`.
- **Create Request: Email the Invitation.** This checkbox is replaced by **Delivery**: Email the Invitation, or None. Leave Delivery empty for the form's default.
- **Create Request: Idempotency Key.** This input is gone. **External ID** is also sent as the idempotency key, so a retried run reuses the request.
- **Create Request: Metadata.** This is now a JSON input.
- **New inputs.** Read-Only Fields, Reminders and Callback URL are new.

Custom API Call is unchanged.

## 0.1.0

The first release, built in the Activepieces monorepo. It had Create Request, Get Request, Custom API Call, and a polling Request Completed trigger.
