/* =============================================================================
   app-fleet.js — the Fleet: hand work to Mission Control (build -295; the panel redrawn in -296)
   -----------------------------------------------------------------------------
   The owner of the operator's workspace hands tasks and projects to Mission
   Control, their own fleet of AI machines. Mission Control proposes who does it
   and where; NOTHING runs until the owner approves; the result comes back here
   to accept or send back. Every hand-off has an area: one of the owner's
   clients, or Personal (a goal).

   Server: server/routers/fleet.ts (fleet.status / connect / disconnect / list /
   request / act) and the rules in server/_core/fleet.ts. Mission Control calls
   LevelUp (never the other way round) with a key made in the panel below.

   Loaded LAST and only WRAPS earlier functions (initSidebars, renderHome,
   pmDelegateDialog, _cmdpActions): nothing earlier calls into this file, and
   for anyone the server says isn't allowed, nothing here draws anything.
   CSS is injected (#lu-fleet-css); handlers use _act().
============================================================================= */

var LUF={allowed:null,status:null,items:[],outbox:null,area:'all',showDone:false,tab:null,kind:'all',q:'',closed:{},more:{},open:false,key:null,loading:false,lastList:0,lastStatus:0,sendBack:null,err:null};
var LUF_CLIENTS=['LSI Media','CommunityForce','MeYouSocial'];
var LUF_STATE={requested:['Waiting for a plan','#64748b'],proposed:['Needs your approval','#d97706'],approved:['Approved','#2563eb'],running:['Running','#7c3aed'],review:['Ready for review','#0891b2'],done:['Done','#16a34a'],failed:["Didn't finish",'#dc2626'],cancelled:['Cancelled','#64748b']};

function _lufE(s){return (typeof esc==='function')?esc(s):String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function _lufA(fn,args,opts){return (typeof _act==='function')?_act(fn,args,opts):'';}
function _lufToast(msg,type){try{toast(type?{type:type,msg:msg}:msg);}catch(_){}}
function _lufAgo(iso){
  var t=Date.parse(iso||'');if(isNaN(t))return '';
  var s=Math.max(0,Math.round((Date.now()-t)/1000));
  if(s<60)return 'just now';if(s<3600)return Math.round(s/60)+' min ago';if(s<86400)return Math.round(s/3600)+' h ago';return Math.round(s/86400)+' d ago';
}
function _lufToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _lufAreaName(a){return a&&a.name?a.name:'No area';}
function _lufAreaColor(a){return a&&a.type==='personal'?'#0f766e':'#4338ca';}

/* ── talking to the server ──────────────────────────────────────────────── */
async function luFleetRefresh(force){
  if(LUF.loading)return;
  if(LUF.allowed===false)return;
  LUF.loading=true;
  try{
    if(force||!LUF.status||Date.now()-LUF.lastStatus>5*60e3){
      var st=await _trpc('fleet.status',undefined,'query');
      LUF.status=st;LUF.allowed=!!(st&&st.allowed);LUF.lastStatus=Date.now();
      if(LUF.allowed)_lufHelp();
      if(!LUF.allowed){_lufPaintAll();return;}
    }
    var l=await _trpc('fleet.list',undefined,'query');
    LUF.items=Array.isArray(l&&l.items)?l.items:[];LUF.outbox=(l&&l.outbox)||null;LUF.lastList=Date.now();LUF.err=null;
  }catch(e){LUF.err=String(e&&e.message||e).slice(0,200);}
  finally{LUF.loading=false;}
  _lufPaintAll();
}
function _lufPaintAll(){
  try{_lufSidebar();}catch(e){console.warn('[fleet] sidebar',e);}
  try{_lufTodayPaint();}catch(e){console.warn('[fleet] today',e);}
  if(LUF.open)try{_lufPanelPaint();}catch(e){console.warn('[fleet] panel',e);}
}
function _lufCounts(){
  var c={approve:0,review:0,running:0,waiting:0,failed:0,yours:0};
  LUF.items.forEach(function(r){if(r.status==='proposed')c.approve++;else if(r.status==='review')c.review++;else if(r.status==='running'||r.status==='approved')c.running++;else if(r.status==='requested')c.waiting++;else if(r.status==='failed')c.failed++;});
  c.yours=((LUF.outbox&&LUF.outbox.items)||[]).filter(function(x){return x.kind==='yours';}).length;
  return c;
}

/* ── sidebar row ────────────────────────────────────────────────────────── */
function _lufSidebar(){
  document.querySelectorAll('[data-sb]').forEach(function(sb){
    var old=sb.querySelector('.sg[data-group="fleet"]');if(old)old.remove();
    if(!LUF.allowed)return;
    var c=_lufCounts(),n=c.approve+c.review+c.failed;
    var g=document.createElement('div');g.className='sg';g.setAttribute('data-group','fleet');
    g.innerHTML='<div class="sg-body" style="padding:0 4px"><div class="si" role="button" tabindex="0" data-label="Fleet" title="Work handed to Mission Control"'+_lufA('luFleetOpen',[],{stop:true})+'>'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/></svg>'+
      '<span class="l">Fleet</span>'+(n?'<span class="luf-badge" aria-label="'+n+' waiting on you">'+n+'</span>':'')+'</div></div>';
    var pinned=sb.querySelector('.sg[data-group="pinned"]');
    if(pinned&&pinned.nextSibling)sb.insertBefore(g,pinned.nextSibling);
    else{var first=sb.querySelector('.sg');if(first)sb.insertBefore(g,first);else sb.appendChild(g);}
  });
}

/* ── Today card ─────────────────────────────────────────────────────────── */
function _lufTodayPaint(){
  var el=document.getElementById('home-main');if(!el)return;
  var old=el.querySelector(':scope > .luf-today');if(old)old.remove();
  if(!LUF.allowed)return;
  var c=_lufCounts();
  if(!LUF.items.length&&!c.yours&&!(LUF.status&&LUF.status.connected))return;
  _lufCSS();
  var bits=[];
  if(c.approve)bits.push('<b>'+c.approve+'</b> to approve');
  if(c.review)bits.push('<b>'+c.review+'</b> to review');
  if(c.failed)bits.push('<b>'+c.failed+'</b> didn’t finish');
  if(c.running)bits.push(c.running+' in progress');
  if(c.waiting)bits.push(c.waiting+' waiting for a plan');
  if(c.yours)bits.push(c.yours+' waiting on you in Mission Control');
  var html='<div class="luf-today" role="region" aria-label="Fleet"><span class="luf-ico" aria-hidden="true">🤖</span><div class="luf-t"><b>Fleet</b><span>'+(bits.length?bits.join(' · '):'Nothing handed off right now. Open a task and choose Hand off → Send to the Fleet.')+'</span></div>'+
    '<button class="btn '+(c.approve||c.review?'btn-p':'btn-s')+'"'+_lufA('luFleetOpen',[])+'>Open</button></div>';
  var after=el.querySelector(':scope > .lu-start')||el.querySelector(':scope > .lu-today-bar');
  if(after)after.insertAdjacentHTML('afterend',html);else el.insertAdjacentHTML('afterbegin',html);
}

/* ── the panel ──────────────────────────────────────────────────────────── */
function luFleetOpen(){
  _lufCSS();
  var ov=document.getElementById('luf-ov');
  if(!ov){
    ov=document.createElement('div');ov.id='luf-ov';
    ov.addEventListener('mousedown',function(e){if(e.target===ov)luFleetClose();});
    ov.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();luFleetClose();}});
    ov.addEventListener('input',function(e){if(e.target&&e.target.id==='luf-q')_lufSearch(e.target.value);});
    document.body.appendChild(ov);
  }
  LUF.open=true;ov.hidden=false;
  _lufPanelPaint();
  setTimeout(function(){var f=document.querySelector('#luf-dlg .luf-x');if(f)f.focus();},30);
  luFleetRefresh(true);
}
function luFleetClose(){LUF.open=false;LUF.key=null;LUF.tab=null;LUF.q='';var ov=document.getElementById('luf-ov');if(ov){ov.hidden=true;ov.innerHTML='';}}
function luFleetArea(a){LUF.area=a;_lufPanelPaint();}
function luFleetToggleDone(){LUF.showDone=!LUF.showDone;_lufPanelPaint();}

