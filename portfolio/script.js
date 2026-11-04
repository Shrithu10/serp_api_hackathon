(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GH = 'Shrithu10';
const hasGsap = !!(window.gsap && window.ScrollTrigger);
if (hasGsap) { gsap.registerPlugin(ScrollTrigger); document.documentElement.classList.add('gsap'); }

/* ---------------- DATA ---------------- */
const JOBS = [
 {when:'Sep 2026 — Present', role:'Part-time Research Assistant', org:'Independent Research', meta:'Remote · under the guidance of Dr Ranjan Satapathy', pts:[
  'Designing a black-box benchmark to test whether LLM explanations reflect their real decision process — applicable to closed API models (GPT, Claude, Gemini).',
  'Evaluating 7 LLMs on 300 financial news sentences (~70,000 API calls) through a reproducible Python pipeline for running experiments and analysing results.']},
 {when:'Jan 2026 — Jun 2026', role:'Applied Scientist Intern', org:'Amazon', meta:'Bangalore · International Machine Learning (IML) team', pts:[
  'Contributed to Vista, an image similarity and duplicate-detection pipeline for document deduplication, improving latency and performance across millions of document images.',
  'Designed an SOP for image-quality detection: the end-to-end verification workflow and an evaluation of architectural approaches for automated quality assessment.',
  'Analysed accuracy-versus-latency trade-offs across model configurations to support production decisions.',
  'Worked on a router-based approach for cross-token knowledge distillation from a teacher to a student model.'],
  badge:'Cleared the bar (inclined) for Applied Scientist I'},
 {when:'May 2025 — Jan 2026', role:'Generative AI Engineer Intern', org:'Techolution', meta:'Hyderabad · 9 months', pts:[
  'Engineered production speech pipelines (TTS, STT, VAD) with latency reductions across GPU servers and edge devices; R&D on cascaded speech-LLM architectures for real-time voice workflows.',
  'Fine-tuned speech models on Arousal, Valence and Dominance for emotion representation, and built a regression-based emotion classifier.',
  'Designed multi-agent orchestration systems combining multiple LLMs for voice and text pipelines.',
  'Built backend services and APIs for RAG retrieval, LLM interactions, audio processing and multi-agent coordination serving production traffic.',
  'Contributed to an enterprise code-generation platform, designing core AI modules and a voice-driven interface.']}
];
const EARLY = [
 {when:'Sep 2023 — Jul 2024', role:'Research Intern', org:'IIT Hyderabad', txt:'Researched Lean Startup and Design Thinking in early-stage deep-tech ventures. Presented at CEEC 2024, San Diego State University — the youngest presenter at the conference.'},
 {when:'May 2024', role:'Intern', org:'AIC-IIIT Kottayam', txt:'Worked directly with the CEO and helped manage the inSparks pre-incubation programme at the startup incubator.'},
 {when:'Aug 2023 — Nov 2023', role:'Growth Associate', org:'RA Services', txt:'Freelance. Built partnerships and helped run events.'},
 {when:'Sep 2022 — Oct 2022', role:'Corporate Innovation Intern', org:'T-Hub', txt:"Worked under the CIO on corporate innovation at India's largest startup incubator."}
];
const PAPERS = [
 {t:'Thinking Reduces Verbosity Bias in LLM Judges: A Capacity-Dependent Effect', v:'ACL Rolling Review · October 2026', a:'Shritij Reddy Ramidi, Shiva Prabhath Kocherlakota'},
 {t:"Say What You Did: Auditing Whether Tool-Using LLM Agents' Explanations Match Their Action Logs", v:'ACM FAccT 2027 submission', a:'Shritij Reddy Ramidi, Theepireddy Karthik Reddy'},
 {t:'Success-Only Self-Documentation: Agents Learn Tool Contracts the Environment States or Shows', v:'Submitted to TMLR', a:'Shritij Reddy Ramidi'}
];
const PROJECTS = [
 {g:'featured', k:'Multi-agent', n:'AutoDev AI', s:'Plain-English idea → working app', win:'', pts:['9-agent LangGraph system: separate agents for planning, coding, testing, debugging and deployment sharing context across steps.','React Flow dashboard shows each agent live, with token usage and pipeline state.','Retry and fallback logic recovers from agent failures instead of stopping.'], st:['Python','LangGraph','Claude','React Flow'], u:'https://github.com/Shrithu10'},
 {g:'featured', k:'RL · Post-training', n:'GRPO Self-Correction', s:'Teaching small models to fix their own reasoning', big:'+30pp', pts:['Full RLVR pipeline with a 5-part dense reward verifier and reward-hacking protection.','GRPO loop with group sampling, LoRA (~95% fewer trainable parameters), clipped ratio and KL penalty.','+30pp accuracy over the SFT baseline; 0% at 50 tokens scaling to 75% at 400 tokens on GSM8K-style problems.'], st:['Python','PyTorch','LoRA','RL'], u:'https://github.com/Shrithu10'},
 {g:'featured', k:'Multimodal RAG', n:'bhAIya', s:'Question answering over documents and images', pts:['Mistral-7B for text, LLaVA for images, FAISS for retrieval.','Answers show the exact source snippets and image regions used, so they are easy to verify.'], st:['Mistral-7B','LLaVA','FAISS','Streamlit'], u:'https://github.com/Shrithu10'},
 {g:'featured', k:'AI Gateway', n:'AetherProxy', s:'One API for multiple LLM providers', big:'−62%', pts:['Semantic caching with FAISS (<1 ms retrieval): 62% cost reduction on cached queries.','Rate limiting, token budgets, fallback routing and live monitoring for multi-tenant use.'], st:['FastAPI','Redis','FAISS','Python'], u:'https://github.com/Shrithu10'},
 {g:'featured', k:'Security tooling', n:'Policy Hub', s:'Smart India Hackathon 2024 — National Winner', win:'🏆 1st place · 6,000+ teams · NTRO', pts:['Desktop tool to customise Windows Group Policy Objects in line with CIS guidelines, for offline and standalone systems.','Create, edit, import and export GPOs, with CIS docs built into the UI and a compliance testing and auditing flow.'], st:['PowerShell','Python','Electron JS'], u:'https://github.com/Shrithu10'},
 {g:'systems', k:'Systems', n:'Event Streaming System', s:'A Kafka-like platform built from scratch', big:'38K msg/s', pts:['Single-thread NIO event loop, custom binary protocol over raw TCP, append-only log with O(1) offset reads.','Consumer groups, leader-follower replication, high-watermark tracking, leader election.','p50 381 µs, p99 2.1 ms; wakeup batching removed 75% of syscalls.'], st:['Java NIO','TCP'], u:'https://github.com/Shrithu10'},
 {g:'systems', k:'Systems · HFT', n:'Limit Order Book Engine', s:'Matching engine in C++17', big:'25M/s', pts:['~40 ns latency with zero allocation on the hot path.','3-tier occupancy bitmap finds best bid/ask in 3 hardware instructions (4.6× speedup); all core operations O(1).'], st:['C++17'], u:'https://github.com/Shrithu10'},
 {g:'more', k:'In progress', n:'Agentic Video Editor', s:'AI video editor, multi-agent pipeline', pts:['Work in progress.'], st:['TypeScript','Python'], u:'https://github.com/Shrithu10'},
 {g:'more', k:'Legal AI', n:'Judicial Chatbot', s:'Llama 3.1 8B for judiciary queries', pts:['RAG plus QLoRA fine-tuning.'], st:['Llama 3.1','QLoRA','RAG'], u:'https://github.com/Shrithu10'},
 {g:'more', k:'Data', n:'Natural Language to SQL', s:'Text-to-SQL converter', pts:['Ask in English, get a query.'], st:['SQL','LLM'], u:'https://github.com/Shrithu10'},
 {g:'more', k:'Extension', n:'CodeCraft', s:'Chrome extension with AI chat, code analyser and explainer', pts:['AI assistant that lives in the browser.'], st:['JavaScript','Chrome'], u:'https://github.com/Shrithu10'},
 {g:'more', k:'EdTech', n:'AI-Based IT Training', s:'Personalised learning platform', pts:['Adaptive learning paths.'], st:['Python','AI'], u:'https://github.com/Shrithu10'}
];
const ACH = [
 ['🏆','Smart India Hackathon 2024','National Winner — 1st place, NTRO problem statement, 6,000+ teams.'],
 ['★','3× National Hackathon Winner','Three national-level wins, including SIH 2024.'],
 ['◈','Rakathon 2024 Finalist','Top 100 of 6,500 teams.'],
 ['✦','Amazon ML Summer School 2025','Selected.'],
 ['🎤','CEEC 2024 Presenter','San Diego State University — youngest presenter.'],
 ['❖','GirlScript Summer of Code','Mentor and technical reviewer for open-source projects.'],
 ['∞','450+ LeetCode problems','Solved in Java, C++ and Python.']
];
const SKILLS = {
 'Languages':['Python','Java','C++','C','JavaScript','TypeScript','SQL'],
 'AI / ML':['PyTorch','TensorFlow','Hugging Face','LangChain','LangGraph','LLMs','AI agents','RAG','FAISS','LoRA / PEFT','RLHF / GRPO','LLM evaluation','Multimodal AI','Speech (TTS/STT/VAD)','scikit-learn','XGBoost','pandas','NumPy'],
 'Backend & Systems':['REST APIs','FastAPI','Spring Boot','Node.js','Microservices','WebSockets','Distributed systems','Java NIO','TCP protocol design','Apache Kafka'],
 'Frontend':['React','React Flow','Electron JS','HTML','CSS','Streamlit'],
 'Cloud & DevOps':['AWS (EC2, Lambda, S3, DynamoDB, VPC, CloudFront)','Google Cloud (Vertex AI, Cloud Run, BigQuery)','Docker','Kubernetes','CI/CD','Git'],
 'Databases':['PostgreSQL','MongoDB','DynamoDB','Redis','DuckDB','Neo4j','Snowflake','BigQuery'],
 'Core CS':['Data structures & algorithms','System design','Operating systems','Networks','DBMS','OOP']
};

/* ---------------- RENDER ---------------- */
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
$('#timeline').innerHTML = JOBS.map(j => `<article class="job reveal"><div class="when">${j.when}</div><h3>${j.role}</h3><div class="org">${j.org}</div><div class="meta">${j.meta}</div><ul>${j.pts.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>${j.badge?`<span class="badge">✓ ${j.badge}</span>`:''}</article>`).join('');
$('#early').innerHTML = EARLY.map(e => `<div class="eg reveal"><small>${e.when}</small><h4>${e.role}</h4><div class="org">${e.org}</div><p>${esc(e.txt)}</p></div>`).join('');
$('#papers').innerHTML = PAPERS.map(p => `<article class="paper reveal"><span class="tag">Under review</span><h3>${esc(p.t)}</h3><p>${esc(p.a)}</p><div class="venue">${p.v}</div><a href="https://openreview.net/profile?id=~Shritij_Reddy_Ramidi1" target="_blank" rel="noopener">OpenReview ↗</a></article>`).join('');
$('#projects-grid').innerHTML = PROJECTS.map(p => `<article class="card reveal" data-g="${p.g}"><div class="kind">${p.k}</div><h3>${p.n}</h3><div class="sub2">${esc(p.s)}</div>${p.win?`<span class="win">${p.win}</span>`:''}${p.big?`<div class="big-n">${p.big}</div>`:''}<ul>${p.pts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="stack">${p.st.map(x=>`<span>${x}</span>`).join('')}</div><a class="src" href="${p.u}" target="_blank" rel="noopener">GitHub ↗</a></article>`).join('');
$('#ach').innerHTML = ACH.map(a => `<div class="a reveal"><div class="ic">${a[0]}</div><h4>${a[1]}</h4><p>${a[2]}</p></div>`).join('');
$('#skills-grid').innerHTML = Object.entries(SKILLS).map(([k,v]) => `<div class="sk reveal"><h4>${k}</h4><div>${v.map(x=>`<span>${x}</span>`).join('')}</div></div>`).join('');
$('#year').textContent = new Date().getFullYear();

/* project filters */
$('#filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  $$('#filters button').forEach(x => x.classList.toggle('on', x === b));
  const f = b.dataset.f;
  $$('.card').forEach(c => c.classList.toggle('hide', f !== 'all' && c.dataset.g !== f));
  if (hasGsap) ScrollTrigger.refresh();
});

