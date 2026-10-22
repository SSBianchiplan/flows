/* GPlanSiS|Flows 2.0 — plataforma: login, documentos no servidor, sincronização,
   presença, configurações com avatar, usuários, permissões e auditoria.
   Carregado depois do editor (index.html); usa as funções e o estado globais dele. */
"use strict";
(function(){
const S={me:null,org:null,ai:false,roles:null,docId:null,ver:0,level:'none',meta:null,savedTxt:'',saving:false,again:false,
  conflict:false,booted:false,poll:null,t:0,retry:0,building:false,viewers:[],docs:[],homeFilter:'recent',cfgSec:'perfil',lastPw:null,deniedAt:0};
const qs=s=>document.querySelector(s);
const has=p=>!!S.me&&S.me.perms.includes(p);
const isAdmin=()=>S.me&&(S.me.role==='master'||S.me.role==='admin');
const LV={none:0,view:1,edit:2,owner:3};
const LVN={owner:'Dono',edit:'Pode editar',view:'Pode ver'};
const VISN={'private':'Privado','org-view':'Organização pode ver','org-edit':'Organização pode editar'};
const PERM_GROUPS=[['Documentos',['docs.view','docs.create','docs.edit','docs.delete','docs.share','docs.publish','docs.all']],
  ['Processos (BPM)',['bpm.simulate','bpm.execute','bpm.tasks','bpm.ai_approve','ai.use']],['Sistema',['export','audit.view','users.manage','system.settings']]];
const COLORS=['#b86e00','#1f6fd1','#2e7d32','#8e24aa','#c62828','#00838f','#5d4037','#3949ab','#d81b60','#455a64'];
const I={
  doc:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',up:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.5 4.5 4"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  sliders:'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',star:'<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  org:'<rect x="3" y="10" width="7" height="11"/><rect x="14" y="3" width="7" height="18"/><path d="M6 14h1M6 17h1M17 7h1M17 11h1M17 15h1"/>',out:'<path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  moon:'<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',back:'<path d="M15 6l-6 6 6 6"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',flow:'<rect x="3" y="4" width="7" height="5" rx="1"/><rect x="14" y="15" width="7" height="5" rx="1"/><path d="M6.5 9v3.5h11V15"/>'};
const ic=(k,cls)=>`<svg class="${cls||'pl-ico'}" viewBox="0 0 24 24" aria-hidden="true">${I[k]||''}</svg>`;
const initials=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
function av(u,sz){sz=sz||28;if(!u)return'';const st=`width:${sz}px;height:${sz}px;font-size:${Math.round(sz*.38)}px`;
  return u.avatar?`<img class="pl-av" src="${esc(u.avatar)}" alt="" style="${st}" title="${esc(u.name)}">`:`<span class="pl-av" style="${st};background:${esc(u.color||'#888')}" title="${esc(u.name)}" aria-hidden="true">${esc(initials(u.name))}</span>`}
const fmtD=t=>t?new Date(t*1000).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'–';
function rel(t){if(!t)return'nunca';const s=Date.now()/1000-t;if(s<45)return'agora';if(s<3600)return`há ${Math.max(1,Math.floor(s/60))} min`;if(s<86400)return`há ${Math.floor(s/3600)} h`;if(s<86400*7)return`há ${Math.floor(s/86400)} d`;return new Date(t*1000).toLocaleDateString('pt-BR')}
const fmtB=b=>b<1024?b+' B':b<1048576?Math.round(b/1024)+' KB':(b/1048576).toFixed(1)+' MB';
const roleName=r=>S.roles&&S.roles[r]?S.roles[r].n:r;

/* ---------------- API ---------------- */
async function api(method,path,data){
  const o={method,headers:{'X-Requested-With':'flows'},credentials:'same-origin'};
  if(data!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(data)}
  let r;try{r=await fetch(path,o)}catch(e){const er=new Error('Sem conexão com o servidor');er.status=0;throw er}
  let j=null;if((r.headers.get('content-type')||'').includes('json')){try{j=await r.json()}catch(e){}}
  if(!r.ok){const er=new Error((j&&typeof j.detail==='string'&&j.detail)||`Erro ${r.status}`);er.status=r.status;er.data=j;
    if(r.status===401&&!path.startsWith('/api/auth/'))sessionLost();
    if(r.status===428)showForcePw();
    throw er}
  return j}
const safe=fn=>async(...a)=>{try{return await fn(...a)}catch(e){toast(e.message||String(e),3600);return false}};

/* ---------------- camadas ---------------- */
function layer(id){let el=document.getElementById(id);if(!el){el=document.createElement('div');el.id=id;el.className='pl-layer';document.body.appendChild(el)}return el}
function showLayer(id){['pl-auth','pl-home','pl-cfg'].forEach(x=>{const el=document.getElementById(x);if(el)el.classList.toggle('on',x===id)});if(id)stopPoll()}
const unboot=()=>document.documentElement.classList.remove('pl-boot');
function hideLayers(){unboot();showLayer(null)}
const go=h=>{if(location.hash===h)route();else location.hash=h};

/* ---------------- login ---------------- */
const HERO=`<section class="pl-hero"><div style="position:relative;z-index:1">
  <div style="font-weight:600;font-size:16px;margin-bottom:56px">GPlanSiS<span style="color:#f6a709">|Flows</span></div>
  <h1>Processos que se<br><span>desenham, simulam<br>e executam.</span></h1>
  <p>Diagramação BPMN 2.0, simulação de eventos discretos, execução com caixa de tarefas e auditoria encadeada. A IA propõe; o humano decide.</p>
  <ul><li>Documentos compartilhados com controle de versão</li><li>Papéis e permissões por usuário</li><li>Trilha de auditoria SHA-256 no servidor</li></ul></div>
  <svg class="flow" viewBox="0 0 620 240" aria-hidden="true">
   <path id="plfp" class="e" d="M40 120H130M210 120H290M370 120H420L460 80V60H530M460 120V170H530"/>
   <path class="e on" d="M40 120H130M210 120H290M370 120H420" stroke-dasharray="6 6"><animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.2s" repeatCount="indefinite"/></path>
   <circle class="n" cx="28" cy="120" r="14"/><rect class="n" x="130" y="94" width="80" height="52" rx="8"/><text class="t" x="170" y="124" text-anchor="middle">Pedido</text>
   <rect class="n" x="290" y="94" width="80" height="52" rx="8"/><text class="t" x="330" y="124" text-anchor="middle">Crédito</text>
   <path class="n" d="M440 98l22 22-22 22-22-22z"/><rect class="n" x="530" y="36" width="80" height="48" rx="8"/><text class="t" x="570" y="64" text-anchor="middle">Produzir</text>
   <rect class="n" x="530" y="146" width="80" height="48" rx="8"/><text class="t" x="570" y="174" text-anchor="middle">Recusar</text>
   <circle class="tok" r="6"><animateMotion dur="4s" repeatCount="indefinite" path="M28 120H170H330H440L462 98V60H570"/></circle></svg>
  <small style="color:#6b747a;position:relative">© GPlanSiS|Group · flows.gplansis.com</small></section>`;
function authShell(card){const L=layer('pl-auth');L.classList.add('pl-layer');L.innerHTML=`<div class="pl-auth">${HERO}<section class="pl-auth-form"><div class="pl-card">${card}</div></section></div>`;showLayer('pl-auth');document.documentElement.classList.remove('pl-boot');
  L.querySelectorAll('[data-eye]').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input');i.type=i.type==='password'?'text':'password';b.setAttribute('aria-label',i.type==='password'?'Mostrar senha':'Ocultar senha')});return L}
const pwInput=(id,ac,label)=>`<div class="pl-field"><label for="${id}">${label}</label><div class="pl-pw"><input class="pl-in" id="${id}" type="password" autocomplete="${ac}" required><button type="button" data-eye aria-label="Mostrar senha">${ic('eye')}</button></div></div>`;
function showLogin(msg){stopPoll();
  const L=authShell(`<h2>Entrar</h2><p class="sub">Acesse com seu e-mail e senha.</p>
   <form id="plLogin" novalidate><div class="pl-field"><label for="plEmail">E-mail</label><input class="pl-in" id="plEmail" type="email" autocomplete="username" inputmode="email" required></div>
   ${pwInput('plPass','current-password','Senha')}<div class="pl-err" id="plErr" role="alert">${esc(msg||'')}</div>
   <button class="pl-btn pri" type="submit" id="plGo">Entrar</button></form>
   <div class="pl-foot"><span>GPlanSiS|Flows 2.0</span><span>Esqueceu a senha? Fale com o administrador.</span></div>`);
  const em=L.querySelector('#plEmail');try{em.value=localStorage.getItem('flows-last-email')||''}catch(e){}
  (em.value?L.querySelector('#plPass'):em).focus();
  L.querySelector('#plLogin').onsubmit=async e=>{e.preventDefault();const email=em.value.trim(),pw=L.querySelector('#plPass').value;const err=L.querySelector('#plErr'),b=L.querySelector('#plGo');
    if(!email||!pw){err.textContent='Informe e-mail e senha.';return}
    b.disabled=true;b.innerHTML='<span class="pl-spin"></span> Entrando…';err.textContent='';
    try{const p=await api('POST','/api/auth/login',{email,password:pw});try{localStorage.setItem('flows-last-email',email)}catch(x){}S.lastPw=pw;await onMe(p)}
    catch(x){err.textContent=x.message;b.disabled=false;b.textContent='Entrar';L.querySelector('#plPass').select()}}}
function pwScore(pw){let k=0;[/[a-z]/,/[A-Z]/,/\d/,/[^\w]/].forEach(r=>{if(r.test(pw))k++});return{k,len:pw.length}}
function pwMeter(root,inp,conf,min){const upd=()=>{const v=inp.value,s=pwScore(v);const pct=Math.min(100,(Math.min(v.length,min+6)/(min+6))*60+s.k*10);const bar=root.querySelector('.pl-meter i');
    bar.style.width=pct+'%';bar.style.background=pct<55?'var(--danger)':pct<80?'var(--warn)':'var(--ok)';
    const R=root.querySelectorAll('.pl-rules li');R[0].classList.toggle('ok',v.length>=min);R[1].classList.toggle('ok',s.k>=3);if(R[2])R[2].classList.toggle('ok',!!v&&conf&&v===conf.value)};
  inp.addEventListener('input',upd);conf&&conf.addEventListener('input',upd);upd()}
const pwRules=(min,conf)=>`<div class="pl-meter"><i></i></div><ul class="pl-rules"><li>Ao menos ${min} caracteres</li><li>Três tipos: minúsculas, maiúsculas, números, símbolos</li>${conf?'<li>Confirmação igual</li>':''}</ul>`;
function showForcePw(){if(!S.me)return;const min=S.org?.pw_min||10;
  const L=authShell(`<h2>Defina sua senha</h2><p class="sub">Olá, ${esc(S.me.name.split(' ')[0])}. Por segurança, troque a senha provisória antes de continuar.</p>
   <form id="plFpw" novalidate>${S.lastPw?'':pwInput('plCur','current-password','Senha atual (provisória)')}
   ${pwInput('plNew','new-password','Nova senha')}${pwRules(min,true)}<div style="height:10px"></div>${pwInput('plNew2','new-password','Confirme a nova senha')}
   <div class="pl-err" id="plErr" role="alert"></div><button class="pl-btn pri" type="submit">Salvar e continuar</button></form>
   <div class="pl-foot"><span>${esc(S.me.email)}</span><a href="#" id="plOut" style="color:var(--muted)">Sair</a></div>`);
  pwMeter(L,L.querySelector('#plNew'),L.querySelector('#plNew2'),min);L.querySelector('#plOut').onclick=e=>{e.preventDefault();logout()};
  (L.querySelector('#plCur')||L.querySelector('#plNew')).focus();
  L.querySelector('#plFpw').onsubmit=async e=>{e.preventDefault();const err=L.querySelector('#plErr');const cur=S.lastPw||L.querySelector('#plCur').value;const n=L.querySelector('#plNew').value;
    if(n!==L.querySelector('#plNew2').value){err.textContent='A confirmação não confere.';return}
    try{await api('POST','/api/me/password',{current:cur,new:n});S.lastPw=null;const p=await api('GET','/api/me');toast('Senha definida. Bem-vindo!');await onMe(p)}catch(x){err.textContent=x.message}}}
function sessionLost(){if(!S.me)return;storePending();S.me=null;showLogin('Sua sessão expirou. Entre novamente.')}
async function logout(){if(S.docId&&dirty())await flush();try{await api('POST','/api/auth/logout',{})}catch(e){}S.me=null;S.docId=null;stopPoll();location.hash='';showLogin('Você saiu do sistema.')}

/* ---------------- sessão ---------------- */
async function onMe(p){S.me=p.user;S.org=p.org;S.ai=p.ai;S.roles=p.roles;unboot();
  if(S.me.must_change)return showForcePw();
  S.lastPw=null;applyPrefs();buildChrome();setupAI();
  await route(true)}
function applyPrefs(){const p=S.me.prefs||{};const r=document.documentElement;
  if(p.theme==='light'||p.theme==='dark')r.dataset.theme=p.theme;else if(p.theme==='system')delete r.dataset.theme;
  if(p.grid!=null)OPT.grid=!!p.grid;if(p.snap!=null)OPT.snap=!!p.snap;if(p.mini!=null)OPT.mini=!!p.mini;if(p.guides!=null)OPT.guides=!!p.guides}
let prefT=0;function savePref(k,v){if(!S.me)return;S.me.prefs=S.me.prefs||{};S.me.prefs[k]=v;clearTimeout(prefT);prefT=setTimeout(()=>api('PATCH','/api/me',{prefs:S.me.prefs}).catch(()=>{}),700)}

/* ---------------- barra do editor ---------------- */
function buildChrome(){
  if(!qs('#plSync')){qs('#fname').insertAdjacentHTML('afterend','<button class="pl-sync" id="plSync" type="button"><i></i><span>Salvo</span></button>');
    qs('#topbtns').insertAdjacentHTML('afterbegin','<div class="pl-viewers" id="plViewers" aria-label="Quem está vendo"></div>');
    qs('#topbtns').insertAdjacentHTML('beforeend','<button class="pl-mebtn" id="plMe" aria-label="Conta e configurações"></button>');
    qs('#brand').title='Central de documentos';qs('#brand').onclick=()=>go('#/docs');
    qs('#plSync').onclick=()=>{if(S.conflict)return conflict(null);if(qs('#plSync').classList.contains('offline'))return flush();if(S.docId)versionsDlg(S.docId)};
    qs('#plMe').onclick=e=>{e.stopPropagation();meMenu(e.currentTarget)};
    document.addEventListener('pointerdown',e=>{const p=qs('#plPop');if(p&&!e.target.closest('#plPop')&&!e.target.closest('.pl-mebtn'))p.classList.remove('on')});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=qs('#plPop');if(p)p.classList.remove('on')}});
    qs('#bFile').onclick=fileMenu;qs('#fileIn').onchange=onFileIn;
    window.addEventListener('beforeunload',e=>{if(S.docId&&dirty()){storePending();e.preventDefault();e.returnValue=''}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.docId&&S.poll)poll()});
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&S.docId){flush()}},true);
    window.addEventListener('hashchange',()=>route())}
  document.querySelectorAll('.pl-mebtn').forEach(b=>b.innerHTML=av(S.me,30))}
