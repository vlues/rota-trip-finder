(function(){
"use strict";
const D=window.__DEST__, COAST=window.__COAST__;
const LA=36.6236, LO=-6.3597, KX=111.32*Math.cos(LA*Math.PI/180), KY=110.57;
const RINGS=[{h:1,r:52},{h:2,r:103},{h:3,r:168},{h:4,r:262},{h:5,r:330},{h:6,r:416},{h:7,r:480},{h:8,r:592},
             {h:10,r:880},{h:12,r:1080},{h:14,r:1240},{h:16,r:1400}];
const RMAX=1400, HMAX=16;
const CAT={coast:"Coast & beach",village:"Village",city:"City",nature:"Nature",history:"History",foodwine:"Food & wine",quirky:"Odd & wonderful"};
const CATC={coast:"#3FA9C9",village:"#E9A13B",nature:"#6FA76B",city:"#9A8BD0",history:"#D4715A",foodwine:"#C25E86",quirky:"#48B39C"};
const $=s=>document.querySelector(s), esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const cv=$("#cv"), ctx=cv.getContext("2d");
const REDUCED=matchMedia("(prefers-reduced-motion:reduce)").matches;
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);

D.forEach((o,i)=>{o.i=i;o.x=(o.lon-LO)*KX;o.y=(o.lat-LA)*KY;o.pc=o.cats[0]||"nature";o.t0=0;
  o.bonus=(o.pf===true&&!o.pp); o.hh=o.h<1?Math.round(o.h*60)+" min":(o.h%1?(+o.h.toFixed(2))+" h":o.h+" h");});

/* ---------- tokens ---------- */
let T={};
function tokens(){const s=getComputedStyle(document.documentElement);
  ["sea","sea-line","land","land-edge","grat","line","ink","ink-2","muted","amber","amber-b","cyan","green","red","panel","ground"]
  .forEach(k=>T[k]=s.getPropertyValue("--"+k).trim());}
function mix(hex,a){const n=hex.replace("#","");const v=n.length===3?n.split("").map(c=>c+c).join(""):n;
  return "rgba("+parseInt(v.slice(0,2),16)+","+parseInt(v.slice(2,4),16)+","+parseInt(v.slice(4,6),16)+","+a+")";}

/* ---------- world clip ---------- */
const RECT={x0:-1500,x1:1750,y0:-1950,y1:1950}, NEAR=90;
function clipRect(pts){
  let out=pts;
  const edges=[[1,0,RECT.x0],[-1,0,-RECT.x1],[0,1,RECT.y0],[0,-1,-RECT.y1]];
  for(const [a,b,c] of edges){
    const inp=out; out=[]; if(!inp.length) break;
    const side=p=>a*p[0]+b*p[1]-c;
    for(let i=0;i<inp.length;i++){
      const cur=inp[i], prv=inp[(i+inp.length-1)%inp.length], sc=side(cur), sp=side(prv);
      if(sc>=0){ if(sp<0){const t=sp/(sp-sc);out.push([prv[0]+t*(cur[0]-prv[0]),prv[1]+t*(cur[1]-prv[1])]);} out.push(cur);}
      else if(sp>=0){const t=sp/(sp-sc);out.push([prv[0]+t*(cur[0]-prv[0]),prv[1]+t*(cur[1]-prv[1])]);}
    }
  }
  return out;
}
const LAND=COAST.map(r=>clipRect(r.r.map(p=>[(p[0]-LO)*KX,(p[1]-LA)*KY]))).filter(r=>r.length>2);

/* ---------- camera ---------- */
const cam={yaw:0,pitch:0.78,dist:980,px:55,py:80};
let W=0,H=0,DPR=1,focal=1;
function resize(){const r=cv.getBoundingClientRect();DPR=Math.min(2,window.devicePixelRatio||1);
  W=r.width;H=r.height;cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);
  focal=Math.max(W,H*1.15)*0.62; draw();}
function proj(x,y,z){
  x-=cam.px; y-=cam.py;
  const c=Math.cos(cam.yaw), s=Math.sin(cam.yaw);
  const x1=x*c+y*s, y1=-x*s+y*c;
  const sp=Math.sin(cam.pitch), cp=Math.cos(cam.pitch);
  const d=cam.dist+y1*cp-z*sp;
  if(d<60) return null;
  const k=focal/d;
  return {x:W/2+x1*k, y:H*0.56-(y1*sp+z*cp)*k, d:d, k:k};
}
function depthAt(x,y){x-=cam.px;y-=cam.py;
  return cam.dist+(-x*Math.sin(cam.yaw)+y*Math.cos(cam.yaw))*Math.cos(cam.pitch);}
function clipNear(pts){const out=[];const n=pts.length;if(!n)return out;
  for(let i=0;i<n;i++){const cur=pts[i],prv=pts[(i+n-1)%n];
    const sc=depthAt(cur[0],cur[1])-NEAR, sp=depthAt(prv[0],prv[1])-NEAR;
    if(sc>=0){ if(sp<0){const t=sp/(sp-sc);out.push([prv[0]+t*(cur[0]-prv[0]),prv[1]+t*(cur[1]-prv[1])]);} out.push(cur);}
    else if(sp>=0){const t=sp/(sp-sc);out.push([prv[0]+t*(cur[0]-prv[0]),prv[1]+t*(cur[1]-prv[1])]);}}
  return out;}
function poly(pts){const c=clipNear(pts);if(c.length<3)return false;ctx.beginPath();
  for(let i=0;i<c.length;i++){const p=proj(c[i][0],c[i][1],0);if(!p)return false;
    i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.closePath();return true;}
function seg(a,b){let p0=a,p1=b;const d0=depthAt(a[0],a[1])-NEAR,d1=depthAt(b[0],b[1])-NEAR;
  if(d0<0&&d1<0)return false;
  if(d0<0){const t=d0/(d0-d1);p0=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];}
  else if(d1<0){const t=d1/(d1-d0);p1=[b[0]+t*(a[0]-b[0]),b[1]+t*(a[1]-b[1])];}
  const q0=proj(p0[0],p0[1],0),q1=proj(p1[0],p1[1],0);if(!q0||!q1)return false;
  ctx.beginPath();ctx.moveTo(q0.x,q0.y);ctx.lineTo(q1.x,q1.y);ctx.stroke();return true;}
function path(pts,z){ctx.beginPath();let started=false;
  for(let i=0;i<pts.length;i++){const p=proj(pts[i][0],pts[i][1],z||0);if(!p){started=false;continue;}
    if(!started){ctx.moveTo(p.x,p.y);started=true;}else ctx.lineTo(p.x,p.y);}}

/* ---------- state ---------- */
const F={h:HMAX,b:1,bonus:false,free:false,pull:false,gem:false,lez:false,fav:false,cats:new Set(),cnts:new Set(),q:""};
let Q=null; // parsed from the typed query — layered on top of F, never touches the widgets
let shown=D.slice(), sel=null, hov=null, colorMode="cat", intro=0, introT=0, animUntil=0;
const heads=[];
let favs=new Set();
try{favs=new Set(JSON.parse(localStorage.getItem("rrr-favs")||"[]"));}catch(e){}
const saveFavs=()=>{try{localStorage.setItem("rrr-favs",JSON.stringify([...favs]));}catch(e){}};