function luFleetTab(t){LUF.tab=t;_lufPanelPaint();var b=document.querySelector('#luf-dlg .luf-body');if(b)b.scrollTop=0;}
function luFleetKind(k){LUF.kind=k;_lufPanelPaint();}
function luFleetGroup(name){LUF.closed[name]=!LUF.closed[name];_lufObPaint();}
function luFleetMore(name){LUF.more[name]=!LUF.more[name];_lufObPaint();}
function _lufSearch(v){LUF.q=String(v||'').slice(0,80);_lufObPaint();}
/* A "waiting on you" line from Mission Control reads "what — to do — why — how". */
function _lufObParts(x){
  var p=String(x.title||'').split(/\s+—\s+/),o={title:p[0]||'',state:'',why:'',how:''},i=1;
  if(p[i]&&/^(to do|optional|waiting|blocked|in progress)$/i.test(p[i])){o.state=p[i].toLowerCase();i++;}
  var rest=p.slice(i);
  if(rest.length>=2){o.how=rest.pop();o.why=rest.join(' — ');}else if(rest.length===1)o.why=rest[0];
  return o;
}
function _lufObList(){
  var q=(LUF.q||'').toLowerCase().trim();
  return ((LUF.outbox&&LUF.outbox.items)||[]).filter(function(x){
    if(LUF.area!=='all'&&(x.area||'No area')!==LUF.area)return false;
    if(LUF.kind!=='all'&&x.kind!==LUF.kind)return false;
    if(q&&(String(x.title||'')+' '+String(x.project||'')+' '+String(x.detail||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  });
}
var LUF_KIND={yours:['Yours','#d97706'],review:['Review','#0891b2'],waiting:['Waiting','#64748b']};
function _lufObHtml(){
  var ob=_lufObList(),all=((LUF.outbox&&LUF.outbox.items)||[]);
  if(!all.length)return '<div class="luf-empty"><b>Nothing is waiting on you.</b><span>When Mission Control needs a decision, a sign-in or a review, it shows up here.</span></div>';
  if(!ob.length)return '<div class="luf-empty"><b>No matches.</b><span>Try another word, or clear the filters.</span></div>';
  var groups={},order=[];
  ob.forEach(function(x){var g=x.project||'Other';if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(x);});
  order.sort(function(a,b){return groups[b].length-groups[a].length||a.localeCompare(b);});
  return order.map(function(g){
    var rows=groups[g],closed=!!LUF.closed[g],more=!!LUF.more[g]||!!LUF.q,shown=more?rows:rows.slice(0,5);
    var short=g.indexOf('/')>=0?g.slice(g.lastIndexOf('/')+1):g,area=rows[0].area;
    var h='<section class="luf-grp"><button class="luf-grph" aria-expanded="'+(!closed)+'"'+_lufA('luFleetGroup',[g])+'><span class="luf-chev" aria-hidden="true">'+(closed?'▸':'▾')+'</span><b>'+_lufE(short)+'</b>'+(area?'<span class="luf-tag">'+_lufE(area)+'</span>':'')+'<span class="luf-cnt">'+rows.length+'</span></button>';
    if(closed)return h+'</section>';
    h+='<ul class="luf-ob">'+shown.map(function(x){
      var p=_lufObParts(x),k=LUF_KIND[x.kind]||LUF_KIND.yours;
      return '<li class="luf-it"><span class="luf-dot" style="--c:'+k[1]+'" title="'+k[0]+'"></span><div class="luf-itb"><div class="luf-itt"><b>'+_lufE(p.title)+'</b>'+
        (x.kind!=='yours'?'<span class="luf-pill" style="--c:'+k[1]+'">'+k[0]+'</span>':'')+
        (p.state?'<span class="luf-state'+(p.state==='optional'?' opt':'')+'">'+_lufE(p.state)+'</span>':'')+
        (x.due?'<span class="luf-state">due '+_lufE(x.due)+'</span>':'')+'</div>'+
        (p.how?'<div class="luf-next"><span>Next</span>'+_lufE(p.how)+'</div>':'')+
        (p.why?'<div class="luf-why">'+_lufE(p.why)+'</div>':'')+
        (x.detail?'<div class="luf-src">'+_lufE(x.detail)+'</div>':'')+'</div></li>';
    }).join('')+'</ul>';
    if(rows.length>5&&!LUF.q)h+='<button class="luf-link luf-morebtn"'+_lufA('luFleetMore',[g])+'>'+(more?'Show fewer':'Show all '+rows.length)+'</button>';
    return h+'</section>';
  }).join('');
}
function _lufObPaint(){var w=document.getElementById('luf-ob-wrap');if(w)w.innerHTML=_lufObHtml();else _lufPanelPaint();}

function _lufPanelPaint(){
  var ov=document.getElementById('luf-ov');if(!ov||ov.hidden)return;
  var st=LUF.status||{},c=_lufCounts();
  var keep=ov.querySelector('#luf-sendback-text');var keepVal=keep?keep.value:'';
  var hadSearch=document.activeElement&&document.activeElement.id==='luf-q';
  var obAll=((LUF.outbox&&LUF.outbox.items)||[]);
  var active=LUF.items.filter(function(r){return r.status!=='done'&&r.status!=='cancelled';});
  var fin=LUF.items.filter(function(r){return r.status==='done'||r.status==='cancelled';});
  if(!LUF.tab)LUF.tab=(active.length||!obAll.length)?'handoffs':'yours';
  var fresh=st.connected&&st.seenAt&&(Date.now()-Date.parse(st.seenAt)<15*60e3);
  var html='<div id="luf-dlg" role="dialog" aria-modal="true" aria-labelledby="luf-h"><div class="luf-head">'+
    '<span class="luf-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 16h6"/></svg></span>'+
    '<div class="luf-ht"><h2 id="luf-h">Fleet</h2><span class="luf-conn"><i class="luf-live'+(fresh?' on':'')+'" aria-hidden="true"></i>'+(st.connected?(st.seenAt?'Mission Control checked in '+_lufE(_lufAgo(st.seenAt))+(st.seenMachine?' from '+_lufE(st.seenMachine):''):'Connected. Mission Control hasn’t checked in yet'):'Not connected')+'</span></div>'+
    '<button class="btn btn-p"'+_lufA('luFleetNew',[])+'>+ Hand something off</button><button class="luf-x" aria-label="Close"'+_lufA('luFleetClose',[])+'>×</button></div><div class="luf-body">';
  if(LUF.err)html+='<div class="luf-note luf-warn">Couldn’t load: '+_lufE(LUF.err)+'</div>';
  if(LUF.key)html+=_lufKeyHtml();
  else if(!st.connected)html+=_lufConnectHtml();
  // the numbers, each a way in
  var stat=function(n,label,tab,hot){return '<button class="luf-stat'+(hot&&n?' hot':'')+'"'+_lufA('luFleetTab',[tab])+'><span class="luf-n">'+n+'</span><span class="luf-sl">'+label+'</span></button>';};
  html+='<div class="luf-stats">'+stat(c.approve,'Need your approval','handoffs',true)+stat(c.running+c.waiting,'In progress','handoffs',false)+stat(c.review+c.failed,'Ready for review','handoffs',true)+stat(obAll.length,'Waiting on you','yours',false)+'</div>';
  var tab=function(id,label,n){return '<button role="tab" aria-selected="'+(LUF.tab===id)+'" class="'+(LUF.tab===id?'on':'')+'"'+_lufA('luFleetTab',[id])+'>'+label+(n?' <span>'+n+'</span>':'')+'</button>';};
  html+='<div class="luf-tabs" role="tablist" aria-label="Fleet">'+tab('handoffs','Hand-offs',active.length)+tab('yours','Waiting on you',obAll.length)+tab('done','Finished',fin.length)+'</div>';
  // area filter
  var areas={};LUF.items.forEach(function(r){var a=r.data&&r.data.area;areas[_lufAreaName(a)]=a||{type:'client',name:'No area'};});
  obAll.forEach(function(x){if(x.area&&!areas[x.area])areas[x.area]={type:/^personal/i.test(x.area)?'personal':'client',name:x.area};});
  var names=Object.keys(areas).sort(function(a,b){var pa=areas[a].type==='personal',pb=areas[b].type==='personal';return pa===pb?a.localeCompare(b):(pa?1:-1);});
  var areaChips=names.length>1?'<div class="luf-chips" role="group" aria-label="Area">'+['all'].concat(names).map(function(n){return '<button class="luf-chip'+(LUF.area===n?' on':'')+'" aria-pressed="'+(LUF.area===n)+'"'+_lufA('luFleetArea',[n])+'>'+(n==='all'?'All areas':_lufE(n))+'</button>';}).join('')+'</div>':'';
  var inArea=function(r){return LUF.area==='all'||_lufAreaName(r.data&&r.data.area)===LUF.area;};
  var sec=function(title,rows){return rows.length?'<h3 class="luf-sec">'+title+' <span>'+rows.length+'</span></h3>'+rows.map(_lufCard).join(''):'';};
  if(LUF.tab==='handoffs'){
    var list=active.filter(inArea);
    html+=areaChips;
    if(!list.length)html+='<div class="luf-empty"><b>'+(active.length?'Nothing in this area.':'Nothing handed off right now.')+'</b><span>Hand a task or a project to your fleet of AI machines. Nothing runs until you approve the plan.</span>'+
      '<ol class="luf-steps"><li><i>1</i><span>Open a task, choose <b>Hand off</b>, then <b>Send to the Fleet</b></span></li><li><i>2</i><span>Mission Control proposes who does it and where</span></li><li><i>3</i><span>You approve, then review the result here</span></li></ol></div>';
    html+=sec('Needs your approval',list.filter(function(r){return r.status==='proposed';}));
    html+=sec('Ready for your review',list.filter(function(r){return r.status==='review';}));
    html+=sec('Didn’t finish',list.filter(function(r){return r.status==='failed';}));
    html+=sec('In progress',list.filter(function(r){return ['requested','approved','running'].indexOf(r.status)>=0;}));
  }else if(LUF.tab==='yours'){
    var kinds={all:obAll.length,yours:0,review:0,waiting:0};obAll.forEach(function(x){kinds[x.kind]=(kinds[x.kind]||0)+1;});
    html+='<div class="luf-tools"><input id="luf-q" class="inp" type="search" placeholder="Search what’s waiting on you" aria-label="Search what’s waiting on you" value="'+_lufE(LUF.q||'')+'">'+
      '<div class="luf-chips" role="group" aria-label="Kind">'+[['all','All'],['yours','Yours'],['review','To review'],['waiting','Waiting']].filter(function(k){return k[0]==='all'||kinds[k[0]];}).map(function(k){return '<button class="luf-chip'+(LUF.kind===k[0]?' on':'')+'" aria-pressed="'+(LUF.kind===k[0])+'"'+_lufA('luFleetKind',[k[0]])+'>'+k[1]+' <span>'+kinds[k[0]]+'</span></button>';}).join('')+'</div></div>'+areaChips+
      (obAll.length?'<div class="luf-note">From your repositories and the fleet’s work, as of '+_lufE(_lufAgo(LUF.outbox.at))+'. Do these in Mission Control (Work) or where they live.</div>':'')+
      '<div id="luf-ob-wrap">'+_lufObHtml()+'</div>';
  }else{
    var done=fin.filter(inArea);
    html+=areaChips+(done.length?done.map(_lufCard).join(''):'<div class="luf-empty"><b>Nothing finished yet.</b><span>Accepted and cancelled hand-offs from the last 30 days appear here.</span></div>');
  }
  if(st.connected)html+='<div class="luf-foot"><button class="luf-link"'+_lufA('luFleetConnect',[])+'>Make a new key</button> · <button class="luf-link"'+_lufA('luFleetDisconnect',[])+'>Disconnect Mission Control</button></div>';
  html+='</div></div>';
  ov.innerHTML=html;
  var ta=ov.querySelector('#luf-sendback-text');if(ta){ta.value=keepVal;ta.focus();}
  else if(hadSearch){var q=ov.querySelector('#luf-q');if(q){q.focus();try{q.setSelectionRange(q.value.length,q.value.length);}catch(_){}}}
}

function _lufCard(r){
  var d=r.data||{},s=LUF_STATE[r.status]||LUF_STATE.requested,a=d.area;
  var last=(d.updates||[]).slice(-1)[0];
  var h='<div class="luf-card" data-id="'+r.id+'"><div class="luf-row"><span class="luf-pill" style="--c:'+s[1]+'">'+s[0]+'</span><b class="luf-title">'+_lufE(r.title)+'</b>'+
    '<span class="luf-area" style="--c:'+_lufAreaColor(a)+'">'+_lufE(_lufAreaName(a))+(a&&a.goalTitle?' · '+_lufE(a.goalTitle):'')+'</span></div>';
  var meta=[];
  if(d.kind==='project')meta.push('Project');
  if(d.access==='answer')meta.push('Answer only');else meta.push('May change files once approved');
  if(d.when&&d.when>_lufToday()&&['requested','proposed','approved'].indexOf(r.status)>=0)meta.push('Starts '+_lufE(d.when));
  if(d.proposal&&d.proposal.machine)meta.push(_lufE(d.proposal.machine));
  h+='<div class="luf-m">'+meta.join(' · ')+'</div>';
  if(d.proposal&&(r.status==='proposed'||r.status==='approved'))h+='<div class="luf-prop"><b>Plan:</b> '+_lufE(d.proposal.summary)+(d.proposal.folder?'<div class="luf-m">Folder: '+_lufE(d.proposal.folder)+'</div>':'')+'</div>';
  if(r.status==='review'&&d.result)h+='<div class="luf-result" tabindex="0" aria-label="Result">'+_lufE(d.result.text)+'</div>';
  if(r.status==='failed'&&d.error)h+='<div class="luf-note luf-warn">'+_lufE(d.error)+'</div>';
  if(last&&r.status!=='review')h+='<div class="luf-m">'+(last.by==='fleet'?'Mission Control: ':'You: ')+_lufE(last.text)+' · '+_lufE(_lufAgo(last.at))+'</div>';
  var b=[];
  var task=r.refType==='task'?_lufTask(r.refId):null;
  if(r.status==='proposed')b.push('<button class="btn btn-p"'+_lufA('luFleetAct',[r.id,'approve'])+'>Approve</button>');
  if(r.status==='review'){
    b.push('<button class="btn btn-p"'+_lufA('luFleetAct',[r.id,'accept'])+'>Accept</button>');
    if(task&&task.status!=='Done')b.push('<button class="btn btn-s"'+_lufA('luFleetAct',[r.id,'accept',true])+'>Accept and complete the task</button>');
    b.push('<button class="btn btn-s"'+_lufA('luFleetSendBackOpen',[r.id])+'>Send back</button>');
  }
  if(r.status==='failed')b.push('<button class="btn btn-p"'+_lufA('luFleetAct',[r.id,'retry'])+'>Try again</button>');
  if(['requested','proposed','approved','running','review'].indexOf(r.status)>=0)b.push('<button class="btn btn-s luf-cancel"'+_lufA('luFleetAct',[r.id,'cancel'])+'>Cancel</button>');
  if(task)b.push('<button class="luf-link"'+_lufA('luFleetOpenTask',[r.refId])+'>Open the task</button>');
  if(LUF.sendBack===r.id)h+='<div class="luf-sb"><label for="luf-sendback-text">What should change?</label><textarea id="luf-sendback-text" class="inp" rows="3"></textarea><div class="luf-acts"><button class="btn btn-s"'+_lufA('luFleetSendBackOpen',[null])+'>Cancel</button><button class="btn btn-p"'+_lufA('luFleetSendBack',[r.id])+'>Send back</button></div></div>';
  else if(b.length)h+='<div class="luf-acts">'+b.join('')+'</div>';
  return h+'</div>';
}
function _lufTask(id){return (D.tasks||[]).find(function(t){return String(t.id)===String(id);})||null;}
function luFleetOpenTask(id){luFleetClose();try{if(typeof openDrawer==='function'){var t=_lufTask(id);if(t)openDrawer('task',t);}}catch(_){}}
function luFleetSendBackOpen(id){LUF.sendBack=id;_lufPanelPaint();}
async function luFleetSendBack(id){
  var ta=document.getElementById('luf-sendback-text'),note=ta?ta.value.trim():'';
  if(!note){_lufToast('Say what should change','warn');return;}
  LUF.sendBack=null;await luFleetAct(id,'sendBack',false,note);
}
async function luFleetAct(id,action,completeTask,note){
  if(action==='cancel'&&!confirm('Cancel this? If it is running, Mission Control stops it.'))return;
  try{
    var row=await _trpc('fleet.act',{id:id,action:action,note:note||undefined},'mutation');
    var i=LUF.items.findIndex(function(x){return x.id===id;});if(i>=0&&row)LUF.items[i]=row;
    if(row&&row.refType==='task'){
      var t=_lufTask(row.refId);
      if(t&&(action==='cancel'||action==='accept')&&String(t.fleetId)===String(id)){
        if(t.delegatedTo==='Fleet')delete t.delegatedTo;
        if(action==='cancel'&&t.status==='Delegated'&&t.fleetSetDelegated)t.status='Not Started';
        delete t.fleetSetDelegated;
        if(completeTask&&typeof setTaskStatus==='function')setTaskStatus(t,'Done');
        else try{save('tasks');}catch(_){}
      }
    }
    _lufToast({approve:'Approved — Mission Control will start it',cancel:'Cancelled',accept:completeTask?'Accepted and the task is done':'Accepted',sendBack:'Sent back',retry:'It will be tried again'}[action]||'Done');
  }catch(e){_lufToast(String(e&&e.message||e).slice(0,160),'error');}
  _lufPaintAll();
}

/* connecting Mission Control */
function _lufConnectHtml(){
  return '<div class="luf-connect"><b>Connect Mission Control</b><p>Mission Control runs on your own computers and never accepts connections, so it checks LevelUp for work every minute using a key you make here. The key is shown once; LevelUp keeps only a fingerprint of it.</p>'+
    '<button class="btn btn-p"'+_lufA('luFleetConnect',[])+'>Make a key for Mission Control</button></div>';
}
function _lufKeyHtml(){
  return '<div class="luf-connect"><b>Your key (shown once)</b><p>In Mission Control open <b>Work → LevelUp</b>, paste the address and the key, and press Connect. Any earlier key has stopped working.</p>'+
    '<label class="luf-m" for="luf-url">LevelUp address</label><input id="luf-url" class="inp" readonly value="'+_lufE(location.origin)+'">'+
    '<label class="luf-m" for="luf-key">Key</label><div class="luf-keyrow"><input id="luf-key" class="inp" readonly value="'+_lufE(LUF.key)+'"><button class="btn btn-s"'+_lufA('luFleetCopyKey',[])+'>Copy</button></div>'+
    '<div class="luf-acts"><button class="btn btn-s"'+_lufA('luFleetKeyDone',[])+'>I’ve copied it</button></div></div>';
}
async function luFleetConnect(){
  if(LUF.status&&LUF.status.connected&&!confirm('Make a new key? Mission Control stops working until you give it the new one.'))return;
  try{var r=await _trpc('fleet.connect',undefined,'mutation');LUF.key=r&&r.key;await luFleetRefresh(true);}
  catch(e){_lufToast(String(e&&e.message||e).slice(0,160),'error');}
}
function luFleetCopyKey(){var el=document.getElementById('luf-key');if(!el)return;try{navigator.clipboard.writeText(el.value).then(function(){_lufToast('Key copied');});}catch(_){el.select();}}
function luFleetKeyDone(){LUF.key=null;_lufPanelPaint();}
async function luFleetDisconnect(){
  if(!confirm('Disconnect Mission Control? Its key stops working at once. Hand-offs already here stay.'))return;
  try{await _trpc('fleet.disconnect',undefined,'mutation');await luFleetRefresh(true);_lufToast('Mission Control disconnected');}
  catch(e){_lufToast(String(e&&e.message||e).slice(0,160),'error');}
}

/* ── handing something off ──────────────────────────────────────────────── */
function _lufClientNames(){
  var seen={},out=[];
  LUF_CLIENTS.concat((D.programs||[]).filter(function(p){return p&&p.name&&!p.archived;}).map(function(p){return p.name;})).forEach(function(n){var k=String(n).trim().toLowerCase();if(k&&!seen[k]){seen[k]=1;out.push(String(n).trim());}});
  return out;
}
/** The area a task belongs to: its project's program if that is a client, else its goal, else the last one used. */
function _lufGuessArea(t){
  if(t){
    var prog=t.projectId!=null?(D.programs||[]).find(function(p){return (p.projectIds||[]).some(function(id){return String(id)===String(t.projectId);});}):null;
    if(prog){var low=String(prog.name).toLowerCase(),hit=LUF_CLIENTS.find(function(c){return low.indexOf(c.toLowerCase())>=0;});return {type:'client',name:hit||prog.name};}
    if(t.linkedGoalId!=null){var g=(D.goals||[]).find(function(x){return String(x.id)===String(t.linkedGoalId);});if(g)return {type:'personal',name:'Personal',goalId:String(g.id),goalTitle:g.title};}
  }
  try{var v=JSON.parse(localStorage.getItem('lu_fleet_area')||'null');if(v&&v.name)return v;}catch(_){}
  return null;
}
/** o = {taskId?} — the request dialog. */
function luFleetNew(o){
  o=o||{};_lufCSS();
  var t=o.taskId!=null?_lufTask(o.taskId):null;
  var guess=_lufGuessArea(t);
  var areaVal=guess?(guess.type==='personal'?'personal':'client:'+guess.name):'';
  var goals=(D.goals||[]).filter(function(g){return g&&g.title&&g.status!=='Archived'&&g.status!=='archived'&&g.status!=='Completed';});
  var html='<div id="luf-req" role="dialog" aria-modal="true" aria-labelledby="luf-req-h"><div class="luf-head"><h2 id="luf-req-h">🤖 Send to the Fleet</h2><button class="luf-x" aria-label="Close"'+_lufA('luFleetNewClose',[])+'>×</button></div><div class="luf-body">'+
    '<p class="luf-m" style="margin:0 0 10px">Mission Control proposes which machine and tool does it, and where. Nothing starts until you approve the plan.</p>'+
    (t?'<div class="luf-f"><span class="luf-lab">Task</span><b>'+_lufE(t.title)+'</b></div>':'<div class="luf-f"><label class="luf-lab" for="lufr-title">What is it?</label><input id="lufr-title" class="inp" placeholder="e.g. Draft three LinkedIn posts about the spring campaign"></div>')+
    (t?'':'<div class="luf-f"><span class="luf-lab">Kind</span><div role="radiogroup" aria-label="Kind" class="luf-seg"><label><input type="radio" name="lufr-kind" value="task" checked> A task</label><label><input type="radio" name="lufr-kind" value="project"> A project (planned into steps)</label></div></div>')+
    '<div class="luf-f"><label class="luf-lab" for="lufr-area">Area</label><select id="lufr-area" class="inp"><option value="">— choose —</option><optgroup label="Client work">'+
      _lufClientNames().map(function(n){var v='client:'+n;return '<option value="'+_lufE(v)+'"'+(areaVal===v?' selected':'')+'>'+_lufE(n)+'</option>';}).join('')+
      '</optgroup><optgroup label="Personal"><option value="personal"'+(areaVal==='personal'?' selected':'')+'>Personal (a goal or objective)</option></optgroup></select></div>'+
    '<div class="luf-f" id="lufr-goal-row"'+(areaVal==='personal'?'':' hidden')+'><label class="luf-lab" for="lufr-goal">Goal</label><select id="lufr-goal" class="inp"><option value="">— none —</option>'+
      goals.map(function(g){return '<option value="'+_lufE(g.id)+'"'+(guess&&guess.goalId===String(g.id)?' selected':'')+'>'+_lufE(g.title)+'</option>';}).join('')+'</select></div>'+
    '<div class="luf-f"><label class="luf-lab" for="lufr-when">Start on</label><input id="lufr-when" class="inp" type="date" value="'+_lufToday()+'"><span class="luf-m">Approve today, run on this day.</span></div>'+
    '<div class="luf-f"><span class="luf-lab">Once approved</span><div role="radiogroup" aria-label="Once approved" class="luf-seg"><label><input type="radio" name="lufr-access" value="edit" checked> It may change files</label><label><input type="radio" name="lufr-access" value="answer"> Answer only</label></div></div>'+
    '<div class="luf-f"><label class="luf-lab" for="lufr-ins">Instructions</label><textarea id="lufr-ins" class="inp" rows="4" placeholder="What done looks like, links, which repository or folder if you know it">'+(t&&t.notes?_lufE(String(t.notes).slice(0,2000)):'')+'</textarea></div>'+
    '<div class="luf-acts"><button class="btn btn-s"'+_lufA('luFleetNewClose',[])+'>Cancel</button><button class="btn btn-p" id="lufr-go"'+_lufA('luFleetSubmit',[o.taskId==null?null:o.taskId])+'>Send to the Fleet</button></div></div></div>';
  var ov=document.getElementById('luf-req-ov');
  if(!ov){
    ov=document.createElement('div');ov.id='luf-req-ov';
    ov.addEventListener('mousedown',function(e){if(e.target===ov)luFleetNewClose();});
    ov.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();luFleetNewClose();}});
    ov.addEventListener('change',function(e){if(e.target&&e.target.id==='lufr-area'){var row=document.getElementById('lufr-goal-row');if(row)row.hidden=e.target.value!=='personal';}});
    document.body.appendChild(ov);
  }
  ov.innerHTML=html;ov.hidden=false;
  setTimeout(function(){var f=document.getElementById(t?'lufr-area':'lufr-title');if(f)f.focus();},30);
}
function luFleetNewClose(){var ov=document.getElementById('luf-req-ov');if(ov){ov.hidden=true;ov.innerHTML='';}}
async function luFleetSubmit(taskId){
  var v=function(id){var el=document.getElementById(id);return el?el.value:'';};
  var radio=function(n){var el=document.querySelector('input[name="'+n+'"]:checked');return el?el.value:'';};
  var t=taskId!=null?_lufTask(taskId):null;
  var title=t?t.title:v('lufr-title').trim();
  if(!title){_lufToast('Say what you are handing off','warn');return;}
  var av=v('lufr-area');if(!av){_lufToast('Choose an area: which client, or Personal','warn');return;}
  var area;
  if(av==='personal'){var gid=v('lufr-goal'),g=gid?(D.goals||[]).find(function(x){return String(x.id)===gid;}):null;area={type:'personal',name:'Personal',goalId:g?String(g.id):null,goalTitle:g?g.title:null};}
  else area={type:'client',name:av.slice(7)};
  var proj=t&&t.projectId!=null?(D.projects||[]).find(function(p){return String(p.id)===String(t.projectId);}):null;
  var input={title:title,kind:t?'task':(radio('lufr-kind')||'task'),refType:t?'task':'text',refId:t?String(t.id):null,projectKey:t&&t.projectId!=null?'p:'+t.projectId:'',
    instructions:v('lufr-ins').slice(0,8000),area:area,when:v('lufr-when')||null,access:radio('lufr-access')==='answer'?'answer':'edit',
    snapshot:t?{notes:String(t.notes||t.description||'').slice(0,6000),due:t.due||null,projectName:proj?String(proj.name).slice(0,200):'',subtasks:(t.subtasks||[]).slice(0,40).map(function(s){return String(s&&(s.title||s.text)||s).slice(0,300);})}:undefined};
  var btn=document.getElementById('lufr-go');if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    var row=await _trpc('fleet.request',input,'mutation');
    try{localStorage.setItem('lu_fleet_area',JSON.stringify(area));}catch(_){}
    if(t&&row){
      t.fleetId=row.id;t.delegatedTo='Fleet';t.updatedAt=new Date().toISOString();
      if(t.status==='Not Started'){t.status='Delegated';t.fleetSetDelegated=true;}
      t.comments=t.comments||[];t.comments.push({id:Date.now(),author:(D.creds&&D.creds.userName)||'',ts:new Date().toLocaleString(),text:'Handed to the Fleet ('+area.name+(area.goalTitle?' · '+area.goalTitle:'')+')',type:'delegation'});
      try{save('tasks');}catch(_){}
    }
    luFleetNewClose();
    _lufToast('🤖 Sent to the Fleet. Mission Control will propose a plan for you to approve.');
    if(row)LUF.items.unshift(row);
    _lufPaintAll();
    try{if(typeof renderCurrentTaskView==='function'&&typeof curScreen!=='undefined'&&curScreen==='tasks')renderCurrentTaskView();}catch(_){}
  }catch(e){if(btn){btn.disabled=false;btn.textContent='Send to the Fleet';}_lufToast(String(e&&e.message||e).slice(0,180),'error');}
}

