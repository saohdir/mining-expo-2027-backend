import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const fields=JSON.parse(readFileSync(new URL("../src/lib/page-fields.json",import.meta.url),"utf8"));
const translations=JSON.parse(readFileSync(new URL("../scripts/i18n/zh.json",import.meta.url),"utf8"));
test("five exhibitor benefit cards are editable through CMS in both locales",()=>{
 const items=fields.exhibitors["make-your-next-connection"];
 assert.equal(items.length,32);
 const keys=items.map(x=>x.key);
 assert.equal(new Set(keys).size,32);
 for(let i=0;i<32;i++)assert.ok(keys.includes("make-your-next-connection."+i));
 const added=items.filter(i=>Number(i.key.split(".").pop())>=18);
 assert.equal(added.length,14);
 for(const field of added){assert.equal(field.kind,"text");assert.equal(field.mode,"plain");assert.ok(translations[field.text],field.text);}
});