/* ---------------- BOOT ---------------- */
const boot = $('#boot');
const bootLines = [
 'SR-OS v26.11 — initialising…',
 '> loading transformer weights ............ <span class="ok">ok</span>',
 '> mounting /research/papers (3, under review) <span class="ok">ok</span>',
 '> spinning up 9 agents .................... <span class="ok">ok</span>',
 '> warming semantic cache (FAISS) .......... <span class="ok">ok</span>',
 '> fetching github heatmap ................. <span class="ok">ok</span>',
 '',
 'Welcome. Shritij Reddy Ramidi — online.'
];
let booted = false;
function endBoot(){ if (booted) return; booted = true; boot.classList.add('done'); sessionStorage.setItem('booted','1'); document.removeEventListener('keydown', endBoot); boot.removeEventListener('click', endBoot); intro(); }
(function runBoot(){
  if (reduce || sessionStorage.getItem('booted')) { boot.classList.add('done'); booted = true; setTimeout(intro, 50); return; }
  document.addEventListener('keydown', endBoot); boot.addEventListener('click', endBoot);
  const log = $('#boot-log'); let i = 0;
  (function next(){ if (booted) return; if (i >= bootLines.length) return setTimeout(endBoot, 600); log.innerHTML += bootLines[i++] + '\n'; setTimeout(next, 230); })();
})();

