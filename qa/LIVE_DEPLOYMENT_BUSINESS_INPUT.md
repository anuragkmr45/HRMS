# Live Deployment + Business Input for QA Test Generation

## 1. Deployed URLs

Production Frontend URL:
https://hawkaii-hrms.vercel.app

Production API URL:
https://hawkaii-hrms-dev-gyvr.onrender.com

QA Frontend URL:
https://hawkaii-hrms.vercel.app

QA API URL:
https://hawkaii-hrms-dev-gyvr.onrender.com

Hosted Dev Frontend URL:
https://hawkaii-hrms.vercel.app

Hosted Dev API URL:
https://hawkaii-hrms-dev-gyvr.onrender.com

Local Dev Frontend URL:

Local Dev API URL:

## 2. Which environments may Codex/tester use?

Allowed for read-only discovery:
- [ ] Production
- [x] QA
- [ ] Hosted Dev
- [ ] Local Dev

Allowed for create/update/delete test data:
- [x] QA
- [ ] Hosted Dev
- [ ] Local Dev

Production destructive testing allowed?
- [ ] No
- [x ] Yes, only in safe test tenant/account described below

Safe test tenant/org name:

Safe test data reset process:

## 3. Test accounts

Do not put real personal accounts here. Use QA/dev seeded test users only.

| Environment | Role | Email/Login | Password Location or Access Method | Allowed Actions | Notes |
|---|---|---|---|---|---|
| QA | Super Admin/Admin | `admin@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Full admin settings, employees, RBAC, workflows, reports, and configuration checks | Backend seeded `Admin`; frontend maps this to Main Admin. |
| QA | HR Manager | `hrm@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | HR, employee, EMS, attendance, leave/WFH, timesheet, reports, and admin settings checks | Extra QA seed user from `seed-qa-data.ts`. |
| QA | Manager/Reviewer | `manager@example.test`, `reviewer@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Manager/reviewer approvals, team views, expenses review, projects, timesheets, and reports | `manager@example.test` is extra QA seed; `reviewer@example.test` is release seed. |
| QA | Employee | `e1@example.test`, `e2@example.test`, `unauthorized@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Employee self-service, attendance, leave/WFH, timesheets, expenses, assets, and helpdesk checks | `unauthorized@example.test` is extra QA seed for negative/permission checks. |
| QA | Finance Manager | `finance@example.test`, `finance2@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Expense finance approval, payment/settlement, finance reports, and finance governance checks | `finance2@example.test` is alternate finance seed. |
| QA | Auditor | `auditor@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Read-only audit/reporting, expense audit, assets/helpdesk/report review | Backend seeded `Auditor`. |
| QA | Director | `director@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Leadership oversight, reviewer flows, report review, and approval escalation checks | Backend seeded Director/reviewer user. |
| QA | Asset Manager | `assets@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Asset inventory, assignments, returns, warranty/license, and asset reports checks | Backend seeded `Asset Manager`. |
| QA | Helpdesk / IT Support designation | Use `assets@example.test` or `admin@example.test` for backend helpdesk checks; frontend mock only: `linh@hawkaii.com` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Helpdesk queue, category, SLA, assignment, and ticket lifecycle checks through existing backend access roles | Add Employee separates `Designation` from backend access roles. Helpdesk Agent/Manager is seeded as designation master data, not as a backend system role. |
| Hosted Dev | Admin | `admin@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Full admin smoke, hosted dashboard, settings, reports, and critical workflow checks | Same seeded account as QA when hosted dev uses release seed data. |
| Hosted Dev | Employee | `e1@example.test`, `e2@example.test` | Seeded local/demo password: `LocalDev@123` unless `LOCAL_DEMO_PASSWORD` is overridden | Employee self-service smoke: attendance, leave/WFH, timesheets, expenses, assets, helpdesk | Use employee seeds, not admin, for employee-role hosted dev checks. |

Designation/access-role note: Add Employee has two separate concepts. `Designation` comes from master data and can include business titles such as Helpdesk Manager, Helpdesk Agent, Asset Manager, Project Manager, Auditor, HR Manager, Admin, Reviewer, Director, Finance Manager, and Employee. Backend `System roles` remain the access-control roles defined by the API; do not create a hardcoded Helpdesk Manager access role unless backend RBAC is explicitly changed.

## 4. Business-critical workflows

Mark the flows that must be tested before client/UAT signoff.

- [x] Signup / email verification
- [x ] Login / logout / session expiry
- [x ] Organization onboarding
- [ x] Employee onboarding
- [x ] Role and permission management
- [x ] Attendance punch / break / off-day / shortage / overtime
- [ x] Leave request / WFH request / approval / rejection
- [ x] Expense request / manager review / finance approval / payment / settlement
- [ x] Documents upload / preview / delete
- [ x] Cloudinary media storage
- [ xx] Projects / allocation / over-allocation approval
- [x ] Timesheets
- [x ] Assets
- [ x] Helpdesk
- [ x] Notifications
- [x ] Reports / exports
- [x ] Admin settings / policy preview
- [x ] Environment isolation: dev, QA, prod
- [x ] CI/CD branch deployments
- [x ] Other: all of these also theri might me more flows and jopunry check the codebase to findout 

## 5. HR and company policies

Work week / off days: usnady is only off day can be configurable by admin in admin policy 

Daily working hours rule: 8 hours can be configurable by admin in admin policy 

Attendance shortage rule: can be configurable by admin in admin policy 

Overtime rule: can be configurable by admin in admin policy 

Leave types: can be configurable by admin in admin policy 

Leave balance/accrual/carry-forward rule:can be configurable by admin in admin policy 

WFH approval rule:can be configurable by admin in admin policy 

Holiday rule:can be configurable by admin in admin policy 

Expense categories:can be configurable by admin in admin policy 

Expense approval routing:can be configurable by admin in admin policy 

Expense reimbursement/payment/settlement rule:can be configurable by admin in admin policy 

Project allocation limit rule:can be configurable by admin in admin policy 

Document retention/delete rule:can be configurable by admin in admin policy 

Notification events and expected recipients:can be configurable by admin in admin policy 

Email verification rule per environment:can be configurable by admin in admin policy 

Audit/logging expectations:can be configurable by admin in admin policy 

## 6. Risk and release priorities

Top 5 flows that cannot fail:
1. Login / logout / session /
2. Organization onboarding + employee onboarding 
3. Attendance + leave/WFH 
4. Expense request -> manager review -> finance approval -> payment/settlement
5. Documents upload/preview/delete + Cloudinary + reports/export

Top 5 client demo/UAT flows:
1. Admin login and organization setup
2. Add employee, assign role/designation, verify permissions
3. Employee attendance punch, leave request, WFH request, timesheet
4. Expense submission, manager approval, finance approval/payment/settlement
5. Document upload/preview/delete, reports/export, notification checks

Browsers/devices to cover:
Chrome desktop, Edge desktop, Safari/iPhone, Chrome Android, responsive mobile, tablet and desktop.

Timezone/date assumptions:
Asia/Kolkata unless organization policy config says otherwise.

Max steps per test case row:
6 main steps. Put longer details in workflow/manual tabs.

## 7. Output preference

Main test case style:
- [x] concise point-wise tester sheet
- [X] detailed step-by-step sheet

both of these

Max steps per test case row:

Should screenshots/evidence references be included?
- [X] Yes
- [ ] No

Should client-facing doc be regenerated?
- [X] Yes if needed
- [ ] No
