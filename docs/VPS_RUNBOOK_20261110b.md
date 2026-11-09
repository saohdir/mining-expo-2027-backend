# VPS runbook — remove group delegates + future-contact checkbox

No database change. Run on the VPS as root.

## 1. Switch group delegate registration off
```bash
cd /opt/imdx/mining-expo-2027-backend && cp .env.uat /root/env.uat.before-nogroups && { [ -z "$(tail -c1 .env.uat)" ] || echo >> .env.uat; } && if grep -q "^ENABLE_GROUP_ENROLLMENT=" .env.uat; then sed -i "s|^ENABLE_GROUP_ENROLLMENT=.*|ENABLE_GROUP_ENROLLMENT=false|" .env.uat; else echo "ENABLE_GROUP_ENROLLMENT=false" >> .env.uat; fi && grep "^ENABLE_GROUP_ENROLLMENT=" .env.uat
```

## 2. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-nogroups.txt | tail -12
```

## 3. Check
```bash
curl -s https://uat.imdx.tech/api/public/capabilities; echo
```
Expected: `"groupEnrollment":false`.
