/* ===== WordDeck — app.js =====
 * ต่อยอดจาก vocab-trainer.html เดิม: โครงสร้าง/ชื่อฟังก์ชัน/คีย์ localStorage คงเดิม
 * เพิ่ม: โหลดคำจาก data/words.json, PWA (SW + install), แจ้งเตือนผ่าน SW, .ics, หน้าสถิติ, ธีม
 */
const APP_VERSION = "1.3.0";
const $=s=>document.querySelector(s); // ต้องประกาศก่อนทุกส่วน (เดิมอยู่ใต้ loadVoices ทำให้เกิด TDZ error)

/* ---------- DATA (โหลดจาก data/words.json) ---------- */
let SEED = [];
async function loadSeed(){
  try{
    const r = await fetch("./data/words.json", {cache:"no-cache"});
    const d = await r.json();
    SEED = (d.words||d).map((x,i)=>({...x, id: x.id || "s"+i}));
  }catch(e){ console.error("โหลด words.json ไม่ได้", e); toast("โหลดคลังคำไม่ได้ — ลองรีเฟรช"); }
}

/* ---------- STORAGE ---------- */
const KEY_WORDS="wd_words", KEY_PROG="wd_prog", KEY_SCHED="wd_sched", KEY_DAYS="wd_days", KEY_NOTIFIED="wd_notified", KEY_THEME="wd_theme";
const load=(k,d)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let custom=load(KEY_WORDS,[]);
let prog=load(KEY_PROG,{}); // id -> {box, due, wrong}
const allWords=()=>[...SEED,...custom];
const getP=id=>prog[id]||{box:0,due:0,wrong:0};
const INTERVALS=[0,1,3,7,21]; // days per box
function markWrong(id){const p=getP(id);prog[id]={box:0,due:0,wrong:(p.wrong||0)+1};save(KEY_PROG,prog);}
function markGrade(id,ok){const p=getP(id);const box=ok?Math.min(4,p.box+1):0;prog[id]={box,due:Date.now()+INTERVALS[box]*864e5,wrong:(p.wrong||0)+(ok?0:1)};save(KEY_PROG,prog);}

/* ---------- SPEECH ---------- */
const synth=window.speechSynthesis; let voices=[];
function loadVoices(){if(!synth)return;voices=synth.getVoices().filter(v=>v.lang.startsWith("en"));const s=$("#voice");s.innerHTML="";voices.forEach((v,i)=>s.innerHTML+=`<option value="${i}">${v.name.replace(/Microsoft |Google /,"")} (${v.lang})</option>`);
  const pref=voices.findIndex(v=>/en-US/.test(v.lang));if(pref>=0)s.value=pref;}
if(synth){loadVoices();synth.onvoiceschanged=loadVoices;}
function speak(text,rate=0.95){if(!synth)return toast("เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง");synth.cancel();const u=new SpeechSynthesisUtterance(text);const v=voices[$("#voice").value];if(v)u.voice=v;u.lang="en-US";u.rate=rate;synth.speak(u);}

/* ---------- HELPERS ---------- */
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
const cats=()=>[...new Set(allWords().map(w=>w.cat))];
function fillCats(){["#f-cat","#q-cat","#s-cat","#l-cat"].forEach(id=>{const s=$(id),v=s.value;s.innerHTML=`<option value="">ทุกหมวด</option>`+cats().map(c=>`<option>${c}</option>`).join("");s.value=v;});
  $("#catList").innerHTML=cats().map(c=>`<option value="${c}">`).join("");}
const byCat=c=>allWords().filter(w=>!c||w.cat===c);
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const hi=(s,w)=>s.replace(new RegExp(`(${w.split(" ")[0].replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\w*)`,"i"),"<b>$1</b>");
const rxEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
/* เจาะช่องว่าง: ถ้าเป็นวลี ลองแทนทั้งวลีก่อน ถ้าไม่เจอค่อยใช้คำแรก */
function blankOut(sentence,word){
  const full=new RegExp(`\\b${rxEsc(word)}\\b`,"i");
  if(full.test(sentence))return sentence.replace(full,"______");
  const first=new RegExp(`\\b${rxEsc(word.split(" ")[0])}\\w*`,"i");
  return sentence.replace(first,"______");
}
const exHtml=w=>(w.ex||[]).map(e=>`<div class="ex"><div style="flex:1"><div class="en">${hi(e[0],w.w)}</div><div class="th">${e[1]||""}</div></div><button type="button" data-say="${esc(e[0])}">🔊</button></div>`).join("");
let toastTimer=null;
function toast(msg,btn){const t=$("#toast");t.innerHTML=esc(msg)+(btn?`<button id="toastBtn">${esc(btn.label)}</button>`:"");if(btn)$("#toastBtn").onclick=()=>{btn.fn();t.classList.remove("show");};t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),btn?12000:3200);}

/* ---------- NAV ---------- */
const PAGES={today:()=>renderToday(),flash:()=>startFlash(),quiz:()=>nextQuiz(),speak:()=>nextSpeak(),list:()=>renderList(),stats:()=>renderStats()};
function goPage(p){document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("active",x.dataset.p===p));document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));$("#p-"+p).classList.add("active");PAGES[p]&&PAGES[p]();window.scrollTo({top:0});}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>goPage(b.dataset.p));
document.body.addEventListener("click",e=>{const b=e.target.closest("[data-say]");if(b)speak(b.dataset.say);});

/* ---------- THEME ---------- */
function applyTheme(){const t=load(KEY_THEME,"");document.documentElement.dataset.theme=t;const dark=t==="dark"||(t===""&&matchMedia("(prefers-color-scheme: dark)").matches);$("#themeBtn").textContent=dark?"☀":"☾";
  document.querySelector('meta[name=theme-color]').content=dark?"#1E2733":"#0F7C8C";}
$("#themeBtn").onclick=()=>{const cur=load(KEY_THEME,"");const dark=cur==="dark"||(cur===""&&matchMedia("(prefers-color-scheme: dark)").matches);save(KEY_THEME,dark?"light":"dark");applyTheme();};

