const {evalP}=require('./search.js');
const S=require('../../seqstrat.js');
function ev(p){
  const m=evalP(p);
  const r=S.simulate(p); // second run only for WRS; cheap enough
  let w=0;for(const s of r.surfaces)if(s.type==='WRS'){let c=0;for(const v of s.z)if(!Number.isNaN(v))c++;w=Math.max(w,c);}
  m.wrs=w; if(w<20){m.pass=false;m.score+=1;}
  return m;
}
module.exports={ev};
if(require.main===module){
let s=+process.argv[2]||1; const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const t0=Date.now(),budget=(+process.argv[3]||300)*1000;
while(Date.now()-t0<budget){
  const p={sedimentSupply:pick([10,15,20,25,30]),subsidenceMax:pick([0.1,0.2,0.3,0.4,0.5]),
   seaLevelAmplitude:pick([10,15,20,25,30]),seaLevelPeriod:pick([60000,80000,100000,120000,160000,200000]),
   duration:pick([240000,300000])};
  if(rnd()<0.3)p.fallIncision=pick([3,4]);
  if(rnd()<0.3)p.hingeX=pick([0,15000,60000]);
  const m=ev(p);
  console.log(m.pass?'PASS':'    ',m.score.toFixed(2),m.seq,JSON.stringify(p),`dur${m.minDur} th${(m.minLstMax||0).toFixed(1)} up${(m.maxUp*100).toFixed(0)}% sh${m.maxShore.toFixed(0)} low${m.minLow.toFixed(1)} wrs${m.wrs}`);
}}
