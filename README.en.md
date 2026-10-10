# Kelin Ledger

Kelin Ledger is a warm, collaborative bookkeeping mini program for couples, partners, and families. It combines shared ledgers, accounts, budgets, household checklists, schedules, reminders, and family activity in one place. The project is built with **uni-app + WeChat Cloud Development** and does not require a self-hosted server.

> Current version: **v2.1.9**
>
> Chinese documentation: [README.md](./README.md)

## Highlights

- Shared accounts for two or more family members.
- WeChat login, invitation-code joining, roles, and member management.
- Expense, income, transfer, account balance, edit, and delete flows.
- Monthly, yearly, all-time, and custom statistics.
- Asset overview, budgets, split settlement, recurring bills, and CSV export.
- WeChat Pay / Alipay bill import with duplicate detection and preview.
- Family checklists, schedules, birthday reminders, activity feed, and notifications.
- Two coordinated themes and a consistent MingCute icon system.

## Architecture

- Front end: uni-app, Vue 3, TypeScript, Pinia.
- Back end: WeChat Cloud Functions, Cloud Database, and Cloud Storage.
- API layer: `common/utils/request.ts` calls the `roomie` cloud function through `wx.cloud.callFunction`.
- Cloud function: `cloudfunctions/roomie`, routed by `module.action`.

## Quick Start

Requirements: Node.js 22 LTS, npm, WeChat DevTools, a mini program AppID, and a WeChat Cloud environment.

```powershell
git clone https://github.com/guilinshanshui/kelinLedger.git
cd kelinLedger
npm install
```

Configure your own AppID in `manifest.json`, `project.config.json`, and `common/config/index.ts`. Set your own WeChat Cloud environment ID in `common/config/index.ts` as well. Do not reuse the author's cloud environment for your own deployment.

Build and verify:

```powershell
npm run audit
npm run test:cloud
npm run build:mp-weixin
npm run verify:mp
```

The build output is `dist/build/mp-weixin`. Import that directory in WeChat DevTools; do not import the uni-app source root.

## Deployment

- Full cloud setup: [docs/cloud-setup.md](./docs/cloud-setup.md)
- Free experience edition without publishing: [docs/free-experience-deploy.md](./docs/free-experience-deploy.md)
- Pre-deployment simulation and validation: [docs/simulation-validation-guide.md](./docs/simulation-validation-guide.md)

After building, deploy the `roomie` cloud function with "Upload and deploy: install dependencies in the cloud", then upload its triggers separately.

## License

MIT. See [LICENSE](./LICENSE).
