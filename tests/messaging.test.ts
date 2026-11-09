import {test} from "node:test";
import assert from "node:assert/strict";
import {deliverWhatsApp, queueWhatsAppCopy, waNumber, whatsappConfigured} from "../src/lib/messaging";

const ON = {ENABLE_MESSAGING_AUTOMATION: "true", WHATSAPP_PROVIDER: "meta", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "test-token", WHATSAPP_TEMPLATE_NAME: "imdx_update", WHATSAPP_API_BASE: "https://wa.test"};
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T) { const old = {...process.env}; for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } try { return await fn(); } finally { process.env = old; } }
const account = (over: object = {}) => ({id: "A1", phone: "+62 812-3456-7890", verifiedPhoneAt: new Date(), profile: {notifyChannel: "WHATSAPP", fullName: "Budi"}, ...over});

test("off by default; number normalisation", async () => {
  await withEnv({ENABLE_MESSAGING_AUTOMATION: undefined}, () => assert.equal(whatsappConfigured(), false));
  await withEnv({...ON, WHATSAPP_ACCESS_TOKEN: undefined}, () => assert.equal(whatsappConfigured(), false));
  await withEnv(ON, () => assert.equal(whatsappConfigured(), true));
  assert.equal(waNumber("+62 812-3456-7890"), "6281234567890"); assert.equal(waNumber("0812"), null);
});

test("queue only for opted-in, verified phones; idempotent per source job", async () => {
  const made: unknown[] = [];
  const db = (acc: unknown) => ({customerAccount: {findUnique: async () => acc}, notificationOutbox: {upsert: async (a: unknown) => { made.push(a); }}}) as never;
  await withEnv(ON, async () => {
    assert.equal(await queueWhatsAppCopy(db(account()), "b@x.co", "IMDX — event pass revoked", "https://x/account", "pass:1"), true);
    assert.equal(await queueWhatsAppCopy(db(account({profile: {notifyChannel: "EMAIL"}})), "b@x.co", "s", "l", "k"), false, "email preference");
    assert.equal(await queueWhatsAppCopy(db(account({verifiedPhoneAt: null})), "b@x.co", "s", "l", "k"), false, "unverified phone");
  });
  assert.equal(made.length, 1);
  assert.equal((made[0] as {where: {dedupeKey: string}}).where.dedupeKey, "wa:pass:1");
  assert.deepEqual((made[0] as {create: {payload: {params: string[]}}}).create.payload.params, ["Budi", "event pass revoked", "https://x/account"]);
  assert.equal(await queueWhatsAppCopy(db(account()), "b@x.co", "s", "l", "k"), false, "disabled → nothing");
});

test("delivery sends a template message, re-checks consent, throws for retry", async () => {
  let call: {url: string; body: {to: string; type: string; template: {name: string; components: {parameters: {text: string}[]}[]}}; auth: string} | null = null;
  const fetcher = (async (url: string, init: RequestInit) => { call = {url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization}; return new Response("{}", {status: 200}); }) as unknown as typeof fetch;
  const db = (acc: unknown) => ({customerAccount: {findUnique: async () => acc}}) as never;
  await withEnv(ON, async () => {
    assert.equal(await deliverWhatsApp(db(account()), {accountId: "A1", params: ["Budi", "x", "y"]}, fetcher), "SENT");
    assert.equal(call!.url, "https://wa.test/v21.0/123/messages"); assert.equal(call!.body.to, "6281234567890"); assert.equal(call!.body.type, "template");
    assert.equal(call!.body.template.name, "imdx_update"); assert.equal(call!.auth, "Bearer test-token"); assert.equal(call!.body.template.components[0].parameters.length, 3);
    assert.equal(await deliverWhatsApp(db(account({profile: {notifyChannel: "EMAIL"}})), {accountId: "A1"}, fetcher), "SKIPPED_NO_CONSENT", "opt-out after queueing");
    await assert.rejects(deliverWhatsApp(db(account()), {accountId: "A1"}, (async () => new Response("", {status: 429})) as typeof fetch), /429/);
  });
});

test("UAT stand-in: WHATSAPP_PROVIDER=mailpit and SMS_PROVIDER=mailpit need no credentials", async () => {
  const {smsAvailable} = await import("../src/lib/sms");
  await withEnv({ENABLE_MESSAGING_AUTOMATION: "true", WHATSAPP_PROVIDER: "mailpit", WHATSAPP_ACCESS_TOKEN: undefined}, () => assert.equal(whatsappConfigured(), true));
  await withEnv({ENABLE_MESSAGING_AUTOMATION: undefined, WHATSAPP_PROVIDER: "mailpit"}, () => assert.equal(whatsappConfigured(), false, "still behind the automation flag"));
  await withEnv({SMS_PROVIDER: "mailpit"}, () => assert.equal(smsAvailable(), true));
  await withEnv({SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: undefined}, () => assert.equal(smsAvailable(), false));
});
