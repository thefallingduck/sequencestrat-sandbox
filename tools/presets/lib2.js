const S=require('../../seqstrat.js');
function lstStats(r){const h=r.history,x=r.x,N=x.length;const out=[];
 for(const t of r.tracts.filter(t=>t.type==='LST')){const xsL=h.shorelineX[t.startLayer];let up=0,tot=0,mx=0;
  for(let i=0;i<N;i++){let th=0;for(let k=t.startLayer;k<=t.endLayer;k++)th+=r.thickness[k][i];tot+=th;if(x[i]<xsL-5e3)up+=th;mx=Math.max(mx,th);}
  out.push({dur:(t.endTime-t.startTime)/1e3,max:mx,up:up/Math.max(tot,1e-9)});}
 return out;}
function lowering(r){const h=r.history,x=r.x;const o=[];
 for(const t of r.tracts.filter(t=>t.type==='FSST')){const k0=Math.max(0,t.startLayer-1),k1=t.endLayer,dtY=h.t[k1]-h.t[k0];let s=0,c=0;
  for(let i=0;i<x.length;i++)if(x[i]>=20e3&&x[i]<50e3){s+=r.paleoSurface[k1][i]-r.paleoSurface[k0][i]+r.subsidence[i]*dtY;c++;}o.push(-s/c);}
 return o;}
function wrs(r){let w=0;for(const s of r.surfaces)if(s.type==='WRS'){let c=0;for(const v of s.z)if(!Number.isNaN(v))c++;w=Math.max(w,c);}return w;}
// falls: for each SB, peak-to-trough eustatic drop before it (from preceding local max within FSST interval)
function falls(r){const h=r.history,e=h.eustasy,o=[];
 for(const s of r.surfaces.filter(s=>s.type==='SB')){const k=s.layer;
  // trough: min eustasy near k (within +-3), peak: walk back while eustasy was higher
  let kk=k;while(kk>0&&e[kk-1]>=e[kk])kk--; // not exactly; use rslRate instead
  let a=k;while(a>0&&h.rslRate[a]<0)a--; // start of fall
  let b=k;while(b<e.length-1&&h.rslRate[b]<0)b++;
  const k0=Math.max(0,a-1);
  o.push(e[k0]-Math.min(...e.slice(k0,b+1)));}
 return o;}
module.exports={lstStats,lowering,wrs,falls};
