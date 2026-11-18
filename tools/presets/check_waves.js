const {ev}=require('./search_waves.js');const S=require('../../seqstrat.js');
const c=[
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:20,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:15,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:25,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.4,seaLevelAmplitude:20,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.4,seaLevelAmplitude:25,seaLevelPeriod:200000},
{sedimentSupply:20,subsidenceMax:0.3,seaLevelAmplitude:20,seaLevelPeriod:200000,fallIncision:3},
];
for(const p of c){const m=ev(p);console.log(m.pass?'PASS':'FAIL',m.seq,JSON.stringify(p),`dur${m.minDur.toFixed(2)} th${m.minLstMax.toFixed(1)} up${(m.maxUp*100).toFixed(1)}% sh${m.maxShore.toFixed(1)} low${m.minLow.toFixed(1)} mb${m.mb.toExponential(1)} wrs${m.wrs}`);}