function pass(o){
  if(o.h>F.h+.001) return false;
  if(o.b<F.b) return false;
  if(F.bonus&&!o.bonus) return false;
  if(F.free&&!(o.pf===true||o.pf==="mixed")) return false;
  if(F.pull&&o.pp) return false;
  if(F.gem&&!o.gem) return false;
  if(F.lez&&o.lez===2) return false;
  if(F.fav&&!favs.has(o.n)) return false;
  if(F.cats.size&&!o.cats.some(c=>F.cats.has(c))) return false;
  if(F.cnts.size&&!F.cnts.has(o.c.split(" ")[0])) return false;
  if(Q){
    if(Q.h!=null&&o.h>Q.h+.001) return false;
    if(Q.free&&!(o.pf===true||o.pf==="mixed")) return false;
    if(Q.pull&&o.pp) return false;
    if(Q.gem&&!o.gem) return false;
    if(Q.notoll&&!/^no toll/i.test(o.toll||"")) return false;
    if(Q.b&&o.b<Q.b) return false;
    if(Q.lez&&o.lez===2) return false;
    if(Q.cats&&!o.cats.some(c=>Q.cats.has(c))) return false;
    if(Q.cnts&&!Q.cnts.has(o.c.split(" ")[0])) return false;
    if(Q.text){const s=(o.n+" "+o.r+" "+o.c+" "+o.why+" "+o.one+" "+o.season).toLowerCase();
      const ok=Q.textAny?Q.text.some(w=>s.includes(w)):Q.text.every(w=>s.includes(w));
      if(!ok) return false;}
  }
  return true;
}

/* ---------- typed query → filters ---------- */
const CATSYN=[["coast",/\b(beach(es)?|coast(al)?|swim(ming)?|playa|surf(ing)?)\b/],
  ["village",/\b(villages?|pueblos?)\b/],["city",/\b(city|cities)\b/],
  ["nature",/\b(nature|hik(e|es|ing)|mountains?|national parks?)\b/],
  ["history",/\b(histor(y|ic|ical)|castles?|roman|ruins?|medieval)\b/],
  ["foodwine",/\b(food|wine(ries)?|eat(ing)?|seafood|tapas|pintxos?)\b/],
  ["quirky",/\b(quirky|odd|weird|wonderful)\b/]];
const CNTSYN=[["Spain",/\b(spain|espa[ñn]a|spanish)\b/],["Portugal",/\b(portugal|portuguese)\b/],
  ["France",/\b(france|french)\b/],["Morocco",/\b(morocco|moroccan)\b/],
  ["Andorra",/\bandorra\b/],["United",/\bgibraltar\b/]];
function parseQ(raw){
  let s=" "+String(raw).toLowerCase()+" ";
  if(!s.trim()) return null;
  const q={chips:[]};
  s=s.replace(/(?:under|less than|within|max|≤|<)?\s*(\d+(?:[.,]\d+)?)\s*(?:h\b|hrs?\b|hours?\b)/,(m,n)=>{
    q.h=parseFloat(n.replace(",","."));q.chips.push("≤ "+q.h+" h");return " ";});
  s=s.replace(/(?:under|within)?\s*(\d+)\s*min(?:ute)?s?\b/,(m,n)=>{q.h=+n/60;q.chips.push("≤ "+n+" min");return " ";});
  s=s.replace(/free parking|\bfree\b/,()=>{q.free=true;q.chips.push("free parking");return " ";});
  s=s.replace(/no parallel|pull[- ]?in/,()=>{q.pull=true;q.chips.push("no parallel");return " ";});
  s=s.replace(/no tolls?|toll[- ]?free/,()=>{q.notoll=true;q.chips.push("no tolls");return " ";});
  s=s.replace(/hidden gems?|\bgems?\b/,()=>{q.gem=true;q.chips.push("hidden gems");return " ";});
  for(const [k,re] of CNTSYN) if(re.test(s)){s=s.replace(re," ");(q.cnts=q.cnts||new Set()).add(k);
    q.chips.push(k==="United"?"Gibraltar":k);}
  for(const [k,re] of CATSYN) if(re.test(s)){s=s.replace(re," ");(q.cats=q.cats||new Set()).add(k);
    q.chips.push(CAT[k].toLowerCase());}
  const words=s.replace(/\b(in|and|or|the|with|a|an|of|to|near|for|trips?|places?)\b/g," ")
    .split(/[^a-zà-ÿ0-9]+/).filter(w=>w.length>2);
  if(words.length){q.text=words;q.chips.push("“"+words.join(" ")+"”");}
  return (q.chips.length)?q:null;
}
function pinColor(o){
  if(colorMode==="cat") return CATC[o.pc]||T.cyan;
  if(colorMode==="park"){ if(o.bonus) return "#5FA85B"; if(o.pf===true) return "#3FA9C9";
    if(o.pf==="mixed") return "#E9A13B"; return "#D4715A"; }
  const t=(o.e-1)/9; return "hsl("+Math.round(6+t*112)+" 52% "+(isDark()?58:44)+"%)";
}

