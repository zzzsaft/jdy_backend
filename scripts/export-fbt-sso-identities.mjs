import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

// Read-only identity migration. Only encrypted output; never print row values or raw errors.
const source = { ...dotenv.parse(fs.readFileSync('.env.prod')), ...dotenv.parse(fs.readFileSync('.env')) };
const corps = JSON.parse(fs.readFileSync('wechat.json', 'utf8')).filter(x => x?.corpId && x?.name);
const corp = corps.find(x => x.name === 'jctimes') ?? corps[0];
if (!corp) throw new Error('Default WeCom company is not configured');
const write = process.argv.includes('--write');
const client = new pg.Client({host: source.PgHost, port:5433, user:source.PgUser, password:source.PgPassword, database:source.PgUser, connectionTimeoutMillis:10000});
let connected=false;
try {
 await client.connect();connected=true;
 await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query("SET LOCAL statement_timeout = '8s'");
 const result=await client.query('SELECT user_id, fbt_third_id FROM md_employee WHERE corp_id=$1 AND is_employed IS TRUE ORDER BY user_id LIMIT 10001',[corp.corpId]);
 if(result.rows.length>10000)throw new Error('BOUND_EXCEEDED');
 await client.query('COMMIT');
 const entries=[],userKeys=new Set(),thirdKeys=new Set();
 let missing=0,conflicts=0,invalid=0;
 for(const row of result.rows){
  const uid=row.user_id,third=row.fbt_third_id;
  if(typeof third!=='string'||!third.trim()){missing++;continue;}
  if(typeof uid!=='string'||!uid||uid!==uid.trim()||third!==third.trim()||/[\x00-\x1f]/.test(uid+third)){invalid++;continue;}
  const userKey=uid.toLowerCase();
  if(userKeys.has(userKey)||thirdKeys.has(third)){conflicts++;continue;}
  userKeys.add(userKey);thirdKeys.add(third);entries.push({userId:uid,thirdUserId:third});
 }
 const summary={mode:write?'write':'dry-run',active:result.rows.length,mapped:entries.length,missing,conflicts,invalid};
 if(conflicts||invalid){console.log(JSON.stringify({...summary,exported:false}));process.exitCode=2;}
 else if(write){
  const dir=path.join(process.env.USERPROFILE,'.codex','private-transfers');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'oa-fbt-sso-'+Date.now()+'.dpapi');
  const payload={schemaVersion:1,exportedAt:new Date().toISOString(),corpId:corp.corpId,source:'oa.md_employee.active',entries};
  const ps=String.raw`$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Security; $p=$env:SSO_TRANSFER_PATH; if(Test-Path -LiteralPath $p){throw 'Target exists'}; $text=[Console]::In.ReadToEnd(); $bytes=[Text.Encoding]::UTF8.GetBytes($text); $protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [IO.File]::WriteAllBytes($p,$protected); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl=[IO.File]::GetAccessControl($p); $acl.SetAccessRuleProtection($true,$false); $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'); $acl.SetAccessRule($rule); [IO.File]::SetAccessControl($p,$acl); $decoded=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($p),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); if([Text.Encoding]::UTF8.GetString($decoded) -cne $text){throw 'Verification failed'}`;
  const encrypted=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{input:JSON.stringify(payload),env:{...process.env,SSO_TRANSFER_PATH:file},encoding:'utf8'});
  if(encrypted.status!==0)throw new Error('PROTECTION_FAILED');
  console.log(JSON.stringify({...summary,exported:true,format:'DPAPI CurrentUser',file}));
 }else console.log(JSON.stringify({...summary,exported:false}));
}catch{
 console.error('Identity export failed; database details and identity rows suppressed');process.exitCode=1;
}finally{if(connected)await client.end();}
