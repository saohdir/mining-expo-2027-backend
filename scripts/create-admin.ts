import { PrismaClient, AdminRole } from "@prisma/client";
import { hashPassword, safeEmail } from "../src/lib/security";
const db=new PrismaClient();
async function main(){const email=process.env.ADMIN_SEED_EMAIL,password=process.env.ADMIN_SEED_PASSWORD;if(!email||!password||password.length<14)throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (>=14 chars) required");const role=AdminRole.SUPER_ADMIN;await db.adminUser.upsert({where:{email:safeEmail(email)},update:{passwordHash:hashPassword(password),role,active:true},create:{email:safeEmail(email),passwordHash:hashPassword(password),role}});console.log("Admin account seeded; remove bootstrap env variables.");}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