/* ---------- draw ---------- */
function draw(){
  if(!W) return;
  const now=performance.now();
  ctx.clearRect(0,0,W,H);
  const dark=isDark();
  // horizon wash
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,mix(dark?"#0a1c27":"#c9dde6",dark?.9:.55));
  g.addColorStop(.42,T.ground); g.addColorStop(1,T.ground);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  // sea: everything below the horizon
  const hz=H*0.56-focal*Math.tan(cam.pitch);
  ctx.fillStyle=T.sea; ctx.fillRect(0,Math.max(0,hz),W,H-Math.max(0,hz));
  if(hz>0){ctx.strokeStyle=mix(T["sea-line"],.85);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,hz+.5);ctx.lineTo(W,hz+.5);ctx.stroke();}

  // graticule
  ctx.strokeStyle=mix(T.grat,.5); ctx.lineWidth=.6;
  for(let lon=-20;lon<=10;lon++){const x=(lon-LO)*KX; seg([x,RECT.y0],[x,RECT.y1]);}
  for(let lat=22;lat<=52;lat++){const y=(lat-LA)*KY; seg([RECT.x0,y],[RECT.x1,y]);}

  // land
  ctx.lineJoin="round";
  for(const r of LAND){ if(!poly(r)) continue;
    ctx.fillStyle=T.land; ctx.fill();
    ctx.strokeStyle=T["land-edge"]; ctx.lineWidth=1.1; ctx.stroke(); }

  // place names
  const NAMES=[["ESPAÑA",39.9,-4.2,13],["PORTUGAL",39.5,-8.25,11],["MARRUECOS",32.4,-6.2,12],["FRANCE",46.0,1.9,12]];
  try{ctx.letterSpacing="3px";}catch(e){}
  ctx.textAlign="center"; ctx.font='500 11px "IBM Plex Mono", monospace';
  for(const nm of NAMES){const p=proj((nm[2]-LO)*KX,(nm[1]-LA)*KY,0);
    if(!p||p.y<14||p.y>H-14||p.x<24||p.x>W-24) continue;
    ctx.font='500 '+nm[3]+'px "IBM Plex Mono", monospace';
    ctx.fillStyle=mix(T["land-edge"],.72); ctx.fillText(nm[0],p.x,p.y);}
  try{ctx.letterSpacing="0px";}catch(e){}
  ctx.textAlign="left";

  // range rings
  const rp=intro<1?ease(intro):1;
  ctx.lineWidth=1; ctx.setLineDash([5,6]);
  for(const R of RINGS){
    if(R.h>F.h+.5) continue;
    const pts=[]; for(let a=0;a<=120;a++){const t=a/120*Math.PI*2;pts.push([Math.cos(t)*R.r,Math.sin(t)*R.r]);}
    const on=R.r/RMAX<=rp*1.05;
    ctx.strokeStyle=mix(T.amber, on?(R.h%2?.34:.2):.06); path(pts); ctx.closePath(); ctx.stroke();
    if(on){const lp=proj(-R.r*0.93,-R.r*0.37,0);
      if(lp&&lp.x>(W>900?312:16)&&lp.x<W-16&&lp.y>16&&lp.y<H-16){ctx.setLineDash([]);ctx.font='500 10px "IBM Plex Mono", monospace';ctx.fillStyle=mix(T.amber,.8);
        ctx.textAlign="center";ctx.fillText(R.h+" h",lp.x,lp.y-4);ctx.setLineDash([5,6]);}}
  }
  ctx.setLineDash([]);

  // sweep
  if(intro<1){
    const a=ease(intro)*Math.PI*2.2-Math.PI/2, p0=proj(0,0,0), p1=proj(Math.cos(a)*RMAX*1.02,Math.sin(a)*RMAX*1.02,0);
    if(p0&&p1){const lg=ctx.createLinearGradient(p0.x,p0.y,p1.x,p1.y);
      lg.addColorStop(0,mix(T.amber,.5));lg.addColorStop(1,mix(T.amber,0));
      ctx.strokeStyle=lg;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();}
  }

  // route arc for selection
  if(sel){
    const dist=Math.hypot(sel.x,sel.y), lift=Math.max(60,dist*0.34);
    const pts=[];
    for(let i=0;i<=56;i++){const t=i/56, mt=1-t;
      const x=2*mt*t*(sel.x/2)+t*t*sel.x, y=2*mt*t*(sel.y/2)+t*t*sel.y, z=2*mt*t*lift;
      const p=proj(x,y,z); if(p) pts.push(p);}
    if(pts.length>1){
      ctx.strokeStyle=mix(T.amber,.28); ctx.lineWidth=5.5; ctx.lineCap="round";
      ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
      ctx.strokeStyle=T.amber; ctx.lineWidth=1.6; ctx.setLineDash([7,5]);
      ctx.lineDashOffset=REDUCED?0:-(now/45)%12;
      ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // pins
  heads.length=0; const labs=[];
  const list=shown.map(o=>({o:o,p:proj(o.x,o.y,0)})).filter(v=>v.p).sort((a,b)=>b.p.d-a.p.d);
  ctx.textAlign="left";
  for(const v of list){
    const o=v.o, dist=Math.hypot(o.x,o.y);
    let ap=intro>=1?1:Math.max(0,Math.min(1,(intro*(RMAX+320)-dist)/220));
    if(o.t0&&!REDUCED) ap*=ease((now-o.t0)/420);
    if(ap<=0) continue;
    const pop=ap<1?ease(ap):1;
    const hgt=(12+o.b*14)*pop, top=proj(o.x,o.y,hgt); if(!top) continue;
    const col=pinColor(o), isSel=sel===o, isHov=hov===o;
    const fog=Math.max(.42,Math.min(1,1.35-v.p.d/(cam.dist*2.0)));
    ctx.globalAlpha=(isSel||isHov?1:fog)*Math.min(1,ap*1.4);
    // ground shadow
    ctx.fillStyle=mix(T.ink,.10); ctx.beginPath();
    const sh=Math.max(2.2,5.2*Math.min(1.5,620/v.p.d))*pop;
    ctx.ellipse(v.p.x,v.p.y,sh,sh*0.42,0,0,6.284); ctx.fill();
    // mast
    ctx.strokeStyle=mix(col,isSel?.95:.62); ctx.lineWidth=isSel?2:1.2;
    ctx.beginPath(); ctx.moveTo(v.p.x,v.p.y); ctx.lineTo(top.x,top.y); ctx.stroke();
    const r=(2.4+o.b*.42)*Math.max(.62,Math.min(1.5,620/v.p.d))*(isSel?1.5:isHov?1.25:1)*pop;
    if(isSel){const pu=REDUCED?0:(Math.sin(now/300)+1)/2;
      ctx.fillStyle=mix(col,.14+pu*.12);ctx.beginPath();ctx.arc(top.x,top.y,r+6+pu*3.5,0,6.284);ctx.fill();}
    else if(isHov){ctx.fillStyle=mix(col,.22);ctx.beginPath();ctx.arc(top.x,top.y,r+5.5,0,6.284);ctx.fill();}
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(top.x,top.y,r,0,6.284); ctx.fill();
    ctx.strokeStyle=T.panel; ctx.lineWidth=1.2; ctx.stroke();
    if(o.lez){ctx.strokeStyle=o.lez===2?T.red:mix(T.amber,.85);ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(top.x,top.y,r+3,0,6.284);ctx.stroke();}
    if(favs.has(o.n)&&!isSel){ctx.fillStyle=T.red;ctx.beginPath();ctx.arc(top.x,top.y-r-3.5,1.7,0,6.284);ctx.fill();}
    ctx.globalAlpha=1;
    heads.push({o:o,x:top.x,y:top.y,r:Math.max(9,r+6)});
    if(intro>=1&&(isSel||isHov||shown.length<=48))
      labs.push({o:o,x:top.x,y:top.y,r:r,pri:(isSel?400:isHov?300:0)+o.b*10-v.p.d/400,sel:isSel,hov:isHov});
  }

  // labels, biggest first, no overlaps
  labs.sort((a,b)=>b.pri-a.pri);
  const placed=[];
  for(const L of labs){
    if(!L.sel&&!L.hov&&L.o.b<7&&shown.length>18) continue;
    ctx.font=(L.sel?'600 14px':'600 12px')+' Antonio, sans-serif';
    const tw=ctx.measureText(L.o.n).width+9, th=15;
    const bx=L.x+L.r+4, by=L.y-8;
    let hit=false;
    for(const q of placed) if(bx<q.x+q.w+3&&bx+tw+3>q.x&&by<q.y+q.h+2&&by+th+2>q.y){hit=true;break;}
    if(hit||bx+tw>W-6||by<2||by>H-8) continue;
    placed.push({x:bx,y:by,w:tw,h:th});
    ctx.fillStyle=mix(T.panel,.88); ctx.fillRect(bx,by,tw,th);
    ctx.fillStyle=L.sel?T.ink:T["ink-2"]; ctx.fillText(L.o.n,bx+4,by+11.5);
  }

  // home
  const hp=proj(0,0,0), ht=proj(0,0,86);
  if(hp&&ht){
    ctx.strokeStyle=T.amber; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(hp.x,hp.y); ctx.lineTo(ht.x,ht.y); ctx.stroke();
    ctx.fillStyle=T.amber; ctx.beginPath();
    ctx.moveTo(ht.x,ht.y-7);ctx.lineTo(ht.x+6,ht.y);ctx.lineTo(ht.x,ht.y+7);ctx.lineTo(ht.x-6,ht.y);ctx.closePath();ctx.fill();
    ctx.font='700 12px Antonio, sans-serif'; ctx.fillStyle=T.amber; ctx.textAlign="center";
    ctx.fillText("ROTA",ht.x,ht.y-12);
    ctx.font='400 9px "IBM Plex Mono", monospace'; ctx.fillStyle=mix(T.muted,.95);
    ctx.fillText("HOME PORT",ht.x,ht.y-24);
  }
  ctx.textAlign="left";
}
function isDark(){const t=document.documentElement.dataset.theme;
  return t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches);}

