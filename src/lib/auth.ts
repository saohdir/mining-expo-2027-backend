import { cookies } from "next/headers";
import { db } from "./db";
import { hashToken,randomToken } from "./security";
import { HttpError } from "./errors";
import type { AdminRole, CustomerAccount } from "@prisma/client";
const CUSTOMER_COOKIE="imdx_customer_session",ADMIN_COOKIE="imdx_admin_session";
export function cookieOptions(days:number){return {httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/",maxAge:days*86400};}
export async function createCustomerSession(accountId:string){const token=randomToken();await db.customerSession.create({data:{accountId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+7*86400000)}});(await cookies()).set(CUSTOMER_COOKIE,token,cookieOptions(7));}
export async function customer():Promise<CustomerAccount>{const token=(await cookies()).get(CUSTOMER_COOKIE)?.value;if(!token)throw new HttpError(401,"LOGIN_REQUIRED","Please sign in.");const sess=await db.customerSession.findUnique({where:{tokenHash:hashToken(token)},include:{account:true}});if(!sess||sess.revokedAt||sess.expiresAt<new Date()||sess.account.status!=="ACTIVE")throw new HttpError(401,"SESSION_EXPIRED","Please sign in again.");return sess.account;}
export async function admin(roles?:AdminRole[]){const token=(await cookies()).get(ADMIN_COOKIE)?.value;if(!token)throw new HttpError(401,"ADMIN_LOGIN_REQUIRED","Admin login required.");const sess=await db.adminSession.findUnique({where:{tokenHash:hashToken(token)},include:{admin:true}});if(!sess||sess.expiresAt<new Date()||!sess.admin.active)throw new HttpError(401,"ADMIN_SESSION_EXPIRED","Admin session expired.");if(roles&&!roles.includes(sess.admin.role))throw new HttpError(403,"FORBIDDEN","Insufficient permission.");return sess.admin;}
export async function createAdminSession(adminId:string){const token=randomToken();await db.adminSession.create({data:{adminId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+12*3600000)}});(await cookies()).set(ADMIN_COOKIE,token,cookieOptions(.5));}
export async function endSessions(kind:"admin"|"customer"){const jar=await cookies();const key=kind==="admin"?ADMIN_COOKIE:CUSTOMER_COOKIE;const token=jar.get(key)?.value;if(token){if(kind==="admin")await db.adminSession.deleteMany({where:{tokenHash:hashToken(token)}});else await db.customerSession.deleteMany({where:{tokenHash:hashToken(token)}})}jar.delete(key);}
