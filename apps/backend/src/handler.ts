export interface LambdaResponse {
  readonly statusCode: number;
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Phase 2 control-plane placeholder.
 *
 * SQL, secrets, and database connections are intentionally not handled here.
 * Phase 3 will add authenticated API handlers behind explicit authorization
 * and state-transition tests.
 */
export async function handler(): Promise<LambdaResponse> {
  return {
    statusCode: 501,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "NOT_IMPLEMENTED", message: "Phase 3 API" }),
  };
}
