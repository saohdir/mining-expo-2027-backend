import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("deployment refreshes Nginx after replacing and validating the Next.js app", () => {
  const source=readFileSync("scripts/deploy-uat.sh","utf8");
  const up=source.indexOf('up -d --no-build app worker web');
  const ready=source.indexOf('Waiting for the new Next.js app to become ready');
  const health=source.indexOf('127.0.0.1:3000/api/health');
  const restart=source.indexOf('restart web');
  const smoke=source.indexOf('Checking local reverse proxy and secure API');
  assert.ok(up>=0 && up<ready && ready<health && health<restart && restart<smoke);
  assert.match(source,/if \[\[ "\$ready" != 1 \]\]; then/);
  assert.match(source,/docker compose.*logs --tail=60 app/);
  assert.match(source,/exit 1/);
  assert.doesNotMatch(source,/down -v|reset --hard|db push/);
});
