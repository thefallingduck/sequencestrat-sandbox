const S=require('../../seqstrat.js');const L=require('./lib2.js');
const base={
forced:{seaLevelAmplitude:20,seaLevelPeriod:160000,duration:240000,sedimentSupply:15},
lst:{sedimentSupply:20,subsidenceMax:0.3,seaLevelPeriod:200000,seaLevelAmplitude:20},
trans:{seaLevelTrend:0.25,seaLevelAmplitude:4,sedimentSupply:6},
normal:{seaLevelAmplitude:3,sedimentSupply:30,subsidenceMax:0.05},
tilt:{seaLevelAmplitude:0,seaLevelTrend:0,subsidenceMax:0.3,hingeX:40000}};
for(const [n,p] of Object.entries(base)){const t0=Date.now();const r=S.simulate(p);const T=r.tracts;
 const seq=T.map(t=>t.type[0]+Math.round((t.endTime-t.startTime)/1e3)).join(' ');
 let tst=0;for(const s of r.tractByLayer)if(s==='TST')tst++;
 const sh=r.history.shorelineX;
 console.log(n,seq,'SB',r.surfaces.filter(s=>s.type==='SB').length,'FSST',T.filter(t=>t.type==='FSST').length,'TST%',(100*tst/r.nLayers).toFixed(0),'shore',(sh[0]/1e3).toFixed(0),(sh[sh.length-1]/1e3).toFixed(0),'max',(Math.max(...sh)/1e3).toFixed(0),'edge',r.edgeFraction.toFixed(4),'mb',r.massBalance.error.toExponential(1),
 'lst',JSON.stringify(L.lstStats(r).map(o=>[o.dur,+o.max.toFixed(1),+(o.up*100).toFixed(1)])),'low',JSON.stringify(L.lowering(r).map(v=>+v.toFixed(1))),'wrs',L.wrs(r),((Date.now()-t0)/1e3).toFixed(1)+'s');}
