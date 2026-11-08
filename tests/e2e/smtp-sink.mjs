// Minimal SMTP sink for local tests: stores each message as JSON lines.
import net from "node:net"; import fs from "node:fs";
const out=process.argv[2]||"/var/tmp/imdx-s1/mail.jsonl";
net.createServer(s=>{let data=false,buf="",msg={to:[],body:""};s.write("220 sink\r\n");
 s.on("data",d=>{buf+=d.toString();let i;while((i=buf.indexOf("\r\n"))>=0){const line=buf.slice(0,i);buf=buf.slice(i+2);
  if(data){if(line==="."){data=false;fs.appendFileSync(out,JSON.stringify(msg)+"\n");msg={to:[],body:""};s.write("250 ok\r\n");}else msg.body+=line+"\n";continue;}
  const u=line.toUpperCase();
  if(u.startsWith("EHLO")||u.startsWith("HELO"))s.write("250 sink\r\n");
  else if(u.startsWith("RCPT TO"))msg.to.push(line.slice(8).replace(/[<>]/g,"").trim()),s.write("250 ok\r\n");
  else if(u==="DATA")data=true,s.write("354 go\r\n");
  else if(u==="QUIT")s.end("221 bye\r\n");
  else s.write("250 ok\r\n");}});}).listen(2525,"127.0.0.1",()=>console.log("smtp sink on 2525"));