function meMenu(anchor){let p=qs('#plPop');if(!p){p=document.createElement('div');p.id='plPop';p.className='pl-pop';document.body.appendChild(p)}
  if(p.classList.contains('on')){p.classList.remove('on');return}
  const admin=has('users.manage')||has('system.settings')||has('audit.view');
  p.innerHTML=`<div class="hd">${av(S.me,40)}<div style="min-width:0"><b>${esc(S.me.name)}</b><small>${esc(S.me.email)}</small><small><span class="pl-chip acc">${esc(roleName(S.me.role))}</span></small></div></div>
   <button data-m="docs">${ic('doc')}Central de documentos</button><button data-m="perfil">${ic('user')}Meu perfil e avatar</button><button data-m="seguranca">${ic('lock')}Segurança e senha</button><button data-m="preferencias">${ic('sliders')}Preferências</button>
   ${admin?`<hr><button data-m="${has('users.manage')?'usuarios':has('audit.view')?'auditoria':'sistema'}">${ic('shield')}Administração</button>`:''}
   <hr><button data-m="theme">${ic('moon')}Alternar tema claro/escuro</button><button data-m="out">${ic('out')}Sair</button>`;
  const r=anchor.getBoundingClientRect();p.classList.add('on');p.style.top=(r.bottom+6)+'px';p.style.left=Math.max(8,Math.min(r.right-p.offsetWidth,innerWidth-p.offsetWidth-8))+'px';
  p.onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;p.classList.remove('on');const m=b.dataset.m;
    if(m==='docs')go('#/docs');else if(m==='out')logout();else if(m==='theme'){toggleUiTheme();savePref('theme',document.documentElement.dataset.theme)}else go('#/config/'+m)}}
function renderViewers(){const el=qs('#plViewers');if(!el)return;const V=S.viewers||[];el.innerHTML=V.slice(0,4).map(u=>av(u,24)).join('')+(V.length>4?`<span class="pl-chip">+${V.length-4}</span>`:'');el.title=V.length?'Também neste documento: '+V.map(u=>u.name).join(', '):''}
function setSync(st){const el=qs('#plSync');if(!el)return;if(!st)st=S.conflict?'conflict':!PL.canModel()?'ro':'saved';
  const L={saved:'Salvo',saving:'Salvando…',offline:'Sem conexão · tentando',conflict:'Conflito de edição',denied:'Sem permissão',ro:'Somente leitura'};
  el.className='pl-sync '+st;el.querySelector('span').textContent=L[st]||st;
  el.title=S.meta?`Versão ${S.ver} · ${LVN[S.level]||''}${S.meta.updated_by?' · última gravação por '+S.meta.updated_by.name:''} — clique para o histórico`:''}

/* ---------------- permissões no editor ---------------- */
window.PL={
  me:()=>S.me||{name:''},
  canModel:()=>S.building||(!!S.docId&&LV[S.level]>=2&&has('docs.edit')),
  denied(){const t=Date.now();if(t-S.deniedAt>2500){S.deniedAt=t;toast(LV[S.level]>=2?'Seu perfil não tem permissão para editar diagramas':'Somente leitura: você pode ver, mas não editar este documento',2800)}},
  gate(p){if(p==='docs.publish'&&LV[S.level]<2){toast('Publicar exige acesso de edição ao documento');return false}
    if(has(p))return true;toast('Sem permissão: '+(PERM_LABEL[p]||p),3000);return false},
  execGate(e){const x=e.target.closest('[data-x]'),w=e.target.closest('[data-wa]');
    if(x&&['new','cancel','clear'].includes(x.dataset.x))return PL.gate('bpm.execute');
    if(w)return PL.gate(['aiok','aino'].includes(w.dataset.wa)?'bpm.ai_approve':'bpm.tasks');return true},
  api,get state(){return S}};
const PERM_LABEL={'docs.view':'ver documentos','docs.create':'criar documentos','docs.edit':'editar diagramas','docs.delete':'excluir documentos','docs.share':'compartilhar','docs.publish':'publicar versões',
  'docs.all':'todos os documentos','bpm.simulate':'simular processos','bpm.execute':'iniciar/cancelar instâncias','bpm.tasks':'concluir tarefas','bpm.ai_approve':'aprovar propostas de IA','ai.use':'usar IA',
  export:'exportar arquivos','audit.view':'ver auditoria','users.manage':'gerenciar usuários','system.settings':'configurar o sistema'};
function applyRO(){const ro=!PL.canModel();document.body.classList.toggle('pl-ro',ro);const m=qs('#main');if(ro)m.classList.add('nostencil');else if(innerWidth>=860)m.classList.remove('nostencil');setSync()}

/* ---------------- IA pelo servidor ---------------- */
function setupAI(){if(!(S.ai&&has('ai.use'))){SAMPLE=null;return}
  const fn=async(prompt,opts)=>{opts=opts||{};const r=await fetch('/api/ai/sample',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'flows'},body:JSON.stringify({prompt,tier:opts.modelTier||'default'})});
    if(!r.ok){let m='IA indisponível';try{m=(await r.json()).detail||m}catch(e){}const er=new Error(m);er.code=r.status;throw er}
    const rd=r.body.getReader(),dec=new TextDecoder();let text='';
    for(;;){const{value,done}=await rd.read();if(done)break;text+=dec.decode(value,{stream:true});const k=text.indexOf('\u0000ERRO:');if(k>=0){const er=new Error('falha na IA ('+text.slice(k+6).trim()+')');er.code='ai';throw er}opts.onText&&opts.onText({text})}
    return{text}};
  fn.json=async(prompt,opts)=>{const r=await fn(prompt+'\n\nResponda apenas com o JSON, sem cercas de código nem comentários.',opts);const m=r.text.match(/\{[\s\S]*\}/);if(!m)throw new Error('a resposta não trouxe JSON');return JSON.parse(m[0])};
  SAMPLE=fn;try{renderRibbon()}catch(e){}}

/* ---------------- documento aberto: carga, gravação, conflitos ---------------- */
function snap(){if(!doc)return'';const{cur,...rest}=doc;return JSON.stringify(rest)}
const dirty=()=>!!S.docId&&!!doc&&snap()!==S.savedTxt;
function normalize(d){d=SAN.doc(d);d.res=d.res||{};d.inst=d.inst||[];d.audit=d.audit||[];d.work=d.work||[];d.mail=d.mail||{};d.cur=clamp(d.cur||0,0,d.pages.length-1);return d}
function loadIntoEditor(r){S.docId=r.id;S.ver=r.ver;S.level=r.level;S.meta=r;S.conflict=false;S.retry=0;hideLayers();
  EX.who=S.me.name;try{localStorage.setItem('gplansis-flows-who',S.me.name)}catch(e){}
  if(!S.booted){S.booted=true;init(normalize(r.data))}else{doc=normalize(r.data);undoS=[];redoS=[];SEL.clear();boot()}
  S.savedTxt=snap();applyRO();document.title=`${doc.name} · GPlanSiS|Flows`;startPoll();checkPending()}
