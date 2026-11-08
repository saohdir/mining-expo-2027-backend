import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("SMTP settings are controlled by UAT env for both app and worker", () => {
  const yaml=readFileSync("deploy/compose.uat.yml","utf8");
  for (const key of ["EMAIL_PROVIDER","SMTP_FROM","SMTP_HOST","SMTP_PORT"]){
    const matches=yaml.match(new RegExp(key+":\\\\s*\\\"?\\\\$\\\\{"+key+":-", "g"))||[];
    assert.equal(matches.length,2,key);
  }
  assert.equal(yaml.split("env_file: [../.env.uat]").length-1,2);
  assert.doesNotMatch(yaml,/SMTP_(?:USER|PASS):/);
  assert.doesNotMatch(yaml,/SMTP_HOST: mailpit/);
});
