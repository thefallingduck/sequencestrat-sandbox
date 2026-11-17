const S=require('../../seqstrat.js');
for(const A of [10,20,25]){
const r=S.simulate({sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:A,seaLevelPeriod:200000}),h=r.history;
console.log('A',A,r.tracts.map(t=>`${t.type}[${t.startTime/1e3}-${t.endTime/1e3}]`).join(' '));
for(const t of r.tracts.filter(t=>t.type==='FSST'||t.type==='LST')){
 const ks=[];for(let k=t.startLayer;k<=t.endLayer;k++)ks.push(k);
 const rate=a=>Math.min(...a), mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 console.log(' ',t.type,'RSLrate min/mean m/kyr',rate(ks.map(k=>h.rslRate[k])).toFixed(2),mean(ks.map(k=>h.rslRate[k])).toFixed(2),'shore km',(h.shorelineX[t.startLayer]/1e3).toFixed(1),'->',(h.shorelineX[t.endLayer]/1e3).toFixed(1));}
}