/* ---------- FLASHCARDS ---------- */
let deck=[],fi=0,flipped=false;
function startFlash(){
  const mode=$("#f-mode").value,now=Date.now();
  let ws=byCat($("#f-cat").value);
  if(mode==="due")ws=ws.filter(w=>prog[w.id]&&getP(w.id).due<=now);
  if(mode==="new")ws=ws.filter(w=>!prog[w.id]);
  deck=shuffle(ws);fi=0;flipped=false;renderFlash();
}
function renderFlash(){
  const c=$("#f-card"),a=$("#f-actions");
  $("#f-bar").style.width=deck.length?(fi/deck.length*100)+"%":"0";
  $("#f-stat").textContent=deck.length?`${Math.min(fi+1,deck.length)} / ${deck.length}`:"";
  if(!deck.length){c.innerHTML=`<div class="empty">ไม่มีคำที่ต้องทบทวนตอนนี้ 🎉<br>ลองเลือก "ทุกคำ" หรือกลับมาใหม่พรุ่งนี้</div>`;a.innerHTML="";return;}
  if(fi>=deck.length){c.innerHTML=`<div class="empty">จบรอบแล้ว! ทบทวนไป ${deck.length} คำ</div>`;a.innerHTML=`<button class="btn primary" onclick="startFlash()">เริ่มรอบใหม่</button>`;$("#f-bar").style.width="100%";return;}
  const w=deck[fi],p=getP(w.id);
  c.innerHTML=`<span class="box">กล่อง ${p.box}/4</span><div class="pos">${w.pos||""}</div><h2 class="big word-en">${w.w}</h2><div class="ipa">${w.ipa||""}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="speak" data-say="${esc(w.w)}">🔊 ฟัง</button><button class="speak slow" onclick="speak('${w.w.replace(/'/g,"\\'")}',0.6)">🐢 ช้า</button></div>
    ${flipped?`<div class="back"><p class="meaning">${w.th}</p>${exHtml(w)}</div>`:""}`;
  a.innerHTML=flipped?`<button class="btn again" onclick="grade(false)">1 · ยังไม่ได้</button><button class="btn good" onclick="grade(true)">2 · จำได้</button>`:`<button class="btn primary" onclick="flip()">พลิกดูความหมาย</button>`;
}
function flip(){flipped=true;renderFlash();}
function grade(ok){const w=deck[fi];markGrade(w.id,ok);flipped=false;
  if(ok){fi++;}
  else{ // จำไม่ได้ → ดันกลับไปอีก 4 ใบข้างหน้า จะได้เจอซ้ำในรอบเดียวกัน
    deck.splice(fi,1);deck.splice(Math.min(fi+4,deck.length),0,w);
    toast("จะวนกลับมาถามคำนี้อีกครั้ง");
  }
  renderFlash();}
document.addEventListener("keydown",e=>{if(!$("#p-flash").classList.contains("active")||e.target.tagName==="INPUT")return;if(e.code==="Space"){e.preventDefault();flipped?speak(deck[fi]?.w):flip();}if(flipped&&e.key==="1")grade(false);if(flipped&&e.key==="2")grade(true);});
$("#f-cat").onchange=$("#f-mode").onchange=startFlash;

/* ---------- QUIZ ---------- */
let qOk=0,qTotal=0,qLock=false;
function nextQuiz(){
  qLock=false;const type=$("#q-type").value,ws=byCat($("#q-cat").value);
  if(ws.length<4){$("#q-box").innerHTML=`<div class="empty">ต้องมีอย่างน้อย 4 คำในหมวดนี้</div>`;return;}
  const [ans,...rest]=shuffle(ws);const choices=shuffle([ans,...rest.slice(0,3)]);
  let prompt="",label=x=>x.th;
  if(type==="en2th"){prompt=`<p class="prompt word-en">${ans.w}</p><p class="stat" style="text-align:center">${ans.ipa||""}</p>`;}
  if(type==="th2en"){prompt=`<p class="prompt">${ans.th}</p>`;label=x=>x.w;}
  if(type==="listen"){prompt=`<div style="text-align:center"><button class="speak" data-say="${esc(ans.w)}" style="font-size:20px">🔊 ฟังคำ</button></div>`;label=x=>x.w;setTimeout(()=>speak(ans.w),300);}
  if(type==="fill"){const e=(ans.ex||[])[0];if(!e){return nextQuiz();}prompt=`<p class="prompt word-en" style="font-size:24px">${blankOut(e[0],ans.w)}</p><p class="stat" style="text-align:center">${e[1]||""}</p>`;label=x=>x.w;}
  $("#q-box").innerHTML=prompt+`<div class="choices">${choices.map(c=>`<button data-id="${c.id}">${label(c)}</button>`).join("")}</div><div class="feedback" id="q-fb"></div><div class="actions"><button class="btn" id="q-next" disabled>ข้อถัดไป</button></div>`;
  document.querySelectorAll(".choices button").forEach(b=>b.onclick=()=>{
    if(qLock)return;qLock=true;qTotal++;const right=b.dataset.id===ans.id;if(right)qOk++;
    b.classList.add(right?"correct":"wrong");document.querySelector(`.choices [data-id="${ans.id}"]`).classList.add("correct");
    $("#q-fb").innerHTML=right?`✅ ถูกต้อง`:`❌ คำตอบคือ <span class="word-en">${ans.w}</span> = ${ans.th}`;
    $("#q-stat").textContent=`ถูก ${qOk} / ${qTotal}`;$("#q-next").disabled=false;$("#q-next").focus();
    if(type!=="listen")speak(ans.w);
    if(!right)markWrong(ans.id);
  });
  $("#q-next").onclick=nextQuiz;
}
$("#q-cat").onchange=$("#q-type").onchange=nextQuiz;

/* ---------- PRONUNCIATION ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let sWord=null,rec=null;
function nextSpeak(){const ws=byCat($("#s-cat").value);sWord=shuffle(ws)[0];$("#heard").textContent="";$("#s-score").textContent="";
  if(!sWord){$("#s-card").innerHTML=`<div class="empty">ไม่มีคำในหมวดนี้</div>`;return;}
  $("#s-card").innerHTML=`<div class="pos">${sWord.pos||""}</div><h2 class="big word-en">${sWord.w}</h2><div class="ipa">${sWord.ipa||""}</div><div style="display:flex;gap:8px;justify-content:center"><button class="speak" data-say="${esc(sWord.w)}">🔊 ฟังต้นแบบ</button><button class="speak slow" onclick="speak('${sWord.w.replace(/'/g,"\\'")}',0.6)">🐢 ช้า</button></div><p class="stat" style="margin-top:14px">${sWord.th}</p>`;
  if(!SR)$("#s-hint").textContent="เบราว์เซอร์นี้ไม่รองรับการฟังเสียงพูด (ใช้ Chrome หรือ Edge) — ฟังต้นแบบแล้วพูดตามได้";}
$("#s-next").onclick=nextSpeak;$("#s-cat").onchange=nextSpeak;
function sim(a,b){a=a.toLowerCase().replace(/[^a-z ]/g,"");b=b.toLowerCase().replace(/[^a-z ]/g,"");const m=a.length,n=b.length,d=[...Array(m+1)].map((_,i)=>[i,...Array(n).fill(0)]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return 1-d[m][n]/Math.max(m,n,1);}
$("#mic").onclick=()=>{
  if(!SR||!sWord)return;
  if(rec){rec.stop();return;}
  rec=new SR();rec.lang="en-US";rec.interimResults=false;rec.maxAlternatives=5;
  $("#mic").classList.add("on");$("#s-hint").textContent="กำลังฟัง... พูดได้เลย";
  rec.onresult=e=>{const alts=[...e.results[0]].map(r=>r.transcript);const best=alts.map(t=>[sim(t,sWord.w),t]).sort((a,b)=>b[0]-a[0])[0];
    $("#heard").textContent=`ได้ยินว่า: "${best[1]}"`;const pct=Math.round(best[0]*100);
    $("#s-score").innerHTML=pct>=90?`🌟 ${pct}% — เยี่ยมมาก!`:pct>=70?`👍 ${pct}% — ใกล้แล้ว ลองอีกครั้ง`:`🔁 ${pct}% — ฟังต้นแบบแล้วลองใหม่`;
    $("#s-score").style.color=pct>=90?"var(--sea)":pct>=70?"var(--amber)":"var(--coral)";};
  rec.onerror=e=>{$("#s-hint").textContent="ฟังไม่ได้: "+e.error+(e.error==="not-allowed"?" (ต้องอนุญาตให้ใช้ไมค์)":"");};
  rec.onend=()=>{rec=null;$("#mic").classList.remove("on");if(!$("#heard").textContent)$("#s-hint").textContent="กดไมค์ แล้วพูดคำนี้";};
  rec.start();
};

/* ---------- LIST / ADD ---------- */
function renderList(){const q=$("#search").value.toLowerCase(),c=$("#l-cat").value;const ws=byCat(c).filter(w=>w.w.toLowerCase().includes(q)||w.th.includes(q));
  $("#l-count").textContent=`${ws.length} คำ`;
  $("#l-body").innerHTML=ws.map(w=>{const p=getP(w.id);const st=!prog[w.id]?["","ใหม่"]:p.box>=3?["b3","จำได้ดี"]:p.box===0?["b0","ต้องทบทวน"]:["b1","กำลังเรียน"];
    return `<tr><td><span class="word-en">${w.w}</span><br><span class="stat">${w.ipa||""}</span> <button class="icon" data-say="${esc(w.w)}">🔊</button></td><td>${w.th}<br><span class="stat">${(w.ex||[]).map(e=>e[0]).join(" · ")}</span></td><td><span class="tag">${w.cat}</span></td><td><span class="tag ${st[0]}">${st[1]}</span></td><td>${w.id.startsWith("c")?`<button class="icon" onclick="delWord('${w.id}')" title="ลบ">🗑</button>`:""}</td></tr>`}).join("")||`<tr><td colspan="5" class="empty">ไม่พบคำ</td></tr>`;}