async function openDoc(id){if(S.docId===id&&S.booted&&doc){hideLayers();applyRO();startPoll();document.title=`${doc.name} · GPlanSiS|Flows`;return}
  if(S.docId&&dirty())await flush();
  let r;try{r=await api('GET','/api/docs/'+encodeURIComponent(id))}catch(e){if(e.status!==401&&e.status!==428){toast(e.message,3000);go('#/docs')}return}
  loadIntoEditor(r);savePref('lastDoc',id)}
autosave=function(){if(!S.docId)return;clearTimeout(S.t);S.t=setTimeout(flush,800)};
async function flush(){clearTimeout(S.t);if(!S.docId||S.conflict||!doc)return true;const txt=snap();if(txt===S.savedTxt){setSync();return true}
  if(S.saving){S.again=true;return false}
  S.saving=true;setSync('saving');const id=S.docId;
  try{const r=await api('PUT','/api/docs/'+id,{base:S.ver,data:doc});if(id!==S.docId)return true;S.ver=r.ver;S.savedTxt=adoptAudit(r,txt);S.retry=0;S.meta.updated_by=S.me;clearPending(id);setSync();return true}
  catch(e){if(id!==S.docId)return false;
    if(e.status===409)conflict(e.data);
    else if(e.status===403){setSync('denied');toast(e.message,4200);await reloadRemote()}
    else if(e.status===413){setSync('offline');openModal('Documento grande demais',`<p>${esc(e.message)}</p><p class="small">Use BPM › Executar › Limpar instâncias, ou divida o documento.</p>`)}
    else if(e.status===401||e.status===428)storePending();
    else{setSync('offline');storePending();S.retry=Math.min(S.retry+1,6);S.t=setTimeout(flush,1000*2**S.retry)}
    return false}
  finally{S.saving=false;if(S.again){S.again=false;autosave()}}}
/* A trilha de auditoria do documento é gerada no servidor: ele recarimba os registros novos (sequência, horário, autor,
   encadeamento) e devolve a trilha canônica. Registros feitos durante a gravação são reencadeados sobre ela. */
function adoptAudit(r,txt){if(!r||!Array.isArray(r.audit)||!doc)return txt;const sent=JSON.parse(txt);const known=new Set((sent.audit||[]).map(e=>e.hash));
  const extra=(doc.audit||[]).filter(e=>!known.has(e.hash));const A=SAN.doc({pages:[newPage()],audit:deep(r.audit)}).audit;sent.audit=deep(A);
  for(const e of extra){const prev=A.length?A[A.length-1].hash:'0'.repeat(64);const n={seq:(A.length?A[A.length-1].seq:0)+1,at:e.at,ev:e.ev,data:e.data};const h=sha256(prev+JSON.stringify(n));n.prev=prev;n.hash=h;A.push(n)}
  doc.audit=A;if(qs('#console').classList.contains('open'))try{renderConsole()}catch(e){}return JSON.stringify(sent)}
function renderAll(){renderRibbon();renderStencil();renderPages();refreshProps();render();if(qs('#console').classList.contains('open'))renderConsole()}
async function reloadRemote(by){if(!S.docId)return;let r;try{r=await api('GET','/api/docs/'+S.docId)}catch(e){return}
  const cur=doc?doc.cur:0;doc=normalize(r.data);doc.cur=clamp(cur,0,doc.pages.length-1);S.ver=r.ver;S.level=r.level;S.meta=r;S.conflict=false;
  undoS=[];redoS=[];SEL.clear();renderAll();S.savedTxt=snap();applyRO();if(by)toast(`Atualizado por ${by.name}`)}
function conflict(info){S.conflict=true;setSync('conflict');storePending();info=info||S.lastConflict||{};S.lastConflict=info;
  const who=info.updated_by?info.updated_by.name:'Outra pessoa';const canForce=S.level==='owner'||has('docs.all');
  openModal('Conflito de edição',`<p><b>${esc(who)}</b> gravou uma versão mais nova deste documento${info.ver?` (v${info.ver})`:''} enquanto você tinha alterações não salvas.</p>
    <div class="gate">Escolha o destino das suas alterações. Nada é descartado sem a sua confirmação.</div>`,
   [{t:'Descartar as minhas e recarregar',fn:safe(async()=>{clearPending(S.docId);await reloadRemote()})},
    {t:'Salvar as minhas como cópia',cls:'pri',fn:safe(async()=>{const d=deep(doc);d.name=(d.name+' (minha versão)').slice(0,160);const r=await api('POST','/api/docs',{data:d,origin:'Cópia por conflito'});clearPending(S.docId);S.conflict=false;S.docId=null;go('#/d/'+r.id)})},
    ...(canForce?[{t:'Sobrescrever',cls:'dng',fn:safe(async()=>{if(!confirm('Gravar a sua versão por cima da versão mais nova?'))return false;const txt=snap();const r=await api('PUT','/api/docs/'+S.docId,{base:S.ver,data:doc,force:true});S.ver=r.ver;S.savedTxt=adoptAudit(r,txt);S.conflict=false;clearPending(S.docId);setSync();toast('Sua versão foi gravada')})}]:[])])}
function startPoll(){stopPoll();S.poll=setInterval(poll,4000);poll()}
function stopPoll(){clearInterval(S.poll);S.poll=null}
let polling=false;
async function poll(){if(!S.docId||polling||(document.hidden&&Math.random()<.75))return;polling=true;
  try{const h=await api('GET',`/api/docs/${S.docId}/head`);S.viewers=h.viewers;renderViewers();
    if(h.deleted){stopPoll();toast('Este documento foi movido para a lixeira',4000);S.docId=null;go('#/docs');return}
    if(h.level!==S.level){S.level=h.level;applyRO()}
    if(h.ver>S.ver&&!S.saving&&!S.conflict){if(!dirty())await reloadRemote(h.updated_by);else conflict(h)}}
  catch(e){if(e.status===404||e.status===403){stopPoll();toast('Seu acesso a este documento foi removido',4000);S.docId=null;go('#/docs')}}
  finally{polling=false}}
/* recuperação local de alterações não gravadas */
const pk=id=>'flows-pending-'+id;
function storePending(){if(!S.docId||!doc||!dirty())return;try{localStorage.setItem(pk(S.docId),JSON.stringify({base:S.ver,at:Date.now(),data:doc}))}catch(e){}}
function clearPending(id){try{localStorage.removeItem(pk(id))}catch(e){}}
function checkPending(){let p=null;try{p=JSON.parse(localStorage.getItem(pk(S.docId))||'null')}catch(e){}if(!p||!p.data)return;
  const when=new Date(p.at).toLocaleString('pt-BR');const same=p.base===S.ver;
  openModal('Alterações não gravadas',`<p>Existem alterações deste documento feitas em ${esc(when)} que não chegaram ao servidor.</p>${same?'':'<div class="gate">O documento mudou no servidor desde então. Recuperar cria uma cópia para você comparar.</div>'}`,
   [{t:'Descartar',fn:()=>clearPending(S.docId)},{t:same?'Recuperar alterações':'Recuperar como cópia',cls:'pri',fn:safe(async()=>{
     if(same&&PL.canModel()){doc=normalize(p.data);renderAll();clearPending(S.docId);await flush();toast('Alterações recuperadas')}
     else{p.data.name=(p.data.name+' (recuperado)').slice(0,160);const r=await api('POST','/api/docs',{data:p.data,origin:'Recuperação local'});clearPending(S.docId);go('#/d/'+r.id)}})}])}

/* ---------------- menu Arquivo ---------------- */
function fileMenu(e){const r=e.currentTarget.getBoundingClientRect();const owner=S.level==='owner'||has('docs.all');
  const it=[['Central de documentos',()=>go('#/docs')]];
  if(has('docs.create'))it.push(['Novo documento…',()=>newDocDlg()],['Duplicar este documento',safe(dupDoc.bind(null,S.docId))]);
  if(PL.canModel())it.push(['Renomear…',()=>renameDlg(S.docId,doc.name)]);
  if(has('docs.share')&&owner)it.push(['Compartilhar…',()=>shareDlg(S.docId)]);
  it.push(['Histórico de versões…',()=>versionsDlg(S.docId)]);
  if(LV[S.level]>=2)it.push(['Salvar versão nomeada…',()=>namedVersionDlg()]);
  it.push('-');
  if(has('docs.create')||PL.canModel())it.push(['Importar arquivo (JSON como documento, BPMN como página)…',()=>qs('#fileIn').click()]);
  if(has('export'))it.push(['Baixar .flows.json',saveJSONFile,'Ctrl+S'],['Exportar página em SVG',exportSVG],['Exportar página em PNG',exportPNG],['Exportar BPMN 2.0 (.bpmn)',exportBPMN],['Exportar DXF para o GPlanSiS|Drawings',exportDXF],['Relatório de dados (CSV)',dataReport]);
  it.push('-',['Configurações',()=>go('#/config/perfil')],['Atalhos de teclado',showKeys]);
  openMenu(it,r.right-300,r.bottom+4)}
async function onFileIn(e){const f=e.target.files[0];e.target.value='';if(!f)return;const t=await f.text();
  try{if(/^\s*</.test(t)){if(!PL.canModel())return PL.denied();const pg=importBPMN(t,f.name.replace(/\.[^.]+$/,''));rec();doc.pages.push(pg);gotoPage(doc.pages.length-1);autosave();toast('BPMN importado como nova página');return}
    await importAsDoc(f.name,t)}catch(err){openModal('Não foi possível abrir',`<p>${esc(err.message)}</p>`)}}
async function importAsDoc(name,t){if(!PL.gate('docs.create'))return;let d;
  if(/^\s*</.test(t)){S.building=true;try{d=newDoc();d.name=name.replace(/\.[^.]+$/,'');const saved=doc;doc=d;try{d.pages=[importBPMN(t,d.name)]}finally{doc=saved}}finally{S.building=false}}
  else{d=JSON.parse(t);if(!d||!Array.isArray(d.pages)||!d.pages.length)throw new Error('O arquivo não é um documento do GPlanSiS|Flows.')}
  const r=await api('POST','/api/docs',{data:d,origin:'Importação de '+name});toast('Documento importado');go('#/d/'+r.id)}
