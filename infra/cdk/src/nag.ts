import { Aspects, App } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

export function applyNagChecks(app: App): void {
  Aspects.of(app).add(new AwsSolutionsChecks({
    verbose: true,
    reports: true,
    logIgnores: true,
  }));
}