/* ---------- loop ---------- */
let raf=null, dirty=true, camTo=null, flight=null;
const vel={x:0,y:0};
function need(){dirty=true; if(!raf) raf=requestAnimationFrame(tick);}
function tick(){
  raf=null;
  const now=performance.now();
  if(intro<1){intro=Math.min(1,(now-introT)/1900); dirty=true;}
  if(flight){
    const t=ease((now-flight.t0)/flight.dur);
    cam.px=flight.f.px+(flight.o.px-flight.f.px)*t;
    cam.py=flight.f.py+(flight.o.py-flight.f.py)*t;
    cam.dist=flight.f.dist+(flight.o.dist-flight.f.dist)*t;
    dirty=true;
    if((now-flight.t0)>=flight.dur) flight=null;
  }
  else if(camTo){cam.dist+=(camTo-cam.dist)*0.16; dirty=true;
    if(Math.abs(camTo-cam.dist)<3){cam.dist=camTo;camTo=null;}}
  if(!drag&&(Math.abs(vel.x)>.4||Math.abs(vel.y)>.4)){
    panBy(vel.x,vel.y); vel.x*=.90; vel.y*=.90; dirty=true;
  } else if(!drag){vel.x=vel.y=0;}
  if(sel&&!REDUCED) dirty=true;
  if(now<animUntil) dirty=true;
  if(dirty){dirty=false; draw();}
  if(intro<1||(sel&&!REDUCED)||camTo||flight||now<animUntil||Math.abs(vel.x)>.4||Math.abs(vel.y)>.4)
    raf=requestAnimationFrame(tick);
}
function fit(){
  if(!shown.length) return;
  let x0=0,x1=0,y0=0,y1=0;
  for(const o of shown){x0=Math.min(x0,o.x);x1=Math.max(x1,o.x);y0=Math.min(y0,o.y);y1=Math.max(y1,o.y);}
  const w=Math.max(140,x1-x0), h=Math.max(140,y1-y0);
  camTo=Math.max(300,Math.min(3000,Math.max(w*1.35,h*1.62)+185));
  cam.px=(x0+x1)/2; cam.py=(y0+y1)/2+h*0.12; need();
}
function flyTo(o){
  const dist=Math.max(340,Math.min(cam.dist,760));
  // keep the pin visible above a bottom sheet on small screens
  const lift=mob()?dist*0.16:0;
  flight={t0:performance.now(),dur:REDUCED?1:750,
    f:{px:cam.px,py:cam.py,dist:cam.dist},
    o:{px:o.x,py:o.y-lift,dist:dist}};
  camTo=null; need();
}

/* ---------- pointer ---------- */
let drag=null;
const ptrs=new Map();
function panBy(dx,dy){
  const k=cam.dist/focal, c=Math.cos(cam.yaw), s=Math.sin(cam.yaw), sp=Math.max(.35,Math.sin(cam.pitch));
  const wx=-dx*k, wy=dy*k/sp;
  cam.px+=wx*c-wy*s; cam.py+=wx*s+wy*c;
  cam.px=Math.max(-900,Math.min(1300,cam.px)); cam.py=Math.max(-900,Math.min(1300,cam.py));
}
cv.addEventListener("pointerdown",e=>{
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  flight=null; camTo=null; vel.x=vel.y=0;
  if(ptrs.size===1){
    // touch drags pan; mouse orbits unless shift / middle / right button
    const pan=e.pointerType==="touch"||e.shiftKey||e.button===2||e.button===1;
    drag={x:e.clientX,y:e.clientY,pan:pan,moved:0,touch:e.pointerType==="touch"};
    cv.classList.add("grabbing");
  } else drag=null;
});
cv.addEventListener("pointermove",e=>{
  const prev=ptrs.get(e.pointerId);
  if(prev) ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){
    // two-finger pinch: zoom + twist + tilt
    const ps=[...ptrs.values()];
    if(cv._p2){
      const [a,b]=ps;
      const d=Math.hypot(a.x-b.x,a.y-b.y), pd=cv._p2.d;
      const ang=Math.atan2(b.y-a.y,b.x-a.x), pang=cv._p2.ang;
      const cy=(a.y+b.y)/2, pcy=cv._p2.cy;
      cam.dist=Math.max(240,Math.min(3400,cam.dist*pd/Math.max(20,d)));
      let da=ang-pang; if(da>Math.PI)da-=2*Math.PI; if(da<-Math.PI)da+=2*Math.PI;
      cam.yaw+=da;
      cam.pitch=Math.max(0.50,Math.min(1.46,cam.pitch+(cy-pcy)*0.004));
      need();
    }
    const [a,b]=ps;
    cv._p2={d:Math.hypot(a.x-b.x,a.y-b.y),ang:Math.atan2(b.y-a.y,b.x-a.x),cy:(a.y+b.y)/2};
    return;
  }
  cv._p2=null;
  if(drag&&prev){
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y; drag.x=e.clientX; drag.y=e.clientY;
    drag.moved+=Math.abs(dx)+Math.abs(dy);
    if(drag.pan){ panBy(dx,dy); vel.x=vel.x*.5+dx*.5; vel.y=vel.y*.5+dy*.5; }
    else{ cam.yaw+=dx*0.005; cam.pitch=Math.max(0.50,Math.min(1.46,cam.pitch+dy*0.0042)); }
    need(); return;
  }
  if(e.pointerType==="mouse"){
    const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    let best=null,bd=1e9;
    for(const h of heads){const d=Math.hypot(h.x-mx,h.y-my); if(d<h.r&&d<bd){bd=d;best=h;}}
    const o=best?best.o:null;
    if(o!==hov){hov=o;need();
      const tip=$("#tip");
      if(o){tip.innerHTML="<b>"+esc(o.n)+"</b><u>"+esc(o.hh)+" · beauty "+o.b+"</u>";
        tip.style.opacity=1;tip.style.left=Math.min(W-tip.offsetWidth-8,mx+14)+"px";tip.style.top=(my-34)+"px";}
      else tip.style.opacity=0;}
    else if(o){const tip=$("#tip");tip.style.left=Math.min(W-tip.offsetWidth-8,mx+14)+"px";tip.style.top=(my-34)+"px";}
  }
});
function endDrag(e){
  ptrs.delete(e.pointerId);
  if(ptrs.size<2) cv._p2=null;
  if(!drag) return;
  const d=drag; drag=null; cv.classList.remove("grabbing");
  if(d.moved<8){
    vel.x=vel.y=0;
    const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    const rad=d.touch?26:12;
    let best=null,bd=1e9;
    for(const h of heads){const dd=Math.hypot(h.x-mx,h.y-my); if(dd<Math.max(h.r,rad)&&dd<bd){bd=dd;best=h;}}
    if(best){select(best.o); if(mob()) flyTo(best.o);} else if(sel) select(null);
  } else if(d.pan&&!REDUCED){ need(); } else {vel.x=vel.y=0;}
}
cv.addEventListener("pointerup",endDrag); cv.addEventListener("pointercancel",endDrag);
cv.addEventListener("contextmenu",e=>e.preventDefault());
cv.addEventListener("wheel",e=>{e.preventDefault();
  cam.dist=Math.max(260,Math.min(3000,cam.dist*Math.exp(e.deltaY*0.0011))); need();},{passive:false});