function buildDoc(kind,name){S.building=true;try{let d;if(kind==='examples'){d=demoDoc()}else{d=newDoc()}d.name=name||d.name;return normalize(d)}finally{S.building=false}}
function newDocDlg(){if(!PL.gate('docs.create'))return;
  openModal('Novo documento',`<div class="pl-field"><label for="plNdName">Nome</label><input class="pl-in" id="plNdName" placeholder="Ex.: Compras · requisição a pagamento"></div>
   <div class="pl-field"><label>Começar com</label><label class="pl-switch" style="gap:8px"><input type="radio" name="plNdK" value="blank" checked style="appearance:auto;width:auto;height:auto;background:none"> Página em branco</label>
   <label class="pl-switch" style="gap:8px"><input type="radio" name="plNdK" value="examples" style="appearance:auto;width:auto;height:auto;background:none"> Exemplos prontos (O2C, MES, atendimento, arquitetura IT/OT)</label></div>
   <div class="pl-field"><label for="plNdVis">Visibilidade</label><select class="pl-in" id="plNdVis">${Object.entries(VISN).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>`,
   [{t:'Cancelar'},{t:'Criar documento',cls:'pri',fn:safe(async()=>{const k=document.querySelector('[name=plNdK]:checked').value;const nm=qs('#plNdName').value.trim()||(k==='examples'?'GPlanSiS|Flows · exemplos':'Sem título');
     const r=await api('POST','/api/docs',{data:buildDoc(k,nm),vis:qs('#plNdVis').value,origin:k==='examples'?'Exemplos':'Em branco'});go('#/d/'+r.id)})}]);
  setTimeout(()=>qs('#plNdName')?.focus(),50)}
async function dupDoc(id){const r=await api('POST',`/api/docs/${id}/duplicate`,{});toast('Cópia criada');go('#/d/'+r.id)}
function renameDlg(id,cur){openModal('Renomear documento',`<div class="pl-field"><label for="plRn">Nome</label><input class="pl-in" id="plRn" value="${esc(cur)}"></div>`,
  [{t:'Cancelar'},{t:'Salvar',cls:'pri',fn:safe(async()=>{const n=qs('#plRn').value.trim();if(!n)return false;
    if(id===S.docId){doc.name=n;renderPages();document.title=`${n} · GPlanSiS|Flows`;await flush()}else{await api('PATCH',`/api/docs/${id}/meta`,{name:n})}toast('Documento renomeado');if(qs('#pl-home.on'))loadHome()})}]);setTimeout(()=>{const i=qs('#plRn');i&&(i.focus(),i.select())},50)}
function namedVersionDlg(){openModal('Salvar versão nomeada',`<p class="small">Cria um ponto de restauração que não é apagado pela rotação automática.</p><div class="pl-field"><label for="plVn">Descrição</label><input class="pl-in" id="plVn" placeholder="Ex.: Antes da revisão com a engenharia"></div>`,
  [{t:'Cancelar'},{t:'Salvar versão',cls:'pri',fn:safe(async()=>{await flush();await api('POST',`/api/docs/${S.docId}/versions`,{note:qs('#plVn').value});toast('Versão salva')})}])}

/* ---------------- compartilhar ---------------- */
async function shareDlg(id){let A,dir;try{[A,dir]=await Promise.all([api('GET',`/api/docs/${id}/acl`),api('GET','/api/directory')])}catch(e){return toast(e.message)}
  let acl=A.acl.map(x=>({uid:x.user.id,level:x.level,user:x.user}));
  const row=x=>`<div class="pl-share-row" data-uid="${x.uid}"><div class="pl-who">${av(x.user,30)}<div style="min-width:0"><b>${esc(x.user.name)}</b><small>${esc(x.user.email)}</small></div></div>
    <select class="pl-in" data-lv style="width:auto;min-height:32px"><option value="view"${x.level==='view'?' selected':''}>Pode ver</option><option value="edit"${x.level==='edit'?' selected':''}>Pode editar</option></select><button class="pl-dots" data-rm title="Remover">×</button></div>`;
  const others=()=>dir.filter(u=>u.id!==A.owner.id&&!acl.some(a=>a.uid===u.id));
  const body=()=>`<div class="pl-field"><label for="plVis">Acesso geral</label><select class="pl-in" id="plVis">${Object.entries(VISN).map(([k,v])=>`<option value="${k}"${A.vis===k?' selected':''}>${v}</option>`).join('')}</select>
     <span class="pl-hint">“Organização” vale para todos os usuários ativos com permissão de ver documentos.</span></div>
   <div class="pl-field"><label>Pessoas</label><div class="pl-share-row"><div class="pl-who">${av(A.owner,30)}<div><b>${esc(A.owner.name)}</b><small>${esc(A.owner.email)}</small></div></div><span class="pl-chip acc">Dono</span></div>
   <div id="plAcl">${acl.map(row).join('')}</div></div>
   <div style="display:flex;gap:6px"><select class="pl-in" id="plAdd"><option value="">Adicionar pessoa…</option>${others().map(u=>`<option value="${u.id}">${esc(u.name)} · ${esc(u.email)}</option>`).join('')}</select>
   <select class="pl-in" id="plAddLv" style="width:auto"><option value="view">Pode ver</option><option value="edit">Pode editar</option></select><button class="pl-btn" id="plAddBtn">Adicionar</button></div>`;
  openModal('Compartilhar documento',body(),[{t:'Cancelar'},{t:'Salvar',cls:'pri',fn:safe(async()=>{
    qs('#plAcl').querySelectorAll('[data-uid]').forEach(r=>{const a=acl.find(x=>x.uid===+r.dataset.uid);if(a)a.level=r.querySelector('[data-lv]').value});
    await api('PUT',`/api/docs/${id}/acl`,{vis:qs('#plVis').value,acl:acl.map(({uid,level})=>({uid,level}))});toast('Compartilhamento atualizado');if(qs('#pl-home.on'))loadHome()})}]);
  const mb=qs('#mbody');mb.onclick=e=>{if(e.target.id==='plAddBtn'){const uid=+qs('#plAdd').value;if(!uid)return;const u=dir.find(x=>x.id===uid);
      qs('#plAcl').querySelectorAll('[data-uid]').forEach(r=>{const a=acl.find(x=>x.uid===+r.dataset.uid);if(a)a.level=r.querySelector('[data-lv]').value});
      acl.push({uid,level:qs('#plAddLv').value,user:u});A.vis=qs('#plVis').value;mb.innerHTML=body()}
    const rm=e.target.closest('[data-rm]');if(rm){const uid=+rm.closest('[data-uid]').dataset.uid;acl=acl.filter(x=>x.uid!==uid);rm.closest('[data-uid]').remove();
      const sel=qs('#plAdd');const u=dir.find(x=>x.id===uid);if(u)sel.insertAdjacentHTML('beforeend',`<option value="${u.id}">${esc(u.name)} · ${esc(u.email)}</option>`)}}}

