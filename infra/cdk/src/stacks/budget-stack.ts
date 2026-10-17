import { Stack } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import { Construct } from "constructs";

import { EnvironmentConfig, stackEnvironment } from "../config.js";

export interface BudgetStackProps {
  readonly config: EnvironmentConfig;
}

export class BudgetStack extends Stack {
  public constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, stackEnvironment(props.config));

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: `sql-patch-manager-${props.config.name}-monthly`,
        budgetLimit: { amount: props.config.monthlyBudgetUsd, unit: "USD" },
        budgetType: "COST",
        timeUnit: "MONTHLY",
      },
    });
  }
}
