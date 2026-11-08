import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("SMTP settings are controlled by UAT env for both app and worker", () => {
  const yaml=readFileSync("deploy/compose.uat.yml","utf8");
  for (const key of ["EMAIL_PROVIDER","SMTP_FROM","SMTP_HOST","SMTP_PORT"]){
    const prefix="${"+key+":-";
    const occurrences=yaml.split(key+": ").slice(1).filter(value=>value.startsWith(prefix)||value.startsWith('"'+prefix)).length;
    assert.equal(occurrences,2,key);
  }
  assert.equal(yaml.split("env_file: [../.env.uat]").length-1,2);
  assert.doesNotMatch(yaml,/SMTP_(?:USER|PASS):/);
  assert.doesNotMatch(yaml,/SMTP_HOST: mailpit/);
});
