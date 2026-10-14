/** Read-only shape probe. Output requires an explicitly private directory. */
import fs from 'node:fs';
import path from 'node:path';
import {sampleServices} from '../lib/observation.mjs';
import {privateDiagnostic,loaderObservations} from '../plugin/lib/host-resources.js';
export const name='dsh-plugin-compat-check-probe';
const WORKDIR=process.env.DSC_OUT_DIR||null;
const FIBER_STATES={0:'PENDING',1:'LOADING',2:'ACTIVE',3:'FAILED',4:'DISPOSED',5:'UNLOADING'};
export function apply(ctx){
 if(!WORKDIR)return;
 const write=(name,data)=>privateDiagnostic(path.join(WORKDIR,name),data);
 if(!write('probe-applied.txt',{appliedAt:new Date().toISOString()}))return;
 const timer=setTimeout(()=>{
  let services=[],manifests=[];
  try{const data=JSON.parse(fs.readFileSync(path.join(WORKDIR,'services.json'),'utf8'));
   if(!Array.isArray(data.services)||data.services.length>10000)throw new Error('Invalid service list');
   services=data.services.filter(s=>typeof s==='string'&&s.length<256);
   manifests=Array.isArray(data.manifests)?data.manifests:[];
  }catch{write('probe-report.json',{error:'Cannot read requested services',root:{},observationVersion:1,profileId:process.env.DSC_PROFILE_ID||null});return;}
  const report=sampleServices(ctx,services,{profileId:process.env.DSC_PROFILE_ID||null,dshVersion:process.env.DSC_DSH_VERSION||null});
  const entries=loaderObservations(ctx,manifests);
  report.entries={plugins:entries.rows,note:entries.available?null:'Loader unavailable',unmapped:entries.unmapped};
  report.probeVersion=5;
  write('probe-report.json',report);
 },4000);
 timer.unref?.();
 ctx.effect?.(()=>()=>clearTimeout(timer));
}
