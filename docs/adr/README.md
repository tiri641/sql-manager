# Architecture Decision Records

ADR（Architecture Decision Record）は、重要な設計判断の背景、選択肢、影響、撤回条件を短く不変に記録します。後から設計を変更する場合、既存ADRを書き換えず、新しいADRでSupersedesまたはAmendsを表現します。

## 作成タイミング

- AWSサービス、DB接続、実行方式、認証認可、ログ保持、環境分離に影響する判断
- コスト、セキュリティ、可用性、データ整合性のトレードオフ
- 既存設計を変更し、互換性・移行・ロールバックへ影響する判断

## 状態

```text
Proposed -> In Review -> Accepted
                    \-> Rejected
Accepted -> Superseded / Amended
```

## レビュー

ADRは実装前にTech Lead、Security、Infrastructure、Database、SRE、Qualityの影響範囲をレビューする。Blocking/Highの指摘が残ったままAcceptedにしない。PR本文には関連ADRへのリンクを記載する。

## 命名

`NNNN-short-decision-name.md` とし、番号は再利用しない。テンプレートは [0000-template.md](0000-template.md) をコピーする。

