/** @type {import('next').NextConfig} */
const nextConfig = {reactStrictMode:true, poweredByHeader:false,
  // Clickjacking protection: the account sign-in may only be framed by our own site (sign-in popup), the CMS never.
  async headers(){return [
    {source:"/account/:path*",headers:[{key:"X-Frame-Options",value:"SAMEORIGIN"},{key:"Content-Security-Policy",value:"frame-ancestors 'self'"}]},
    {source:"/account",headers:[{key:"X-Frame-Options",value:"SAMEORIGIN"},{key:"Content-Security-Policy",value:"frame-ancestors 'self'"}]},
    {source:"/admin/:path*",headers:[{key:"X-Frame-Options",value:"DENY"},{key:"Content-Security-Policy",value:"frame-ancestors 'none'"}]},
    {source:"/admin",headers:[{key:"X-Frame-Options",value:"DENY"},{key:"Content-Security-Policy",value:"frame-ancestors 'none'"}]}]}};
export default nextConfig;
