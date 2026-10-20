/* ═══════════════════════════════════════════════════════════════════════════
 * app-pm.js — Project Management workspace (builds -222 →).
 *
 * The owner asked (2026-10-20) for full project/program management: track
 * work delegated to people who may not be LevelUp members, a RACI matrix,
 * RAID log + risk matrix, stakeholder register + reports, Gantt with
 * baselines and critical path, IMS generation (MS Project-style WBS AND
 * DoD event/accomplishment/criteria), resource allocation, budget + EVM,
 * portfolio roll-ups, change requests, lessons learned, templates and
 * meeting-notes → action items.
 *
 * STORAGE — never in the whole-blob saves. Everything here is a row in the
 * server's pm_records / pm_people tables (server/routers/pm.ts), edited one
 * record at a time (pmPut / pmDel), so two devices cannot clobber each other
 * and the server can update a delegation when the delegate replies by email
 * (server/_core/pmDelegation.ts). The only writes to D.* are the ones the
 * user makes through the app's own records: a delegated task gets
 * `delegatedTo` (an existing task field), and templates / meeting-note
 * extraction create ordinary tasks and projects.
 *
 * SCOPE — a "project key": "p:<D.projects id>" or "atlas:<Atlas project id>"
 * (CommunityForce work comes from the Atlas mirror; Smartsheet is retired).
 * Items in a project are unified across native tasks, Atlas activities and
 * linked Nifty tasks (pmItems); only native tasks are editable here.
 *
 * PEOPLE — a "person key": "u:<user id>" (team member), "p:<pm_people id>"
 * (project people list) or "c:<contact id>" (Contacts). Settings → people
 * source picks which lists are offered (both by default).
 *
 * The screen is #s-pm (nav id 'pm'), registered at the bottom of this file
 * without touching index.html markup or app-part1.js.
 * ═══════════════════════════════════════════════════════════════════════════ */

// ─── CSS (injected; never added to index.html's <style>) ────────────────────
function _pmCSS(){
  if(document.getElementById('lu-pm-css'))return;
  var s=document.createElement('style');s.id='lu-pm-css';
  s.textContent=[
    'body[data-screen="pm"]{--page-accent:#0891b2}',
    '.si[data-n="pm"] svg{stroke:#0891b2}',
    '#pm-main{max-width:none!important;width:100%;min-width:0}',
    '.pm-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.pm-top h1{font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px;margin:0}',
    '.pm-tabs{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--bd1);margin:12px 0 14px}',
    '.pm-tab{padding:7px 11px;border:none;background:none;color:var(--t2);font-size:12.5px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;font-family:inherit}',
    '.pm-tab:hover{color:var(--t1)}',
    '.pm-tab.on{color:var(--t1);border-bottom-color:var(--page-accent,var(--ac));font-weight:650}',
    '.pm-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}',
    '.pm-split{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:12px}',
    '.pm-split.wide{grid-template-columns:minmax(280px,430px) minmax(0,1fr)}',
    '@media(max-width:1100px){.pm-split,.pm-split.wide{grid-template-columns:minmax(0,1fr)}}',
    '.pm-bar select.inp{width:auto;max-width:280px;height:30px;padding:2px 8px}',
    '.pm-nw{white-space:nowrap}',
    '.pm-card{background:var(--s1);border:1px solid var(--bd1);border-radius:10px;padding:14px;min-width:0}',
    '.pm-h{font-size:13px;font-weight:650;margin:0 0 8px;display:flex;align-items:center;gap:8px}',
    '.pm-h .sp{flex:1}',
    '.pm-muted{color:var(--t3);font-size:11.5px}',
    '.pm-table{width:100%;border-collapse:collapse;font-size:12.5px}',
    '.pm-table th{text-align:left;font-size:10.5px;color:var(--t3);font-weight:650;text-transform:uppercase;letter-spacing:.4px;padding:6px 8px;border-bottom:1px solid var(--bd1);white-space:nowrap;background:var(--s1);position:sticky;top:0;z-index:1}',
    '.pm-table td{padding:6px 8px;border-bottom:1px solid var(--bd1);vertical-align:top}',
    '.pm-table tr.clk{cursor:pointer}.pm-table tr.clk:hover td{background:var(--s2)}',
    '.pm-pill{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;line-height:18px}',
    '.pm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:12px}',
    '.pm-kpi{background:var(--s1);border:1px solid var(--bd1);border-radius:10px;padding:10px 12px;min-width:0}',
    '.pm-kpi b{display:block;font-size:20px;line-height:1.2}',
    '.pm-kpi span{font-size:11px;color:var(--t3)}',
    '.pm-scroll{overflow:auto;max-width:100%}',
    '.pm-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}',
    '.pm-bar .sp{flex:1}',
    '.pm-chip{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--bd2);background:transparent;color:var(--t2);font-size:11.5px;cursor:pointer;font-family:inherit}',
    '.pm-chip.on{background:color-mix(in srgb,var(--page-accent,var(--ac)) 18%,var(--s2));border-color:var(--page-accent,var(--ac));color:var(--t1)}',
    '.pm-empty{padding:28px 16px;text-align:center;color:var(--t3);font-size:12.5px}',
    '.pm-empty b{display:block;color:var(--t1);font-size:14px;margin-bottom:4px}',
    '#pm-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1005;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}',
    '#pm-modal .pm-dlg{background:var(--s1);color:var(--t1);border:1px solid var(--bd2);border-radius:12px;width:min(640px,100%);padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.4)}',
    '#pm-modal .pm-dlg.wide{width:min(980px,100%)}',
    '.pm-dlg h3{font-size:15px;margin:0 0 12px;display:flex;align-items:center;gap:8px}',
    '.pm-dlg h3 .x{margin-left:auto;background:none;border:none;color:var(--t3);font-size:18px;cursor:pointer}',
    '.pm-row{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:8px;font-size:12.5px}',
    '.pm-row>label{color:var(--t2)}',
    '.pm-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}',
    '.pm-raci td.c{text-align:center;cursor:pointer;min-width:46px;font-weight:700;font-size:12px;user-select:none}',
    '.pm-raci td.c:hover{background:var(--s2)}',
    '.pm-raci th.p{writing-mode:vertical-rl;transform:rotate(180deg);text-transform:none;letter-spacing:0;font-size:11.5px;height:120px;vertical-align:bottom;text-align:left;max-width:46px}',
    '.pm-heat{display:grid;grid-template-columns:24px repeat(5,minmax(44px,1fr));gap:3px;font-size:11px}',
    '.pm-heat div{border-radius:6px;min-height:40px;display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer}',
    '.pm-heat .ax{background:none;color:var(--t3);font-weight:600;cursor:default;min-height:0}',
    '.pm-gantt{position:relative;font-size:11.5px}',
    '.pm-gantt .gl{position:sticky;left:0;z-index:2;background:var(--s1)}',
    '.pm-ims td.n{white-space:nowrap}',
    '.pm-ims input.inp{height:26px;padding:2px 6px;font-size:12px}',
    '.pm-heatcell{text-align:center;font-size:11px;font-weight:600;min-width:42px}',
    '@media(max-width:560px){.pm-row{grid-template-columns:1fr}.pm-top h1{font-size:19px}}',
    '@media print{body.pm-printing .app>*:not(#pm-print){display:none!important}}',
  ].join('\n');
  document.head.appendChild(s);
}

// ─── small helpers ──────────────────────────────────────────────────────────
function _pmE(s){return typeof esc==='function'?esc(s==null?'':String(s)):String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function _pmJ(s){return typeof _jsAttr==='function'?_jsAttr(s):String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');}
function _pmToday(){return typeof _ymd==='function'?_ymd(new Date()):new Date().toISOString().slice(0,10);}
function _pmYmd(d){if(!d)return '';var x=d instanceof Date?d:new Date(String(d).length<=10?String(d)+'T12:00:00':d);if(isNaN(x))return '';return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function _pmAddDays(ymd,n){var d=new Date(ymd+'T12:00:00');d.setDate(d.getDate()+n);return _pmYmd(d);}
function _pmDays(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);}
function _pmDate(ymd){if(!ymd)return '';var d=new Date(String(ymd).slice(0,10)+'T12:00:00');if(isNaN(d))return String(ymd);return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:(d.getFullYear()!==new Date().getFullYear()?'numeric':undefined)});}
function _pmMoney(n){n=Number(n)||0;return (n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString();}
function _pmIsYmd(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));}
function _pmToast(m,type){try{toast(type?{type:type,msg:m}:m);}catch(_){console.log('[pm]',m);}}
function _pmIcon(n,sz,c){try{return _icon(n,sz||16,c||'currentColor');}catch(_){return '';}}
function _pmUid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ─── store ──────────────────────────────────────────────────────────────────
var PM={people:[],records:[],loaded:false,at:null,error:null};
var _pmLoading=null,_pmLk=0,_pmPending={};
function _pmTagRec(r){if(r&&!r._lk)r._lk='id'+r.id;return r;}
function pmLoad(force){
  if(PM.loaded&&!force)return Promise.resolve(PM);
  if(_pmLoading)return _pmLoading;
  _pmLoading=(async function(){
    try{
      var r=await _trpc('pm.bootstrap',undefined,'query');
      PM.people=Array.isArray(r&&r.people)?r.people:[];
      PM.records=(Array.isArray(r&&r.records)?r.records:[]).map(_pmTagRec);
      PM.loaded=true;PM.at=r&&r.at;PM.error=null;
    }catch(e){PM.error=String(e&&e.message||e);}
    finally{_pmLoading=null;}
    return PM;
  })();
  return _pmLoading;
}
function pmRecs(kind,projectKey){return PM.records.filter(function(r){return r.kind===kind&&(projectKey==null||r.projectKey===projectKey);});}
function pmRec(id){return PM.records.find(function(r){return r.id===id||r._lk===id;})||null;}
/** Save a record: updates the local store at once, persists in the background
 *  (chained per record, so rapid edits land in order). Returns a promise. */
function pmPut(rec){
  if(!rec._lk)rec._lk=rec.id?'id'+rec.id:'lk'+(++_pmLk);
  var i=PM.records.findIndex(function(x){return x._lk===rec._lk;});
  if(i>=0)PM.records[i]=rec;else PM.records.push(rec);
  rec.updatedAt=new Date().toISOString();
  var prev=_pmPending[rec._lk]||Promise.resolve();
  var p=prev.then(async function(){
    var payload={projectKey:rec.projectKey||'',kind:rec.kind,refType:rec.refType==null?null:String(rec.refType),refId:rec.refId==null?null:String(rec.refId),
      title:rec.title==null?null:String(rec.title).slice(0,500),status:rec.status==null?null:String(rec.status),data:rec.data==null?null:rec.data,sortOrder:Number(rec.sortOrder)||0};
    if(rec.id)payload.id=rec.id;
    var s=await _trpc('pm.recordUpsert',payload,'mutation');
    if(s&&s.id){rec.id=s.id;rec.createdAt=s.createdAt;}
    return rec;
  });
  _pmPending[rec._lk]=p.catch(function(e){_pmToast('Could not save: '+String(e&&e.message||e).slice(0,140),'error');});
  return p;
}
function pmNew(kind,projectKey,fields){return Object.assign({kind:kind,projectKey:projectKey||'',refType:null,refId:null,title:'',status:null,data:{},sortOrder:0},fields||{});}
async function pmDel(recs,label){
  recs=(Array.isArray(recs)?recs:[recs]).filter(Boolean);if(!recs.length)return;
  var keys=recs.map(function(r){return r._lk;});
  PM.records=PM.records.filter(function(r){return keys.indexOf(r._lk)<0;});
  pmRender();
  for(var i=0;i<recs.length;i++){try{await _pmPending[recs[i]._lk];}catch(_){}}
  var ids=recs.map(function(r){return r.id;}).filter(Boolean);
  if(!ids.length)return;
  try{await _trpc('pm.recordDelete',{ids:ids},'mutation');}catch(e){_pmToast('Could not delete: '+(e&&e.message||e),'error');return;}
  try{toast({type:'info',title:'Deleted',msg:(label||(recs.length+' item'+(recs.length===1?'':'s'))),duration:8000,actions:[{label:'Undo',primary:true,onClick:async function(){
    try{await _trpc('pm.recordRestore',{ids:ids},'mutation');recs.forEach(function(r){PM.records.push(r);});pmRender();}catch(e){_pmToast('Could not restore','error');}
  }}]});}catch(_){}
}

// settings records: one global (projectKey '') and one per project
function pmSettings(projectKey){
  var r=PM.records.find(function(x){return x.kind==='pmsettings'&&x.projectKey===(projectKey||'');});
  return r?(r.data||{}):{};
}
function pmSetSettings(projectKey,patch){
  var r=PM.records.find(function(x){return x.kind==='pmsettings'&&x.projectKey===(projectKey||'');});
  if(!r)r=pmNew('pmsettings',projectKey||'',{data:{}});
  r.data=Object.assign({},r.data||{},patch);
  return pmPut(r);
}

// ─── people ─────────────────────────────────────────────────────────────────
// Both options the owner asked for: the project-people list, Contacts, or both.
function pmPeopleSource(){var s=pmSettings('').peopleSource;return s==='contacts'||s==='separate'?s:'both';}
function _pmMe(){
  var em=String((D.creds&&D.creds.email)||'').toLowerCase();
  var m=(typeof _workspaceMembers!=='undefined'?_workspaceMembers:[]).find(function(x){return String(x.email||'').toLowerCase()===em;});
  return m?{key:'u:'+m.id,name:m.name||m.email,email:m.email}:{key:'me',name:(D.creds&&(D.creds.userName||D.creds.name))||'Me',email:em};
}
function pmPeopleAll(opts){
  opts=opts||{};
  var src=pmPeopleSource(),out=[],seen={};
  var add=function(p){var k=p.email?String(p.email).toLowerCase():'';if(k&&seen[k])return;if(k)seen[k]=1;out.push(p);};
  (typeof _workspaceMembers!=='undefined'?_workspaceMembers:[]).forEach(function(m){add({key:'u:'+m.id,name:m.name||m.email||'Member',email:m.email||'',org:'Team',title:m.role||'',kind:'member'});});
  if(src!=='contacts')PM.people.forEach(function(p){add({key:'p:'+p.id,name:p.name,email:p.email||'',org:p.org||'',title:p.title||'',phone:p.phone||'',kind:'person',costRate:p.costRate,capacityHours:p.capacityHours,rec:p});});
  if(src!=='separate'||opts.allSources)(Array.isArray(D.contacts)?D.contacts:[]).forEach(function(c){if(!c)return;add({key:'c:'+c.id,name:c.name||c.email||'Contact',email:c.email||'',org:c.company||'',title:c.title||'',phone:c.phone||'',kind:'contact'});});
  out.sort(function(a,b){return String(a.name).localeCompare(String(b.name));});
  return out;
}
function pmPerson(key){
  if(!key)return null;
  if(key==='me')return _pmMe();
  var all=pmPeopleAll({allSources:true});
  return all.find(function(p){return p.key===key;})||{key:key,name:'(removed person)',email:'',kind:'gone'};
}
function pmPersonName(key){var p=pmPerson(key);return p?p.name:'';}
/** Rate/capacity live on pm_people; members and contacts get the defaults. */
function pmPersonRate(key){var p=pmPerson(key);var r=p&&p.costRate;return r!=null?Number(r):(Number(pmSettings('').defaultRate)||0);}
function pmPersonCapacity(key){var p=pmPerson(key);var c=p&&p.capacityHours;return c!=null?Number(c):(Number(pmSettings('').defaultCapacity)||40);}
/** Add a person to the chosen list. Contacts mode creates a Contact. */
async function pmAddPerson(f){
  var name=String(f.name||'').trim();if(!name)throw new Error('A name is needed');
  var email=String(f.email||'').trim().toLowerCase();
  var dup=pmPeopleAll({allSources:true}).find(function(p){return email&&String(p.email).toLowerCase()===email;});
  if(dup)return dup;
  var target=f.target||(pmPeopleSource()==='contacts'?'contact':'person');
  if(target==='contact'){
    D.contacts=Array.isArray(D.contacts)?D.contacts:[];
    var id=typeof nextId==='function'?nextId(D.contacts):Date.now();
    D.contacts.push({id:id,name:name,email:email,company:f.org||'',title:f.title||'',phone:f.phone||'',tags:['pm'],notes:'Added from Project Management'});
    try{save('contacts');}catch(_){}
    return pmPerson('c:'+id);
  }
  var p=await _trpc('pm.peopleUpsert',{name:name,email:email||null,org:f.org||null,title:f.title||null,phone:f.phone||null},'mutation');
  PM.people.push(p);
  return pmPerson('p:'+p.id);
}
/** Find a person by a typed name (meeting notes, templates). */
function pmFindPersonByName(name){
  var n=String(name||'').trim().toLowerCase();if(!n)return null;
  var all=pmPeopleAll({allSources:true});
  return all.find(function(p){return String(p.name).toLowerCase()===n;})||all.find(function(p){return String(p.name).toLowerCase().split(' ')[0]===n.split(' ')[0]&&n.indexOf(' ')<0;})||null;
}
/** A <select> of people + "Add someone new…". */
function pmPersonSelect(id,sel,opts){
  opts=opts||{};
  var all=pmPeopleAll();
  var groups={member:'Team members',person:'Project people',contact:'Contacts'};
  var html='<select class="inp" id="'+id+'"'+(opts.onchange?' onchange="'+opts.onchange+'"':'')+'>'+(opts.blank!==false?'<option value="">'+_pmE(opts.blankLabel||'— choose —')+'</option>':'');
  ['member','person','contact'].forEach(function(g){
    var list=all.filter(function(p){return p.kind===g;});if(!list.length)return;
    html+='<optgroup label="'+groups[g]+'">'+list.map(function(p){return '<option value="'+_pmE(p.key)+'"'+(p.key===sel?' selected':'')+'>'+_pmE(p.name)+(p.org&&g!=='member'?' · '+_pmE(p.org):'')+'</option>';}).join('')+'</optgroup>';
  });
  if(sel&&!all.some(function(p){return p.key===sel;})){var pp=pmPerson(sel);html+='<option value="'+_pmE(sel)+'" selected>'+_pmE(pp?pp.name:sel)+'</option>';}
  if(opts.allowNew!==false)html+='<option value="__new">＋ Add someone new…</option>';
  return html+'</select>';
}
/** Dialog to add a person; resolves to the new person (or null). */
function pmNewPersonDialog(prefill){
  return new Promise(function(resolve){
    var src=pmPeopleSource();
    pmModal('<h3>'+_pmIcon('user',18)+' Add a person<button class="x" onclick="pmCloseModal()">×</button></h3>'+
      '<div class="pm-muted" style="margin-bottom:10px">They do not need a LevelUp account. Add an email address so LevelUp can send them follow-ups.</div>'+
      '<div class="pm-row"><label>Name</label><input class="inp" id="pmnp-name" value="'+_pmE(prefill&&prefill.name||'')+'"></div>'+
      '<div class="pm-row"><label>Email</label><input class="inp" id="pmnp-email" type="email" value="'+_pmE(prefill&&prefill.email||'')+'"></div>'+
      '<div class="pm-row"><label>Organisation</label><input class="inp" id="pmnp-org" placeholder="e.g. CommunityForce, a client"></div>'+
      '<div class="pm-row"><label>Role / title</label><input class="inp" id="pmnp-title"></div>'+
      (src==='both'?'<div class="pm-row"><label>Save to</label><select class="inp" id="pmnp-target"><option value="person">Project people list</option><option value="contact">My Contacts</option></select></div>':'')+
      '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmnp-save">Add person</button></div>');
    var done=false;
    document.getElementById('pmnp-save').onclick=async function(){
      try{
        var t=document.getElementById('pmnp-target');
        var p=await pmAddPerson({name:document.getElementById('pmnp-name').value,email:document.getElementById('pmnp-email').value,org:document.getElementById('pmnp-org').value,title:document.getElementById('pmnp-title').value,target:t?t.value:undefined});
        done=true;pmCloseModal();resolve(p);
      }catch(e){_pmToast(String(e&&e.message||e),'error');}
    };
    _pmModalOnClose=function(){if(!done)resolve(null);};
    setTimeout(function(){var n=document.getElementById('pmnp-name');if(n)n.focus();},50);
  });
}
/** Wire a person <select>: picking "Add someone new…" opens the dialog. */
function pmWirePersonSelect(id,after){
  var el=document.getElementById(id);if(!el)return;
  el.addEventListener('change',async function(){
    if(el.value!=='__new'){if(after)after(el.value);return;}
    var stack=_pmModalStack();
    var p=await pmNewPersonDialog();
    _pmModalRestore(stack);
    var el2=document.getElementById(id);
    if(p&&el2){var o=document.createElement('option');o.value=p.key;o.textContent=p.name;o.selected=true;el2.insertBefore(o,el2.firstChild.nextSibling);el2.value=p.key;if(after)after(p.key);}
    else if(el2)el2.value='';
  });
}

// ─── modal ──────────────────────────────────────────────────────────────────
var _pmModalOnClose=null;
function pmModal(html,wide){
  pmCloseModal(true);
  var ov=document.createElement('div');ov.id='pm-modal';
  ov.innerHTML='<div class="pm-dlg'+(wide?' wide':'')+'" role="dialog" aria-modal="true">'+html+'</div>';
  ov.addEventListener('mousedown',function(e){if(e.target===ov)ov._down=true;});
  ov.addEventListener('mouseup',function(e){if(e.target===ov&&ov._down)pmCloseModal();ov._down=false;});
  document.body.appendChild(ov);
  return ov;
}
function pmCloseModal(silent){
  var ov=document.getElementById('pm-modal');if(ov)ov.remove();
  var cb=_pmModalOnClose;_pmModalOnClose=null;
  if(cb&&!silent)try{cb();}catch(_){}
}
// A nested dialog (e.g. "add a person" inside "delegate") replaces the outer
// one; these keep the outer one's markup + field values to put it back.
function _pmModalStack(){
  var ov=document.getElementById('pm-modal');if(!ov)return null;
  var vals={};ov.querySelectorAll('input,select,textarea').forEach(function(el){if(el.id)vals[el.id]=el.type==='checkbox'?el.checked:el.value;});
  var dlg=ov.querySelector('.pm-dlg');
  return {html:dlg.innerHTML,wide:dlg.classList.contains('wide'),vals:vals,onClose:_pmModalOnClose,handlers:ov._handlers||null};
}
function _pmModalRestore(st){
  if(!st)return;
  var ov=pmModal(st.html,st.wide);
  _pmModalOnClose=st.onClose;
  Object.keys(st.vals).forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=st.vals[id];else el.value=st.vals[id];});
  if(st.handlers)try{st.handlers();}catch(_){}
  ov._handlers=st.handlers;
}

// ─── projects + items ───────────────────────────────────────────────────────
function _pmAtlas(){return (D&&D.atlas&&typeof D.atlas==='object')?D.atlas:null;}
function pmProjects(){
  var out=[];
  (Array.isArray(D.projects)?D.projects:[]).filter(function(p){return p&&!p.archived;}).forEach(function(p){
    out.push({key:'p:'+p.id,id:p.id,name:p.name||'(untitled project)',color:p.color||'#6366f1',source:'native',status:p.status||'',rec:p});
  });
  var a=_pmAtlas();
  if(a&&Array.isArray(a.projects))a.projects.filter(function(p){return p&&p.category!=='overhead';}).forEach(function(p){
    out.push({key:'atlas:'+p.id,id:p.id,name:p.name||'(Atlas project)',color:'#2563eb',source:'atlas',status:p.status||p.stage||'',category:p.category,rec:p});
  });
  return out;
}
function pmProject(key){return pmProjects().find(function(p){return p.key===key;})||null;}
function _pmAtlasMemberName(id){
  var a=_pmAtlas();if(!a)return '';
  var found='';(a.departments||[]).some(function(d){return (d.members||[]).some(function(m){if(String(m.id)===String(id)){found=m.name||'';return true;}return false;});});
  return found;
}
/** Everything that is work in a project, normalised. Only native tasks are
 *  editable from here (`editable`). */
