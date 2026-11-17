const S=require('../../seqstrat.js');const {ev}=require('./eval3.js');
const p={sedimentSupply:15,seaLevelAmplitude:25,subsidenceMax:0.3,seaLevelPeriod:200000};
const r=S.simulate(p),h=r.history;const m=ev(p);console.log(JSON.stringify(m));
for(const t of r.tracts){const a=t.startLayer,b=t.endLayer;console.log(t.type,t.startTime/1e3,t.endTime/1e3,'rsl',h.rslRate[a].toFixed(1),h.rslRate[b].toFixed(1),'shore',(h.shorelineX[a]/1e3).toFixed(1),(h.shorelineX[b]/1e3).toFixed(1));}
