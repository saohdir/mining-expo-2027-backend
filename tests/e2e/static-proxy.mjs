// Local stand-in for the UAT Nginx: serves the static frontend and proxies /api, /account, /admin, /floorplan to Next.js.
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root=process.env.E2E_FRONTEND_DIR;const backend=Number(process.env.E2E_BACKEND_PORT||3100);const port=Number(process.env.E2E_PROXY_PORT||8090);
const types={".html":"text/html",".css":"text/css",".js":"text/javascript",".webp":"image/webp",".png":"image/png",".svg":"image/svg+xml",".jpg":"image/jpeg"};
http.createServer((req,res)=>{const u=new URL(req.url,"http://x");
 if(/^\/(api|_next|account|admin|floorplan|conferences)(\/|$)/.test(u.pathname)){const p=http.request({host:"127.0.0.1",port:backend,path:req.url,method:req.method,headers:{...req.headers,"x-forwarded-for":"10.0.0."+Math.floor(Math.random()*200)}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});req.pipe(p);return}
 if(u.pathname==="/zh"){res.writeHead(301,{location:"/zh/"});res.end();return}
 // CR-LANG-01: same as nginx — /zh/... serves the same static file.
 let f=path.join(root,decodeURIComponent(u.pathname.replace(/^\/zh(?=\/)/,"")));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,"index.html");
 if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);res.end("404");return}
 res.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(res)}).listen(port);
