const {evA,show}=require('./evalA.js');
const base={duration:600000,seaLevelAmplitude3:25,seaLevelPeriod3:1200000,seaLevelPhase3:0,seaLevelAmplitude:15,seaLevelPeriod:120000,sedimentSupply:20,subsidenceMax:0.3};
const c=[
 {seaLevelAmplitude2:8,seaLevelPeriod2:400000,seaLevelPhase2:3.14},
 {seaLevelAmplitude2:8,seaLevelPeriod2:400000,seaLevelPhase2:0},
 {seaLevelAmplitude2:10,seaLevelPeriod2:200000,seaLevelPhase2:0},
 {seaLevelAmplitude2:6,seaLevelPeriod2:400000,seaLevelPhase2:3.14,sedimentSupply:18},
];
const k=+process.argv[2];for(const j of [k,k+2]){const p=Object.assign({},base,c[j]);show(p,evA(p));}