/* ---------- toast ---------- */
let toastT=null;
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("on");
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("on"),2300);}

/* ---------- detail ---------- */
function meter(v,cls){let s='<div class="meter '+(cls||"")+'">';
  for(let i=1;i<=10;i++) s+='<i class="'+(i<=v?"on":"")+'" style="animation-delay:'+(i*30)+'ms"></i>'; return s+"</div>";}
function parkWord(o){ return o.pf===true?"Free":o.pf==="mixed"?"Free lots exist, paid ones too":"Paid"; }
function gmaps(o){return "https://www.google.com/maps/dir/?api=1&origin="+LA+","+LO+
  "&destination="+o.lat+","+o.lon+"&travelmode=driving";}
function select(o,quiet){
  sel=o; const d=$("#detail");
  if(!o){d.classList.remove("open"); location.hash=""; need(); return;}
  const bad=[];
  if(o.bonus) bad.push('<span class="badge b-free">Free + pull-in</span>');
  else{ if(o.pf===true) bad.push('<span class="badge b-free">Free parking</span>');
        if(!o.pp) bad.push('<span class="badge b-pull">No parallel needed</span>'); }
  if(o.pp) bad.push('<span class="badge b-warn">Parallel parking likely</span>');
  if(o.gem) bad.push('<span class="badge b-gem">Hidden gem</span>');
  if(o.lez===2) bad.push('<span class="badge b-warn">Your car is banned from the centre</span>');
  if(o.lez===1) bad.push('<span class="badge b-gem">Low-emission zone on the horizon</span>');
  if(o.book) bad.push('<span class="badge b-book">Book ahead</span>');
  const isFav=favs.has(o.n);
  const cut=(s,n)=>{s=String(s||"");const p=s.indexOf(". ");
    if(p>20&&p<n) return s.slice(0,p+1); return s.length>n?s.slice(0,n).replace(/\s+\S*$/,"")+"…":s;};
  const kind=o.cats.slice(0,2).map(c=>CAT[c]).join(" · ")+(o.gem?" — hidden gem":"");
  const park=(o.pf===true?"Free":o.pf==="mixed"?"Free-ish":"Paid")+
    (o.pp?", parallel likely":", pull-in lot")+" — ease "+o.pd+"/10";
  $("#detailScroll").innerHTML=
   '<div class="dhead"><button class="fav" id="dFav" aria-pressed="'+isFav+'" aria-label="Save this place">'+(isFav?"♥":"♡")+'</button>'+
   '<button class="close" id="dClose" aria-label="Close">✕</button>'+
   '<h2>'+esc(o.n)+'</h2><div class="place">'+esc(o.r)+' · '+esc(o.c)+' &nbsp;<span class="mono">'+
   o.lat.toFixed(3)+', '+o.lon.toFixed(3)+'</span></div></div>'+
   '<div class="stats rise">'+
     '<div class="stat"><div class="lbl">Drive</div><div class="n">'+(o.h<1?Math.round(o.h*60):o.h)+'<u>'+(o.h<1?'min':'h')+'</u></div></div>'+
     '<div class="stat"><div class="lbl">Distance</div><div class="n">'+o.km+'<u>km</u></div></div>'+
     '<div class="stat"><div class="lbl">Beauty</div><div class="n">'+o.b+'<u>/10</u></div></div>'+
   '</div>'+
   '<div class="actions rise" style="animation-delay:60ms">'+
     '<a class="go" href="'+gmaps(o)+'" target="_blank" rel="noopener">Navigate ↗ <small>'+esc(o.hh)+'</small></a>'+
   '</div>'+
   '<dl class="glance rise" style="animation-delay:100ms">'+
     '<dt>It\'s</dt><dd>'+esc(kind)+'</dd>'+
     '<dt>Do</dt><dd>'+esc(cut(o.one,150))+'</dd>'+
     '<dt>Park</dt><dd>'+esc(park)+'</dd>'+
     '<dt>Go</dt><dd>'+esc(cut(o.season,80))+'</dd>'+
   '</dl>'+
   (o.lez===2?'<div class="warn rise" style="animation-delay:130ms"><b>Your car is banned from the centre</b>'+esc(o.lezn)+'</div>':'')+
   '<div class="live rise" style="animation-delay:150ms"><h3>Live intel <span class="mono" style="letter-spacing:.02em">Claude · web</span></h3>'+
     '<div id="liveBody"><button class="askbtn" id="liveBtn">✦ What\'s happening there right now?</button></div></div>'+
   '<button class="brieftog rise" id="briefTog" aria-expanded="false" style="animation-delay:180ms">The full brief <i>▾</i></button>'+
   '<div id="brief">'+
   '<div class="badges">'+bad.join("")+'</div>'+
   (o.lez===1?'<div class="warn soft"><b>Not a problem yet — but watch it</b>'+esc(o.lezn)+'</div>':'')+
   '<div class="sec"><h3>Why it scores '+o.b+'</h3>'+meter(o.b)+'<p>'+esc(o.why)+'</p></div>'+
   '<div class="sec"><h3>The one thing</h3><p>'+esc(o.one)+'</p></div>'+
   '<div class="sec"><h3>Parking</h3><dl class="pk">'+
     '<dt>Cost</dt><dd>'+esc(parkWord(o))+'</dd>'+
     '<dt>Style</dt><dd>'+(o.pp?'Street parallel parking is the realistic option':'Pull-in bays — a lot or garage, no parallel')+'</dd>'+
     '<dt>Ease</dt><dd>'+o.pd+'/10</dd>'+
     '<dt>Where</dt><dd>'+esc(o.ps)+'</dd>'+
     (o.pb?'<dt>Big car</dt><dd>'+esc(o.pb)+'</dd>':'')+
   '</dl></div>'+
   '<div class="sec"><h3>The road there · '+o.e+'/10</h3>'+meter(o.e,"ease")+'<p>'+esc(o.drive)+'</p>'+
     (o.toll?'<p style="margin-top:6px"><strong>Tolls &amp; crossings.</strong> '+esc(o.toll)+'</p>':'')+'</div>'+
   (o.book?'<div class="sec"><h3>Book ahead</h3><p>'+esc(o.book)+'</p></div>':'')+
   '<div class="sec"><h3>When to go</h3><p>'+esc(o.season)+'</p></div>'+
   '<div class="sec"><h3>Kind of place</h3><p>'+o.cats.map(c=>esc(CAT[c]||c)).join(' · ')+'</p></div>'+
   '</div>';
  $("#dClose").onclick=()=>select(null);
  $("#briefTog").onclick=()=>{const b=$("#brief"),t=$("#briefTog");
    const on=!b.classList.contains("on"); b.classList.toggle("on",on);
    t.setAttribute("aria-expanded",on); t.firstChild.textContent=on?"Less ":"The full brief ";};
  $("#liveBtn").onclick=()=>liveGo(o);
  if(o._live) renderLive(o._live);
  $("#dFav").onclick=()=>{
    const b=$("#dFav");
    if(favs.has(o.n)){favs.delete(o.n);b.textContent="♡";b.setAttribute("aria-pressed","false");}
    else{favs.add(o.n);b.textContent="♥";b.setAttribute("aria-pressed","true");toast("Saved — find it under Filters → Saved only");}
    saveFavs(); if(F.fav) apply(); else {renderList(); need();}
  };
  d.classList.add("open"); d.querySelector("#detailScroll").scrollTop=0;
  if(mob()) sheet(false);
  try{history.replaceState(null,"","#"+encodeURIComponent(o.n));}catch(e){}
  if(!quiet) need();
}

