import {test} from "node:test";
import assert from "node:assert/strict";
import {hashCustomerPassword, passwordProblems, verifyCustomerPassword} from "../src/lib/customer-auth";

test("scrypt password hashes are salted, verifiable and never contain the password", async () => {
  const h1 = await hashCustomerPassword("Tambang2027x"), h2 = await hashCustomerPassword("Tambang2027x");
  assert.notEqual(h1, h2);
  assert.ok(!h1.includes("Tambang2027x"));
  assert.ok(h1.startsWith("scrypt$32768$8$1$"));
  assert.equal(await verifyCustomerPassword("Tambang2027x", h1), true);
  assert.equal(await verifyCustomerPassword("tambang2027x", h1), false);
  assert.equal(await verifyCustomerPassword("anything", null), false, "no hash never verifies");
});
test("password policy", () => {
  assert.deepEqual(passwordProblems("Tambang2027x", "buyer@x.com"), []);
  assert.ok(passwordProblems("short1", "a@b.com").length);
  assert.ok(passwordProblems("onlyletterspass", "a@b.com").includes("Use letters and numbers"));
  assert.ok(passwordProblems("buyername123", "buyername@x.com").includes("Must not contain your email name"));
});
