# n8n-nodes-timelodge

Connect TimeLodge clients, projects, and recorded time to n8n workflows.

TimeLodge is time tracking, project profitability, and invoicing software for freelancers and small service businesses. This community node uses its workspace-scoped API.

## Operations

- **Client:** Create, Get, Get Many.
- **Project:** Get Many.
- **Time Entry:** Get Many.

Client selection supports searching by name. Lists support pagination, a result limit, or returning all records. Each API record becomes one n8n output item, paired with its original input item. Time, dates, currencies, and monetary values retain the API’s original representation.

This package does not start timers, issue invoices, send invoices, process payments, update records, or configure webhooks.

## Installation

The npm package name is `n8n-nodes-timelodge`. Registry publication and n8n verification are pending; the source alone does not make this node available in n8n Cloud.

For local testing, run `npm ci`, `npm run check`, and `npm run dev` in this repository. The official n8n node CLI loads the node into a local n8n instance. Use a separate test workspace and synthetic records.

After the npm release, a self-hosted n8n owner can install the package through **Settings → Community Nodes**. n8n Cloud discovery requires approval through the n8n Creator Portal.

## Credentials

You need a TimeLodge account and a workspace with API access. Your TimeLodge subscription and any n8n service subscription are separate from this MIT-licensed connector.

1. In the TimeLodge workspace, open the account menu and select **API & webhooks**.
2. Create a service token, choose an expiry date, and grant only the scopes needed by the workflow.
3. Copy the one-time token into an n8n **TimeLodge API** credential.
4. Test the credential. The test calls the read-only `/api/v1/ping` endpoint.

Required scopes:

| Operation                      | Scope           |
| ------------------------------ | --------------- |
| Get clients or select a client | `clients:read`  |
| Create a client                | `clients:write` |
| Get projects                   | `projects:read` |
| Get time entries               | `time:read`     |

A token belongs to one workspace. To connect another workspace, create a separate token and credential. Revoke the token in TimeLodge to disconnect; replace it in n8n before its expiry when continued access is required. Removing a credential or revoking a token does not undo clients already created.

## Retry-safe client creation

**Create Client** requires an idempotency key of 1–255 characters. Map a stable identifier from the source event, such as `crm-contact-created:84`. Use the same key and identical client fields when retrying that event. Use a new key for a different event.

TimeLodge documents a 24-hour idempotency replay window. Do not assume that reusing a key forever prevents duplicates. A changed payload with the same key produces a conflict instead of silently overwriting the client. An omitted currency uses the TimeLodge workspace default.

## Example workflows

**Scheduled time export:** Schedule Trigger → TimeLodge, Time Entry, Get Many → your spreadsheet or reporting destination. Set a limit for a small preview, or enable Return All for a complete workspace list. Apply any date filtering explicitly in n8n; this version does not provide date-filter controls.

**CRM client handoff:** CRM trigger → TimeLodge, Client, Create. Map the display name and a stable source-event idempotency key. Add a legal name or internal code only when needed.

These examples describe supported connector steps; they do not claim every third-party combination has been tested.

## Data and failures

Requests go only to `https://timelodge.com/api/v1` using the selected credential. The node has no custom-host setting, file-system access, environment-variable access, or additional runtime dependencies. It reads the fields exposed by each selected API operation. Client creation sends only the supported form fields.

The node stops on an API failure by default. n8n’s Continue On Fail option produces a safe error item paired with the failed input. Recheck token expiry, permissions, workspace access, and provider availability. Configure retries in n8n and keep a stable idempotency key for writes. Large Return All requests may encounter TimeLodge’s documented rate limit of 120 requests per minute; a failed pagination request fails the node rather than presenting a partial list as complete.

## Development and release

- `npm run check`: official n8n lint, TypeScript build, connector tests, and formatting.
- `npm run dev`: local n8n smoke testing.
- `npm pack`: inspect the distributable package.

Verification requires publication through GitHub Actions with npm provenance. This repository has a publishing-only workflow; routine validation stays local. Configure an authorised npm publisher before running it. Do not tag or publish an untested version. After publication, submit the exact package and repository through the [n8n Creator Portal](https://creators.n8n.io/nodes).

The test suite exercises the actual node with simulated HTTP responses. It does not prove a production account connection or n8n Cloud installation.

## Support and references

- [TimeLodge developer reference](https://timelodge.com/developers)
- [Canonical public API schema](https://timelodge.com/openapi.json)
- [TimeLodge product facts](https://timelodge.com/facts)
- [Report a connector issue](https://github.com/dalehurley/n8n-nodes-timelodge/issues)
- [n8n community-node verification](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes.md)

For account support, contact support@timelodge.com. Never include API tokens, passwords, or private client records in issue reports.

## License

MIT. The TimeLodge service has its own subscription and terms.
