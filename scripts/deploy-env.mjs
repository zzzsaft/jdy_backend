import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

// Explicitly invoked environment deployment. Secrets travel only through SSH stdin/stdout
// in process memory; output contains names and verification status, never values.
const write = process.argv.includes("--write");
const host = process.env.OA_DEPLOY_SSH_TARGET || "zzzsaft@hz.jc-times.com";
const port = process.env.OA_DEPLOY_SSH_PORT || "24";
function ssh(script) {
  const r = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-p", port, host, "python3", "-"], { input: script, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  if (r.status !== 0) throw new Error("Remote environment operation failed; output withheld to protect credentials");
  try { return JSON.parse(r.stdout); } catch { throw new Error("Invalid environment operation response"); }
}
const snapshot = ssh(`import pathlib,json,base64,hashlib
out={}
for name in ['.env','.env.prod']:
 p=pathlib.Path('/volume1/docker/backend')/name
 raw=p.read_bytes() if p.exists() else b''
 out[name]={'content':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()}
print(json.dumps(out))
`);
const remote = Object.fromEntries(Object.entries(snapshot).map(([name, data]) => [name, dotenv.parse(Buffer.from(data.content, "base64"))]));
const effective = { ...remote[".env.prod"], ...remote[".env"] };
if (!effective.CONNECTOR_JDY_BACKEND_TOKEN || !effective.CONNECTOR_BASE_URL) throw new Error("Prepare production Connect token and base URL before environment deployment");
const planned = {};
for (const name of [".env", ".env.prod"]) {
  const local = fs.existsSync(name) ? dotenv.parse(fs.readFileSync(name)) : {};
  // Preserve existing production values; add locally configured missing values.
  const target = { ...local, ...remote[name] };
  if (name === ".env") {
    target.NODE_ENV = "production";
    target.CONNECTOR_JDY_BACKEND_TOKEN = effective.CONNECTOR_JDY_BACKEND_TOKEN;
    target.CONNECTOR_BASE_URL = effective.CONNECTOR_BASE_URL;
  }
  // Neither pending migration is enabled by deploying configuration.
  if (target.PERSONNEL_SYNC_OWNER === "connect" || target.CRM_SSO_ENABLED === "true") throw new Error("Pending personnel/CRM migration is enabled; complete its release verification first");
  const updates = Object.fromEntries(Object.entries(target).filter(([key,value]) => remote[name][key] !== value));
  let raw = Buffer.from(snapshot[name].content, "base64").toString("utf8");
  if (Object.keys(updates).length) {
    raw += "\n# OA environment deployment: preserve production settings\n";
    for (const [key,value] of Object.entries(updates)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("'")) throw new Error("Unsupported environment encoding; no value printed");
      raw += `${key}='${value}'\n`;
    }
  }
  const parsed = dotenv.parse(raw);
  for (const [key,value] of Object.entries(target)) if (parsed[key] !== value) throw new Error("Environment round-trip verification failed");
  planned[name] = { previous: snapshot[name].sha256, content: Buffer.from(raw).toString("base64"), sha256: crypto.createHash("sha256").update(raw).digest("hex"), changedKeys: Object.keys(updates) };
}
if (!write) {
  console.log(JSON.stringify({ mode: "dry-run", changedKeys: Object.fromEntries(Object.entries(planned).map(([k,v]) => [k,v.changedKeys])), productionValuesPreserved: true }));
} else {
  const encoded = Buffer.from(JSON.stringify(planned)).toString("base64");
  const result = ssh(`import pathlib,json,base64,hashlib,os,datetime
root=pathlib.Path('/volume1/docker/backend')
plan=json.loads(base64.b64decode('${encoded}'))
for name,item in plan.items():
 p=root/name
 raw=p.read_bytes() if p.exists() else b''
 if hashlib.sha256(raw).hexdigest()!=item['previous']:raise RuntimeError('Configuration changed concurrently')
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
backup=root/'.deploy-backup'/('oa-env-'+stamp)
changed=[n for n,v in plan.items() if v['changedKeys']]
if changed:backup.mkdir(mode=0o700)
for name in changed:
 p=root/name
 if p.exists():
  fd=os.open(str(backup/name),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'wb') as f:f.write(p.read_bytes())
  os.chmod(str(backup/name),0o600)
 data=base64.b64decode(plan[name]['content'])
 temp=root/(name+'.deploy-'+stamp)
 fd=os.open(str(temp),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:
  f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(str(temp),str(p))
for name,item in plan.items():
 os.chmod(str(root/name),0o600)
 if ((root/name).stat().st_mode & 0o777)!=0o600:raise RuntimeError('Configuration permissions incorrect')
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=item['sha256']:raise RuntimeError('Verification failed')
print(json.dumps({'mode':'written-and-verified','changedKeys':{n:v['changedKeys'] for n,v in plan.items()},'backup':str(backup) if changed else None,'restartPerformed':False}))
`);
  console.log(JSON.stringify(result));
}
