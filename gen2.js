// Обратная генерация: финальная мегазмея -> серия обратных "разрезов"
function facing(c){return [c[0][0]-c[1][0], c[0][1]-c[1][1]];}
function occMap(snakes){const m=new Map();snakes.forEach((s,si)=>s.cells.forEach(([x,y],ci)=>m.set(x+','+y,[si,ci])));return m;}
function raycast(snakes,i,W,H){const s=snakes[i];const [dx,dy]=facing(s.cells);const occ=occMap(snakes);let [x,y]=s.cells[0];const gap=[];
 while(true){x+=dx;y+=dy;if(x<0||y<0||x>=W||y>=H)return {kind:'edge',gap};const hit=occ.get(x+','+y);
  if(hit){const [si,ci]=hit;if(si===i)return{kind:'self'};if(ci===snakes[si].cells.length-1)return{kind:'tail',target:si,gap};if(ci===0)return{kind:'head',target:si};return{kind:'body',target:si};}
  gap.push([x,y]);}}
function applyEat(snakes,i,ray){const prey=snakes[ray.target];const preyCells=prey.cells.slice().reverse();const food=new Set(prey.cells.map(([x,y])=>x+','+y));
 const path=ray.gap.concat(preyCells);let cells=snakes[i].cells.map(c=>c.slice());
 for(const p of path){cells.unshift(p.slice());if(!food.has(p[0]+','+p[1]))cells.pop();}
 const out=[];snakes.forEach((s,si)=>{if(si===ray.target)return;out.push(si===i?{...s,cells}:s);});return out;}
function stateKey(s){return s.map(x=>x.cells.map(c=>c.join('.')).join(';')).sort().join('|');}
function maxLen(s){return Math.max(0,...s.map(x=>x.cells.length));}
function solve(level, allowLaunch){const {w:W,h:H,target}=level;const seen=new Set();let best=0,bestSeq=null,solutions=0;
 function dfs(snakes,seq){const ml=maxLen(snakes);if(ml>best){best=ml;bestSeq=seq.slice();}
  if(ml>=target){solutions++;return;}
  const key=stateKey(snakes);if(seen.has(key))return;seen.add(key);if(solutions>=300)return;
  for(let i=0;i<snakes.length;i++){const r=raycast(snakes,i,W,H);
   if(r.kind==='tail')dfs(applyEat(snakes,i,r),seq.concat([['eat',snakes[i].name,snakes[r.target].name]]));
   else if(r.kind==='edge'&&allowLaunch)dfs(snakes.filter((_,si)=>si!==i),seq.concat([['launch',snakes[i].name]]));
   if(solutions>=300)return;}}
 dfs(level.snakes,[]);return {best,bestSeq,solutions};}

let seed=Number(process.argv[2]||42);
function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;}
function ri(n){return Math.floor(rnd()*n);}
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

function megaPath(w,h,minLen){
 for(let a=0;a<400;a++){
  const sx=ri(w),sy=ri(h);const cells=[[sx,sy]];const used=new Set([sx+','+sy]);
  while(true){const [cx,cy]=cells[cells.length-1];
   const opts=dirs.map(([dx,dy])=>[cx+dx,cy+dy]).filter(([x,y])=>x>=0&&y>=0&&x<w&&y<h&&!used.has(x+','+y));
   if(!opts.length)break;const nxt=opts[ri(opts.length)];cells.push(nxt);used.add(nxt[0]+','+nxt[1]);}
  if(cells.length>=minLen)return cells;}
 return null;}

function sub(a,b){return [a[0]-b[0],a[1]-b[1]];}
function eq(a,b){return a[0]===b[0]&&a[1]===b[1];}