function pmItems(key){
  if(!key||key==='all')return [];
  var out=[];
  if(key.indexOf('p:')===0){
    var pid=key.slice(2);
    (Array.isArray(D.tasks)?D.tasks:[]).filter(function(t){return t&&String(t.projectId)===pid;}).forEach(function(t){
      out.push({ref:'task:'+t.id,kind:'task',id:t.id,title:t.title||'(untitled task)',start:_pmIsYmd(t.startDate)?t.startDate:null,due:_pmIsYmd(t.due)?t.due:null,
        done:t.status==='Done',status:t.status||'Not Started',priority:t.priority||'',est:Number(t.estimatedMins)||0,owner:t.assignedTo||'',delegatedTo:t.delegatedTo||'',
        preds:(Array.isArray(t.predecessorIds)?t.predecessorIds:[]).map(function(x){return 'task:'+x;}),parent:t.parentTaskId!=null&&t.parentTaskId!==''?'task:'+t.parentTaskId:null,
        milestone:/milestone/i.test((t.tags||[]).join(' ')),editable:true,src:t});
    });
    (Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(function(et){var ov=et.override||{};return !ov.tombstoned&&String(ov.localProjectId||'')===pid;}).forEach(function(et){
      var due=String(et.due||'').slice(0,10);
      out.push({ref:'ext:'+et.source+':'+et.externalId,kind:'external',id:et.externalId,title:et.title||'(external task)',start:null,due:_pmIsYmd(due)?due:null,
        done:/^(done|complete|completed|closed)/i.test(String(et.status||'')),status:et.status||'',owner:et.assignee||'',preds:[],parent:null,editable:false,source:et.source,src:et});
    });
  } else if(key.indexOf('atlas:')===0){
    var aid=key.slice(6),a=_pmAtlas();
    ((a&&a.activities)||[]).filter(function(x){return x&&String(x.projectId)===aid;}).forEach(function(x){
      var owners=(x.owners||[]).map(_pmAtlasMemberName).filter(Boolean).join(', ')||x.ownerText||'';
      out.push({ref:'atlas:activity:'+x.id,kind:'atlas',id:x.id,title:x.subtask||x.task||'(Atlas activity)',start:_pmIsYmd(x.start)?x.start:null,due:_pmIsYmd(x.dueDate)?x.dueDate:null,
        done:x.status==='done',status:({todo:'To do',doing:'In progress',done:'Done',blocked:'Blocked'})[x.status]||x.status||'',owner:owners,preds:[],
        parent:x.parentId?'atlas:activity:'+x.parentId:null,milestone:!!x.isMilestone,phase:x.phase||'',editable:false,src:x});
    });
  }
  return out;
}
function pmItem(ref,key){
  var list=key?pmItems(key):[];var hit=list.find(function(i){return i.ref===ref;});if(hit)return hit;
  if(String(ref).indexOf('task:')===0){var t=(D.tasks||[]).find(function(x){return 'task:'+x.id===ref;});if(t)return {ref:ref,kind:'task',id:t.id,title:t.title,due:t.due,done:t.status==='Done',editable:true,src:t};}
  return null;
}
/** Which project a native task belongs to, as a project key ('' if none). */
function pmTaskProjectKey(t){return t&&t.projectId!=null&&t.projectId!==''?'p:'+t.projectId:'';}
function pmOpenItem(ref){
  if(String(ref).indexOf('task:')===0){var t=(D.tasks||[]).find(function(x){return 'task:'+x.id===ref;});if(t&&typeof openDrawer==='function')openDrawer('task',t);return;}
  if(String(ref).indexOf('atlas:activity:')===0&&typeof atlasOpenDrawer==='function'){atlasOpenDrawer('activity',ref.slice(15));return;}
  if(String(ref).indexOf('ext:')===0){var parts=ref.split(':');var et=(D.externalTasks||[]).find(function(x){return x.source===parts[1]&&String(x.externalId)===parts.slice(2).join(':');});if(et&&typeof _openExternalAnnotateModal==='function')_openExternalAnnotateModal(et);}
}

// ─── screen shell ───────────────────────────────────────────────────────────
var PM_TABS=[
  {id:'overview',label:'Overview',icon:'activity'},
  {id:'waiting',label:'Waiting on',icon:'clock'},
  {id:'raci',label:'RACI',icon:'users'},
  {id:'schedule',label:'Schedule',icon:'calendar'},
  {id:'ims',label:'WBS / IMS',icon:'list'},
  {id:'raid',label:'RAID',icon:'alertTriangle'},
  {id:'stakeholders',label:'Stakeholders',icon:'user'},
  {id:'resources',label:'Resources',icon:'barChart'},
  {id:'budget',label:'Budget',icon:'target'},
  {id:'changes',label:'Changes',icon:'refresh'},
  {id:'reports',label:'Reports',icon:'mail'},
  {id:'lessons',label:'Lessons',icon:'lightbulb'},
  {id:'settings',label:'Settings',icon:'settings'},
];
var PM_ALL_TABS=[
  {id:'portfolio',label:'Portfolio',icon:'layers'},
  {id:'waiting',label:'Waiting on',icon:'clock'},
  {id:'raid',label:'RAID',icon:'alertTriangle'},
  {id:'resources',label:'Resources',icon:'barChart'},
  {id:'people',label:'People',icon:'users'},
  {id:'templates',label:'Templates',icon:'bookOpen'},
  {id:'settings',label:'Settings',icon:'settings'},
];
var _pmState=(function(){try{return JSON.parse(localStorage.getItem('lu_pm_state')||'{}')||{};}catch(_){return {};}})();
if(!_pmState.proj)_pmState.proj='all';
if(!_pmState.tab)_pmState.tab='portfolio';
function _pmSaveState(){try{localStorage.setItem('lu_pm_state',JSON.stringify(_pmState));}catch(_){}}
function pmGo(proj,tab){
  if(proj!=null)_pmState.proj=proj;
  var tabs=_pmState.proj==='all'?PM_ALL_TABS:PM_TABS;
  if(tab)_pmState.tab=tab;
  if(!tabs.some(function(t){return t.id===_pmState.tab;}))_pmState.tab=tabs[0].id;
  _pmSaveState();
  if(typeof curScreen!=='undefined'&&curScreen!=='pm'&&typeof nav==='function'){nav('pm');return;}
  pmRender();
}
function openPM(projKey,tab){pmGo(projKey||'all',tab||null);if(typeof curScreen==='undefined'||curScreen!=='pm')nav('pm');}
function pmRender(){
  var main=document.getElementById('pm-main');if(!main)return;
  _pmCSS();
  if(!PM.loaded){
    main.innerHTML='<div class="pm-empty"><b>Loading your projects…</b></div>';
    pmLoad().then(function(){if(PM.loaded)pmRender();else main.innerHTML='<div class="pm-empty"><b>Could not load project data</b>'+_pmE(PM.error||'')+'<br><br><button class="btn btn-s" onclick="pmLoad(true).then(pmRender)">Try again</button></div>';});
    return;
  }
  var proj=_pmState.proj;
  if(proj!=='all'&&!pmProject(proj)){_pmState.proj='all';proj='all';}
  var tabs=proj==='all'?PM_ALL_TABS:PM_TABS;
  if(!tabs.some(function(t){return t.id===_pmState.tab;}))_pmState.tab=tabs[0].id;
  var projects=pmProjects();
  var sel='<select class="inp" style="width:auto;min-width:220px;max-width:100%;height:32px" onchange="pmGo(this.value)">'+
    '<option value="all"'+(proj==='all'?' selected':'')+'>All projects — portfolio</option>'+
    (projects.some(function(p){return p.source==='native';})?'<optgroup label="LevelUp projects">'+projects.filter(function(p){return p.source==='native';}).map(function(p){return '<option value="'+_pmE(p.key)+'"'+(p.key===proj?' selected':'')+'>'+_pmE(p.name)+'</option>';}).join('')+'</optgroup>':'')+
    (projects.some(function(p){return p.source==='atlas';})?'<optgroup label="Atlas (CommunityForce)">'+projects.filter(function(p){return p.source==='atlas';}).map(function(p){return '<option value="'+_pmE(p.key)+'"'+(p.key===proj?' selected':'')+'>'+_pmE(p.name)+(p.category&&p.category!=='project'?' ('+_pmE(p.category)+')':'')+'</option>';}).join('')+'</optgroup>':'')+
    '</select>';
  var pr=proj==='all'?null:pmProject(proj);
  var sub=pr?(pr.source==='atlas'?'Atlas · read-only work items · your PM layer on top':(pr.status||'')):'Every project, delegation and risk in one place';
  main.innerHTML='<div class="pm-top"><h1>'+_pmIcon('briefcase',22,'var(--page-accent)')+' Project Management</h1>'+sel+
    '<span class="pm-muted">'+_pmE(sub)+'</span><span style="flex:1"></span>'+
    (pr&&pr.source==='native'?'<button class="btn btn-s" onclick="openProjectDetail&&openProjectDetail('+JSON.stringify(pr.id).replace(/"/g,'&quot;')+')">Project details</button>':'')+
    '<button class="btn btn-s" onclick="pmLoad(true).then(pmRender)" title="Reload project data">'+_pmIcon('refresh',14)+'</button></div>'+
    '<div class="pm-tabs" role="tablist">'+tabs.map(function(t){return '<button class="pm-tab'+(t.id===_pmState.tab?' on':'')+'" role="tab" aria-selected="'+(t.id===_pmState.tab)+'" onclick="pmGo(null,\''+t.id+'\')">'+_pmIcon(t.icon,13)+' '+t.label+'</button>';}).join('')+'</div>'+
    '<div id="pm-body"></div>';
  var body=document.getElementById('pm-body');
  try{
    var fn=window['pmTab_'+_pmState.tab];
    body.innerHTML=fn?fn(proj):'<div class="pm-empty">Coming soon</div>';
    var after=window['pmTabAfter_'+_pmState.tab];if(after)after(proj);
  }catch(e){console.error('[pm] tab failed',e);body.innerHTML='<div class="pm-empty"><b>Something went wrong showing this tab</b>'+_pmE(String(e&&e.message||e))+'</div>';}
}

// ═══ DELEGATION — "Waiting on" (phase 1) ════════════════════════════════════
var PM_DLG_STATUS={open:{label:'Open',c:'#64748b'},on_track:{label:'On track',c:'#16a34a'},at_risk:{label:'At risk',c:'#d97706'},blocked:{label:'Blocked',c:'#dc2626'},done:{label:'Done',c:'#0891b2'},cancelled:{label:'Cancelled',c:'#94a3b8'}};
function _pmPill(label,c){return '<span class="pm-pill" style="background:color-mix(in srgb,'+c+' 16%,transparent);color:'+c+'">'+_pmE(label)+'</span>';}
function pmDelegations(key){return pmRecs('delegation').filter(function(r){return key==null||key==='all'||r.projectKey===key;});}
function pmDelegationFor(ref){return pmRecs('delegation').find(function(r){return (r.refType+':'+r.refId)===ref.replace(/^task:/,'task:')&&r.status!=='done'&&r.status!=='cancelled';})
  ||pmRecs('delegation').find(function(r){return ref==='task:'+r.refId&&r.refType==='task'&&r.status!=='done'&&r.status!=='cancelled';})||null;}
function _pmDlgOpen(r){return r.status!=='done'&&r.status!=='cancelled';}
function _pmDlgLate(r,today){var d=r.data||{};return _pmDlgOpen(r)&&d.expectedBy&&d.expectedBy<today;}
function _pmDlgDue(r,today){var d=r.data||{};return _pmDlgOpen(r)&&d.followUp&&d.followUp<=today;}
function _pmDlgRefLabel(r){
  var d=r.data||{};
  if(r.refType==='task'){var t=(D.tasks||[]).find(function(x){return String(x.id)===String(r.refId);});if(t)return t.title;}
  return d.taskTitle||r.title||'(untitled)';
}
function _pmProjName(key){var p=key&&pmProject(key);return p?p.name:'';}

/** Merge rows the server changed since our last look (delegate replies,
 *  auto follow-ups). */
async function pmRefreshChanged(){
  if(!PM.loaded||!PM.at)return 0;
  var since=PM.at;
  try{
    var rows=await _trpc('pm.changedSince',{since:since},'query');
    PM.at=new Date().toISOString();
    (rows||[]).forEach(function(s){
      var i=PM.records.findIndex(function(x){return x.id===s.id;});
      if(s.deleted){if(i>=0)PM.records.splice(i,1);return;}
      _pmTagRec(s);
      if(i>=0){if(_pmPending[PM.records[i]._lk]&&new Date(PM.records[i].updatedAt)>new Date(s.updatedAt))return;s._lk=PM.records[i]._lk;PM.records[i]=s;}
      else PM.records.push(s);
    });
    return (rows||[]).length;
  }catch(_){return 0;}
}

function pmTab_waiting(key){
  var today=_pmToday();
  var f=_pmState.dlgFilter||'open',g=_pmState.dlgGroup||'person';
  var all=pmDelegations(key);
  var open=all.filter(_pmDlgOpen),late=all.filter(function(r){return _pmDlgLate(r,today);}),due=all.filter(function(r){return _pmDlgDue(r,today);}),
      risky=open.filter(function(r){return r.status==='blocked'||r.status==='at_risk';}),
      done30=all.filter(function(r){return r.status==='done'&&(Date.now()-new Date(r.updatedAt).getTime())<30*86400e3;});
  var list=f==='late'?late:f==='due'?due:f==='risk'?risky:f==='done'?all.filter(function(r){return r.status==='done';}):f==='all'?all:open;
  var kpi=function(n,l,c,flt){return '<div class="pm-kpi" style="cursor:pointer'+(f===flt?';border-color:var(--page-accent)':'')+'" onclick="_pmState.dlgFilter=\''+flt+'\';pmRender()"><b style="color:'+c+'">'+n+'</b><span>'+l+'</span></div>';};
  var html='<div class="pm-kpis">'+kpi(open.length,'Open','var(--t1)','open')+kpi(late.length,'Past expected date','#dc2626','late')+kpi(due.length,'Follow-up due','#d97706','due')+kpi(risky.length,'Blocked / at risk','#d97706','risk')+kpi(done30.length,'Done (30 days)','#0891b2','done')+'</div>';
  html+='<div class="pm-bar"><button class="btn btn-p" onclick="pmDelegateDialog({projectKey:'+(key==='all'?'null':'\''+_pmJ(key)+'\'')+'})">'+_pmIcon('plus',14,'#fff')+' Delegate something</button>'+
    (due.length?'<button class="btn btn-s" onclick="pmNudgeAllDue('+(key==='all'?'null':'\''+_pmJ(key)+'\'')+')">'+_pmIcon('mail',14)+' Follow up on all due ('+due.length+')</button>':'')+
    '<span class="sp"></span><span class="pm-muted">Group by</span>'+['person','project','none'].map(function(x){return '<button class="pm-chip'+(g===x?' on':'')+'" onclick="_pmState.dlgGroup=\''+x+'\';_pmSaveState();pmRender()">'+({person:'Person',project:'Project',none:'Nothing'})[x]+'</button>';}).join('')+'</div>';
  if(!list.length){
    html+='<div class="pm-card pm-empty"><b>'+(all.length?'Nothing here':'You have not delegated anything yet')+'</b>'+(all.length?'Try another filter above.':'Open any task and press 🤝 Delegate, or use “Delegate something” above. The person does not need a LevelUp account — LevelUp can email them for updates and read their replies.')+'</div>';
    return html;
  }
  var groups={};
  list.forEach(function(r){var d=r.data||{};var k=g==='person'?(d.personKey||'?'):g==='project'?(r.projectKey||''):'all';(groups[k]=groups[k]||[]).push(r);});
  var keys=Object.keys(groups).sort(function(a,b){
    if(g==='person')return String(pmPersonName(a)).localeCompare(String(pmPersonName(b)));
    if(g==='project')return String(_pmProjName(a)||'~').localeCompare(String(_pmProjName(b)||'~'));return 0;});
  keys.forEach(function(k){
    var rows=groups[k].sort(function(a,b){var x=(a.data||{}).expectedBy||'9999',y=(b.data||{}).expectedBy||'9999';return x.localeCompare(y);});
    var head=g==='person'?(function(){var p=pmPerson(k);return _pmIcon('user',14)+' <b>'+_pmE(p?p.name:'Unknown')+'</b>'+(p&&p.email?' <span class="pm-muted">'+_pmE(p.email)+'</span>':' <span class="pm-pill" style="background:#fef3c7;color:#92400e">no email</span>');})()
      :g==='project'?_pmIcon('folder',14)+' <b>'+_pmE(_pmProjName(k)||'No project')+'</b>':'';
    html+='<div class="pm-card" style="margin-bottom:12px">'+(head?'<div class="pm-h">'+head+'<span class="sp"></span><span class="pm-muted">'+rows.length+'</span></div>':'')+
      '<div class="pm-scroll"><table class="pm-table"><thead><tr><th>What</th>'+(g!=='person'?'<th>Who</th>':'')+(g!=='project'?'<th>Project</th>':'')+'<th>Handed off</th><th>Expected</th><th>Follow up</th><th>Status</th><th>Last update</th><th></th></tr></thead><tbody>'+
      rows.map(function(r){
        var d=r.data||{},st=PM_DLG_STATUS[r.status||'open']||PM_DLG_STATUS.open;
        var lastU=(d.updates||[]).slice().reverse().find(function(u){return u.by!=='system';});
        var age=d.delegatedAt?_pmDays(d.delegatedAt.slice(0,10),today):null;
        return '<tr class="clk" onclick="pmDelegationDetail('+r.id+')"><td><b>'+_pmE(_pmDlgRefLabel(r))+'</b>'+(r.refType==='atlas'?' <span class="pm-pill" style="background:#dbeafe;color:#1d4ed8">Atlas</span>':'')+'</td>'+
          (g!=='person'?'<td>'+_pmE(pmPersonName(d.personKey))+'</td>':'')+(g!=='project'?'<td class="pm-muted">'+_pmE(_pmProjName(r.projectKey)||'—')+'</td>':'')+
          '<td class="pm-muted">'+(d.delegatedAt?_pmDate(d.delegatedAt.slice(0,10))+(age!=null&&_pmDlgOpen(r)?' · '+age+'d':''):'—')+'</td>'+
          '<td>'+(d.expectedBy?(_pmDlgLate(r,today)?'<b style="color:#dc2626">'+_pmDate(d.expectedBy)+' · late</b>':_pmDate(d.expectedBy)):'<span class="pm-muted">—</span>')+'</td>'+
          '<td>'+(d.followUp&&_pmDlgOpen(r)?(_pmDlgDue(r,today)?'<b style="color:#d97706">'+_pmDate(d.followUp)+'</b>':_pmDate(d.followUp)):'<span class="pm-muted">—</span>')+((d.autoNudge===true||(d.autoNudge==null&&pmSettings(r.projectKey).autoNudge))&&_pmDlgOpen(r)?' <span title="Auto follow-up on">⚡</span>':'')+'</td>'+
          '<td>'+_pmPill(st.label,st.c)+'</td>'+
          '<td class="pm-muted" style="max-width:260px">'+(lastU?_pmE(String(lastU.text).slice(0,90))+(String(lastU.text).length>90?'…':'')+'<br><span style="font-size:10.5px">'+(lastU.by==='delegate'?'from them · ':'')+_pmDate(String(lastU.at).slice(0,10))+'</span>':'—')+'</td>'+
          '<td style="white-space:nowrap" onclick="event.stopPropagation()">'+(_pmDlgOpen(r)?'<button class="btn btn-s" style="height:26px" onclick="pmNudgeDialog('+r.id+')" title="Email them for an update">'+_pmIcon('mail',13)+'</button> <button class="btn btn-s" style="height:26px" onclick="pmLogUpdateDialog('+r.id+')" title="Log an update">'+_pmIcon('edit',13)+'</button> <button class="btn btn-s" style="height:26px" onclick="pmDelegationDone('+r.id+')" title="Mark done">'+_pmIcon('check',13)+'</button>':'')+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  });
  return html;
}

/** Delegate dialog. o = {ref?, projectKey?, title?, recordId?} */
async function pmDelegateDialog(o){
  o=o||{};await pmLoad();
  var rec=o.recordId?pmRec(o.recordId):(o.ref?pmDelegationFor(o.ref):null);
  var d=rec?(rec.data||{}):{};
  var item=o.ref?pmItem(o.ref,o.projectKey):null;
  var title=rec?_pmDlgRefLabel(rec):(item?item.title:(o.title||''));
  var pkey=rec?rec.projectKey:(o.projectKey||(item&&item.src&&item.kind==='task'?pmTaskProjectKey(item.src):''));
  var today=_pmToday();
  var exp=d.expectedBy||(item&&item.due)||'';
  var follow=d.followUp||(exp?(_pmDays(today,exp)>3?_pmAddDays(exp,-2):today):_pmAddDays(today,3));
  var projOpts=pmProjects().map(function(p){return '<option value="'+_pmE(p.key)+'"'+(p.key===pkey?' selected':'')+'>'+_pmE(p.name)+(p.source==='atlas'?' (Atlas)':'')+'</option>';}).join('');
  var auto=d.autoNudge===true?'on':d.autoNudge===false?'off':'project';
  pmModal('<h3>'+_pmIcon('users',18)+' '+(rec?'Edit delegation':'Delegate')+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    (o.ref||rec&&rec.refType!=='text'?'<div class="pm-row"><label>Task</label><div><b>'+_pmE(title)+'</b></div></div>':'<div class="pm-row"><label>What is it?</label><input class="inp" id="pmd-title" value="'+_pmE(title)+'" placeholder="e.g. Draft the SOW for the Air Force renewal"></div>')+
    '<div class="pm-row"><label>Delegate to</label>'+pmPersonSelect('pmd-person',d.personKey||'')+'</div>'+
    '<div class="pm-row"><label>Project</label><select class="inp" id="pmd-proj"><option value="">— none —</option>'+projOpts+'</select></div>'+
    '<div class="pm-row"><label>Expected back by</label><input class="inp" type="date" id="pmd-exp" value="'+_pmE(exp)+'"></div>'+
    '<div class="pm-row"><label>Follow up on</label><input class="inp" type="date" id="pmd-follow" value="'+_pmE(follow)+'"></div>'+
    '<div class="pm-row"><label>Then every</label><select class="inp" id="pmd-cad">'+[0,1,2,3,5,7,14].map(function(n){return '<option value="'+n+'"'+((d.cadenceDays!=null?d.cadenceDays:3)===n?' selected':'')+'>'+(n?n+' day'+(n===1?'':'s')+' until done':'only once')+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Auto follow-up email</label><select class="inp" id="pmd-auto"><option value="project"'+(auto==='project'?' selected':'')+'>Use the project setting</option><option value="on"'+(auto==='on'?' selected':'')+'>On — LevelUp emails them on the follow-up date</option><option value="off"'+(auto==='off'?' selected':'')+'>Off — I will press Follow up myself</option></select></div>'+
    '<div class="pm-row" style="align-items:start"><label>Instructions</label><textarea class="inp" id="pmd-note" rows="3" placeholder="What done looks like, links, context">'+_pmE(d.note||'')+'</textarea></div>'+
    (rec?'':'<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:6px"><input type="checkbox" id="pmd-send" checked> Email them now with the task and instructions</label>')+
    '<div class="pm-acts">'+(rec?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmDelegationCancel('+rec.id+')">Cancel delegation</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Close</button><button class="btn btn-p" id="pmd-save">'+(rec?'Save':'Delegate')+'</button></div>');
  var wire=function(){
    pmWirePersonSelect('pmd-person');
    document.getElementById('pmd-save').onclick=function(){_pmDelegateSave(o,rec);};
  };
  wire();document.getElementById('pm-modal')._handlers=wire;
}
async function _pmDelegateSave(o,rec){
  var v=function(id){var el=document.getElementById(id);return el?(el.type==='checkbox'?el.checked:el.value):'';};
  var personKey=v('pmd-person');if(!personKey||personKey==='__new'){_pmToast('Choose who it goes to','warn');return;}
  var titleIn=document.getElementById('pmd-title');
  var item=o.ref?pmItem(o.ref,o.projectKey):null;
  var title=titleIn?titleIn.value.trim():(rec?_pmDlgRefLabel(rec):(item?item.title:''));
  if(!title){_pmToast('Say what you are handing off','warn');return;}
  var person=pmPerson(personKey);
  var now=new Date().toISOString();
  var autoSel=v('pmd-auto');
  var sendNow=!!v('pmd-send'); // read before the dialog closes
  var isNew=!rec;
  if(!rec){
    var refType='text',refId=null;
    if(o.ref){var p=o.ref.split(':');refType=p[0]==='task'?'task':p[0]==='atlas'?'atlas':p[0]==='ext'?'ext':'text';refId=o.ref.slice(p[0].length+1);}
    rec=pmNew('delegation','',{refType:refType,refId:refId,status:'open',data:{delegatedAt:now,updates:[],nudges:[]}});
  }
  var d=rec.data=Object.assign({},rec.data||{});
  var prevPerson=d.personKey;
  d.personKey=personKey;d.personName=person?person.name:'';d.taskTitle=title;
  rec.projectKey=v('pmd-proj')||'';d.projectName=_pmProjName(rec.projectKey);
  d.expectedBy=v('pmd-exp')||null;d.followUp=v('pmd-follow')||null;d.cadenceDays=Number(v('pmd-cad'))||0;
  d.autoNudge=autoSel==='on'?true:autoSel==='off'?false:null;d.note=v('pmd-note');
  rec.title=title;
  d.updates=(d.updates||[]).concat(isNew?[{at:now,by:'owner',text:'Delegated to '+(person?person.name:'someone')}]:(prevPerson&&prevPerson!==personKey?[{at:now,by:'owner',text:'Re-assigned to '+(person?person.name:'someone')}]:[]));
  pmCloseModal(true);
  try{await pmPut(rec);}catch(_){return;}
  // the task itself records who has it (an existing task field)
  if(rec.refType==='task'){var t=(D.tasks||[]).find(function(x){return String(x.id)===String(rec.refId);});if(t){t.delegatedTo=d.personName;t.updatedAt=now;try{save('tasks');}catch(_){}}}
  _pmToast('🤝 Delegated to '+(person?person.name:'them'));
  if(isNew&&sendNow){
    if(!person||!person.email)_pmToast('No email address for '+(person?person.name:'them')+' — add one in People to send follow-ups','warn');
    else{try{await _trpc('pm.nudge',{recordId:rec.id,note:d.note||'',intro:true},'mutation');_pmToast('✉️ Sent the details to '+person.name);await pmRefreshChanged();}catch(e){_pmToast('Email not sent: '+(e&&e.message||e),'error');}}
  }
  pmRender();try{if(typeof renderCurrentTaskView==='function'&&curScreen==='tasks')renderCurrentTaskView();}catch(_){}
}
async function pmDelegationCancel(id){
  var r=pmRec(id);if(!r)return;if(!confirm('Cancel this delegation? It stays in the history as cancelled.'))return;
  r.status='cancelled';r.data=Object.assign({},r.data);r.data.updates=(r.data.updates||[]).concat([{at:new Date().toISOString(),by:'owner',text:'Delegation cancelled'}]);
  pmCloseModal(true);await pmPut(r);
  if(r.refType==='task'){var t=(D.tasks||[]).find(function(x){return String(x.id)===String(r.refId);});if(t&&t.delegatedTo){delete t.delegatedTo;try{save('tasks');}catch(_){}}}
  pmRender();
}
function pmNudgeDialog(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{};var p=pmPerson(d.personKey);
  if(!p||!p.email){_pmToast((p?p.name:'This person')+' has no email address — add one in People first','warn');return;}
  pmModal('<h3>'+_pmIcon('mail',18)+' Ask '+_pmE(p.name.split(' ')[0])+' for an update<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-muted" style="margin-bottom:10px">Sends a short email to '+_pmE(p.email)+' about <b>'+_pmE(_pmDlgRefLabel(r))+'</b>'+(d.expectedBy?' (expected '+_pmDate(d.expectedBy)+')':'')+'. They just reply — LevelUp reads the reply and updates this delegation.</div>'+
    '<textarea class="inp" id="pmn-note" rows="3" placeholder="Optional note, e.g. “Need this for Thursday’s client call”"></textarea>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmn-send">Send</button></div>');
  document.getElementById('pmn-send').onclick=async function(){
    var b=this;b.disabled=true;b.textContent='Sending…';
    try{await _trpc('pm.nudge',{recordId:r.id,note:document.getElementById('pmn-note').value},'mutation');pmCloseModal(true);_pmToast('✉️ Follow-up sent to '+p.name);await pmRefreshChanged();pmRender();}
    catch(e){b.disabled=false;b.textContent='Send';_pmToast('Not sent: '+(e&&e.message||e),'error');}
  };
}
async function pmNudgeAllDue(key){
  var today=_pmToday();
  var due=pmDelegations(key).filter(function(r){return _pmDlgDue(r,today);});
  var withEmail=due.filter(function(r){var p=pmPerson((r.data||{}).personKey);return p&&p.email;});
  if(!withEmail.length){_pmToast('None of the people due a follow-up have an email address','warn');return;}
  var names=withEmail.map(function(r){return pmPersonName(r.data.personKey)+' — '+_pmDlgRefLabel(r);});
  if(!confirm('Email '+withEmail.length+' follow-up'+(withEmail.length===1?'':'s')+'?\n\n'+names.join('\n')))return;
  var ok=0;for(var i=0;i<withEmail.length;i++){try{await _trpc('pm.nudge',{recordId:withEmail[i].id},'mutation');ok++;}catch(_){}}
  _pmToast('✉️ Sent '+ok+' of '+withEmail.length+' follow-ups');await pmRefreshChanged();pmRender();
}
function pmLogUpdateDialog(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{};
  pmModal('<h3>'+_pmIcon('edit',18)+' Log an update<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-muted" style="margin-bottom:10px">'+_pmE(_pmDlgRefLabel(r))+' · '+_pmE(pmPersonName(d.personKey))+'</div>'+
    '<div class="pm-row"><label>Status</label><select class="inp" id="pml-st">'+['open','on_track','at_risk','blocked','done'].map(function(s){return '<option value="'+s+'"'+((r.status||'open')===s?' selected':'')+'>'+PM_DLG_STATUS[s].label+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>New expected date</label><input class="inp" type="date" id="pml-exp" value="'+_pmE(d.expectedBy||'')+'"></div>'+
    '<div class="pm-row"><label>Next follow-up</label><input class="inp" type="date" id="pml-follow" value="'+_pmE(d.followUp||'')+'"></div>'+
    '<div class="pm-row" style="align-items:start"><label>What they said</label><textarea class="inp" id="pml-text" rows="3" placeholder="e.g. Called — waiting on the client’s numbers, Friday"></textarea></div>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pml-save">Save update</button></div>');
  document.getElementById('pml-save').onclick=async function(){
    var st=document.getElementById('pml-st').value,txt=document.getElementById('pml-text').value.trim();
    r.data=Object.assign({},r.data);var dd=r.data;var now=new Date().toISOString();
    dd.expectedBy=document.getElementById('pml-exp').value||null;dd.followUp=document.getElementById('pml-follow').value||null;
    if(st==='on_track'||st==='at_risk'||st==='blocked')dd.confidence=st;
    dd.updates=(dd.updates||[]).concat([{at:now,by:'owner',text:txt||('Status: '+PM_DLG_STATUS[st].label),status:st}]);dd.lastUpdateAt=now;
    var wasOpen=_pmDlgOpen(r);r.status=st;pmCloseModal(true);await pmPut(r);
    if(st==='done'&&wasOpen)_pmCompleteDelegatedTask(r,true);
    pmRender();
  };
}
async function pmDelegationDone(id){
  var r=pmRec(id);if(!r)return;
  r.status='done';r.data=Object.assign({},r.data);r.data.updates=(r.data.updates||[]).concat([{at:new Date().toISOString(),by:'owner',text:'Marked done'}]);
  await pmPut(r);_pmCompleteDelegatedTask(r,false);pmRender();
}
function _pmCompleteDelegatedTask(r,ask){
  if(r.refType!=='task')return;
  var t=(D.tasks||[]).find(function(x){return String(x.id)===String(r.refId);});if(!t||t.status==='Done')return;
  if(ask&&!confirm('Also mark the task “'+t.title+'” done?'))return;
  t.status='Done';t.updatedAt=new Date().toISOString();try{if(typeof _syncTaskCompletedAt==='function')_syncTaskCompletedAt(t);}catch(_){}
  try{save('tasks');}catch(_){}
  _pmToast('✓ “'+t.title+'” done');
}
function pmDelegationDetail(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{};var p=pmPerson(d.personKey);var st=PM_DLG_STATUS[r.status||'open']||PM_DLG_STATUS.open;
  var hist=(d.updates||[]).slice().reverse().map(function(u){
    var who=u.by==='delegate'?(p?p.name:'Them'):u.by==='system'?'LevelUp':'You';
    return '<div style="padding:8px 0;border-bottom:1px solid var(--bd1)"><div class="pm-muted">'+_pmE(who)+' · '+new Date(u.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+(u.status&&PM_DLG_STATUS[u.status]?' · '+_pmPill(PM_DLG_STATUS[u.status].label,PM_DLG_STATUS[u.status].c):'')+(u.eta?' · new date '+_pmDate(u.eta):'')+'</div><div style="white-space:pre-wrap;font-size:12.5px;margin-top:3px">'+_pmE(u.text)+'</div></div>';
  }).join('');
  pmModal('<h3>'+_pmIcon('users',18)+' '+_pmE(_pmDlgRefLabel(r))+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">'+_pmPill(st.label,st.c)+'<span>with <b>'+_pmE(p?p.name:'?')+'</b>'+(p&&p.email?' <span class="pm-muted">'+_pmE(p.email)+'</span>':'')+'</span>'+
      (d.expectedBy?'<span class="pm-muted">· expected '+_pmDate(d.expectedBy)+'</span>':'')+(d.followUp&&_pmDlgOpen(r)?'<span class="pm-muted">· follow up '+_pmDate(d.followUp)+'</span>':'')+'</div>'+
    (d.note?'<div class="pm-card" style="margin-bottom:10px;white-space:pre-wrap;font-size:12.5px">'+_pmE(d.note)+'</div>':'')+
    '<div class="pm-h">History</div><div style="max-height:46vh;overflow:auto">'+(hist||'<div class="pm-muted">Nothing yet.</div>')+'</div>'+
    '<div class="pm-acts">'+(r.refType==='task'||r.refType==='atlas'?'<button class="btn btn-s" style="margin-right:auto" onclick="pmCloseModal();pmOpenItem(\''+_pmJ(r.refType==='task'?'task:'+r.refId:'atlas:'+r.refId)+'\')">Open task</button>':'')+
      (_pmDlgOpen(r)?'<button class="btn btn-s" onclick="pmNudgeDialog('+r.id+')">Follow up</button><button class="btn btn-s" onclick="pmLogUpdateDialog('+r.id+')">Log update</button>':'')+
      '<button class="btn btn-s" onclick="pmDelegateDialog({recordId:'+r.id+'})">Edit</button><button class="btn btn-s" style="color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Delegation deleted\')">Delete</button></div>',true);
}

// The task drawer gets a 🤝 Delegate button next to Push to Nifty.
(function(){
  if(typeof openDrawer!=='function')return;
  var orig=openDrawer;
  window.openDrawer=function(type,item){
    var r=orig.apply(this,arguments);
    try{if(type==='task'&&item&&item.id!=null)_pmDrawerButton(item);}catch(_){}
    return r;
  };
})();
function _pmDrawerButton(t){
  var row=document.querySelector('#drawer-content .dr-actions');if(!row||row.querySelector('.pm-dlg-btn'))return;
  var b=document.createElement('button');b.className='btn btn-s pm-dlg-btn';b.type='button';
  var ref='task:'+t.id;
  var set=function(){var rec=PM.loaded?pmDelegationFor(ref):null;b.textContent=rec?'🤝 With '+String((rec.data||{}).personName||'someone').split(' ')[0]:'🤝 Delegate';b.title=rec?'Delegated — open the delegation':'Hand this to someone and track it';};
  set();if(!PM.loaded)pmLoad().then(set);
  b.onclick=function(e){e.preventDefault();var rec=pmDelegationFor(ref);if(rec)pmDelegationDetail(rec.id);else pmDelegateDialog({ref:ref,projectKey:pmTaskProjectKey(t)});};
  var del=Array.prototype.find.call(row.querySelectorAll('button'),function(x){return /delete/i.test(x.textContent||'');});
  row.insertBefore(b,del||null);
}

// ═══ OVERVIEW + PORTFOLIO ═══════════════════════════════════════════════════
function pmProgress(key){
  var items=pmItems(key);var parents={};items.forEach(function(i){if(i.parent)parents[i.parent]=1;});
  var leaves=items.filter(function(i){return !parents[i.ref];});
  var done=leaves.filter(function(i){return i.done;}).length;
  var today=_pmToday();var overdue=leaves.filter(function(i){return !i.done&&i.due&&i.due<today;}).length;
  return {total:leaves.length,done:done,pct:leaves.length?Math.round(done/leaves.length*100):0,overdue:overdue};
}
function pmRiskScore(r){var d=r.data||{};return (Number(d.probability)||0)*(Number(d.impact)||0);}
function pmRag(key){
  var latest=pmRecs('report',key).filter(function(r){return r.data&&r.data.rag;}).sort(function(a,b){return String(b.createdAt||b.updatedAt).localeCompare(String(a.createdAt||a.updatedAt));})[0];
  var today=_pmToday(),pr=pmProgress(key);
  var late=pmDelegations(key).filter(function(r){return _pmDlgLate(r,today);}).length;
  var high=pmRecs('risk',key).filter(function(r){return r.status!=='closed'&&pmRiskScore(r)>=15;}).length;
  var ev=typeof pmEvm==='function'?pmEvm(key):null;
  var spi=ev&&ev.spi,cpi=ev&&ev.cpi;
  var od=pr.total?pr.overdue/pr.total:0;
  var computed=(late>2||high>=2||(spi&&spi<0.85)||(cpi&&cpi<0.85)||od>0.25)?'red':(late||high||(spi&&spi<0.95)||(cpi&&cpi<0.95)||od>0.1)?'amber':'green';
  return {computed:computed,reported:latest?latest.data.rag:null,rag:latest&&(Date.now()-new Date(latest.updatedAt).getTime())<14*86400e3?latest.data.rag:computed};
}
function _pmRagPill(r){var c={green:'#16a34a',amber:'#d97706',red:'#dc2626'}[r]||'#64748b';return _pmPill(({green:'Green',amber:'Amber',red:'Red'})[r]||'—',c);}
function pmMilestones(key){
  var out=[];var pr=pmProject(key);
  if(pr&&pr.source==='native')(pr.rec.milestones||[]).forEach(function(m,i){var dt=m.date||m.due||m.targetDate;out.push({ref:'pm:'+i,name:m.title||m.name||m.label||'Milestone',date:_pmIsYmd(dt)?dt:null,done:!!(m.done||/done|complete/i.test(m.status||'')),src:'project'});});
  pmRecs('milestone',key).forEach(function(r){var d=r.data||{};out.push({ref:'rec:'+r.id,id:r.id,name:r.title||'Milestone',date:d.date||null,done:r.status==='done',src:'pm'});});
  pmItems(key).filter(function(i){return i.milestone;}).forEach(function(i){out.push({ref:i.ref,name:i.title,date:i.due,done:i.done,src:i.kind});});
  pmRecs('wbs',key).filter(function(r){return r.data&&r.data.milestone;}).forEach(function(r){out.push({ref:'wbs:'+r.id,name:r.title,date:r.data.finish||r.data.start||null,done:r.status==='done',src:'wbs'});});
  return out.sort(function(a,b){return String(a.date||'9999').localeCompare(String(b.date||'9999'));});
}
function pmTab_overview(key){
  var today=_pmToday(),pr=pmProgress(key),rag=pmRag(key);
  var dl=pmDelegations(key),late=dl.filter(function(r){return _pmDlgLate(r,today);}),due=dl.filter(function(r){return _pmDlgDue(r,today);});
  var risks=pmRecs('risk',key).filter(function(r){return r.status!=='closed';}).sort(function(a,b){return pmRiskScore(b)-pmRiskScore(a);});
  var issues=pmRecs('issue',key).filter(function(r){return r.status!=='closed'&&r.status!=='resolved';});
  var ms=pmMilestones(key).filter(function(m){return !m.done;});
  var ev=pmEvm(key);
  var raciGaps=typeof pmRaciGaps==='function'?pmRaciGaps(key):[];
  var k=function(v,l,c,go){return '<div class="pm-kpi"'+(go?' style="cursor:pointer" onclick="pmGo(null,\''+go+'\')"':'')+'><b'+(c?' style="color:'+c+'"':'')+'>'+v+'</b><span>'+l+'</span></div>';};
  var html='<div class="pm-kpis">'+k(_pmRagPill(rag.rag),'Status'+(rag.reported&&rag.reported!==rag.computed?' (data says '+rag.computed+')':''),null,'reports')+
    k(pr.pct+'%','Complete · '+pr.done+'/'+pr.total,null,'schedule')+k(pr.overdue,'Overdue items',pr.overdue?'#dc2626':null,'schedule')+
    k(dl.filter(_pmDlgOpen).length,'Delegated · '+late.length+' late',late.length?'#dc2626':null,'waiting')+
    k(risks.length,'Open risks · '+risks.filter(function(r){return pmRiskScore(r)>=15;}).length+' high',null,'raid')+
    (ev&&ev.bac?k(ev.cpi?ev.cpi.toFixed(2):'—','Cost performance (CPI)',ev.cpi&&ev.cpi<0.95?'#d97706':null,'budget')+k(ev.spi?ev.spi.toFixed(2):'—','Schedule performance (SPI)',ev.spi&&ev.spi<0.95?'#d97706':null,'budget'):'')+'</div>';
  var card=function(title,icon,body,go){return '<div class="pm-card"><div class="pm-h">'+_pmIcon(icon,15)+' '+title+'<span class="sp"></span>'+(go?'<button class="btn btn-s" style="height:24px;font-size:11px" onclick="pmGo(null,\''+go+'\')">Open</button>':'')+'</div>'+body+'</div>';};
  var li=function(arr,fn,empty){return arr.length?'<div style="display:flex;flex-direction:column;gap:6px">'+arr.map(fn).join('')+'</div>':'<div class="pm-muted">'+empty+'</div>';};
  html+='<div class="pm-grid2">'+
    card('Waiting on others','clock',li(late.concat(due.filter(function(r){return late.indexOf(r)<0;})).slice(0,8),function(r){var d=r.data||{};return '<div style="font-size:12.5px;cursor:pointer" onclick="pmDelegationDetail('+r.id+')"><b>'+_pmE(_pmDlgRefLabel(r))+'</b> <span class="pm-muted">· '+_pmE(pmPersonName(d.personKey))+'</span> '+(_pmDlgLate(r,today)?_pmPill('late '+_pmDate(d.expectedBy),'#dc2626'):_pmPill('follow up','#d97706'))+'</div>';},'Nothing late or due a follow-up.'),'waiting')+
    card('Top risks','alertTriangle',li(risks.slice(0,6),function(r){var s=pmRiskScore(r);return '<div style="font-size:12.5px;cursor:pointer" onclick="pmRaidDialog(\'risk\','+r.id+')">'+_pmPill(String(s),_pmHeatColor(s))+' <b>'+_pmE(r.title)+'</b>'+((r.data||{}).owner?' <span class="pm-muted">· '+_pmE(pmPersonName(r.data.owner))+'</span>':'')+'</div>';},'No open risks logged.'),'raid')+
    card('Upcoming milestones','target',li(ms.slice(0,6),function(m){var lateM=m.date&&m.date<today;return '<div style="font-size:12.5px"><b>'+_pmE(m.name)+'</b> <span class="pm-muted">· '+(m.date?_pmDate(m.date):'no date')+'</span>'+(lateM?' '+_pmPill('late','#dc2626'):'')+'</div>';},'No milestones yet — add them on the Schedule tab.'),'schedule')+
    card('Open issues','alertCircle',li(issues.slice(0,6),function(r){return '<div style="font-size:12.5px;cursor:pointer" onclick="pmRaidDialog(\'issue\','+r.id+')"><b>'+_pmE(r.title)+'</b>'+((r.data||{}).priority?' <span class="pm-muted">· '+_pmE(r.data.priority)+'</span>':'')+'</div>';},'No open issues.'),'raid')+
    card('RACI gaps','users',li(raciGaps.slice(0,6),function(g){return '<div style="font-size:12.5px"><b>'+_pmE(g.title)+'</b> <span class="pm-muted">· '+_pmE(g.problem)+'</span></div>';},pmRecs('raci',key).length?'Every row has one Accountable and at least one Responsible.':'No RACI yet.'),'raci')+
    card('Quick actions','zap','<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-s" onclick="pmDelegateDialog({projectKey:\''+_pmJ(key)+'\'})">Delegate</button><button class="btn btn-s" onclick="pmRaidDialog(\'risk\',null,\''+_pmJ(key)+'\')">Add a risk</button><button class="btn btn-s" onclick="pmGo(null,\'reports\');setTimeout(function(){pmReportNew(\''+_pmJ(key)+'\')},50)">Status report</button><button class="btn btn-s" onclick="pmBaselineSave(\''+_pmJ(key)+'\')">Save a baseline</button><button class="btn btn-s" onclick="pmMeetingNotesDialog(\''+_pmJ(key)+'\')">Actions from meeting notes</button></div>')+
  '</div>';
  return html;
}

function pmTab_portfolio(){
  var projects=pmProjects();var today=_pmToday();
  var rows=projects.map(function(p){
    var pr=pmProgress(p.key),dl=pmDelegations(p.key),hasPm=PM.records.some(function(r){return r.projectKey===p.key;});
    var ev=pmEvm(p.key);var ms=pmMilestones(p.key).filter(function(m){return !m.done&&m.date;})[0];
    return {p:p,pr:pr,open:dl.filter(_pmDlgOpen).length,late:dl.filter(function(r){return _pmDlgLate(r,today);}).length,
      risks:pmRecs('risk',p.key).filter(function(r){return r.status!=='closed'&&pmRiskScore(r)>=15;}).length,ev:ev,ms:ms,rag:pmRag(p.key).rag,active:hasPm||pr.total>0};
  });
  var shown=_pmState.pfAll?rows:rows.filter(function(r){return r.active;});
  // programs: native programs own native projects; Atlas projects sit together
  var progs=(Array.isArray(D.programs)?D.programs:[]);
  var groupOf=function(r){if(r.p.source==='atlas')return 'Atlas · CommunityForce';var g=progs.find(function(pg){return (pg.projectIds||[]).map(String).indexOf(String(r.p.id))>=0;});return g?g.name:'No program';};
  var groups={};shown.forEach(function(r){(groups[groupOf(r)]=groups[groupOf(r)]||[]).push(r);});
  var tot=function(f){return shown.reduce(function(s,r){return s+f(r);},0);};
  var html='<div class="pm-kpis">'+
    '<div class="pm-kpi"><b>'+shown.length+'</b><span>Projects shown</span></div>'+
    '<div class="pm-kpi"><b style="color:#dc2626">'+shown.filter(function(r){return r.rag==='red';}).length+'</b><span>Red</span></div>'+
    '<div class="pm-kpi"><b style="color:#d97706">'+shown.filter(function(r){return r.rag==='amber';}).length+'</b><span>Amber</span></div>'+
    '<div class="pm-kpi"><b>'+tot(function(r){return r.open;})+'</b><span>Delegated items open</span></div>'+
    '<div class="pm-kpi"><b style="color:#dc2626">'+tot(function(r){return r.late;})+'</b><span>Delegations late</span></div>'+
    '<div class="pm-kpi"><b>'+tot(function(r){return r.risks;})+'</b><span>High risks</span></div>'+
    '<div class="pm-kpi"><b>'+_pmMoney(tot(function(r){return r.ev&&r.ev.bac||0;}))+'</b><span>Total budget</span></div></div>'+
    '<div class="pm-bar"><button class="btn btn-p" onclick="pmTemplateNewProject()">'+_pmIcon('plus',14,'#fff')+' New project from a template</button><span class="sp"></span><label class="pm-muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" '+(_pmState.pfAll?'checked':'')+' onchange="_pmState.pfAll=this.checked;_pmSaveState();pmRender()"> Show projects with no work yet</label></div>';
  if(!shown.length)return html+'<div class="pm-card pm-empty"><b>No active projects</b>Pick a project above, or create one from a template.</div>';
  Object.keys(groups).sort().forEach(function(gname){
    html+='<div class="pm-card" style="margin-bottom:12px"><div class="pm-h">'+_pmIcon('layers',15)+' '+_pmE(gname)+'<span class="sp"></span><span class="pm-muted">'+groups[gname].length+' project'+(groups[gname].length===1?'':'s')+'</span></div><div class="pm-scroll"><table class="pm-table"><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Overdue</th><th>Delegated</th><th>High risks</th><th>Budget</th><th>CPI</th><th>SPI</th><th>Next milestone</th></tr></thead><tbody>'+
      groups[gname].map(function(r){
        return '<tr class="clk" onclick="pmGo(\''+_pmJ(r.p.key)+'\',\'overview\')"><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+_pmE(r.p.color)+';margin-right:6px"></span><b>'+_pmE(r.p.name)+'</b>'+(r.p.source==='atlas'?' <span class="pm-pill" style="background:#dbeafe;color:#1d4ed8">Atlas</span>':'')+'</td>'+
          '<td>'+_pmRagPill(r.rag)+'</td><td><div style="display:flex;align-items:center;gap:6px;min-width:110px"><div style="flex:1;height:6px;border-radius:3px;background:var(--s3)"><div style="height:6px;border-radius:3px;width:'+r.pr.pct+'%;background:var(--page-accent)"></div></div><span class="pm-muted">'+r.pr.pct+'%</span></div></td>'+
          '<td>'+(r.pr.overdue?'<b style="color:#dc2626">'+r.pr.overdue+'</b>':'0')+'</td><td>'+r.open+(r.late?' <span style="color:#dc2626">('+r.late+' late)</span>':'')+'</td><td>'+(r.risks?'<b style="color:#dc2626">'+r.risks+'</b>':'0')+'</td>'+
          '<td>'+(r.ev&&r.ev.bac?_pmMoney(r.ev.bac):'<span class="pm-muted">—</span>')+'</td><td>'+(r.ev&&r.ev.cpi?r.ev.cpi.toFixed(2):'<span class="pm-muted">—</span>')+'</td><td>'+(r.ev&&r.ev.spi?r.ev.spi.toFixed(2):'<span class="pm-muted">—</span>')+'</td>'+
          '<td class="pm-muted">'+(r.ms?_pmE(r.ms.name)+' · '+_pmDate(r.ms.date):'—')+'</td></tr>';
      }).join('')+'</tbody></table></div></div>';
  });
  return html;
}

// ═══ RACI (phase 1) ═════════════════════════════════════════════════════════
// One pm_records row per matrix row: kind 'raci', refType 'item' (refId = an
// item ref like "task:12" / "atlas:activity:x") or 'deliverable' (refId = a
// uid, title = the deliverable). data.cells = { personKey: "RA" }.
// The columns (people) are per project: pmSettings(key).raciPeople.
var PM_RACI_C={R:'#2563eb',A:'#7c3aed',C:'#d97706',I:'#64748b'};
var PM_RACI_HELP={R:'Responsible — does the work',A:'Accountable — owns the outcome (exactly one)',C:'Consulted — asked before',I:'Informed — told after'};
function pmRaciRows(key){
  var recs=pmRecs('raci',key);
  var byRef={};recs.forEach(function(r){byRef[r.refType+'|'+r.refId]=r;});
  var items=pmItems(key);var hideDone=!!_pmState.raciHideDone;
  var rows=[];
  var depth={};items.forEach(function(i){var d=0,p=i.parent,guard=0;while(p&&guard++<6){d++;var pi=items.find(function(x){return x.ref===p;});p=pi?pi.parent:null;}depth[i.ref]=d;});
  // keep parents before children
  var ordered=[];var kids={};items.forEach(function(i){if(i.parent&&items.some(function(x){return x.ref===i.parent;}))(kids[i.parent]=kids[i.parent]||[]).push(i);});
  var walk=function(i){ordered.push(i);(kids[i.ref]||[]).forEach(walk);};
  items.filter(function(i){return !(i.parent&&items.some(function(x){return x.ref===i.parent;}));}).forEach(walk);
  ordered.forEach(function(i){if(hideDone&&i.done)return;rows.push({rowKey:'item|'+i.ref,title:i.title,item:i,depth:depth[i.ref]||0,rec:byRef['item|'+i.ref]||null});});
  recs.filter(function(r){return r.refType==='deliverable';}).sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0);}).forEach(function(r){rows.push({rowKey:'deliverable|'+r.refId,title:r.title,deliverable:true,depth:0,rec:r});});
  return rows;
}
function pmRaciCells(row){return (row.rec&&row.rec.data&&row.rec.data.cells)||{};}
function pmRaciProblem(cells){
  var a=0,r=0;Object.keys(cells).forEach(function(k){var v=cells[k]||'';if(v.indexOf('A')>=0)a++;if(v.indexOf('R')>=0)r++;});
  if(!a&&!r)return 'empty';if(!a)return 'No Accountable';if(a>1)return a+' Accountables';if(!r)return 'No Responsible';return '';
}
function pmRaciGaps(key){
  return pmRaciRows(key).filter(function(row){return row.rec&&!(row.item&&row.item.done);}).map(function(row){return {title:row.title,problem:pmRaciProblem(pmRaciCells(row))};}).filter(function(g){return g.problem&&g.problem!=='empty';});
}
function pmRaciPeople(key){var s=pmSettings(key);return Array.isArray(s.raciPeople)?s.raciPeople:[];}
function pmTab_raci(key){
  var people=pmRaciPeople(key),rows=pmRaciRows(key);
  var html='<div class="pm-bar">'+pmPersonSelect('pm-raci-add','',{blankLabel:'＋ Add a person column…'})+
    '<button class="btn btn-s" onclick="pmRaciAddDeliverable(\''+_pmJ(key)+'\')">＋ Deliverable row</button>'+
    '<button class="btn btn-s" onclick="pmRaciAutofill(\''+_pmJ(key)+'\')" title="Fill empty rows from task assignees and delegations">'+_pmIcon('sparkles',14)+' Fill from assignments</button>'+
    '<label class="pm-muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" '+(_pmState.raciHideDone?'checked':'')+' onchange="_pmState.raciHideDone=this.checked;_pmSaveState();pmRender()"> Hide done</label>'+
    '<span class="sp"></span><button class="btn btn-s" onclick="pmRaciExport(\''+_pmJ(key)+'\',\'xlsx\')">Excel</button><button class="btn btn-s" onclick="pmRaciExport(\''+_pmJ(key)+'\',\'csv\')">CSV</button><button class="btn btn-s" onclick="pmRaciPrint(\''+_pmJ(key)+'\')">Print</button></div>'+
    '<div class="pm-muted" style="margin-bottom:8px">'+Object.keys(PM_RACI_HELP).map(function(k){return '<b style="color:'+PM_RACI_C[k]+'">'+k+'</b> '+PM_RACI_HELP[k];}).join(' &nbsp;·&nbsp; ')+'. Click a cell to set it.</div>';
  if(!people.length){
    return html+'<div class="pm-card pm-empty"><b>Add the people involved</b>Use “Add a person column” above — team members, your Contacts, or anyone you add. Then click cells to mark who is Responsible, Accountable, Consulted and Informed.</div>';
  }
  if(!rows.length)return html+'<div class="pm-card pm-empty"><b>No rows yet</b>This project has no tasks. Add tasks to the project, or add deliverable rows.</div>';
  var counts={};people.forEach(function(p){counts[p]={R:0,A:0,C:0,I:0};});
  html+='<div class="pm-card pm-scroll" style="padding:0;max-height:70vh"><table class="pm-table pm-raci"><thead><tr><th style="min-width:260px">Task / deliverable</th>'+
    people.map(function(p){return '<th class="p" title="'+_pmE(pmPersonName(p))+'"><span style="display:inline-flex;align-items:center;gap:4px">'+_pmE(pmPersonName(p))+' <a href="javascript:void(0)" title="Remove column" style="color:var(--t3);text-decoration:none" onclick="pmRaciRemovePerson(\''+_pmJ(key)+'\',\''+_pmJ(p)+'\')">×</a></span></th>';}).join('')+
    '<th>Check</th><th></th></tr></thead><tbody>'+
    rows.map(function(row){
      var cells=pmRaciCells(row);var prob=pmRaciProblem(cells);
      people.forEach(function(p){var v=cells[p]||'';'RACI'.split('').forEach(function(l){if(v.indexOf(l)>=0)counts[p][l]++;});});
      var me=_pmMe().key;
      var rPeople=people.filter(function(p){return (cells[p]||'').indexOf('R')>=0&&p!==me;});
      var canDelegate=row.item&&!row.item.done&&rPeople.length&&!pmDelegationFor(row.item.ref);
      return '<tr><td style="padding-left:'+(8+row.depth*16)+'px"><span'+(row.item?' style="cursor:pointer" onclick="pmOpenItem(\''+_pmJ(row.item.ref)+'\')"':'')+'>'+(row.depth?'↳ ':'')+(row.deliverable?'📦 ':'')+_pmE(row.title)+'</span>'+(row.item&&row.item.done?' <span class="pm-muted">✓</span>':'')+(row.item&&row.item.kind==='atlas'?' <span class="pm-pill" style="background:#dbeafe;color:#1d4ed8">Atlas</span>':'')+'</td>'+
        people.map(function(p){var v=cells[p]||'';return '<td class="c" onclick="pmRaciCell(event,\''+_pmJ(key)+'\',\''+_pmJ(row.rowKey)+'\',\''+_pmJ(p)+'\')">'+v.split('').map(function(l){return '<span style="color:'+PM_RACI_C[l]+'">'+l+'</span>';}).join('')+'</td>';}).join('')+
        '<td>'+(prob===''?'<span style="color:#16a34a">✓</span>':prob==='empty'?'<span class="pm-muted">—</span>':'<span style="color:#dc2626;font-size:11.5px">'+_pmE(prob)+'</span>')+'</td>'+
        '<td style="white-space:nowrap">'+(canDelegate?'<button class="btn btn-s" style="height:24px;font-size:11px" title="Track this as delegated to '+_pmE(pmPersonName(rPeople[0]))+'" onclick="pmRaciDelegate(\''+_pmJ(key)+'\',\''+_pmJ(row.item.ref)+'\',\''+_pmJ(rPeople[0])+'\')">🤝</button>':'')+
          (row.deliverable?'<button class="btn btn-s" style="height:24px;font-size:11px" onclick="pmDel(pmRec(\''+_pmJ(row.rec._lk)+'\'),\'Deliverable removed\')">×</button>':'')+'</td></tr>';
    }).join('')+
    '<tr><td class="pm-muted" style="text-align:right">Totals</td>'+people.map(function(p){var c=counts[p];var hot=c.A>Math.max(6,rows.length*0.5);return '<td class="pm-heatcell" style="'+(hot?'color:#dc2626':'')+'" title="'+c.R+' R · '+c.A+' A · '+c.C+' C · '+c.I+' I'+(hot?' — accountable for a lot':'')+'">'+c.R+'R '+c.A+'A</td>';}).join('')+'<td></td><td></td></tr>'+
    '</tbody></table></div>';
  return html;
}
function pmTabAfter_raci(key){
  pmWirePersonSelect('pm-raci-add',function(v){
    if(!v)return;var ppl=pmRaciPeople(key);if(ppl.indexOf(v)<0)ppl=ppl.concat([v]);
    pmSetSettings(key,{raciPeople:ppl});pmRender();
  });
}
function pmRaciRemovePerson(key,p){
  if(!confirm('Remove '+pmPersonName(p)+' from this RACI? Their letters stay saved and come back if you add them again.'))return;
  pmSetSettings(key,{raciPeople:pmRaciPeople(key).filter(function(x){return x!==p;})});pmRender();
}
function _pmRaciRec(key,rowKey){
  var i=rowKey.indexOf('|'),t=rowKey.slice(0,i),id=rowKey.slice(i+1);
  var r=pmRecs('raci',key).find(function(x){return x.refType===t&&x.refId===id;});
  if(!r){var it=t==='item'?pmItem(id,key):null;r=pmNew('raci',key,{refType:t,refId:id,title:it?it.title:'',data:{cells:{}}});}
  return r;
}
function pmRaciCell(ev,key,rowKey,p){
  ev.stopPropagation();
  var old=document.getElementById('pm-raci-pop');if(old)old.remove();
  var r=_pmRaciRec(key,rowKey);var cur=((r.data||{}).cells||{})[p]||'';
  var pop=document.createElement('div');pop.id='pm-raci-pop';
  pop.style.cssText='position:fixed;z-index:1006;background:var(--s1);border:1px solid var(--bd2);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:6px;display:flex;gap:4px';
  pop.innerHTML='RACI'.split('').map(function(l){var on=cur.indexOf(l)>=0;return '<button title="'+_pmE(PM_RACI_HELP[l])+'" data-l="'+l+'" style="width:34px;height:30px;border-radius:6px;border:1px solid '+(on?PM_RACI_C[l]:'var(--bd2)')+';background:'+(on?'color-mix(in srgb,'+PM_RACI_C[l]+' 22%,transparent)':'transparent')+';color:'+PM_RACI_C[l]+';font-weight:800;cursor:pointer">'+l+'</button>';}).join('')+'<button data-l="" title="Clear" style="width:30px;height:30px;border-radius:6px;border:1px solid var(--bd2);background:transparent;color:var(--t3);cursor:pointer">×</button>';
  var rect=ev.currentTarget.getBoundingClientRect();
  pop.style.left=Math.max(8,Math.min(window.innerWidth-200,rect.left-60))+'px';pop.style.top=Math.min(window.innerHeight-50,rect.bottom+4)+'px';
  document.body.appendChild(pop);
  pop.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;var l=b.getAttribute('data-l');
    var cells=Object.assign({},(r.data||{}).cells||{});
    var v=cells[p]||'';
    if(!l)v='';else v=v.indexOf(l)>=0?v.replace(l,''):('RACI'.split('').filter(function(x){return x===l||v.indexOf(x)>=0;}).join(''));
    // Accountable is single: setting A here clears it elsewhere on the row
    if(l==='A'&&v.indexOf('A')>=0)Object.keys(cells).forEach(function(k){if(k!==p&&cells[k])cells[k]=cells[k].replace('A','');});
    if(v)cells[p]=v;else delete cells[p];
    r.data=Object.assign({},r.data||{},{cells:cells});
    pmPut(r);pop.remove();pmRender();
  });
  setTimeout(function(){document.addEventListener('click',function close(e){if(!pop.contains(e.target)){pop.remove();document.removeEventListener('click',close);}});},0);
}
function pmRaciAddDeliverable(key){
  var t=prompt('Deliverable (a row that is not a task, e.g. “Signed SOW”, “ATO package”):');if(!t||!t.trim())return;
  pmPut(pmNew('raci',key,{refType:'deliverable',refId:_pmUid(),title:t.trim(),sortOrder:Date.now()%1e9,data:{cells:{}}}));pmRender();
}
function pmRaciDelegate(key,ref,personKey){
  pmDelegateDialog({ref:ref,projectKey:key});
  setTimeout(function(){var s=document.getElementById('pmd-person');if(s)s.value=personKey;},30);
}
/** Fill EMPTY rows: assignees / delegate → R, me → A (unless someone else is). */
function pmRaciAutofill(key){
  var me=_pmMe().key,rows=pmRaciRows(key),n=0;var ppl=pmRaciPeople(key).slice();
  var addCol=function(k){if(k&&ppl.indexOf(k)<0)ppl.push(k);};
  rows.forEach(function(row){
    if(!row.item||Object.keys(pmRaciCells(row)).length)return;
    var cells={},t=row.item.kind==='task'?row.item.src:null;
    var dlg=pmDelegationFor(row.item.ref);
    if(dlg&&dlg.data&&dlg.data.personKey)cells[dlg.data.personKey]='R';
    if(t&&Array.isArray(t.assignees))t.assignees.forEach(function(uid){var k='u:'+uid;if(k!==me)cells[k]=(cells[k]||'').indexOf('R')>=0?cells[k]:'R';});
    if(!Object.keys(cells).length&&t&&t.assignedTo){var hit=pmFindPersonByName(t.assignedTo);if(hit&&hit.key!==me)cells[hit.key]='R';}
    cells[me]=Object.keys(cells).length?'A':'RA';
    Object.keys(cells).forEach(addCol);
    var r=_pmRaciRec(key,row.rowKey);r.title=row.title;r.data=Object.assign({},r.data||{},{cells:cells});pmPut(r);n++;
  });
  if(ppl.length!==pmRaciPeople(key).length)pmSetSettings(key,{raciPeople:ppl});
  _pmToast(n?'Filled '+n+' row'+(n===1?'':'s')+' — check them over':'Nothing to fill: every row already has letters');pmRender();
}
function _pmRaciTable(key){
  var people=pmRaciPeople(key),rows=pmRaciRows(key);
  var head=['Task / deliverable'].concat(people.map(pmPersonName)).concat(['Check']);
  var body=rows.map(function(row){var c=pmRaciCells(row);return [(row.depth?'  '.repeat(row.depth)+'↳ ':'')+row.title].concat(people.map(function(p){return c[p]||'';})).concat([pmRaciProblem(c)==='empty'?'':pmRaciProblem(c)||'OK']);});
  return {head:head,body:body};
}
async function pmRaciExport(key,fmt){
  var t=_pmRaciTable(key),name='RACI - '+(_pmProjName(key)||'project');
  if(fmt==='csv'){_pmDownload(name+'.csv',_pmCsv([t.head].concat(t.body)),'text/csv');return;}
  await _pmXlsx(name+'.xlsx',[{name:'RACI',rows:[t.head].concat(t.body)},{name:'Key',rows:[['Letter','Meaning']].concat(Object.keys(PM_RACI_HELP).map(function(k){return [k,PM_RACI_HELP[k]];}))}]);
}
function pmRaciPrint(key){
  var t=_pmRaciTable(key);
  _pmPrint('RACI — '+(_pmProjName(key)||''),'<table><thead><tr>'+t.head.map(function(h){return '<th>'+_pmE(h)+'</th>';}).join('')+'</tr></thead><tbody>'+t.body.map(function(r){return '<tr>'+r.map(function(c,i){return '<td'+(i>0&&i<r.length-1?' style="text-align:center;font-weight:700"':'')+'>'+_pmE(c)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table><p style="font-size:11px;color:#555">'+Object.keys(PM_RACI_HELP).map(function(k){return '<b>'+k+'</b> '+PM_RACI_HELP[k];}).join(' · ')+'</p>');
}

// ─── export helpers (shared) ────────────────────────────────────────────────
function _pmCsv(rows){return rows.map(function(r){return r.map(function(c){var s=c==null?'':String(c);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',');}).join('\r\n');}
function _pmDownload(name,content,mime){
  var blob=content instanceof Blob?content:new Blob([content],{type:mime||'text/plain'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name.replace(/[\\/:*?"<>|]+/g,'-');document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
}
async function _pmXlsx(name,sheets){
  try{
    var X=typeof _ensureXLSX==='function'?await _ensureXLSX():window.XLSX;
    if(!X)throw new Error('Excel library unavailable');
    var wb=X.utils.book_new();
    sheets.forEach(function(sh){var ws=X.utils.aoa_to_sheet(sh.rows);if(sh.cols)ws['!cols']=sh.cols;X.utils.book_append_sheet(wb,ws,String(sh.name).slice(0,31));});
    X.writeFile(wb,name.replace(/[\\/:*?"<>|]+/g,'-'));
  }catch(e){_pmToast('Excel export failed ('+(e&&e.message||e)+') — downloading CSV instead','warn');_pmDownload(name.replace(/\.xlsx$/,'.csv'),_pmCsv(sheets[0].rows),'text/csv');}
}
function _pmPrint(title,bodyHtml){
  var w=window.open('','_blank');if(!w){_pmToast('Allow pop-ups to print','warn');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+_pmE(title)+'</title><style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #0891b2;padding-bottom:3px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:11px}.muted{color:#64748b}.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-weight:700;font-size:11px}@page{margin:14mm}</style></head><body><h1>'+_pmE(title)+'</h1><div class="muted">'+new Date().toLocaleDateString()+'</div>'+bodyHtml+'</body></html>');
  w.document.close();setTimeout(function(){try{w.focus();w.print();}catch(_){}},400);
}

// ═══ RAID log (phase 2) ═════════════════════════════════════════════════════
var PM_RAID={
  risk:{label:'Risks',one:'risk',prefix:'R',statuses:['open','monitoring','closed']},
  issue:{label:'Issues',one:'issue',prefix:'I',statuses:['open','in progress','resolved','closed']},
  assumption:{label:'Assumptions',one:'assumption',prefix:'A',statuses:['unvalidated','validated','invalid']},
  decision:{label:'Decisions',one:'decision',prefix:'D',statuses:['proposed','approved','superseded']},
};
function _pmHeatColor(s){return s>=15?'#dc2626':s>=10?'#ea580c':s>=5?'#ca8a04':'#16a34a';}
function _pmRaidList(kind,key){return (key==='all'?pmRecs(kind):pmRecs(kind,key)).slice().sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0)||(a.id||0)-(b.id||0);});}
function _pmRaidNo(r){var d=r.data||{};return d.no?PM_RAID[r.kind].prefix+'-'+d.no:'';}
function pmTab_raid(key){
  var sub=_pmState.raidSub||'risk';var all=key==='all';
  var counts=function(k){return _pmRaidList(k,key).filter(function(r){return ['closed','resolved','invalid','superseded'].indexOf(r.status)<0;}).length;};
  var html='<div class="pm-bar">'+Object.keys(PM_RAID).map(function(k){return '<button class="pm-chip'+(sub===k?' on':'')+'" onclick="_pmState.raidSub=\''+k+'\';_pmSaveState();pmRender()">'+PM_RAID[k].label+' <b>'+counts(k)+'</b></button>';}).join('')+
    '<span class="sp"></span>'+(all?'':'<button class="btn btn-p" onclick="pmRaidDialog(\''+sub+'\',null,\''+_pmJ(key)+'\')">'+_pmIcon('plus',14,'#fff')+' Add '+PM_RAID[sub].one+'</button>')+
    '<button class="btn btn-s" onclick="pmRaidExport(\''+_pmJ(key)+'\')">Excel</button></div>';
  var list=_pmRaidList(sub,key);
  if(sub==='risk'){
    var openR=list.filter(function(r){return r.status!=='closed';});
    var cellF=_pmState.raidCell||null;
    var grid='<div class="pm-heat"><div class="ax"></div>'+[1,2,3,4,5].map(function(i){return '<div class="ax">'+i+'</div>';}).join('');
    for(var p=5;p>=1;p--){grid+='<div class="ax">'+p+'</div>';for(var i=1;i<=5;i++){var n=openR.filter(function(r){var d=r.data||{};return Number(d.probability)===p&&Number(d.impact)===i;}).length;var s=p*i;var sel=cellF===p+'x'+i;
      grid+='<div style="background:color-mix(in srgb,'+_pmHeatColor(s)+' '+(n?45:16)+'%,transparent);color:'+(n?'#fff':_pmHeatColor(s))+';'+(sel?'outline:2px solid var(--t1)':'')+'" title="Probability '+p+' × impact '+i+' = '+s+'" onclick="_pmState.raidCell='+(sel?'null':'\''+p+'x'+i+'\'')+';pmRender()">'+(n||'')+'</div>';}}
    grid+='</div><div class="pm-muted" style="margin-top:6px;display:flex;justify-content:space-between"><span>↑ Probability</span><span>Impact →</span></div>';
    var shown=cellF?openR.filter(function(r){var d=r.data||{};return d.probability+'x'+d.impact===cellF;}):list;
    html+='<div class="pm-split"><div class="pm-card"><div class="pm-h">Risk matrix'+(cellF?' <button class="pm-chip" onclick="_pmState.raidCell=null;pmRender()">clear filter</button>':'')+'</div>'+grid+
      '<div class="pm-muted" style="margin-top:10px">Score = probability × impact. '+_pmPill('15–25 high','#dc2626')+' '+_pmPill('10–14','#ea580c')+' '+_pmPill('5–9','#ca8a04')+' '+_pmPill('1–4','#16a34a')+'</div></div>'+
      '<div class="pm-card pm-scroll" style="padding:0">'+_pmRaidTable('risk',shown.sort(function(a,b){return pmRiskScore(b)-pmRiskScore(a);}),all)+'</div></div>';
  } else html+='<div class="pm-card pm-scroll" style="padding:0">'+_pmRaidTable(sub,list,all)+'</div>';
  return html;
}
function _pmRaidTable(kind,list,all){
  if(!list.length)return '<div class="pm-empty"><b>No '+PM_RAID[kind].label.toLowerCase()+' yet</b>'+(all?'Pick a project to add one.':'Use “Add '+PM_RAID[kind].one+'”.')+'</div>';
  var cols={
    risk:['ID','Risk','Score','Owner','Response','Trigger','Status'],
    issue:['ID','Issue','Priority','Owner','Due','Status'],
    assumption:['ID','Assumption','Owner','Validate by','Status'],
    decision:['ID','Decision','Decided by','Date','Status'],
  }[kind];
  if(all)cols=cols.slice(0,2).concat(['Project']).concat(cols.slice(2));
  var today=_pmToday();
  return '<table class="pm-table"><thead><tr>'+cols.map(function(c){return '<th>'+c+'</th>';}).join('')+'</tr></thead><tbody>'+list.map(function(r){
    var d=r.data||{},closed=['closed','resolved','invalid','superseded'].indexOf(r.status)>=0;
    var cells={ID:'<span class="pm-muted pm-nw">'+_pmE(_pmRaidNo(r))+'</span>',Project:'<span class="pm-muted">'+_pmE(_pmProjName(r.projectKey))+'</span>',
      Risk:'<b style="display:inline-block;min-width:140px">'+_pmE(r.title)+'</b>'+(d.category?' <span class="pm-muted">· '+_pmE(d.category)+'</span>':''),
      Issue:'<b>'+_pmE(r.title)+'</b>'+(d.escalated?' '+_pmPill('escalated','#dc2626'):''),Assumption:'<b>'+_pmE(r.title)+'</b>',Decision:'<b>'+_pmE(r.title)+'</b>',
      Score:(function(){var s=pmRiskScore(r);return s?_pmPill(s+' ('+d.probability+'×'+d.impact+')',_pmHeatColor(s))+(d.trend?' '+({up:'↑',down:'↓',flat:'→'})[d.trend]:''):'—';})(),
      Owner:_pmE(pmPersonName(d.owner)||'—'),'Decided by':_pmE(pmPersonName(d.decidedBy)||'—'),Response:_pmE(d.response||'—'),
      Trigger:d.triggerDate?(d.triggerDate<today&&!closed?'<b style="color:#dc2626">'+_pmDate(d.triggerDate)+'</b>':_pmDate(d.triggerDate)):'—',
      Priority:_pmE(d.priority||'—'),Due:d.due?(d.due<today&&!closed?'<b style="color:#dc2626">'+_pmDate(d.due)+'</b>':_pmDate(d.due)):'—',
      'Validate by':d.validateBy?_pmDate(d.validateBy):'—',Date:d.date?_pmDate(d.date):'—',
      Status:_pmPill(r.status||'open',closed?'#94a3b8':'#0891b2')};
    return '<tr class="clk" style="'+(closed?'opacity:.6':'')+'" onclick="pmRaidDialog(\''+kind+'\','+r.id+')">'+cols.map(function(c){return '<td>'+(cells[c]||'')+'</td>';}).join('')+'</tr>';
  }).join('')+'</tbody></table>';
}
function pmRaidDialog(kind,id,key){
  var r=id?pmRec(id):null;var d=r?(r.data||{}):{};key=r?r.projectKey:key;
  if(!key||key==='all'){_pmToast('Pick a project first','warn');return;}
  var K=PM_RAID[kind];var f=function(lbl,html){return '<div class="pm-row"><label>'+lbl+'</label>'+html+'</div>';};
  var ta=function(idn,val,ph){return '<textarea class="inp" id="'+idn+'" rows="2" placeholder="'+_pmE(ph||'')+'">'+_pmE(val||'')+'</textarea>';};
  var inp=function(idn,val,type,ph){return '<input class="inp" id="'+idn+'" type="'+(type||'text')+'" value="'+_pmE(val||'')+'" placeholder="'+_pmE(ph||'')+'">';};
  var sel=function(idn,opts,val){return '<select class="inp" id="'+idn+'">'+opts.map(function(o){var v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return '<option value="'+_pmE(v)+'"'+(String(v)===String(val)?' selected':'')+'>'+_pmE(l)+'</option>';}).join('')+'</select>';};
  var scale=function(idn,val,words){return sel(idn,[1,2,3,4,5].map(function(n){return {v:n,l:n+' — '+words[n-1]};}),val||3);};
  var body='';
  body+=f(kind==='decision'?'Decision':'Title',inp('pmr-title',r&&r.title,'text',{risk:'What could go wrong',issue:'What has gone wrong',assumption:'What we are assuming',decision:'What was decided'}[kind]));
  if(kind==='risk'){
    body+=f('Category',sel('pmr-cat',['','Schedule','Cost','Scope','Quality','Resource','Technical','Security / compliance','Client','Vendor','Other'],d.category))+
      f('Probability',scale('pmr-p',d.probability,['rare','unlikely','possible','likely','almost certain']))+f('Impact',scale('pmr-i',d.impact,['minimal','minor','moderate','major','severe']))+
      f('Owner',pmPersonSelect('pmr-owner',d.owner||''))+f('Response',sel('pmr-resp',['Mitigate','Avoid','Transfer','Accept','Escalate'],d.response||'Mitigate'))+
      f('Mitigation',ta('pmr-mit',d.mitigation,'What we are doing to reduce it'))+f('Contingency',ta('pmr-cont',d.contingency,'What we do if it happens'))+
      f('Trigger / review date',inp('pmr-trig',d.triggerDate,'date'))+f('Trend',sel('pmr-trend',[{v:'',l:'—'},{v:'up',l:'↑ worsening'},{v:'flat',l:'→ steady'},{v:'down',l:'↓ improving'}],d.trend||''));
  } else if(kind==='issue'){
    body+=f('Description',ta('pmr-desc',d.description))+f('Priority',sel('pmr-pri',['Critical','High','Medium','Low'],d.priority||'Medium'))+f('Owner',pmPersonSelect('pmr-owner',d.owner||''))+
      f('Raised',inp('pmr-raised',d.raised||_pmToday(),'date'))+f('Due',inp('pmr-due',d.due,'date'))+f('Resolution',ta('pmr-res',d.resolution))+
      '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:4px 0 8px 148px"><input type="checkbox" id="pmr-esc" '+(d.escalated?'checked':'')+'> Escalated</label>';
  } else if(kind==='assumption'){
    body+=f('Detail',ta('pmr-desc',d.description))+f('Owner',pmPersonSelect('pmr-owner',d.owner||''))+f('Validate by',inp('pmr-val',d.validateBy,'date'))+f('If wrong',ta('pmr-imp',d.impact,'What happens if this is not true'));
  } else {
    body+=f('Rationale',ta('pmr-rat',d.rationale))+f('Alternatives',ta('pmr-alt',d.alternatives))+f('Decided by',pmPersonSelect('pmr-by',d.decidedBy||''))+f('Date',inp('pmr-date',d.date||_pmToday(),'date'))+f('Impact',ta('pmr-imp',d.impact));
  }
  body+=f('Status',sel('pmr-status',K.statuses,r?r.status:K.statuses[0]));
  pmModal('<h3>'+_pmIcon('alertTriangle',18)+' '+(r?_pmE(_pmRaidNo(r))+' '+K.one:'New '+K.one)+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+body+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\''+_pmJ(_pmRaidNo(r))+' deleted\')">Delete</button>':'')+
    (r&&kind==='risk'?'<button class="btn btn-s" onclick="pmRiskToIssue('+r.id+')">It happened → issue</button>':'')+
    '<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmr-save">Save</button></div>',true);
  var wire=function(){
    ['pmr-owner','pmr-by'].forEach(function(x){if(document.getElementById(x))pmWirePersonSelect(x);});
    document.getElementById('pmr-save').onclick=function(){
      var v=function(x){var el=document.getElementById(x);return el?(el.type==='checkbox'?el.checked:el.value):undefined;};
      var title=String(v('pmr-title')||'').trim();if(!title){_pmToast('Give it a title','warn');return;}
      var rec=r||pmNew(kind,key,{status:K.statuses[0],data:{}});
      var nd=Object.assign({},rec.data||{});
      if(!nd.no)nd.no=1+_pmRaidList(kind,key).reduce(function(m,x){return Math.max(m,Number((x.data||{}).no)||0);},0);
      var put=function(k,id){var x=v(id);if(x!==undefined)nd[k]=x==='__new'?nd[k]:x;};
      if(kind==='risk'){put('category','pmr-cat');nd.probability=Number(v('pmr-p'));nd.impact=Number(v('pmr-i'));put('owner','pmr-owner');put('response','pmr-resp');put('mitigation','pmr-mit');put('contingency','pmr-cont');put('triggerDate','pmr-trig');put('trend','pmr-trend');}
      if(kind==='issue'){put('description','pmr-desc');put('priority','pmr-pri');put('owner','pmr-owner');put('raised','pmr-raised');put('due','pmr-due');put('resolution','pmr-res');nd.escalated=!!v('pmr-esc');}
      if(kind==='assumption'){put('description','pmr-desc');put('owner','pmr-owner');put('validateBy','pmr-val');put('impact','pmr-imp');}
      if(kind==='decision'){put('rationale','pmr-rat');put('alternatives','pmr-alt');put('decidedBy','pmr-by');put('date','pmr-date');put('impact','pmr-imp');}
      rec.title=title;rec.status=v('pmr-status');rec.data=nd;
      pmCloseModal(true);pmPut(rec);pmRender();
    };
  };
  wire();document.getElementById('pm-modal')._handlers=wire;
}
function pmRiskToIssue(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{};
  var iss=pmNew('issue',r.projectKey,{title:r.title,status:'open',data:{description:'Raised from risk '+_pmRaidNo(r)+(d.contingency?'. Contingency: '+d.contingency:''),priority:pmRiskScore(r)>=15?'High':'Medium',owner:d.owner||'',raised:_pmToday(),fromRisk:r.id,no:1+_pmRaidList('issue',r.projectKey).reduce(function(m,x){return Math.max(m,Number((x.data||{}).no)||0);},0)}});
  r.status='closed';r.data=Object.assign({},d,{closedNote:'Became an issue'});
  pmPut(r);pmPut(iss);pmCloseModal(true);_state_raid('issue');_pmToast('Logged as an issue');
}
function _state_raid(s){_pmState.raidSub=s;_pmSaveState();pmRender();}
async function pmRaidExport(key){
  var sheets=Object.keys(PM_RAID).map(function(k){
    var list=_pmRaidList(k,key);
    var head={risk:['ID','Project','Risk','Category','Probability','Impact','Score','Owner','Response','Mitigation','Contingency','Trigger','Trend','Status'],
      issue:['ID','Project','Issue','Description','Priority','Owner','Raised','Due','Resolution','Escalated','Status'],
      assumption:['ID','Project','Assumption','Detail','Owner','Validate by','If wrong','Status'],
      decision:['ID','Project','Decision','Rationale','Alternatives','Decided by','Date','Impact','Status']}[k];
    var rows=list.map(function(r){var d=r.data||{};var P=_pmProjName(r.projectKey);
      return {risk:[_pmRaidNo(r),P,r.title,d.category,d.probability,d.impact,pmRiskScore(r),pmPersonName(d.owner),d.response,d.mitigation,d.contingency,d.triggerDate,d.trend,r.status],
        issue:[_pmRaidNo(r),P,r.title,d.description,d.priority,pmPersonName(d.owner),d.raised,d.due,d.resolution,d.escalated?'yes':'',r.status],
        assumption:[_pmRaidNo(r),P,r.title,d.description,pmPersonName(d.owner),d.validateBy,d.impact,r.status],
        decision:[_pmRaidNo(r),P,r.title,d.rationale,d.alternatives,pmPersonName(d.decidedBy),d.date,d.impact,r.status]}[k];});
    return {name:PM_RAID[k].label,rows:[head].concat(rows)};
  });
  await _pmXlsx('RAID log - '+(key==='all'?'all projects':_pmProjName(key))+'.xlsx',sheets);
}

// ═══ STAKEHOLDERS + COMMUNICATION PLAN (phase 2) ════════════════════════════
var PM_ATTITUDE=['Champion','Supporter','Neutral','Sceptic','Blocker'];
var PM_ENGAGE=['Unaware','Resistant','Neutral','Supportive','Leading'];
var PM_FREQ={weekly:7,biweekly:14,monthly:30,quarterly:91,adhoc:0};
function _pmQuadrant(inf,int){inf=Number(inf)||0;int=Number(int)||0;return inf>=3&&int>=3?'Manage closely':inf>=3?'Keep satisfied':int>=3?'Keep informed':'Monitor';}
function pmTab_stakeholders(key){
  var list=pmRecs('stakeholder',key);var plans=pmRecs('commplan',key);var today=_pmToday();
  var W=340,H=300,pad=30;
  var dots=list.map(function(r){var d=r.data||{};var x=pad+((Number(d.interest)||1)-1)/4*(W-2*pad),y=H-pad-((Number(d.influence)||1)-1)/4*(H-2*pad);
    var c={Champion:'#16a34a',Supporter:'#22c55e',Neutral:'#64748b',Sceptic:'#d97706',Blocker:'#dc2626'}[d.attitude]||'#0891b2';
    return '<g style="cursor:pointer" onclick="pmStakeholderDialog(\''+_pmJ(key)+'\','+r.id+')"><circle cx="'+x+'" cy="'+y+'" r="7" fill="'+c+'"><title>'+_pmE(pmPersonName(d.personKey))+' — '+_pmE(_pmQuadrant(d.influence,d.interest))+'</title></circle><text x="'+(x+10)+'" y="'+(y+4)+'" font-size="10.5" fill="var(--t2)">'+_pmE(String(pmPersonName(d.personKey)).split(' ')[0])+'</text></g>';}).join('');
  var grid='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:420px;height:auto"><rect x="'+pad+'" y="'+pad+'" width="'+(W-2*pad)+'" height="'+(H-2*pad)+'" fill="none" stroke="var(--bd2)"/>'+
    '<line x1="'+(W/2)+'" y1="'+pad+'" x2="'+(W/2)+'" y2="'+(H-pad)+'" stroke="var(--bd2)" stroke-dasharray="3 3"/><line x1="'+pad+'" y1="'+(H/2)+'" x2="'+(W-pad)+'" y2="'+(H/2)+'" stroke="var(--bd2)" stroke-dasharray="3 3"/>'+
    '<text x="'+(pad+4)+'" y="'+(pad+12)+'" font-size="10" fill="var(--t3)">Keep satisfied</text><text x="'+(W-pad-4)+'" y="'+(pad+12)+'" font-size="10" fill="var(--t3)" text-anchor="end">Manage closely</text>'+
    '<text x="'+(pad+4)+'" y="'+(H-pad-4)+'" font-size="10" fill="var(--t3)">Monitor</text><text x="'+(W-pad-4)+'" y="'+(H-pad-4)+'" font-size="10" fill="var(--t3)" text-anchor="end">Keep informed</text>'+
    '<text x="'+(W/2)+'" y="'+(H-8)+'" font-size="10.5" fill="var(--t2)" text-anchor="middle">Interest →</text><text x="12" y="'+(H/2)+'" font-size="10.5" fill="var(--t2)" text-anchor="middle" transform="rotate(-90 12 '+(H/2)+')">Influence →</text>'+dots+'</svg>';
  var html='<div class="pm-bar"><button class="btn btn-p" onclick="pmStakeholderDialog(\''+_pmJ(key)+'\')">'+_pmIcon('plus',14,'#fff')+' Add stakeholder</button><button class="btn btn-s" onclick="pmCommPlanDialog(\''+_pmJ(key)+'\')">＋ Communication</button><span class="sp"></span><button class="btn btn-s" onclick="pmStakeExport(\''+_pmJ(key)+'\')">Excel</button></div>';
  html+='<div class="pm-split wide"><div class="pm-card"><div class="pm-h">Influence / interest</div>'+(list.length?grid:'<div class="pm-muted">Add stakeholders to see them on the grid.</div>')+'</div>'+
    '<div class="pm-card pm-scroll" style="padding:0">'+(list.length?'<table class="pm-table"><thead><tr><th>Stakeholder</th><th>Role</th><th>Strategy</th><th>Attitude</th><th>Engagement</th><th>Needs</th></tr></thead><tbody>'+list.map(function(r){var d=r.data||{};var p=pmPerson(d.personKey);
      return '<tr class="clk" onclick="pmStakeholderDialog(\''+_pmJ(key)+'\','+r.id+')"><td><b>'+_pmE(p?p.name:'?')+'</b>'+(p&&p.org?'<div class="pm-muted">'+_pmE(p.org)+'</div>':'')+'</td><td>'+_pmE(d.role||'—')+'</td><td>'+_pmE(_pmQuadrant(d.influence,d.interest))+'</td><td>'+_pmE(d.attitude||'—')+'</td><td class="pm-muted">'+_pmE((d.engageNow||'?')+' → '+(d.engageWant||'?'))+'</td><td class="pm-muted" style="max-width:220px">'+_pmE(d.needs||'')+'</td></tr>';}).join('')+'</tbody></table>':'<div class="pm-empty"><b>No stakeholders yet</b>Add the people who care about this project — sponsors, client contacts, approvers.</div>')+'</div></div>';
  html+='<div class="pm-card pm-scroll" style="margin-top:12px;padding:0"><div class="pm-h" style="padding:12px 14px 0">'+_pmIcon('mail',15)+' Communication plan</div>'+(plans.length?'<table class="pm-table"><thead><tr><th>What</th><th>Audience</th><th>Channel</th><th>How often</th><th>Owner</th><th>Last sent</th><th>Next due</th><th></th></tr></thead><tbody>'+plans.map(function(r){var d=r.data||{};var next=_pmCommNext(r);var late=next&&next<=today;
      return '<tr><td class="clk" onclick="pmCommPlanDialog(\''+_pmJ(key)+'\','+r.id+')"><b>'+_pmE(r.title)+'</b></td><td>'+_pmE((d.audience||[]).map(pmPersonName).concat(d.audienceText?[d.audienceText]:[]).join(', ')||'—')+'</td><td>'+_pmE(d.channel||'')+'</td><td>'+_pmE(({weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly',quarterly:'Quarterly',adhoc:'As needed'})[d.frequency]||'')+'</td><td>'+_pmE(pmPersonName(d.owner)||'You')+'</td><td class="pm-muted">'+(d.lastSent?_pmDate(d.lastSent):'never')+'</td><td>'+(next?(late?'<b style="color:#d97706">'+_pmDate(next)+'</b>':_pmDate(next)):'—')+'</td>'+
        '<td style="white-space:nowrap"><button class="btn btn-s" style="height:24px;font-size:11px" onclick="pmGo(null,\'reports\');setTimeout(function(){pmReportNew(\''+_pmJ(key)+'\','+r.id+')},50)">Draft report</button> <button class="btn btn-s" style="height:24px;font-size:11px" onclick="pmCommMarkSent('+r.id+')">Mark sent</button></td></tr>';}).join('')+'</tbody></table>':'<div class="pm-empty" style="padding:16px">Plan who hears what and when — e.g. a weekly status email to the client, a monthly steering update.</div>')+'</div>';
  return html;
}
function _pmCommNext(r){var d=r.data||{};var n=PM_FREQ[d.frequency];if(!n)return d.nextDue||null;var base=d.lastSent||d.startDate||_pmToday();return d.lastSent?_pmAddDays(base,n):base;}
function pmCommMarkSent(id){var r=pmRec(id);if(!r)return;r.data=Object.assign({},r.data,{lastSent:_pmToday()});pmPut(r);pmRender();_pmToast('Marked sent');}
function pmStakeholderDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  var s=function(idn,arr,val){return '<select class="inp" id="'+idn+'">'+arr.map(function(o){return '<option'+(o===val?' selected':'')+'>'+_pmE(o)+'</option>';}).join('')+'</select>';};
  var n5=function(idn,val,lo,hi){return '<select class="inp" id="'+idn+'">'+[1,2,3,4,5].map(function(n){return '<option value="'+n+'"'+(Number(val||3)===n?' selected':'')+'>'+n+(n===1?' — '+lo:n===5?' — '+hi:'')+'</option>';}).join('')+'</select>';};
  pmModal('<h3>'+_pmIcon('user',18)+' '+(r?'Stakeholder':'Add stakeholder')+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Person</label>'+pmPersonSelect('pms-person',d.personKey||'')+'</div>'+
    '<div class="pm-row"><label>Role on project</label><input class="inp" id="pms-role" value="'+_pmE(d.role||'')+'" placeholder="Sponsor, client lead, approver…"></div>'+
    '<div class="pm-row"><label>Influence</label>'+n5('pms-inf',d.influence,'little say','can stop it')+'</div>'+
    '<div class="pm-row"><label>Interest</label>'+n5('pms-int',d.interest,'barely affected','very affected')+'</div>'+
    '<div class="pm-row"><label>Attitude</label>'+s('pms-att',PM_ATTITUDE,d.attitude||'Neutral')+'</div>'+
    '<div class="pm-row"><label>Engagement now</label>'+s('pms-en',PM_ENGAGE,d.engageNow||'Neutral')+'</div>'+
    '<div class="pm-row"><label>Engagement wanted</label>'+s('pms-ew',PM_ENGAGE,d.engageWant||'Supportive')+'</div>'+
    '<div class="pm-row" style="align-items:start"><label>What they need</label><textarea class="inp" id="pms-needs" rows="2" placeholder="Expectations, concerns, how they like updates">'+_pmE(d.needs||'')+'</textarea></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Stakeholder removed\')">Remove</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pms-save">Save</button></div>');
  var wire=function(){pmWirePersonSelect('pms-person');document.getElementById('pms-save').onclick=function(){
    var v=function(x){return document.getElementById(x).value;};var pk=v('pms-person');if(!pk||pk==='__new'){_pmToast('Choose a person','warn');return;}
    var rec=r||pmNew('stakeholder',key,{data:{}});rec.title=pmPersonName(pk);
    rec.data=Object.assign({},rec.data,{personKey:pk,role:v('pms-role'),influence:Number(v('pms-inf')),interest:Number(v('pms-int')),attitude:v('pms-att'),engageNow:v('pms-en'),engageWant:v('pms-ew'),needs:v('pms-needs')});
    pmCloseModal(true);pmPut(rec);pmRender();};};
  wire();document.getElementById('pm-modal')._handlers=wire;
}
function pmCommPlanDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  var stake=pmRecs('stakeholder',key).map(function(s){return (s.data||{}).personKey;}).filter(Boolean);
  var ppl=pmPeopleAll().filter(function(p){return stake.indexOf(p.key)>=0||(d.audience||[]).indexOf(p.key)>=0;});
  if(!ppl.length)ppl=pmPeopleAll();
  pmModal('<h3>'+_pmIcon('mail',18)+' '+(r?'Communication':'Plan a communication')+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>What</label><input class="inp" id="pmc-title" value="'+_pmE(r?r.title:'Weekly status report')+'"></div>'+
    '<div class="pm-row" style="align-items:start"><label>Audience</label><div style="max-height:150px;overflow:auto;border:1px solid var(--bd2);border-radius:6px;padding:6px">'+ppl.map(function(p){return '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;padding:2px 0"><input type="checkbox" class="pmc-aud" value="'+_pmE(p.key)+'" '+((d.audience||[]).indexOf(p.key)>=0?'checked':'')+'> '+_pmE(p.name)+(p.email?' <span class="pm-muted">'+_pmE(p.email)+'</span>':'')+'</label>';}).join('')+'</div></div>'+
    '<div class="pm-row"><label>Also (free text)</label><input class="inp" id="pmc-audt" value="'+_pmE(d.audienceText||'')+'" placeholder="e.g. Steering committee"></div>'+
    '<div class="pm-row"><label>Channel</label><select class="inp" id="pmc-ch">'+['Email','Meeting','Call','Report','Dashboard','Slack / Teams'].map(function(o){return '<option'+(o===d.channel?' selected':'')+'>'+o+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>How often</label><select class="inp" id="pmc-fr">'+Object.keys(PM_FREQ).map(function(k){return '<option value="'+k+'"'+(k===(d.frequency||'weekly')?' selected':'')+'>'+({weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly',quarterly:'Quarterly',adhoc:'As needed'})[k]+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>First / next due</label><input class="inp" type="date" id="pmc-start" value="'+_pmE(d.startDate||_pmToday())+'"></div>'+
    '<div class="pm-row"><label>Owner</label>'+pmPersonSelect('pmc-owner',d.owner||'',{blankLabel:'Me'})+'</div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Communication removed\')">Remove</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmc-save">Save</button></div>');
  var wire=function(){pmWirePersonSelect('pmc-owner');document.getElementById('pmc-save').onclick=function(){
    var v=function(x){return document.getElementById(x).value;};var t=v('pmc-title').trim();if(!t)return;
    var rec=r||pmNew('commplan',key,{data:{}});rec.title=t;
    rec.data=Object.assign({},rec.data,{audience:Array.prototype.map.call(document.querySelectorAll('.pmc-aud:checked'),function(x){return x.value;}),audienceText:v('pmc-audt'),channel:v('pmc-ch'),frequency:v('pmc-fr'),startDate:v('pmc-start'),owner:v('pmc-owner')==='__new'?'':v('pmc-owner')});
    pmCloseModal(true);pmPut(rec);pmRender();};};
  wire();document.getElementById('pm-modal')._handlers=wire;
}
async function pmStakeExport(key){
  var st=pmRecs('stakeholder',key).map(function(r){var d=r.data||{};var p=pmPerson(d.personKey)||{};return [p.name,p.email,p.org,d.role,d.influence,d.interest,_pmQuadrant(d.influence,d.interest),d.attitude,d.engageNow,d.engageWant,d.needs];});
  var cp=pmRecs('commplan',key).map(function(r){var d=r.data||{};return [r.title,(d.audience||[]).map(pmPersonName).concat(d.audienceText?[d.audienceText]:[]).join('; '),d.channel,d.frequency,pmPersonName(d.owner)||'Me',d.lastSent||'',_pmCommNext(r)||''];});
  await _pmXlsx('Stakeholders - '+_pmProjName(key)+'.xlsx',[{name:'Register',rows:[['Name','Email','Organisation','Role','Influence','Interest','Strategy','Attitude','Engagement now','Engagement wanted','Needs']].concat(st)},{name:'Communication plan',rows:[['What','Audience','Channel','Frequency','Owner','Last sent','Next due']].concat(cp)}]);
}

// ═══ STATUS REPORTS (phase 2) ═══════════════════════════════════════════════
// kind 'report': title = headline, data = {rag, periodDays, summary,
// accomplishments[], next[], risks[], asks[], metrics{}, audience[], sentTo[],
// commPlanId, sentAt}.
function pmTab_reports(key){
  var list=pmRecs('report',key).slice().sort(function(a,b){return String(b.createdAt||b.updatedAt).localeCompare(String(a.createdAt||a.updatedAt));});
  var html='<div class="pm-bar"><button class="btn btn-p" onclick="pmReportNew(\''+_pmJ(key)+'\')">'+_pmIcon('sparkles',14,'#fff')+' New status report</button><span class="pm-muted">Drafted by AI from this project’s live data — you edit, then email it, print it or turn it into a slide deck.</span></div>';
  if(!list.length)return html+'<div class="pm-card pm-empty"><b>No reports yet</b>Press “New status report”.</div>';
  html+='<div class="pm-card pm-scroll" style="padding:0"><table class="pm-table"><thead><tr><th>Date</th><th>Status</th><th>Headline</th><th>Sent to</th><th></th></tr></thead><tbody>'+list.map(function(r){var d=r.data||{};
    return '<tr><td class="pm-muted">'+_pmDate(String(r.createdAt||r.updatedAt).slice(0,10))+'</td><td>'+_pmRagPill(d.rag)+'</td><td class="clk" onclick="pmReportEdit('+r.id+')"><b>'+_pmE(r.title||'Status report')+'</b></td><td class="pm-muted">'+_pmE((d.sentTo||[]).join(', ')||'—')+'</td>'+
      '<td style="white-space:nowrap"><button class="btn btn-s" style="height:26px" onclick="pmReportEmail('+r.id+')">Email</button> <button class="btn btn-s" style="height:26px" onclick="pmReportPrint('+r.id+')">PDF</button> <button class="btn btn-s" style="height:26px" onclick="pmReportDeck('+r.id+')">Slides</button> <button class="btn btn-s" style="height:26px" onclick="pmDel(pmRec('+r.id+'),\'Report deleted\')">×</button></td></tr>';}).join('')+'</tbody></table></div>';
  return html;
}
/** Everything the report (and its AI draft) is built from. */
function pmReportContext(key,days){
  days=days||7;var today=_pmToday(),since=_pmAddDays(today,-days),ahead=_pmAddDays(today,14);
  var items=pmItems(key),pr=pmProgress(key),ev=pmEvm(key);
  var doneIn=items.filter(function(i){var c=i.src&&(i.src.completedAt||i.src.completed_at);return i.done&&c&&String(c).slice(0,10)>=since;});
  var upcoming=items.filter(function(i){return !i.done&&i.due&&i.due>=today&&i.due<=ahead;}).sort(function(a,b){return a.due.localeCompare(b.due);});
  var overdue=items.filter(function(i){return !i.done&&i.due&&i.due<today;});
  var ms=pmMilestones(key);
  var risks=pmRecs('risk',key).filter(function(r){return r.status!=='closed';}).sort(function(a,b){return pmRiskScore(b)-pmRiskScore(a);}).slice(0,6);
  var issues=pmRecs('issue',key).filter(function(r){return ['resolved','closed'].indexOf(r.status)<0;}).slice(0,6);
  var decisions=pmRecs('decision',key).filter(function(r){var dt=(r.data||{}).date;return dt&&dt>=since;});
  var dl=pmDelegations(key).filter(_pmDlgOpen);
  var changes=pmRecs('change',key).filter(function(r){return r.status==='proposed'||((r.data||{}).decidedAt||'')>=since;});
  return {key:key,name:_pmProjName(key),days:days,since:since,today:today,pr:pr,ev:ev,doneIn:doneIn,upcoming:upcoming,overdue:overdue,
    milestones:{done:ms.filter(function(m){return m.done;}),next:ms.filter(function(m){return !m.done;}).slice(0,5)},risks:risks,issues:issues,decisions:decisions,
    late:dl.filter(function(r){return _pmDlgLate(r,today);}),blocked:dl.filter(function(r){return r.status==='blocked'||r.status==='at_risk';}),changes:changes,rag:pmRag(key).computed};
}
function _pmReportFacts(c){
  var L=[];
  L.push('PROJECT: '+c.name+' · period '+c.since+' to '+c.today+' · computed status '+c.rag);
  L.push('PROGRESS: '+c.pr.pct+'% ('+c.pr.done+'/'+c.pr.total+' items), '+c.pr.overdue+' overdue');
  if(c.ev&&c.ev.bac)L.push('BUDGET: BAC '+_pmMoney(c.ev.bac)+', actual cost '+_pmMoney(c.ev.ac)+', earned value '+_pmMoney(c.ev.ev)+(c.ev.cpi?', CPI '+c.ev.cpi.toFixed(2):'')+(c.ev.spi?', SPI '+c.ev.spi.toFixed(2):'')+(c.ev.eac?', forecast at completion '+_pmMoney(c.ev.eac):''));
  if(c.doneIn.length)L.push('COMPLETED THIS PERIOD: '+c.doneIn.slice(0,15).map(function(i){return i.title;}).join('; '));
  if(c.milestones.done.length)L.push('MILESTONES DONE: '+c.milestones.done.slice(-5).map(function(m){return m.name;}).join('; '));
  if(c.upcoming.length)L.push('DUE IN NEXT 14 DAYS: '+c.upcoming.slice(0,12).map(function(i){return i.title+' ('+i.due+')';}).join('; '));
  if(c.milestones.next.length)L.push('NEXT MILESTONES: '+c.milestones.next.map(function(m){return m.name+(m.date?' ('+m.date+')':'');}).join('; '));
  if(c.overdue.length)L.push('OVERDUE: '+c.overdue.slice(0,10).map(function(i){return i.title+' (was due '+i.due+')';}).join('; '));
  if(c.risks.length)L.push('TOP RISKS: '+c.risks.map(function(r){var d=r.data||{};return r.title+' [score '+pmRiskScore(r)+(d.mitigation?', mitigation: '+String(d.mitigation).slice(0,80):'')+']';}).join('; '));
  if(c.issues.length)L.push('OPEN ISSUES: '+c.issues.map(function(r){return r.title+((r.data||{}).priority?' ['+r.data.priority+']':'');}).join('; '));
  if(c.decisions.length)L.push('DECISIONS: '+c.decisions.map(function(r){return r.title;}).join('; '));
  if(c.late.length)L.push('LATE DELEGATED WORK: '+c.late.map(function(r){return _pmDlgRefLabel(r)+' with '+pmPersonName((r.data||{}).personKey)+' (expected '+(r.data||{}).expectedBy+')';}).join('; '));
  if(c.blocked.length)L.push('BLOCKED/AT RISK DELEGATED: '+c.blocked.map(function(r){return _pmDlgRefLabel(r)+' with '+pmPersonName((r.data||{}).personKey);}).join('; '));
  if(c.changes.length)L.push('CHANGE REQUESTS: '+c.changes.map(function(r){var d=r.data||{};return r.title+' ['+r.status+(d.costImpact?', '+_pmMoney(d.costImpact):'')+(d.scheduleDays?', '+d.scheduleDays+' days':'')+']';}).join('; '));
  return L.join('\n');
}
function pmReportNew(key,commPlanId){pmReportEdit(null,key,commPlanId);}
function pmReportEdit(id,key,commPlanId){
  var r=id?pmRec(id):null;var d=r?(r.data||{}):{};key=r?r.projectKey:key;
  if(!r){var c=pmReportContext(key,7);d={rag:c.rag,periodDays:7,accomplishments:c.doneIn.slice(0,8).map(function(i){return i.title;}),next:c.upcoming.slice(0,6).map(function(i){return i.title+' — '+_pmDate(i.due);}),
    risks:c.risks.slice(0,4).map(function(x){return x.title;}).concat(c.issues.slice(0,3).map(function(x){return 'Issue: '+x.title;})),asks:[],commPlanId:commPlanId||null};
    if(commPlanId){var cp=pmRec(commPlanId);if(cp&&cp.data)d.audience=(cp.data.audience||[]).slice();}}
  var lines=function(a){return _pmE((a||[]).join('\n'));};
  pmModal('<h3>'+_pmIcon('mail',18)+' Status report — '+_pmE(_pmProjName(key))+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-bar"><span class="pm-muted">Period</span><select class="inp" id="pmrep-days" style="width:auto">'+[7,14,30].map(function(n){return '<option value="'+n+'"'+((d.periodDays||7)===n?' selected':'')+'>Last '+n+' days</option>';}).join('')+'</select>'+
      '<button class="btn btn-s" id="pmrep-ai">'+_pmIcon('sparkles',14)+' Draft with AI</button><span class="pm-muted" id="pmrep-ai-out"></span></div>'+
    '<div class="pm-row"><label>Overall status</label><select class="inp" id="pmrep-rag">'+['green','amber','red'].map(function(x){return '<option value="'+x+'"'+(d.rag===x?' selected':'')+'>'+x[0].toUpperCase()+x.slice(1)+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Headline</label><input class="inp" id="pmrep-title" value="'+_pmE(r?r.title:'')+'" placeholder="One line: where things stand"></div>'+
    '<div class="pm-row" style="align-items:start"><label>Summary</label><textarea class="inp" id="pmrep-sum" rows="3">'+_pmE(d.summary||'')+'</textarea></div>'+
    '<div class="pm-row" style="align-items:start"><label>Accomplished<br><span class="pm-muted">one per line</span></label><textarea class="inp" id="pmrep-acc" rows="4">'+lines(d.accomplishments)+'</textarea></div>'+
    '<div class="pm-row" style="align-items:start"><label>Next</label><textarea class="inp" id="pmrep-next" rows="4">'+lines(d.next)+'</textarea></div>'+
    '<div class="pm-row" style="align-items:start"><label>Risks & issues</label><textarea class="inp" id="pmrep-risk" rows="3">'+lines(d.risks)+'</textarea></div>'+
    '<div class="pm-row" style="align-items:start"><label>Decisions / help needed</label><textarea class="inp" id="pmrep-asks" rows="2">'+lines(d.asks)+'</textarea></div>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-s" id="pmrep-save">Save</button><button class="btn btn-p" id="pmrep-saveemail">Save &amp; email…</button></div>',true);
  var collect=function(){
    var v=function(x){return document.getElementById(x).value;};var ls=function(x){return v(x).split('\n').map(function(s){return s.trim();}).filter(Boolean);};
    var rec=r||pmNew('report',key,{data:{}});
    var c=pmReportContext(key,Number(v('pmrep-days')));
    rec.title=v('pmrep-title').trim()||'Status report';
    rec.data=Object.assign({},rec.data||{},{rag:v('pmrep-rag'),periodDays:Number(v('pmrep-days')),summary:v('pmrep-sum'),accomplishments:ls('pmrep-acc'),next:ls('pmrep-next'),risks:ls('pmrep-risk'),asks:ls('pmrep-asks'),
      metrics:{pct:c.pr.pct,done:c.pr.done,total:c.pr.total,overdue:c.pr.overdue,cpi:c.ev&&c.ev.cpi,spi:c.ev&&c.ev.spi,bac:c.ev&&c.ev.bac,lateDelegations:c.late.length},audience:d.audience||[],commPlanId:d.commPlanId||null,date:_pmToday()});
    return rec;
  };
  document.getElementById('pmrep-save').onclick=function(){var rec=collect();pmCloseModal(true);pmPut(rec).then(function(){pmRender();});};
  document.getElementById('pmrep-saveemail').onclick=async function(){var rec=collect();pmCloseModal(true);await pmPut(rec);pmRender();pmReportEmail(rec.id);};
  document.getElementById('pmrep-ai').onclick=async function(){
    var out=document.getElementById('pmrep-ai-out');out.textContent='Writing…';this.disabled=true;
    try{
      var c=pmReportContext(key,Number(document.getElementById('pmrep-days').value));
      var sys='You are a senior program manager writing a concise project status report for executives and clients. Use ONLY the FACTS. Be specific (names, dates, numbers), plain business English, no hype. '+
        'Return ONLY JSON: {"rag":"green|amber|red","headline":"≤14 words","summary":"2-3 sentences","accomplishments":["≤8 items"],"next":["≤6 items, with dates where known"],"risks":["≤5 risks/issues, each with what is being done"],"asks":["decisions or help needed from the reader, ≤3, may be empty"]}. '+
        'Pick rag from the facts: red if major milestones are slipping, budget is badly over, or critical issues are unresolved; amber for manageable slippage or open high risks; else green.';
      var res=await _trpc('ai.assist',{systemPrompt:sys.slice(0,3900),userContent:_pmReportFacts(c).slice(0,7800),provider:(typeof _getAIConfig==='function'?_getAIConfig().provider:undefined)},'mutation');
      var raw=String(res&&(res.result||res.text)||'');var m=raw.match(/\{[\s\S]*\}/);if(!m)throw new Error('the AI reply was not usable');
      var o=JSON.parse(m[0]);
      var set=function(id,val){var el=document.getElementById(id);if(el&&val!=null)el.value=Array.isArray(val)?val.join('\n'):val;};
      if(['green','amber','red'].indexOf(o.rag)>=0)set('pmrep-rag',o.rag);
      set('pmrep-title',o.headline);set('pmrep-sum',o.summary);set('pmrep-acc',o.accomplishments);set('pmrep-next',o.next);set('pmrep-risk',o.risks);set('pmrep-asks',o.asks);
      out.textContent='Drafted — edit anything before sending.';
    }catch(e){out.textContent='AI draft failed: '+String(e&&e.message||e).slice(0,120);}
    finally{this.disabled=false;}
  };
}
function pmReportHtml(r,forEmail){
  var d=r.data||{},m=d.metrics||{};var c={green:'#16a34a',amber:'#d97706',red:'#dc2626'}[d.rag]||'#64748b';
  var sec=function(t,a){return a&&a.length?'<h2 style="font-size:14px;margin:18px 0 6px;color:#0f172a;border-bottom:2px solid #0891b2;padding-bottom:3px">'+t+'</h2><ul style="margin:0;padding-left:20px">'+a.map(function(x){return '<li style="margin:3px 0">'+_pmE(x)+'</li>';}).join('')+'</ul>':'';};
  var met=[m.total!=null?['Complete',m.pct+'%']:null,m.overdue!=null?['Overdue items',m.overdue]:null,m.cpi?['CPI',Number(m.cpi).toFixed(2)]:null,m.spi?['SPI',Number(m.spi).toFixed(2)]:null,m.lateDelegations?['Late delegated',m.lateDelegations]:null].filter(Boolean);
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:680px;font-size:14px;line-height:1.5">'+
    '<div style="font-size:12px;color:#64748b">'+_pmE(_pmProjName(r.projectKey))+' · status report · '+_pmE(_pmDate(d.date||String(r.createdAt||'').slice(0,10)))+'</div>'+
    '<div style="display:flex;align-items:center;gap:10px;margin:6px 0 10px"><span style="background:'+c+';color:#fff;border-radius:12px;padding:2px 12px;font-weight:700;font-size:12px">'+_pmE((d.rag||'').toUpperCase())+'</span><b style="font-size:18px">'+_pmE(r.title||'')+'</b></div>'+
    (d.summary?'<p style="margin:0 0 10px">'+_pmE(d.summary)+'</p>':'')+
    (met.length?'<table style="border-collapse:collapse;margin:6px 0"><tr>'+met.map(function(x){return '<td style="padding:6px 14px 6px 0"><div style="font-size:18px;font-weight:700">'+_pmE(x[1])+'</div><div style="font-size:11px;color:#64748b">'+_pmE(x[0])+'</div></td>';}).join('')+'</tr></table>':'')+
    sec('Accomplished',d.accomplishments)+sec('Next',d.next)+sec('Risks & issues',d.risks)+sec('Decisions / help needed',d.asks)+
    (forEmail?'<p style="font-size:11px;color:#94a3b8;margin-top:18px">Sent with LevelUp.</p>':'')+'</div>';
}
function pmReportPrint(id){var r=pmRec(id);if(!r)return;_pmPrint('Status report — '+_pmProjName(r.projectKey),pmReportHtml(r,false));}
function pmReportEmail(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{};
  var stake=pmRecs('stakeholder',r.projectKey).map(function(s){return (s.data||{}).personKey;});
  var ppl=pmPeopleAll().filter(function(p){return p.email&&(stake.indexOf(p.key)>=0||(d.audience||[]).indexOf(p.key)>=0);});
  if(!ppl.length)ppl=pmPeopleAll().filter(function(p){return p.email;}).slice(0,40);
  pmModal('<h3>'+_pmIcon('mail',18)+' Email this report<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Subject</label><input class="inp" id="pmre-subj" value="'+_pmE(_pmProjName(r.projectKey)+' — status '+_pmDate(_pmToday())+': '+(r.title||''))+'"></div>'+
    '<div class="pm-row" style="align-items:start"><label>To</label><div style="max-height:180px;overflow:auto;border:1px solid var(--bd2);border-radius:6px;padding:6px">'+(ppl.length?ppl.map(function(p){return '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;padding:2px 0"><input type="checkbox" class="pmre-to" value="'+_pmE(p.email)+'" '+((d.audience||[]).indexOf(p.key)>=0?'checked':'')+'> '+_pmE(p.name)+' <span class="pm-muted">'+_pmE(p.email)+'</span></label>';}).join(''):'<span class="pm-muted">No people with email addresses yet.</span>')+'</div></div>'+
    '<div class="pm-row"><label>Other addresses</label><input class="inp" id="pmre-more" placeholder="comma-separated"></div>'+
    '<div class="pm-row"><label></label><label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><input type="checkbox" id="pmre-me" checked> Send me a copy</label></div>'+
    '<div class="pm-card" style="max-height:30vh;overflow:auto;background:#fff">'+pmReportHtml(r,false)+'</div>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmre-send">Send</button></div>',true);
  document.getElementById('pmre-send').onclick=async function(){
    var to=Array.prototype.map.call(document.querySelectorAll('.pmre-to:checked'),function(x){return x.value;});
    document.getElementById('pmre-more').value.split(/[,;\s]+/).map(function(s){return s.trim();}).filter(function(s){return /@/.test(s);}).forEach(function(s){to.push(s);});
    if(document.getElementById('pmre-me').checked&&D.creds&&D.creds.email)to.push(D.creds.email);
    to=to.filter(function(x,i){return to.indexOf(x)===i;});
    if(!to.length){_pmToast('Pick at least one recipient','warn');return;}
    if(!confirm('Send this report to '+to.length+' address'+(to.length===1?'':'es')+'?\n\n'+to.join('\n')))return;
    var b=this;b.disabled=true;b.textContent='Sending…';
    try{
      var res=await _trpc('pm.emailReport',{to:to,subject:document.getElementById('pmre-subj').value,html:pmReportHtml(r,true)},'mutation');
      r.data=Object.assign({},r.data,{sentTo:(r.data.sentTo||[]).concat(to.filter(function(x){return (r.data.sentTo||[]).indexOf(x)<0;})),sentAt:new Date().toISOString()});pmPut(r);
      if(r.data.commPlanId)pmCommMarkSent(r.data.commPlanId);
      pmCloseModal(true);_pmToast('✉️ Sent to '+res.sent+(res.failed&&res.failed.length?' · failed: '+res.failed.join(', '):''));pmRender();
    }catch(e){b.disabled=false;b.textContent='Send';_pmToast('Not sent: '+(e&&e.message||e),'error');}
  };
}
/** Build a Slides deck (the Notes → Slides module) from a report. */
function pmReportDeck(id){
  var r=pmRec(id);if(!r)return;var d=r.data||{},m=d.metrics||{};
  try{
    if(typeof ensureDecks==='function')ensureDecks();
    var rc={green:'#16a34a',amber:'#d97706',red:'#dc2626'}[d.rag]||'#0891b2';
    var T=function(x,y,w,h,text,fs,extra){return Object.assign({type:'text',x:x,y:y,w:w,h:h,text:text,fontSize:fs||18,bold:false,italic:false,align:'left',color:'#0f172a'},extra||{});};
    var slides=[
      {bg:'#0f172a',elements:[T(8,30,84,14,_pmProjName(r.projectKey),40,{bold:true,color:'#ffffff'}),T(8,46,84,8,'Status report · '+_pmDate(d.date||_pmToday()),20,{color:'#cbd5e1'}),
        {type:'shape',shape:'rect',x:8,y:60,w:16,h:7,fill:rc,radius:12},T(8,60,16,7,String(d.rag||'').toUpperCase(),18,{bold:true,color:'#ffffff',align:'center'})]},
      {bg:'#ffffff',elements:[T(6,6,88,10,r.title||'Where we are',28,{bold:true}),T(6,18,88,24,d.summary||'',18,{color:'#334155'})].concat(
        [m.total!=null?{v:m.pct+'%',l:'Complete'}:null,m.overdue!=null?{v:String(m.overdue),l:'Overdue items'}:null,m.cpi?{v:Number(m.cpi).toFixed(2),l:'CPI'}:null,m.spi?{v:Number(m.spi).toFixed(2),l:'SPI'}:null].filter(Boolean).slice(0,4).map(function(x,i){return {type:'metric',x:6+i*22,y:52,w:20,h:24,value:x.v,label:x.l,color:'#0891b2',size:36};}))},
    ];
    var bl=function(title,items,color){if(!items||!items.length)return;slides.push({bg:'#ffffff',elements:[T(6,6,88,10,title,28,{bold:true}),{type:'bullets',x:6,y:20,w:88,h:72,title:'',items:items.slice(0,9),color:color||'#0891b2'}]});};
    bl('Accomplished',d.accomplishments,'#16a34a');bl('Next',d.next,'#2563eb');
    if(d.risks&&d.risks.length)slides.push({bg:'#ffffff',elements:[T(6,6,88,10,'Risks & issues',28,{bold:true}),{type:'table',x:6,y:20,w:88,h:70,header:true,rows:[['#','Risk / issue']].concat(d.risks.slice(0,8).map(function(x,i){return [String(i+1),x];}))}]});
    bl('Decisions / help needed',d.asks,'#7c3aed');
    var deck={title:_pmProjName(r.projectKey)+' — status '+_pmDate(d.date||_pmToday()),icon:'📊',color:'#0891b2',slides:slides};
    if(typeof _dkStampIds==='function')_dkStampIds(deck);
    Object.assign(deck,{id:typeof _deckNextId==='function'?_deckNextId():Date.now(),templateKey:'pm-status',theme:{bg:'#ffffff',accent:'#0891b2'},assignees:[],assigneeNames:[],primaryAssigneeId:null,assignedTo:'',
      createdBy:(D.creds&&(D.creds.userName||D.creds.name))||'User',createdById:(D.creds&&D.creds.userId)||null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    D.decks=Array.isArray(D.decks)?D.decks:[];D.decks.push(deck);
    if(typeof saveDecks==='function')saveDecks();else save('decks');
    _pmToast('🖼 Deck created — opening Slides');
    nav('notes');setTimeout(function(){try{setNotesMode('slides');dkOpen(deck.id);}catch(_){}} ,200);
  }catch(e){_pmToast('Could not build the deck: '+(e&&e.message||e),'error');}
}

// ═══ CHANGE REQUESTS (phase 4) ══════════════════════════════════════════════
var PM_CR_STATUS=['proposed','approved','rejected','implemented'];
function pmTab_changes(key){
  var list=pmRecs('change',key).slice().sort(function(a,b){return ((b.data||{}).no||0)-((a.data||{}).no||0);});
  var appr=list.filter(function(r){return r.status==='approved'||r.status==='implemented';});
  var sum=function(f){return appr.reduce(function(s,r){return s+(Number((r.data||{})[f])||0);},0);};
  var html='<div class="pm-kpis"><div class="pm-kpi"><b>'+list.filter(function(r){return r.status==='proposed';}).length+'</b><span>Awaiting decision</span></div><div class="pm-kpi"><b>'+appr.length+'</b><span>Approved</span></div><div class="pm-kpi"><b>'+_pmMoney(sum('costImpact'))+'</b><span>Approved cost impact</span></div><div class="pm-kpi"><b>'+sum('scheduleDays')+' d</b><span>Approved schedule impact</span></div></div>'+
    '<div class="pm-bar"><button class="btn btn-p" onclick="pmChangeDialog(\''+_pmJ(key)+'\')">'+_pmIcon('plus',14,'#fff')+' New change request</button><span class="pm-muted">Approved cost changes are added to the budget (Budget tab).</span></div>';
  if(!list.length)return html+'<div class="pm-card pm-empty"><b>No change requests</b>Log scope, schedule or cost changes the client or team asks for, then approve or reject them.</div>';
  return html+'<div class="pm-card pm-scroll" style="padding:0"><table class="pm-table"><thead><tr><th>ID</th><th>Change</th><th>Requested by</th><th>Schedule</th><th>Cost</th><th>Status</th><th>Decided</th></tr></thead><tbody>'+list.map(function(r){var d=r.data||{};
    return '<tr class="clk" onclick="pmChangeDialog(\''+_pmJ(key)+'\','+r.id+')"><td class="pm-muted">CR-'+(d.no||'?')+'</td><td><b>'+_pmE(r.title)+'</b>'+(d.scope?'<div class="pm-muted">'+_pmE(String(d.scope).slice(0,120))+'</div>':'')+'</td><td>'+_pmE(pmPersonName(d.requestedBy)||d.requestedByText||'—')+'</td><td>'+(d.scheduleDays?d.scheduleDays+' d':'—')+'</td><td>'+(d.costImpact?_pmMoney(d.costImpact):'—')+'</td><td>'+_pmPill(r.status||'proposed',{proposed:'#d97706',approved:'#16a34a',rejected:'#94a3b8',implemented:'#0891b2'}[r.status]||'#64748b')+'</td><td class="pm-muted">'+(d.decidedAt?_pmDate(d.decidedAt):'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function pmChangeDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  pmModal('<h3>'+_pmIcon('refresh',18)+' '+(r?'CR-'+(d.no||''):'New change request')+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Change</label><input class="inp" id="pmcr-title" value="'+_pmE(r?r.title:'')+'"></div>'+
    '<div class="pm-row" style="align-items:start"><label>Scope / description</label><textarea class="inp" id="pmcr-scope" rows="3">'+_pmE(d.scope||'')+'</textarea></div>'+
    '<div class="pm-row"><label>Requested by</label>'+pmPersonSelect('pmcr-by',d.requestedBy||'')+'</div>'+
    '<div class="pm-row"><label>Requested on</label><input class="inp" type="date" id="pmcr-date" value="'+_pmE(d.date||_pmToday())+'"></div>'+
    '<div class="pm-row"><label>Schedule impact (days)</label><input class="inp" type="number" id="pmcr-days" value="'+_pmE(d.scheduleDays||0)+'"></div>'+
    '<div class="pm-row"><label>Cost impact ($)</label><input class="inp" type="number" id="pmcr-cost" value="'+_pmE(d.costImpact||0)+'"></div>'+
    '<div class="pm-row" style="align-items:start"><label>Reason / benefit</label><textarea class="inp" id="pmcr-why" rows="2">'+_pmE(d.reason||'')+'</textarea></div>'+
    '<div class="pm-row"><label>Status</label><select class="inp" id="pmcr-st">'+PM_CR_STATUS.map(function(s){return '<option'+(s===(r?r.status:'proposed')?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row" style="align-items:start"><label>Decision notes</label><textarea class="inp" id="pmcr-dec" rows="2">'+_pmE(d.decisionNotes||'')+'</textarea></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Change request deleted\')">Delete</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmcr-save">Save</button></div>',true);
  var wire=function(){pmWirePersonSelect('pmcr-by');document.getElementById('pmcr-save').onclick=function(){
    var v=function(x){return document.getElementById(x).value;};var t=v('pmcr-title').trim();if(!t)return;
    var rec=r||pmNew('change',key,{data:{}});var nd=Object.assign({},rec.data||{});
    if(!nd.no)nd.no=1+pmRecs('change',key).reduce(function(m,x){return Math.max(m,Number((x.data||{}).no)||0);},0);
    var st=v('pmcr-st');if(st!==(rec.status||'proposed')&&st!=='proposed')nd.decidedAt=_pmToday();
    Object.assign(nd,{scope:v('pmcr-scope'),requestedBy:v('pmcr-by')==='__new'?'':v('pmcr-by'),date:v('pmcr-date'),scheduleDays:Number(v('pmcr-days'))||0,costImpact:Number(v('pmcr-cost'))||0,reason:v('pmcr-why'),decisionNotes:v('pmcr-dec')});
    rec.title=t;rec.status=st;rec.data=nd;pmCloseModal(true);pmPut(rec);pmRender();};};
  wire();document.getElementById('pm-modal')._handlers=wire;
}

// ═══ LESSONS LEARNED (phase 4) ══════════════════════════════════════════════
function pmTab_lessons(key){
  var list=pmRecs('lesson',key);
  var others=pmRecs('lesson').filter(function(r){return r.projectKey!==key;}).slice(-12).reverse();
  var html='<div class="pm-bar"><button class="btn btn-p" onclick="pmLessonDialog(\''+_pmJ(key)+'\')">'+_pmIcon('plus',14,'#fff')+' Add a lesson</button><button class="btn btn-s" onclick="pmLessonsExport()">Export all lessons</button></div>';
  html+=list.length?'<div class="pm-card pm-scroll" style="padding:0"><table class="pm-table"><thead><tr><th>Lesson</th><th>Category</th><th>Went</th><th>Recommendation</th><th>Date</th></tr></thead><tbody>'+list.map(function(r){var d=r.data||{};
    return '<tr class="clk" onclick="pmLessonDialog(\''+_pmJ(key)+'\','+r.id+')"><td><b>'+_pmE(r.title)+'</b>'+(d.detail?'<div class="pm-muted">'+_pmE(String(d.detail).slice(0,140))+'</div>':'')+'</td><td>'+_pmE(d.category||'')+'</td><td>'+(d.went==='well'?_pmPill('well','#16a34a'):_pmPill('badly','#dc2626'))+'</td><td>'+_pmE(d.recommendation||'')+'</td><td class="pm-muted">'+_pmDate(d.date)+'</td></tr>';}).join('')+'</tbody></table></div>'
    :'<div class="pm-card pm-empty"><b>No lessons yet</b>Capture what went well and what to do differently — now, not at the end when it is forgotten.</div>';
  if(others.length)html+='<div class="pm-card" style="margin-top:12px"><div class="pm-h">'+_pmIcon('lightbulb',15)+' Lessons from other projects</div>'+others.map(function(r){var d=r.data||{};return '<div style="font-size:12.5px;padding:4px 0"><b>'+_pmE(r.title)+'</b> <span class="pm-muted">· '+_pmE(_pmProjName(r.projectKey))+'</span>'+(d.recommendation?' — '+_pmE(d.recommendation):'')+'</div>';}).join('')+'</div>';
  return html;
}
function pmLessonDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  pmModal('<h3>'+_pmIcon('lightbulb',18)+' Lesson learned<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Lesson</label><input class="inp" id="pml2-t" value="'+_pmE(r?r.title:'')+'" placeholder="One line"></div>'+
    '<div class="pm-row"><label>Went</label><select class="inp" id="pml2-w"><option value="well"'+(d.went==='well'?' selected':'')+'>Well — repeat it</option><option value="badly"'+(d.went!=='well'?' selected':'')+'>Badly — avoid it</option></select></div>'+
    '<div class="pm-row"><label>Category</label><select class="inp" id="pml2-c">'+['Planning','Scope','Schedule','Cost','Quality','People','Client','Vendors','Communication','Technical','Process'].map(function(o){return '<option'+(o===d.category?' selected':'')+'>'+o+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row" style="align-items:start"><label>What happened</label><textarea class="inp" id="pml2-d" rows="3">'+_pmE(d.detail||'')+'</textarea></div>'+
    '<div class="pm-row" style="align-items:start"><label>Recommendation</label><textarea class="inp" id="pml2-r" rows="2">'+_pmE(d.recommendation||'')+'</textarea></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Lesson deleted\')">Delete</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pml2-save">Save</button></div>');
  document.getElementById('pml2-save').onclick=function(){var v=function(x){return document.getElementById(x).value;};var t=v('pml2-t').trim();if(!t)return;
    var rec=r||pmNew('lesson',key,{data:{date:_pmToday()}});rec.title=t;rec.data=Object.assign({},rec.data,{went:v('pml2-w'),category:v('pml2-c'),detail:v('pml2-d'),recommendation:v('pml2-r')});
    pmCloseModal(true);pmPut(rec);pmRender();};
}
async function pmLessonsExport(){
  var rows=pmRecs('lesson').map(function(r){var d=r.data||{};return [_pmProjName(r.projectKey),r.title,d.went,d.category,d.detail,d.recommendation,d.date];});
  await _pmXlsx('Lessons learned.xlsx',[{name:'Lessons',rows:[['Project','Lesson','Went','Category','What happened','Recommendation','Date']].concat(rows)}]);
}

// ═══ SCHEDULE ENGINE (phase 3) ══════════════════════════════════════════════
// Nodes come from the project's WBS (kind 'wbs' rows) when it has one, else
// straight from its items. A node: {key, name, parent, children[], dur (work
// days), sne (start-no-earlier-than ymd), preds:[{key,type,lag}], milestone,
// done, pct, refs[], rec?, item?}. pmCpm() runs a forward/backward pass on
// WORKING days (Mon–Fri unless the project counts weekends) and returns
// es/ef/ls/lf/float/critical per node plus summary roll-ups.
function _pmWorkWeekends(key){return !!pmSettings(key).workWeekends;}
function _pmIsWork(d,ww){var x=d.getDay();return ww||(x!==0&&x!==6);}
function _pmNextWork(ymd,ww){var d=new Date(ymd+'T12:00:00');while(!_pmIsWork(d,ww))d.setDate(d.getDate()+1);return _pmYmd(d);}
function _pmAddWork(ymd,n,ww){var d=new Date(_pmNextWork(ymd,ww)+'T12:00:00');var step=n<0?-1:1;var left=Math.abs(n);while(left>0){d.setDate(d.getDate()+step);if(_pmIsWork(d,ww))left--;}return _pmYmd(d);}
function _pmWorkBetween(a,b,ww){/* work days from a to b (b exclusive), negative if b<a */if(a===b)return 0;var sign=b>a?1:-1;var d=new Date((sign>0?a:b)+'T12:00:00'),end=new Date((sign>0?b:a)+'T12:00:00');var n=0;while(d<end){if(_pmIsWork(d,ww))n++;d.setDate(d.getDate()+1);}return sign*n;}
function _pmWbsRecs(key){return pmRecs('wbs',key).slice().sort(function(a,b){return (a.sortOrder||0)-(b.sortOrder||0)||(a.id||0)-(b.id||0);});}
function _pmWbsOrdered(key){
  var recs=_pmWbsRecs(key),kids={},roots=[];
  recs.forEach(function(r){var p=(r.data||{}).parentId;if(p&&recs.some(function(x){return x._lk===p||String(x.id)===String(p);}))(kids[p]=kids[p]||[]).push(r);else roots.push(r);});
  var out=[];var walk=function(r,depth){out.push({rec:r,depth:depth});(kids[r._lk]||[]).concat(r.id?(kids[String(r.id)]||[]):[]).forEach(function(c){walk(c,depth+1);});};
  roots.forEach(function(r){walk(r,0);});
  return out;
}
function pmScheduleNodes(key){
  var ww=_pmWorkWeekends(key);
  var wbs=_pmWbsOrdered(key);
  if(wbs.length){
    var keyOf=function(r){return 'wbs:'+(r.id||r._lk);};
    var byLk={};wbs.forEach(function(w){byLk[w.rec._lk]=w.rec;if(w.rec.id)byLk[String(w.rec.id)]=w.rec;});
    var nodes=wbs.map(function(w,i){var r=w.rec,d=r.data||{};var par=d.parentId&&byLk[d.parentId]?keyOf(byLk[d.parentId]):null;
      return {key:keyOf(r),row:i+1,name:r.title||'(unnamed)',depth:w.depth,parent:par,dur:d.milestone?0:Math.max(0,Number(d.duration)||(d.milestone?0:1)),sne:_pmIsYmd(d.sne)?d.sne:null,
        preds:(d.preds||[]).map(function(p){var t=byLk[String(p.id)];return t?{key:keyOf(t),type:p.type||'FS',lag:Number(p.lag)||0}:null;}).filter(Boolean),
        milestone:!!d.milestone,done:r.status==='done',pct:Number(d.pct)||(r.status==='done'?100:0),refs:d.refs||[],imsType:d.imsType||'',rec:r};});
    nodes.forEach(function(n){n.children=nodes.filter(function(c){return c.parent===n.key;}).map(function(c){return c.key;});});
    return {mode:'wbs',nodes:nodes,ww:ww};
  }
  var items=pmItems(key);var refs={};items.forEach(function(i){refs[i.ref]=1;});
  var nodes2=items.map(function(i,ix){
    var s=i.start||null,f=i.due||null;var dur=s&&f?Math.max(1,_pmWorkBetween(s,f,ww)+1):1;
    return {key:i.ref,row:ix+1,name:i.title,depth:0,parent:i.parent&&refs[i.parent]?i.parent:null,dur:i.milestone?0:dur,sne:s||(f?_pmAddWork(f,-(dur-1),ww):null),
      preds:(i.preds||[]).filter(function(p){return refs[p];}).map(function(p){return {key:p,type:'FS',lag:0};}),milestone:!!i.milestone,done:i.done,pct:i.done?100:0,refs:[i.ref],item:i,dated:!!(s||f)};
  });
  var dk={};nodes2.forEach(function(n){dk[n.key]=n;});
  nodes2.forEach(function(n){var d=0,p=n.parent,g=0;while(p&&dk[p]&&g++<8){d++;p=dk[p].parent;}n.depth=d;n.children=nodes2.filter(function(c){return c.parent===n.key;}).map(function(c){return c.key;});});
  return {mode:'items',nodes:nodes2,ww:ww};
}
function pmCpm(key){
  var S=pmScheduleNodes(key),nodes=S.nodes,ww=S.ww,by={};nodes.forEach(function(n){by[n.key]=n;});
  var leaves=nodes.filter(function(n){return !n.children.length;});
  var starts=leaves.map(function(n){return n.sne;}).filter(Boolean).sort();
  var pset=pmSettings(key);
  var p0=_pmNextWork((_pmIsYmd(pset.startDate)&&pset.startDate)||starts[0]||_pmToday(),ww);
  var idx=function(ymd){return _pmWorkBetween(p0,_pmNextWork(ymd,ww),ww);};
  // a summary's predecessors apply to all its leaves
  var effPreds=function(n){var ps=n.preds.slice();var p=n.parent,g=0;while(p&&by[p]&&g++<8){ps=ps.concat(by[p].preds);p=by[p].parent;}return ps;};
  var leafOf=function(k){var n=by[k];if(!n)return [];if(!n.children.length)return [n];var out=[];n.children.forEach(function(c){out=out.concat(leafOf(c));});return out;};
  // expand summary predecessors into their leaves
  var predEdges={};leaves.forEach(function(n){predEdges[n.key]=[];effPreds(n).forEach(function(p){leafOf(p.key).forEach(function(l){if(l.key!==n.key)predEdges[n.key].push({key:l.key,type:p.type,lag:p.lag});});});});
  // topological order (Kahn); cycles are reported and their links ignored
  var indeg={},succ={};leaves.forEach(function(n){indeg[n.key]=0;succ[n.key]=[];});
  leaves.forEach(function(n){predEdges[n.key].forEach(function(e){if(indeg[n.key]!=null&&succ[e.key]){indeg[n.key]++;succ[e.key].push({key:n.key,type:e.type,lag:e.lag});}});});
  var q=leaves.filter(function(n){return !indeg[n.key];}).map(function(n){return n.key;}),order=[];
  while(q.length){var k=q.shift();order.push(k);succ[k].forEach(function(s){if(--indeg[s.key]===0)q.push(s.key);});}
  var cyc=leaves.filter(function(n){return order.indexOf(n.key)<0;}).map(function(n){return n.key;});
  order=order.concat(cyc);
  var R={};
  order.forEach(function(k){var n=by[k];var es=n.sne?Math.max(0,idx(n.sne)):0;
    predEdges[k].forEach(function(e){var p=R[e.key];if(!p)return;var lag=e.lag||0;
      var c=e.type==='SS'?p.es+lag:e.type==='FF'?p.ef+lag-n.dur:e.type==='SF'?p.es+lag-n.dur:p.ef+lag;es=Math.max(es,c);});
    R[k]={es:es,ef:es+n.dur};});
  var finish=leaves.reduce(function(m,n){return Math.max(m,R[n.key]?R[n.key].ef:0);},0);
  order.slice().reverse().forEach(function(k){var n=by[k],r=R[k];var lf=finish;
    succ[k].forEach(function(s){var sr=R[s.key];if(!sr||sr.ls==null)return;var lag=s.lag||0,sn=by[s.key];
      var c=s.type==='SS'?sr.ls-lag+n.dur:s.type==='FF'?sr.lf-lag:s.type==='SF'?sr.lf-lag+n.dur-sn.dur:sr.ls-lag;lf=Math.min(lf,c);});
    r.lf=lf;r.ls=lf-n.dur;r.float=r.ls-r.es;r.critical=r.float<=0&&!n.done;});
  // roll up summaries
  var roll=function(k){var n=by[k];if(!n.children.length)return R[k];var ch=n.children.map(roll).filter(Boolean);if(!ch.length){R[k]={es:0,ef:0,float:0};return R[k];}
    R[k]={es:Math.min.apply(null,ch.map(function(c){return c.es;})),ef:Math.max.apply(null,ch.map(function(c){return c.ef;})),float:Math.min.apply(null,ch.map(function(c){return c.float;})),summary:true};
    R[k].critical=ch.some(function(c){return c.critical;});return R[k];};
  nodes.filter(function(n){return !n.parent;}).forEach(function(n){roll(n.key);});
  var date=function(i){return _pmAddWork(p0,i,ww);};
  nodes.forEach(function(n){var r=R[n.key];if(!r)return;n.es=r.es;n.ef=r.ef;n.float=r.float;n.critical=!!r.critical;n.summary=!!n.children.length;
    n.start=date(r.es);n.finish=n.dur===0&&!n.summary?date(r.es):_pmAddWork(date(r.es),Math.max(0,(r.ef-r.es)-1),ww);});
  // the last day anything happens (a zero-length milestone finishes ON its day)
  var lastDay=leaves.reduce(function(m,n){var r=R[n.key];return r?Math.max(m,n.dur===0?r.es:r.ef-1):m;},0);
  return {mode:S.mode,nodes:nodes,start:p0,finish:date(Math.max(0,lastDay)),ww:ww,cycles:cyc.length,undated:S.mode==='items'?nodes.filter(function(n){return !n.dated&&!n.children.length;}).length:0};
}

// ─── baselines + milestones ─────────────────────────────────────────────────
function pmBaselines(key){return pmRecs('baseline',key).slice().sort(function(a,b){return String(b.createdAt||b.updatedAt).localeCompare(String(a.createdAt||a.updatedAt));});}
function pmBaselineSave(key){
  var name=prompt('Name this baseline (a snapshot of today’s plan to compare against later):','Baseline '+_pmDate(_pmToday()));if(!name)return;
  var c=pmCpm(key),snap={};c.nodes.forEach(function(n){snap[n.key]={start:n.start,finish:n.finish,dur:n.dur};});
  var rec=pmNew('baseline',key,{title:name,data:{at:new Date().toISOString(),nodes:snap,start:c.start,finish:c.finish}});
  pmPut(rec).then(function(){pmSetSettings(key,{baselineLk:rec._lk});pmRender();});
  _pmToast('📌 Baseline saved');
}
function _pmActiveBaseline(key){var lk=pmSettings(key).baselineLk;var b=pmBaselines(key);if(lk==='none')return null;return b.find(function(x){return x._lk===lk||'id'+x.id===lk;})||b[0]||null;}
function pmMilestoneDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  pmModal('<h3>'+_pmIcon('target',18)+' Milestone<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Milestone</label><input class="inp" id="pmm-t" value="'+_pmE(r?r.title:'')+'"></div>'+
    '<div class="pm-row"><label>Date</label><input class="inp" type="date" id="pmm-d" value="'+_pmE(d.date||'')+'"></div>'+
    '<div class="pm-row"><label>Done</label><input type="checkbox" id="pmm-done" '+(r&&r.status==='done'?'checked':'')+'></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Milestone deleted\')">Delete</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmm-save">Save</button></div>');
  document.getElementById('pmm-save').onclick=function(){var t=document.getElementById('pmm-t').value.trim();if(!t)return;var rec=r||pmNew('milestone',key,{data:{}});rec.title=t;rec.status=document.getElementById('pmm-done').checked?'done':null;rec.data=Object.assign({},rec.data,{date:document.getElementById('pmm-d').value||null});pmCloseModal(true);pmPut(rec);pmRender();};
}

// ─── Gantt ──────────────────────────────────────────────────────────────────
function pmTab_schedule(key){
  var c=pmCpm(key),zoom=_pmState.ganttZoom||'week',crit=_pmState.ganttCrit!==false,hideDone=!!_pmState.ganttHideDone;
  var base=_pmActiveBaseline(key),bases=pmBaselines(key);
  var ms=pmMilestones(key).filter(function(m){return m.src==='project'||m.src==='pm';});
  var nodes=c.nodes.filter(function(n){return !(hideDone&&n.done&&!n.summary);});
  var html='<div class="pm-bar">'+['week','month','quarter'].map(function(z){return '<button class="pm-chip'+(zoom===z?' on':'')+'" onclick="_pmState.ganttZoom=\''+z+'\';_pmSaveState();pmRender()">'+z[0].toUpperCase()+z.slice(1)+'</button>';}).join('')+
    '<button class="pm-chip'+(crit?' on':'')+'" onclick="_pmState.ganttCrit='+(!crit)+';_pmSaveState();pmRender()">⛓ Critical path</button>'+
    '<button class="pm-chip'+(hideDone?' on':'')+'" onclick="_pmState.ganttHideDone='+(!hideDone)+';_pmSaveState();pmRender()">Hide done</button>'+
    '<span class="pm-muted">Baseline</span><select class="inp" onchange="pmSetSettings(\''+_pmJ(key)+'\',{baselineLk:this.value});pmRender()"><option value="none"'+(!base?' selected':'')+'>none</option>'+bases.map(function(b){return '<option value="'+_pmE(b._lk)+'"'+(base&&base._lk===b._lk?' selected':'')+'>'+_pmE(b.title)+'</option>';}).join('')+'</select>'+
    '<span class="sp"></span><button class="btn btn-s" onclick="pmBaselineSave(\''+_pmJ(key)+'\')">📌 Save baseline</button><button class="btn btn-s" onclick="pmMilestoneDialog(\''+_pmJ(key)+'\')">◆ Milestone</button>'+
    (c.mode==='wbs'?'<button class="btn btn-s" onclick="pmWbsWriteBack(\''+_pmJ(key)+'\')" title="Copy the computed dates onto the linked LevelUp tasks">Write dates to tasks</button>':'')+'</div>';
  if(c.mode==='items')html+='<div class="pm-muted" style="margin-bottom:8px">Showing task dates'+(c.undated?' — '+c.undated+' item'+(c.undated===1?' has':'s have')+' no dates and '+(c.undated===1?'sits':'sit')+' at the project start':'')+'. Build a WBS on the <a href="javascript:void(0)" onclick="pmGo(null,\'ims\')">WBS / IMS</a> tab for durations, dependencies and an exportable schedule.</div>';
  if(c.cycles)html+='<div style="color:#dc2626;font-size:12px;margin-bottom:8px">⚠ '+c.cycles+' item'+(c.cycles===1?' is':'s are')+' in a dependency loop — those links were ignored.</div>';
  if(!nodes.length&&!ms.length)return html+'<div class="pm-card pm-empty"><b>Nothing to schedule yet</b>Add tasks to this project, or build a WBS.</div>';
  // timeline range
  var all=nodes.map(function(n){return n.start;}).concat(nodes.map(function(n){return n.finish;})).concat(ms.map(function(m){return m.date;})).filter(Boolean);
  if(base)Object.keys(base.data.nodes||{}).forEach(function(k){var b=base.data.nodes[k];if(b){all.push(b.start);all.push(b.finish);}});
  all.sort();var t0=_pmAddDays(all[0]||_pmToday(),-3),t1=_pmAddDays(all[all.length-1]||_pmToday(),7);
  var ppd={week:22,month:7,quarter:2.4}[zoom];var days=_pmDays(t0,t1)+1,W=Math.max(400,Math.round(days*ppd)),L=440,rowH=28,HEAD=34;
  var x=function(ymd){return Math.round(_pmDays(t0,ymd)*ppd);};
  // header ticks
  var ticks='';for(var i=0;i<days;i++){var dt=_pmAddDays(t0,i),d=new Date(dt+'T12:00:00');
    var label=zoom==='week'?(d.getDay()===1?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):''):zoom==='month'?(d.getDay()===1?String(d.getDate()):''):(d.getDate()===1?d.toLocaleDateString(undefined,{month:'short',year:'2-digit'}):'');
    if(zoom!=='quarter'&&d.getDate()===1)ticks+='<div style="position:absolute;left:'+x(dt)+'px;top:0;font-size:10.5px;font-weight:700;color:var(--t2)">'+d.toLocaleDateString(undefined,{month:'short'})+'</div>';
    if(label)ticks+='<div style="position:absolute;left:'+x(dt)+'px;top:16px;font-size:10px;color:var(--t3);border-left:1px solid var(--bd1);padding-left:2px;height:18px">'+label+'</div>';
    if(!_pmIsWork(d,c.ww)&&zoom==='week')ticks+='<div style="position:absolute;left:'+x(dt)+'px;top:'+HEAD+'px;width:'+Math.ceil(ppd)+'px;height:{{H}}px;background:var(--s2);opacity:.6"></div>';}
  var today=_pmToday();
  var rows=nodes.map(function(n,ri){
    var bl=base&&base.data.nodes&&base.data.nodes[n.key];
    var color=n.done?'#94a3b8':(crit&&n.critical?'#dc2626':(n.summary?'#475569':'var(--page-accent,#0891b2)'));
    var bx=x(n.start),bw=Math.max(n.milestone?0:6,x(_pmAddDays(n.finish,1))-bx);
    var bar=n.milestone?'<div title="'+_pmE(n.name+' — '+_pmDate(n.start))+'" style="position:absolute;left:'+(bx-7)+'px;top:7px;width:14px;height:14px;transform:rotate(45deg);background:'+color+'"></div>'
      :n.summary?'<div title="'+_pmE(n.name)+'" style="position:absolute;left:'+bx+'px;top:10px;width:'+bw+'px;height:7px;background:'+color+';border-radius:2px"></div>'
      :'<div title="'+_pmE(n.name+' · '+_pmDate(n.start)+' → '+_pmDate(n.finish)+(n.float!=null?' · float '+n.float+'d':''))+'" style="position:absolute;left:'+bx+'px;top:6px;width:'+bw+'px;height:'+(bl?11:16)+'px;background:'+color+';border-radius:4px;opacity:'+(n.done?.6:1)+'"><div style="height:100%;width:'+(n.pct||0)+'%;background:rgba(255,255,255,.35);border-radius:4px"></div></div>';
    var blBar=bl&&bl.start?'<div title="Baseline '+_pmDate(bl.start)+' → '+_pmDate(bl.finish)+'" style="position:absolute;left:'+x(bl.start)+'px;top:19px;width:'+Math.max(4,x(_pmAddDays(bl.finish,1))-x(bl.start))+'px;height:5px;background:#94a3b8;border-radius:2px;opacity:.8"></div>':'';
    var varD=bl&&bl.finish?_pmWorkBetween(bl.finish,n.finish,c.ww):null;
    return '<div style="display:flex;height:'+rowH+'px;border-bottom:1px solid var(--bd1)">'+
      '<div class="gl" style="width:'+L+'px;flex:none;display:grid;grid-template-columns:minmax(0,1fr) 70px 70px 44px 44px;align-items:center;font-size:12px;padding:0 6px;'+(n.summary?'font-weight:650':'')+'">'+
        '<div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-left:'+(n.depth*14)+'px;cursor:pointer" title="'+_pmE(n.name)+'" onclick="'+(n.item?'pmOpenItem(\''+_pmJ(n.item.ref)+'\')':'pmGo(null,\'ims\')')+'">'+(n.milestone?'◆ ':'')+(n.done?'✓ ':'')+_pmE(n.name)+'</div>'+
        '<div class="pm-muted">'+_pmDate(n.start)+'</div><div class="pm-muted">'+_pmDate(n.finish)+'</div>'+
        '<div class="pm-muted" title="Float (slack) in work days">'+(n.summary||n.done?'':(n.critical?'<b style="color:#dc2626">0</b>':n.float))+'</div>'+
        '<div title="Finish vs baseline (work days)" style="font-size:11px;'+(varD>0?'color:#dc2626':varD<0?'color:#16a34a':'color:var(--t3)')+'">'+(varD==null?'':varD>0?'+'+varD:varD)+'</div></div>'+
      '<div style="position:relative;width:'+W+'px;flex:none">'+blBar+bar+'</div></div>';
  }).join('');
  // milestone rows (project/PM milestones that are not tasks)
  rows+=ms.length?'<div style="display:flex;height:'+rowH+'px;border-bottom:1px solid var(--bd1);background:var(--s2)"><div class="gl" style="width:'+L+'px;flex:none;padding:6px;font-size:11px;font-weight:700;color:var(--t3)">MILESTONES</div><div style="width:'+W+'px;flex:none"></div></div>'+
    ms.map(function(m){return '<div style="display:flex;height:'+rowH+'px;border-bottom:1px solid var(--bd1)"><div class="gl" style="width:'+L+'px;flex:none;padding:6px;font-size:12px;cursor:'+(m.id?'pointer':'default')+'" '+(m.id?'onclick="pmMilestoneDialog(\''+_pmJ(key)+'\','+m.id+')"':'')+'>◆ '+_pmE(m.name)+' <span class="pm-muted">'+(m.date?_pmDate(m.date):'no date')+'</span></div><div style="position:relative;width:'+W+'px;flex:none">'+(m.date?'<div title="'+_pmE(m.name)+'" style="position:absolute;left:'+(x(m.date)-7)+'px;top:7px;width:14px;height:14px;transform:rotate(45deg);background:'+(m.done?'#94a3b8':m.date<today?'#dc2626':'#7c3aed')+'"></div>':'')+'</div></div>';}).join(''):'';
  var nRows=nodes.length+(ms.length?ms.length+1:0),H=nRows*rowH;
  // dependency arrows
  var pos={};nodes.forEach(function(n,i){pos[n.key]={i:i,n:n};});
  var arrows=nodes.map(function(n){return (n.preds||[]).map(function(p){var a=pos[p.key];if(!a)return '';var pn=a.n;
    var x1=(p.type==='SS'||p.type==='SF')?x(pn.start):x(_pmAddDays(pn.finish,1)),y1=a.i*rowH+rowH/2;
    var x2=(p.type==='FF'||p.type==='SF')?x(_pmAddDays(n.finish,1)):x(n.start),y2=pos[n.key].i*rowH+rowH/2;
    var c=crit&&n.critical&&pn.critical?'#dc2626':'var(--t3)';
    return '<path d="M'+x1+' '+y1+' h8 V'+y2+' H'+(x2-2)+'" fill="none" stroke="'+c+'" stroke-width="1.3" marker-end="url(#pm-arr)" opacity=".85"/>';}).join('');}).join('');
  var todayLine=today>=t0&&today<=t1?'<div style="position:absolute;left:'+(L+x(today))+'px;top:0;bottom:0;width:2px;background:#dc2626;opacity:.5;z-index:1"></div>':'';
  html+='<div class="pm-card pm-scroll" style="padding:0;max-height:72vh"><div class="pm-gantt" style="position:relative;width:'+(L+W)+'px">'+
    '<div style="display:flex;height:'+HEAD+'px;position:sticky;top:0;z-index:3;background:var(--s1);border-bottom:1px solid var(--bd2)"><div class="gl" style="width:'+L+'px;flex:none;display:grid;grid-template-columns:minmax(0,1fr) 70px 70px 44px 44px;align-items:end;padding:0 6px 6px;font-size:10.5px;color:var(--t3);font-weight:700;text-transform:uppercase"><div>'+(c.mode==='wbs'?'WBS':'Task')+'</div><div>Start</div><div>Finish</div><div>Float</div><div>Var</div></div><div style="position:relative;width:'+W+'px;flex:none">'+ticks.replace(/\{\{H\}\}/g,String(H))+'</div></div>'+
    rows+todayLine+
    '<svg style="position:absolute;left:'+L+'px;top:'+HEAD+'px;pointer-events:none;z-index:2" width="'+W+'" height="'+H+'"><defs><marker id="pm-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="var(--t3)"/></marker></defs>'+arrows+'</svg>'+
    '</div></div><div class="pm-muted" style="margin-top:6px">Project '+_pmDate(c.start)+' → <b>'+_pmDate(c.finish)+'</b>'+(base?' · baseline finish '+_pmDate(base.data.finish)+' ('+(function(v){return v>0?'+'+v+' work days late':v<0?Math.abs(v)+' work days early':'on baseline';})(_pmWorkBetween(base.data.finish,c.finish,c.ww))+')':'')+(c.ww?'':' · work days are Mon–Fri')+'</div>';
  return html;
}
/** Copy computed WBS dates onto the linked native tasks (explicit button). */
function pmWbsWriteBack(key){
  var c=pmCpm(key),n=0;var list=[];
  c.nodes.forEach(function(nd){if(nd.summary)return;(nd.refs||[]).forEach(function(ref){if(ref.indexOf('task:')!==0)return;var t=(D.tasks||[]).find(function(x){return 'task:'+x.id===ref;});if(t&&(t.startDate!==nd.start||t.due!==nd.finish))list.push({t:t,s:nd.start,f:nd.finish});});});
  if(!list.length){_pmToast('Tasks already match the schedule');return;}
  if(!confirm('Update start and due dates on '+list.length+' task'+(list.length===1?'':'s')+' to match the schedule?'))return;
  list.forEach(function(x){x.t.startDate=x.s;x.t.due=x.f;x.t.updatedAt=new Date().toISOString();n++;});
  try{save('tasks');}catch(_){}_pmToast('Updated '+n+' task'+(n===1?'':'s'));pmRender();
}

// ═══ WBS / IMS (phase 3) ════════════════════════════════════════════════════
// Both styles the owner asked for, on the same rows:
//  'msp' — MS Project-style outline: summary tasks → tasks, codes 1, 1.1, 1.1.1
//  'dod' — DoD IMS: Event (A) → Significant Accomplishment (A01) →
//          Accomplishment Criteria (A01a) → tasks (A01a01)
var PM_IMS_TYPES={event:'Event',accomplishment:'Significant accomplishment',criteria:'Accomplishment criteria',task:'Task'};
function pmImsStyle(key){return pmSettings(key).imsStyle==='dod'?'dod':'msp';}
function pmWbsCodes(key){
  var ord=_pmWbsOrdered(key),style=pmImsStyle(key),codes={};
  if(style==='msp'){var stack=[];ord.forEach(function(w){stack.length=w.depth+1;stack[w.depth]=(stack[w.depth]||0)+1;for(var i=w.depth+1;i<stack.length;i++)stack[i]=0;codes[w.rec._lk]=stack.slice(0,w.depth+1).join('.');});}
  else{var c=[0,0,0,0];var path=[];ord.forEach(function(w){var d=Math.min(w.depth,3);c[d]++;for(var i=d+1;i<4;i++)c[i]=0;path[d]=c[d];
    var code=String.fromCharCode(64+((path[0]-1)%26)+1);if(d>=1)code+=String(path[1]).padStart(2,'0');if(d>=2)code+=String.fromCharCode(96+((path[2]-1)%26)+1);if(d>=3)code+=String(path[3]).padStart(2,'0');codes[w.rec._lk]=code;});}
  return codes;
}
function _pmPredText(r,rowOf){return ((r.data||{}).preds||[]).map(function(p){var n=rowOf[String(p.id)];if(!n)return '';return n+(p.type&&p.type!=='FS'?p.type:'')+(p.lag?(p.lag>0?'+':'')+p.lag+'d':'');}).filter(Boolean).join(', ');}
function _pmParsePreds(text,recByRow){
  return String(text||'').split(/[,;]+/).map(function(s){var m=s.trim().toUpperCase().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*D?$/);if(!m)return null;var r=recByRow[Number(m[1])];if(!r||!r.id)return null;return {id:r.id,type:m[2]||'FS',lag:m[3]?Number(m[3].replace(/\s/g,'')):0};}).filter(Boolean);
}
function pmTab_ims(key){
  var style=pmImsStyle(key),ord=_pmWbsOrdered(key),codes=pmWbsCodes(key),c=pmCpm(key);
  var byKey={};c.nodes.forEach(function(n){byKey[n.key]=n;});
  var rowOf={};ord.forEach(function(w,i){rowOf[String(w.rec.id)]=i+1;rowOf[w.rec._lk]=i+1;});
  var items=pmItems(key);
  var html='<div class="pm-bar"><span class="pm-muted">Style</span><button class="pm-chip'+(style==='msp'?' on':'')+'" onclick="pmSetSettings(\''+_pmJ(key)+'\',{imsStyle:\'msp\'});pmRender()">MS Project-style WBS</button><button class="pm-chip'+(style==='dod'?' on':'')+'" onclick="pmSetSettings(\''+_pmJ(key)+'\',{imsStyle:\'dod\'});pmRender()">DoD IMS (event → accomplishment → criteria)</button>'+
    '<span class="sp"></span><button class="btn btn-s" onclick="pmImsGenerate(\''+_pmJ(key)+'\',\'tasks\')">Build from tasks</button><button class="btn btn-s" onclick="pmImsGenerate(\''+_pmJ(key)+'\',\'dod\')">Build DoD IMS</button><button class="btn btn-s" onclick="pmImsAI(\''+_pmJ(key)+'\')">'+_pmIcon('sparkles',14)+' Draft with AI</button></div>'+
    '<div class="pm-bar"><button class="btn btn-p" onclick="pmWbsAdd(\''+_pmJ(key)+'\',null)">＋ Row</button><span class="pm-muted">Durations are in work days. Predecessors use row numbers: “3”, “3SS”, “3FS+2”, “4FF-1”.</span><span class="sp"></span>'+
    '<button class="btn btn-s" onclick="pmImsExport(\''+_pmJ(key)+'\',\'xlsx\')">Excel</button><button class="btn btn-s" onclick="pmImsExport(\''+_pmJ(key)+'\',\'msp\')">MS Project XML</button><button class="btn btn-s" onclick="pmImsExport(\''+_pmJ(key)+'\',\'csv\')">CSV</button><button class="btn btn-s" onclick="pmImsPrint(\''+_pmJ(key)+'\')">Print</button>'+(ord.length?'<button class="btn btn-s" style="color:#dc2626" onclick="pmWbsClear(\''+_pmJ(key)+'\')">Clear</button>':'')+'</div>';
  if(!ord.length)return html+'<div class="pm-card pm-empty"><b>No WBS / IMS yet</b>“Build from tasks” turns this project’s tasks into an outline you can give durations and dependencies. “Build DoD IMS” groups the work under events (your milestones), significant accomplishments and accomplishment criteria. Or add rows yourself.</div>';
  var typeSel=function(r){var d=r.data||{};return '<select class="inp" style="width:auto;height:26px;font-size:11.5px" onchange="pmWbsSet(\''+_pmJ(r._lk)+'\',\'imsType\',this.value)">'+Object.keys(PM_IMS_TYPES).map(function(k){return '<option value="'+k+'"'+((d.imsType||'task')===k?' selected':'')+'>'+PM_IMS_TYPES[k]+'</option>';}).join('')+'</select>';};
  var itemSel=function(r){var d=r.data||{};var cur=(d.refs||[])[0]||'';return '<select class="inp" style="max-width:170px;height:26px;font-size:11.5px" onchange="pmWbsSet(\''+_pmJ(r._lk)+'\',\'refs\',this.value?[this.value]:[])"><option value="">—</option>'+items.map(function(i){return '<option value="'+_pmE(i.ref)+'"'+(i.ref===cur?' selected':'')+'>'+_pmE(String(i.title).slice(0,50))+'</option>';}).join('')+'</select>';};
  html+='<div class="pm-card pm-scroll" style="padding:0;max-height:70vh"><table class="pm-table pm-ims"><thead><tr><th>#</th><th>'+(style==='dod'?'IMS #':'WBS')+'</th><th style="min-width:240px">Name</th>'+(style==='dod'?'<th>Type</th>':'')+'<th>Days</th><th>Start no earlier</th><th>Predecessors</th><th>Start</th><th>Finish</th><th>Float</th><th>Linked task</th><th>Done</th><th></th></tr></thead><tbody>'+
    ord.map(function(w,i){var r=w.rec,d=r.data||{},n=byKey['wbs:'+(r.id||r._lk)]||{};var lk=_pmJ(r._lk);var sum=n.summary;
      return '<tr'+(n.critical&&!n.done?' style="background:color-mix(in srgb,#dc2626 6%,transparent)"':'')+'><td class="pm-muted">'+(i+1)+'</td><td class="n pm-muted">'+_pmE(codes[r._lk]||'')+'</td>'+
        '<td style="padding-left:'+(8+w.depth*16)+'px"><input class="inp" value="'+_pmE(r.title||'')+'" style="'+(sum?'font-weight:650':'')+'" onchange="pmWbsSet(\''+lk+'\',\'title\',this.value)"></td>'+
        (style==='dod'?'<td>'+typeSel(r)+'</td>':'')+
        '<td>'+(sum?'<span class="pm-muted">'+(n.ef-n.es||0)+'</span>':'<input class="inp" type="number" min="0" style="width:58px" value="'+_pmE(d.milestone?0:(d.duration!=null?d.duration:1))+'" onchange="pmWbsSet(\''+lk+'\',\'duration\',this.value)">')+'</td>'+
        '<td>'+(sum?'':'<input class="inp" type="date" style="width:130px" value="'+_pmE(d.sne||'')+'" onchange="pmWbsSet(\''+lk+'\',\'sne\',this.value)">')+'</td>'+
        '<td><input class="inp" style="width:90px" value="'+_pmE(_pmPredText(r,rowOf))+'" onchange="pmWbsSetPreds(\''+_pmJ(key)+'\',\''+lk+'\',this.value)"></td>'+
        '<td class="pm-muted">'+_pmDate(n.start)+'</td><td class="pm-muted">'+_pmDate(n.finish)+'</td><td>'+(sum||n.done?'':n.critical?'<b style="color:#dc2626">0</b>':(n.float!=null?n.float:''))+'</td>'+
        '<td>'+(sum?'':itemSel(r))+'</td><td><input type="checkbox" '+(r.status==='done'?'checked':'')+' onchange="pmWbsSet(\''+lk+'\',\'done\',this.checked)"></td>'+
        '<td style="white-space:nowrap"><button class="btn btn-s" style="height:24px;padding:0 6px" title="Outdent" onclick="pmWbsMove(\''+_pmJ(key)+'\',\''+lk+'\',\'out\')">←</button><button class="btn btn-s" style="height:24px;padding:0 6px" title="Indent" onclick="pmWbsMove(\''+_pmJ(key)+'\',\''+lk+'\',\'in\')">→</button><button class="btn btn-s" style="height:24px;padding:0 6px" title="Move up" onclick="pmWbsMove(\''+_pmJ(key)+'\',\''+lk+'\',\'up\')">↑</button><button class="btn btn-s" style="height:24px;padding:0 6px" title="Move down" onclick="pmWbsMove(\''+_pmJ(key)+'\',\''+lk+'\',\'down\')">↓</button><button class="btn btn-s" style="height:24px;padding:0 6px" title="Add a row below" onclick="pmWbsAdd(\''+_pmJ(key)+'\',\''+lk+'\')">＋</button><button class="btn btn-s" style="height:24px;padding:0 6px" title="Milestone" onclick="pmWbsSet(\''+lk+'\',\'milestone\','+(!d.milestone)+')">'+(d.milestone?'◆':'◇')+'</button><button class="btn btn-s" style="height:24px;padding:0 6px;color:#dc2626" title="Delete row" onclick="pmWbsDelete(\''+_pmJ(key)+'\',\''+lk+'\')">×</button></td></tr>';
    }).join('')+'</tbody></table></div><div class="pm-muted" style="margin-top:6px">Finish '+_pmDate(c.finish)+' · '+c.nodes.filter(function(n){return n.critical&&!n.summary;}).length+' item'+(c.nodes.filter(function(n){return n.critical&&!n.summary;}).length===1?'':'s')+' on the critical path (highlighted). The Schedule tab draws this as a Gantt.</div>';
  return html;
}
function pmWbsSet(lk,field,val){
  var r=pmRec(lk);if(!r)return;var d=Object.assign({},r.data||{});
  if(field==='title')r.title=String(val).trim();
  else if(field==='done')r.status=val?'done':null;
  else if(field==='duration')d.duration=Math.max(0,Number(val)||0);
  else if(field==='milestone'){d.milestone=!!val;if(d.milestone)d.duration=0;else if(!d.duration)d.duration=1;}
  else d[field]=val;
  r.data=d;pmPut(r);pmRender();
}
function pmWbsSetPreds(key,lk,text){
  var r=pmRec(lk);if(!r)return;var ord=_pmWbsOrdered(key);var byRow={};ord.forEach(function(w,i){byRow[i+1]=w.rec;});
  var p=_pmParsePreds(text,byRow).filter(function(x){return x.id!==r.id;});
  if(String(text).trim()&&!p.length)_pmToast('Could not read that — use row numbers like 3, 3SS or 3FS+2','warn');
  r.data=Object.assign({},r.data,{preds:p});pmPut(r);pmRender();
}
function pmWbsAdd(key,afterLk){
  var ord=_pmWbsOrdered(key);var after=afterLk?pmRec(afterLk):null;
  var parentId=after?(after.data||{}).parentId||null:null;
  var so=after?(after.sortOrder||0)+1:(ord.length?Math.max.apply(null,ord.map(function(w){return w.rec.sortOrder||0;}))+10:10);
  _pmWbsRecs(key).forEach(function(r){if(after&&r!==after&&(r.sortOrder||0)>=so){r.sortOrder=(r.sortOrder||0)+2;pmPut(r);}});
  var style=pmImsStyle(key);
  var rec=pmNew('wbs',key,{title:'New row',sortOrder:so,data:{parentId:parentId,duration:1,preds:[],imsType:style==='dod'?'task':''}});
  pmPut(rec);pmRender();
}
function pmWbsDelete(key,lk){
  var r=pmRec(lk);if(!r)return;
  var ord=_pmWbsOrdered(key);var i=ord.findIndex(function(w){return w.rec===r;});var dep=ord[i].depth;var kill=[r];
  for(var j=i+1;j<ord.length&&ord[j].depth>dep;j++)kill.push(ord[j].rec);
  if(kill.length>1&&!confirm('Delete this row and the '+(kill.length-1)+' row'+(kill.length===2?'':'s')+' under it?'))return;
  pmDel(kill,kill.length+' WBS row'+(kill.length===1?'':'s')+' deleted');
}
function pmWbsMove(key,lk,dir){
  var ord=_pmWbsOrdered(key);var i=ord.findIndex(function(w){return w.rec._lk===lk;});if(i<0)return;var w=ord[i],r=w.rec,d=r.data||{};
  var pid=function(x){return x.id?String(x.id):x._lk;};
  if(dir==='in'){var prev=null;for(var j=i-1;j>=0;j--){if(ord[j].depth===w.depth){prev=ord[j].rec;break;}if(ord[j].depth<w.depth)break;}if(!prev)return;r.data=Object.assign({},d,{parentId:pid(prev)});pmPut(r);}
  else if(dir==='out'){if(!d.parentId)return;var par=pmRecs('wbs',key).find(function(x){return pid(x)===String(d.parentId)||x._lk===d.parentId;});r.data=Object.assign({},d,{parentId:par?(par.data||{}).parentId||null:null});r.sortOrder=(par?par.sortOrder||0:r.sortOrder)+1;pmPut(r);}
  else{var sib=ord.filter(function(x){return x.depth===w.depth&&String((x.rec.data||{}).parentId||'')===String(d.parentId||'');});var k=sib.findIndex(function(x){return x.rec===r;});var o=sib[dir==='up'?k-1:k+1];if(!o)return;var a=r.sortOrder||0,b=o.rec.sortOrder||0;if(a===b)b=a+(dir==='up'?-1:1);r.sortOrder=b;o.rec.sortOrder=a;pmPut(r);pmPut(o.rec);}
  pmRender();
}
async function pmWbsClear(key){if(!confirm('Delete the whole WBS / IMS for this project? (You can undo right after.)'))return;pmDel(_pmWbsRecs(key),'WBS cleared');}
/** Create many WBS rows in two passes: rows first (to learn their ids), then
 *  parents + predecessors that point at those ids. rows[i] = {title, parent
 *  (index), duration, sne, preds:[{i,type,lag}], milestone, imsType, refs}. */
async function _pmWbsCreate(key,rows){
  var existing=_pmWbsRecs(key);
  if(existing.length&&!confirm('Replace the current WBS / IMS ('+existing.length+' rows)?'))return false;
  if(existing.length){await pmDel(existing,'Old WBS replaced');}
  var base=Date.now()%1e6;
  var payload=rows.map(function(r,i){return {projectKey:key,kind:'wbs',title:String(r.title||'Row').slice(0,500),status:r.done?'done':null,sortOrder:(i+1)*10,data:{duration:r.milestone?0:(r.duration!=null?r.duration:1),sne:r.sne||null,milestone:!!r.milestone,imsType:r.imsType||'',refs:r.refs||[],preds:[],parentId:null}};});
  _pmToast('Building '+rows.length+' rows…');
  var saved=[];for(var s=0;s<payload.length;s+=200){var part=await _trpc('pm.recordUpsertMany',{records:payload.slice(s,s+200)},'mutation');saved=saved.concat(part);}
  saved.forEach(_pmTagRec);
  var upd=[];
  rows.forEach(function(r,i){var rec=saved[i];var d=Object.assign({},rec.data||{});var ch=false;
    if(r.parent!=null&&saved[r.parent]){d.parentId=String(saved[r.parent].id);ch=true;}
    if(r.preds&&r.preds.length){d.preds=r.preds.filter(function(p){return saved[p.i];}).map(function(p){return {id:saved[p.i].id,type:p.type||'FS',lag:p.lag||0};});ch=true;}
    rec.data=d;if(ch)upd.push({id:rec.id,projectKey:key,kind:'wbs',title:rec.title,status:rec.status,sortOrder:rec.sortOrder,data:d});});
  for(var u=0;u<upd.length;u+=200)await _trpc('pm.recordUpsertMany',{records:upd.slice(u,u+200)},'mutation');
  saved.forEach(function(r){PM.records.push(r);});
  void base;return true;
}
async function pmImsGenerate(key,mode){
  var items=pmItems(key),ww=_pmWorkWeekends(key);
  if(!items.length){_pmToast('This project has no tasks to build from','warn');return;}
  var idxOf={};items.forEach(function(it,i){idxOf[it.ref]=i;});
  var durOf=function(it){return it.milestone?0:(it.start&&it.due?Math.max(1,_pmWorkBetween(it.start,it.due,ww)+1):Math.max(1,Math.round((it.est||0)/480)||1));};
  var sneOf=function(it){return it.start||(it.due?_pmAddWork(it.due,-(durOf(it)-1),ww):null);};
  var rows=[];
  if(mode==='tasks'){
    var pr=pmProject(key);rows.push({title:pr?pr.name:'Project',duration:1});
    // clusters (native) or phases (Atlas) become summary rows
    var grpName=function(it){if(it.kind==='task'&&it.src&&it.src.clusterId!=null){var cl=(D.clusters||[]).find(function(c){return String(c.id)===String(it.src.clusterId);});return cl?cl.name:null;}if(it.kind==='atlas'&&it.phase)return it.phase;return null;};
    var groups={},order=[];items.forEach(function(it){if(it.parent&&idxOf[it.parent]!=null)return;var g=grpName(it)||'';if(!groups[g]){groups[g]=[];order.push(g);}groups[g].push(it);});
    var rowOfItem={};
    var addItem=function(it,parentRow){var ri=rows.length;rowOfItem[it.ref]=ri;rows.push({title:it.title,parent:parentRow,duration:durOf(it),sne:sneOf(it),milestone:!!it.milestone,done:it.done,refs:[it.ref],_preds:it.preds});
      items.filter(function(c){return c.parent===it.ref;}).forEach(function(c){addItem(c,ri);});};
    order.forEach(function(g){var parentRow=0;if(g&&order.length>1||g){parentRow=rows.length;rows.push({title:g||'Other',parent:0,duration:1});}groups[g].forEach(function(it){addItem(it,parentRow);});});
    rows.forEach(function(r){if(r._preds)r.preds=r._preds.filter(function(p){return rowOfItem[p]!=null;}).map(function(p){return {i:rowOfItem[p]};});delete r._preds;});
    pmSetSettings(key,{imsStyle:'msp'});
  } else {
    // DoD: events = milestones (by date); work due on/before an event and after
    // the previous one becomes that event's accomplishments
    var ms=pmMilestones(key).filter(function(m){return m.date;}).sort(function(a,b){return a.date.localeCompare(b.date);});
    if(!ms.length){var last=items.map(function(i){return i.due;}).filter(Boolean).sort().pop()||_pmAddDays(_pmToday(),30);ms=[{name:'Project complete',date:last}];}
    var prevDate='0000-00-00',prevEventRow=null;
    ms.forEach(function(m,mi){
      var evRow=rows.length;rows.push({title:m.name,imsType:'event',duration:1});
      var work=items.filter(function(it){var d=it.due||it.start||'9999';return !it.milestone&&!(it.parent&&idxOf[it.parent]!=null)&&(d>prevDate&&(d<=m.date||(mi===ms.length-1)));});
      var grp={},gord=[];work.forEach(function(it){var g=(it.kind==='task'&&it.src&&it.src.clusterId!=null&&((D.clusters||[]).find(function(c){return String(c.id)===String(it.src.clusterId);})||{}).name)||(it.phase)||'Work toward '+m.name;if(!grp[g]){grp[g]=[];gord.push(g);}grp[g].push(it);});
      var accRows=[];
      gord.forEach(function(g){var saRow=rows.length;rows.push({title:g,parent:evRow,imsType:'accomplishment',duration:1});
        var acRow=rows.length;rows.push({title:g+' — complete and accepted',parent:saRow,imsType:'criteria',duration:1});
        grp[g].forEach(function(it){rows.push({title:it.title,parent:acRow,imsType:'task',duration:durOf(it),sne:sneOf(it),done:it.done,refs:[it.ref]});});
        accRows.push(acRow);});
      var mRow=rows.length;rows.push({title:m.name+' (event)',parent:evRow,imsType:'task',milestone:true,sne:m.date,preds:accRows.map(function(r){return {i:r};})});
      if(prevEventRow!=null)rows[evRow].preds=[{i:prevEventRow}];
      prevEventRow=mRow;prevDate=m.date;
    });
    pmSetSettings(key,{imsStyle:'dod'});
  }
  if(await _pmWbsCreate(key,rows)){_pmToast('Built '+rows.length+' rows — adjust durations and dependencies, then see the Schedule tab');pmRender();}
}
async function pmImsAI(key){
  var items=pmItems(key);var ms=pmMilestones(key);
  if(!items.length&&!ms.length){_pmToast('Add some tasks or milestones first','warn');return;}
  var style=pmImsStyle(key);
  _pmToast('✨ Drafting the '+(style==='dod'?'IMS':'WBS')+'…');
  var list=items.slice(0,120).map(function(i,ix){return ix+': '+i.title+(i.due?' (due '+i.due+')':'')+(i.done?' [done]':'');}).join('\n');
  var sys=style==='dod'
    ?'You are a DoD program scheduler. Organise the TASKS into an Integrated Master Schedule: Events (major reviews/milestones) → Significant Accomplishments → Accomplishment Criteria (measurable, "X complete and approved") → tasks. Use the MILESTONES as events where sensible. Every task index must appear exactly once. Return ONLY JSON {"events":[{"name":"","date":"YYYY-MM-DD or null","accomplishments":[{"name":"","criteria":[{"name":"","tasks":[task indexes],"days":[work-day duration per task, same order]}]}]}]}.'
    :'You are a project scheduler. Organise the TASKS into a work breakdown structure: 2-6 phases/deliverables (summary rows) → tasks. Estimate a duration in work days for each task and the finish-to-start dependencies between tasks. Every task index must appear exactly once. Return ONLY JSON {"phases":[{"name":"","tasks":[{"i":task index,"days":n,"after":[task indexes it depends on]}]}]}.';
  try{
    var res=await _trpc('ai.assist',{systemPrompt:sys,userContent:('PROJECT: '+_pmProjName(key)+'\nMILESTONES: '+ms.map(function(m){return m.name+(m.date?' ('+m.date+')':'');}).join('; ')+'\nTASKS:\n'+list).slice(0,7800),provider:(typeof _getAIConfig==='function'?_getAIConfig().provider:undefined)},'mutation');
    var raw=String(res&&(res.result||res.text)||'');var m=raw.match(/\{[\s\S]*\}/);if(!m)throw new Error('the AI reply was not usable');var o=JSON.parse(m[0]);
    var rows=[],used={},ww=_pmWorkWeekends(key);
    var it=function(i){return items[Number(i)];};
    if(style==='dod'){var prevEv=null;(o.events||[]).forEach(function(ev){var er=rows.length;rows.push({title:ev.name||'Event',imsType:'event',duration:1,preds:prevEv!=null?[{i:prevEv}]:[]});var acs=[];
        (ev.accomplishments||[]).forEach(function(sa){var sr=rows.length;rows.push({title:sa.name||'Accomplishment',parent:er,imsType:'accomplishment',duration:1});
          (sa.criteria||[]).forEach(function(ac){var ar=rows.length;rows.push({title:ac.name||'Criteria',parent:sr,imsType:'criteria',duration:1});acs.push(ar);
            (ac.tasks||[]).forEach(function(ti,k){var x=it(ti);if(!x||used[ti])return;used[ti]=1;rows.push({title:x.title,parent:ar,imsType:'task',duration:Math.max(1,Number((ac.days||[])[k])||1),sne:x.start||null,done:x.done,refs:[x.ref]});});});});
        var mr=rows.length;rows.push({title:(ev.name||'Event')+' (event)',parent:er,imsType:'task',milestone:true,sne:_pmIsYmd(ev.date)?ev.date:null,preds:acs.map(function(a){return {i:a};})});prevEv=mr;});
    } else {var rowOfTask={};rows.push({title:_pmProjName(key)||'Project',duration:1});
      (o.phases||[]).forEach(function(ph){var pr=rows.length;rows.push({title:ph.name||'Phase',parent:0,duration:1});(ph.tasks||[]).forEach(function(t){var x=it(t.i);if(!x||used[t.i])return;used[t.i]=1;rowOfTask[t.i]=rows.length;rows.push({title:x.title,parent:pr,duration:Math.max(1,Number(t.days)||1),sne:x.start||null,done:x.done,refs:[x.ref],_after:t.after||[]});});});
      rows.forEach(function(r){if(r._after){r.preds=r._after.map(function(a){return rowOfTask[a]!=null?{i:rowOfTask[a]}:null;}).filter(Boolean);delete r._after;}});}
    var missing=items.filter(function(x,i){return i<120&&!used[i];});
    if(missing.length){var mr2=rows.length;rows.push({title:'Not yet placed',parent:style==='dod'?null:0,imsType:style==='dod'?'event':'',duration:1});missing.forEach(function(x){rows.push({title:x.title,parent:mr2,imsType:'task',duration:1,refs:[x.ref],done:x.done});});}
    if(await _pmWbsCreate(key,rows)){_pmToast('Drafted '+rows.length+' rows — review them');pmRender();}
  }catch(e){_pmToast('AI draft failed: '+String(e&&e.message||e).slice(0,140),'error');}
}
function _pmImsRows(key){
  var ord=_pmWbsOrdered(key),codes=pmWbsCodes(key),c=pmCpm(key),style=pmImsStyle(key);
  var byKey={};c.nodes.forEach(function(n){byKey[n.key]=n;});var rowOf={};ord.forEach(function(w,i){rowOf[String(w.rec.id)]=i+1;rowOf[w.rec._lk]=i+1;});
  return {style:style,cpm:c,rows:ord.map(function(w,i){var r=w.rec,d=r.data||{},n=byKey['wbs:'+(r.id||r._lk)]||{};var it=(d.refs||[])[0]?pmItem(d.refs[0],key):null;
    return {id:i+1,uid:i+1,rec:r,depth:w.depth,code:codes[r._lk]||'',name:r.title||'',type:style==='dod'?PM_IMS_TYPES[d.imsType||'task']:(n.summary?'Summary':(d.milestone?'Milestone':'Task')),
      dur:n.summary?Math.max(0,(n.ef||0)-(n.es||0)):(d.milestone?0:Number(d.duration)||0),start:n.start,finish:n.finish,preds:_pmPredText(r,rowOf),predList:(d.preds||[]).map(function(p){return {row:rowOf[String(p.id)],type:p.type||'FS',lag:p.lag||0};}).filter(function(p){return p.row;}),
      float:n.summary?'':n.float,critical:!!n.critical,summary:!!n.summary,milestone:!!d.milestone,pct:r.status==='done'?100:(Number(d.pct)||0),sne:d.sne||'',linked:it?it.title:''};})};
}
async function pmImsExport(key,fmt){
  var X=_pmImsRows(key);if(!X.rows.length){_pmToast('Nothing to export yet','warn');return;}
  var name=(X.style==='dod'?'IMS':'WBS')+' - '+(_pmProjName(key)||'project');
  var head=['ID',X.style==='dod'?'IMS #':'WBS','Name','Type','Duration (work days)','Start','Finish','Predecessors','Total float','Critical','% complete','Linked task'];
  var body=X.rows.map(function(r){return [r.id,r.code,'  '.repeat(r.depth)+r.name,r.type,r.dur,r.start,r.finish,r.preds,r.float,r.critical?'yes':'',r.pct,r.linked];});
  if(fmt==='csv'){_pmDownload(name+'.csv',_pmCsv([head].concat(body)),'text/csv');return;}
  if(fmt==='xlsx'){await _pmXlsx(name+'.xlsx',[{name:X.style==='dod'?'IMS':'WBS',rows:[head].concat(body),cols:[{wch:5},{wch:9},{wch:50},{wch:22},{wch:10},{wch:11},{wch:11},{wch:14},{wch:9},{wch:8},{wch:9},{wch:30}]}]);return;}
  _pmDownload(name+'.xml',pmMspdiXml(key,X),'application/xml');
  _pmToast('Saved MS Project XML — open it in Microsoft Project (File → Open → XML)');
}
/** Microsoft Project XML (MSPDI). Work days of 8h; links FS=1, SS=3, FF=0, SF=2;
 *  lag in tenths of minutes; "start no earlier than" → ConstraintType 4. */
function pmMspdiXml(key,X){
  var x=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
  var dt=function(ymd,end){return ymd?ymd+(end?'T17:00:00':'T08:00:00'):'';};
  var typ={FF:0,FS:1,SF:2,SS:3};
  var out=['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>','<Project xmlns="http://schemas.microsoft.com/project">',
    '<SaveVersion>14</SaveVersion><Name>'+x(_pmProjName(key))+'</Name><Title>'+x(_pmProjName(key))+'</Title><ScheduleFromStart>1</ScheduleFromStart><StartDate>'+dt(X.cpm.start)+'</StartDate><FinishDate>'+dt(X.cpm.finish,true)+'</FinishDate>',
    '<MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime><CalendarUID>1</CalendarUID>',
    '<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>'+[1,2,3,4,5,6,7].map(function(d){var work=d>=2&&d<=6;return '<WeekDay><DayType>'+d+'</DayType><DayWorking>'+(work?1:0)+'</DayWorking>'+(work?'<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>':'')+'</WeekDay>';}).join('')+'</WeekDays></Calendar></Calendars>',
    '<Tasks><Task><UID>0</UID><ID>0</ID><Name>'+x(_pmProjName(key))+'</Name><OutlineLevel>0</OutlineLevel><OutlineNumber>0</OutlineNumber><Summary>1</Summary><Start>'+dt(X.cpm.start)+'</Start><Finish>'+dt(X.cpm.finish,true)+'</Finish></Task>'];
  X.rows.forEach(function(r){
    out.push('<Task><UID>'+r.uid+'</UID><ID>'+r.id+'</ID><Name>'+x(r.name)+'</Name><WBS>'+x(r.code)+'</WBS><OutlineNumber>'+x(r.code||r.id)+'</OutlineNumber><OutlineLevel>'+(r.depth+1)+'</OutlineLevel>'+
      '<Start>'+dt(r.start)+'</Start><Finish>'+dt(r.finish,true)+'</Finish><Duration>PT'+(r.dur*8)+'H0M0S</Duration><DurationFormat>7</DurationFormat>'+
      '<Milestone>'+(r.milestone?1:0)+'</Milestone><Summary>'+(r.summary?1:0)+'</Summary><PercentComplete>'+r.pct+'</PercentComplete><Manual>0</Manual>'+
      (r.sne&&!r.summary?'<ConstraintType>4</ConstraintType><ConstraintDate>'+dt(r.sne)+'</ConstraintDate>':'<ConstraintType>0</ConstraintType>')+
      (X.style==='dod'?'<Notes>'+x(r.type+' '+r.code)+'</Notes>':'')+
      r.predList.map(function(p){return '<PredecessorLink><PredecessorUID>'+p.row+'</PredecessorUID><Type>'+(typ[p.type]!=null?typ[p.type]:1)+'</Type><LinkLag>'+(Number(p.lag)||0)*4800+'</LinkLag><LagFormat>7</LagFormat></PredecessorLink>';}).join('')+'</Task>');
  });
  out.push('</Tasks></Project>');
  return out.join('\n');
}
function pmImsPrint(key){
  var X=_pmImsRows(key);
  _pmPrint((X.style==='dod'?'Integrated Master Schedule':'Work Breakdown Structure')+' — '+_pmProjName(key),'<table><thead><tr><th>ID</th><th>'+(X.style==='dod'?'IMS #':'WBS')+'</th><th>Name</th>'+(X.style==='dod'?'<th>Type</th>':'')+'<th>Days</th><th>Start</th><th>Finish</th><th>Pred.</th><th>Float</th></tr></thead><tbody>'+
    X.rows.map(function(r){return '<tr style="'+(r.summary?'font-weight:700':'')+(r.critical?';color:#b91c1c':'')+'"><td>'+r.id+'</td><td>'+_pmE(r.code)+'</td><td style="padding-left:'+(6+r.depth*14)+'px">'+(r.milestone?'◆ ':'')+_pmE(r.name)+'</td>'+(X.style==='dod'?'<td>'+_pmE(r.type)+'</td>':'')+'<td>'+r.dur+'</td><td>'+_pmE(r.start)+'</td><td>'+_pmE(r.finish)+'</td><td>'+_pmE(r.preds)+'</td><td>'+_pmE(r.float)+'</td></tr>';}).join('')+'</tbody></table><p class="muted">Red rows are on the critical path. Durations in work days.</p>');
}

// ═══ RESOURCES (phase 4) ════════════════════════════════════════════════════
// Load per person per week (hours) = allocations (kind 'alloc') + estimated
// hours of open work they own (delegated to them, or assigned) spread over the
// work weeks it runs, vs their weekly capacity. Atlas members' planned
// allocations show alongside for Atlas projects.
function _pmMonday(ymd){var d=new Date(ymd+'T12:00:00');var w=d.getDay();d.setDate(d.getDate()-((w+6)%7));return _pmYmd(d);}
function _pmItemOwnerKey(it){
  var dl=pmDelegationFor(it.ref);if(dl&&dl.data&&dl.data.personKey)return dl.data.personKey;
  if(it.kind==='task'&&it.src){var t=it.src;if(t.primaryAssigneeId!=null)return 'u:'+t.primaryAssigneeId;if(Array.isArray(t.assignees)&&t.assignees.length)return 'u:'+t.assignees[0];if(t.assignedTo){var p=pmFindPersonByName(t.assignedTo);if(p)return p.key;}return _pmMe().key;}
  return null;
}
function pmResourceLoad(key,weeks){
  weeks=weeks||12;var w0=_pmMonday(_pmToday());var cols=[];for(var i=0;i<weeks;i++)cols.push(_pmAddDays(w0,i*7));
  var keys=key==='all'?pmProjects().map(function(p){return p.key;}):[key];
  var rows={};var row=function(pk,name){if(!rows[pk])rows[pk]={key:pk,name:name||pmPersonName(pk),cap:pmPersonCapacity(pk),h:cols.map(function(){return 0;}),src:cols.map(function(){return [];})};return rows[pk];};
  var add=function(pk,name,from,to,hoursPerWeek,label){if(!pk||!hoursPerWeek)return;var r=row(pk,name);cols.forEach(function(c,i){var end=_pmAddDays(c,6);if((!from||from<=end)&&(!to||to>=c)){r.h[i]+=hoursPerWeek;r.src[i].push({label:label,h:hoursPerWeek});}});};
  var unest=0;
  keys.forEach(function(pkey){
    var pname=_pmProjName(pkey);
    pmRecs('alloc',pkey).forEach(function(a){var d=a.data||{};var hpw=d.unit==='pct'?(Number(d.amount)||0)/100*pmPersonCapacity(d.personKey):(Number(d.amount)||0);add(d.personKey,null,d.from,d.to,hpw,pname+(d.role?' · '+d.role:'')+' (allocation)');});
    pmItems(pkey).filter(function(it){return !it.done&&it.kind!=='atlas';}).forEach(function(it){
      var pk=_pmItemOwnerKey(it);if(!pk)return;
      var hrs=(Number(it.est)||0)/60;if(!hrs){unest++;return;}
      var s=it.start||_pmToday(),f=it.due||it.start||_pmToday();if(f<_pmToday())f=_pmToday();if(s>f)s=f;
      var wk=Math.max(1,Math.ceil((_pmDays(_pmMonday(s),_pmMonday(f))+7)/7));
      add(pk,null,s,f,hrs/wk,pname+' · '+it.title);
    });
    if(pkey.indexOf('atlas:')===0&&pmSettings('').atlasPeople!==false){
      var a=_pmAtlas(),aid=pkey.slice(6);
      ((a&&a.departments)||[]).forEach(function(dep){(dep.members||[]).forEach(function(m){
        var on=(m.projects||[]).map(function(x){return typeof x==='string'?{id:x}:x;}).find(function(x){return String(x.id)===aid;});
        var sched=(m.allocSchedule||[]).filter(function(s){return String(s.projectId)===aid;});
        if(sched.length)sched.forEach(function(s){add('atlas:m:'+m.id,m.name+' (Atlas)',s.start,s.end,(Number(s.pct)||0)/100*40,pname+' (Atlas plan)');});
        else if(on)add('atlas:m:'+m.id,m.name+' (Atlas)',null,null,(Number(on.pct)||100)/100*40,pname+' (Atlas plan)');
      });});
    }
  });
  var list=Object.keys(rows).map(function(k){return rows[k];}).sort(function(a,b){return Math.max.apply(null,b.h)-Math.max.apply(null,a.h);});
  return {cols:cols,rows:list,unestimated:unest};
}
function pmTab_resources(key){
  var L=pmResourceLoad(key,12);var allocs=key==='all'?pmRecs('alloc'):pmRecs('alloc',key);
  var html='<div class="pm-bar"><button class="btn btn-p" onclick="pmAllocDialog(\''+_pmJ(key)+'\')">'+_pmIcon('plus',14,'#fff')+' Allocate someone</button><span class="pm-muted">Hours per week vs capacity. Work counts when it has an estimate (task drawer → Estimate)'+(L.unestimated?' — '+L.unestimated+' open item'+(L.unestimated===1?' has':'s have')+' none':'')+'.</span></div>';
  if(!L.rows.length)return html+'<div class="pm-card pm-empty"><b>No load yet</b>Allocate people to the project, or give tasks estimates and owners.</div>';
  var cell=function(h,cap,click){if(!h)return '<td class="pm-heatcell pm-muted" style="cursor:pointer" onclick="'+click+'">·</td>';var p=cap?h/cap:0;var c=p>1?'#dc2626':p>=0.8?'#d97706':'#16a34a';return '<td class="pm-heatcell" onclick="'+click+'" style="cursor:pointer;background:color-mix(in srgb,'+c+' '+Math.min(60,Math.round(15+p*35))+'%,transparent);color:var(--t1)" title="'+Math.round(h)+'h of '+cap+'h">'+Math.round(p*100)+'%</td>';};
  html+='<div class="pm-card pm-scroll" style="padding:0"><table class="pm-table"><thead><tr><th>Person</th><th>Capacity</th>'+L.cols.map(function(c){return '<th style="text-align:center">'+_pmDate(c)+'</th>';}).join('')+'</tr></thead><tbody>'+
    L.rows.map(function(r,ri){var over=r.h.some(function(h){return h>r.cap;});return '<tr><td><b>'+_pmE(r.name)+'</b>'+(over?' '+_pmPill('over','#dc2626'):'')+'</td><td class="pm-muted">'+r.cap+'h</td>'+r.h.map(function(h,i){return cell(h,r.cap,'pmResCell(\''+_pmJ(key)+'\','+ri+','+i+')');}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
  if(allocs.length)html+='<div class="pm-card pm-scroll" style="margin-top:12px;padding:0"><div class="pm-h" style="padding:12px 14px 0">Allocations</div><table class="pm-table"><thead><tr><th>Person</th>'+(key==='all'?'<th>Project</th>':'')+'<th>Role</th><th>Amount</th><th>From</th><th>To</th></tr></thead><tbody>'+allocs.map(function(a){var d=a.data||{};
    return '<tr class="clk" onclick="pmAllocDialog(\''+_pmJ(a.projectKey)+'\','+a.id+')"><td><b>'+_pmE(pmPersonName(d.personKey))+'</b></td>'+(key==='all'?'<td class="pm-muted">'+_pmE(_pmProjName(a.projectKey))+'</td>':'')+'<td>'+_pmE(d.role||'')+'</td><td>'+(d.unit==='pct'?d.amount+'%':d.amount+' h/wk')+'</td><td class="pm-muted">'+(d.from?_pmDate(d.from):'—')+'</td><td class="pm-muted">'+(d.to?_pmDate(d.to):'—')+'</td></tr>';}).join('')+'</tbody></table></div>';
  return html;
}
function pmResCell(key,ri,ci){
  var L=pmResourceLoad(key,12);var r=L.rows[ri];if(!r)return;var src=r.src[ci]||[];
  pmModal('<h3>'+_pmE(r.name)+' · week of '+_pmDate(L.cols[ci])+'<button class="x" onclick="pmCloseModal()">×</button></h3><div class="pm-muted" style="margin-bottom:8px">'+Math.round(r.h[ci])+'h of '+r.cap+'h capacity</div>'+
    (src.length?'<table class="pm-table"><tbody>'+src.map(function(s){return '<tr><td>'+_pmE(s.label)+'</td><td style="text-align:right">'+(Math.round(s.h*10)/10)+'h</td></tr>';}).join('')+'</tbody></table>':'<div class="pm-muted">Nothing booked.</div>')+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Close</button></div>');
}
function pmAllocDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};var all=key==='all'&&!r;
  pmModal('<h3>'+_pmIcon('barChart',18)+' Allocation<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    (all?'<div class="pm-row"><label>Project</label><select class="inp" id="pma-proj">'+pmProjects().map(function(p){return '<option value="'+_pmE(p.key)+'">'+_pmE(p.name)+'</option>';}).join('')+'</select></div>':'')+
    '<div class="pm-row"><label>Person</label>'+pmPersonSelect('pma-person',d.personKey||'')+'</div>'+
    '<div class="pm-row"><label>Role</label><input class="inp" id="pma-role" value="'+_pmE(d.role||'')+'" placeholder="e.g. Analyst, Developer"></div>'+
    '<div class="pm-row"><label>Amount</label><div style="display:flex;gap:6px"><input class="inp" type="number" id="pma-amt" value="'+_pmE(d.amount!=null?d.amount:50)+'" style="width:100px"><select class="inp" id="pma-unit" style="width:auto"><option value="pct"'+(d.unit!=='hours'?' selected':'')+'>% of their week</option><option value="hours"'+(d.unit==='hours'?' selected':'')+'>hours per week</option></select></div></div>'+
    '<div class="pm-row"><label>From</label><input class="inp" type="date" id="pma-from" value="'+_pmE(d.from||_pmToday())+'"></div>'+
    '<div class="pm-row"><label>To</label><input class="inp" type="date" id="pma-to" value="'+_pmE(d.to||'')+'"></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Allocation removed\')">Remove</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pma-save">Save</button></div>');
  var wire=function(){pmWirePersonSelect('pma-person');document.getElementById('pma-save').onclick=function(){
    var v=function(x){var e=document.getElementById(x);return e?e.value:'';};var pk=v('pma-person');if(!pk||pk==='__new'){_pmToast('Choose a person','warn');return;}
    var rec=r||pmNew('alloc',all?v('pma-proj'):key,{data:{}});rec.title=pmPersonName(pk);
    rec.data=Object.assign({},rec.data,{personKey:pk,role:v('pma-role'),amount:Number(v('pma-amt'))||0,unit:v('pma-unit'),from:v('pma-from')||null,to:v('pma-to')||null});
    pmCloseModal(true);pmPut(rec);pmRender();};};
  wire();document.getElementById('pm-modal')._handlers=wire;
}

// ═══ BUDGET + EARNED VALUE (phase 4) ════════════════════════════════════════
var PM_COST_CATS=['Labor','Subcontract','Software','Hardware','Travel','Materials','Training','Other'];
function _pmLaborCost(key){
  var s=pmSettings(key),g=pmSettings('');if(!s.laborFromTime)return {cost:0,hours:0};
  var rate=Number(s.myRate||g.myRate||g.defaultRate)||0;if(!rate)return {cost:0,hours:0};
  var refs={};pmItems(key).forEach(function(i){if(i.kind==='task')refs[String(i.id)]=1;else if(i.kind==='external')refs[String(i.id)]=1;});
  var mins=(Array.isArray(D.timeEntries)?D.timeEntries:[]).filter(function(e){return refs[String(e.taskId)];}).reduce(function(s2,e){return s2+(Number(e.durationMins)||0);},0);
  return {cost:mins/60*rate,hours:mins/60};
}
function pmEvm(key){
  if(!key||key==='all')return null;
  var lines=pmRecs('budgetline',key),costs=pmRecs('cost',key);
  var cr=pmRecs('change',key).filter(function(r){return r.status==='approved'||r.status==='implemented';}).reduce(function(s,r){return s+(Number((r.data||{}).costImpact)||0);},0);
  var bac=lines.reduce(function(s,r){return s+(Number((r.data||{}).amount)||0);},0)+cr;
  var labor=_pmLaborCost(key);
  var ac=costs.reduce(function(s,r){return s+(Number((r.data||{}).amount)||0);},0)+labor.cost;
  if(!bac&&!ac)return {bac:0,ac:0,ev:0,pv:0};
  var c=pmCpm(key),today=_pmToday(),leaves=c.nodes.filter(function(n){return !n.summary;});
  var base=_pmActiveBaseline(key);
  var tot=leaves.reduce(function(s,n){return s+Math.max(1,n.dur);},0)||1;
  var planned=leaves.reduce(function(s,n){var b=base&&base.data.nodes&&base.data.nodes[n.key];var st=b?b.start:n.start,fi=b?b.finish:n.finish;if(!st||!fi)return s;
    var span=Math.max(1,_pmDays(st,fi)+1),el=Math.min(span,Math.max(0,_pmDays(st,today)+1));return s+Math.max(1,n.dur)*(el/span);},0)/tot;
  var earned=leaves.reduce(function(s,n){return s+Math.max(1,n.dur)*((n.done?100:(n.pct||0))/100);},0)/tot;
  var pv=bac*planned,ev=bac*earned;
  var cpi=ac>0?ev/ac:null,spi=pv>0?ev/pv:null,eac=cpi?bac/cpi:(ac+(bac-ev)),etc=eac-ac;
  return {bac:bac,ac:ac,ev:ev,pv:pv,cpi:cpi,spi:spi,eac:eac,etc:etc,vac:bac-eac,tcpi:(bac-ac)>0?(bac-ev)/(bac-ac):null,planned:planned,earned:earned,labor:labor,crCost:cr,start:c.start,finish:c.finish};
}
function _pmEvmSnap(key,ev){
  if(!ev||!ev.bac)return;var snaps=pmRecs('evmsnap',key);var today=_pmToday();
  var last=snaps.map(function(s){return (s.data||{}).date;}).sort().pop();
  if(last&&_pmDays(last,today)<6)return;
  pmPut(pmNew('evmsnap',key,{data:{date:today,pv:Math.round(ev.pv),ev:Math.round(ev.ev),ac:Math.round(ev.ac),bac:Math.round(ev.bac)}}));
}
function _pmSCurve(key,ev){
  var snaps=pmRecs('evmsnap',key).map(function(s){return s.data||{};}).filter(function(s){return s.date;}).sort(function(a,b){return a.date.localeCompare(b.date);});
  var start=ev.start||_pmToday(),fin=ev.finish||_pmAddDays(start,30);if(fin<=start)fin=_pmAddDays(start,30);
  var W=620,H=220,pl=56,pr=12,pt=12,pb=26;var span=Math.max(1,_pmDays(start,fin));
  var maxY=Math.max(ev.bac,ev.eac||0,ev.ac,1)*1.08;
  var X=function(d){return pl+Math.max(0,Math.min(1,_pmDays(start,d)/span))*(W-pl-pr);},Y=function(v){return H-pb-(v/maxY)*(H-pt-pb);};
  var pvPts=[];for(var i=0;i<=20;i++){var d=_pmAddDays(start,Math.round(span*i/20));pvPts.push(X(d)+','+Y(ev.bac*(i/20)));}
  var line=function(arr,key2){return arr.filter(function(s){return s[key2]!=null;}).map(function(s){return X(s.date)+','+Y(s[key2]);}).join(' ');};
  var pts=snaps.concat([{date:_pmToday(),pv:ev.pv,ev:ev.ev,ac:ev.ac}]);
  var tk=[0,0.25,0.5,0.75,1].map(function(f){var v=maxY*f;return '<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(v)+'" y2="'+Y(v)+'" stroke="var(--bd1)"/><text x="'+(pl-6)+'" y="'+(Y(v)+4)+'" font-size="10" fill="var(--t3)" text-anchor="end">'+_pmMoney(v).replace('$','$')+'</text>';}).join('');
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;max-height:260px">'+tk+
    '<polyline points="'+pvPts.join(' ')+'" fill="none" stroke="#94a3b8" stroke-dasharray="4 3" stroke-width="1.5"><title>Planned value (straight-line plan)</title></polyline>'+
    '<polyline points="'+line(pts,'pv')+'" fill="none" stroke="#2563eb" stroke-width="2"><title>Planned value</title></polyline>'+
    '<polyline points="'+line(pts,'ev')+'" fill="none" stroke="#16a34a" stroke-width="2"><title>Earned value</title></polyline>'+
    '<polyline points="'+line(pts,'ac')+'" fill="none" stroke="#dc2626" stroke-width="2"><title>Actual cost</title></polyline>'+
    '<line x1="'+X(_pmToday())+'" x2="'+X(_pmToday())+'" y1="'+pt+'" y2="'+(H-pb)+'" stroke="var(--t3)" stroke-dasharray="2 3"/>'+
    '<text x="'+pl+'" y="'+(H-8)+'" font-size="10" fill="var(--t3)">'+_pmDate(start)+'</text><text x="'+(W-pr)+'" y="'+(H-8)+'" font-size="10" fill="var(--t3)" text-anchor="end">'+_pmDate(fin)+'</text>'+
    '</svg><div class="pm-muted" style="display:flex;gap:14px;flex-wrap:wrap"><span><b style="color:#2563eb">━</b> Planned value</span><span><b style="color:#16a34a">━</b> Earned value</span><span><b style="color:#dc2626">━</b> Actual cost</span><span><b style="color:#94a3b8">┅</b> Budget line</span><span>A point is saved each week, so the curves fill in over time.</span></div>';
}
function pmTab_budget(key){
  var ev=pmEvm(key),lines=pmRecs('budgetline',key),costs=pmRecs('cost',key).slice().sort(function(a,b){return String((b.data||{}).date||'').localeCompare(String((a.data||{}).date||''));});
  var html='<div class="pm-bar"><button class="btn btn-p" onclick="pmBudgetLineDialog(\''+_pmJ(key)+'\')">＋ Budget line</button><button class="btn btn-s" onclick="pmCostDialog(\''+_pmJ(key)+'\')">＋ Actual cost</button><span class="sp"></span><button class="btn btn-s" onclick="pmBudgetExport(\''+_pmJ(key)+'\')">Excel</button></div>';
  var pr=pmProject(key);
  if(pr&&pr.source==='atlas'){var p=pr.rec;var clins=(p.clins||[]);html+='<div class="pm-card" style="margin-bottom:12px"><div class="pm-h">'+_pmIcon('map',15)+' From Atlas (read-only)</div><div class="pm-kpis" style="margin:0">'+
    '<div class="pm-kpi"><b>'+_pmMoney(p.revenue)+'</b><span>Revenue</span></div>'+(p.targetRevenue?'<div class="pm-kpi"><b>'+_pmMoney(p.targetRevenue)+'</b><span>Target revenue</span></div>':'')+(p.potential?'<div class="pm-kpi"><b>'+_pmE(p.potential)+'</b><span>Potential</span></div>':'')+
    '<div class="pm-kpi"><b>'+_pmMoney(_pmAtlasTeamCost(p.id))+'</b><span>Team cost / month (Atlas plan)</span></div></div>'+(clins.length?'<table class="pm-table" style="margin-top:8px"><thead><tr><th>CLIN</th><th>Title</th><th>Revenue</th></tr></thead><tbody>'+clins.map(function(c){return '<tr><td>'+_pmE(c.number)+'</td><td>'+_pmE(c.title)+'</td><td>'+_pmMoney(c.revenue)+'</td></tr>';}).join('')+'</tbody></table>':'')+'</div>';}
  if(!ev||(!ev.bac&&!ev.ac))return html+'<div class="pm-card pm-empty"><b>No budget yet</b>Add budget lines (planned spend by category) and log actual costs. LevelUp then works out earned value: are you getting the work you are paying for (CPI), and are you on schedule (SPI)?'+(pmSettings(key).laborFromTime?'':'<br><br>Tip: Settings → “Count my tracked time as labor” turns your timer into labor cost.')+'</div>';
  _pmEvmSnap(key,ev);
  var k=function(v,l,c,t){return '<div class="pm-kpi" title="'+_pmE(t||'')+'"><b'+(c?' style="color:'+c+'"':'')+'>'+v+'</b><span>'+l+'</span></div>';};
  var good=function(x){return x==null?null:x>=1?'#16a34a':x>=0.9?'#d97706':'#dc2626';};
  html+='<div class="pm-kpis">'+k(_pmMoney(ev.bac),'Budget at completion',null,'Budget lines'+(ev.crCost?' + '+_pmMoney(ev.crCost)+' approved changes':''))+k(_pmMoney(ev.pv),'Planned value','','What should have been earned by today ('+Math.round(ev.planned*100)+'% of the plan)')+
    k(_pmMoney(ev.ev),'Earned value','','Value of work actually done ('+Math.round(ev.earned*100)+'% complete)')+k(_pmMoney(ev.ac),'Actual cost','','Costs logged'+(ev.labor.cost?' + '+_pmMoney(ev.labor.cost)+' labor from '+Math.round(ev.labor.hours)+'h tracked':''))+
    k(ev.cpi!=null?ev.cpi.toFixed(2):'—','CPI',good(ev.cpi),'Earned ÷ actual. Below 1 = over budget for the work done')+k(ev.spi!=null?ev.spi.toFixed(2):'—','SPI',good(ev.spi),'Earned ÷ planned. Below 1 = behind schedule')+
    k(_pmMoney(ev.eac),'Estimate at completion',ev.eac>ev.bac?'#dc2626':null,'Budget ÷ CPI')+k(_pmMoney(ev.vac),'Variance at completion',ev.vac<0?'#dc2626':'#16a34a','Budget − estimate at completion')+'</div>';
  html+='<div class="pm-card" style="margin-bottom:12px"><div class="pm-h">'+_pmIcon('activity',15)+' Earned value over time</div>'+_pmSCurve(key,ev)+'</div>';
  var byCat={};lines.forEach(function(r){var d=r.data||{};var c=d.category||'Other';(byCat[c]=byCat[c]||{plan:0,act:0}).plan+=Number(d.amount)||0;});
  costs.forEach(function(r){var d=r.data||{};var c=d.category||'Other';(byCat[c]=byCat[c]||{plan:0,act:0}).act+=Number(d.amount)||0;});
  if(ev.labor.cost)(byCat.Labor=byCat.Labor||{plan:0,act:0}).act+=ev.labor.cost;
  html+='<div class="pm-grid2"><div class="pm-card pm-scroll" style="padding:0"><div class="pm-h" style="padding:12px 14px 0">By category</div><table class="pm-table"><thead><tr><th>Category</th><th>Planned</th><th>Actual</th><th>Left</th></tr></thead><tbody>'+Object.keys(byCat).sort().map(function(c){var x=byCat[c];return '<tr><td>'+_pmE(c)+'</td><td>'+_pmMoney(x.plan)+'</td><td>'+_pmMoney(x.act)+'</td><td style="color:'+(x.plan-x.act<0?'#dc2626':'inherit')+'">'+_pmMoney(x.plan-x.act)+'</td></tr>';}).join('')+'</tbody></table></div>'+
    '<div class="pm-card pm-scroll" style="padding:0"><div class="pm-h" style="padding:12px 14px 0">Budget lines</div>'+(lines.length?'<table class="pm-table"><thead><tr><th>Line</th><th>Category</th><th>Amount</th></tr></thead><tbody>'+lines.map(function(r){var d=r.data||{};return '<tr class="clk" onclick="pmBudgetLineDialog(\''+_pmJ(key)+'\','+r.id+')"><td>'+_pmE(r.title)+'</td><td>'+_pmE(d.category||'')+'</td><td>'+_pmMoney(d.amount)+'</td></tr>';}).join('')+'</tbody></table>':'<div class="pm-empty" style="padding:14px">No lines yet.</div>')+'</div></div>';
  html+='<div class="pm-card pm-scroll" style="margin-top:12px;padding:0"><div class="pm-h" style="padding:12px 14px 0">Actual costs</div>'+(costs.length?'<table class="pm-table"><thead><tr><th>Date</th><th>What</th><th>Category</th><th>Amount</th></tr></thead><tbody>'+costs.map(function(r){var d=r.data||{};return '<tr class="clk" onclick="pmCostDialog(\''+_pmJ(key)+'\','+r.id+')"><td class="pm-muted">'+_pmDate(d.date)+'</td><td>'+_pmE(r.title)+'</td><td>'+_pmE(d.category||'')+'</td><td>'+_pmMoney(d.amount)+'</td></tr>';}).join('')+'</tbody></table>':'<div class="pm-empty" style="padding:14px">No costs logged yet.</div>')+'</div>';
  return html;
}
function _pmAtlasTeamCost(aid){
  var a=_pmAtlas();var sum=0;((a&&a.departments)||[]).forEach(function(dep){(dep.members||[]).forEach(function(m){var on=(m.projects||[]).map(function(x){return typeof x==='string'?{id:x}:x;}).find(function(x){return String(x.id)===String(aid);});if(on)sum+=(Number(m.cost)||0)*((Number(on.pct)||100)/100);});});
  return sum;
}
function pmBudgetLineDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  pmModal('<h3>'+_pmIcon('target',18)+' Budget line<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Line</label><input class="inp" id="pmb-t" value="'+_pmE(r?r.title:'')+'" placeholder="e.g. Developer hours, AWS hosting"></div>'+
    '<div class="pm-row"><label>Category</label><select class="inp" id="pmb-c">'+PM_COST_CATS.map(function(c){return '<option'+(c===(d.category||'Labor')?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Planned amount ($)</label><input class="inp" type="number" id="pmb-a" value="'+_pmE(d.amount||'')+'"></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Budget line deleted\')">Delete</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmb-save">Save</button></div>');
  document.getElementById('pmb-save').onclick=function(){var t=document.getElementById('pmb-t').value.trim();if(!t)return;var rec=r||pmNew('budgetline',key,{data:{}});rec.title=t;rec.data=Object.assign({},rec.data,{category:document.getElementById('pmb-c').value,amount:Number(document.getElementById('pmb-a').value)||0});pmCloseModal(true);pmPut(rec);pmRender();};
}
function pmCostDialog(key,id){
  var r=id?pmRec(id):null,d=r?(r.data||{}):{};
  pmModal('<h3>'+_pmIcon('target',18)+' Actual cost<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>What</label><input class="inp" id="pmk-t" value="'+_pmE(r?r.title:'')+'" placeholder="e.g. Invoice #1042 — subcontractor"></div>'+
    '<div class="pm-row"><label>Date</label><input class="inp" type="date" id="pmk-d" value="'+_pmE(d.date||_pmToday())+'"></div>'+
    '<div class="pm-row"><label>Category</label><select class="inp" id="pmk-c">'+PM_COST_CATS.map(function(c){return '<option'+(c===(d.category||'Other')?' selected':'')+'>'+c+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Amount ($)</label><input class="inp" type="number" id="pmk-a" value="'+_pmE(d.amount||'')+'"></div>'+
    '<div class="pm-acts">'+(r?'<button class="btn btn-s" style="margin-right:auto;color:#dc2626" onclick="pmCloseModal();pmDel(pmRec('+r.id+'),\'Cost deleted\')">Delete</button>':'')+'<button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmk-save">Save</button></div>');
  document.getElementById('pmk-save').onclick=function(){var t=document.getElementById('pmk-t').value.trim();if(!t)return;var rec=r||pmNew('cost',key,{data:{}});rec.title=t;rec.data=Object.assign({},rec.data,{date:document.getElementById('pmk-d').value,category:document.getElementById('pmk-c').value,amount:Number(document.getElementById('pmk-a').value)||0});pmCloseModal(true);pmPut(rec);pmRender();};
}
async function pmBudgetExport(key){
  var ev=pmEvm(key)||{};
  await _pmXlsx('Budget - '+_pmProjName(key)+'.xlsx',[
    {name:'Earned value',rows:[['Measure','Value'],['Budget at completion (BAC)',Math.round(ev.bac||0)],['Planned value (PV)',Math.round(ev.pv||0)],['Earned value (EV)',Math.round(ev.ev||0)],['Actual cost (AC)',Math.round(ev.ac||0)],['CPI',ev.cpi!=null?+ev.cpi.toFixed(3):''],['SPI',ev.spi!=null?+ev.spi.toFixed(3):''],['Estimate at completion (EAC)',Math.round(ev.eac||0)],['Estimate to complete (ETC)',Math.round(ev.etc||0)],['Variance at completion (VAC)',Math.round(ev.vac||0)],['TCPI',ev.tcpi!=null?+ev.tcpi.toFixed(3):'']]},
    {name:'Budget lines',rows:[['Line','Category','Amount']].concat(pmRecs('budgetline',key).map(function(r){var d=r.data||{};return [r.title,d.category,d.amount];}))},
    {name:'Actual costs',rows:[['Date','What','Category','Amount']].concat(pmRecs('cost',key).map(function(r){var d=r.data||{};return [d.date,r.title,d.category,d.amount];}))},
  ]);
}

// ═══ PEOPLE (directory, both sources) ═══════════════════════════════════════
function pmTab_people(){
  var src=pmPeopleSource(),all=pmPeopleAll({allSources:true}),today=_pmToday();
  var dl=pmRecs('delegation').filter(_pmDlgOpen);
  var html='<div class="pm-bar"><span class="pm-muted">Offer people from</span>'+[['both','Both lists'],['separate','Project people list only'],['contacts','My Contacts only']].map(function(o){return '<button class="pm-chip'+(src===o[0]?' on':'')+'" onclick="pmSetSettings(\'\',{peopleSource:\''+o[0]+'\'});pmRender()">'+o[1]+'</button>';}).join('')+
    '<span class="sp"></span><button class="btn btn-p" onclick="pmNewPersonDialog().then(function(){pmRender()})">'+_pmIcon('plus',14,'#fff')+' Add person</button></div>'+
    '<div class="pm-muted" style="margin-bottom:8px">Team members are your LevelUp accounts. The project people list holds people outside LevelUp (clients, contractors) without cluttering Contacts. Contacts are your address book. Rates and weekly capacity feed Resources and Budget.</div>';
  html+='<div class="pm-card pm-scroll" style="padding:0"><table class="pm-table"><thead><tr><th>Name</th><th>From</th><th>Email</th><th>Organisation</th><th>Rate</th><th>Capacity</th><th>Waiting on them</th><th></th></tr></thead><tbody>'+all.map(function(p){
    var mine=dl.filter(function(r){return (r.data||{}).personKey===p.key;}),late=mine.filter(function(r){return _pmDlgLate(r,today);}).length;
    return '<tr><td><b>'+_pmE(p.name)+'</b>'+(p.title?'<div class="pm-muted">'+_pmE(p.title)+'</div>':'')+'</td><td class="pm-muted">'+({member:'Team',person:'Project people',contact:'Contacts'})[p.kind]+'</td><td>'+(p.email?_pmE(p.email):'<span style="color:#d97706">none</span>')+'</td><td>'+_pmE(p.org||'')+'</td><td>'+(p.kind==='person'&&p.costRate?_pmMoney(p.costRate)+'/h':'<span class="pm-muted">—</span>')+'</td><td>'+(p.kind==='person'&&p.capacityHours?p.capacityHours+'h':'<span class="pm-muted">'+pmPersonCapacity(p.key)+'h</span>')+'</td><td>'+(mine.length?'<a href="javascript:void(0)" onclick="_pmState.dlgGroup=\'person\';pmGo(\'all\',\'waiting\')">'+mine.length+(late?' <span style="color:#dc2626">('+late+' late)</span>':'')+'</a>':'<span class="pm-muted">0</span>')+'</td>'+
      '<td>'+(p.kind==='person'?'<button class="btn btn-s" style="height:24px;font-size:11px" onclick="pmPersonEdit('+p.rec.id+')">Edit</button>':p.kind==='contact'?'<button class="btn btn-s" style="height:24px;font-size:11px" onclick="nav(\'contacts\')">Contacts</button>':'')+'</td></tr>';}).join('')+'</tbody></table></div>';
  return html;
}
function pmPersonEdit(id){
  var p=PM.people.find(function(x){return x.id===id;});if(!p)return;
  pmModal('<h3>'+_pmIcon('user',18)+' '+_pmE(p.name)+'<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    ['name','email','org','title','phone'].map(function(f){return '<div class="pm-row"><label>'+({name:'Name',email:'Email',org:'Organisation',title:'Role / title',phone:'Phone'})[f]+'</label><input class="inp" id="pmpe-'+f+'" value="'+_pmE(p[f]||'')+'"></div>';}).join('')+
    '<div class="pm-row"><label>Cost rate ($/hour)</label><input class="inp" type="number" id="pmpe-rate" value="'+_pmE(p.costRate!=null?p.costRate:'')+'"></div>'+
    '<div class="pm-row"><label>Capacity (h/week)</label><input class="inp" type="number" id="pmpe-cap" value="'+_pmE(p.capacityHours!=null?p.capacityHours:'')+'" placeholder="40"></div>'+
    '<div class="pm-row" style="align-items:start"><label>Notes</label><textarea class="inp" id="pmpe-notes" rows="2">'+_pmE(p.notes||'')+'</textarea></div>'+
    '<div class="pm-acts"><button class="btn btn-s" style="margin-right:auto;color:#dc2626" id="pmpe-arch">Archive</button><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmpe-save">Save</button></div>');
  document.getElementById('pmpe-save').onclick=async function(){
    var v=function(f){return document.getElementById('pmpe-'+f).value;};
    try{var s=await _trpc('pm.peopleUpsert',{id:p.id,name:v('name').trim()||p.name,email:v('email').trim()||null,org:v('org')||null,title:v('title')||null,phone:v('phone')||null,costRate:v('rate')===''?null:Number(v('rate')),capacityHours:v('cap')===''?null:Number(v('cap')),notes:v('notes')||null},'mutation');
      Object.assign(p,s);pmCloseModal(true);pmRender();}catch(e){_pmToast('Could not save: '+(e&&e.message||e),'error');}
  };
  document.getElementById('pmpe-arch').onclick=async function(){if(!confirm('Archive '+p.name+'? Their history stays; they stop appearing in pickers.'))return;try{await _trpc('pm.peopleArchive',{id:p.id,archived:true},'mutation');PM.people=PM.people.filter(function(x){return x.id!==p.id;});pmCloseModal(true);pmRender();}catch(e){_pmToast('Could not archive','error');}};
}

// ═══ TEMPLATES + NEW PROJECT FROM TEMPLATE (phase 4) ════════════════════════
// A template: {name, desc, roles[], tasks:[{t, d (offset days), dur, pred:[idx], role, ms}], risks:[{t,p,i,m}], raci:{taskIdx:{role:'RA'}}}
var PM_BUILTIN_TEMPLATES=[
  {key:'onboard',name:'Client onboarding',desc:'Kick-off to steady state for a new client engagement.',roles:['Engagement lead','Client sponsor','Delivery team','Finance'],
   tasks:[{t:'Kick-off meeting',d:0,dur:1,role:'Engagement lead',ms:false},{t:'Confirm scope and success criteria',d:1,dur:3,pred:[0],role:'Engagement lead'},{t:'Sign SOW',d:4,dur:3,pred:[1],role:'Client sponsor'},{t:'Set up access and accounts',d:5,dur:3,pred:[2],role:'Delivery team'},{t:'Billing set up',d:5,dur:2,pred:[2],role:'Finance'},{t:'Delivery plan agreed',d:8,dur:2,pred:[3],role:'Engagement lead'},{t:'Onboarding complete',d:10,dur:0,pred:[4,5],role:'Engagement lead',ms:true}],
   risks:[{t:'Scope creep before the SOW is signed',p:3,i:3,m:'Written scope; change requests after signature'},{t:'Client access delayed',p:3,i:2,m:'Request access at kick-off'}],
   raci:{0:{'Engagement lead':'RA','Client sponsor':'C','Delivery team':'I'},1:{'Engagement lead':'R','Client sponsor':'A'},2:{'Client sponsor':'RA','Finance':'C','Engagement lead':'I'},3:{'Delivery team':'R','Engagement lead':'A'},4:{'Finance':'RA'},5:{'Engagement lead':'RA','Delivery team':'C','Client sponsor':'I'}}},
  {key:'ato',name:'ATO package (RMF)',desc:'Authority to Operate — categorise, implement, assess, authorise.',roles:['ISSM','System owner','Engineers','Assessor','Authorising official'],
   tasks:[{t:'Categorise the system (FIPS 199)',d:0,dur:5,role:'System owner'},{t:'Select controls',d:5,dur:5,pred:[0],role:'ISSM'},{t:'Implement controls',d:10,dur:30,pred:[1],role:'Engineers'},{t:'Write SSP',d:10,dur:20,pred:[1],role:'ISSM'},{t:'Security assessment (SAR)',d:40,dur:15,pred:[2,3],role:'Assessor'},{t:'POA&M',d:55,dur:5,pred:[4],role:'ISSM'},{t:'Authorisation decision',d:60,dur:5,pred:[5],role:'Authorising official'},{t:'ATO granted',d:65,dur:0,pred:[6],ms:true,role:'Authorising official'}],
   risks:[{t:'Assessment finds high-severity findings',p:3,i:4,m:'Internal pre-assessment before the SAR'},{t:'Evidence gaps in the SSP',p:3,i:3,m:'Evidence checklist per control family'}],
   raci:{0:{'System owner':'RA','ISSM':'C'},1:{'ISSM':'R','System owner':'A'},2:{'Engineers':'R','System owner':'A','ISSM':'C'},3:{'ISSM':'R','System owner':'A','Engineers':'C'},4:{'Assessor':'R','ISSM':'C','System owner':'A'},5:{'ISSM':'R','System owner':'A'},6:{'Authorising official':'RA','System owner':'I','ISSM':'I'}}},
  {key:'release',name:'Software release',desc:'Plan, build, test and ship a release.',roles:['Product owner','Tech lead','QA','Ops'],
   tasks:[{t:'Release scope agreed',d:0,dur:2,role:'Product owner'},{t:'Build features',d:2,dur:15,pred:[0],role:'Tech lead'},{t:'Test plan',d:2,dur:4,pred:[0],role:'QA'},{t:'QA testing',d:17,dur:5,pred:[1,2],role:'QA'},{t:'Release notes',d:20,dur:2,pred:[1],role:'Product owner'},{t:'Deploy',d:22,dur:1,pred:[3,4],role:'Ops'},{t:'Release live',d:23,dur:0,pred:[5],ms:true,role:'Product owner'}],
   risks:[{t:'Critical bug found late in QA',p:3,i:4,m:'Test early; feature flags'},{t:'Deployment rollback needed',p:2,i:4,m:'Rehearsed rollback plan'}],
   raci:{0:{'Product owner':'RA','Tech lead':'C'},1:{'Tech lead':'RA','Product owner':'C'},2:{'QA':'RA','Tech lead':'C'},3:{'QA':'R','Tech lead':'A'},4:{'Product owner':'RA'},5:{'Ops':'R','Tech lead':'A','Product owner':'I'}}},
  {key:'proposal',name:'Proposal response (RFP)',desc:'From RFP release to submission.',roles:['Capture lead','Proposal manager','Writers','Pricing','Reviewers'],
   tasks:[{t:'Bid / no-bid decision',d:0,dur:2,role:'Capture lead'},{t:'Compliance matrix',d:2,dur:3,pred:[0],role:'Proposal manager'},{t:'Draft technical volume',d:5,dur:10,pred:[1],role:'Writers'},{t:'Price volume',d:5,dur:10,pred:[1],role:'Pricing'},{t:'Red team review',d:15,dur:3,pred:[2,3],role:'Reviewers'},{t:'Final edits',d:18,dur:3,pred:[4],role:'Proposal manager'},{t:'Submit',d:21,dur:0,pred:[5],ms:true,role:'Capture lead'}],
   risks:[{t:'Key personnel unavailable for resumes',p:3,i:3,m:'Confirm commitments at kick-off'},{t:'Pricing not competitive',p:3,i:4,m:'Price-to-win analysis early'}],
   raci:{0:{'Capture lead':'RA','Pricing':'C'},1:{'Proposal manager':'RA'},2:{'Writers':'R','Proposal manager':'A','Capture lead':'C'},3:{'Pricing':'R','Capture lead':'A'},4:{'Reviewers':'R','Proposal manager':'A'},5:{'Proposal manager':'RA','Writers':'C'}}},
];
function pmTemplates(){
  var saved=pmRecs('template','').map(function(r){return Object.assign({key:'rec:'+r.id,saved:true,rec:r},r.data||{},{name:r.title||(r.data||{}).name});});
  return PM_BUILTIN_TEMPLATES.concat(saved);
}
function pmTab_templates(){
  var list=pmTemplates();
  return '<div class="pm-bar"><button class="btn btn-p" onclick="pmTemplateNewProject()">'+_pmIcon('plus',14,'#fff')+' New project from a template</button><span class="pm-muted">Save any project as a template from its Settings tab.</span></div>'+
    '<div class="pm-grid2">'+list.map(function(t){return '<div class="pm-card"><div class="pm-h">'+_pmIcon('bookOpen',15)+' '+_pmE(t.name)+'<span class="sp"></span>'+(t.saved?'<button class="btn btn-s" style="height:24px;font-size:11px;color:#dc2626" onclick="pmDel(pmRec('+t.rec.id+'),\'Template deleted\')">Delete</button>':'<span class="pm-muted">built in</span>')+'</div><div class="pm-muted" style="margin-bottom:8px">'+_pmE(t.desc||'')+'</div><div style="font-size:12px">'+(t.tasks||[]).length+' tasks · '+(t.roles||[]).length+' roles · '+(t.risks||[]).length+' risks</div><div style="margin-top:8px"><button class="btn btn-s" onclick="pmTemplateNewProject(\''+_pmJ(t.key)+'\')">Use</button></div></div>';}).join('')+'</div>';
}
function pmTemplateNewProject(tkey){
  var list=pmTemplates();var t=list.find(function(x){return x.key===tkey;})||list[0];
  var progs=Array.isArray(D.programs)?D.programs:[];
  var roleRows=function(tp){return (tp.roles||[]).map(function(role,i){return '<div class="pm-row"><label>'+_pmE(role)+'</label>'+pmPersonSelect('pmt-role-'+i,i===0?_pmMe().key:'',{blankLabel:'— decide later —'})+'</div>';}).join('');};
  pmModal('<h3>'+_pmIcon('bookOpen',18)+' New project from a template<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Template</label><select class="inp" id="pmt-tpl">'+list.map(function(x){return '<option value="'+_pmE(x.key)+'"'+(x===t?' selected':'')+'>'+_pmE(x.name)+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Project name</label><input class="inp" id="pmt-name" value="'+_pmE(t.name)+'"></div>'+
    '<div class="pm-row"><label>Start date</label><input class="inp" type="date" id="pmt-start" value="'+_pmE(_pmNextWork(_pmToday(),false))+'"></div>'+
    (progs.length?'<div class="pm-row"><label>Program</label><select class="inp" id="pmt-prog"><option value="">— none —</option>'+progs.map(function(p){return '<option value="'+_pmE(p.id)+'">'+_pmE(p.name)+'</option>';}).join('')+'</select></div>':'')+
    '<div class="pm-h" style="margin-top:12px">Who plays each role</div><div id="pmt-roles">'+roleRows(t)+'</div>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmt-go">Create project</button></div>',true);
  var wire=function(){
    (t.roles||[]).forEach(function(_,i){pmWirePersonSelect('pmt-role-'+i);});
    document.getElementById('pmt-tpl').onchange=function(){pmCloseModal(true);pmTemplateNewProject(this.value);};
    document.getElementById('pmt-go').onclick=function(){
      var roleMap={};(t.roles||[]).forEach(function(role,i){var v=document.getElementById('pmt-role-'+i).value;if(v&&v!=='__new')roleMap[role]=v;});
      var pg=document.getElementById('pmt-prog');
      pmCreateFromTemplate(t,{name:document.getElementById('pmt-name').value.trim()||t.name,start:document.getElementById('pmt-start').value||_pmToday(),programId:pg?pg.value:'',roles:roleMap});
    };
  };
  wire();document.getElementById('pm-modal')._handlers=wire;
}
async function pmCreateFromTemplate(t,o){
  pmCloseModal(true);
  var now=new Date().toISOString(),me=(D.creds&&D.creds.userName)||'Me';
  var ww=false;var dateAt=function(off){return _pmAddWork(o.start,Math.max(0,off|0),ww);};
  var pid=typeof nextId==='function'?nextId(D.projects||[]):Date.now();
  var last=(t.tasks||[]).reduce(function(m,x){return Math.max(m,(x.d||0)+(x.dur||0));},0);
  var proj={id:pid,name:o.name,desc:t.desc||'',status:'Active',area:'',owner:me,color:'#0891b2',startDate:o.start,due:dateAt(last),quarter:'',year:new Date(o.start).getFullYear(),kanbanAxis:'',pct:0,tags:['template:'+t.name],scope:{personal:false,business:true},milestones:[],linkedGoalIds:[],createdBy:me,createdAt:now};
  D.projects=Array.isArray(D.projects)?D.projects:[];D.projects.push(proj);
  if(o.programId){var pg=(D.programs||[]).find(function(p){return String(p.id)===String(o.programId);});if(pg){pg.projectIds=(pg.projectIds||[]).concat([pid]);try{save('programs');}catch(_){}}}
  try{save('projects');}catch(_){}
  var key='p:'+pid,ids=[];
  (t.tasks||[]).forEach(function(x,i){
    var id=nextId(D.tasks);ids.push(id);
    var start=dateAt(x.d||0),due=x.dur?_pmAddWork(start,Math.max(0,(x.dur||1)-1),ww):start;
    D.tasks.push({id:id,title:String(x.t).slice(0,300),notes:'',priority:'Medium',status:'Not Started',smartList:'Task Intake',startDate:start,endDate:'',due:due,startTime:'',endTime:'',
      estimatedMins:(x.dur||0)*240,actualMins:0,energy:'medium',context:'',location:'Anywhere',pi:'Process',recurring:'None',projectId:pid,project:o.name,linkedGoalId:null,assignedTo:null,delegatedTo:null,
      snoozeUntil:'',reminder:'',myDay:false,isWorkTask:true,tags:x.ms?['milestone']:[],scope:{personal:false,business:true},subtasks:[],linkedNoteIds:[],
      predecessorIds:(x.pred||[]).map(function(p){return ids[p];}).filter(function(v){return v!=null;}),comments:[],createdBy:me,createdAt:now});
  });
  try{save('tasks');}catch(_){}
  await pmLoad();
  var people=[];Object.keys(o.roles||{}).forEach(function(role){if(people.indexOf(o.roles[role])<0)people.push(o.roles[role]);});
  var recs=[];
  (t.tasks||[]).forEach(function(x,i){
    var cells={};var rm=(t.raci||{})[i]||(x.role?(function(){var c={};c[x.role]='RA';return c;})():{});
    Object.keys(rm).forEach(function(role){var pk=(o.roles||{})[role];if(pk)cells[pk]=(cells[pk]||'')+rm[role];});
    if(Object.keys(cells).length)recs.push({projectKey:key,kind:'raci',refType:'item',refId:'task:'+ids[i],title:x.t,data:{cells:cells}});
    if(x.ms)recs.push({projectKey:key,kind:'milestone',title:x.t,data:{date:dateAt((x.d||0)+(x.dur||0))}});
  });
  (t.risks||[]).forEach(function(r,i){recs.push({projectKey:key,kind:'risk',title:r.t,status:'open',data:{no:i+1,probability:r.p||3,impact:r.i||3,mitigation:r.m||'',response:'Mitigate',owner:(o.roles||{})[(t.roles||[])[0]]||''}});});
  recs.push({projectKey:key,kind:'pmsettings',data:{raciPeople:people,startDate:o.start}});
  try{var saved=await _trpc('pm.recordUpsertMany',{records:recs},'mutation');saved.forEach(function(r){PM.records.push(_pmTagRec(r));});}catch(e){_pmToast('Project created, but some PM items did not save: '+(e&&e.message||e),'warn');}
  _pmToast('📁 Created “'+o.name+'” with '+ids.length+' tasks');
  pmGo(key,'overview');
}
function pmSaveAsTemplate(key){
  var name=prompt('Template name:',(_pmProjName(key)||'Project')+' template');if(!name)return;
  var items=pmItems(key).filter(function(i){return i.kind==='task';});
  var starts=items.map(function(i){return i.start||i.due;}).filter(Boolean).sort();var s0=starts[0]||_pmToday();
  var idx={};items.forEach(function(it,i){idx[it.ref]=i;});
  var people=pmRaciPeople(key);var roleOf=function(pk){var p=pmPerson(pk);return p?(p.title||p.name):pk;};
  var tasks=items.map(function(it){var st=it.start||it.due||s0;var dur=it.start&&it.due?Math.max(1,_pmWorkBetween(it.start,it.due,false)+1):1;
    return {t:it.title,d:Math.max(0,_pmWorkBetween(s0,st,false)),dur:it.milestone?0:dur,pred:(it.preds||[]).map(function(p){return idx[p];}).filter(function(v){return v!=null;}),ms:!!it.milestone};});
  var raci={};pmRecs('raci',key).forEach(function(r){if(r.refType!=='item'||idx[r.refId]==null)return;var c={};Object.keys((r.data||{}).cells||{}).forEach(function(pk){c[roleOf(pk)]=r.data.cells[pk];});raci[idx[r.refId]]=c;});
  var risks=pmRecs('risk',key).map(function(r){var d=r.data||{};return {t:r.title,p:d.probability,i:d.impact,m:d.mitigation};});
  pmPut(pmNew('template','',{title:name,data:{name:name,desc:'Saved from '+_pmProjName(key),roles:people.map(roleOf),tasks:tasks,raci:raci,risks:risks}}));
  _pmToast('Saved template “'+name+'”');
}

// ═══ MEETING NOTES → ACTION ITEMS (phase 4) ═════════════════════════════════
function pmMeetingNotesDialog(key){
  var notes=(Array.isArray(D.notes)?D.notes:[]).filter(function(n){return n&&!n.archived;}).slice();
  var isMeet=function(n){try{return typeof _noteIsMeeting==='function'&&_noteIsMeeting(n);}catch(_){return false;}};
  notes.sort(function(a,b){return (isMeet(b)-isMeet(a))||String(b.createdAt||b.updated||'').localeCompare(String(a.createdAt||a.updated||''));});
  pmModal('<h3>'+_pmIcon('list',18)+' Action items from meeting notes<button class="x" onclick="pmCloseModal()">×</button></h3>'+
    '<div class="pm-row"><label>Note</label><select class="inp" id="pmmn-note">'+notes.slice(0,200).map(function(n){return '<option value="'+_pmE(n.id)+'">'+(isMeet(n)?'📅 ':'')+_pmE(String(n.title||'(untitled)').slice(0,80))+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Project</label><select class="inp" id="pmmn-proj">'+pmProjects().filter(function(p){return p.source==='native';}).map(function(p){return '<option value="'+_pmE(p.key)+'"'+(p.key===key?' selected':'')+'>'+_pmE(p.name)+'</option>';}).join('')+'<option value=""'+(key&&key.indexOf('p:')===0?'':' selected')+'>— no project —</option></select></div>'+
    '<div class="pm-acts"><button class="btn btn-s" onclick="pmCloseModal()">Cancel</button><button class="btn btn-p" id="pmmn-go">'+_pmIcon('sparkles',14,'#fff')+' Find action items</button></div><div id="pmmn-out"></div>',true);
  document.getElementById('pmmn-go').onclick=async function(){
    var b=this,out=document.getElementById('pmmn-out');var nid=document.getElementById('pmmn-note').value;var pkey=document.getElementById('pmmn-proj').value;
    var n=(D.notes||[]).find(function(x){return String(x.id)===String(nid);});if(!n)return;
    var text=String(n.bodyHtml||n.body||n.content||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
    if(!text){out.innerHTML='<div class="pm-muted">That note is empty.</div>';return;}
    b.disabled=true;b.textContent='Reading…';
    try{
      var people=pmPeopleAll().slice(0,80).map(function(p){return p.name;}).join(', ');
      var sys='Extract the ACTION ITEMS from these meeting notes: things someone committed to do. For each return the task (imperative, ≤12 words), the owner exactly as named in the notes (or "me" if it is the note-taker / unassigned), and a due date (YYYY-MM-DD, resolve relative dates from the meeting date) or null. Ignore discussion and FYIs. Return ONLY JSON {"meetingDate":"YYYY-MM-DD or null","actions":[{"title":"","owner":"","due":null,"notes":"≤20 words of context"}]}. Known people: '+people;
      var res=await _trpc('ai.assist',{systemPrompt:sys.slice(0,3900),userContent:('NOTE TITLE: '+(n.title||'')+'\nDATE: '+String(n.createdAt||'').slice(0,10)+'\n\n'+text).slice(0,7800),provider:(typeof _getAIConfig==='function'?_getAIConfig().provider:undefined)},'mutation');
      var raw=String(res&&(res.result||res.text)||'');var m=raw.match(/\{[\s\S]*\}/);if(!m)throw new Error('the AI reply was not usable');
      var acts=(JSON.parse(m[0]).actions||[]).filter(function(a){return a&&a.title;}).slice(0,40);
      if(!acts.length){out.innerHTML='<div class="pm-muted" style="margin-top:10px">No action items found in that note.</div>';return;}
      var me=_pmMe().key;
      out.innerHTML='<div class="pm-h" style="margin-top:14px">Review — '+acts.length+' found</div><div class="pm-scroll"><table class="pm-table"><thead><tr><th></th><th>Action</th><th>Owner</th><th>Due</th></tr></thead><tbody>'+acts.map(function(a,i){
        var who=/^(me|i|myself)$/i.test(String(a.owner||'').trim())||!a.owner?me:((pmFindPersonByName(a.owner)||{}).key||'');
        return '<tr><td><input type="checkbox" class="pmmn-on" data-i="'+i+'" checked></td><td><input class="inp" id="pmmn-t-'+i+'" value="'+_pmE(a.title)+'">'+(a.notes?'<div class="pm-muted">'+_pmE(a.notes)+'</div>':'')+'</td><td>'+pmPersonSelect('pmmn-o-'+i,who,{blankLabel:a.owner&&!who?'“'+a.owner+'” — pick or add':'— nobody —'})+'</td><td><input class="inp" type="date" id="pmmn-d-'+i+'" value="'+_pmE(_pmIsYmd(a.due)?a.due:'')+'"></td></tr>';}).join('')+'</tbody></table></div>'+
        '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin-top:8px"><input type="checkbox" id="pmmn-email"> Email each delegate their item now</label>'+
        '<div class="pm-acts"><button class="btn btn-p" id="pmmn-create">Create tasks</button></div>';
      acts.forEach(function(a,i){pmWirePersonSelect('pmmn-o-'+i);});
      document.getElementById('pmmn-create').onclick=function(){pmMeetingCreate(acts,pkey,n);};
    }catch(e){out.innerHTML='<div style="color:#dc2626;margin-top:10px">Could not read it: '+_pmE(String(e&&e.message||e))+'</div>';}
    finally{b.disabled=false;b.innerHTML=_pmIcon('sparkles',14,'#fff')+' Find action items';}
  };
}
async function pmMeetingCreate(acts,pkey,note){
  var me=_pmMe().key,now=new Date().toISOString(),meName=(D.creds&&D.creds.userName)||'Me';
  var proj=pkey?pmProject(pkey):null;var email=document.getElementById('pmmn-email').checked;
  var chosen=Array.prototype.map.call(document.querySelectorAll('.pmmn-on:checked'),function(x){return Number(x.getAttribute('data-i'));});
  var made=0,dlg=[];
  chosen.forEach(function(i){
    var title=document.getElementById('pmmn-t-'+i).value.trim();if(!title)return;
    var owner=document.getElementById('pmmn-o-'+i).value;if(owner==='__new')owner='';
    var due=document.getElementById('pmmn-d-'+i).value;
    var id=nextId(D.tasks);
    D.tasks.push({id:id,title:title.slice(0,300),notes:(acts[i].notes||'')+(note?'\nFrom meeting notes: '+(note.title||''):''),priority:'Medium',status:'Not Started',smartList:'Task Intake',startDate:'',endDate:'',due:due||'',startTime:'',endTime:'',
      estimatedMins:0,actualMins:0,energy:'medium',context:'',location:'Anywhere',pi:'Process',recurring:'None',projectId:proj?proj.id:null,project:proj?proj.name:'',linkedGoalId:null,assignedTo:null,delegatedTo:owner&&owner!==me?pmPersonName(owner):null,
      snoozeUntil:'',reminder:'',myDay:false,isWorkTask:true,tags:['meeting'],scope:{personal:false,business:true},subtasks:[],linkedNoteIds:note?[note.id]:[],predecessorIds:[],comments:[],createdBy:meName,createdAt:now});
    made++;
    if(owner&&owner!==me)dlg.push({id:id,title:title,owner:owner,due:due});
  });
  try{save('tasks');}catch(_){}
  for(var k=0;k<dlg.length;k++){
    var x=dlg[k],person=pmPerson(x.owner);
    var rec=pmNew('delegation',pkey||'',{refType:'task',refId:String(x.id),title:x.title,status:'open',data:{personKey:x.owner,personName:person?person.name:'',taskTitle:x.title,projectName:proj?proj.name:'',delegatedAt:now,expectedBy:x.due||null,followUp:x.due?_pmAddDays(x.due,-1):_pmAddDays(_pmToday(),3),cadenceDays:3,autoNudge:null,note:'From meeting notes: '+(note&&note.title||''),updates:[{at:now,by:'owner',text:'Delegated from meeting notes'}],nudges:[]}});
    try{await pmPut(rec);if(email&&person&&person.email)await _trpc('pm.nudge',{recordId:rec.id,note:rec.data.note,intro:true},'mutation');}catch(_){}
    if(pkey){var raci=_pmRaciRec(pkey,'item|task:'+x.id);var c={};c[x.owner]='R';c[me]='A';raci.title=x.title;raci.data=Object.assign({},raci.data||{},{cells:c});pmPut(raci);
      var ppl=pmRaciPeople(pkey);[x.owner,me].forEach(function(p){if(ppl.indexOf(p)<0)ppl=ppl.concat([p]);});pmSetSettings(pkey,{raciPeople:ppl});}
  }
  pmCloseModal(true);
  _pmToast('Created '+made+' task'+(made===1?'':'s')+(dlg.length?' · '+dlg.length+' delegated':''));
  if(email&&dlg.length)await pmRefreshChanged();
  pmRender();
}

// ═══ SETTINGS ═══════════════════════════════════════════════════════════════
function pmTab_settings(key){
  var all=key==='all',s=pmSettings(all?'':key),g=pmSettings('');
  var chk=function(id,on,label,hint,fn){return '<label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;margin:8px 0;cursor:pointer"><input type="checkbox" id="'+id+'" '+(on?'checked':'')+' onchange="'+fn+'" style="margin-top:2px"><span><b>'+label+'</b>'+(hint?'<br><span class="pm-muted">'+hint+'</span>':'')+'</span></label>';};
  var html='';
  if(!all){
    html+='<div class="pm-card" style="margin-bottom:12px"><div class="pm-h">'+_pmIcon('settings',15)+' This project</div>'+
      chk('pms-auto',!!s.autoNudge,'Automatic follow-up emails','On each delegation’s follow-up date, LevelUp emails the person for an update (weekdays 9–5 your time). Individual delegations can override this.','pmSetSettings(\''+_pmJ(key)+'\',{autoNudge:this.checked})')+
      chk('pms-ww',!!s.workWeekends,'Count weekends as work days','For the schedule, IMS and earned value.','pmSetSettings(\''+_pmJ(key)+'\',{workWeekends:this.checked});pmRender()')+
      chk('pms-labor',!!s.laborFromTime,'Count my tracked time as labor cost','Time you track on this project’s tasks × your hourly rate goes into actual cost.','pmSetSettings(\''+_pmJ(key)+'\',{laborFromTime:this.checked})')+
      '<div class="pm-row"><label>Project start (schedule)</label><input class="inp" type="date" value="'+_pmE(s.startDate||'')+'" onchange="pmSetSettings(\''+_pmJ(key)+'\',{startDate:this.value||null})"></div>'+
      '<div class="pm-row"><label>My hourly rate ($)</label><input class="inp" type="number" value="'+_pmE(s.myRate||'')+'" placeholder="'+_pmE(g.myRate||'')+'" onchange="pmSetSettings(\''+_pmJ(key)+'\',{myRate:this.value?Number(this.value):null})"></div>'+
      '<div class="pm-acts" style="justify-content:flex-start"><button class="btn btn-s" onclick="pmSaveAsTemplate(\''+_pmJ(key)+'\')">Save this project as a template</button><button class="btn btn-s" onclick="pmExportAll(\''+_pmJ(key)+'\')">Export everything (Excel)</button><button class="btn btn-s" style="color:#dc2626" onclick="pmWipeProject(\''+_pmJ(key)+'\')">Delete all PM data for this project</button></div></div>';
  }
  html+='<div class="pm-card"><div class="pm-h">'+_pmIcon('settings',15)+' All projects</div>'+
    '<div class="pm-row"><label>People offered</label><select class="inp" onchange="pmSetSettings(\'\',{peopleSource:this.value});pmRender()">'+[['both','Both — project people list and my Contacts'],['separate','Project people list only'],['contacts','My Contacts only']].map(function(o){return '<option value="'+o[0]+'"'+(pmPeopleSource()===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></div>'+
    '<div class="pm-row"><label>Default weekly capacity (h)</label><input class="inp" type="number" value="'+_pmE(g.defaultCapacity||40)+'" onchange="pmSetSettings(\'\',{defaultCapacity:Number(this.value)||40})"></div>'+
    '<div class="pm-row"><label>Default cost rate ($/h)</label><input class="inp" type="number" value="'+_pmE(g.defaultRate||'')+'" onchange="pmSetSettings(\'\',{defaultRate:this.value?Number(this.value):null})"></div>'+
    '<div class="pm-row"><label>My hourly rate ($)</label><input class="inp" type="number" value="'+_pmE(g.myRate||'')+'" onchange="pmSetSettings(\'\',{myRate:this.value?Number(this.value):null})"></div>'+
    chk('pms-atlas',g.atlasPeople!==false,'Show Atlas team plans in Resources','Atlas members’ planned allocations appear next to your own people for Atlas projects.','pmSetSettings(\'\',{atlasPeople:this.checked})')+
    '<div class="pm-acts" style="justify-content:flex-start"><button class="btn btn-s" onclick="pmRunNudges()">Run automatic follow-ups now</button><span class="pm-muted" id="pm-nudge-out"></span></div></div>';
  return html;
}
async function pmRunNudges(){var o=document.getElementById('pm-nudge-out');if(o)o.textContent='Running…';try{var r=await _trpc('pm.runNudgesNow',undefined,'mutation');if(o)o.textContent='Sent '+(r.sent||0)+(r.errors?' · '+r.errors+' failed':'')+' (only due ones, weekdays 9–5 your time)';await pmRefreshChanged();}catch(e){if(o)o.textContent='Failed: '+(e&&e.message||e);}}
async function pmWipeProject(key){
  var recs=PM.records.filter(function(r){return r.projectKey===key;});
  if(!recs.length){_pmToast('Nothing to delete');return;}
  if(!confirm('Delete all '+recs.length+' PM items (RACI, risks, WBS, budget, delegations…) for '+_pmProjName(key)+'? The project and its tasks stay. You can undo right after.'))return;
  pmDel(recs,recs.length+' PM items deleted');
}
async function pmExportAll(key){
  var sheets=[];var X=_pmImsRows(key);
  sheets.push({name:'Delegations',rows:[['Task','Person','Status','Handed off','Expected','Follow up','Last update']].concat(pmDelegations(key).map(function(r){var d=r.data||{};var u=(d.updates||[]).slice(-1)[0];return [_pmDlgRefLabel(r),pmPersonName(d.personKey),r.status,(d.delegatedAt||'').slice(0,10),d.expectedBy||'',d.followUp||'',u?u.text:''];}))});
  var rt=_pmRaciTable(key);sheets.push({name:'RACI',rows:[rt.head].concat(rt.body)});
  if(X.rows.length)sheets.push({name:X.style==='dod'?'IMS':'WBS',rows:[['ID','Code','Name','Type','Days','Start','Finish','Pred.','Float']].concat(X.rows.map(function(r){return [r.id,r.code,'  '.repeat(r.depth)+r.name,r.type,r.dur,r.start,r.finish,r.preds,r.float];}))});
  ['risk','issue','assumption','decision'].forEach(function(k){sheets.push({name:PM_RAID[k].label,rows:[['ID','Title','Status','Details']].concat(_pmRaidList(k,key).map(function(r){return [_pmRaidNo(r),r.title,r.status,JSON.stringify(r.data||{}).slice(0,500)];}))});});
  var ev=pmEvm(key)||{};sheets.push({name:'Budget',rows:[['BAC','PV','EV','AC','CPI','SPI','EAC'],[ev.bac,ev.pv,ev.ev,ev.ac,ev.cpi,ev.spi,ev.eac].map(function(v){return v==null?'':Math.round(v*1000)/1000;})]});
  await _pmXlsx('Project management - '+_pmProjName(key)+'.xlsx',sheets);
}

// ═══ REGISTRATION ═══════════════════════════════════════════════════════════
// Fix references to a record's temporary local key once the server gives it
// an id (WBS parents point at each other by id).
(function(){
  var origPut=pmPut;
  window.pmPut=function(rec){var lk=rec._lk,wasTmp=!rec.id;var p=origPut(rec);
    if(wasTmp&&rec.kind==='wbs')p.then(function(saved){if(!saved||!saved.id)return;pmRecs('wbs',saved.projectKey).forEach(function(c){if((c.data||{}).parentId===lk){c.data=Object.assign({},c.data,{parentId:String(saved.id)});origPut(c);}});}).catch(function(){});
    return p;};
})();
(function(){
  _pmCSS();
  try{SM.pm='s-pm';}catch(_){}
  try{if(typeof PAGE_ACCENT_DEFAULTS==='object')PAGE_ACCENT_DEFAULTS.pm='#0891b2';}catch(_){}
  if(!document.getElementById('s-pm')){
    var div=document.createElement('div');div.className='scr';div.id='s-pm';
    div.innerHTML='<div class="bg"><nav class="sb" data-sb></nav><main class="mn" id="pm-main"></main></div>';
    var near=document.getElementById('s-projects');
    if(near&&near.parentNode)near.parentNode.insertBefore(div,near.nextSibling);else (document.querySelector('.app')||document.body).appendChild(div);
  }
  var tpl=document.getElementById('sb-tpl');
  try{
    if(tpl&&tpl.content&&!tpl.content.querySelector('.si[data-n="pm"]')){
      var after=tpl.content.querySelector('.si[data-n="projects"]');
      var html='<div class="si" data-n="pm" title="Project management — delegation, RACI, schedule, risks, budget"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/></svg><span class="l">PM Workspace</span></div>';
      if(after)after.insertAdjacentHTML('afterend',html);
    }
  }catch(_){}
  try{if(typeof LU_PAGES!=='undefined'&&Array.isArray(LU_PAGES)&&!LU_PAGES.some(function(p){return p.id==='pm';})){var i=LU_PAGES.findIndex(function(p){return p.id==='projects';});LU_PAGES.splice(i>=0?i+1:LU_PAGES.length,0,{id:'pm',label:'PM Workspace',group:'work',nav:true,core:false,rail:false});}}catch(_){}
  if(typeof renderScreen==='function'){
    var orig=renderScreen;
    window.renderScreen=function(s){var r=orig.apply(this,arguments);if(s==='pm'){try{pmRender();}catch(e){console.error('[pm] render failed',e);}}return r;};
  }
  try{if(typeof curScreen!=='undefined'&&curScreen&&typeof initSidebars==='function')initSidebars(curScreen);}catch(_){}
  // command palette
  if(typeof _cmdpActions==='function'){
    var oc=_cmdpActions;
    window._cmdpActions=function(){var list=oc();try{
      [['pm-portfolio','Portfolio of projects',function(){openPM('all','portfolio');}],['pm-waiting','Waiting on (delegated work)',function(){openPM(_pmState.proj||'all','waiting');}],
       ['pm-delegate','Delegate something',function(){pmDelegateDialog({projectKey:_pmState.proj&&_pmState.proj!=='all'?_pmState.proj:null});}],
       ['pm-meeting','Action items from meeting notes',function(){pmMeetingNotesDialog(_pmState.proj!=='all'?_pmState.proj:'');}],
       ['pm-template','New project from a template',function(){pmLoad().then(function(){pmTemplateNewProject();});}]].reverse().forEach(function(x){list.unshift({id:x[0],group:'Project management',icon:'💼',title:'PM: '+x[1],run:x[2]});});
    }catch(_){}return list;};
  }
  // a link to the workspace from the Projects page header and project drawer
  if(typeof openProjectDetail==='function'){
    var od=openProjectDetail;
    window.openProjectDetail=function(pid){var r=od.apply(this,arguments);try{
      var row=Array.prototype.find.call(document.querySelectorAll('#drawer-content button'),function(b){return /AI Coach/i.test(b.textContent||'');});
      if(row&&!document.getElementById('pm-open-btn')){var b=document.createElement('button');b.id='pm-open-btn';b.className=row.className;b.textContent='💼 PM workspace';b.onclick=function(){if(typeof closeDrawer==='function')closeDrawer();openPM('p:'+pid,'overview');};row.parentNode.insertBefore(b,row);}
    }catch(_){}return r;};
  }
  // load in the background once signed in; pick up delegate replies while open
  setTimeout(function(){try{if(localStorage.getItem('lu_session'))pmLoad();}catch(_){}},4500);
  setInterval(function(){if(document.visibilityState!=='visible'||!PM.loaded)return;pmRefreshChanged().then(function(n){if(n&&typeof curScreen!=='undefined'&&curScreen==='pm'&&!document.getElementById('pm-modal'))pmRender();});},120000);
  // Help Center article (the assistant reads Help through _luKnowledgeHits)
  try{if(typeof HC_ARTICLES!=='undefined'&&Array.isArray(HC_ARTICLES)&&!HC_ARTICLES.some(function(a){return a.slug==='project-management';})){
    HC_ARTICLES.push({id:65,slug:'project-management',catId:10,title:'Project management — delegation, RACI, schedule, risks and budget',
      summary:'The PM Workspace: track work you hand to others (even people without LevelUp), RACI, RAID log and risk matrix, stakeholders and status reports, Gantt with critical path and baselines, WBS / DoD IMS with MS Project export, resources, budget with earned value, change requests, lessons, templates and meeting notes → action items.',
      tags:['project','projects','pm','project management','program','delegate','delegated','delegation','waiting','raci','raid','risk','risks','issue','stakeholder','status report','gantt','schedule','critical path','baseline','ims','wbs','ms project','dod','resource','resources','budget','evm','earned value','cpi','spi','change request','lessons','template','meeting notes','action items'],
      body:'## Project management\n\nOpen **PM Workspace** in the sidebar (under Work), or **💼 PM workspace** in a project\'s details. Pick a project at the top — LevelUp projects and **Atlas (CommunityForce)** projects are both listed — or **All projects** for the portfolio.\n\n## Delegate and track (Waiting on)\n\nIn any task press **🤝 Delegate** (or **Delegate something** on the Waiting on tab). Choose the person — a team member, someone from your Contacts, or anyone you add with an email address; they do **not** need LevelUp. Set when you expect it back and when to follow up. Tick **Email them now** to send the details.\n\n**Waiting on** lists everything you have handed off, grouped by person or project, with what is late and what is due a follow-up. **Follow up** emails the person; they just **reply** ("done", "Friday", "blocked on the client") and LevelUp reads the reply, updates the delegation and tells you. A "done" marks the task done. Turn on **Automatic follow-up emails** in the project\'s Settings tab to have LevelUp send follow-ups on the date for you. Your coach mentions late delegated work in its check-ins.\n\n## RACI\n\nAdd people as columns, then click a cell to mark **R**esponsible, **A**ccountable (exactly one), **C**onsulted, **I**nformed. The Check column flags rows with no or several Accountables. **Fill from assignments** starts it from task assignees and delegations. Export to Excel or print.\n\n## RAID log\n\nRisks (with a 5×5 probability × impact matrix), Issues, Assumptions and Decisions. A risk that happens becomes an issue in one click.\n\n## Stakeholders and reports\n\nPlace stakeholders on the influence/interest grid and plan who hears what and how often. **Reports → New status report** drafts a red/amber/green report from live data with AI; edit it, then **Email** it, save a **PDF**, or turn it into a **Slides** deck.\n\n## Schedule, WBS and IMS\n\n**Schedule** is a Gantt with dependency arrows, the **critical path** in red, float, milestones and **baselines** (save one, then see how far each item has slipped). **WBS / IMS** holds the outline with durations in work days and predecessors ("3", "3SS", "3FS+2"). Two styles: **MS Project-style WBS** or **DoD IMS** (event → significant accomplishment → accomplishment criteria → task). Build it from the project\'s tasks, from your milestones, or draft it with AI. Export to **Excel** or **MS Project XML** (open it in Microsoft Project).\n\n## Resources and budget\n\n**Resources** shows each person\'s load per week against their capacity (allocations plus estimated work they own; Atlas team plans too). **Budget** holds planned lines and actual costs and works out **earned value**: CPI (cost efficiency), SPI (schedule efficiency) and the estimate at completion. Approved **change requests** add to the budget.\n\n## Templates and meeting notes\n\n**All projects → Templates** creates a project with tasks, dependencies, RACI roles and risks from a template (client onboarding, ATO package, software release, proposal response — or save your own). **Action items from meeting notes** reads a note, finds who committed to what, and creates the tasks and delegations.'});
  }}catch(_){}
})();