/* ---------------- versões ---------------- */
async function versionsDlg(id){let V;try{V=await api('GET',`/api/docs/${id}/versions`)}catch(e){return toast(e.message)}
  const canRestore=id===S.docId?PL.canModel():has('docs.edit');const K={auto:['Automática',''],named:['Nomeada','info'],publish:['Publicação','ok']};
  openModal('Histórico de versões',`<p class="small">Pontos automáticos a cada 10 minutos de edição (mantidos os 60 últimos), versões nomeadas e publicações de processo.</p>
   <div style="max-height:56vh;overflow:auto"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>Tipo</th><th>Nota</th><th class="n">Tam.</th><th></th></tr></thead><tbody>
   ${V.map(v=>`<tr><td class="mono" title="${esc(fmtD(v.at))}">${esc(rel(v.at))}</td><td>${v.by?esc(v.by.name):'–'}</td><td><span class="chip ${K[v.kind]?.[1]||''}">${K[v.kind]?.[0]||v.kind}</span></td><td>${esc(v.note||'')}</td><td class="n">${fmtB(v.size)}</td>
     <td style="white-space:nowrap">${has('export')?`<button class="btn sm" data-vdl="${v.id}">Baixar</button>`:''} ${canRestore?`<button class="btn sm" data-vrs="${v.id}">Restaurar</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6">Sem versões.</td></tr>'}</tbody></table></div>`);
  qs('#mbody').onclick=safe(async e=>{const dl=e.target.closest('[data-vdl]'),rs=e.target.closest('[data-vrs]');
    if(dl){const r=await api('GET',`/api/docs/${id}/versions/${dl.dataset.vdl}`);saveBlob(slug(r.data.name||'documento')+`_v${dl.dataset.vdl}.flows.json`,JSON.stringify(r.data,null,1),'application/json')}
    if(rs){if(!confirm('Restaurar esta versão? O estado atual é guardado antes como versão nomeada.'))return;if(id===S.docId)await flush();await api('POST',`/api/docs/${id}/versions/${rs.dataset.vrs}/restore`,{});closeModal();toast('Versão restaurada');
      if(id===S.docId)await reloadRemote();else if(qs('#pl-home.on'))loadHome()}})}

/* ---------------- central de documentos ---------------- */
function shellHead(){return`<header class="pl-head"><div class="brand" data-go="#/docs">GPlanSiS<span>|Flows</span></div><div class="org">${esc(S.org?.name||'')}</div>
  ${S.org?.banner?`<span class="pl-chip warn pl-hide-m" title="${esc(S.org.banner)}" style="max-width:40vw;overflow:hidden;text-overflow:ellipsis">${esc(S.org.banner)}</span>`:''}<div class="sp"></div>
  ${S.docId&&doc?`<button class="pl-btn sm" data-go="#/d/${S.docId}">${ic('back')}<span class="pl-hide-m">Voltar ao diagrama</span></button>`:''}<button class="pl-mebtn" aria-label="Conta e configurações">${av(S.me,32)}</button></header>`}
function wireShell(L){L.onclick=e=>{const g=e.target.closest('[data-go]');if(g){go(g.dataset.go);return}const m=e.target.closest('.pl-mebtn');if(m){e.stopPropagation();meMenu(m)}}}
function thumb(id){let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;const R=()=>{h=(h*1103515245+12345)>>>0;return h/4294967296};
  const col=['#b86e00','#1f6fd1','#2e7d32','#8e24aa'][Math.floor(R()*4)],line='#9aa3a9',base=55;let o='',x=31,y=base;
  const edge=(x1,y1,x2,y2)=>{const mx=Math.round((x1+x2)/2);o+=`<path d="M${x1} ${y1}H${mx}V${y2}H${x2}" stroke="${line}" stroke-width="1.4" fill="none"/>`};
  o+=`<circle cx="22" cy="${base}" r="9" fill="#fff" stroke="${col}" stroke-width="2"/>`;
  const n=3+Math.floor(R()*3);
  for(let i=0;i<n;i++){const ny=i>0&&i<n-1&&R()<.4?base+(R()<.5?-24:24):base;
    if(R()<.25&&i>0&&i<n-1){edge(x,y,x+18,ny);o+=`<path d="M${x+32} ${ny-14}l14 14-14 14-14-14z" fill="#fff" stroke="${col}" stroke-width="1.6"/>`;x+=46}
    else{edge(x,y,x+18,ny);o+=`<rect x="${x+18}" y="${ny-12}" width="34" height="24" rx="4" fill="#fff" stroke="${col}" stroke-width="1.6"/>`;x+=52}
    y=ny}
  edge(x,y,x+18,base);o+=`<circle cx="${x+27}" cy="${base}" r="9" fill="#fff" stroke="${col}" stroke-width="3.2"/>`;
  return`<svg viewBox="0 0 ${x+48} 110" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${o}</svg>`}
async function showHome(filter){if(S.docId&&dirty())await flush();S.homeFilter=filter||S.homeFilter||'recent';const L=layer('pl-home');
  L.innerHTML=`<div class="pl-shell">${shellHead()}<div class="pl-body"><nav class="pl-nav" id="plHomeNav"></nav><main class="pl-main" id="plHomeMain"><div class="pl-empty"><span class="pl-spin"></span></div></main></div></div>`;
  wireShell(L);showLayer('pl-home');document.title='Documentos · GPlanSiS|Flows';await loadHome()}
async function loadHome(){const trash=S.homeFilter==='trash';let D;try{D=await api('GET','/api/docs'+(trash?'?trash=1':''))}catch(e){return}
  if(!trash)S.docs=D;
  if(!trash&&!D.length&&has('docs.create')&&!S.autoMade){S.autoMade=true;try{const r=await api('POST','/api/docs',{data:buildDoc('examples','GPlanSiS|Flows · exemplos'),vis:'org-view',origin:'Exemplos iniciais'});return go('#/d/'+r.id)}catch(e){}}
  const all=S.docs||[];const cnt={recent:all.length,mine:all.filter(d=>d.mine).length,shared:all.filter(d=>!d.mine).length,org:all.filter(d=>d.vis!=='private').length};
  const nav=[['recent','Recentes',I.clock],['mine','Meus documentos',I.user],['shared','Compartilhados comigo',I.share],['org','Da organização',I.org],['trash','Lixeira',I.trash]];
  qs('#plHomeNav').innerHTML=`<h4>Documentos</h4>${nav.map(([k,n,i])=>`<button data-f="${k}" aria-current="${S.homeFilter===k}"><svg class="pl-ico" viewBox="0 0 24 24">${i}</svg>${n}${cnt[k]!=null?`<span class="n">${cnt[k]}</span>`:''}</button>`).join('')}
    <h4>Conta</h4><button data-go="#/config/perfil">${ic('user')}Perfil e avatar</button><button data-go="#/config/preferencias">${ic('sliders')}Preferências</button>${(has('users.manage')||has('audit.view')||has('system.settings'))?`<button data-go="#/config/${has('users.manage')?'painel':has('audit.view')?'auditoria':'sistema'}">${ic('shield')}Administração</button>`:''}`;
  qs('#plHomeNav').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;S.homeFilter=b.dataset.f;loadHome()};
  let list=trash?D:all;if(S.homeFilter==='mine')list=list.filter(d=>d.mine);if(S.homeFilter==='shared')list=list.filter(d=>!d.mine);if(S.homeFilter==='org')list=list.filter(d=>d.vis!=='private');
  const view=S.me.prefs?.homeView||'cards';const title={recent:'Recentes',mine:'Meus documentos',shared:'Compartilhados comigo',org:'Da organização',trash:'Lixeira'}[S.homeFilter];
  const M=qs('#plHomeMain');
  M.innerHTML=`<h1>${title}</h1><p class="lead">${trash?'Documentos excluídos podem ser restaurados ou apagados de vez.':`Olá, ${esc(S.me.name.split(' ')[0])}. ${list.length} documento(s).`}</p>
   <div class="pl-bar">${!trash&&has('docs.create')?`<button class="pl-btn pri" data-a="new">${ic('plus')}Novo documento</button><button class="pl-btn" data-a="import">${ic('up')}Importar</button>`:''}
    <input class="pl-in" id="plSearch" type="search" placeholder="Pesquisar por nome ou dono" style="margin-left:auto">
    <button class="pl-btn sm" data-a="view" title="${view==='cards'?'Ver em lista':'Ver em cartões'}">${ic(view==='cards'?'list':'grid')}</button></div><div id="plDocList"></div>
   <input type="file" id="plImport" accept=".json,.bpmn,.xml" hidden>`;
  const draw=q=>{q=(q||'').toLowerCase();const F=list.filter(d=>!q||d.name.toLowerCase().includes(q)||(d.owner&&d.owner.name.toLowerCase().includes(q)));const box=qs('#plDocList');
    if(!F.length){box.innerHTML=`<div class="pl-empty"><b>${q?'Nada encontrado':trash?'Lixeira vazia':'Nenhum documento aqui'}</b>${!q&&!trash&&has('docs.create')?'Crie um documento novo ou importe um arquivo .flows.json / .bpmn.':''}</div>`;return}
    const chips=d=>`<span class="pl-chip ${d.level==='owner'?'acc':d.level==='edit'?'info':''}">${LVN[d.level]}</span>${d.vis!=='private'?`<span class="pl-chip" title="${VISN[d.vis]}">${ic('org')}</span>`:''}`;
    if(view==='cards'&&!trash)box.innerHTML=`<div class="pl-cards">${F.map(d=>`<div class="pl-dcard" data-open="${d.id}" tabindex="0"><div class="th">${thumb(d.id)}</div><div class="bd"><b title="${esc(d.name)}">${esc(d.name)}</b><small>${d.pages} página(s) · ${esc(rel(d.updated))}${d.updated_by?' por '+esc(d.updated_by.name.split(' ')[0]):''}</small></div>
      <div class="ft">${av(d.owner,22)}${chips(d)}<button class="pl-dots" data-menu="${d.id}" aria-label="Ações">⋯</button></div></div>`).join('')}</div>`;
    else box.innerHTML=`<div class="pl-tblwrap"><table class="pl-tbl"><thead><tr><th>Nome</th><th class="pl-hide-m">Dono</th><th>${trash?'Excluído':'Atualizado'}</th><th class="pl-hide-m num">Páginas</th><th class="pl-hide-m num">Tamanho</th><th>Acesso</th><th></th></tr></thead><tbody>
      ${F.map(d=>`<tr class="${trash?'':'click'}" data-open="${trash?'':d.id}"><td><div class="pl-who">${ic('flow')}<b>${esc(d.name)}</b></div></td><td class="pl-hide-m"><div class="pl-who">${av(d.owner,22)}<small>${esc(d.owner?.name||'')}</small></div></td>
        <td title="${esc(fmtD(trash?d.deleted:d.updated))}">${esc(rel(trash?d.deleted:d.updated))}</td><td class="num pl-hide-m">${d.pages}</td><td class="num pl-hide-m">${fmtB(d.size)}</td><td>${chips(d)}</td><td><button class="pl-dots" data-menu="${d.id}" aria-label="Ações">⋯</button></td></tr>`).join('')}</tbody></table></div>`};
  draw('');qs('#plSearch').oninput=e=>draw(e.target.value);
  M.onclick=e=>{const mn=e.target.closest('[data-menu]');if(mn){e.stopPropagation();const d=list.find(x=>x.id===mn.dataset.menu);const r=mn.getBoundingClientRect();docMenu(d,r.right-240,r.bottom+4);return}
    const op=e.target.closest('[data-open]');if(op&&op.dataset.open){go('#/d/'+op.dataset.open);return}
    const a=e.target.closest('[data-a]');if(!a)return;if(a.dataset.a==='new')newDocDlg();if(a.dataset.a==='import')qs('#plImport').click();if(a.dataset.a==='view'){savePref('homeView',view==='cards'?'list':'cards');loadHome()}};
  M.onkeydown=e=>{if(e.key==='Enter'){const op=e.target.closest('[data-open]');if(op&&op.dataset.open)go('#/d/'+op.dataset.open)}};
  qs('#plImport').onchange=safe(async e=>{const f=e.target.files[0];e.target.value='';if(f)await importAsDoc(f.name,await f.text())})}
function docMenu(d,x,y){const it=[];const owner=d.level==='owner'||has('docs.all');
  if(d.deleted){it.push(['Restaurar',safe(async()=>{await api('POST',`/api/docs/${d.id}/restore`,{});toast('Documento restaurado');loadHome()})]);
    it.push(['Excluir definitivamente',safe(async()=>{if(!confirm(`Apagar “${d.name}” e todas as versões? Não há como desfazer.`))return;await api('DELETE',`/api/docs/${d.id}?hard=1`);toast('Documento apagado');loadHome()})]);return openMenu(it,x,y)}
  it.push(['Abrir',()=>go('#/d/'+d.id)]);
  if(LV[d.level]>=2&&has('docs.edit'))it.push(['Renomear…',()=>renameDlg(d.id,d.name)]);
  if(has('docs.create'))it.push(['Duplicar',safe(()=>dupDoc(d.id))]);
  if(has('docs.share')&&owner)it.push(['Compartilhar…',()=>shareDlg(d.id)]);
  it.push(['Histórico de versões…',()=>versionsDlg(d.id)]);
  if((d.level==='owner'&&has('docs.delete'))||isAdmin())it.push('-',['Mover para a lixeira',safe(async()=>{if(!confirm(`Mover “${d.name}” para a lixeira?`))return;await api('DELETE',`/api/docs/${d.id}`);if(d.id===S.docId){S.docId=null;stopPoll()}toast('Movido para a lixeira');loadHome()})]);
  openMenu(it,x,y)}

/* ---------------- configurações ---------------- */
const CFG=[['Conta',[['perfil','Perfil e avatar','user'],['seguranca','Segurança','lock'],['preferencias','Preferências','sliders']]],
  ['Administração',[['painel','Painel','chart',['users.manage','system.settings','audit.view']],['usuarios','Usuários','users',['users.manage']],['papeis','Papéis e permissões','key',['users.manage']],['auditoria','Auditoria','shield',['audit.view']],['sistema','Sistema','gear',['system.settings']]]]];
const allowed=x=>!x[3]||x[3].some(has);
async function showConfig(sec){if(S.docId&&dirty())await flush();const flat=CFG.flatMap(g=>g[1]).filter(allowed);if(!flat.some(x=>x[0]===sec))sec='perfil';S.cfgSec=sec;
  const L=layer('pl-cfg');L.innerHTML=`<div class="pl-shell">${shellHead()}<div class="pl-body"><nav class="pl-nav">
    <button data-go="#/docs">${ic('back')}Documentos</button>${CFG.map(([g,items])=>{const v=items.filter(allowed);return v.length?`<h4>${g}</h4>`+v.map(([k,n,i])=>`<button data-go="#/config/${k}" aria-current="${k===sec}">${ic(i)}${n}</button>`).join(''):''}).join('')}
    </nav><main class="pl-main" id="plCfgMain"><div class="pl-empty"><span class="pl-spin"></span></div></main></div></div>`;
  wireShell(L);showLayer('pl-cfg');document.title='Configurações · GPlanSiS|Flows';
  try{await ({perfil:cfgPerfil,seguranca:cfgSeg,preferencias:cfgPrefs,painel:cfgPainel,usuarios:cfgUsers,papeis:cfgPapeis,auditoria:cfgAudit,sistema:cfgSistema}[sec])(qs('#plCfgMain'))}catch(e){qs('#plCfgMain').innerHTML=`<div class="pl-empty"><b>Não foi possível carregar</b>${esc(e.message)}</div>`}}