/* ---------------- INTRO + SCROLL (GSAP) ---------------- */
let introDone = false;
function intro(){
  if (introDone) return; introDone = true;
  const heroEls = $$('.hero .reveal');
  if (hasGsap && !reduce) {
    gsap.fromTo(heroEls, {opacity:0, y:50, filter:'blur(8px)'}, {opacity:1, y:0, filter:'blur(0px)', duration:1.1, ease:'power3.out', stagger:.12, clearProps:'filter'});
    // hero parallax
    gsap.to('.hero-art', {yPercent:-14, ease:'none', scrollTrigger:{trigger:'.hero', start:'top top', end:'bottom top', scrub:true}});
    gsap.to('.hero-inner', {yPercent:8, opacity:.25, ease:'none', scrollTrigger:{trigger:'.hero', start:'center top', end:'bottom top', scrub:true}});
    // reveals driven by ScrollTrigger
    $$('.reveal').filter(el => !el.closest('.hero')).forEach(el => {
      gsap.fromTo(el, {opacity:0, y:46}, {opacity:1, y:0, duration:1, ease:'power3.out', scrollTrigger:{trigger:el, start:'top 90%', toggleActions:'play none none none'}});
    });
    // timeline line draws with scroll
    gsap.fromTo('.timeline', {'--p':0}, {'--p':1});
    ScrollTrigger.create({trigger:'.timeline', start:'top 70%', end:'bottom 60%', scrub:true,
      onUpdate:s => $('.timeline').style.setProperty('--line', (s.progress*100)+'%')});
    // section titles slide + underline
    $$('.sec-head h2').forEach(h => gsap.from(h, {letterSpacing:'.18em', duration:1.2, ease:'power3.out', scrollTrigger:{trigger:h, start:'top 88%'}}));
    $$('.rule').forEach(r => gsap.from(r, {scaleX:0, transformOrigin:'left', duration:1.4, ease:'power3.out', scrollTrigger:{trigger:r, start:'top 92%'}}));
    // marquee speeds up with scroll velocity
    const tr = gsap.to('.track', {xPercent:-50, ease:'none', duration:40, repeat:-1});
    ScrollTrigger.create({onUpdate:self => { const v = Math.min(Math.abs(self.getVelocity())/400, 8); gsap.to(tr, {timeScale:1+v, duration:.2, overwrite:true, onComplete:()=>gsap.to(tr,{timeScale:1,duration:1})}); }});
    $('.track').style.animation = 'none';
    // upsolve zoom
    gsap.from('.upsolve h2', {scale:.8, opacity:0, duration:1.4, ease:'power4.out', scrollTrigger:{trigger:'.upsolve', start:'top 70%'}});
    // stat counters
    $$('[data-count]').forEach(el => ScrollTrigger.create({trigger:el, start:'top 90%', once:true, onEnter:() => countUp(el)}));
  } else {
    // fallback: IntersectionObserver
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), {threshold:.12});
    $$('.reveal').forEach(el => io.observe(el));
    $$('[data-count]').forEach(el => { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { countUp(el); o.disconnect(); } }); o.observe(el); });
  }
  typeWhoami();
}
function countUp(el){
  const end = +el.dataset.count, suf = el.dataset.suffix ?? '', t0 = performance.now(), d = 1800;
  (function f(t){ const p = Math.min((t-t0)/d,1), e = 1-Math.pow(1-p,4); el.textContent = Math.round(end*e).toLocaleString() + (p>=1?suf:''); if (p<1) requestAnimationFrame(f); })(t0);
}
// timeline line style (uses CSS var)
const st = document.createElement('style'); st.textContent = '.timeline::before{background:linear-gradient(var(--gold) var(--line,100%),var(--line-c,rgba(212,175,55,.12)) var(--line,100%))}'; document.head.appendChild(st);

