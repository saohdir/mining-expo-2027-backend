import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
export function randomToken(){return randomBytes(32).toString("base64url");}
export function hashToken(input:string){return createHash("sha256").update(input).digest("hex");}
export function otpHash(challengeId:string,code:string){const secret=process.env.OTP_HASH_SECRET;if(!secret||secret.length<32)throw new Error("OTP_HASH_SECRET missing/short");return createHmac("sha256",secret).update(challengeId+":"+code).digest("hex");}
export function newOtp(){return String(randomInt(0,1000000)).padStart(6,"0");}
export function constantEqual(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function hashPassword(password:string){const salt=randomBytes(16).toString("hex");const key=scryptSync(password,salt,64).toString("hex");return "scrypt$"+salt+"$"+key;}
export function verifyPassword(password:string,stored:string){const [,salt,key]=stored.split("$");if(!salt||!key)return false;return constantEqual(scryptSync(password,salt,64).toString("hex"),key);}
export function safeEmail(value:string){return value.trim().toLowerCase();}
