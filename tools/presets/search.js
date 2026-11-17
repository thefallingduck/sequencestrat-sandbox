// Random/grid search for an LST-producing preset with fallIncision>=2.
const S=require('../../seqstrat.js');
function evalP(params){
  const r=S.simulate(params), h=r.history, x=r.x, N=x.length, m={};
  const T=r.tracts, seq=T.map(t=>t.type).join('-');
  m.seq=T.map(t=>t.type[0]).join('');
  const lsts=T.filter(t=>t.type==='LST'), fss=T.filter(t=>t.type==='FSST');
  m.nLST=lsts.length;
  m.minDur=Math.min(...lsts.map(t=>(t.endTime-t.startTime)/1e3));
  let minMax=Infinity,maxUp=0;
  for(const t of lsts){
    const xsL=h.shorelineX[t.startLayer];let up=0,tot=0,mx=0;
    for(let i=0;i<N;i++){let th=0;for(let k=t.startLayer;k<=t.endLayer;k++)th+=r.thickness[k][i];tot+=th;if(x[i]<xsL-5e3)up+=th;mx=Math.max(mx,th);}
    minMax=Math.min(minMax,mx);maxUp=Math.max(maxUp,up/Math.max(tot,1e-9));
  }
  m.minLstMax=minMax; m.maxUp=maxUp;
  m.maxShore=Math.max(...h.shorelineX)/1e3;
  m.hasSB=r.surfaces.some(s=>s.type==='SB');
  m.order=/FSST-LST-TST/.test(seq);
  let minLow=Infinity;
  for(const t of fss){
    const k0=Math.max(0,t.startLayer-1),k1=t.endLayer,dtY=h.t[k1]-h.t[k0];let s=0,c=0;
    for(let i=0;i<N;i++)if(x[i]>=20e3&&x[i]<50e3){s+=r.paleoSurface[k1][i]-r.paleoSurface[k0][i]+r.subsidence[i]*dtY;c++;}
    minLow=Math.min(minLow,-s/c);
  }
  m.minLow=minLow; m.mb=Math.abs(r.massBalance.error);
  m.pass=m.nLST>=1&&m.minDur>=4&&m.minLstMax>=3&&m.maxUp<=0.05&&m.maxShore<=140&&m.hasSB&&m.order&&m.minLow>=3&&m.mb<1e-9;
  // violation score
  m.score=(m.nLST?0:5)+Math.max(0,4-m.minDur)/4+Math.max(0,3-m.minLstMax)/3+Math.max(0,m.maxUp-0.05)*10
    +Math.max(0,m.maxShore-140)/10+(m.hasSB?0:1)+(m.order?0:1)+Math.max(0,3-m.minLow)/3;
  return m;
}
module.exports={evalP};
if(require.main===module){
  const seed=+process.argv[2]||1; let s=seed; const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const t0=Date.now(), res=[], budget=(+process.argv[3]||600)*1000;
  while(Date.now()-t0<budget){
    const p={fallIncision:pick([2,2,3]),
      sedimentSupply:pick([10,15,20,25,30,35,40]),
      subsidenceMax:pick([0,0.02,0.05,0.1]),
      seaLevelAmplitude:pick([5,8,10,15,20]),
      seaLevelPeriod:pick([60000,80000,100000,120000,160000]),
      duration:pick([240000,300000])};
    if(rnd()<0.3) p.waveBaseDepth=pick([5,8,12]);
    const m=evalP(p); res.push({p,m});
    console.log(m.pass?'PASS':'    ',m.score.toFixed(2),m.seq,JSON.stringify(p),`dur${m.minDur} th${(m.minLstMax||0).toFixed(1)} up${(m.maxUp*100).toFixed(0)}% sh${m.maxShore.toFixed(0)} low${m.minLow.toFixed(1)}`);
  }
}