/* ---------- live intel (Claude via the trip Worker) ---------- */
function apiCfg(){
  let c={}; try{c=JSON.parse(localStorage.getItem("rtf.cfg"))||{};}catch(e){}
  const api=String(c.api||(window.TRIP_CONFIG&&window.TRIP_CONFIG.API_BASE)||"").replace(/\/+$/,"");
  return {api:api,code:c.code||""};
}
function renderLive(text){
  const body=$("#liveBody"); if(!body) return;
  const rows=[];
  String(text).split(/\n+/).forEach(l=>{const m=l.match(/^\s*(NOW|DO|TIP)\s*:\s*(.+)/i);
    if(m) rows.push('<div class="row"><b>'+m[1].toUpperCase()+'</b><span>'+esc(m[2])+'</span></div>');});
  body.innerHTML=rows.length?rows.join(""):'<div class="row"><span>'+esc(text)+'</span></div>';
}
async function liveGo(o,codeOverride){
  const body=$("#liveBody"); const cfg=apiCfg();
  if(!cfg.api){body.innerHTML='<p class="note">No API endpoint configured — add your Worker URL once in the main Trip Finder settings and this lights up.</p>';return;}
  body.innerHTML='<div class="row"><span class="spin"></span><span>Asking Claude — it checks the web for what\'s current…</span></div>';
  const code=codeOverride||cfg.code;
  try{
    const res=await fetch(cfg.api+"/api/spot",{method:"POST",
      headers:Object.assign({"Content-Type":"application/json"},code?{"X-Trip-Code":code}:{}),
      body:JSON.stringify({name:o.n,region:o.r,country:o.c,today:new Date().toISOString().slice(0,10)})});
    if(res.status===401){askCode(o);return;}
    const data=await res.json();
    if(codeOverride){try{localStorage.setItem("rtf.cfg",JSON.stringify({api:cfg.api,code:codeOverride}));}catch(e){}}
    if(!data.text){body.innerHTML='<p class="note">'+esc(data.error||"Claude isn't configured on the server yet.")+'</p>';return;}
    o._live=data.text; if(sel===o) renderLive(data.text);
  }catch(e){body.innerHTML='<p class="note">Couldn\'t reach the API — check your connection and try again.</p>';}
}
function askCode(o){
  const body=$("#liveBody");
  body.innerHTML='<p class="note">This needs the trip access code — the same one the main Trip Finder uses.</p>'+
    '<input id="liveCode" type="password" placeholder="Access code" autocomplete="off">'+
    '<button class="askbtn" id="liveCodeGo" style="margin-top:6px">Unlock</button>';
  $("#liveCodeGo").onclick=()=>{const v=$("#liveCode").value.trim(); if(v) liveGo(o,v);};
}

/* ---------- filters ui ---------- */
function filterCount(){
  let n=0;
  if(F.h<HMAX)n++; if(F.b>1)n++;
  ["bonus","free","pull","gem","lez","fav"].forEach(k=>{if(F[k])n++;});
  if(F.cats.size)n++; if(F.cnts.size)n++; if(F.q)n++;
  return n;
}
function apply(){
  const was=new Set(shown);
  shown=D.filter(pass);
  const now=performance.now();
  let anyNew=false;
  if(intro>=1) for(const o of shown) if(!was.has(o)){o.t0=now;anyNew=true;}
  if(anyNew&&!REDUCED) animUntil=now+460;
  $("#cnt").textContent=shown.length;
  const fc=filterCount(), fEl=$("#fCount");
  fEl.style.display=fc?"inline-block":"none"; fEl.textContent=fc;
  if(sel&&!shown.includes(sel)) select(null);
  syncPresets();
  renderList(); need();
}
function toggle(btn,fn){btn.addEventListener("click",()=>{const v=btn.getAttribute("aria-pressed")!=="true";
  btn.setAttribute("aria-pressed",v);fn(v);apply();});}
toggle($("#tBonus"),v=>{F.bonus=v; if(v){F.free=F.pull=false;$("#tFree").setAttribute("aria-pressed",false);$("#tPull").setAttribute("aria-pressed",false);}});
toggle($("#tFree"),v=>{F.free=v; if(v){F.bonus=false;$("#tBonus").setAttribute("aria-pressed",false);}});
toggle($("#tPull"),v=>{F.pull=v; if(v){F.bonus=false;$("#tBonus").setAttribute("aria-pressed",false);}});
toggle($("#tGem"),v=>F.gem=v);
toggle($("#tLez"),v=>F.lez=v);
toggle($("#tFav"),v=>F.fav=v);
function hLabel(h){return h<1?Math.round(h*60)+" min":(h%1?(+h.toFixed(2)):h)+" h";}
function setH(h,skipFit){
  F.h=h; $("#hMax").value=h; $("#hVal").textContent=hLabel(h);
  const top=RINGS.filter(R=>R.h<=Math.max(1,h)).pop()||RINGS[0];
  apply(); if(!skipFit) fit();
}
$("#hMax").addEventListener("input",e=>setH(+e.target.value));
$("#bMin").addEventListener("input",e=>{F.b=+e.target.value;$("#bVal").textContent=F.b+"+";apply();});
function renderQFb(ai,pending){
  $("#qFb").innerHTML=(Q?Q.chips.map(c=>"<span>"+esc(c)+"</span>").join(""):"")+
    (ai?'<span title="Filter understood by Claude">✦ Claude</span>':"")+
    (pending?'<span style="opacity:.5">✦ asking Claude…</span>':"");
}
/* The regex parse answers instantly; 700 ms after typing settles, Claude
   re-reads the sentence through the Worker and replaces it with a semantic
   parse — categories included ("romantic" → village + food & wine + gems). */