/* progress bar + active nav */
addEventListener('scroll', () => {
  const h = document.documentElement; $('#progress').style.width = (h.scrollTop/(h.scrollHeight-h.clientHeight)*100) + '%';
}, {passive:true});
const navLinks = $$('.nav nav a');
const secObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }), {rootMargin:'-45% 0px -50% 0px'});
$$('main section[id]').forEach(s => secObs.observe(s));

/* typewriter */
(function(){
  const roles = ['an AI engineer','an LLM researcher','an agent builder','a systems tinkerer','the founder of Upsolve Club','an ex-Amazon applied scientist intern'];
  const el = $('#typed'); let r = 0, c = 0, del = false;
  (function tick(){
    const w = roles[r];
    el.textContent = w.slice(0, c += del ? -1 : 1);
    let d = del ? 35 : 80;
    if (!del && c === w.length) { del = true; d = 1500; }
    else if (del && c === 0) { del = false; r = (r+1) % roles.length; d = 350; }
    setTimeout(tick, d);
  })();
})();

/* whoami terminal */
function typeWhoami(){
  const lines = [
   '<span class="c"># identity</span>',
   '<span class="k">$</span> whoami',
   'shritij_reddy_ramidi',
   '',
   '<span class="k">$</span> cat profile.json',
   '{',
   '  <span class="k">"role"</span>: <span class="s">"AI engineer & researcher"</span>,',
   '  <span class="k">"base"</span>: <span class="s">"Hyderabad, India"</span>,',
   '  <span class="k">"education"</span>: [<span class="s">"BTech CSE, KMIT"</span>,',
   '                <span class="s">"BS Data Science, IIT Madras"</span>],',
   '  <span class="k">"previously"</span>: <span class="s">"Amazon (Applied Scientist Intern)"</span>,',
   '  <span class="k">"papers_under_review"</span>: 3,',
   '  <span class="k">"hackathon_wins"</span>: 3,',
   '  <span class="k">"building"</span>: <span class="s">"Upsolve Club"</span>,',
   '  <span class="k">"open_to_work"</span>: true',
   '}'
  ];
  const pre = $('#whoami'); let i = 0;
  if (reduce) { pre.innerHTML = lines.join('\n'); return; }
  const obs = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; obs.disconnect();
    (function n(){ if (i >= lines.length) { pre.innerHTML += '<span class="caret">█</span>'; return; } pre.innerHTML = lines.slice(0, ++i).join('\n'); setTimeout(n, 140); })();
  }, {threshold:.3});
  obs.observe(pre);
}

