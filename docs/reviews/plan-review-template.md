# Plan Review Record

## Metadata

- Review status: `DRAFT` / `IN_REVIEW` / `CHANGES_REQUESTED` / `RE_REVIEW` / `PLAN_APPROVED`
- Date:
- Change slug:
- Target phase:
- Plan version:
- Author:
- Related status/ADR:

## Scope

### Objective

<!-- Planが達成する目的。機密情報、SQL本文、Secret値は書かない。 -->

### Non-goals

<!-- このPlanで扱わない範囲。 -->

### Plan reference

<!-- Plan本文またはPlanを管理しているファイル・セッション上の識別子。 -->

## Required reviewers

| Agent | Required? | Reviewed at | Result |
| --- | --- | --- | --- |
| Loop Coordinator / Tech Lead | Yes |  |  |
| Security Engineer | Yes |  |  |
| Quality Engineer | Yes |  |  |
| TDD Test Engineer | Conditional |  |  |
| Infrastructure Engineer | Conditional |  |  |
| Database/PostgreSQL Engineer | Conditional |  |  |
| SRE | Conditional |  |  |
| Platform Engineer | Conditional |  |  |
| Privacy / Data Governance | Conditional |  |  |

## Review findings

| Severity | Reviewer | Location | Issue | Impact | Evidence | Recommendation | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Blocking/High/Medium/Low |  |  |  |  |  |  | Open/Fixed/Accepted |

## Changes after review

<!-- 指摘を反映したPlanの変更点、変更理由、スコープへの影響。 -->

## Re-review

| Agent | Reviewed version | Date | Blocking/High remaining | Result |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Final decision

- Blocking findings remaining: 0
- High findings remaining: 0
- Tests/verification affected by the Plan:
- Open Questions and owner:
- Residual risks:
- Final decision: `PLAN_APPROVED` / `CHANGES_REQUESTED`
- Loop Coordinator confirmation:
- Release/next-step owner:

## Safety check

- [ ] SQL本文、個人情報、Secret、接続情報を記録へ貼り付けていない
- [ ] 未承認の外部変更、AWS操作、DB接続、SQL実行をPlanに含めていない
- [ ] Planの変更対象と非対象が明確である
