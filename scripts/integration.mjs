// Only touches a fresh scratch tree. Never repairs ACLs or changes a DSH profile.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative, isAbsolute, parse } from 'node:path';
import { readRoots } from '../lib/policy.js';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const runner=process.argv[2] ?? join(root,'lib','runner.js');
const base=mkdtempSync(join(realpathSync.native(tmpdir()),'dsh-mxc-integration-'));
const workspace=join(base,'workspace'),extra=join(base,'cache'),outside=join(base,'outside');
for(const dir of [workspace,extra,outside])mkdirSync(dir);
const seed=join(workspace,'seed.txt');writeFileSync(seed,'seed');
const host={systemDrive:process.env.SystemDrive,localAppData:process.env.LOCALAPPDATA};
const results=[];
function run(mode,code,roots=[workspace],args=[]) {
 return spawnSync(process.execPath,[runner,JSON.stringify({mode,roots,host}),'--',process.execPath,'-e',code,...args],{cwd:workspace,encoding:'utf8',timeout:30000});
}
function acl(path){const result=spawnSync('icacls.exe',[path],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;}
function record(name,fn){fn();results.push({name,status:'passed'});console.log('PASS '+name);}
try {
 const before=acl(workspace), seedBefore=acl(seed);
 const probe=spawnSync(process.execPath,[runner,'--probe'],{cwd:workspace,encoding:'utf8',timeout:30000});
 if(probe.status!==0) {
   const report={nativeAvailable:false,probeExit:probe.status,stderr:probe.stderr,results,profileChanged:false};
   writeFileSync(join(root,'integration-result.json'),JSON.stringify(report,null,2)+'\n');
   console.error('Native MXC/PSEC not usable: '+(probe.stderr||'capability unavailable (exit '+probe.status+')'));
   process.exitCode=1;
 } else {
   record('workspace write and authorized extra cache write',()=>{
     const result=run('workspace-write',`const fs=require('node:fs');fs.writeFileSync(process.argv[1],'ok');fs.writeFileSync(process.argv[2],'cache');`,[workspace,extra],[join(workspace,'allowed.txt'),join(extra,'allowed.txt')]);
     assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(extra,'allowed.txt'),'utf8'),'cache');
   });
   record('outside write denied',()=>{
     const target=join(outside,'forbidden.txt');
     const result=run('workspace-write',`try{require('node:fs').writeFileSync(process.argv[1],'bad');process.exit(9)}catch(e){if(!['EACCES','EPERM'].includes(e.code))throw e;}`,[workspace],[target]);
     assert.equal(result.status,0,result.stderr);assert.equal(existsSync(target),false);
   });
   record('read-only denies workspace and extra writes',()=>{
     for(const target of [join(workspace,'readonly.txt'),join(extra,'readonly.txt')]){
       const result=run('read-only',`try{require('node:fs').writeFileSync(process.argv[1],'bad');process.exit(9)}catch(e){if(!['EACCES','EPERM'].includes(e.code))throw e;}`,[workspace,extra],[target]);
       assert.equal(result.status,0,result.stderr);assert.equal(existsSync(target),false);
     }
   });
   record('cross-volume host directory enumeration and exact argument quoting',()=>{
     const code=`const fs=require('node:fs');if(!fs.readdirSync(process.argv[1]).length)process.exit(8);if(process.argv[2]!=='a b\\\\')process.exit(9);`;
     const otherVolume=readRoots([workspace]).find(root=>root.toLowerCase()!==parse(workspace).root.toLowerCase());
     assert.ok(otherVolume,'cross-volume validation requires a second mounted volume');
     const result=run('read-only',code,[workspace],[otherVolume,'a b\\']);
     assert.equal(result.status,0,result.stderr);
   });
   record('PowerShell workspace file write and removal',()=>{
     const target=join(workspace,'pwsh.txt');
     const script=`[System.IO.File]::WriteAllText('${target.replaceAll("'","''")}', 'ok'); Remove-Item -LiteralPath '${target.replaceAll("'","''")}' -ErrorAction Stop`;
     const result=spawnSync(process.execPath,[runner,JSON.stringify({mode:'workspace-write',roots:[workspace],host}),'--',join(process.env.ProgramFiles,'PowerShell','7','pwsh.exe'),'-NoProfile','-NonInteractive','-Command',script],{cwd:workspace,encoding:'utf8',timeout:30000});
     assert.equal(result.status,0,result.stderr);assert.equal(existsSync(target),false);
   });
   record('workspace and existing file ACL/integrity labels unchanged',()=>{
     assert.equal(acl(workspace),before);assert.equal(acl(seed),seedBefore);
   });
   record('target nonzero exit is mirrored',()=>{
     const result=run('read-only','process.exit(42)');assert.equal(result.status,42,result.stderr);
   });
   const report={nativeAvailable:true,results,profileChanged:false};
   writeFileSync(join(root,'integration-result.json'),JSON.stringify(report,null,2)+'\n');
   console.log('All scratch-tree native tests passed. No profile was modified.');
 }
} catch(error) {
 writeFileSync(join(root,'integration-result.json'),JSON.stringify({nativeAvailable:true,results,failure:String(error),profileChanged:false},null,2)+'\n');
 throw error;
} finally {
 const parent=realpathSync.native(tmpdir());const owned=relative(parent,base);
 if(isAbsolute(owned)||owned.startsWith('..')||!owned.startsWith('dsh-mxc-integration-'))throw new Error('unexpected scratch cleanup path');
 rmSync(base,{recursive:true,force:true});
}
