const {evalP}=require('./search.js');
const c=[
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:10,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:15,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:20,seaLevelPeriod:200000},
{sedimentSupply:25,subsidenceMax:0.3,seaLevelAmplitude:25,seaLevelPeriod:200000,duration:300000},
{sedimentSupply:25,subsidenceMax:0.2,seaLevelAmplitude:15,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.2,seaLevelAmplitude:10,seaLevelPeriod:200000},
{sedimentSupply:22,subsidenceMax:0.3,seaLevelAmplitude:10,seaLevelPeriod:140000,duration:300000},
];
for(const p of c){p.fallIncision=2;const m=evalP(p);console.log(m.pass?'PASS':'FAIL',m.seq,JSON.stringify(p),`dur${m.minDur.toFixed(2)} th${m.minLstMax.toFixed(1)} up${(m.maxUp*100).toFixed(1)}% sh${m.maxShore.toFixed(1)} low${m.minLow.toFixed(1)} mb${m.mb.toExponential(1)}`);}