/* ---------------- CURSOR, MAGNETIC, TILT ---------------- */
const cur = $('#cursor'); let cx = 0, cy = 0, tx = 0, ty = 0;
addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; cur.classList.add('vis'); });
(function loop(){ cx += (tx-cx)*.2; cy += (ty-cy)*.2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
document.addEventListener('mouseover', e => cur.classList.toggle('big', !!e.target.closest('a,button,[data-magnetic],.card,.paper')));
$$('[data-magnetic]').forEach(el => {
  el.addEventListener('mousemove', e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX-r.left-r.width/2)*.25}px,${(e.clientY-r.top-r.height/2)*.35}px)`; });
  el.addEventListener('mouseleave', () => el.style.transform = '');
});
document.addEventListener('mousemove', e => {
  const t = e.target.closest('.card, .tilt'); if (!t) return;
  const r = t.getBoundingClientRect(), x = (e.clientX-r.left)/r.width, y = (e.clientY-r.top)/r.height;
  t.style.setProperty('--mx', x*100 + '%'); t.style.setProperty('--my', y*100 + '%');
  t.style.setProperty('--rx', ((.5-y)*8) + 'deg'); t.style.setProperty('--ry', ((x-.5)*10) + 'deg');
  if (t.classList.contains('tilt')) t.style.transform = `perspective(900px) rotateX(${(.5-y)*8}deg) rotateY(${(x-.5)*10}deg)`;
});
document.addEventListener('mouseout', e => { const t = e.target.closest('.card, .tilt'); if (t && !t.contains(e.relatedTarget)) { t.style.setProperty('--rx','0deg'); t.style.setProperty('--ry','0deg'); if (t.classList.contains('tilt')) t.style.transform=''; } });

/* ---------------- BACKGROUND CONSTELLATION ---------------- */
(function(){
  if (reduce) return;
  const cv = $('#bg'), ctx = cv.getContext('2d'); let W, H, pts = [], m = {x:-999,y:-999};
  const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; pts = Array.from({length: Math.min(95, Math.floor(W*H/17000))}, () => ({x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-.5)*.35, vy:(Math.random()-.5)*.35})); };
  size(); addEventListener('resize', size);
  addEventListener('mousemove', e => { m.x = e.clientX; m.y = e.clientY; });
  (function draw(){
    ctx.clearRect(0,0,W,H);
    const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#4f7c68';
    ctx.fillStyle = gold; ctx.strokeStyle = gold;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy; if (p.x<0||p.x>W) p.vx*=-1; if (p.y<0||p.y>H) p.vy*=-1;
      const dx = p.x-m.x, dy = p.y-m.y, d = Math.hypot(dx,dy);
      if (d < 140) { p.x += dx/d*1.2; p.y += dy/d*1.2; }
      ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(p.x,p.y,1.4,0,6.283); ctx.fill();
    }
    for (let i = 0; i < pts.length; i++) for (let j = i+1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x-pts[j].x, pts[i].y-pts[j].y);
      if (d < 125) { ctx.globalAlpha = (1-d/125)*.28; ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke(); }
    }
    for (const p of pts) { const d = Math.hypot(p.x-m.x, p.y-m.y); if (d < 170) { ctx.globalAlpha = (1-d/170)*.55; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(m.x,m.y); ctx.stroke(); } }
    requestAnimationFrame(draw);
  })();
})();

/* ---------------- MATRIX (easter egg) ---------------- */
let matrixOn = false;
function matrix(){
  if (matrixOn) return; matrixOn = true;
  const cv = $('#matrix'), ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight;
  const cols = Math.floor(cv.width/16), y = Array(cols).fill(0), chars = 'ΣπλΩ01{}<>#ΔΨ∂∇アイウエオ'; cv.classList.add('on');
  const t0 = performance.now();
  (function f(t){
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() + '1f'; ctx.fillRect(0,0,cv.width,cv.height); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(); ctx.font = '15px JetBrains Mono, monospace';
    y.forEach((v,i) => { ctx.fillText(chars[Math.floor(Math.random()*chars.length)], i*16, v*16); y[i] = v*16 > cv.height && Math.random() > .975 ? 0 : v+1; });
    if (t - t0 < 7000) requestAnimationFrame(f); else { cv.classList.remove('on'); setTimeout(() => { ctx.clearRect(0,0,cv.width,cv.height); matrixOn = false; }, 700); }
  })(t0);
}
const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']; let kp = 0;
addEventListener('keydown', e => { kp = (e.key.toLowerCase() === konami[kp].toLowerCase()) ? kp+1 : 0; if (kp === konami.length) { kp = 0; matrix(); } });

/* ---------------- THEME ---------------- */
const root = document.documentElement;
try { const t = localStorage.getItem('theme'); if (t) root.dataset.theme = t; } catch(e){}
function toggleTheme(){ root.dataset.theme = root.dataset.theme === 'ink' ? 'light' : 'ink'; try { localStorage.setItem('theme', root.dataset.theme); } catch(e){} }
$('#theme-btn').addEventListener('click', toggleTheme);
$('#top-btn').addEventListener('click', () => scrollTo({top:0, behavior:'smooth'}));

/* ---------------- COMMAND PALETTE ---------------- */
const CMDS = [
 ...[['About','#about'],['Experience','#experience'],['Research','#research'],['Projects','#projects'],['GitHub activity','#github'],['Recognition','#recognition'],['Toolkit','#skills'],['Contact','#contact']].map(([n,h]) => ({n:'Go to ' + n, k:'navigate', f:() => { location.hash = h; }})),
 {n:'Open GitHub', k:'link', f:() => open('https://github.com/' + GH)},
 {n:'Open LinkedIn', k:'link', f:() => open('https://www.linkedin.com/in/shritij-reddy/')},
 {n:'Open Upsolve Club', k:'link', f:() => open('https://upsolveclub.com')},
 {n:'Open OpenReview', k:'link', f:() => open('https://openreview.net/profile?id=~Shritij_Reddy_Ramidi1')},
 {n:'Open LeetCode', k:'link', f:() => open('https://leetcode.com/u/shrithu/')},
 {n:'Read on Medium', k:'link', f:() => open('https://shritijreddy.medium.com')},
 {n:'Send an email', k:'action', f:() => location.href = 'mailto:mathians1@gmail.com'},
 {n:'Download résumé', k:'action', f:() => open('assets/resume.pdf')},
 {n:'Toggle light / navy theme', k:'action', f:toggleTheme},
 {n:'Enter the matrix', k:'secret', f:matrix}
];
const pal = $('#palette'), inp = $('#palette-input'), list = $('#palette-list'); let sel = 0, shown = CMDS;
function renderPal(){ list.innerHTML = shown.map((c,i) => `<li class="${i===sel?'sel':''}" data-i="${i}">${c.n}<small>${c.k}</small></li>`).join('') || '<li>No matches</li>'; list.children[sel]?.scrollIntoView({block:'nearest'}); }
function openPal(){ pal.hidden = false; inp.value = ''; shown = CMDS; sel = 0; renderPal(); inp.focus(); }
function closePal(){ pal.hidden = true; }
function run(i){ const c = shown[i]; if (!c) return; closePal(); c.f(); }
$('#palette-btn').addEventListener('click', openPal);
pal.addEventListener('mousedown', e => { if (e.target === pal) closePal(); });
list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) run(+li.dataset.i); });
inp.addEventListener('input', () => { const q = inp.value.toLowerCase(); shown = CMDS.filter(c => c.n.toLowerCase().includes(q) || c.k.includes(q)); sel = 0; renderPal(); });
inp.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { sel = Math.min(sel+1, shown.length-1); renderPal(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel-1, 0); renderPal(); e.preventDefault(); }
  else if (e.key === 'Enter') run(sel);
});
addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : closePal(); }
  else if (e.key === 'Escape') closePal();
});

/* ---------------- GITHUB ---------------- */
const tip = $('#tip');
function renderHeat(days, live){
  const heat = $('#heat'), mon = $('#heat-months'); heat.innerHTML = ''; mon.innerHTML = '';
  const first = new Date(days[0].date + 'T00:00:00'); const pad = first.getDay();
  for (let i = 0; i < pad; i++) heat.appendChild(document.createElement('b')).style.cssText = 'width:13px;height:13px;visibility:hidden';
  let lastM = -1;
  days.forEach((d, i) => {
    const el = document.createElement('i'); el.className = 'l' + d.level; el.style.animationDelay = Math.min(i*2, 1100) + 'ms';
    el.dataset.t = `${d.count} contribution${d.count===1?'':'s'} · ${new Date(d.date+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}`;
    heat.appendChild(el);
    const dt = new Date(d.date + 'T00:00:00');
    if (dt.getDate() <= 7 && dt.getMonth() !== lastM && dt.getDay() === 0 || (i === 0)) { lastM = dt.getMonth(); const s = document.createElement('span'); s.textContent = dt.toLocaleDateString(undefined,{month:'short'}); s.style.left = (Math.floor((i+pad)/7)*17) + 'px'; mon.appendChild(s); }
  });
  $('#heat-note').textContent = live ? `Live from GitHub · @${GH}` : 'Live contribution feed unreachable from this browser — open github.com/'+GH+' to see real activity.';
  const total = days.reduce((a,d) => a+d.count, 0), best = Math.max(...days.map(d => d.count));
  let streak = 0; for (let i = days.length-1; i >= 0; i--) { if (days[i].count > 0) streak++; else if (i !== days.length-1) break; }
  if (live) { $('#gh-total').textContent = total.toLocaleString(); $('#gh-streak').textContent = streak; $('#gh-best').textContent = best; }
}
heatTipInit();
function heatTipInit(){
  document.addEventListener('mouseover', e => { const i = e.target.closest('#heat i'); if (!i) return tip.classList.remove('on'); tip.textContent = i.dataset.t; const r = i.getBoundingClientRect(); tip.style.left = (r.left + r.width/2) + 'px'; tip.style.top = r.top + 'px'; tip.classList.add('on'); });
}
async function loadHeat(){
  try {
    const r = await fetch(`https://github-contributions-api.jogruber.de/v4/${GH}?y=last`); if (!r.ok) throw 0;
    const j = await r.json(); if (!j.contributions?.length) throw 0;
    renderHeat(j.contributions, true);
  } catch {
    const days = []; const d0 = new Date(); d0.setDate(d0.getDate() - 364);
    for (let i = 0; i < 365; i++) { const d = new Date(d0); d.setDate(d0.getDate()+i); days.push({date:d.toISOString().slice(0,10), count:0, level:0}); }
    renderHeat(days, false);
  }
}
const LC = {Python:'#3572A5',JavaScript:'#f1e05a',TypeScript:'#3178c6',Java:'#b07219','C++':'#f34b7d',C:'#888',HTML:'#e34c26',CSS:'#563d7c','Jupyter Notebook':'#DA5B0B',Shell:'#89e051',PowerShell:'#012456'};
async function loadRepos(){
  try {
    const [u, rs] = await Promise.all([fetch(`https://api.github.com/users/${GH}`).then(r => r.json()), fetch(`https://api.github.com/users/${GH}/repos?per_page=100&sort=updated`).then(r => r.json())]);
    if (!Array.isArray(rs)) throw 0;
    const own = rs.filter(r => !r.fork);
    $('#gh-repos').textContent = u.public_repos ?? own.length; $('#gh-stars').textContent = own.reduce((a,r) => a+r.stargazers_count, 0);
    const lc = {}; own.forEach(r => r.language && (lc[r.language] = (lc[r.language]||0)+1)); const tot = Object.values(lc).reduce((a,b)=>a+b,0)||1;
    const ent = Object.entries(lc).sort((a,b)=>b[1]-a[1]);
    $('#langbar').innerHTML = ent.map(([l,n]) => `<i style="flex:${n};background:${LC[l]||'#4f7c68'}" title="${l}"></i>`).join('');
    $('#langbar').insertAdjacentHTML('afterend', `<div class="langkey reveal in">${ent.map(([l,n]) => `<span><b style="background:${LC[l]||'#4f7c68'}"></b>${l} ${Math.round(n/tot*100)}%</span>`).join('')}</div>`);
    $('#repos').innerHTML = own.sort((a,b) => b.stargazers_count-a.stargazers_count || new Date(b.pushed_at)-new Date(a.pushed_at)).slice(0,6).map(r => `<a class="repo" href="${r.html_url}" target="_blank" rel="noopener"><b>${esc(r.name)}</b><p>${esc(r.description||'—')}</p><small>${r.language||''} · ★ ${r.stargazers_count} · ⑂ ${r.forks_count}</small></a>`).join('');
  } catch { $('#langbar').remove(); $('#gh-repos').textContent = $('#gh-stars').textContent = '—'; $('#repos').innerHTML = `<a class="repo" href="https://github.com/${GH}" target="_blank" rel="noopener"><b>github.com/${GH}</b><p>Repositories couldn't be loaded here — open the profile.</p></a>`; }
}
loadHeat(); loadRepos();
})();
