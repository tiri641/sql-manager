# Pre-PR Agent Review: <change title>

- Review status: NOT_READY / AGENT_REVIEWING / CHANGES_REQUESTED / PR_ALLOWED
- Review date: YYYY-MM-DD
- Change slug: `<slug>`
- Base / target: `<branch or commit>`
- Reviewed diff: `<commit, working tree snapshot, or file set>`
- Related ADRs: `<links or none>`
- Related status entry: `<status.md section>`

## Scope

- Purpose:
- Non-goals:
- Affected Phase:
- External side effects:
- AWS / DB / SQL operation performed: Yes / No

## Evidence reviewed

- [ ] Final Diff or working tree snapshot
- [ ] Relevant design documents
- [ ] Tests and test results
- [ ] Security/IAM/secret handling
- [ ] Operations/Runbook/recovery
- [ ] ADRs and `status.md`

## Agent reviews

| Agent | Required | Reviewed at | Result | Record / notes |
| --- | --- | --- | --- | --- |
| Loop Coordinator | Yes |  |  |  |
| Code Reviewer | Yes |  |  |  |
| Security Engineer | Yes |  |  |  |
| Quality Engineer | Yes |  |  |  |
| Release Manager | Yes |  |  |  |
| TDD / Test Engineer | Depends |  |  |  |
| Infrastructure Engineer | Depends |  |  |  |
| Database / PostgreSQL Engineer | Depends |  |  |  |
| SRE | Depends |  |  |  |
| Platform Engineer | Depends |  |  |  |
| Privacy / Data Governance | Depends |  |  |  |

## Findings

| Severity | Path:line | Agent | Issue | Impact | Recommendation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Blocking/High/Medium/Low |  |  |  |  |  | Open/Fixed/Accepted |

## Re-review and verification

- [ ] Blocking/High findings are zero
- [ ] Fixed findings were re-reviewed by affected agents
- [ ] Targeted tests were rerun
- [ ] Full verification was rerun
- [ ] No SQL本文、Secret、個人情報、実データが記録へ混入していない
- [ ] Loop Coordinator confirmed `PR_ALLOWED`
- [ ] Release Manager confirmed PR creation is allowed

## Decision

PR creation: Allowed / Not allowed

Reason:

Remaining risks and follow-up:

