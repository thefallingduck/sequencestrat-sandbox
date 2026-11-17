const S=require('../../seqstrat.js');const L=require('./lib2.js');
function ev(p){const r=S.simulate(p);const h=r.history,x=r.x,N=x.length;
 const ls=L.lstStats(r),lw=L.lowering(r),w=L.wrs(r);
 const tr=r.tracts.map(t=>t.type).join('-');
 let okSeq=false;for(let i=0;i+2<r.tracts.length;i++)if(r.tracts[i].type==='FSST'&&r.tracts[i+1].type==='LST'&&r.tracts[i+2].type==='TST')okSeq=true;
 // sand fraction
 const sand=[];for(const t of r.tracts.filter(t=>t.type==='LST')){let s=0,T=0;for(let k=t.startLayer;k<=t.endLayer;k++)for(let i=0;i<N;i++){const th=r.thickness[k][i];if(th>0){T+=th;s+=th*(r.sandFraction[k][i]||0);}}sand.push(s/T);}
 const sb=r.surfaces.some(s=>s.type==='SB');
 const mb=Math.max(Math.abs(r.massBalance.error),...r.massBalance.byFraction.map(b=>Math.abs(b.error)));
 const ms=Math.max(...h.shorelineX)/1e3;
 const m={tr,okSeq,sb,ls,lw,w,sand,edge:r.edgeFraction,ms,mb};
 m.pass=ls.length>0&&ls.every(l=>l.dur>=4&&l.dur<=15&&l.max>=3&&l.up<=0.05)&&okSeq&&sb&&lw.length>0&&lw.every(v=>v>=3)&&w>=20&&r.edgeFraction<0.02&&ms<=200&&mb<1e-9&&sand.every(v=>v>=0.2);
 return m;}
module.exports={ev};
if(require.main===module){const c=JSON.parse(process.argv[2]);for(const p of c){const m=ev(p);console.log(m.pass?'PASS':'FAIL',JSON.stringify(p),JSON.stringify(m,(k,v)=>typeof v==='number'?+v.toPrecision(3):v));}}