$("#search").oninput=$("#l-cat").onchange=renderList;
$("#addForm").onsubmit=e=>{e.preventDefault();const ex=$("#a-ex").value.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>l.split("|").map(s=>s.trim()));
  custom.push({id:"c"+Date.now(),w:$("#a-word").value.trim(),th:$("#a-th").value.trim(),pos:$("#a-pos").value.trim(),cat:$("#a-cat").value.trim()||"My words",ipa:$("#a-ipa").value.trim(),ex});
  save(KEY_WORDS,custom);e.target.reset();fillCats();renderList();toast("เพิ่มคำแล้ว");};
function delWord(id){if(!confirm("ลบคำนี้?"))return;custom=custom.filter(w=>w.id!==id);delete prog[id];save(KEY_WORDS,custom);save(KEY_PROG,prog);fillCats();renderList();}
$("#resetProg").onclick=()=>{if(confirm("ล้างความคืบหน้าทั้งหมด (กล่อง Leitner, สถิติรายวัน)?")){prog={};days={};save(KEY_PROG,prog);saveDays();renderList();toast("ล้างแล้ว");}};
$("#exportBtn").onclick=()=>{const blob=new Blob([JSON.stringify({app:"WordDeck",version:APP_VERSION,exportedAt:new Date().toISOString(),custom,prog,sched,days},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`worddeck-backup-${todayKey()}.json`;a.click();};
$("#importFile").onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{const d=JSON.parse(t);if(Array.isArray(d.custom))custom=d.custom;if(d.prog)prog=d.prog;if(Array.isArray(d.sched))sched=d.sched;if(d.days)days=d.days;
  save(KEY_WORDS,custom);save(KEY_PROG,prog);save(KEY_SCHED,sched);saveDays();fillCats();renderList();syncScheduleToSW();toast("นำเข้าสำเร็จ");}catch{toast("ไฟล์ไม่ถูกต้อง");}finally{e.target.value="";}});};

/* ---------- TODAY: SCHEDULE + SESSIONS ---------- */
const TYPES={new:"คำใหม่",review:"ทบทวน",usage:"ฝึกใช้ในประโยค",test:"มินิเทสต์",recap:"ทวนคำวันนี้",relearn:"ทวนซ้ำ"};
const DEFAULT_SCHED=[
 {t:"06:15",type:"new",n:5,name:"คำใหม่ตอนเช้า",note:"ตื่นมาฟังเสียง + ดูตัวอย่างประโยค"},
 {t:"09:30",type:"review",n:8,name:"ทบทวนช่วงสาย",note:"พักงาน 3 นาที ดูคำที่ถึงกำหนด"},
 {t:"12:30",type:"usage",n:5,name:"ฝึกใช้ตอนพักเที่ยง",note:"เห็นประโยคแล้วพิมพ์คำเอง"},
 {t:"15:30",type:"review",n:8,name:"ทบทวนช่วงบ่าย",note:"กันลืมก่อนเลิกงาน"},
 {t:"19:45",type:"test",n:10,name:"มินิเทสต์หลังเลิกงาน",note:"ต้องได้ ≥ 80% ถึงนับวัน"},
 {t:"21:30",type:"recap",n:0,name:"ทวนก่อนนอน",note:"คำใหม่ทั้งหมดของวันนี้อีกรอบ"},
];
let sched=load(KEY_SCHED,DEFAULT_SCHED);
let days=load(KEY_DAYS,{});
const dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; // วันที่ตามเวลาท้องถิ่น (ไม่ใช่ UTC)
const todayKey=()=>dateKey(new Date());
function dayRec(){const k=todayKey();if(!days[k])days[k]={done:{},newWords:[],extra:[],testScore:null};return days[k];}
const saveDays=()=>save(KEY_DAYS,days);
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const toMin=t=>{const[a,b]=t.split(":").map(Number);return a*60+b;};
function sessions(){const d=dayRec();return [...sched.map((x,i)=>({...x,key:"s"+i})),...d.extra.map((x,i)=>({...x,key:"x"+i}))].sort((a,b)=>toMin(a.t)-toMin(b.t));}
function streak(){let n=0;const d=new Date();const tk=todayKey();for(let i=0;i<1000;i++){const k=dateKey(d);const r=days[k];const pass=r&&r.testScore!=null&&r.testScore>=0.8;if(pass)n++;else if(k!==tk)break;d.setDate(d.getDate()-1);}return n;}
function pickNew(n){const d=dayRec();const used=new Set(d.newWords);return allWords().filter(w=>!prog[w.id]&&!used.has(w.id)).slice(0,n);}
const dueWords=()=>allWords().filter(w=>prog[w.id]&&getP(w.id).due<=Date.now());
const todayWords=()=>{const ids=new Set(dayRec().newWords);return allWords().filter(w=>ids.has(w.id));};

