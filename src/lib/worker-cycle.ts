/**
 * One background worker cycle. Each step is isolated: a failure in one step
 * (for example booth-hold expiry when the BoothHold table has not yet been
 * migrated on UAT) must never stop unrelated steps such as outbox email
 * delivery. Errors are logged without payloads or secrets.
 */
export type WorkerStep = {name: string; run: () => Promise<unknown>};
export type StepResult = {name: string; ok: boolean; error?: string};

export async function runWorkerCycle(
  steps: WorkerStep[],
  log: (message: string) => void = message => console.error(message)
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of steps) {
    try {
      await step.run();
      results.push({name: step.name, ok: true});
    } catch (e) {
      const error = e instanceof Error ? e.message : "unknown";
      log("Worker step failed: " + step.name + " — " + error);
      results.push({name: step.name, ok: false, error});
    }
  }
  return results;
}