/* perfil + avatar */
function cfgPerfil(M){const u=S.me;
  M.innerHTML=`<h1>Perfil e avatar</h1><p class="lead">Como você aparece para a equipe: na barra, no compartilhamento, nas tarefas e na auditoria.</p>
   <div class="pl-panel"><h3>Avatar</h3><div class="pl-avedit"><span id="plAvBig">${av(u,96).replace('class="pl-av"','class="pl-av big"')}</span>
    <div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="pl-btn" id="plAvUp">${ic('up')}Enviar foto</button>${u.avatar?`<button class="pl-btn dng" id="plAvRm">Remover foto</button>`:''}</div>
    <p class="pl-hint" style="margin:8px 0 2px">PNG, JPG ou WebP. Você ajusta o enquadramento antes de salvar. Sem foto, usamos suas iniciais nesta cor:</p>
    <div class="pl-swatches">${COLORS.map(c=>`<button style="background:${c}" data-col="${c}" aria-pressed="${u.color===c}" aria-label="Cor ${c}"></button>`).join('')}</div></div></div>
    <input type="file" id="plAvFile" accept="image/png,image/jpeg,image/webp" hidden></div>
   <div class="pl-panel"><h3>Dados</h3><div class="pl-grid2">
    <div class="pl-field"><label for="pfName">Nome</label><input class="pl-in" id="pfName" value="${esc(u.name)}" maxlength="80"></div>
    <div class="pl-field"><label>E-mail</label><input class="pl-in" value="${esc(u.email)}" disabled></div>
    <div class="pl-field"><label for="pfTitle">Cargo</label><input class="pl-in" id="pfTitle" value="${esc(u.title||'')}" maxlength="80" placeholder="Ex.: Engenheiro de processos"></div>
    <div class="pl-field"><label for="pfDept">Departamento</label><input class="pl-in" id="pfDept" value="${esc(u.dept||'')}" maxlength="80" placeholder="Ex.: PCP"></div></div>
    <p class="pl-hint">Papel: <span class="pl-chip acc">${esc(roleName(u.role))}</span> · ${u.perms.length} permissões · conta criada em ${esc(fmtD(u.created))}</p>
    <button class="pl-btn pri" id="pfSave">Salvar perfil</button></div>`;
  const upd=async patch=>{const p=await api('PATCH','/api/me',patch);S.me=p.user;buildChrome();cfgPerfil(M)};
  qs('#pfSave').onclick=safe(async()=>{await upd({name:qs('#pfName').value,title:qs('#pfTitle').value,dept:qs('#pfDept').value});EX.who=S.me.name;toast('Perfil salvo')});
  M.querySelectorAll('[data-col]').forEach(b=>b.onclick=safe(async()=>{await upd({color:b.dataset.col})}));
  const rm=qs('#plAvRm');if(rm)rm.onclick=safe(async()=>{await upd({avatar:null});toast('Foto removida')});
  qs('#plAvUp').onclick=()=>qs('#plAvFile').click();
  qs('#plAvFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(f.size>15*1024*1024)return toast('Imagem grande demais (máx. 15 MB)');
    const rd=new FileReader();rd.onload=()=>cropDlg(rd.result,async url=>{await upd({avatar:url});toast('Avatar atualizado')});rd.readAsDataURL(f)}}
function cropDlg(src,done){const img=new Image();img.onload=()=>{
  openModal('Ajustar avatar',`<div class="pl-crop"><canvas id="plCrop" width="560" height="560" aria-label="Arraste para posicionar"></canvas><input type="range" id="plZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><p class="pl-hint">Arraste para posicionar · role ou use o controle para aproximar.</p></div>`,
   [{t:'Cancelar'},{t:'Usar esta imagem',cls:'pri',fn:safe(async()=>{const out=document.createElement('canvas');out.width=out.height=256;draw(out.getContext('2d'),256,false);
     let url=out.toDataURL('image/webp',.86);if(!url.startsWith('data:image/webp'))url=out.toDataURL('image/jpeg',.88);await done(url)})}]);
  const cv=qs('#plCrop'),cx=cv.getContext('2d'),Z=qs('#plZoom');const base=Math.max(560/img.width,560/img.height);let z=1,ox=0,oy=0;
  function clampO(){const w=img.width*base*z,h=img.height*base*z;ox=clamp(ox,560-w,0);oy=clamp(oy,560-h,0)}
  function center(){const w=img.width*base*z,h=img.height*base*z;ox=(560-w)/2;oy=(560-h)/2}
  function draw(c,size,guide){const k=size/560;c.fillStyle='#222';c.fillRect(0,0,size,size);c.imageSmoothingQuality='high';c.drawImage(img,ox*k,oy*k,img.width*base*z*k,img.height*base*z*k);
    if(guide){c.save();c.fillStyle='rgba(0,0,0,.45)';c.beginPath();c.rect(0,0,size,size);c.arc(size/2,size/2,size/2-4,0,Math.PI*2,true);c.fill('evenodd');c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=2;c.beginPath();c.arc(size/2,size/2,size/2-4,0,Math.PI*2);c.stroke();c.restore()}}
  const paint=()=>draw(cx,560,true);center();paint();
  const zoomTo_=(nz,px,py)=>{px=px??280;py=py??280;const ix=(px-ox)/z,iy=(py-oy)/z;z=clamp(nz,1,4);ox=px-ix*z;oy=py-iy*z;clampO();Z.value=z;paint()};
  Z.oninput=()=>zoomTo_(+Z.value);
  cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();zoomTo_(z*(e.deltaY<0?1.08:1/1.08),(e.clientX-r.left)*2,(e.clientY-r.top)*2)},{passive:false});
  let drag=null;cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,ox,oy}};
  cv.onpointermove=e=>{if(!drag)return;ox=drag.ox+(e.clientX-drag.x)*2;oy=drag.oy+(e.clientY-drag.y)*2;clampO();paint()};
  cv.onpointerup=cv.onpointercancel=()=>{drag=null}};
  img.onerror=()=>toast('Não foi possível ler a imagem');img.src=src}