// Один обратный разрез: снейк M -> P (голова M) + E (хвостовая часть + достроенный хвост)
function splitOnce(state,W,H){
 const idxs=state.map((s,i)=>i).filter(i=>state[i].cells.length>=4);
 if(!idxs.length)return null;
 // перебираем в случайном порядке
 for(const mi of shuffle(idxs)){
  const M=state[mi].cells;const m=M.length;
  const cand=[];
  for(let k=2;k<=m-2;k++){
   const a=m-k;
   const maxG=Math.min(a-2, 4);
   // прямолинейность M[k-1..k+g]
   const d0=sub(M[k-1],M[k]);
   for(let g=0;g<=maxG;g++){
    let straight=true;
    for(let j=0;j<g;j++){ if(!eq(sub(M[k+j],M[k+j+1]),d0)){straight=false;break;} }
    if(!straight)break;
    // facing E: M[k+g]-M[k+g+1] должен смотреть вдоль линии к P
    if(!eq(sub(M[k+g],M[k+g+1]),d0))continue;
    cand.push([k,g]);
   }
  }
  for(const [k,g] of shuffle(cand)){
   const P={cells:M.slice(0,k).map(c=>c.slice())};
   const Evis=M.slice(k+g).map(c=>c.slice());
   // занятые клетки нового состояния: все змеи без M + P + Evis; запрещены и клетки зазора
   const forbid=new Set();
   state.forEach((s,si)=>{if(si!==mi)s.cells.forEach(([x,y])=>forbid.add(x+','+y));});
   P.cells.forEach(([x,y])=>forbid.add(x+','+y));
   Evis.forEach(([x,y])=>forbid.add(x+','+y));
   for(let j=0;j<g;j++){const c=M[k+j];forbid.add(c[0]+','+c[1]);}
   // достраиваем хвост E на g клеток от Evis[конец]
   const tail=[];let ok=true;let cur=Evis[Evis.length-1];
   const local=new Set();
   for(let j=0;j<g;j++){
    const opts=dirs.map(([dx,dy])=>[cur[0]+dx,cur[1]+dy]).filter(([x,y])=>x>=0&&y>=0&&x<W&&y<H&&!forbid.has(x+','+y)&&!local.has(x+','+y));
    if(!opts.length){ok=false;break;}
    const nxt=opts[ri(opts.length)];tail.push(nxt);local.add(nxt[0]+','+nxt[1]);cur=nxt;
   }
   if(!ok)continue;
   const E={cells:Evis.concat(tail)};
   const out=state.map((s,si)=>si===mi?P:s);
   out.push(E);
   return out;
  }
 }
 return null;}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=ri(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}

function generate(w,h,nSnakes,minTotal){
 for(let t=0;t<600;t++){
  const mp=megaPath(w,h,minTotal);
  if(!mp)continue;
  let state=[{cells:mp}];
  let ok=true;
  for(let s=0;s<nSnakes-1;s++){
   const nx=splitOnce(state,w,h);
   if(!nx){ok=false;break;}
   state=nx;
  }
  if(!ok)continue;
  if(state.some(s=>s.cells.length<2))continue;
  const total=state.reduce((a,s)=>a+s.cells.length,0);
  const snakes=shuffle(state).map((s,i)=>({name:'S'+i,cells:s.cells}));
  return {w,h,target:total,snakes,total};
 }
 return null;}

// Генерим кандидатов и оцениваем солвером
const want=[[6,6,5,18],[6,6,6,20],[7,7,6,24],[7,7,7,26]];
for(const [w,h,n,minT] of want){
 for(let k=0;k<8;k++){
  const lv=generate(w,h,n,minT);
  if(!lv)continue;
  const noL=solve(lv,false);
  const withL=solve(lv,true);
  if(noL.best===lv.total){
   console.log(`CAND ${w}x${h} n=${lv.snakes.length} total=${lv.total} solNoLaunch=${noL.solutions} minSeqLen=${noL.bestSeq.length}`);
   console.log(JSON.stringify(lv));
   console.log('  реш:',JSON.stringify(noL.bestSeq));
  }
 }
}