/** The Help article: added only for someone the server lets use the Fleet, so customers never see it. */
function _lufHelp(){
  try{

    if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='fleet';})){
      HC_ARTICLES.push({id:78,slug:'fleet',catId:13,title:'The Fleet: hand work to Mission Control',
        summary:'Hand tasks and projects to your own AI machines, approve the plan, review the result.',
        tags:['fleet','mission control','ai','agents','delegate','hand off','automation','approve','client','personal','goal'],
        body:[
          '## What the Fleet is',
          '',
          'If you run Mission Control on your own computers, LevelUp can hand it tasks and projects. Mission Control decides which machine and AI tool should do the work, and where. You approve the plan before anything starts, and the result comes back here for you to accept or send back.',
          '',
          'The Fleet is shown only to the owner of the workspace it is set up for.',
          '',
          '## Hand something off',
          '- Open a task and choose **Hand off**, then **Send to the Fleet**. Or open the command palette and choose **Hand something to the Fleet**.',
          '- Choose the **area**: one of your clients, or **Personal** with the goal it serves.',
          '- **Start on** lets you plan ahead: approve today, and it runs on the day you chose.',
          '- **Once approved** says whether it may change files, or only investigate and answer.',
          '',
          '## Approve, review, accept',
          'The **Fleet** entry in the sidebar shows how many items are waiting on you. In the Fleet panel:',
          '- **Needs your approval**: read Mission Control’s plan, then choose **Approve** or **Cancel**.',
          '- **Ready for your review**: read the result, then **Accept**, **Accept and complete the task**, or **Send back** with what should change.',
          '- **Mission Control: waiting on you** lists what Mission Control says only you can do, such as decisions, sign-ins and reviews.',
          '',
          '## Connect Mission Control',
          'In the Fleet panel, choose **Make a key for Mission Control**, then paste the address and the key into Mission Control under **Work → LevelUp**. Mission Control checks LevelUp for work every minute. LevelUp never connects to your computers. A new key replaces the old one, and **Disconnect** stops it at once.'
        ].join('\n')});
    }
  }catch(_){}
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
function _lufCSS(){
  if(document.getElementById('lu-fleet-css'))return;
  var st=document.createElement('style');st.id='lu-fleet-css';
  st.textContent=[
'.luf-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--ac);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}',
'body.sidebar-collapsed .sg[data-group="fleet"] .luf-badge{position:absolute;top:2px;right:2px}',
'.luf-today{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0 0 14px;border:1px solid var(--bd2);border-radius:12px;background:var(--s1)}',
'.luf-today .luf-ico{font-size:22px}.luf-today .luf-t{flex:1;display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--t2)}.luf-today .luf-t b{color:var(--t1)}',
'#luf-ov,#luf-req-ov{position:fixed;inset:0;z-index:var(--z-modal,1000);background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px}',
'#luf-dlg,#luf-req{background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:14px;width:min(960px,100%);height:min(860px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.45)}',
'#luf-req{width:min(560px,100%);height:auto}',
'.luf-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--bd1,var(--bd2));flex-wrap:wrap}',
'.luf-head h2{font-size:17px;font-weight:700;margin:0;letter-spacing:-.01em}.luf-conn{font-size:12px;color:var(--t2);display:flex;align-items:center;gap:6px}',
'.luf-ht{flex:1;min-width:160px;display:flex;flex-direction:column;gap:1px}',
'.luf-mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--acs);color:var(--ach)}.luf-mark svg{width:20px;height:20px}',
'.luf-live{width:7px;height:7px;border-radius:50%;background:var(--t3);flex-shrink:0}.luf-live.on{background:var(--ok);box-shadow:0 0 0 3px color-mix(in oklab,var(--ok) 22%,transparent)}',
'.luf-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:4px 0 14px}',
'.luf-stat{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:12px 14px;border-radius:12px;border:1px solid var(--bd2);background:var(--s2);color:var(--t1);cursor:pointer;text-align:left;font:inherit}',
'.luf-stat:hover,.luf-stat:focus-visible{border-color:var(--bd3)}.luf-stat.hot{border-color:color-mix(in oklab,var(--ac) 55%,var(--bd2));background:color-mix(in oklab,var(--ac) 9%,var(--s2))}',
'.luf-n{font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.luf-stat.hot .luf-n{color:var(--ach)}.luf-sl{font-size:12px;color:var(--t2)}',
'.luf-tabs{display:inline-flex;padding:3px;border:1px solid var(--bd2);border-radius:11px;background:var(--s2);margin:0 0 10px;max-width:100%;overflow-x:auto}',
'.luf-tabs button{height:30px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--t2);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}',
'.luf-tabs button span{font-size:11px;font-weight:700;margin-left:4px;padding:1px 6px;border-radius:9px;background:var(--s3);color:var(--t2)}',
'.luf-tabs button.on{background:var(--s3);color:var(--t1);font-weight:600;box-shadow:inset 0 0 0 1px var(--bd2)}.luf-tabs button.on span{background:var(--ac);color:#fff}',
'.luf-chip{height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--bd2);background:none;color:var(--t2);font:inherit;font-size:12px;cursor:pointer}.luf-chip span{color:var(--t3);margin-left:2px}',
'.luf-chip.on{background:var(--acs);border-color:color-mix(in oklab,var(--ac) 50%,var(--bd2));color:var(--t1);font-weight:600}',
'.luf-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 6px}.luf-tools .inp{flex:1;min-width:200px;height:34px;font-size:13px}',
'.luf-grp{border:1px solid var(--bd2);border-radius:12px;background:var(--s2);margin:0 0 10px;overflow:hidden}',
'.luf-grph{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:0;background:none;color:var(--t1);font:inherit;font-size:13.5px;cursor:pointer;text-align:left}.luf-grph:hover{background:var(--s3)}',
'.luf-chev{color:var(--t3);width:12px}.luf-cnt{margin-left:auto;font-size:11px;font-weight:700;padding:1px 7px;border-radius:9px;background:var(--s3);color:var(--t2)}',
'.luf-tag{font-size:11px;font-weight:600;padding:1px 7px;border-radius:6px;background:var(--acs);color:var(--t1)}',
'.luf-it{display:flex;gap:10px;padding:10px 12px;border-top:1px solid var(--bd1,var(--bd2))}.luf-itb{flex:1;min-width:0}',
'.luf-dot{width:8px;height:8px;border-radius:50%;background:var(--c);margin-top:6px;flex-shrink:0}',
'.luf-itt{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;font-size:13.5px}.luf-itt b{font-weight:600}',
'.luf-state{font-size:11px;font-weight:600;padding:1px 7px;border-radius:6px;background:color-mix(in oklab,var(--warn) 16%,transparent);color:var(--warn)}.luf-state.opt{background:var(--s3);color:var(--t2)}',
'.luf-next{font-size:12.5px;color:var(--t1);margin-top:4px;display:flex;gap:8px;align-items:baseline}.luf-next span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ach);flex-shrink:0}',
'.luf-why{font-size:12.5px;color:var(--t2);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.luf-it:hover .luf-why,.luf-it:focus-within .luf-why{-webkit-line-clamp:unset}',
'.luf-src{font-size:11.5px;color:var(--t3);margin-top:3px}.luf-morebtn{display:block;margin:0;padding:8px 12px 10px 30px;font-size:12.5px;border-top:1px solid var(--bd1,var(--bd2));width:100%;text-align:left;text-decoration:none}',
'.luf-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:34px 16px;border:1px dashed var(--bd2);border-radius:14px;color:var(--t2);font-size:13px;margin:6px 0 10px}.luf-empty b{color:var(--t1);font-size:15px}',
'.luf-steps{list-style:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0 0;padding:0;width:100%;text-align:left}.luf-steps li{padding:10px 12px;border-radius:10px;background:var(--s2);border:1px solid var(--bd1,var(--bd2));font-size:12.5px;display:flex;gap:8px}',
'.luf-steps i{font-style:normal;font-weight:700;width:20px;height:20px;border-radius:50%;background:var(--acs);color:var(--ach);display:grid;place-items:center;font-size:11px;flex-shrink:0}',
'.luf-x{background:none;border:0;color:var(--t2);font-size:22px;line-height:1;cursor:pointer;width:36px;height:36px;border-radius:8px}.luf-x:hover,.luf-x:focus-visible{background:var(--s3);color:var(--t1)}',
'.luf-body{overflow:auto;padding:12px 16px 16px}',
'.luf-sec{font-size:13px;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:6px}.luf-sec>span{color:var(--t2);font-weight:600}',
'.luf-card{border:1px solid var(--bd2);border-radius:12px;padding:10px 12px;margin:0 0 8px;background:var(--s2)}',
'.luf-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.luf-title{flex:1;min-width:180px;font-size:13.5px}',
'.luf-pill{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;color:var(--c);background:color-mix(in oklab,var(--c) 14%,transparent);border:1px solid color-mix(in oklab,var(--c) 40%,transparent)}',
'body:not(.light-mode) .luf-pill{color:color-mix(in oklab,var(--c) 55%,#fff)}',
'.luf-area{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;color:var(--t1);background:color-mix(in oklab,var(--c) 16%,var(--s2))}',
'.luf-m{font-size:12px;color:var(--t2);margin-top:4px}',
'.luf-prop{font-size:12.5px;margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--s1);border:1px dashed var(--bd2)}',
'.luf-result{white-space:pre-wrap;font-size:12.5px;margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--s1);border:1px solid var(--bd2);max-height:260px;overflow:auto}',
'.luf-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;align-items:center}.luf-acts .luf-cancel{margin-right:auto}',
'.luf-note{font-size:12.5px;color:var(--t2);padding:8px 0}.luf-warn{color:var(--red)}',
'.luf-chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 2px}',
'.luf-ob{list-style:none;margin:0;padding:0}',
'.luf-link{background:none;border:0;padding:0;font:inherit;color:var(--ach);cursor:pointer;text-decoration:underline}',
'.luf-foot{margin-top:18px;font-size:12px;color:var(--t2)}',
'.luf-connect{border:1px solid var(--bd2);border-radius:10px;padding:12px;margin:4px 0 8px;background:var(--s2)}.luf-connect p{font-size:12.5px;color:var(--t2);margin:6px 0 10px}',
'.luf-connect .inp{width:100%;margin:2px 0 8px}.luf-keyrow{display:flex;gap:8px}.luf-keyrow .inp{flex:1;font-family:ui-monospace,monospace;font-size:12px}',
'.luf-sb{margin-top:10px}.luf-sb label{font-size:12px;font-weight:600}.luf-sb textarea{width:100%;margin-top:4px}',
'.luf-f{display:flex;flex-direction:column;gap:4px;margin:0 0 12px}.luf-f .inp{width:100%}.luf-lab{font-size:12px;font-weight:600;color:var(--t2)}',
'.luf-seg{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}.luf-seg label{display:flex;gap:6px;align-items:center}',
'.luf-handoff{display:flex;gap:10px;align-items:center;padding:10px 12px;margin:0 0 12px;border-radius:10px;border:1px dashed var(--bd2);font-size:12.5px;color:var(--t2)}.luf-handoff span{flex:1}',
'@media (max-width:600px){#luf-ov,#luf-req-ov{padding:0;align-items:stretch}#luf-dlg,#luf-req{border-radius:0;max-height:100dvh;height:100dvh}.luf-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.luf-steps{grid-template-columns:1fr}}'
  ].join('\n');
  document.head.appendChild(st);
}

