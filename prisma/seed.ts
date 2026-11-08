import { PrismaClient } from "@prisma/client";
const db=new PrismaClient();
async function main(){await db.event.upsert({where:{code:"IMDX-2027"},update:{},create:{code:"IMDX-2027",title:"Indonesia Mining & Downstream Industries Exhibition 2027",venue:"JIEXPO Kemayoran, Jakarta",startsAt:new Date("2027-05-26T00:00:00+07:00"),endsAt:new Date("2027-05-28T23:59:59+07:00"),published:false,visitorOpen:false}});console.log("Seeded DRAFT event. Public registration remains disabled.");}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