function renderToday(){
  const d=dayRec(),ss=sessions(),nm=nowMin();
  $("#t-date").textContent=new Date().toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long"});
  const next=ss.find(x=>!d.done[x.key]);
  $("#t-title").textContent=next?`ถัดไป ${next.t} · ${next.name}`:"วันนี้ครบทุกช่วงแล้ว 🎉";
  $("#streak").textContent=streak();
  const done=ss.filter(x=>d.done[x.key]).length;
  const shaky=shakyWords().length;
  $("#t-counts").innerHTML=`<div><b>${d.newWords.length}</b><span>คำใหม่วันนี้</span></div><div><b>${dueWords().length}</b><span>รอทบทวน</span></div><div><b class="${shaky?"warn":""}">${shaky}</b><span>ยังไม่แม่น</span></div><div><b>${d.testScore==null?"–":Math.round(d.testScore*100)+"%"}</b><span>คะแนนเทสต์</span></div>`;
  const rw=relearnWords().length;
  const rb=$("#t-relearn");rb.hidden=!rw;
  rb.textContent=`🔁 ทวนซ้ำทั้งหมด (${rw})`;
  rb.title=shaky?`รวมคำที่ยังไม่แม่น ${shaky} คำ ไว้ต้นคิว`:"ทวนคำของวันนี้ทั้งหมดอีกรอบ";
  $("#t-start").disabled=!next;$("#t-start").textContent=next?`▶ เริ่ม: ${next.name}`:"ครบแล้ว";
  $("#timeline").innerHTML=ss.map(x=>{const isDone=d.done[x.key],isNow=!isDone&&x===next&&nm>=toMin(x.t)-15;
    return `<div class="sess ${isDone?"done":""} ${isNow?"now":""}"><div class="t">${x.t}</div><div class="n">${x.name}<small>${TYPES[x.type]}${x.n?` ${x.n} คำ`:""} · ${x.note||""}</small></div>
    ${isDone?"✅":`<button class="btn ${x===next?"primary":""}" onclick="runSession('${x.key}')">${x===next?"เริ่ม":"ทำก่อน"}</button>`}</div>`}).join("");
  renderNotifButton();
}
$("#t-start").onclick=()=>{const d=dayRec();const next=sessions().find(x=>!d.done[x.key]);if(next)runSession(next.key);};
$("#t-relearn").onclick=()=>runSession("relearn");
$("#t-extra").onclick=()=>{const d=dayRec();const h=new Date();const t=`${String(h.getHours()).padStart(2,"0")}:${String(h.getMinutes()).padStart(2,"0")}`;d.extra.push({t,type:"new",n:5,name:"เรียนเพิ่ม",note:"เพิ่มเอง"});saveDays();renderToday();runSession("x"+(d.extra.length-1));};

