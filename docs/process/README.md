# Process Documentation

Last verified from the repository: 2026-06-30.

This folder defines how work moves from ready state to delivery, QA, release, and documentation maintenance.

## Process Set

| Document | Purpose |
| --- | --- |
| `agile-delivery-plan.md` | Sprint cadence, delivery model, story template, sprint structure. |
| `branching-release-process.md` | Branches, promotion path, release note expectations. |
| `definition-of-ready.md` | Inputs required before work is committed to a sprint. |
| `definition-of-done.md` | Completion criteria before a task is considered done. |
| `qa-handoff-process.md` | Developer handoff checklist, QA execution order, evidence collection. |
| `release-governance.md` | Production release gates, approvals, smoke expectations. |
| `sprint-ceremonies.md` | Planning, daily, QA handoff, review, retrospective. |
| `documentation-maintenance-process.md` | Which docs must change with code/config/process changes. |
| `developer-handoff-template.md` | Standard handoff template for dev-to-QA/new-dev transfer. |

## Work Movement

```text
Ready story
  -> local implementation
  -> verification
  -> dev handoff
  -> QA execution
  -> release approval
  -> deployment
  -> post-deploy smoke
  -> documentation/task sheet update
```

## Process Rules

- Do not mark work done without verification evidence.
- Do not promote to QA without changed modules, roles, routes, APIs, migrations, and known risks documented.
- Do not ship production with default secrets, mock frontend fallback, mock production storage, or failing health checks.
- Update docs in the same change when behavior, environment, workflow, or operational procedure changes.

