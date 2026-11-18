const {evA,show}=require('./evalA.js');const S=require('../../seqstrat.js');
const p={duration:600000,seaLevelAmplitude:15,seaLevelPeriod:120000,seaLevelAmplitude2:8,seaLevelPeriod2:400000,seaLevelPhase2:Math.PI,seaLevelAmplitude3:25,seaLevelPeriod3:1200000,seaLevelPhase3:0,sedimentSupply:20,subsidenceMax:0.3};
const m=evA(p);show(p,m);console.log(JSON.stringify(m.lst.map(o=>[o.dur,+o.max.toFixed(1),+(o.up*100).toFixed(1)])),'mb',m.mb);