/* editor */
$("#t-edit").onclick=()=>{const e=$("#t-editor");e.hidden=!e.hidden;if(!e.hidden)renderEditor();};
function renderEditor(){$("#t-editor").innerHTML=
  `<div class="rounds-set"><b>ต้องทวนกี่รอบถึงจะผ่าน</b>
    <div class="seg">${[1,2,3].map(n=>`<button class="${getRounds()===n?"on":""}" onclick="save('${KEY_ROUNDS}',${n});renderEditor();toast('ตั้งเป็น ${n} รอบแล้ว ใช้กับช่วงที่เริ่มหลังจากนี้')">${n} รอบ</button>`).join("")}</div>
    <p class="stat" style="margin:6px 0 0">ตอบถูกรอบแรกยังไม่ผ่าน ต้องเจอคำเดิมอีกในรอบถัดไปโดยถามคนละแบบ — รอบ 1 อังกฤษ→ความหมาย · รอบ 2 ความหมาย→อังกฤษ · รอบ 3 ฟังเสียง→เลือกคำ</p></div>`+
  `<p class="stat" style="margin-top:14px">ตั้งเวลาให้ตรงกับวันของคุณ (ตื่น 06:00 · ทำงาน 07:00–19:00) — เพิ่ม/ลบช่วงได้ แล้วกด "ดาวน์โหลด .ics" ใหม่ถ้าใช้ Google Calendar</p>`+
  sched.map((x,i)=>`<div class="row"><input type="time" value="${x.t}" onchange="sched[${i}].t=this.value;saveSched()"><input type="text" value="${esc(x.name)}" onchange="sched[${i}].name=this.value;saveSched()"><select onchange="sched[${i}].type=this.value;saveSched()">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${x.type===k?"selected":""}>${v}</option>`).join("")}</select><button class="icon" onclick="sched.splice(${i},1);saveSched();renderEditor()">🗑</button>
  <div></div><div class="stat">จำนวนคำ <input type="number" min="0" max="30" value="${x.n}" style="width:70px" onchange="sched[${i}].n=+this.value;saveSched()"></div><div></div><div></div></div>`).join("")+
  `<button class="btn" onclick="sched.push({t:'12:00',type:'review',n:8,name:'ช่วงใหม่',note:''});saveSched();renderEditor()">+ เพิ่มช่วง</button> <button class="btn" onclick="sched=JSON.parse(JSON.stringify(DEFAULT_SCHED));saveSched();renderEditor()">คืนค่าเริ่มต้น</button>`;}
function saveSched(){sched.sort((a,b)=>toMin(a.t)-toMin(b.t));save(KEY_SCHED,sched);renderToday();syncScheduleToSW();}

/* ---------- NOTIFICATIONS (ผ่าน Service Worker) ---------- */
let swReg=null;
const notifSupported=()=>"Notification" in window;
const notifGranted=()=>notifSupported()&&Notification.permission==="granted";
function renderNotifButton(){const b=$("#t-notif");if(!notifSupported()){b.textContent="🔔 ไม่รองรับ";b.disabled=true;return;}b.textContent=notifGranted()?"🔔 แจ้งเตือนเปิดอยู่":"🔔 เปิดแจ้งเตือน";}
$("#t-notif").onclick=async()=>{
  if(!notifSupported())return $("#notif-msg").textContent="เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน";
  const p=await Notification.requestPermission();
  if(p!=="granted"){$("#notif-msg").textContent="ไม่ได้รับอนุญาต — เปิดได้ที่ตั้งค่าเว็บไซต์ของเบราว์เซอร์";renderToday();return;}
  const caps=await setupBackgroundNotifications();
  $("#notif-msg").textContent=`เปิดแล้ว ✓ ${caps}`;
  showNotification("WordDeck พร้อมแล้ว 🔔",`จะเตือนตามตาราง: ${sched.map(s=>s.t).join(" · ")}`,{key:null});
  renderToday();
};
async function showNotification(title,body,data){
  const opts={body,icon:"./icons/icon-192.png",badge:"./icons/badge-96.png",tag:"wd-"+(data?.key||"info"),data:{url:"./"+(data?.key?`?session=${data.key}`:"")},lang:"th"};
  if(swReg)return swReg.showNotification(title,opts);
  const n=new Notification(title,opts);n.onclick=()=>{window.focus();if(data?.key)runSession(data.key);};
}
/* ส่งตารางให้ SW เก็บ (IndexedDB) เพื่อใช้ตอน periodicsync / notification trigger */
function scheduleForSW(){const d=dayRec();return sessions().filter(x=>!d.done[x.key]).map(x=>({key:x.key,t:x.t,title:`WordDeck · ${x.t} ${x.name}`,body:`${TYPES[x.type]}${x.n?` ${x.n} คำ`:""} — ใช้เวลาประมาณ ${x.type==="test"?8:3} นาที`}));}
function syncScheduleToSW(){if(navigator.serviceWorker?.controller)navigator.serviceWorker.controller.postMessage({type:"SCHEDULE",items:scheduleForSW(),full:sched.map(x=>({key:"s"+sched.indexOf(x),t:x.t,title:`WordDeck · ${x.t} ${x.name}`,body:`${TYPES[x.type]}${x.n?` ${x.n} คำ`:""}`}))});scheduleTriggers();}
/* Notification Triggers API (ถ้าเบราว์เซอร์มี) — ตั้งเวลาเด้งล่วงหน้าโดยไม่ต้องเปิดแอป */
async function scheduleTriggers(){
  if(!swReg||!("showTrigger" in Notification.prototype)||!("TimestampTrigger" in window)||!notifGranted())return false;
  try{
    const pending=await swReg.getNotifications({includeTriggered:false});pending.forEach(n=>n.close());
    const d=dayRec();const now=Date.now();
    for(const dayOff of [0,1]){for(const x of sessions()){
      if(dayOff===0&&d.done[x.key])continue;
      const [h,m]=x.t.split(":").map(Number);const at=new Date();at.setDate(at.getDate()+dayOff);at.setHours(h,m,0,0);
      if(at.getTime()<=now)continue;
      await swReg.showNotification(`WordDeck · ${x.t} ${x.name}`,{body:`${TYPES[x.type]}${x.n?` ${x.n} คำ`:""}`,tag:`wd-trig-${dayOff}-${x.key}`,icon:"./icons/icon-192.png",badge:"./icons/badge-96.png",showTrigger:new TimestampTrigger(at.getTime()),data:{url:`./?session=${x.key}`}});
    }}
    return true;
  }catch(e){console.warn("trigger failed",e);return false;}
}
async function setupBackgroundNotifications(){
  const caps=[];
  if(await scheduleTriggers())caps.push("ตั้งเวลาเด้งล่วงหน้า (Notification Triggers)");
  if(swReg&&"periodicSync" in swReg){
    try{const st=await navigator.permissions.query({name:"periodic-background-sync"});
      if(st.state==="granted"){await swReg.periodicSync.register("wd-reminder",{minInterval:15*60*1000});caps.push("เช็กตารางเบื้องหลัง (Periodic Sync)");}
      else caps.push("Periodic Sync ยังไม่เปิด — ติดตั้งเป็นแอปก่อนแล้วเปิดใช้บ่อยๆ");
    }catch(e){}
  }
  if(!caps.length)caps.push("จะเด้งเมื่อแอป/แท็บเปิดอยู่ · แนะนำใช้ .ics ใส่ Google Calendar คู่กัน");
  syncScheduleToSW();
  return caps.join(" · ");
}
/* fallback: timer ในหน้าเว็บ (ทำงานตอนแอป/แท็บเปิดอยู่ แม้อยู่เบื้องหลัง) */
let notified=load(KEY_NOTIFIED,{});
function checkReminders(){
  if(!notifGranted())return;const d=dayRec(),k=todayKey(),nm=nowMin();
  sessions().forEach(x=>{const id=k+x.key;if(!d.done[x.key]&&!notified[id]&&nm>=toMin(x.t)&&nm<toMin(x.t)+30){notified[id]=1;save(KEY_NOTIFIED,notified);
    showNotification(`WordDeck · ${x.t} ${x.name}`,`${TYPES[x.type]}${x.n?` ${x.n} คำ`:""} — ใช้เวลาประมาณ ${x.type==="test"?8:3} นาที`,{key:x.key});}});
  const nx=sessions().find(x=>!d.done[x.key]);document.title=nx?`${nx.t} ${nx.name} — WordDeck`:"WordDeck";
  // ล้าง notified ของวันเก่า
  Object.keys(notified).forEach(id=>{if(!id.startsWith(k))delete notified[id];});
}
setInterval(checkReminders,30000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){checkReminders();renderToday();}});

/* ---------- .ICS (Google Calendar) ---------- */
function buildICS(){
  const pad=n=>String(n).padStart(2,"0");
  const now=new Date();const stamp=`${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const day=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const escI=s=>String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//WordDeck//TH","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:WordDeck ตารางฝึกศัพท์","X-WR-TIMEZONE:Asia/Bangkok",
    "BEGIN:VTIMEZONE","TZID:Asia/Bangkok","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:+0700","TZOFFSETTO:+0700","TZNAME:+07","END:STANDARD","END:VTIMEZONE"];
  sched.forEach((x,i)=>{const [h,m]=x.t.split(":").map(Number);const dur=x.type==="test"?10:5;const end=new Date(2000,0,1,h,m+dur);
    lines.push("BEGIN:VEVENT",`UID:worddeck-${i}-${x.t.replace(":","")}@panithanxd.github.io`,`DTSTAMP:${stamp}`,`DTSTART;TZID=Asia/Bangkok:${day}T${pad(h)}${pad(m)}00`,`DTEND;TZID=Asia/Bangkok:${day}T${pad(end.getHours())}${pad(end.getMinutes())}00`,"RRULE:FREQ=DAILY",
      `SUMMARY:${escI("📚 WordDeck · "+x.name)}`,`DESCRIPTION:${escI(`${TYPES[x.type]}${x.n?` ${x.n} คำ`:""}\n${x.note||""}\nเปิดแอป: https://panithanxd.github.io/WordDeck/?session=s${i}`)}`,`URL:https://panithanxd.github.io/WordDeck/?session=s${i}`,
      "BEGIN:VALARM","TRIGGER:PT0M","ACTION:DISPLAY",`DESCRIPTION:${escI("WordDeck · "+x.name)}`,"END:VALARM","END:VEVENT");});
  lines.push("END:VCALENDAR");
  return lines.map(l=>l.length<=72?l:l.match(/.{1,72}/g).join("\r\n ")).join("\r\n");
}
$("#t-ics").onclick=()=>{const blob=new Blob([buildICS()],{type:"text/calendar;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="worddeck-schedule.ics";a.click();
  toast("ดาวน์โหลดแล้ว — เปิดไฟล์ด้วย Google Calendar แล้วเลือก 'นำเข้า' จะได้เตือนทุกวัน");};

/* ---------- session runner (ทวนซ้ำหลายรอบ — ตอบถูกครั้งเดียวยังไม่ผ่าน) ---------- */
let run=null;
const MAX_TRIES=3;        // ผิดซ้ำเกินนี้ในรอบเดียว → พักไว้ ไปโผล่ในช่วง "ทวนคำที่ยังไม่แม่น"
const REQUEUE_GAP=3;      // ตอบผิดแล้ววนกลับมาถามใหม่หลังผ่านไปกี่คำ
const KEY_ROUNDS="wd_rounds";
const getRounds=()=>Math.min(3,Math.max(1,+load(KEY_ROUNDS,2)||2));

/* ชื่อรูปแบบคำถามของแต่ละรอบ */
const ROUND_LABEL=["อังกฤษ → ความหมาย","ความหมาย → อังกฤษ","ฟังเสียง → เลือกคำ"];

/* คำที่ยังไม่แม่น = เคยเรียนแล้วแต่ยังตกอยู่กล่อง 0 (เรียงคำที่ผิดบ่อยขึ้นก่อน) */
const shakyWords=()=>allWords().filter(w=>prog[w.id]&&getP(w.id).box===0)
  .sort((a,b)=>(getP(b.id).wrong||0)-(getP(a.id).wrong||0));

/* คำสำหรับช่วงทวนซ้ำ: ทวน "ทั้งหมด" ของวันนี้ ไม่ใช่เฉพาะคำที่ตอบผิด
   เรียงคำที่ยังไม่แม่นขึ้นก่อน แล้วตามด้วยคำที่เหลือของวันนี้ (ตอบถูกแล้วก็ยังต้องเจอ) */
function relearnWords(){
  const seen=new Set(),out=[];
  const push=w=>{if(w&&!seen.has(w.id)){seen.add(w.id);out.push(w);}};
  const today=todayWords();
  shakyWords().forEach(push);            // ยังไม่แม่น มาก่อน
  today.forEach(push);                   // คำของวันนี้ทั้งหมด รวมคำที่ตอบถูกแล้ว
  if(out.length<4)dueWords().forEach(push);  // วันแรกที่ยังมีคำน้อย ดึงคำที่ถึงกำหนดมาเสริม
  return out;
}

function pickWords(s){
  const d=dayRec();
  if(s.type==="new"){const ws=pickNew(s.n);ws.forEach(w=>{if(!d.newWords.includes(w.id))d.newWords.push(w.id);if(!prog[w.id])prog[w.id]={box:0,due:0,wrong:0};});save(KEY_PROG,prog);saveDays();return ws;}
  if(s.type==="review"){let ws=shuffle(dueWords()).slice(0,s.n||8);if(!ws.length)ws=shuffle(todayWords()).slice(0,s.n||8);return ws;}
  if(s.type==="usage"){let ws=shuffle([...todayWords(),...dueWords()].filter(w=>w.ex&&w.ex.length)).slice(0,s.n||5);if(!ws.length)ws=shuffle(allWords().filter(w=>prog[w.id]&&w.ex&&w.ex.length)).slice(0,s.n||5);return ws;}
  if(s.type==="test"){let ws=shuffle([...todayWords(),...dueWords()]);if(ws.length<4)ws=shuffle(allWords()).slice(0,s.n||10);return ws.slice(0,s.n||10);}
  if(s.type==="recap")return shuffle(todayWords());
  if(s.type==="relearn")return relearnWords().slice(0,s.n||20);
  return [];
}

function runSession(key){
  const s=(key==="relearn")
    ? {key:"relearn",type:"relearn",n:20,name:"ทวนซ้ำทั้งหมด",note:""}
    : sessions().find(x=>x.key===key);
  if(!s)return;
  const words=pickWords(s);
  if(!words.length)return toast(
    s.type==="new"?"คำใหม่หมดคลังแล้ว — เพิ่มคำในหน้า 'คลังคำศัพท์'"
    :s.type==="relearn"?"ไม่มีคำค้างให้ทวน เยี่ยมมาก 🎉"
    :"ยังไม่มีคำสำหรับช่วงนี้ — เริ่มจากช่วง 'คำใหม่' ก่อน");
  goPage("today");
  run={s,words,total:words.length,rounds:getRounds(),round:1,
       queue:words.slice(),doneRound:new Set(),passed:new Set(),
       firstOk:new Set(),parked:new Set(),tries:{},
       flipped:false,relearn:null,phase:(s.type==="new")?"learn":"drill",learnIdx:0};
  $("#runner").hidden=false;$("#timeline").hidden=true;$("#t-editor").hidden=true;
  renderRun();$("#runner").scrollIntoView({behavior:"smooth"});
}

function quitRun(){if(confirm("ออกโดยยังไม่นับว่าทำแล้ว?")){run=null;$("#runner").hidden=true;$("#timeline").hidden=false;}}

function endRun(){
  const d=dayRec();d.done[run.s.key]=true;
  if(run.s.type==="test")d.testScore=run.firstOk.size/run.total;
  saveDays();run=null;
  $("#runner").hidden=true;$("#timeline").hidden=false;renderToday();syncScheduleToSW();
}

/* ตัวกลางรับคำตอบทุกโหมด */
function answer(ok){
  const w=run.queue[0];if(!w)return;
  const id=w.id;
  run.tries[id]=(run.tries[id]||0)+1;
  if(ok){
    if(run.round===1&&run.tries[id]===1)run.firstOk.add(id);
    run.doneRound.add(id);run.queue.shift();
    run.tries[id]=0;                       // เริ่มนับใหม่ในรอบถัดไป
    if(run.round>=run.rounds){run.passed.add(id);if(run.s.type!=="test")markGrade(id,true);}
    run.flipped=false;run.relearn=null;
    if(!run.queue.length)nextRound();else renderRun();
  }else{
    markWrong(id);
    run.relearn=w;                         // แสดงการ์ดเฉลยก่อน
    renderRun();
  }
}

/* กด "ทวนอีกรอบ" บนการ์ดเฉลย → ดันคำกลับเข้าคิวของรอบนี้ */
function requeue(){
  const w=run.queue.shift();if(!w)return;
  run.relearn=null;run.flipped=false;
  if((run.tries[w.id]||0)>=MAX_TRIES) run.parked.add(w.id);
  else run.queue.splice(Math.min(REQUEUE_GAP,run.queue.length),0,w);
  if(!run.queue.length)nextRound();else renderRun();
}

/* จบรอบหนึ่ง → ขึ้นรอบถัดไปด้วยรูปแบบคำถามใหม่ */
function nextRound(){
  if(run.round<run.rounds){
    run.round++;
    run.doneRound=new Set();
    run.tries={};
    run.queue=shuffle(run.words.filter(w=>!run.parked.has(w.id)));
    if(run.queue.length){
      toast(`รอบที่ ${run.round}/${run.rounds} — ${ROUND_LABEL[run.round-1]||"ทวนอีกครั้ง"} ตอบถูกรอบแรกก็ยังต้องเจออีก`);
      renderRun();return;
    }
  }
  renderRun();   // ไม่เหลือคำ → หน้าสรุป
}

function runHead(){
  const s=run.s;
  const sub=run.phase==="learn"
    ? `ดูคำใหม่ ${run.learnIdx+1}/${run.total}`
    : `รอบ ${run.round}/${run.rounds} · ผ่าน ${run.doneRound.size}/${run.total-run.parked.size}`;
  const pct=run.phase==="learn"
    ? run.learnIdx/run.total*100
    : ((run.round-1)*run.total+run.doneRound.size+run.parked.size)/(run.rounds*run.total)*100;
  return `<div class="toolbar" style="justify-content:space-between"><b>${s.name} · ${TYPES[s.type]||"ทวนซ้ำ"}</b>
    <span class="stat">${sub}</span><button class="btn" onclick="quitRun()">ออก</button></div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    ${run.phase!=="learn"?`<p class="stat center" style="margin:-6px 0 12px">${ROUND_LABEL[run.round-1]||""}</p>`:""}`;
}

/* การ์ดคำศัพท์เต็ม (ใช้ตอนเรียนใหม่และตอนทวนหลังตอบผิด) */
function fullCard(w,extra){
  return `<div class="card"><div class="pos">${w.pos||""}</div><h2 class="big word-en">${w.w}</h2><div class="ipa">${w.ipa||""}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="speak" data-say="${esc(w.w)}">🔊 ฟัง</button><button class="speak slow" onclick="speak('${w.w.replace(/'/g,"\\'")}',0.6)">🐢 ช้า</button></div>
    <div class="back"><p class="meaning">${w.th}</p>${exHtml(w)}${extra||""}</div></div>`;
}

function choiceBlock(w,label){
  const others=shuffle(allWords().filter(x=>x.id!==w.id)).slice(0,3);
  return `<div class="choices">${shuffle([w,...others]).map(c=>`<button data-id="${c.id}">${label(c)}</button>`).join("")}</div>`;
}
function bindChoices(w){
  let lock=false;
  $("#runner").querySelectorAll(".choices button").forEach(b=>b.onclick=()=>{
    if(lock)return;lock=true;
    const right=b.dataset.id===w.id;
    b.classList.add(right?"correct":"wrong");
    $("#runner").querySelector(`.choices [data-id="${w.id}"]`).classList.add("correct");
    speak(w.w);
    setTimeout(()=>answer(right),right?550:750);
  });
}

function renderRun(){
  const R=$("#runner"),s=run.s;

  /* ===== เฟสเรียนคำใหม่ ===== */
  if(run.phase==="learn"){
    const w=run.words[run.learnIdx];
    R.innerHTML=runHead()+fullCard(w,`<p class="stat center" style="margin:12px 0 0">💡 พูดตามประโยคตัวอย่าง 1 รอบ แล้วนึกประโยคของตัวเอง 1 ประโยค</p>`)+
      `<div class="actions"><button class="btn primary" onclick="nextLearn()">${run.learnIdx+1>=run.total?"เช็คความจำเลย →":"คำถัดไป"}</button></div>`;
    setTimeout(()=>speak(w.w),200);
    return;
  }

  /* ===== การ์ดเฉลยหลังตอบผิด ===== */
  if(run.relearn){
    const w=run.relearn,t=run.tries[w.id]||1,parking=t>=MAX_TRIES;
    R.innerHTML=runHead()+
      `<div class="feedback bad center">❌ ยังไม่ได้ — ดูเฉลยแล้วทวนอีกรอบ (ผิดครั้งที่ ${t})</div>`+
      fullCard(w,`<p class="stat center" style="margin:12px 0 0">🔊 กดฟังแล้วพูดตาม 2 รอบ ก่อนกดปุ่มด้านล่าง</p>`)+
      `<div class="actions"><button class="btn primary" onclick="requeue()">${parking?"เก็บไว้ทวนช่วงหน้า →":"เข้าใจแล้ว · ทวนอีกรอบ"}</button></div>`;
    setTimeout(()=>speak(w.w),200);
    return;
  }

  /* ===== จบทุกรอบ ===== */
  if(!run.queue.length){
    const pct=Math.round(run.firstOk.size/run.total*100);
    const parkList=[...run.parked].map(id=>allWords().find(w=>w.id===id)).filter(Boolean);
    const body=s.type==="test"
      ? `<div class="score-big">${pct}%</div><p class="center">ตอบถูกตั้งแต่ครั้งแรก ${run.firstOk.size}/${run.total} คำ ${pct>=80?"✅ ผ่าน":"🔁 ยังไม่ถึง 80%"}</p>
         <p class="stat center">ผ่านครบ ${run.rounds} รอบแล้ว ${run.passed.size}/${run.total} คำ</p>`
      : `<div class="empty">ผ่านครบ ${run.rounds} รอบแล้ว ${run.passed.size}/${run.total} คำ 👍<br><span class="stat">ตอบถูกตั้งแต่ครั้งแรก ${run.firstOk.size} คำ</span></div>`;
    const parkBox=parkList.length?`<div class="card" style="min-height:auto;display:block;text-align:left"><h3 style="margin-top:0">🔁 คำที่ยังไม่แม่น (${parkList.length})</h3>
      <p class="stat" style="margin-top:0">ผิดหลายรอบ เก็บไว้ทวนช่วงถัดไป กดฟังทวนได้เลย</p>
      <ul class="wrong">${parkList.map(w=>`<li><div><span class="word-en">${w.w}</span> <span class="m">${w.th}</span></div><button class="icon" data-say="${esc(w.w)}">🔊</button></li>`).join("")}</ul></div>`:"";
    R.innerHTML=runHead()+`<div class="card" style="min-height:auto">${body}</div>`+parkBox+
      `<div class="actions"><button class="btn primary" onclick="endRun()">บันทึกและกลับหน้าวันนี้</button>
       <button class="btn again" onclick="endRun();runSession('relearn')">🔁 ทวนซ้ำทั้งหมดอีกรอบ</button></div>`;
    return;
  }

  const w=run.queue[0],head=runHead(),r=run.round;

  /* ===== ทบทวน / ทวนคำที่ยังไม่แม่น: พลิกการ์ด ===== */
  if(s.type==="review"||s.type==="relearn"){
    const thFirst=(r===2);   // รอบ 2 กลับด้าน: เห็นความหมายไทย ต้องนึกคำอังกฤษเอง
    const front=thFirst
      ? `<div class="card"><p class="stat">คำนี้ภาษาอังกฤษว่าอะไร</p><h2 class="meaning" style="font-size:28px">${w.th}</h2></div>`
      : `<div class="card"><div class="pos">${w.pos||""}</div><h2 class="big word-en">${w.w}</h2><div class="ipa">${w.ipa||""}</div>
         <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="speak" data-say="${esc(w.w)}">🔊 ฟัง</button><button class="speak slow" onclick="speak('${w.w.replace(/'/g,"\\'")}',0.6)">🐢 ช้า</button></div></div>`;
    R.innerHTML=head+(run.flipped?fullCard(w):front)
      +`<div class="actions">${run.flipped
        ? `<button class="btn again" onclick="answer(false)">ยังไม่ได้</button><button class="btn good" onclick="answer(true)">จำได้</button>`
        : `<button class="btn primary" onclick="run.flipped=true;renderRun()">${thFirst?"เฉลย":"พลิกดูความหมาย"}</button>`}</div>`;
    return;
  }

  /* ===== คำใหม่ / ทวนคำวันนี้: เปลี่ยนรูปแบบตามรอบ ===== */
  if(s.type==="recap"||s.type==="new"){
    if(r===1){
      R.innerHTML=head+`<div class="q"><p class="stat center" style="margin:0">คำนี้แปลว่าอะไร</p>
        <p class="prompt word-en">${w.w}</p><p class="stat center">${w.ipa||""}</p>
        ${choiceBlock(w,x=>x.th)}</div>`;
    }else if(r===2){
      R.innerHTML=head+`<div class="q"><p class="stat center" style="margin:0">ความหมายนี้ตรงกับคำไหน</p>
        <p class="prompt">${w.th}</p>${choiceBlock(w,x=>x.w)}</div>`;
    }else{
      R.innerHTML=head+`<div class="q"><p class="stat center" style="margin:0">ฟังแล้วเลือกคำที่ได้ยิน</p>
        <div class="center"><button class="speak" data-say="${esc(w.w)}">🔊 ฟังอีกครั้ง</button></div>
        ${choiceBlock(w,x=>x.w)}</div>`;
      setTimeout(()=>speak(w.w),300);
    }
    bindChoices(w);
    return;
  }

  /* ===== ฝึกใช้ในประโยค: รอบ 2 ใช้ประโยคอีกอัน ===== */
  if(s.type==="usage"){
    const e=w.ex[(r-1)%w.ex.length];
    R.innerHTML=head+`<div class="q"><p class="stat center" style="margin:0">เติมคำให้ถูก (ความหมาย: <b>${w.th}</b>)</p>
      <p class="prompt word-en" style="font-size:24px">${blankOut(e[0],w.w)}</p><p class="stat center">${e[1]||""}</p>
      <div class="center"><input class="typein" id="u-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="พิมพ์คำศัพท์">
      <div class="feedback" id="u-fb"></div>
      <button class="btn primary" id="u-chk">ตรวจ</button>
      <button class="btn" onclick="speak('${e[0].replace(/'/g,"\\'")}')">🔊 ฟังประโยค</button>
      <button class="btn" onclick="answer(false)">ยังไม่รู้ ขอดูเฉลย</button></div></div>`;
    const inp=$("#u-in");inp.focus();
    $("#u-chk").onclick=()=>{
      const v=inp.value.trim().toLowerCase(),a=w.w.toLowerCase();
      if(v===a||sim(v,a)>=0.85){$("#u-fb").innerHTML=`✅ <span class="word-en">${e[0]}</span>`;$("#u-fb").className="feedback ok";speak(e[0]);$("#u-chk").disabled=true;setTimeout(()=>answer(true),700);}
      else answer(false);
    };
    inp.onkeydown=ev=>{if(ev.key==="Enter")$("#u-chk").click();};
    return;
  }

  /* ===== มินิเทสต์: สลับ 4 รูปแบบ ===== */
  if(s.type==="test"){
    const kinds=["en2th","th2en","listen","fill"];
    const kind=kinds[(run.doneRound.size+(run.tries[w.id]||0)+(r-1)*2)%4];
    let prompt="",label=x=>x.th;
    if(kind==="en2th")prompt=`<p class="prompt word-en">${w.w}</p><p class="stat center">${w.ipa||""}</p>`;
    if(kind==="th2en"){prompt=`<p class="prompt">${w.th}</p>`;label=x=>x.w;}
    if(kind==="listen"){prompt=`<div class="center"><button class="speak" data-say="${esc(w.w)}">🔊 ฟังคำ</button></div>`;label=x=>x.w;setTimeout(()=>speak(w.w),300);}
    if(kind==="fill"){const e=(w.ex||[["",""]])[0];prompt=`<p class="prompt word-en" style="font-size:24px">${blankOut(e[0],w.w)}</p><p class="stat center">${e[1]||""}</p>`;label=x=>x.w;}
    R.innerHTML=head+`<div class="q">${prompt}${choiceBlock(w,label)}</div>`;
    bindChoices(w);
    return;
  }
}

function nextLearn(){
  run.learnIdx++;
  if(run.learnIdx>=run.total){run.phase="drill";run.queue=shuffle(run.words.slice());
    toast(`ทีนี้มาเช็คความจำ ${run.rounds} รอบ — ตอบผิดจะวนกลับมาถามใหม่`);}
  renderRun();
}

/* ---------- STATS ---------- */
let calCursor=new Date();
$("#cal-prev").onclick=()=>{calCursor.setMonth(calCursor.getMonth()-1);renderStats();};
$("#cal-next").onclick=()=>{calCursor.setMonth(calCursor.getMonth()+1);renderStats();};
function renderStats(){
  // ปฏิทิน
  const y=calCursor.getFullYear(),m=calCursor.getMonth();
  $("#cal-title").textContent=new Date(y,m,1).toLocaleDateString("th-TH",{month:"long",year:"numeric"});
  const first=new Date(y,m,1).getDay(),nDays=new Date(y,m+1,0).getDate(),tk=todayKey();
  let html=["อา","จ","อ","พ","พฤ","ศ","ส"].map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<first;i++)html+=`<div class="cday empty"></div>`;
  let passCount=0;
  for(let d=1;d<=nDays;d++){const k=dateKey(new Date(y,m,d));const r=days[k];let cls="";
    if(r){if(r.testScore!=null){cls=r.testScore>=0.8?"pass":"fail";if(cls==="pass")passCount++;}else if(Object.keys(r.done||{}).length||r.newWords?.length)cls="study";}
    html+=`<div class="cday ${cls} ${k===tk?"today":""}" title="${r?`เทสต์ ${r.testScore==null?"–":Math.round(r.testScore*100)+"%"} · ทำ ${Object.keys(r.done||{}).length} ช่วง`:""}">${d}</div>`;}
  $("#calendar").innerHTML=html;
  $("#cal-title").textContent+=` · ผ่าน ${passCount} วัน`;
  // กราฟกล่อง Leitner
  const ws=allWords();const counts=[0,0,0,0,0];let unseen=0;
  ws.forEach(w=>{if(!prog[w.id])unseen++;else counts[Math.min(4,getP(w.id).box)]++;});
  const max=Math.max(1,unseen,...counts);
  $("#boxchart").innerHTML=`<div class="boxcol"><div class="boxbar bn" style="height:${unseen/max*100}%"><span>${unseen}</span></div><div class="boxlbl">ยังไม่<br>เริ่ม</div></div>`+
    counts.map((c,i)=>`<div class="boxcol"><div class="boxbar ${i===0?"b0":""}" style="height:${c/max*100}%"><span>${c}</span></div><div class="boxlbl">กล่อง ${i}<br>${i===0?"วันนี้":INTERVALS[i]+" วัน"}</div></div>`).join("");
  // 10 คำผิดบ่อย
  const worst=ws.map(w=>({w,n:getP(w.id).wrong||0})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,10);
  $("#wrongList").innerHTML=worst.length?worst.map((x,i)=>`<li><span class="rank">${i+1}</span><div><span class="word-en">${x.w.w}</span> <span class="m">${x.w.th}</span></div><button class="icon" data-say="${esc(x.w.w)}">🔊</button><span class="cnt">ผิด ${x.n} ครั้ง</span></li>`).join(""):`<li class="stat">ยังไม่มีข้อมูล — ทำมินิเทสต์หรือทบทวนก่อน</li>`;
}

/* ---------- PWA: Service Worker + Install ---------- */
let deferredInstall=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").hidden=false;});
$("#installBtn").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();const {outcome}=await deferredInstall.userChoice;if(outcome==="accepted")toast("ติดตั้งแล้ว — เปิดจากหน้าจอหลักได้เลย");deferredInstall=null;$("#installBtn").hidden=true;};
window.addEventListener("appinstalled",()=>{$("#installBtn").hidden=true;toast("ติดตั้ง WordDeck แล้ว 🎉");});
if(matchMedia("(display-mode: standalone)").matches||navigator.standalone)$("#installBtn").hidden=true;

