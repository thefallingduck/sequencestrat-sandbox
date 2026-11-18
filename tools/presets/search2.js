const {evalP}=require('./search.js');
let s=+process.argv[2]||1; const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const t0=Date.now(),budget=(+process.argv[3]||300)*1000;
while(Date.now()-t0<budget){
  const p={fallIncision:pick([2,2,3]),sedimentSupply:pick([10,12,14,16,18,20,22,25]),
   subsidenceMax:pick([0.05,0.1,0.15,0.2,0.3]),seaLevelAmplitude:pick([10,15,20,25,30]),
   seaLevelPeriod:pick([100000,120000,140000,160000,200000]),duration:pick([240000,300000,360000])};
  if(rnd()<0.3)p.hingeX=pick([0,15000,60000]);
  if(rnd()<0.2)p.seaLevelTrend=pick([-0.1,0.1]);
  const m=evalP(p);
  console.log(m.pass?'PASS':'    ',m.score.toFixed(2),m.seq,JSON.stringify(p),`dur${m.minDur} th${(m.minLstMax||0).toFixed(1)} up${(m.maxUp*100).toFixed(0)}% sh${m.maxShore.toFixed(0)} low${m.minLow.toFixed(1)}`);
}