/* ── wiring ─────────────────────────────────────────────────────────────── */
(function(){
  if(typeof document==='undefined'||window._luFleetWired)return;
  window._luFleetWired=true;
  // after every sidebar rebuild and every Today render
  try{
    var origSb=window.initSidebars;
    if(typeof origSb==='function')window.initSidebars=function(){var r=origSb.apply(this,arguments);try{if(LUF.allowed)_lufSidebar();}catch(_){}return r;};
  }catch(_){}
  try{
    var origHome=window.renderHome;
    if(typeof origHome==='function')window.renderHome=function(){var r=origHome.apply(this,arguments);try{if(LUF.allowed)_lufTodayPaint();}catch(_){}return r;};
  }catch(_){}
  // the Hand off dialog: "Send to the Fleet" for a task not yet handed to anyone
  try{
    var origDlg=window.pmDelegateDialog;
    if(typeof origDlg==='function')window.pmDelegateDialog=async function(o){
      var r=await origDlg.apply(this,arguments);
      try{
        if(!LUF.allowed||!o||o.recordId||!o.ref||String(o.ref).indexOf('task:')!==0)return r;
        var m=document.getElementById('pm-modal');if(!m)return r;
        var tid=String(o.ref).slice(5),h=m.querySelector('h3');
        if(m.querySelector('.luf-handoff')||!h)return r;
        _lufCSS();
        h.insertAdjacentHTML('afterend','<div class="luf-handoff"><span aria-hidden="true">🤖</span><span>Or hand it to your <b>Fleet</b>: Mission Control proposes who does it and where, and starts once you approve.</span><button class="btn btn-s"'+_lufA('luFleetFromHandoff',[tid])+'>Send to the Fleet</button></div>');
      }catch(_){}
      return r;
    };
  }catch(_){}
  // the command palette
  try{
    var oc=window._cmdpActions;
    if(typeof oc==='function')window._cmdpActions=function(){
      var list=oc.apply(this,arguments);
      try{if(LUF.allowed){list.push({id:'fleet',group:'Navigate',icon:'🤖',title:'Open the Fleet (Mission Control)',run:function(){luFleetOpen();}});list.push({id:'fleet-new',group:'Create',icon:'🤖',title:'Hand something to the Fleet',run:function(){luFleetNew();}});}}catch(_){}
      return list;
    };
  }catch(_){}
  // start once the account has loaded; then every minute while the page is visible
  var tries=0;
  var boot=function(){
    if(typeof _serverSyncReady!=='undefined'&&_serverSyncReady){luFleetRefresh(true);return;}
    if(++tries<60)setTimeout(boot,3000);
  };
  setTimeout(boot,2500);
  setInterval(function(){if(LUF.allowed&&document.visibilityState==='visible')luFleetRefresh(false);},60000);
  document.addEventListener('visibilitychange',function(){if(LUF.allowed&&document.visibilityState==='visible'&&Date.now()-LUF.lastList>30000)luFleetRefresh(false);});
})();
function luFleetFromHandoff(taskId){try{if(typeof pmCloseModal==='function')pmCloseModal(true);}catch(_){}luFleetNew({taskId:taskId});}