async function registerSW(){
  if(!("serviceWorker" in navigator))return;
  try{
    swReg=await navigator.serviceWorker.register("./sw.js");
    if(swReg.waiting)offerUpdate(swReg.waiting);
    swReg.addEventListener("updatefound",()=>{const nw=swReg.installing;nw?.addEventListener("statechange",()=>{if(nw.state==="installed"&&navigator.serviceWorker.controller)offerUpdate(nw);});});
    let refreshing=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;refreshing=true;location.reload();});
    navigator.serviceWorker.addEventListener("message",e=>{if(e.data?.type==="OPEN_SESSION")runSession(e.data.key);});
    await navigator.serviceWorker.ready;
    syncScheduleToSW();
    if(notifGranted())setupBackgroundNotifications();
  }catch(e){console.warn("SW register failed",e);}
}
function offerUpdate(worker){toast("มีเวอร์ชันใหม่",{label:"อัปเดต",fn:()=>worker.postMessage({type:"SKIP_WAITING"})});}

/* ---------- INIT ---------- */
(async function init(){
  applyTheme();
  await loadSeed();
  fillCats();renderToday();startFlash();
  registerSW();
  // เปิดจากการแจ้งเตือน / ปฏิทิน: ?session=s0
  const key=new URLSearchParams(location.search).get("session");
  if(key){history.replaceState(null,"",location.pathname);setTimeout(()=>runSession(key),300);}
  checkReminders();
})();
