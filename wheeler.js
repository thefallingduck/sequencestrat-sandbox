/* Wheeler (chronostratigraphic) diagram for the sequence-stratigraphy sandbox.
   Plain script. Defines window.drawWheeler(ctx,W,H,r,opts,T) and window.wheelerHitTest(r,opts,W,H,x,y).
   Needs window.sandRGB(f)->[r,g,b] (fallback defined here if missing). */
(function(){
'use strict';
var SURF_DASH={SB:[],MFS:[6,4],TS:[2,3],BSFR:[14,5],WRS:[10,3,2,3]};
var SURF_SHOW=['SB','BSFR','TS','MFS'];
var EPS=0.01; // m: ignore sub-centimetre cut-and-fill
var C_REMOVED=[196,196,192], C_HATCH=[132,132,128], C_ERODING=[128,128,124];
var C_ERODING_D=[96,96,94], C_REMOVED_D=[110,110,108], C_HATCH_D=[160,160,156];

function fallbackSand(f){
  var st=[[0x3d,0x46,0x56],[0x6b,0x6f,0x73],[0xa3,0x9a,0x7e],[0xd6,0xbf,0x7c],[0xf0,0xd7,0x7a]];
  var u=Math.max(0,Math.min(1,f/0.8))*4, j=Math.min(3,Math.floor(u)), a=u-j;
  return [0,1,2].map(function(m){return Math.round(st[j][m]+(st[j+1][m]-st[j][m])*a);});
}
function sandRGB(f){return (typeof window.sandRGB==='function'?window.sandRGB:fallbackSand)(f);}

/* state codes: 0 hiatus, 1 preserved, 2 removed, 3 eroding */
var cache=new WeakMap();
function classify(r){
  var c=cache.get(r); if(c) return c;
  /* Group layers into time bins (>= 3 kyr, ~100 rows per diagram) so flood-pulse cut-and-fill
     at single-layer resolution does not dominate. Each bin is classified by what it left:
     preserved sediment, or else its net surface change (deposited-then-removed, eroding, hiatus). */
  var N=r.x.length, K=r.nLayers, st=new Uint8Array(N*K), sand=new Float32Array(N*K);
  var th=r.thickness, sf=r.sandFraction, ps=r.paleoSurface, t=r.history.t, sub=r.subsidence;
  var dtL=K>1?(t[K-1]-t[0])/(K-1):t[0];
  var bin=Math.max(1, Math.max(Math.round(3000/dtL), Math.round(K/100)));
  for(var k0=0;k0<K;k0+=bin){
    var k1=Math.min(K-1,k0+bin-1);
    var dtB=t[k1]-(k0>0?t[k0-1]:0);
    for(var i=0;i<N;i++){
      var pres=0, ps_=0;
      for(var k=k0;k<=k1;k++){var tk=th[k][i]; if(tk>0){var f=sf[k][i]; pres+=tk; if(f===f) ps_+=tk*f;}}
      var s, fs=pres>0?ps_/pres:NaN;
      if(pres>EPS) s=1;
      else{
        var before=k0>0?ps[k0-1][i]:(ps[0][i]-th[0][i]);
        var dz=ps[k1][i]-before+sub[i]*dtB;
        s=dz>EPS?2:(dz<-EPS?3:0);
      }
      for(k=k0;k<=k1;k++){st[k*N+i]=s; sand[k*N+i]=fs;}
    }
  }
  c={st:st,sand:sand,N:N,K:K,bin:bin}; cache.set(r,c); return c;
}

function layout(W,H,opts){
  var narrow=W<560;
  var legH=narrow?36:20;
  var L={narrow:narrow, ml:narrow?42:52, mr:narrow?40:62, mt:legH+8, mb:42};
  L.pw=Math.max(10,W-L.ml-L.mr); L.ph=Math.max(10,H-L.mt-L.mb);
  L.legH=legH; return L;
}
function colAt(r,xm,xView){ // xm in metres -> column index
  var N=r.x.length, i=Math.round(xm/r.dx); // x[i]=i*dx assumed; verify
  if(r.x[0]!==0) i=Math.round((xm-r.x[0])/r.dx);
  return Math.max(0,Math.min(N-1,i));
}
function layerAt(r,tyr){
  var t=r.history.t, lo=0, hi=t.length-1;
  if(tyr<=0) return 0; if(tyr>=t[hi]) return hi;
  while(lo<hi){var m=(lo+hi)>>1; if(t[m]>=tyr) hi=m; else lo=m+1;}
  return lo;
}
function niceStep(range,n){
  var raw=range/n, p=Math.pow(10,Math.floor(Math.log10(raw))), f=raw/p;
  return (f<1.5?1:f<3?2:f<7?5:10)*p;
}

window.drawWheeler=function(ctx,W,H,r,opts,T){
  opts=opts||{}; T=T||{};
  var L=layout(W,H,opts), ml=L.ml,mt=L.mt,pw=L.pw,ph=L.ph, dark=!!T.dark;
  var xView=opts.xView||(r.x[r.x.length-1]), dur=r.params.duration, durKa=dur/1000;
  var showSurf=!!opts.showSurfaces&&!opts.exercise, showShore=opts.showShoreline!==false;
  var ink=T.ink||'#222', muted=T.muted||'#666', line=T.line||'#ccc';
  var mono=T.mono||'monospace', body=T.body||'sans-serif';
  ctx.save();
  ctx.fillStyle=T.surface||'#fff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=T.plotBg||'#f4f1ea'; ctx.fillRect(ml,mt,pw,ph);

  /* --- raster --- */
  var iw=Math.max(1,Math.round(pw)), ih=Math.max(1,Math.round(ph));
  var cv=window.__wheelerCv||(window.__wheelerCv=document.createElement('canvas'));
  cv.width=iw; cv.height=ih;
  var c2=cv.getContext('2d'), img=c2.createImageData(iw,ih), d=img.data;
  var cl=classify(r), st=cl.st, N=cl.N, sand=cl.sand;
  var colOf=new Int32Array(iw), kOf=new Int32Array(ih);
  for(var px=0;px<iw;px++) colOf[px]=colAt(r,(px+.5)/iw*xView,xView);
  for(var py=0;py<ih;py++) kOf[py]=layerAt(r,(1-(py+.5)/ih)*dur);
  var lut=new Array(256), q;
  for(q=0;q<256;q++) lut[q]=sandRGB(q/255);
  var sf=r.sandFraction, rm=dark?C_REMOVED_D:C_REMOVED, hh=dark?C_HATCH_D:C_HATCH, er=dark?C_ERODING_D:C_ERODING;
  var bg=parseColor(T.plotBg||'#f4f1ea');
  for(py=0;py<ih;py++){
    var k=kOf[py], row=k*N, sfk=sf[k], o=py*iw*4;
    for(px=0;px<iw;px++,o+=4){
      var i=colOf[px], s=st[row+i], c;
      if(s===1){var f=sand[row+i]; q=f!==f?0:Math.max(0,Math.min(255,Math.round(f*255))); c=lut[q];}
      else c=bg; // no preserved record (eroded, removed later, or never deposited) stays blank
      d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255;
    }
  }
  c2.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(cv,0,0,iw,ih,ml,mt,pw,ph);

  var X=function(m){return ml+m/xView*pw;}, Y=function(tyr){return mt+ph-tyr/dur*ph;};
  ctx.beginPath(); ctx.rect(ml,mt,pw,ph); ctx.clip();

  /* --- surfaces --- */
  var labels=[];
  if(showSurf){
    ctx.lineWidth=1.2; ctx.strokeStyle=ink; ctx.globalAlpha=.85;
    (r.surfaces||[]).forEach(function(s){
      if(SURF_SHOW.indexOf(s.type)<0) return;
      var y=Y(s.time); if(y<mt-1||y>mt+ph+1) return;
      ctx.setLineDash(SURF_DASH[s.type]||[]);
      ctx.beginPath(); ctx.moveTo(ml,y); ctx.lineTo(ml+pw,y); ctx.stroke();
      labels.push({y:y,t:s.type});
    });
    ctx.setLineDash([]); ctx.globalAlpha=1;
  }
  /* --- shoreline --- */
  var shoreLab=null;
  if(showShore){
    var hs=r.history, sea=T.sea||'#2f6fd1';
    // halo for contrast, then line
    for(var pass=0;pass<2;pass++){
      ctx.beginPath(); ctx.lineJoin='round';
      ctx.strokeStyle=pass===0?(dark?'rgba(0,0,0,.55)':'rgba(255,255,255,.8)'):sea;
      ctx.lineWidth=pass===0?3.5:1.5;
      for(var kk=0;kk<hs.t.length;kk++){
        var xx=X(hs.shorelineX[kk]), yy=Y(hs.t[kk]-(kk>0?(hs.t[kk]-hs.t[kk-1]):hs.t[0])/2);
        kk===0?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);
      }
      ctx.stroke();
    }
    // label spot: near the point with greatest clearance (mid-time)
    var km=Math.floor(hs.t.length*0.5);
    shoreLab={x:X(hs.shorelineX[km]),y:Y(hs.t[km])};
  }
  ctx.restore(); ctx.save();

  /* --- frame, ticks --- */
  ctx.strokeStyle=line; ctx.lineWidth=1; ctx.strokeRect(ml-.5,mt-.5,pw+1,ph+1);
  ctx.font='11px '+mono; ctx.fillStyle=muted; ctx.strokeStyle=muted;
  var kmView=xView/1000, sx=niceStep(kmView,L.narrow?4:7), v;
  ctx.textAlign='center'; ctx.textBaseline='top';
  for(v=0;v<=kmView+1e-9;v+=sx){var x=X(v*1000);ctx.beginPath();ctx.moveTo(x,mt+ph);ctx.lineTo(x,mt+ph+4);ctx.stroke();ctx.fillText(String(+v.toFixed(2)),x,mt+ph+6);}
  var sy=niceStep(durKa,L.narrow?5:8);
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(v=0;v<=durKa+1e-9;v+=sy){var y=Y(v*1000);ctx.beginPath();ctx.moveTo(ml-4,y);ctx.lineTo(ml,y);ctx.stroke();ctx.fillText(String(+v.toFixed(2)),ml-7,y);}
  ctx.font='600 12px '+body; ctx.fillStyle=ink; ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillText('Distance (km)',ml+pw/2,H-2);
  ctx.save(); ctx.translate(11,mt+ph/2); ctx.rotate(-Math.PI/2); ctx.textBaseline='top'; ctx.fillText('Time (ka)',0,-4); ctx.restore();

  /* --- surface labels (right margin, nudged) --- */
  ctx.font='700 11px '+(T.head||body); ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=ink;
  labels.sort(function(a,b){return a.y-b.y;});
  var minGap=12, ly=[]; labels.forEach(function(l,j){ly[j]=j?Math.max(l.y,ly[j-1]+minGap):l.y;});
  var over=ly.length?ly[ly.length-1]-(mt+ph):0; if(over>0) for(var j=0;j<ly.length;j++) ly[j]-=over;
  labels.forEach(function(l,j){
    ctx.fillText(l.t,ml+pw+5,ly[j]);
    if(Math.abs(ly[j]-l.y)>1){ctx.strokeStyle=muted;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(ml+pw+1,l.y);ctx.lineTo(ml+pw+4,ly[j]);ctx.stroke();}
  });
  if(shoreLab){
    ctx.font='italic 600 11.5px '+body; ctx.fillStyle=T.sea||'#2f6fd1'; ctx.textAlign='left'; ctx.textBaseline='bottom';
    var lx=Math.min(shoreLab.x+6,ml+pw-52);
    ctx.save(); ctx.lineWidth=3; ctx.strokeStyle=T.plotBg||'#fff'; ctx.globalAlpha=.8;
    ctx.strokeText('shoreline',lx,shoreLab.y-3); ctx.restore();
    ctx.fillText('shoreline',lx,shoreLab.y-3);
  }

  /* --- legend --- */
  var long=!L.narrow;
  var items=[
    {k:'p',t:long?'Preserved sediment (colour = sand content)':'Preserved (sand content)'},
    {k:'h',t:long?'Gap: no sediment preserved from this time':'Gap (nothing preserved)'}];
  ctx.font='11.5px '+body; ctx.textBaseline='middle'; ctx.textAlign='left';
  var lx0=ml, ly0=L.narrow?10:11, sw=14, x0=lx0, y0=ly0;
  items.forEach(function(it){
    var w=sw+5+ctx.measureText(it.t).width+14;
    if(x0+w-14>W-6&&x0>lx0){x0=lx0;y0+=16;}
    swatch(ctx,it.k,x0,y0-6,sw,12,T,dark,bg);
    ctx.fillStyle=ink; ctx.fillText(it.t,x0+sw+5,y0);
    x0+=w;
  });
  ctx.restore();
};

function swatch(ctx,k,x,y,w,h,T,dark,bg){
  if(k==='p'){var g=ctx.createLinearGradient(x,0,x+w,0);for(var j=0;j<=4;j++){var c=sandRGB(j/4*0.8);g.addColorStop(j/4,'rgb('+c.join(',')+')');}ctx.fillStyle=g;ctx.fillRect(x,y,w,h);}
  else if(k==='r'){ctx.fillStyle='rgb('+(dark?C_REMOVED_D:C_REMOVED).join(',')+')';ctx.fillRect(x,y,w,h);
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.strokeStyle='rgb('+(dark?C_HATCH_D:C_HATCH).join(',')+')';ctx.lineWidth=1;ctx.beginPath();
    for(var s=-h;s<w;s+=4){ctx.moveTo(x+s,y+h);ctx.lineTo(x+s+h,y);}ctx.stroke();ctx.restore();}
  else if(k==='e'){ctx.fillStyle='rgb('+(dark?C_ERODING_D:C_ERODING).join(',')+')';ctx.fillRect(x,y,w,h);}
  else{ctx.fillStyle=T.plotBg||'#f4f1ea';ctx.fillRect(x,y,w,h);}
  ctx.strokeStyle=T.line||'#bbb';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
function parseColor(s){
  var m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if(m){var h=m[1];if(h.length===3)h=h.replace(/./g,'$&$&');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  m=/rgba?\(([^)]+)\)/.exec(s); if(m){var a=m[1].split(',').map(parseFloat);return [a[0]|0,a[1]|0,a[2]|0];}
  return [244,241,234];
}

window.wheelerClassify=classify;
window.wheelerHitTest=function(r,opts,W,H,cx,cy){
  opts=opts||{}; var L=layout(W,H,opts);
  if(cx<L.ml||cx>=L.ml+L.pw||cy<L.mt||cy>=L.mt+L.ph) return null;
  var xView=opts.xView||r.x[r.x.length-1], dur=r.params.duration;
  var xm=(cx-L.ml)/L.pw*xView, tyr=(1-(cy-L.mt)/L.ph)*dur;
  var i=colAt(r,xm,xView), k=layerAt(r,tyr), cl=classify(r), s=cl.st[k*cl.N+i];
  var f=cl.sand[k*cl.N+i];
  return {xKm:xm/1000,timeKa:tyr/1000,
    state:['hiatus','preserved','removed','eroding'][s],
    sand:(s===1&&f===f)?f:null};
};
})();
