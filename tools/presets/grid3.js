const {ev}=require('./eval3.js');const part=+process.argv[2],np=+process.argv[3];
const b={sedimentSupply:20,subsidenceMax:0.3,seaLevelPeriod:200000,seaLevelAmplitude:20};
const c=[];
for(const s of [10,15,20,25])for(const sub of [0.2,0.3,0.4,0.5])for(const a of [20,25,30])c.push({...b,sedimentSupply:s,subsidenceMax:sub,seaLevelAmplitude:a});
c.forEach((p,i)=>{if(i%np!==part)return;const m=ev(p);console.log(m.pass?'PASS':'FAIL',JSON.stringify(p),m.tr,'dur',m.ls.map(l=>l.dur+'/'+l.max.toFixed(0)+'/'+(l.up*100).toFixed(1)+'%').join(','),'low',m.lw.map(v=>v.toFixed(1)),'wrs',m.w,'sand',m.sand.map(v=>v.toFixed(2)),'ms',m.ms.toFixed(0),'edge',m.edge.toExponential(1),'mb',m.mb.toExponential(0));});
