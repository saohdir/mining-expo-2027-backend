import { PrismaClient } from "@prisma/client";
const db=new PrismaClient();
async function main(){await db.event.upsert({where:{code:"IMDX-2027"},update:{},create:{code:"IMDX-2027",title:"Indonesia Mining & Downstream Industries Exhibition 2027",venue:"JIEXPO Kemayoran, Jakarta",startsAt:new Date("2027-05-26T00:00:00+07:00"),endsAt:new Date("2027-05-28T23:59:59+07:00"),published:false,visitorOpen:false}});const event=await db.event.findUniqueOrThrow({where:{code:"IMDX-2027"}});
const titles=[
 {slug:"mining-downstream-green-mining",title:"2027 Indonesia Mining Downstream Industry & Green Mining Conference"},
 {slug:"china-indonesia-coal-energy",title:"2027 China-Indonesia Coal & Energy Conference — Main Forum"},
 {slug:"mining-industry-networking",title:"2027 Indonesia Mining Industry Networking Reception"}
];
for(const c of titles){await db.conference.upsert({where:{eventId_slug:{eventId:event.id,slug:c.slug}},create:{eventId:event.id,...c,published:false,feeMinor:null,capacity:null,startsAt:null},update:{}})}
console.log("Seeded DRAFT event and 3 DRAFT conference programs. Registration remains disabled.");}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
