const S=require('../../seqstrat.js');
const c=[{seaLevelAmplitude:2,seaLevelPeriod:200000,seaLevelTrend:0.1},{seaLevelAmplitude:3,seaLevelPeriod:200000,seaLevelTrend:0.1},{seaLevelAmplitude:2,seaLevelPeriod:200000,subsidenceMax:0.15},{seaLevelAmplitude:3,seaLevelTrend:0.15}];
for(const q of c){const p=Object.assign({sedimentSupply:30,subsidenceMax:0.05,seaLevelAmplitude:3},q);const r=S.simulate(p);const sh=r.history.shorelineX;
console.log(JSON.stringify(q),r.tracts.map(t=>t.type[0]+Math.round((t.endTime-t.startTime)/1e3)).join(' '),'minRSL',Math.min(...r.history.rslRate).toFixed(3),'shore',(sh[0]/1e3).toFixed(0),(sh[sh.length-1]/1e3).toFixed(0),'max',(Math.max(...sh)/1e3).toFixed(0),'edge',r.edgeFraction.toFixed(4));}