/* segurança */
async function cfgSeg(M){const min=S.org?.pw_min||10;const sess=await api('GET','/api/me/sessions');
  M.innerHTML=`<h1>Segurança</h1><p class="lead">Senha e sessões abertas da sua conta.</p>
   <div class="pl-panel"><h3>Trocar senha</h3><form id="sgF" novalidate style="max-width:420px">${pwInput('sgCur','current-password','Senha atual')}${pwInput('sgNew','new-password','Nova senha')}${pwRules(min,true)}<div style="height:10px"></div>${pwInput('sgNew2','new-password','Confirme a nova senha')}
    <div class="pl-err" id="sgErr" role="alert"></div><button class="pl-btn pri" type="submit">Trocar senha</button><p class="pl-hint">Trocar a senha encerra as suas outras sessões.</p></form></div>
   <div class="pl-panel"><h3>Sessões ativas</h3><div class="pl-tblwrap" style="border:0"><table class="pl-tbl"><thead><tr><th>Dispositivo</th><th>IP</th><th>Início</th><th>Última atividade</th><th></th></tr></thead><tbody>
    ${sess.map(s=>`<tr><td>${esc(uaName(s.ua))} ${s.current?'<span class="pl-chip ok">esta sessão</span>':''}</td><td class="pl-mono">${esc(s.ip||'')}</td><td>${esc(fmtD(s.created))}</td><td>${esc(rel(s.last_seen))}</td><td>${s.current?'':`<button class="pl-btn sm" data-sk="${s.id}">Encerrar</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
  M.querySelectorAll('[data-eye]').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input');i.type=i.type==='password'?'text':'password'});
  pwMeter(M,qs('#sgNew'),qs('#sgNew2'),min);
  qs('#sgF').onsubmit=async e=>{e.preventDefault();const err=qs('#sgErr');if(qs('#sgNew').value!==qs('#sgNew2').value){err.textContent='A confirmação não confere.';return}
    try{await api('POST','/api/me/password',{current:qs('#sgCur').value,new:qs('#sgNew').value});toast('Senha alterada');cfgSeg(M)}catch(x){err.textContent=x.message}};
  M.querySelectorAll('[data-sk]').forEach(b=>b.onclick=safe(async()=>{await api('DELETE','/api/me/sessions/'+b.dataset.sk);toast('Sessão encerrada');cfgSeg(M)}))}
function uaName(ua){ua=ua||'';const b=/Edg\//.test(ua)?'Edge':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Navegador';
  const o=/Windows/.test(ua)?'Windows':/iPhone|iPad/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'';return b+(o?' · '+o:'')}

/* preferências */
function cfgPrefs(M){const p=S.me.prefs||{};const th=p.theme||'system';
  M.innerHTML=`<h1>Preferências</h1><p class="lead">Valem para você em qualquer computador.</p>
   <div class="pl-panel"><h3>Aparência</h3><div class="pl-field" style="max-width:320px"><label for="prTheme">Tema</label><select class="pl-in" id="prTheme"><option value="system">Seguir o sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></div></div>
   <div class="pl-panel"><h3>Ao entrar</h3><div class="pl-field" style="max-width:320px"><label for="prOpen">Abrir</label><select class="pl-in" id="prOpen"><option value="last">O último documento aberto</option><option value="home">A central de documentos</option></select></div></div>
   <div class="pl-panel"><h3>Editor</h3>
    ${[['grid','Mostrar grade'],['snap','Ajustar à grade'],['guides','Guias inteligentes'],['mini','Minimapa']].map(([k,n])=>`<label class="pl-switch"><input type="checkbox" data-pk="${k}" ${(p[k]??OPT[k])?'checked':''}> ${n}</label>`).join('')}</div>`;
  qs('#prTheme').value=th;qs('#prOpen').value=p.open||'last';
  qs('#prTheme').onchange=e=>{savePref('theme',e.target.value);applyPrefs();try{localStorage.setItem('gplansis-flows-ui',e.target.value==='system'?'':e.target.value)}catch(x){}toast('Tema aplicado')};
  qs('#prOpen').onchange=e=>{savePref('open',e.target.value);toast('Preferência salva')};
  M.querySelectorAll('[data-pk]').forEach(i=>i.onchange=()=>{savePref(i.dataset.pk,i.checked);OPT[i.dataset.pk]=i.checked;toast('Preferência salva')})}

/* painel */
async function cfgPainel(M){const s=await api('GET','/api/stats');const mx=Math.max(1,...s.activity.map(d=>d.n));
  M.innerHTML=`<h1>Painel</h1><p class="lead">Visão geral do GPlanSiS|Flows ${esc(s.version)} · ${esc(S.org?.name||'')}</p>
   <div class="pl-kpis">${[['Usuários ativos',s.users,s.users_inactive?s.users_inactive+' inativo(s)':''],['Online (15 min)',s.online,''],['Documentos',s.docs,s.trash?s.trash+' na lixeira':''],['Versões guardadas',s.versions,''],
     ['Armazenamento',fmtB(s.bytes),'banco '+fmtB(s.db_bytes)],['Eventos de auditoria',s.audit.toLocaleString('pt-BR'),''],['Logins em 24 h',s.logins_24h,''],['Falhas de login em 24 h',s.fails_24h,s.fails_24h>10?'atenção':'']]
     .map(([n,v,sub])=>`<div class="pl-kpi"><small>${n}</small><b>${v}</b><span>${esc(sub)}</span></div>`).join('')}</div>
   <div class="pl-grid2"><div class="pl-panel"><h3>Atividade · 14 dias</h3><div class="pl-bars">${s.activity.map(d=>`<div title="${d.d}: ${d.n} eventos"><i style="height:${Math.round(d.n/mx*100)}%"></i><small>${d.d.slice(8)}</small></div>`).join('')}</div></div>
   <div class="pl-panel"><h3>Eventos mais frequentes</h3><table class="pl-tbl">${s.top_events.map(e=>`<tr><td class="pl-mono" style="font-size:12px">${esc(e.ev)}</td><td class="num">${e.n}</td></tr>`).join('')}</table></div></div>
   <div class="pl-grid2"><div class="pl-panel"><h3>Usuários por papel</h3><table class="pl-tbl">${Object.entries(s.roles).map(([r,n])=>`<tr><td>${esc(roleName(r))}</td><td class="num">${n}</td></tr>`).join('')}</table></div>
   <div class="pl-panel"><h3>IA</h3><p>${s.ai_key?`<span class="pl-chip ok">Chave configurada</span> modelo <span class="pl-mono">${esc(s.ai_model)}</span>`:'<span class="pl-chip warn">Sem chave</span> Cadastre a chave da Anthropic em Configurações › Sistema.'}</p>
    <p class="pl-hint">Toda proposta de IA nas tarefas exige aprovação humana com a permissão “Aprovar propostas de IA”.</p></div></div>`}

/* usuários */
async function cfgUsers(M){const[U,R]=await Promise.all([api('GET','/api/users'),api('GET','/api/roles')]);S.rolesFull=R;
  M.innerHTML=`<h1>Usuários</h1><p class="lead">${U.filter(u=>u.active).length} ativo(s) de ${U.length}. Papéis definem as permissões padrão; você pode personalizar por pessoa.</p>
   <div class="pl-bar"><button class="pl-btn pri" id="usNew">${ic('plus')}Novo usuário</button><input class="pl-in" id="usQ" type="search" placeholder="Pesquisar nome, e-mail ou papel" style="margin-left:auto"></div><div id="usList"></div>`;
  const draw=q=>{q=(q||'').toLowerCase();const F=U.filter(u=>!q||(u.name+' '+u.email+' '+roleName(u.role)+' '+(u.dept||'')).toLowerCase().includes(q));
    qs('#usList').innerHTML=`<div class="pl-tblwrap"><table class="pl-tbl"><thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th class="pl-hide-m num">Docs</th><th class="pl-hide-m">Último acesso</th><th></th></tr></thead><tbody>
     ${F.map(u=>`<tr class="click" data-uid="${u.id}"><td><div class="pl-who">${av(u,32)}<div style="min-width:0"><b>${esc(u.name)}${u.id===S.me.id?' <span class="pl-chip">você</span>':''}</b><small>${esc(u.email)}${u.title?' · '+esc(u.title):''}</small></div></div></td>
      <td><span class="pl-chip ${u.role==='master'?'acc':u.role==='admin'?'info':''}">${esc(roleName(u.role))}</span>${u.custom?' <span class="pl-chip warn" title="Permissões personalizadas">personalizado</span>':''}</td>
      <td>${!u.active?'<span class="pl-chip err">inativo</span>':u.locked?'<span class="pl-chip err">bloqueado</span>':u.online?'<span class="pl-chip ok">online</span>':'<span class="pl-chip">ativo</span>'}${u.must_change&&u.active?' <span class="pl-chip warn">troca de senha</span>':''}</td>
      <td class="num pl-hide-m">${u.docs}</td><td class="pl-hide-m">${esc(rel(u.last_login))}</td><td><button class="pl-dots" data-um="${u.id}" aria-label="Ações">⋯</button></td></tr>`).join('')}</tbody></table></div>`};
  draw('');qs('#usQ').oninput=e=>draw(e.target.value);qs('#usNew').onclick=()=>userDlg(null,()=>cfgUsers(M));
  qs('#usList').onclick=e=>{const m=e.target.closest('[data-um]');const row=e.target.closest('[data-uid]');if(!row)return;const u=U.find(x=>x.id===+row.dataset.uid);
    if(!m){userDlg(u,()=>cfgUsers(M));return}e.stopPropagation();const r=m.getBoundingClientRect();const it=[['Editar…',()=>userDlg(u,()=>cfgUsers(M))]];
    const protectedU=u.role==='master'||(u.role==='admin'&&S.me.role!=='master');
    if(!protectedU&&u.id!==S.me.id){it.push(['Redefinir senha…',safe(async()=>{if(!confirm(`Gerar uma senha provisória para ${u.name}? As sessões dele(a) serão encerradas.`))return;const r=await api('POST',`/api/users/${u.id}/reset`,{});tempPwDlg(u,r.temp_password);cfgUsers(M)})]);
      if(u.locked)it.push(['Desbloquear',safe(async()=>{await api('PATCH',`/api/users/${u.id}`,{unlock:true});toast('Desbloqueado');cfgUsers(M)})]);
      it.push([u.active?'Desativar':'Reativar',safe(async()=>{await api('PATCH',`/api/users/${u.id}`,{active:!u.active});toast(u.active?'Usuário desativado':'Usuário reativado');cfgUsers(M)})]);
      it.push('-',['Excluir…',safe(async()=>{if(!confirm(`Excluir ${u.name}? Os ${u.docs} documento(s) dele(a) passam para você. A auditoria é mantida.`))return;await api('DELETE',`/api/users/${u.id}`);toast('Usuário excluído');cfgUsers(M)})])}
    openMenu(it,r.right-220,r.bottom+4)}}
function tempPwDlg(u,pw){openModal('Senha provisória',`<p>Entregue a senha abaixo a <b>${esc(u.name)}</b> (${esc(u.email)}) por um canal seguro. Ela será obrigada a trocá-la no primeiro acesso.</p><div class="pl-temp" id="plTmp">${esc(pw)}</div><p class="pl-hint">Esta senha não será exibida de novo.</p>`,
  [{t:'Copiar',fn:async()=>{try{await navigator.clipboard.writeText(pw);toast('Copiada')}catch(e){toast('Selecione e copie manualmente')}return false}},{t:'Concluído',cls:'pri'}])}
function userDlg(u,after){const R=S.rolesFull;const isNew=!u;const master=S.me.role==='master';const locked=u&&(u.role==='master'||(u.role==='admin'&&!master));
  const roleOpts=Object.entries(R.roles).filter(([k])=>k!=='master'&&(k!=='admin'||master||(u&&u.role==='admin')));
  const cur=u?u.role:'editor';const curPerms=u?u.perms:R.roles[cur].p;
  openModal(isNew?'Novo usuário':`Editar · ${u.name}`,`${locked?`<div class="gate">${u.role==='master'?'O admin master é único: papel e permissões são fixos.':'Somente o admin master altera administradores.'}</div>`:''}
   <div class="pl-grid2"><div class="pl-field"><label for="udName">Nome</label><input class="pl-in" id="udName" value="${esc(u?.name||'')}" ${locked?'disabled':''}></div>
   <div class="pl-field"><label for="udEmail">E-mail</label><input class="pl-in" id="udEmail" type="email" value="${esc(u?.email||'')}" ${isNew?'':'disabled'}></div>
   <div class="pl-field"><label for="udTitle">Cargo</label><input class="pl-in" id="udTitle" value="${esc(u?.title||'')}" ${locked?'disabled':''}></div>
   <div class="pl-field"><label for="udDept">Departamento</label><input class="pl-in" id="udDept" value="${esc(u?.dept||'')}" ${locked?'disabled':''}></div></div>
   ${u?.role==='master'?'':`<div class="pl-field"><label for="udRole">Papel</label><select class="pl-in" id="udRole" ${locked?'disabled':''}>${roleOpts.map(([k,v])=>`<option value="${k}"${k===cur?' selected':''}>${esc(v.n)} — ${esc(v.d)}</option>`).join('')}</select></div>
   <label class="pl-switch"><input type="checkbox" id="udCustom" ${u?.custom?'checked':''} ${locked?'disabled':''}> Personalizar permissões desta pessoa</label>
   <div class="pl-perms" id="udPerms">${PERM_GROUPS.map(([g,ps])=>`<div style="grid-column:1/-1;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:8px">${g}</div>`+ps.map(p=>`<label><input type="checkbox" data-perm="${p}" ${curPerms.includes(p)?'checked':''}><span>${esc(R.perms[p])}<small>${p}</small></span></label>`).join('')).join('')}</div>`}
   ${isNew?`<div class="pl-field" style="margin-top:12px"><label for="udPw">Senha inicial (opcional)</label><input class="pl-in" id="udPw" type="text" autocomplete="off" placeholder="Em branco: o sistema gera uma senha provisória"><span class="pl-hint">A pessoa troca a senha no primeiro acesso.</span></div>`:''}`,
   locked&&u.id!==S.me.id?[{t:'Fechar'}]:[{t:'Cancelar'},{t:isNew?'Criar usuário':'Salvar',cls:'pri',fn:safe(async()=>{
     const role=qs('#udRole')?.value;const custom=!!qs('#udCustom')?.checked;const perms=[...document.querySelectorAll('[data-perm]:checked')].map(i=>i.dataset.perm);
     const b={name:qs('#udName').value.trim(),title:qs('#udTitle').value.trim(),dept:qs('#udDept').value.trim()};
     if(u?.role!=='master'&&!locked){b.role=role;b.custom=custom;b.perms=custom?perms:null}
     if(isNew){b.email=qs('#udEmail').value.trim();const pw=qs('#udPw').value.trim();if(pw)b.password=pw;const r=await api('POST','/api/users',b);after();tempPwDlg(r.user,r.temp_password);return false}
     if(u.id===S.me.id&&u.role==='master'){const p=await api('PATCH','/api/me',{name:b.name,title:b.title,dept:b.dept});S.me=p.user;buildChrome()}else await api('PATCH',`/api/users/${u.id}`,b);
     toast('Usuário salvo');after()})}]);
  const sync=()=>{const c=qs('#udCustom');if(!c)return;const role=qs('#udRole').value;const box=qs('#udPerms');box.style.opacity=c.checked?1:.55;
    box.querySelectorAll('[data-perm]').forEach(i=>{i.disabled=!c.checked||locked||role==='admin';if(!c.checked||role==='admin')i.checked=(role==='admin'?Object.keys(R.perms):R.roles[role].p).includes(i.dataset.perm)})};
  if(qs('#udCustom')){qs('#udCustom').onchange=sync;qs('#udRole').onchange=sync;sync()}
  setTimeout(()=>qs(isNew?'#udName':'#udName')?.focus(),50)}

/* papéis */
async function cfgPapeis(M){const R=await api('GET','/api/roles');const roles=Object.entries(R.roles);
  M.innerHTML=`<h1>Papéis e permissões</h1><p class="lead">Permissões padrão de cada papel. Em Usuários você pode personalizar as de uma pessoa específica.</p>
   <div class="pl-kpis">${roles.map(([k,v])=>`<div class="pl-kpi"><small>${esc(v.n)}</small><b style="font-size:18px">${v.p.length} <span>permissões</span></b><span>${esc(v.d)}</span></div>`).join('')}</div>
   <div class="pl-tblwrap"><table class="pl-tbl pl-matrix"><thead><tr><th>Permissão</th>${roles.map(([k,v])=>`<th style="text-align:center">${esc(v.n)}</th>`).join('')}</tr></thead><tbody>
   ${PERM_GROUPS.map(([g,ps])=>`<tr><td colspan="${roles.length+1}" style="background:var(--panel2);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">${g}</td></tr>`+ps.map(p=>`<tr><td>${esc(R.perms[p])}<div class="pl-mono" style="font-size:10.5px;color:var(--muted)">${p}</div></td>${roles.map(([k,v])=>`<td class="c">${v.p.includes(p)?'✓':''}</td>`).join('')}</tr>`).join('')).join('')}</tbody></table></div>`}

/* auditoria */
async function cfgAudit(M){let items=[],total=0,q='';
  M.innerHTML=`<h1>Auditoria do sistema</h1><p class="lead">Trilha encadeada por SHA-256 no servidor: logins, usuários, permissões, documentos, publicações e uso de IA.</p>
   <div class="pl-bar"><button class="pl-btn" id="auV">${ic('shield')}Verificar integridade</button><span id="auR"></span><a class="pl-btn" href="/api/audit.csv" download>${ic('up')}Exportar CSV</a><input class="pl-in" id="auQ" type="search" placeholder="Filtrar por evento, e-mail ou dado" style="margin-left:auto"></div>
   <div class="pl-tblwrap"><table class="pl-tbl"><thead><tr><th class="num">#</th><th>Quando</th><th>Usuário</th><th>Evento</th><th class="pl-hide-m">Dados</th><th class="pl-hide-m">IP</th></tr></thead><tbody id="auB"></tbody></table></div>
   <div style="text-align:center;margin-top:12px"><button class="pl-btn" id="auMore">Carregar mais</button></div>`;
  const load=async more=>{const before=more&&items.length?items[items.length-1].seq:0;const r=await api('GET',`/api/audit?limit=150${before?'&before='+before:''}${q?'&q='+encodeURIComponent(q):''}`);total=r.total;items=more?items.concat(r.items):r.items;
    qs('#auB').innerHTML=items.map(a=>`<tr><td class="num">${a.seq}</td><td style="white-space:nowrap" title="${esc(a.at)}">${esc(new Date(a.at).toLocaleString('pt-BR'))}</td><td>${esc(a.email||'sistema')}</td>
      <td><span class="pl-chip ${/falha|excluido|sobrescrito/.test(a.ev)?'err':/login|criado|publicado/.test(a.ev)?'ok':''}">${esc(a.ev)}</span></td><td class="pl-hide-m"><div class="pl-auditdata" title="${esc(JSON.stringify(a.data))}">${esc(JSON.stringify(a.data))}</div></td><td class="pl-mono pl-hide-m" style="font-size:11px">${esc(a.ip||'')}</td></tr>`).join('')||'<tr><td colspan="6" class="pl-empty">Nada encontrado.</td></tr>';
    qs('#auMore').style.display=r.items.length<150?'none':''};
  await load(false);let qt=0;qs('#auQ').oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>{q=e.target.value.trim();load(false)},300)};
  qs('#auMore').onclick=safe(()=>load(true));
  qs('#auV').onclick=safe(async()=>{const r=await api('GET','/api/audit/verify');qs('#auR').innerHTML=r.ok?`<span class="pl-chip ok">Íntegra · ${r.n} registros</span>`:`<span class="pl-chip err">Violada no registro ${r.at}: ${esc(r.why)}</span>`})}

/* sistema */
async function cfgSistema(M){const s=await api('GET','/api/settings');const st=await api('GET','/api/stats').catch(()=>({}));
  M.innerHTML=`<h1>Sistema</h1><p class="lead">Configurações gerais da organização.</p>
   <div class="pl-panel"><h3>Organização</h3><div class="pl-grid2"><div class="pl-field"><label for="syOrg">Nome da organização</label><input class="pl-in" id="syOrg" value="${esc(s.org_name)}" maxlength="80"></div>
    <div class="pl-field"><label for="syRole">Papel padrão de novos usuários</label><select class="pl-in" id="syRole">${['gestor','editor','operador','leitor'].map(r=>`<option value="${r}"${s.default_role===r?' selected':''}>${esc(roleName(r))}</option>`).join('')}</select></div></div>
    <div class="pl-field"><label for="syBanner">Aviso para todos (opcional)</label><input class="pl-in" id="syBanner" value="${esc(s.banner||'')}" maxlength="240" placeholder="Ex.: Manutenção programada sábado às 22h"></div></div>
   <div class="pl-panel"><h3>Segurança</h3><div class="pl-grid2"><div class="pl-field"><label for="sySess">Sessão expira após inatividade de (horas)</label><input class="pl-in" id="sySess" type="number" min="1" max="720" value="${s.session_hours}"></div>
    <div class="pl-field"><label for="syPw">Tamanho mínimo de senha</label><input class="pl-in" id="syPw" type="number" min="8" max="64" value="${s.pw_min}"></div></div>
    <p class="pl-hint">Contas são bloqueadas por 15 minutos após 8 senhas erradas. Senhas são guardadas com scrypt; sessões em cookie HttpOnly, Secure e SameSite=Strict.</p></div>
   <div class="pl-panel"><h3>Inteligência artificial</h3><label class="pl-switch"><input type="checkbox" id="syAi" ${s.ai_enabled?'checked':''}> Permitir IA (gerar e revisar processos, propostas nas tarefas)</label>
    <div class="pl-field" style="margin-top:12px;max-width:560px"><label for="syKey">Chave da API da Anthropic</label>
     <p class="pl-hint" id="syKeySt" style="margin:0 0 6px">${s.ai_key_masked?`<span class="pl-chip ok">Configurada</span> <span class="pl-mono">${esc(s.ai_key_masked)}</span> · ${s.ai_key_source==='painel'?'definida por este painel':'vinda do servidor (.env)'}`:'<span class="pl-chip warn">Sem chave</span> A IA fica indisponível até uma chave ser cadastrada.'}</p>
     <div style="display:flex;gap:6px;flex-wrap:wrap"><div class="pl-pw" style="flex:1 1 260px"><input class="pl-in" id="syKey" type="password" autocomplete="off" spellcheck="false" placeholder="${s.ai_key_masked?'Cole uma nova chave para substituir':'sk-ant-…'}"><button type="button" data-eye aria-label="Mostrar chave">${ic('eye')}</button></div>
      <button class="pl-btn pri" id="syKeySave" type="button">Salvar chave</button>${s.ai_key_masked?`<button class="pl-btn" id="syKeyTest" type="button">Testar conexão</button>${s.ai_key_source==='painel'?'<button class="pl-btn dng" id="syKeyDel" type="button">Remover</button>':''}`:''}</div>
     <span class="pl-hint">Crie a chave em console.anthropic.com › API Keys. Ela fica só no servidor: o navegador nunca recebe a chave de volta, apenas o início e o fim para conferência. Modelo usado: <span class="pl-mono">${esc(st.ai_model||'claude-opus-5-5')}</span>.</span>
     <div class="pl-err" id="syKeyErr" role="alert"></div></div></div>
   <button class="pl-btn pri" id="sySave">Salvar configurações</button>`;
  M.querySelectorAll('[data-eye]').forEach(b=>b.onclick=()=>{const i=b.parentElement.querySelector('input');i.type=i.type==='password'?'text':'password'});
  const refreshAI=async()=>{const p=await api('GET','/api/me');S.org=p.org;S.ai=p.ai;setupAI()};
  const keyErr=m=>{const e=qs('#syKeyErr');e.style.color='';e.textContent=m||''};
  qs('#syKeySave').onclick=async()=>{const k=qs('#syKey').value.trim();if(!k)return keyErr('Cole a chave no campo.');
    try{await api('PUT','/api/settings/ai-key',{key:k});qs('#syKey').value='';await refreshAI();toast('Chave salva. Testando…');await showConfig('sistema');qs('#syKeyTest')?.click()}catch(x){keyErr(x.message)}};
  const t=qs('#syKeyTest');if(t)t.onclick=async()=>{t.disabled=true;t.innerHTML='<span class="pl-spin"></span> Testando…';
    try{const r=await api('POST','/api/settings/ai-key/test',{});const e=qs('#syKeyErr');e.style.color='var(--ok)';e.textContent=`Conexão OK · ${r.name} disponível para esta chave.`}catch(x){keyErr(x.message)}finally{t.disabled=false;t.textContent='Testar conexão'}};
  const d=qs('#syKeyDel');if(d)d.onclick=safe(async()=>{if(!confirm('Remover a chave cadastrada? A IA fica indisponível (a menos que o servidor tenha uma chave no .env).'))return;await api('DELETE','/api/settings/ai-key');await refreshAI();toast('Chave removida');showConfig('sistema')});
  qs('#sySave').onclick=safe(async()=>{await api('PUT','/api/settings',{org_name:qs('#syOrg').value,default_role:qs('#syRole').value,banner:qs('#syBanner').value,session_hours:+qs('#sySess').value,pw_min:+qs('#syPw').value,ai_enabled:qs('#syAi').checked});
    const p=await api('GET','/api/me');S.org=p.org;S.ai=p.ai;setupAI();toast('Configurações salvas');showConfig('sistema')})}

/* ---------------- rotas ---------------- */
async function route(first){if(!S.me)return;const h=location.hash;let m;
  if((m=h.match(/^#\/d\/([\w-]+)/)))return openDoc(m[1]);
  if((m=h.match(/^#\/config(?:\/(\w+))?/)))return showConfig(m[1]||'perfil');
  if(h.startsWith('#/docs'))return showHome();
  const p=S.me.prefs||{};if(first&&p.open!=='home'&&p.lastDoc){location.replace('#/d/'+p.lastDoc);return}
  location.replace('#/docs')}

/* ---------------- partida ---------------- */
(async function start(){try{const p=await fetch('/api/me',{credentials:'same-origin'});if(p.ok){await onMe(await p.json());return}
    if(p.status===401){showLogin();return}throw new Error('HTTP '+p.status)}
  catch(e){authShell(`<h2>Servidor indisponível</h2><p class="sub">Não foi possível falar com o servidor do GPlanSiS|Flows (${esc(e.message)}).</p><button class="pl-btn pri" id="plRetry">Tentar de novo</button>`);const b=qs('#plRetry');if(b)b.addEventListener('click',()=>location.reload())}})();
})();
