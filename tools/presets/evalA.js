const S=require('../../seqstrat.js');const L=require('./lib2.js');
function evA(p){const r=S.simulate(p),h=r.history;const T=r.tracts;const m={};
 m.seq=T.map(t=>t.type[0]).join('');
 const sbs=r.surfaces.filter(s=>s.type==='SB');m.nSB=sbs.length;
 m.falls=L.falls(r);m.fmin=Math.min(...m.falls);m.fmax=Math.max(...m.falls);
 m.spread=m.fmin/m.fmax; // need <0.7
 m.maxShore=Math.max(...h.shorelineX)/1e3;m.edge=r.edgeFraction;m.mb=Math.abs(r.massBalance.error);
 m.lst=L.lstStats(r);m.nLST=m.lst.length;m.maxUp=Math.max(0,...m.lst.map(o=>o.up));
 // eustasy trend: peak of smoothed eustasy near mid-run
 const e=h.eustasy,n=e.length,sm=e.map((_,k)=>{let s=0,c=0;for(let j=Math.max(0,k-60);j<=Math.min(n-1,k+60);j++){s+=e[j];c++}return s/c});
 let kp=0;for(let k=0;k<n;k++)if(sm[k]>sm[kp])kp=k;m.peakFrac=kp/n;
 m.score=Math.abs(m.nSB-5)*2+Math.max(0,m.spread-0.7)*5+Math.max(0,m.maxShore-200)/20+Math.max(0,m.edge-0.02)*100+Math.max(0,2-m.nLST)*2+Math.max(0,m.maxUp-0.1)*20+Math.max(0,Math.abs(m.peakFrac-0.5)-0.15)*10;
 m.pass=m.nSB===5&&m.spread<0.7&&m.maxShore<=200&&m.edge<0.02&&m.nLST>=2&&m.maxUp<=0.1&&m.mb<1e-9&&Math.abs(m.peakFrac-0.5)<=0.15;
 return m;}
function show(p,m){console.log(m.pass?'PASS':'    ',m.score.toFixed(2),m.seq,JSON.stringify(p),'SB',m.nSB,'falls',m.falls.map(v=>v.toFixed(0)).join('/'),'sh',m.maxShore.toFixed(0),'edge',m.edge.toFixed(4),'LST',m.nLST,'up',(m.maxUp*100).toFixed(1)+'%','pk',m.peakFrac.toFixed(2));}
module.exports={evA,show};
if(require.main===module){
 const P3=1200000,ph3=Math.PI/2-2*Math.PI*300000/P3; // peak at 300 ka
 const base={duration:600000,seaLevelAmplitude3:25,seaLevelPeriod3:P3,seaLevelPhase3:+ph3.toFixed(3)};
 const c=[
  {seaLevelAmplitude:15,seaLevelPeriod:120000,sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude2:8,seaLevelPeriod2:400000},
  {seaLevelAmplitude:15,seaLevelPeriod:120000,sedimentSupply:20,subsidenceMax:0.3},
  {seaLevelAmplitude:12,seaLevelPeriod:100000,sedimentSupply:15,subsidenceMax:0.2,seaLevelAmplitude2:8,seaLevelPeriod2:300000},
 ];
 const k=+process.argv[2];
 const p=Object.assign({},base,c[k]);const t0=Date.now();show(p,evA(p));console.log((Date.now()-t0)/1e3);
}