const smartCache=new Map();
let smartT=null;
async function smartParse(text){
  const cfg=apiCfg(); if(!cfg.api||!cfg.code) return;
  const key=text.toLowerCase();
  let crit=smartCache.get(key);
  if(crit===undefined){
    try{
      const res=await fetch(cfg.api+"/api/rings-filter",{method:"POST",
        headers:{"Content-Type":"application/json","X-Trip-Code":cfg.code},
        body:JSON.stringify({text:text})});
      crit=res.ok?((await res.json()).criteria||null):null;
      if(res.ok) smartCache.set(key,crit);
    }catch(e){crit=null;}
  }
  if($("#search").value.trim()!==text) return; // typed on — stale answer
  const q=crit?critToQ(crit):null;
  if(q){Q=q; renderQFb(true); apply();}
  else renderQFb(false); // keep the regex parse, drop the pending chip
}
function critToQ(c){
  const q={chips:[]};
  if(+c.maxHours){q.h=+c.maxHours;q.chips.push("≤ "+q.h+" h");}
  if(+c.minBeauty>1){q.b=Math.min(10,+c.minBeauty);q.chips.push("beauty "+q.b+"+");}
  if(c.freeParking){q.free=true;q.chips.push("free parking");}
  if(c.noParallel){q.pull=true;q.chips.push("no parallel");}
  if(c.noTolls){q.notoll=true;q.chips.push("no tolls");}
  if(c.hiddenGems){q.gem=true;q.chips.push("hidden gems");}
  if(c.avoidCarBans){q.lez=true;q.chips.push("no car-ban cities");}
  if(Array.isArray(c.cats)&&c.cats.length){
    const set=new Set(c.cats.filter(k=>CAT[k]));
    if(set.size&&set.size<Object.keys(CAT).length){q.cats=set;
      q.chips.push([...set].map(k=>CAT[k].toLowerCase()).join(" / "));}}
  if(Array.isArray(c.countries)&&c.countries.length){
    q.cnts=new Set(c.countries.map(k=>k==="Gibraltar"?"United":k));
    q.chips.push(c.countries.join(", "));}
  if(Array.isArray(c.keywords)&&c.keywords.length){
    q.text=c.keywords.map(s=>String(s).toLowerCase()).filter(Boolean).slice(0,2);
    q.textAny=true; if(q.text.length)q.chips.push("“"+q.text.join(" · ")+"”");}
  return q.chips.length?q:null;
}
$("#search").addEventListener("input",e=>{
  F.q=e.target.value.trim(); Q=parseQ(F.q);
  clearTimeout(smartT);
  const cfg=apiCfg(), smart=F.q.length>3&&cfg.api&&cfg.code;
  renderQFb(false,smart); apply();
  if(smart) smartT=setTimeout(()=>smartParse(F.q),700);
});
document.querySelectorAll(".qpre").forEach(b=>b.addEventListener("click",()=>{
  const s=$("#search"); s.value=b.textContent; s.dispatchEvent(new Event("input")); }));
$("#cntCap").textContent="OF "+D.length+" SHOWN";

const pres=[...document.querySelectorAll("#preChips .pre")];
pres.forEach(b=>b.addEventListener("click",()=>setH(+b.dataset.h)));
function syncPresets(){pres.forEach(b=>b.setAttribute("aria-pressed",+b.dataset.h===F.h));}

const catBox=$("#catChips");
Object.keys(CAT).forEach(k=>{const b=document.createElement("button");
  b.className="chip";b.setAttribute("aria-pressed","true");
  b.innerHTML='<i class="dot" style="background:'+CATC[k]+'"></i>'+CAT[k];
  b.onclick=()=>{const on=b.getAttribute("aria-pressed")==="true";b.setAttribute("aria-pressed",!on);
    if(on){if(!F.cats.size)Object.keys(CAT).forEach(x=>F.cats.add(x));F.cats.delete(k);}else F.cats.add(k);
    if(F.cats.size===Object.keys(CAT).length)F.cats.clear();apply();};
  catBox.appendChild(b);});
const cnts=[...new Set(D.map(o=>o.c.split(" ")[0]))];
const cntBox=$("#cntChips");
cnts.forEach(k=>{const b=document.createElement("button");b.className="chip";b.setAttribute("aria-pressed","true");
  b.textContent=k==="United"?"Gibraltar":k;
  b.onclick=()=>{const on=b.getAttribute("aria-pressed")==="true";b.setAttribute("aria-pressed",!on);
    if(on){if(!F.cnts.size)cnts.forEach(x=>F.cnts.add(x));F.cnts.delete(k);}else F.cnts.add(k);
    if(F.cnts.size===cnts.length)F.cnts.clear();apply();};
  cntBox.appendChild(b);});

$("#reset").onclick=()=>{
  F.h=HMAX;F.b=1;F.bonus=F.free=F.pull=F.gem=F.lez=F.fav=false;F.cats.clear();F.cnts.clear();F.q="";Q=null;
  $("#qFb").innerHTML="";
  $("#hMax").value=HMAX;$("#hVal").textContent=HMAX+" h";$("#bMin").value=1;$("#bVal").textContent="1+";
  $("#search").value="";
  document.querySelectorAll(".tog").forEach(b=>b.setAttribute("aria-pressed","false"));
  ["#tGem","#tFree","#tFav"].forEach(s=>$(s).setAttribute("aria-pressed","false"));
  document.querySelectorAll(".chips .chip").forEach(b=>b.setAttribute("aria-pressed","true"));
  apply();cam.yaw=0;cam.pitch=.78;camTo=980;cam.px=55;cam.py=80;flight=null;need();};

/* ---------- colour mode + legend ---------- */
function setMode(m){colorMode=m;
  $("#cCat").setAttribute("aria-pressed",m==="cat");$("#cPark").setAttribute("aria-pressed",m==="park");
  $("#cEase").setAttribute("aria-pressed",m==="ease");legend();need();}
$("#cCat").onclick=()=>setMode("cat");$("#cPark").onclick=()=>setMode("park");$("#cEase").onclick=()=>setMode("ease");
function legend(){
  let items;
  if(colorMode==="cat") items=Object.keys(CAT).map(k=>[CATC[k],CAT[k]]);
  else if(colorMode==="park") items=[["#5FA85B","Free + pull-in"],["#3FA9C9","Free"],["#E9A13B","Mixed"],["#D4715A","Paid"]];
  else items=[["hsl(6 52% 46%)","Hard road"],["hsl(62 52% 42%)","Mixed"],["hsl(118 52% 40%)","Easy road"]];
  $("#legend").innerHTML='<b>Pins</b>'+items.map(i=>'<span><i style="background:'+i[0]+'"></i>'+i[1]+'</span>').join("")
    +'<span><i style="background:transparent;box-shadow:0 0 0 1.4px var(--red);border-radius:50%"></i>Car banned</span>'
    +'<span><i style="background:transparent;box-shadow:0 0 0 1.4px var(--amber);border-radius:50%"></i>ZBE coming</span>'
    +'<span style="color:var(--muted)">Mast height = beauty</span>';
}

/* ---------- list ---------- */
let sortK="h", sortD="a";
function renderList(){
  const rows=shown.slice().sort((a,b)=>{
    let v = sortK==="n"||sortK==="why" ? String(a[sortK]).localeCompare(String(b[sortK])) : a[sortK]-b[sortK];
    return sortD==="a"?v:-v;});
  $("#lbody").innerHTML=rows.map(o=>
    '<tr data-i="'+o.i+'"><td><div class="nm">'+(favs.has(o.n)?'<span class="hrt">♥</span> ':'')+esc(o.n)+
    (o.gem?' <span class="badge b-gem" style="font-size:8.5px;padding:2px 4px">gem</span>':'')+
    '</div><div class="rg">'+esc(o.r)+'</div></td>'+
    '<td class="num">'+esc(o.hh)+'<div class="rg">'+o.km+' km</div></td>'+
    '<td><span class="sc"><b>'+o.b+'</b><span class="bar"><i style="width:'+o.b*10+'%"></i></span></span></td>'+
    '<td><div class="num" style="color:'+(o.bonus?"var(--green)":o.pp?"var(--red)":"var(--ink-2)")+'">'+
      (o.bonus?"free · pull-in":(o.pf===true?"free":o.pf==="mixed"?"mixed":"paid")+(o.pp?" · parallel":" · pull-in"))+
      '</div><div class="rg">ease '+o.pd+'/10'+(o.lez===2?' · <span style="color:var(--red)">car banned</span>':o.lez===1?' · <span style="color:var(--amber)">ZBE soon</span>':'')+'</div></td>'+
    '<td class="num">'+o.e+'/10</td>'+
    '<td class="why">'+esc(o.why)+'</td></tr>').join("");
  $("#lbody").querySelectorAll("tr").forEach(tr=>tr.onclick=()=>{
    const o=D[+tr.dataset.i]; setView("chart"); select(o); flyTo(o);});
}
document.querySelectorAll(".tbl th").forEach(th=>th.onclick=()=>{
  const k=th.dataset.k; sortD = sortK===k ? (sortD==="a"?"d":"a") : "a"; sortK=k;
  document.querySelectorAll(".tbl th").forEach(x=>x.removeAttribute("data-dir"));
  th.setAttribute("data-dir",sortD); renderList();});

/* ---------- dice ---------- */
$("#dice").onclick=()=>{
  const pool=shown.filter(o=>o!==sel);
  if(!pool.length){toast("Nothing matches your filters — loosen them a little");return;}
  const o=pool[Math.floor(Math.random()*pool.length)];
  const d=$("#dice"); d.classList.remove("rolling"); void d.offsetWidth; d.classList.add("rolling");
  setView("chart"); select(o); flyTo(o);
  toast("⚄ "+o.n+" — "+o.hh+" away");
};

/* ---------- views, theme ---------- */
function setView(v){const chart=v==="chart";
  $("#vChart").setAttribute("aria-pressed",chart);$("#vList").setAttribute("aria-pressed",!chart);
  $("#list").classList.toggle("on",!chart); document.body.classList.toggle("listmode",!chart);
  if(chart){resize();need();}}
$("#vChart").onclick=()=>setView("chart"); $("#vList").onclick=()=>setView("list");
$("#moreTog").onclick=()=>{const m=$("#more"),t=$("#moreTog");const on=!m.classList.contains("on");
  m.classList.toggle("on",on); t.setAttribute("aria-expanded",on);
  t.firstChild.textContent=on?"Fewer filters ":"More filters ";};
$("#keyBtn").onclick=()=>$("#legend").classList.toggle("on");
$("#resetView").onclick=()=>{cam.yaw=0;cam.pitch=.78;cam.px=55;cam.py=80;camTo=980;flight=null;need();};
const mob=()=>matchMedia("(max-width:900px)").matches;
function sheet(open){$("#rail").classList.toggle("open",open);$("#filtersBtn").setAttribute("aria-expanded",open);}
$("#filtersBtn").onclick=()=>{if($("#rail").classList.contains("open"))sheet(false);
  else{select(null);sheet(true);}};
function syncSheet(){if(!mob())$("#rail").classList.remove("open");}
matchMedia("(max-width:900px)").addEventListener("change",syncSheet);
$("#themeBtn").onclick=()=>{const d=isDark();document.documentElement.dataset.theme=d?"light":"dark";
  try{localStorage.setItem("rrr-theme",d?"light":"dark");}catch(e){}
  tokens();legend();need();};
try{const th=localStorage.getItem("rrr-theme");if(th)document.documentElement.dataset.theme=th;}catch(e){}
matchMedia("(prefers-color-scheme:dark)").addEventListener("change",()=>{tokens();legend();need();});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){if($("#tut").classList.contains("on"))tutEnd();else if(sel)select(null);else if(mob())sheet(false);}});
window.addEventListener("resize",()=>{resize();});
new ResizeObserver(()=>resize()).observe($("#stage"));

/* ---------- swipe-down to close sheets ---------- */
function swipeClose(handleEl,panelEl,close){
  let sy=null,dy=0;
  handleEl.addEventListener("touchstart",e=>{sy=e.touches[0].clientY;dy=0;
    panelEl.style.transition="none";},{passive:true});
  handleEl.addEventListener("touchmove",e=>{if(sy==null)return;
    dy=Math.max(0,e.touches[0].clientY-sy);
    panelEl.style.transform="translateY("+dy+"px)";},{passive:true});
  handleEl.addEventListener("touchend",()=>{panelEl.style.transition="";panelEl.style.transform="";
    if(dy>70)close(); sy=null;});
}
swipeClose($("#railHandle"),$("#rail"),()=>sheet(false));
swipeClose($("#detailHandle"),$("#detail"),()=>select(null));

/* ---------- tutorial ---------- */
const TSTEPS=4; let tutS=0;
function tutShow(i){
  tutS=i;
  document.querySelectorAll(".tstep").forEach(s=>s.classList.toggle("on",+s.dataset.s===i));
  document.querySelectorAll(".tdots i").forEach((d,j)=>d.classList.toggle("on",j===i));
  $("#tutNext").textContent=i===TSTEPS-1?"Let's go":"Next";
  const card=$(".tcard"); card.style.animation="none"; void card.offsetWidth; card.style.animation="";
}
function tutStart(){$("#tut").classList.add("on");tutShow(0);}
function tutEnd(){$("#tut").classList.remove("on");
  try{localStorage.setItem("rrr-tut","1");}catch(e){}}
$("#tutNext").onclick=()=>{tutS<TSTEPS-1?tutShow(tutS+1):tutEnd();};
$("#tutSkip").onclick=tutEnd;
$("#tut").addEventListener("click",e=>{if(e.target.id==="tut")tutEnd();});
$("#helpBtn").onclick=tutStart;

/* ---------- init ---------- */
tokens(); legend(); apply(); syncPresets(); resize();
introT=performance.now();
if(REDUCED) intro=1; else need();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>need());
// deep link: #PlaceName opens that destination
try{
  const h=decodeURIComponent(location.hash.slice(1));
  if(h){const o=D.find(x=>x.n===h);
    if(o){select(o,true); cam.px=o.x; cam.py=o.y-(mob()?150:0); cam.dist=700; need();}}
}catch(e){}
let seenTut=false;
try{seenTut=!!localStorage.getItem("rrr-tut");}catch(e){}
if(!seenTut&&!location.hash) setTimeout(tutStart,900);
})();
