// LevelUp client, file 3 of 7: Notes (folders, list, editor, links and graph, version history, wiki-links).
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
// Rehydrate persisted Notes page state from D.prefs.pageViews.notes.
const _notesRestored=_restorePageState('notes');
let _notesMyOnly=_notesRestored.myOnly===true;
let _notesGroupBy=_notesRestored.groupBy||'';
let _notesFilterText='';
let _notesFilterTags=new Set();
let _notesFilterSources=new Set();
let _notesFilterDatePreset='';
let _notesFilterDateFrom='';
let _notesFilterDateTo='';
let _notesSort=_notesRestored.sort||'newest';
let _notesFilterPanelOpen=false;
let _notesFilterCategory=_notesRestored.category||'Recent'; // Active left-nav category
let _notesFilterSmart=_notesRestored.smart||null; // Active smart folder filter key
let _notesFilterFolder=typeof _notesRestored.folder==='number'?_notesRestored.folder:null; // Active user-folder filter (id)
let _notesFilterStatus=_notesRestored.status||null; // Active lifecycle filter (fleeting/literature/evergreen/archived)
function filterNotesByStatus(s){
  _notesFilterStatus=(_notesFilterStatus===s?null:s);
  // Lifecycle is independent of category/smart — clear smart so it doesn't
  // double-filter, keep folder context.
  _notesFilterSmart=null;
  _persistPageState('notes',{status:_notesFilterStatus,smart:null});
  if(typeof renderNotes==='function')renderNotes();else applyNotesFilters();
}
// ─── User folders (D.prefs.noteFolders) ───────────────────────────────
function _noteFolders(){return (D.prefs&&D.prefs.noteFolders)||[];}
function _noteFolderById(id){return _noteFolders().find(f=>f.id===id);}
function _noteFoldersChildrenOf(parentId){return _noteFolders().filter(f=>(f.parentId||null)===(parentId||null));}
function _noteFolderPath(id){const out=[];let cur=_noteFolderById(id);let safe=10;while(cur&&safe-->0){out.unshift(cur);cur=cur.parentId?_noteFolderById(cur.parentId):null;}return out;}
function _noteFolderFlatList(){
  // Flattened list with depth so the folder picker can show indentation.
  const out=[];const walk=(parentId,depth)=>{
    _noteFoldersChildrenOf(parentId).forEach(f=>{out.push({f,depth});walk(f.id,depth+1);});
  };walk(null,0);return out;
}
function addNoteFolder(parentId){
  const parent=parentId?_noteFolderById(parentId):null;
  const name=prompt(parent?`New subfolder under "${parent.name}":`:'New folder name:');
  if(!name||!name.trim())return;
  D.prefs=D.prefs||{};D.prefs.noteFolders=D.prefs.noteFolders||[];
  const id=Math.max(0,...D.prefs.noteFolders.map(f=>f.id||0))+1;
  D.prefs.noteFolders.push({id,name:name.trim(),icon:'📁',color:'#3b82f6',parentId:parentId||null});
  save('prefs');renderNotes();
}
function renameNoteFolder(id){
  const f=_noteFolderById(id);if(!f)return;
  const name=prompt('Rename folder:',f.name);if(!name||!name.trim())return;
  f.name=name.trim();save('prefs');renderNotes();
}
function changeNoteFolderIcon(id){
  const f=_noteFolderById(id);if(!f)return;
  openEmojiPicker({title:`Icon for "${f.name}"`,current:f.icon||'📁',onPick:function(e){f.icon=e||'📁';save('prefs');renderNotes();}});
}
function deleteNoteFolder(id){
  const f=_noteFolderById(id);if(!f)return;
  const childCount=_noteFoldersChildrenOf(id).length;
  const noteCount=D.notes.filter(n=>n.folderId===id).length;
  const msg=(childCount||noteCount)?`Delete "${f.name}"? ${noteCount} note${noteCount===1?'':'s'} will move to (no folder)${childCount?', '+childCount+' subfolder'+(childCount===1?'':'s')+' will move up to its parent':''}.`:`Delete folder "${f.name}"?`;
  if(!confirm(msg))return;
  _noteFoldersChildrenOf(id).forEach(c=>c.parentId=f.parentId||null);
  D.notes.filter(n=>n.folderId===id).forEach(n=>delete n.folderId);
  D.prefs.noteFolders=D.prefs.noteFolders.filter(x=>x.id!==id);
  if(_notesFilterFolder===id){_notesFilterFolder=null;_persistPageState('notes',{folder:null});}
  save('prefs');save('notes');renderNotes();
}
function setNotesFolderFilter(id){
  _notesFilterFolder=id;
  _notesFilterCategory='Recent';_notesFilterSmart=null;
  _persistPageState('notes',{folder:id,category:'Recent',smart:null});
  renderNotes();
}
function clearNotesFolderFilter(){setNotesFolderFilter(null);}
// Shared folder picker modal — used by single-note Move (editor) and bulk Move
let _movePickerCallback=null;
function _openFolderPicker(title,currentFolderId,callback){
  _movePickerCallback=callback;
  const folders=_noteFolderFlatList();
  const m=document.getElementById('modal-content');if(!m)return;
  const row=(label,fid,depth,icon,color)=>{
    const isSelected=(fid===currentFolderId)||(fid===null&&!currentFolderId);
    return `<div class="lr move-folder-row" style="cursor:pointer;padding:7px 10px;padding-left:${10+depth*16}px;border-radius:6px;${isSelected?'background:var(--acs);border:1px solid var(--ac);color:var(--ac);font-weight:600':'border:1px solid transparent'}" onmouseover="if(!this.style.background.includes('acs'))this.style.background='var(--s3)'" onmouseout="if(!this.style.background.includes('acs'))this.style.background=''" onclick="_pickMoveFolder(${fid===null?'null':fid})"><span style="color:${color||'var(--t3)'};font-size:12px;width:16px;text-align:center">${icon}</span><span style="flex:1">${esc(label)}</span>${isSelected?'<span style="font-size:11px">✓</span>':''}</div>`;
  };
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:8px">${esc(title)}</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Pick a destination folder. Notes outside any folder show in the default Recent / category views.</div>
    <div style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
      ${row('No folder',null,0,'↩','var(--t3)')}
      ${folders.length?folders.map(({f,depth})=>row(f.name,f.id,depth,f.icon||'📁',f.color||'var(--ac)')).join(''):'<div style="font-size:11px;color:var(--t3);padding:14px;text-align:center">No folders yet. Add one in the Notes nav with the + next to "📁 Folders".</div>'}
    </div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="_movePickerCallback=null;closeModal()">Cancel</button></div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _pickMoveFolder(folderId){
  const cb=_movePickerCallback;_movePickerCallback=null;
  closeModal();
  if(cb)cb(folderId);
}
function moveNoteToFolder(noteId){
  const n=D.notes.find(x=>x.id===noteId);if(!n)return;
  _openFolderPicker(`📁 Move "${n.title||'(untitled)'}"`,n.folderId||null,fid=>{
    if(fid)n.folderId=fid;else delete n.folderId;
    save('notes');
    if(typeof renderNotes==='function')renderNotes();
    if(typeof showNoteInEditor==='function'&&curScreen==='notes')setTimeout(()=>showNoteInEditor(noteId),50);
    const f=fid?_noteFolderById(fid):null;
    toast(f?`📁 Moved to "${f.name}"`:'📁 Removed from folder');
  });
}
function bulkNotesMove(){
  const arr=_bulkNotesArr();if(!arr.length)return toast('Nothing selected');
  // Compute the "current" folder if all selected notes share one — otherwise null
  const fids=new Set(arr.map(n=>n.folderId||null));
  const sharedFolder=fids.size===1?[...fids][0]:null;
  _openFolderPicker(`📁 Move ${arr.length} note${arr.length===1?'':'s'}`,sharedFolder,fid=>{
    arr.forEach(n=>{if(fid)n.folderId=fid;else delete n.folderId;});
    save('notes');
    toggleNotesBulkMode();
    if(typeof renderNotes==='function')renderNotes();
    const f=fid?_noteFolderById(fid):null;
    toast(f?`📁 Moved ${arr.length} note${arr.length===1?'':'s'} to "${f.name}"`:`📁 Removed ${arr.length} note${arr.length===1?'':'s'} from folder`);
  });
}
function assignNoteToFolder(noteId,folderId){
  const n=D.notes.find(x=>x.id===noteId);if(!n)return;
  if(folderId)n.folderId=folderId;else delete n.folderId;
  save('notes');
  if(typeof renderNotes==='function')renderNotes();
  const f=folderId?_noteFolderById(folderId):null;
  toast(f?`📁 Moved to "${f.name}"`:'📁 Removed from folder');
}
// ─── Touch-drag helper ───────────────────────────────────────────────
// HTML5 drag-and-drop doesn't work on iOS / most touch devices. This
// installs a single touchstart→touchmove→touchend listener on the
// document that synthesizes drag/drop events for any element with a
// `data-touch-drag` attribute. The element's [data-touch-drag] value
// names a CSS selector for valid drop targets (e.g. ".my-drop-zone").
// On long-press (550ms), a ghost element follows the finger; on
// touchend the topmost element under the finger matching the selector
// fires its `ondrop` handler with a synthesized event whose dataTransfer
// has the original element id. Synced visually via .lu-touch-drop-target.
(function installTouchDrag(){
  let _src=null,_ghost=null,_lpTimer=null,_dropSel=null,_lastOver=null,_dragId=null;
  function startDrag(srcEl,touch){
    // Default selector: anything with an inline ondrop handler. Works for
    // every existing HTML5-drag drop target without requiring a marker attr.
    _src=srcEl;_dropSel=srcEl.getAttribute('data-touch-drag-targets')||'[data-touch-drop],[ondrop]';
    _dragId=srcEl.getAttribute('data-task-id')||srcEl.getAttribute('data-nid')||srcEl.getAttribute('data-project-id')||srcEl.getAttribute('data-home-id')||srcEl.dataset.id||'';
    _ghost=document.createElement('div');_ghost.className='lu-touch-ghost';
    _ghost.textContent=(srcEl.textContent||srcEl.getAttribute('aria-label')||'Item').trim().slice(0,80);
    _ghost.style.left=touch.clientX+'px';_ghost.style.top=touch.clientY+'px';
    document.body.appendChild(_ghost);
    if('vibrate' in navigator)try{navigator.vibrate(20);}catch(_){}
    // Fire dragstart on the source so existing handlers initialize state
    const dt=new DataTransfer();try{dt.setData('text/plain',_dragId);}catch(_){}
    const ev=new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt});
    srcEl.dispatchEvent(ev);
  }
  function moveDrag(touch){
    if(!_ghost)return;
    _ghost.style.left=touch.clientX+'px';_ghost.style.top=touch.clientY+'px';
    _ghost.style.display='none';
    const under=document.elementFromPoint(touch.clientX,touch.clientY);
    _ghost.style.display='';
    const target=under&&_dropSel?under.closest(_dropSel):null;
    if(_lastOver&&_lastOver!==target){_lastOver.classList.remove('lu-touch-drop-target');const lev=new DragEvent('dragleave',{bubbles:true});_lastOver.dispatchEvent(lev);}
    if(target){target.classList.add('lu-touch-drop-target');const dt=new DataTransfer();try{dt.setData('text/plain',_dragId);}catch(_){}const oev=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt});target.dispatchEvent(oev);}
    _lastOver=target;
  }
  function endDrag(touch){
    if(!_src)return;
    if(_ghost){_ghost.remove();_ghost=null;}
    if(_lastOver){
      const dt=new DataTransfer();try{dt.setData('text/plain',_dragId);}catch(_){}
      const dev=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:touch.clientX,clientY:touch.clientY});
      _lastOver.dispatchEvent(dev);
      _lastOver.classList.remove('lu-touch-drop-target');
    }
    const eev=new DragEvent('dragend',{bubbles:true});_src.dispatchEvent(eev);
    _src=null;_lastOver=null;_dragId=null;
  }
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const src=e.target.closest('[data-touch-drag],[draggable="true"]');
    if(!src)return;
    // Skip if the target is an interactive control inside the draggable
    if(e.target.closest('button,input,select,textarea,a'))return;
    const t=e.touches[0];
    if(_lpTimer)clearTimeout(_lpTimer);
    _lpTimer=setTimeout(()=>{startDrag(src,t);},550);
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(_lpTimer&&!_src){clearTimeout(_lpTimer);_lpTimer=null;return;}
    if(_src&&e.touches[0]){e.preventDefault();moveDrag(e.touches[0]);}
  },{passive:false});
  document.addEventListener('touchend',e=>{
    if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}
    if(_src){const t=(e.changedTouches&&e.changedTouches[0])||{clientX:0,clientY:0};endDrag(t);}
  },{passive:true});
  document.addEventListener('touchcancel',()=>{if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}if(_src){if(_ghost){_ghost.remove();_ghost=null;}_src=null;_lastOver=null;}},{passive:true});
})();

// ─── Right-rail builders (Mail / Calendar / Clusters) ────────────────
function _populateMailRail(){
  const r=document.getElementById('mail-rail');if(!r)return;
  const inbox=(typeof _getMailItems==='function'?_getMailItems():[]);
  const unread=inbox.filter(m=>!m.read).length;
  const todayEvents=_calEventsOn(new Date()).slice(0,5);
  const senders={};inbox.slice(0,200).forEach(m=>{const f=m.fromName||m.from||m.fromEmail||'(unknown)';senders[f]=(senders[f]||0)+1;});
  const topSenders=Object.entries(senders).sort((a,b)=>b[1]-a[1]).slice(0,5);
  r.innerHTML=`
  <div style="font-size:13px;font-weight:700;margin-bottom:10px">${_icon('barChart',14,'currentColor')} Inbox at a glance</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ac)">${inbox.length}</div><div style="font-size:11px;color:var(--t3)">Total</div></div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${unread?'var(--warn)':'var(--ok)'}">${unread}</div><div style="font-size:11px;color:var(--t3)">Unread</div></div>
  </div>
  <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px">${_icon('calendar',14,'currentColor')} Today's events</div>
    ${todayEvents.length?todayEvents.map(e=>`<div class="lr" style="padding:4px 0;font-size:11px;cursor:pointer" onclick="${_calChipClick(e)}"><span style="font-size:11px;color:var(--ac);width:42px;flex-shrink:0">${esc(_calEventTimeLabel(e))||'—'}</span><span class="rt" style="font-size:11px">${esc(e.title||'(untitled)')}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">No events today.</div>'}
  </div>
  ${topSenders.length?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:6px">👥 Top senders</div>${topSenders.map(([n,c])=>`<div class="lr" style="padding:3px 0;font-size:11px"><span class="rt">${esc(n.slice(0,32))}</span><span style="font-size:11px;color:var(--t3)">${c}</span></div>`).join('')}</div>`:''}
  <div style="display:flex;flex-direction:column;gap:6px">
    <button class="btn btn-p" style="font-size:11px" onclick="openComposeModal()">✏ Compose</button>
    <button class="btn btn-s" style="font-size:11px" onclick="syncOAuthMail('microsoft')">☁ Sync now</button>
    <button class="btn btn-s" style="font-size:11px;color:var(--ac)" onclick="aiTriageMail()">✨ AI Triage</button>
  </div>`;
}
function _populateCalRail(){
  const r=document.getElementById('cal-rail');if(!r)return;
  const today=_todayStr;
  const todayTasks=D.tasks.filter(t=>t.status!=='Done'&&(t.due===today||t.startDate===today||t.myDay)).slice(0,6);
  const upcoming=[];
  for(let i=0;i<7&&upcoming.length<6;i++){const d=new Date();d.setDate(d.getDate()+i);_calEventsOn(d).forEach(e=>{if(upcoming.length<6)upcoming.push({e,dateLabel:_ymd(d).slice(5)});});}
  r.innerHTML=`
  <div style="font-size:13px;font-weight:700;margin-bottom:10px">${_icon('list',14,'currentColor')} Today + 7 days</div>
  <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px">✓ Tasks for today</div>
    ${todayTasks.length?todayTasks.map(t=>`<div class="lr" style="padding:4px 0;font-size:11px;cursor:pointer" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority||'M'}</span><span class="rt" style="font-size:11px">${esc(t.title)}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">Nothing scheduled.</div>'}
  </div>
  <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;margin-bottom:6px">${_icon('calendar',14,'currentColor')} Upcoming events</div>
    ${upcoming.length?upcoming.map(o=>`<div class="lr" style="padding:4px 0;font-size:11px"><span style="width:54px;flex-shrink:0;font-size:11px;color:var(--t3)">${esc(o.dateLabel)} ${esc(_calEventTimeLabel(o.e))}</span><span class="rt" style="font-size:11px">${esc(o.e.title||'(untitled)')}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">No events in the next 7 days.</div>'}
  </div>
  <div style="display:flex;flex-direction:column;gap:6px">
    <button class="btn btn-p" style="font-size:11px" onclick="openNewCalEventModal()">+ New event</button>
    <button class="btn btn-s" style="font-size:11px;color:var(--ac)" onclick="aiCalNLP()">💬 NL Event</button>
    <button class="btn btn-s" style="font-size:11px;color:var(--purp)" onclick="aiScheduleOptimize()">✨ Optimize day</button>
  </div>`;
}
function _populateClustersRail(){
  const r=document.getElementById('clusters-rail');if(!r)return;
  const cls=D.clusters||[];
  const today=_todayStr;
  const allTasks=D.tasks||[];
  const totalActive=allTasks.filter(t=>t.status!=='Done'&&t.status!=='Someday').length;
  const overdue=allTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
  // Per-cluster progress
  const ranked=cls.map(cl=>{
    const projIds=new Set(cl.projectIds||[]);
    const allInCl=allTasks.filter(t=>t.clusterId===cl.id||(t.projectId&&projIds.has(t.projectId)));
    const done=allInCl.filter(t=>t.status==='Done').length;
    const ovd=allInCl.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
    return {cl,done,total:allInCl.length,ovd,pct:allInCl.length?Math.round(done/allInCl.length*100):0};
  }).sort((a,b)=>b.ovd-a.ovd||a.pct-b.pct);
  r.innerHTML=`
  <div style="font-size:13px;font-weight:700;margin-bottom:10px">⬡ Cluster Insights</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ac)">${cls.length}</div><div style="font-size:11px;color:var(--t3)">Clusters</div></div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;text-align:center"><div style="font-size:20px;font-weight:700;color:${overdue?'var(--red)':'var(--ok)'}">${overdue}</div><div style="font-size:11px;color:var(--t3)">Overdue</div></div>
  </div>
  ${ranked.length?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">Needs attention</div>${ranked.slice(0,5).map(r=>`<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${esc(r.cl.icon||'📁')} ${esc(r.cl.name||r.cl.title||'(unnamed)')}</span><strong style="color:${r.ovd?'var(--red)':r.pct>=70?'var(--ok)':'var(--ac)'}">${r.ovd?r.ovd+' overdue':r.pct+'%'}</strong></div><div class="pb"><div class="f" style="width:${r.pct}%;background:${r.pct>=70?'var(--ok)':'var(--ac)'}"></div></div></div>`).join('')}</div>`:''}
  <div style="display:flex;flex-direction:column;gap:6px">
    <button class="btn btn-p" style="font-size:11px" onclick="openClusterModal(null)">+ New cluster</button>
    <button class="btn btn-s" style="font-size:11px" onclick="nav('tasks');setTaskView('clusters')">⬡ Open Cluster view</button>
  </div>`;
}
// Notes mobile pane switcher (Folders / List / Editor / Links).
// Body class drives which pane is visible on phones (≤900px).
function setNotesMobilePane(pane){
  if(!['folders','list','editor','rail'].includes(pane))pane='list';
  document.body.classList.remove('notes-pane-folders','notes-pane-list','notes-pane-editor','notes-pane-rail');
  document.body.classList.add('notes-pane-'+pane);
  document.querySelectorAll('#notes-mobile-tabs button').forEach(b=>{b.classList.toggle('on',b.dataset.pane===pane);});
  // Persist last pane so reopening Notes shows the same view
  try{D.prefs=D.prefs||{};D.prefs.notesMobilePane=pane;save('prefs');}catch(_){}
}
// Apply the persisted mobile pane on initial Notes render so users don't
// always land on the editor.
function _applyNotesMobilePane(){
  const stored=(D.prefs&&D.prefs.notesMobilePane)||'list';
  setNotesMobilePane(stored);
}
// ─── Notes panel resize (nav / list / rail are user-sizable) ──────────
const _notesDefaultWidths={nav:160,list:240,rail:200};
// Hard minimums / maximums per panel. Must match _notesResizeStart's limits
// so a width persisted under earlier code (or out-of-range from a sync
// round-trip) can't render the panel as a sliver that hides folder names
// AND covers the resize handle.
const _notesWidthLimits={nav:[100,360],list:[160,520],rail:[140,420]};
function _notesGetWidths(){
  const raw=Object.assign({},_notesDefaultWidths,(D.prefs&&D.prefs.notesPanelWidths)||{});
  const w={};
  for(const k of ['nav','list','rail']){
    const [lo,hi]=_notesWidthLimits[k];
    const n=Number(raw[k])||_notesDefaultWidths[k];
    w[k]=Math.max(lo,Math.min(hi,n));
  }
  return w;
}
function _notesApplyWidths(){
  const w=_notesGetWidths();
  const bg=document.querySelector('#s-notes > .bg');
  if(bg)bg.style.gridTemplateColumns=`var(--side) ${w.nav}px ${w.list}px 1fr ${w.rail}px`;
}
// User-callable escape hatch in case the handles ever feel stuck. Resets
// ALL three panels to their factory defaults and saves. Exposed globally so
// the user can hit it from any keyboard / console fallback if the panel
// got too narrow to grab.
function resetNotesLayout(){
  D.prefs=D.prefs||{};
  D.prefs.notesPanelWidths=Object.assign({},_notesDefaultWidths);
  try{(window.save||save)('prefs');}catch(_){}
  _notesApplyWidths();
  if(typeof toast==='function')toast({type:'success',title:'✓ Notes layout reset',msg:'Nav 160 · List 240 · Rail 200',duration:2500});
}
window.resetNotesLayout=resetNotesLayout;
function _notesEnsureResizeHandles(){
  const targets=[
    {pid:'notes-nav-panel',which:'nav',side:'right'},
    {pid:'notes-list-panel',which:'list',side:'right'},
    {pid:'notes-rail-panel',which:'rail',side:'left'},
  ];
  targets.forEach(t=>{
    const el=document.getElementById(t.pid);if(!el)return;
    if(el.querySelector('.notes-resize'))return;
    const handle=document.createElement('div');
    handle.className=`notes-resize ${t.side}`;
    handle.setAttribute('title','Drag to resize · double-click to reset');
    handle.onmousedown=ev=>_notesResizeStart(ev,t.which);
    handle.ondblclick=ev=>{ev.preventDefault();_notesResetWidth(t.which);};
    el.appendChild(handle);
  });
}
function _notesResetWidth(which){
  D.prefs=D.prefs||{};
  D.prefs.notesPanelWidths=Object.assign({},_notesGetWidths(),{[which]:_notesDefaultWidths[which]});
  (window.save||save)('prefs');_notesApplyWidths();
  toast('Reset to default width');
}
// Apply persisted widths as soon as the DOM is parsed and again on any
// renderScreen('notes') so the columns never flash at the inline-HTML
// defaults — and so they sit correctly even before the first renderNotes.
document.addEventListener('DOMContentLoaded',()=>{try{_notesApplyWidths();}catch(_){}});
(function(){
  const _origRS=window.renderScreen;
  if(typeof _origRS!=='function')return;
  window.renderScreen=function(s){
    const r=_origRS.apply(this,arguments);
    if(s==='notes'){setTimeout(()=>{_notesApplyWidths();_notesEnsureResizeHandles();},30);}
    return r;
  };
})();
function _notesResizeStart(e,which){
  e.preventDefault();e.stopPropagation();
  const startX=e.clientX;
  const widths=Object.assign({},_notesGetWidths());
  const startW=widths[which];
  const limits={nav:[100,360],list:[160,520],rail:[140,420]}[which];
  // Dragging the rail handle right shrinks the rail (handle is on its LEFT edge).
  const dir=which==='rail'?-1:1;
  const handleEl=e.currentTarget;handleEl.classList.add('dragging');
  document.body.classList.add('notes-resizing');
  function onMove(ev){
    const dx=(ev.clientX-startX)*dir;
    widths[which]=Math.max(limits[0],Math.min(limits[1],startW+dx));
    const bg=document.querySelector('#s-notes > .bg');
    if(bg)bg.style.gridTemplateColumns=`var(--side) ${widths.nav}px ${widths.list}px 1fr ${widths.rail}px`;
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    handleEl.classList.remove('dragging');
    document.body.classList.remove('notes-resizing');
    D.prefs=D.prefs||{};D.prefs.notesPanelWidths=widths;
    // Explicit window.save resolves to the wrapped version that ALSO pushes
    // to the server (debounced 2s). The bare `save` reference can resolve to
    // the unwrapped local declaration in some scopes — be safe.
    try{(window.save||save)('prefs');}catch(_){try{localStorage.setItem('lu_prefs',JSON.stringify(D.prefs));}catch(__){}}
    toast('💾 Saved widths');
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
// Drag-to-folder
let _noteDragId=null;
function _noteCardDragStart(e,id){_noteDragId=id;try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));}catch(_){}}
function _noteCardDragEnd(){_noteDragId=null;document.querySelectorAll('.nn-folder.drag-target').forEach(el=>el.classList.remove('drag-target'));}
function _folderDragOver(e){if(!_noteDragId)return;e.preventDefault();try{e.dataTransfer.dropEffect='move';}catch(_){}e.currentTarget.classList.add('drag-target');}
function _folderDragLeave(e){e.currentTarget.classList.remove('drag-target');}
function _folderDrop(e,folderId){
  e.preventDefault();e.currentTarget.classList.remove('drag-target');
  if(!_noteDragId)return;
  assignNoteToFolder(_noteDragId,folderId);
  _noteDragId=null;
}
function buildNoteBacklinks(id){
  // Find notes whose body contains [[Title]] linking to this note
  const target=D.notes.find(n=>n.id===id);
  if(!target)return[];
  return D.notes.filter(n=>n.id!==id&&n.body&&n.body.includes('[['+target.title+']]'));
}
function buildNoteOutlinks(n){
  if(!n||!n.body)return[];
  const matches=[...n.body.matchAll(/\[\[([^\]]+)\]\]/g)].map(m=>m[1]);
  return matches.map(title=>D.notes.find(x=>x.title===title)).filter(Boolean);
}
// ── One note body (build -240) ──────────────────────────────────────────────
// bodyHtml IS the note. body is derived from it (markdown-ish text that
// search, backlinks, the graph, AI tools and exports read) and is never
// edited on its own — before -240 the drawer, Full Add and several tools
// wrote one or the other, so text could sit in body where nothing showed it.
// A note with no bodyHtml (older quick captures, markdown/OneNote imports)
// keeps its markdown in body until its first edit, which makes it rich.
// Every writer goes through _noteSetHtml / _noteSetMd.
const _noteBodySeen=new WeakMap(); // note → bodyHtml its body was derived from
function _noteHasHtml(n){return !!(n&&n.bodyHtml&&String(n.bodyHtml).trim());}
// Markdown (or HTML) → the HTML the editor and the display use. renderMd
// keeps links and images, which luRTE_mdToHtml drops.
function _noteMdToHtml(md){
  const s=String(md==null?'':md);
  if(!s.trim())return '';
  return _luRTE_isHtml(s)?luSanitizeHtml(s):renderMd(s);
}
// The note's body as HTML, whichever field holds it.
function _noteHtml(n){
  if(!n)return '';
  return _noteHasHtml(n)?String(n.bodyHtml):_noteMdToHtml(n.body||'');
}
function _noteTouch(n){const t=new Date().toISOString();n.updatedAt=t;n.updated=t;}
function _noteSetHtml(n,html,opts){
  if(!n)return;
  const h=luSanitizeHtml(html||'');
  n.bodyHtml=h;
  n.body=h?luRTE_htmlToMd(h):'';
  _noteBodySeen.set(n,h);
  if(!(opts&&opts.keepTime))_noteTouch(n);
}
function _noteSetMd(n,md,opts){_noteSetHtml(n,_noteMdToHtml(md),opts);}
// Words (3+ letters/digits) for comparing what two versions of a body say.
function _noteWords(s){return String(s||'').toLowerCase().replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/g,' ').match(/[\p{L}\p{N}]{3,}/gu)||[];}
// Lines of `body` that the rich body does not show (mostly words it lacks).
function _noteHiddenLines(body,html){
  const have=new Set(_noteWords(luRTE_htmlToMd(html)));
  const all=new Set(_noteWords(body));
  if(!all.size)return '';
  let missing=0;all.forEach(w=>{if(!have.has(w))missing++;});
  if(missing<5||missing/all.size<0.2)return '';
  const keep=String(body).split('\n').filter(l=>{
    const ws=_noteWords(l);if(!ws.length)return false;
    return ws.filter(w=>!have.has(w)).length/ws.length>0.5;
  });
  return keep.join('\n').trim();
}
// Make body agree with bodyHtml. Text that only body held (written there by
// an older tool after the note became rich) is moved into the visible body
// under a labelled divider first, so nothing is lost. Returns true if the
// note changed. Cheap after the first pass: notes whose bodyHtml hasn't
// changed since the last call are skipped.
function _noteNormalize(n){
  if(!_noteHasHtml(n))return false;
  let h=String(n.bodyHtml);
  if(_noteBodySeen.get(n)===h)return false;
  let changed=false;
  const hidden=n.body?_noteHiddenLines(n.body,h):'';
  if(hidden){
    h+='<hr><p><em>Text saved with this note that wasn’t showing until now:</em></p>'+_noteMdToHtml(hidden);
    n.bodyHtml=h;changed=true;
  }
  const d=luRTE_htmlToMd(h);
  if(n.body!==d){n.body=d;changed=true;}
  _noteBodySeen.set(n,h);
  return changed;
}
// "Just now" / "2h ago" were stored as the update time and never aged.
function _noteFixRelTime(n){
  const u=n&&n.updated;
  if(typeof u!=='string'||!/^(just now|today|yesterday|this week|last week|\d+\s*\w+\s+ago)$/i.test(u.trim()))return false;
  const best=n.updatedAt||n.createdAt||(typeof n.id==='number'&&n.id>1e12?new Date(n.id).toISOString():'');
  if(!best)return false;
  n.updated=best;return true;
}
function _noteNormalizeAll(){
  let c=0;(D.notes||[]).forEach(n=>{if(!n)return;let ch=_noteNormalize(n);if(_noteFixRelTime(n))ch=true;if(ch)c++;});
  return c;
}
// Plain text of a note (strip html/markdown) for context extraction.
function _noteText(n){
  let s=String(n.bodyHtml?n.bodyHtml.replace(/<[^>]+>/g,' '):(n.body||''));
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
}
// Pull the sentence/snippet around the first occurrence of `needle`.
function _ctxAround(text,needle){
  const lc=text.toLowerCase(),i=lc.indexOf(needle.toLowerCase());
  if(i<0)return '';
  const a=Math.max(0,i-70),b=Math.min(text.length,i+needle.length+90);
  let s=(a>0?'…':'')+text.slice(a,b)+(b<text.length?'…':'');
  return esc(s).replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),m=>`<mark>${m}</mark>`);
}
// Notes that [[link]] to this note, with the surrounding sentence.
function _noteBacklinksRich(id){
  const t=D.notes.find(n=>n.id===id);if(!t||!t.title)return[];
  const token='[['+t.title+']]';
  return D.notes.filter(n=>n.id!==id&&((n.body||'')+(n.bodyHtml||'')).includes(token))
    .map(n=>({id:n.id,title:n.title||'(untitled)',ctx:_ctxAround(_noteText(n).replace(/\[\[([^\]]+)\]\]/g,'$1'),t.title)}));
}
// Notes whose plain text NAMES this note's title but do NOT [[link]] it.
function _noteUnlinkedMentions(id){
  const t=D.notes.find(n=>n.id===id);
  if(!t||!t.title||t.title.trim().length<4)return[];
  const title=t.title.trim(),tl=title.toLowerCase(),token=('[['+title+']]').toLowerCase();
  const out=[];
  D.notes.forEach(n=>{
    if(n.id===id)return;
    const raw=((n.body||'')+' '+(n.bodyHtml||'')).toLowerCase();
    if(raw.includes(token))return;            // already linked
    if(_noteText(n).toLowerCase().includes(tl))out.push({id:n.id,title:n.title||'(untitled)'});
  });
  return out;
}
// Materialize an unlinked mention: wrap the first plain-text occurrence of
// `targetTitle` inside note `fromId` with [[ ]] (skips text already in [[..]]).
// Wrap plain-text mentions of `title` in the note's HTML body with [[ ]].
// Works on text nodes, so markup is untouched; text already inside [[…]]
// and inside links is skipped. `all` wraps every mention, else the first.
// Returns how many were wrapped (the note is saved by the caller).
function _noteWrapMentions(n,title,all){
  const t=String(title||'').trim();if(!n||!t)return 0;
  const root=luParseInert(_noteHtml(n));
  const tl=t.toLowerCase();
  const re=new RegExp('(^|[^\\p{L}\\p{N}])('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')(?![\\p{L}\\p{N}])','iu');
  const w=root.ownerDocument.createTreeWalker(root,4);
  const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
  let count=0;
  for(const node of nodes){
    if(node.parentNode&&node.parentNode.closest&&node.parentNode.closest('a,code,pre'))continue;
    // Split around existing [[…]] so text already linked is left alone; a
    // wrap may also create a new [[…]] that the next search must skip.
    let segs=node.textContent.split(/(\[\[[^\]]*\]\])/g),hit=false;
    for(let i=0;i<segs.length;i++){
      if(/^\[\[[^\]]*\]\]$/.test(segs[i]))continue;
      let m;
      while((m=re.exec(segs[i]))){
        const at=m.index+m[1].length;
        const parts=[segs[i].slice(0,at),'[['+segs[i].slice(at,at+t.length)+']]',segs[i].slice(at+t.length)];
        segs.splice(i,1,...parts);i+=2;hit=true;count++;
        if(!all)break;
      }
      if(hit&&!all)break;
    }
    if(hit)node.textContent=segs.join('');
    if(hit&&!all)break;
  }
  if(count)_noteSetHtml(n,root.innerHTML);
  return count;
}
function linkUnlinkedMention(fromId,targetTitle){
  const n=D.notes.find(x=>x.id===fromId);if(!n)return;
  if(!_noteWrapMentions(n,targetTitle,false)){toast('Mention not found in the note text.');return;}
  save('notes');
  toast('🔗 Linked from “'+(n.title||'note')+'”');
  const cur=document.querySelector('.nc.on');
  if(cur&&cur.dataset.nid)showNoteInEditor(Number(cur.dataset.nid));
}
function _renderNotesBacklinkRail(id){
  const bl=_noteBacklinksRich(id);
  const um=_noteUnlinkedMentions(id).slice(0,12);
  let h=`<div class="rail-sec">⛓ Linked references <span class="n">${bl.length}</span></div>
  <div class="rail-note">Notes that <b>[[link]]</b> to this one.</div>`;
  h+= bl.length
    ? bl.map(b=>`<div class="bl-card" onclick="showNoteInEditor(${b.id})"><div class="blt">${esc(b.title)}</div>${b.ctx?`<div class="blx">${b.ctx}</div>`:''}</div>`).join('')
    : `<div class="rail-note" style="font-style:italic">None yet. Reference this note as <code>[[${esc((D.notes.find(n=>n.id===id)||{}).title||'')}]]</code> elsewhere.</div>`;
  h+=`<div style="height:1px;background:var(--bd1);margin:18px 0"></div>
  <div class="rail-sec">✦ Unlinked mentions <span class="n ${um.length?'':'dim'}">${um.length}</span></div>
  <div class="rail-note">Notes that name this one without linking.</div>`;
  const tt=((D.notes.find(n=>n.id===id)||{}).title||''); // escaped where it is used (_jsAttr)
  h+= um.length
    ? um.map(u=>`<div class="bl-um"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(u.title)}</span><span class="lk" onclick="event.stopPropagation();linkUnlinkedMention(${u.id},'${_jsAttr(tt)}')">+ Link</span></div>`).join('')
    : `<div class="rail-note" style="font-style:italic">No unlinked mentions.</div>`;
  return h;
}
function renderNotesGraph(id){
  const n=D.notes.find(x=>x.id===id);
  if(!n)return '<div style="font-size:11px;color:var(--t3);text-align:center;padding:8px">Select a note</div>';
  const backlinks=buildNoteBacklinks(id);
  const outlinks=buildNoteOutlinks(n);
  const all=[...backlinks,...outlinks];
  if(!all.length)return '<div style="font-size:11px;color:var(--t3);text-align:center;padding:8px">No links. Use [[Note Title]] to link.</div>';
  const cx=80,cy=50,r=30;
  const nodes=[{id,title:n.title,x:cx,y:cy,main:true}];
  const links=[];
  const placed=new Set([id]);
  const total=all.length;
  all.forEach((ln,i)=>{
    if(placed.has(ln.id))return;
    placed.add(ln.id);
    const angle=(i/total)*2*Math.PI-Math.PI/2;
    nodes.push({id:ln.id,title:ln.title,x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle),main:false});
    links.push({from:id,to:ln.id,back:backlinks.includes(ln)});
  });
  const svgLinks=links.map(l=>{
    const from=nodes.find(x=>x.id===l.from);
    const to=nodes.find(x=>x.id===l.to);
    return`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${l.back?'#8B5CF6':'#3B82F6'}" stroke-width="1" opacity="0.6"/>`;
  }).join('');
  const svgNodes=nodes.map(nd=>{
    const short=nd.title.length>8?nd.title.slice(0,8)+'…':nd.title;
    return`<g style="cursor:pointer" onclick="showNoteInEditor(${nd.id})">
      <circle cx="${nd.x}" cy="${nd.y}" r="${nd.main?7:5}" fill="${nd.main?'#3B82F6':'#64748B'}" opacity="0.9"/>
      <text x="${nd.x}" y="${nd.y+14}" text-anchor="middle" font-size="6" fill="var(--t2)">${esc(short)}</text>
    </g>`;
  }).join('');
  return`<svg viewBox="0 0 160 100" style="width:100%;height:80px">${svgLinks}${svgNodes}</svg>`;
}
function filterNotesByCategory(cat,el){
  document.querySelectorAll('.notes-nav .nn').forEach(e=>e.classList.remove('on'));
  if(el)el.classList.add('on');
  _notesFilterCategory=cat;
  // Reset smart-folder override
  _notesFilterSmart=null;
  _persistPageState('notes',{category:cat,smart:null});
  applyNotesFilters();
}
// Notes: persist-aware setter wrappers
function setNotesScope(my){_notesMyOnly=!!my;_persistPageState('notes',{myOnly:_notesMyOnly});if(typeof renderNotes==='function')renderNotes();}
function setNotesSort(v){_notesSort=v||'newest';_persistPageState('notes',{sort:_notesSort});applyNotesFilters();}
function setNotesGroupBy(v){_notesGroupBy=v||'';_persistPageState('notes',{groupBy:_notesGroupBy});applyNotesFilters();}
// opts.quiet: don't switch the phone layout to the editor pane (used when the
// page itself re-renders, not when the user picked a note).
function showNoteInEditor(id,opts){
  const n=D.notes.find(x=>String(x.id)===String(id));
  if(!n)return;
  // Save the note being left (the editor saves itself, -242); a renamed
  // note's links follow (-243).
  _noteTitleCommit();
  // On phones, jump to the editor pane so the user actually SEES the note.
  if(!(opts&&opts.quiet)&&window.matchMedia&&window.matchMedia('(max-width:900px)').matches&&typeof setNotesMobilePane==='function'){setNotesMobilePane('editor');}
  // Highlight selected
  document.querySelectorAll('.nc').forEach(el=>el.classList.remove('on'));
  const el=document.querySelector(`.nc[data-nid="${CSS.escape(String(n.id))}"]`);
  if(el)el.classList.add('on');
  // Remember where the note being left was scrolled to; come back there.
  const ed=$('notes-editor-panel')||document.querySelector('.notes-editor');
  if(ed&&_noteInlineEditId!=null)_noteScrollMem[String(_noteInlineEditId)]=ed.scrollTop;
  _noteInlineEditId=n.id;
  _notesRememberOpen(n.id);
  // Render in editor pane
  if(ed){ed.innerHTML=renderNoteEditor(n);ed.scrollTop=_noteScrollMem[String(n.id)]||0;}
  const body=document.getElementById('nie-body');
  if(body){
    body.dataset.nid=String(n.id);
    body.addEventListener('click',_noteEditorClick);
    body.addEventListener('blur',()=>{if(_noteAutosaveTimer)_noteAutosaveNow();});
    _noteDecorateLinks(body); // chips are not editable text (the sanitizer drops that attribute)
    _noteEditorBase={id:n.id,title:n.title||'',titleAtOpen:n.title||'',html:body.innerHTML};
  }else _noteEditorBase=null;
  // Hydrate the chip linker; add/remove auto-saves to the note.
  if(document.getElementById('note-inline-links')&&typeof _drInitLinks==='function'){
    _drInitLinks({
      projects:n.linkedProjectIds||[],
      goals:n.linkedGoalIds||[],
      tasks:n.linkedTaskIds||[],
      notes:n.linkedNoteIds||[],
      bookmarks:n.linkedBookmarkIds||[],
      journal:n.linkedJournalIds||[],
    },n.id);
    _drLinksAutoSaveNoteId=n.id;
    setTimeout(()=>_drRenderTaskLinks('note-inline-links'),0);
  } else {
    _drLinksAutoSaveNoteId=null;
  }
  // Update backlink graph in rail
  const gc=document.getElementById('notes-graph-container');
  if(gc)gc.innerHTML=renderNotesGraph(n.id);
  const bp=document.getElementById('notes-backlinks-panel');
  if(bp)bp.innerHTML=_renderNotesBacklinkRail(n.id);
  // A search is on: show where it matched in this note (-244).
  _noteHighlightOpen();
}
// When set, the chip linker writes through to D.notes[].linked*Ids on every
// add/remove instead of waiting for a Save button. Used by the inline note
// editor, which has no Save action.
let _drLinksAutoSaveNoteId=null;
// ─── Unified Notes Filter Engine ─────────────────────────────────────────────
// ─── Note polish helpers ────────────────────────────────────────────────
// Color palette for note color tags (small dot shown on the list card +
// editor). Stored in n.color as a hex string. Empty string = no color.
const NOTE_COLOR_PALETTE=[
  {name:'None',value:''},
  {name:'Red',value:'#ef4444'},
  {name:'Orange',value:'#f97316'},
  {name:'Amber',value:'#eab308'},
  {name:'Green',value:'#22c55e'},
  {name:'Cyan',value:'#06b6d4'},
  {name:'Blue',value:'#3b82f6'},
  {name:'Purple',value:'#a855f7'},
  {name:'Pink',value:'#ec4899'},
];
// ── Note lifecycle (Zettelkasten-style) ──────────────────────────────────
// Stored on n.status. Unset notes are treated as "fleeting" so the user can
// triage their existing 187 notes upward over time.
const _NOTE_STATUSES=[
  {id:'fleeting',  label:'Fleeting',  icon:'🌱', color:'#fbbf24', hint:'Quick capture — not yet processed'},
  {id:'literature',label:'Literature',icon:'📑', color:'#10b981', hint:'Notes on a source / in progress'},
  {id:'evergreen', label:'Evergreen', icon:'🌳', color:'#34d399', hint:'Refined, self-contained, linked'},
  {id:'archived',  label:'Archived',  icon:'🗄', color:'#64748b', hint:'Kept for reference, out of flow'},
];
const _NOTE_TYPES=['Permanent','Literature','Reference','Index / MOC','Meeting','Journal','Idea','Project'];
// ── Voice dictation for Notes (Web Speech API) ────────────────────────────
// The 🎤 Voice quick-capture button opens a New Note and live-dictates speech
// into the free-form RTE body (#fa-note-rte → saved as n.bodyHtml). Uses the
// browser's webkitSpeechRecognition (Chrome/Edge/Safari) — no backend/API key.
// Graceful fallback: unsupported browsers still get a normal typeable note.
let _voiceRec=null, _voiceActive=false;
function startVoiceNote(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  // Always open the New Note modal so the user can type even if voice is off.
  if(typeof openFA==='function')openFA('note');
  if(!SR){ toast({type:'warn',title:'Voice not supported here',msg:'This browser has no speech recognition. Try Chrome, Edge, or Safari — you can still type the note.'}); return; }
  // Wait for the modal's RTE to mount, then start listening.
  setTimeout(()=>_voiceBegin(SR),350);
}
function _voiceBegin(SR){
  if(!document.getElementById('fa-note-rte')){ toast('Could not start voice — note editor not open.'); return; }
  if(_voiceActive)_voiceStop();
  let rec; try{ rec=new SR(); }catch(e){ toast('Voice unavailable: '+(e.message||e)); return; }
  _voiceRec=rec; _voiceActive=true;
  rec.continuous=true; rec.interimResults=true; rec.lang=(navigator.language||'en-US');
  const rte0=document.getElementById('fa-note-rte'); if(rte0)rte0.focus();
  _voiceShowIndicator();
  rec.onresult=(ev)=>{
    const rte=document.getElementById('fa-note-rte');
    if(!rte){ _voiceStop(); return; } // modal was closed — stop the mic
    let finalText='';
    for(let i=ev.resultIndex;i<ev.results.length;i++){
      const r=ev.results[i];
      if(r.isFinal)finalText+=r[0].transcript; else _voiceSetInterim(r[0].transcript);
    }
    if(finalText){
      _voiceSetInterim('');
      const needsSpace=rte.innerText && !/\s$/.test(rte.innerText);
      rte.appendChild(document.createTextNode((needsSpace?' ':'')+finalText.trim()+' '));
      rte.dispatchEvent(new Event('input',{bubbles:true}));
      _voicePlaceCaretEnd(rte);
    }
  };
  rec.onerror=(ev)=>{
    if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){
      toast({type:'error',title:'Microphone blocked',msg:'Allow microphone access for this site, then click 🎤 Voice again.'});
      _voiceStop();
    } // 'no-speech' / transient errors: let onend auto-restart
  };
  rec.onend=()=>{
    // continuous mode still ends on long pauses — restart while active.
    if(_voiceActive && document.getElementById('fa-note-rte')){ try{ rec.start(); }catch(_){ } }
    else { _voiceActive=false; _voiceHideIndicator(); }
  };
  try{ rec.start(); }catch(e){ toast('Could not start microphone: '+(e.message||e)); _voiceStop(); }
}
function _voiceStop(){
  _voiceActive=false;
  if(_voiceRec){ try{ _voiceRec.onend=null; _voiceRec.stop(); }catch(_){ } _voiceRec=null; }
  _voiceHideIndicator();
}
function _voicePlaceCaretEnd(el){
  try{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(_){}
}
function _voiceShowIndicator(){
  if(!document.getElementById('lu-voice-style')){ const st=document.createElement('style'); st.id='lu-voice-style'; st.textContent='@keyframes luVoicePulse{0%,100%{opacity:1}50%{opacity:.25}}'; document.head.appendChild(st); }
  let el=document.getElementById('lu-voice-indicator');
  if(!el){
    el=document.createElement('div'); el.id='lu-voice-indicator';
    el.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:10px;background:var(--s1,#0f1525);border:1px solid var(--bd1,#2a3550);border-radius:999px;padding:8px 14px;box-shadow:0 8px 28px rgba(0,0,0,.45);font-size:12px;color:var(--t1,#fff)';
    el.innerHTML='<span style="width:10px;height:10px;border-radius:50%;background:#ef4444;animation:luVoicePulse 1s infinite;flex-shrink:0"></span><span>Listening… <span id="lu-voice-interim" style="color:var(--t3,#8a93a6)"></span></span><button onclick="_voiceStop()" style="margin-left:6px;background:#ef4444;color:#fff;border:none;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer">Stop</button>';
    document.body.appendChild(el);
  }
  el.style.display='flex';
}
function _voiceSetInterim(t){ const el=document.getElementById('lu-voice-interim'); if(el)el.textContent=t?('“'+t+'”'):''; }
function _voiceHideIndicator(){ const el=document.getElementById('lu-voice-indicator'); if(el)el.remove(); }

// ── Web Clip for Notes ────────────────────────────────────────────────────
// The 🔗 Clip quick-capture button opens a New Note pre-set as a Web Clip,
// auto-fills the URL from the clipboard (if it holds a link), and fetches the
// page's title + excerpt server-side (bookmarks.fetchMetadata) so a single
// click turns a link into a titled, summarised note. Source is set to the
// exact 'Web Clipper' string so the note lands in the Notes → Web Clips view.
let _webClipBusy=false;
function startWebClip(){
  if(typeof openFA==='function')openFA('note');
  setTimeout(async ()=>{
    const g=id=>document.getElementById(id);
    const nt=g('fa-notetype'); if(nt){ nt.value='Web Clip'; if(typeof faUpdateNoteType==='function')faUpdateNoteType('Web Clip'); }
    const src=g('fa-source'); if(src&&!src.value)src.value='Web Clipper';
    const urlEl=g('fa-sourceurl');
    // Fetch whenever the user enters/pastes a URL into the Source URL field.
    if(urlEl&&!urlEl._clipHooked){ urlEl._clipHooked=true; urlEl.addEventListener('change',()=>{ const u=(urlEl.value||'').trim(); if(/^https?:\/\//i.test(u))_webClipFetch(u); }); }
    // Try the clipboard for a URL to auto-fill + auto-fetch.
    let clip=''; try{ clip=(await navigator.clipboard.readText())||''; }catch(_){ /* denied / unavailable — fine */ }
    clip=clip.trim();
    if(/^https?:\/\/\S+$/i.test(clip)){ if(urlEl)urlEl.value=clip; _webClipFetch(clip); }
    else if(urlEl){ urlEl.focus(); toast({type:'info',title:'Web Clip',msg:'Paste a link in Source URL and I’ll fetch the title + summary.',duration:3000}); }
  },350);
}
async function _webClipFetch(url){
  if(_webClipBusy)return; _webClipBusy=true;
  const g=id=>document.getElementById(id);
  const titleEl=g('fa-title'), descEl=g('fa-desc');
  toast('🔗 Fetching page…');
  try{
    const res=await _trpc('bookmarks.fetchMetadata',{url},'mutation');
    if(res&&res.ok){
      if(res.title&&titleEl&&!titleEl.value)titleEl.value=res.title;
      const stub=[`> Clipped from [${res.siteName||url}](${url})`, res.description?('\n'+res.description):''].filter(Boolean).join('\n');
      // The note's editor is the body now (-240); older forms still have fa-desc.
      const rte=g('fa-note-rte');
      if(rte){ rte.insertAdjacentHTML('beforeend',_noteMdToHtml(stub)); try{luRTE_updateCharCount('fa-note-rte');}catch(_){} }
      else if(descEl){ descEl.value=descEl.value?descEl.value+'\n\n'+stub:stub; if(typeof renderNotePreview==='function')renderNotePreview(descEl.value); }
      try{ _faHasChanges=true; }catch(_){}
      toast({type:'success',title:'Clipped',msg:res.title?('“'+String(res.title).slice(0,60)+'”'):'Page details added.',duration:2400});
    } else {
      toast({type:'warn',title:'Could not read that page',msg:(res&&res.error)||'Some sites block fetching — you can still type the note.'});
    }
  }catch(e){ toast({type:'error',title:'Clip failed',msg:String(e&&e.message||e)}); }
  finally{ _webClipBusy=false; }
}
function _noteStatus(n){return (n&&n.status)||'fleeting';}
function _noteStatusMeta(id){return _NOTE_STATUSES.find(s=>s.id===id)||_NOTE_STATUSES[0];}
function setNoteStatus(id,status){
  const n=D.notes.find(x=>x.id===id);if(!n)return;
  n.status=status;n.updated=new Date().toISOString();save('notes');
  if(typeof applyNotesFilters==='function')applyNotesFilters();
  _noteRefreshOpen(id);
  toast(_noteStatusMeta(status).icon+' Marked '+_noteStatusMeta(status).label);
}
function setNoteType(id,t){
  const n=D.notes.find(x=>x.id===id);if(!n)return;
  n.noteType=t||'';n.updated=new Date().toISOString();save('notes');
  // Type drives the Meeting Notes / Journal folders  refresh the list so the note moves immediately.
  if(typeof applyNotesFilters==='function')applyNotesFilters();
  _noteRefreshOpen(id);
}
function _noteStatusPickerHTML(id,cur){
  return _NOTE_STATUSES.map(s=>`<div class="nsp-i" onclick="event.stopPropagation();setNoteStatus(${id},'${_jsAttr(s.id)}');closePopMenu('nsp-${id}')" style="display:flex;align-items:center;gap:8px;padding:6px 9px;cursor:pointer;border-radius:6px;font-size:11px;${cur===s.id?'background:var(--acs)':''}"><span style="font-size:13px">${s.icon}</span><div style="flex:1"><div style="font-weight:600;color:${s.color}">${s.label}</div><div style="font-size:11px;color:var(--t3)">${s.hint}</div></div>${cur===s.id?'<span style="color:var(--ac)">✓</span>':''}</div>`).join('');
}
// Extract the first inline image URL from a note's body (markdown or HTML).
// Returns '' if no image is present.
function _noteFirstImage(body){
  if(!body)return '';
  const md=body.match(/!\[[^\]]*\]\(([^)\s]+)\)/);
  if(md)return md[1];
  const html=body.match(/<img[^>]+src=["']([^"']+)["']/i);
  if(html)return html[1];
  return '';
}
// Compute word count + estimated reading time (minutes, 200 wpm).
// Render a tiny inline SVG sparkline from an array of numeric values.
// Used by the Reports KPI tiles to show the recent trend under each big
// number. Auto-scales, animated draw-in via CSS keyframes.
function _sparkline(values,color,opts){
  const w=(opts&&opts.width)||120,h=(opts&&opts.height)||18;
  if(!Array.isArray(values)||values.length<2)return '';
  const max=Math.max(...values,1);
  const min=Math.min(...values,0);
  const range=Math.max(max-min,1);
  const step=w/(values.length-1);
  const pts=values.map((v,i)=>[i*step,h-((v-min)/range)*h]);
  const d='M '+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L ');
  const fill='M '+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L ')+` L ${w} ${h} L 0 ${h} Z`;
  const c=color||'var(--ac)';
  return `<svg class="lu-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="spk-g-${Math.random().toString(36).slice(2,8)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c}" stop-opacity=".45"/>
      <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${fill}" fill="${c}" opacity=".18" style="animation:none"/>
    <path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function _readingTime(text){
  const stripped=String(text||'').replace(/<[^>]+>/g,' ').replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[[^\]]*\]\([^)]*\)/g,' ');
  const wc=stripped.trim()?stripped.trim().split(/\s+/).length:0;
  const mins=wc?Math.max(1,Math.round(wc/200)):0;
  return {wc,mins};
}
// Folder classification shared by the Notes sidebar folders + breadcrumb.
// A note is a "meeting" note if its Type is Meeting (editor dropdown) or
// Meeting Notes (quick-add form / OneNote sync), OR its source is Meeting
// Notes, OR it carries the `meetings` tag. Journal likewise honors the Type.
function _noteIsMeeting(n){const t=n.noteType||'';return t==='Meeting'||t==='Meeting Notes'||n.source==='Meeting Notes'||(n.tags||[]).includes('meetings');}
function _noteIsJournal(n){return (n.noteType||'')==='Journal'||(n.tags||[]).includes('journal');}
// ── Original-document viewer (build -187) ────────────────────────────
// Every PDF / Word importer stores the untouched source file in storage
// (Drive / S3) and records it on the note as n.original {url,name,mime,
// size,whole?}. The note body stays the extracted text (searchable,
// editable); the editor shows the original with its real formatting in an
// embedded viewer. `whole` marks a Word doc that was split into several
// notes (Settings → Word import) — those default to the Text view.
let _noteOrigView={}; // noteId -> 'original' | 'text' (session choice)
function _noteOriginalEmbedUrl(o){
  const u=String(o&&o.url||''); if(!u)return '';
  const drive=u.match(/drive\.google\.com\/(?:uc\?[^#]*?\bid=|file\/d\/|thumbnail\?[^#]*?\bid=)([A-Za-z0-9_-]+)/);
  if(drive)return 'https://drive.google.com/file/d/'+drive[1]+'/preview';
  if(_noteOriginalIsPdf(o))return u; // browsers render PDFs natively
  return 'https://view.officeapps.live.com/op/view.aspx?src='+encodeURIComponent(u);
}
function _noteOriginalIsPdf(o){ return /pdf/i.test(o&&o.mime||'')||/\.pdf(\?|$)/i.test(String(o&&(o.name||o.url)||'')); }
// Views (build -194): 'both' = original viewer + the imported formatted text
// underneath (default for single-file imports — the user wants both at once),
// 'original' = viewer only, 'text' = text only (default for whole-doc splits).
function _noteOrigMode(n){ const o=n&&n.original; if(!o||!o.url)return ''; return _noteOrigView[n.id]||(o.whole?'text':'both'); }
function _noteOriginalHtml(n){
  const o=n.original; if(!o||!o.url)return '';
  const mode=_noteOrigMode(n);
  const isPdf=_noteOriginalIsPdf(o);
  const size=o.size?' · '+(o.size>1048576?(o.size/1048576).toFixed(1)+' MB':Math.max(1,Math.round(o.size/1024))+' KB'):'';
  const seg=(k,l)=>'<button class="btn btn-s" style="height:24px;font-size:11px;'+(mode===k?'background:var(--page-accent);color:#fff;border-color:transparent':'')+'" onclick="_noteOrigView['+n.id+']=\''+k+'\';showNoteInEditor('+n.id+')">'+l+'</button>';
  const head='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+
    '<span style="font-size:11px;color:var(--t3)">'+(isPdf?'📕':'📘')+' '+esc(o.name||'Original document')+size+(o.whole?' · whole document':'')+'</span>'+
    '<span style="display:inline-flex;gap:4px;margin-left:auto">'+seg('both','📄+✎ Both')+seg('original','📄 Original')+seg('text','✎ Text')+'</span>'+
    '<a class="btn btn-s" style="height:24px;font-size:11px;text-decoration:none" href="'+esc(o.url)+'" target="_blank" rel="noopener">⬇ Download</a></div>';
  const frame=mode!=='text'?'<iframe src="'+esc(_noteOriginalEmbedUrl(o))+'" style="width:100%;height:'+(mode==='both'?'60vh':'72vh')+';min-height:420px;border:1px solid var(--bd1);border-radius:8px;background:#fff" allow="fullscreen" title="'+esc(o.name||'Original document')+'"></iframe>'+
    '<div style="font-size:11px;color:var(--t3);margin-top:4px">'+(mode==='both'?'The original file above; the imported text below is what search, links and editing use.':'Shown exactly as the file was imported. Switch to ✎ Text or Both for the extracted content.')+'</div>':'';
  return '<div class="note-original" style="margin-bottom:12px">'+head+frame+'</div>';
}
// Build a breadcrumb path for a note based on its category + first tag.
function _noteBreadcrumb(n){
  const parts=['Notes'];
  if(n.starred)parts.push('Favorites');
  else if(n.source==='Web Clipper')parts.push('Web Clips');
  else if(_noteIsMeeting(n))parts.push('Meeting Notes');
  else if(_noteIsJournal(n))parts.push('Journal');
  else if(!n.source||n.source==='Manual')parts.push('Resources');
  else parts.push(n.source);
  if((n.tags||[]).length)parts.push('#'+n.tags[0]);
  return parts;
}
// Toggle pin on a note (saves + re-renders list).
// Hover quick-actions on note cards (#G).
function _quickToggleNoteStar(id){
  const n=D.notes.find(x=>x.id===id);if(!n)return;
  n.starred=!n.starred;save('notes');
  if(typeof applyNotesFilters==='function')applyNotesFilters();
  _noteRefreshOpen(id);
  toast(n.starred?'⭐ Starred':'Unstarred');
}
function _quickToggleNotePin(id){
  if(typeof toggleNotePinned==='function')toggleNotePinned(id);
}
function toggleNotePinned(id){
  const n=D.notes.find(x=>x.id===id);if(!n)return;
  n.pinned=!n.pinned;save('notes');
  if(typeof applyNotesFilters==='function')applyNotesFilters();
  _noteRefreshOpen(id);
  toast(n.pinned?'📌 Pinned to top':'Unpinned');
}
// Set a note's color tag and re-render.
function setNoteColor(id,hex){
  const n=D.notes.find(x=>x.id===id);if(!n)return;
  n.color=hex||'';save('notes');
  if(typeof applyNotesFilters==='function')applyNotesFilters();
  _noteRefreshOpen(id);
}

// Creation time for a note, as a sortable number (newer = larger). Prefers the
// real createdAt timestamp; falls back to the id (FA ids are sequential /
// Date.now()-based, so higher id == created later) so the Recent view orders by
// when a note was CREATED, not by its freeform 'updated' display string.
function _noteCreatedTime(n){
  if(n&&n.createdAt){ const c=_pd(n.createdAt); if(!isNaN(c.getTime()))return c.getTime(); }
  if(n&&typeof n.id==='number')return n.id;
  return 0;
}
function _parseNoteDate(n){
  // Try to parse a note's updated/created field into a Date. Falls back to
  // createdAt, then to id (Date.now()-based), so newer notes always sort
  // ahead of older ones even when the legacy 'updated' string is unparseable.
  const rawVal=n.updated||n.created;
  if(rawVal===undefined||rawVal===null||rawVal===''){
    if(n.createdAt){const c=_pd(n.createdAt);if(!isNaN(c.getTime()))return c;}
    if(typeof n.id==='number'&&n.id>1e9)return _pd(n.id); // id is a Date.now() timestamp
    return new Date(0);
  }
  // Handle numeric timestamps (ms since epoch) directly — avoids raw.trim() error
  if(typeof rawVal==='number')return _pd(rawVal);
  const raw=String(rawVal);
  if(!raw)return new Date(0);
  const s=raw.trim();
  // 1. ISO / RFC2822 / standard parseable strings
  const d=_pd(s);
  if(!isNaN(d.getTime()))return d;
  const sl=s.toLowerCase();
  const now=new Date();
  // 2. Human-readable relative labels
  if(/^just now$/i.test(sl))return _pd(now);
  if(/^today$/i.test(sl)){const t=_pd(now);t.setHours(12,0,0,0);return t;}
  if(/^yesterday$/i.test(sl)){const t=_pd(now);t.setDate(t.getDate()-1);t.setHours(12,0,0,0);return t;}
  if(/^this week$/i.test(sl)){const t=_pd(now);t.setDate(t.getDate()-3);return t;}
  if(/^last week$/i.test(sl)){const t=_pd(now);t.setDate(t.getDate()-10);return t;}
  if(/^this month$/i.test(sl)){const t=_pd(now);t.setDate(t.getDate()-15);return t;}
  if(/^last month$/i.test(sl)){const t=_pd(now);t.setMonth(t.getMonth()-1);return t;}
  // 3. Numeric relative: '2h ago', '3d ago', '1w ago', '2mo ago', '1y ago'
  const m=sl.match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk|mo|month|y|yr|year)s?\s*ago$/);
  if(m){
    const v=parseInt(m[1]),u=m[2],t=_pd(now);
    if(u==='s'||u==='sec')t.setSeconds(t.getSeconds()-v);
    else if(u==='m'||u==='min')t.setMinutes(t.getMinutes()-v);
    else if(u==='h'||u==='hr')t.setHours(t.getHours()-v);
    else if(u==='d'||u==='day')t.setDate(t.getDate()-v);
    else if(u==='w'||u==='wk')t.setDate(t.getDate()-v*7);
    else if(u==='mo'||u==='month')t.setMonth(t.getMonth()-v);
    else if(u==='y'||u==='yr'||u==='year')t.setFullYear(t.getFullYear()-v);
    return t;
  }
  // 4. Short forms without 'ago': '2h', '3d', '1w'
  const m2=sl.match(/^(\d+)(h|d|w|m)$/);
  if(m2){
    const v=parseInt(m2[1]),u=m2[2],t=_pd(now);
    if(u==='h')t.setHours(t.getHours()-v);
    else if(u==='d')t.setDate(t.getDate()-v);
    else if(u==='w')t.setDate(t.getDate()-v*7);
    else if(u==='m')t.setMonth(t.getMonth()-v);
    return t;
  }
  return new Date(0);
}
// ── Full-text search in Notes (build -244) ─────────────────────────────────
// The Notes search box searches every word of every note (title, tags,
// source and the full text — rich notes included, through the derived body)
// across folders. Query syntax:
//   two words        both must appear, anywhere
//   "exact phrase"   that phrase
//   -word            notes without it
//   #tag / tag:x     notes with a tag starting with x
//   title:x          x in the title
// Accents and case are ignored. Results are ranked (title > tag > text,
// whole-word and phrase bonuses) when the list is on its default sort; each
// card shows the passage that matched, and the open note highlights matches.
const _noteSearchCache=new WeakMap(); // note → {src, text, fold}
function _noteFold(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
// Plain text of a note's body for searching and snippets.
function _noteSearchText(n){
  const src=n.body||'';
  const c=_noteSearchCache.get(n);
  if(c&&c.src===src)return c;
  const text=String(src)
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g,'$1')
    .replace(/\[\[([^\]]+)\]\]/g,'$1')
    .replace(/^\s*- \[[ xX]\]\s*/gm,'')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm,'')
    .replace(/[*_`~|]+/g,' ')
    .replace(/\s+/g,' ').trim();
  const v={src,text,fold:_noteFold(text)};
  _noteSearchCache.set(n,v);
  return v;
}
function _noteParseQuery(raw){
  const q={terms:[],phrases:[],not:[],tags:[],title:[],raw:String(raw||'').trim()};
  String(raw||'').replace(/"([^"]+)"|(\S+)/g,(m,ph,w)=>{
    if(ph){const f=_noteFold(ph).trim();if(f)q.phrases.push(f);return m;}
    let t=w;
    if(/^-./.test(t)){q.not.push(_noteFold(t.slice(1)));return m;}
    if(/^#./.test(t)){q.tags.push(_noteFold(t.slice(1)));return m;}
    const mm=t.match(/^(tag|title):(.+)$/i);
    if(mm){(mm[1].toLowerCase()==='tag'?q.tags:q.title).push(_noteFold(mm[2]));return m;}
    q.terms.push(_noteFold(t));return m;
  });
  q.empty=!q.terms.length&&!q.phrases.length&&!q.not.length&&!q.tags.length&&!q.title.length;
  return q;
}
// Score a note against a parsed query: 0 = not a match.
function _noteSearchScore(n,q){
  const title=_noteFold(n.title),tags=(n.tags||[]).map(_noteFold),src=_noteFold(n.source);
  const body=_noteSearchText(n).fold;
  const all=title+' '+tags.join(' ')+' '+src+' '+body;
  for(const t of q.tags)if(!tags.some(x=>x.startsWith(t)))return 0;
  for(const t of q.title)if(!title.includes(t))return 0;
  for(const t of q.not)if(t&&all.includes(t))return 0;
  let score=0.001;
  const word=(hay,t)=>new RegExp('(^|[^\\p{L}\\p{N}])'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'u').test(hay);
  for(const t of q.terms){
    if(!all.includes(t))return 0;
    if(title.includes(t))score+=title.startsWith(t)?15:10;
    if(tags.some(x=>x===t))score+=6;else if(tags.some(x=>x.includes(t)))score+=3;
    let k=0,i=body.indexOf(t);while(i>=0&&k<5){k++;i=body.indexOf(t,i+t.length);}
    score+=k;
    if(word(title,t)||word(body,t))score+=1;
  }
  for(const p of q.phrases){
    if(!all.includes(p))return 0;
    score+=title.includes(p)?15:4;
  }
  return score;
}
// The passage around the first match, escaped, with every term marked.
function _noteSearchSnippet(n,q,len){
  const text=_noteSearchText(n).text,fold=_noteFold(text);
  const keys=[...q.phrases,...q.terms].filter(Boolean).sort((a,b)=>b.length-a.length);
  let at=-1;for(const k of keys){const i=fold.indexOf(k);if(i>=0&&(at<0||i<at))at=i;}
  const L=len||150;
  if(at<0)return _noteMark(text.slice(0,L),q)+(text.length>L?'…':'');
  const a=Math.max(0,at-50);
  const s=text.slice(a,a+L);
  return (a>0?'…':'')+_noteMark(s,q)+(a+L<text.length?'…':'');
}
// Escape `s` and wrap every query term in <mark>. Matching uses the folded
// text, which has the same length as the original for Latin text.
function _noteMark(s,q){
  const raw=String(s||''),fold=_noteFold(raw);
  const keys=[...q.phrases,...q.terms,...q.title].filter(Boolean);
  if(!keys.length||fold.length!==raw.length)return esc(raw);
  const hits=[];
  keys.forEach(k=>{let i=fold.indexOf(k);while(i>=0){hits.push([i,i+k.length]);i=fold.indexOf(k,i+k.length);}});
  if(!hits.length)return esc(raw);
  hits.sort((x,y)=>x[0]-y[0]);
  let out='',pos=0;
  for(const [a,b] of hits){if(a<pos)continue;out+=esc(raw.slice(pos,a))+'<mark class="lu-mark">'+esc(raw.slice(a,b))+'</mark>';pos=b;}
  return out+esc(raw.slice(pos));
}
// Highlight the query in the open note (CSS Custom Highlight API: nothing is
// added to the note itself) and scroll to the first match.
function _noteHighlightOpen(){
  try{
    if(!(window.CSS&&CSS.highlights&&typeof Highlight==='function'))return;
    CSS.highlights.delete('lu-search');
    const q=_noteParseQuery(_notesFilterText||'');
    const keys=[...q.phrases,...q.terms,...q.title].filter(Boolean);
    const root=document.getElementById('nie-body');
    if(!keys.length||!root)return;
    const ranges=[];
    const w=document.createTreeWalker(root,4);
    while(w.nextNode()){
      const node=w.currentNode,raw=node.textContent,fold=_noteFold(raw);
      if(fold.length!==raw.length)continue;
      keys.forEach(k=>{let i=fold.indexOf(k);while(i>=0&&ranges.length<500){const r=new Range();r.setStart(node,i);r.setEnd(node,i+k.length);ranges.push(r);i=fold.indexOf(k,i+k.length);}});
    }
    if(!ranges.length)return;
    CSS.highlights.set('lu-search',new Highlight(...ranges));
    ranges.sort((a,b)=>a.compareBoundaryPoints(Range.START_TO_START,b));
    const rect=ranges[0].getBoundingClientRect();
    const pane=document.getElementById('notes-editor-panel');
    if(pane&&rect&&rect.top){const pr=pane.getBoundingClientRect();if(rect.top<pr.top||rect.bottom>pr.bottom)pane.scrollTop+=rect.top-pr.top-120;}
  }catch(e){console.warn('[notes] highlight failed',e);}
}
(function _noteSearchCSS(){
  if(document.getElementById('lu-note-search-css'))return;
  const s=document.createElement('style');s.id='lu-note-search-css';
  s.textContent='mark.lu-mark{background:var(--acs);color:var(--ac);border-radius:3px;padding:0 1px}'+
    '::highlight(lu-search){background-color:color-mix(in srgb,var(--warn) 45%,transparent);color:inherit}';
  document.head.appendChild(s);
})();
function applyNotesFilters(){
  const me=D.creds.userName||'Idris Grant';
  let notes=_notesMyOnly?D.notes.filter(n=>!n.createdBy||n.createdBy===me):D.notes;
  // User folder filter (left nav). Also includes notes in any descendant folder.
  // When NO folder is picked, hide notes that live in any folder so the default
  // "Recent / categories / smart folders" views only show un-filed notes.
  if(_notesFilterFolder!==null&&_notesFilterFolder!==undefined){
    const ids=new Set([_notesFilterFolder]);
    const collect=p=>{_noteFoldersChildrenOf(p).forEach(c=>{ids.add(c.id);collect(c.id);});};
    collect(_notesFilterFolder);
    notes=notes.filter(n=>ids.has(n.folderId));
  }else if(_notesFilterText.trim()){
    // A search looks in every folder (-244): notes filed away must be findable.
  }else if(_notesFilterCategory==='Favorites'&&!_notesFilterSmart){
    // Favorites/starred is a cross-folder view: a starred note should show
    // here no matter which folder it lives in (this matches the "N starred"
    // count in the header). Don't apply the "hide foldered notes" rule.
  }else{
    notes=notes.filter(n=>!n.folderId);
  }
  // Category filter (left nav)
  if(_notesFilterSmart){
    const now=new Date();
    const weekAgo=_pd(now); weekAgo.setDate(weekAgo.getDate()-7);
    if(_notesFilterSmart==='smart_recent')notes=notes.filter(n=>{try{return _pd(n.updated)>=weekAgo;}catch(e){return false;}});
    else if(_notesFilterSmart==='smart_notags')notes=notes.filter(n=>!n.tags||!n.tags.length);
    else if(_notesFilterSmart==='smart_long')notes=notes.filter(n=>(n.body||'').length>500);
    else if(_notesFilterSmart==='smart_unlinked')notes=notes.filter(n=>!((n.body||'').includes('[[')));
    else if(_notesFilterSmart==='smart_images')notes=notes.filter(n=>typeof _noteFirstImage==='function'&&_noteFirstImage(n.bodyHtml||n.body||''));
    else if(_notesFilterSmart==='smart_mostlinked'){
      const titleSet=D.notes.map(n=>n.title||'');const blc={};titleSet.forEach(t=>blc[t]=0);
      D.notes.forEach(n=>{const text=(n.body||'')+' '+(n.bodyHtml||'');(text.match(/\[\[([^\]\n]+)\]\]/g)||[]).forEach(s=>{const t=s.slice(2,-2).trim();if(t in blc)blc[t]++;});});
      notes=notes.filter(n=>(blc[n.title]||0)>0).sort((a,b)=>(blc[b.title]||0)-(blc[a.title]||0));
    }
    else if(_notesFilterSmart==='smart_stale'){const cutoff=Date.now()-90*86400000;notes=notes.filter(n=>{try{const d=Date.parse(n.updated);return !isNaN(d)&&d<cutoff;}catch(_){return false;}});}
  } else {
    const catMap={
      'Recent': n=>true,
      'Favorites': n=>n.starred,
      'Web Clips': n=>n.source==='Web Clipper',
      'Meeting Notes': n=>_noteIsMeeting(n),
      'Journal': n=>_noteIsJournal(n),
      'Resources': n=>n.source==='Manual'&&!_noteIsMeeting(n),
    };
    const catFilter=catMap[_notesFilterCategory]||(()=>true);
    notes=notes.filter(catFilter);
  }
  // Lifecycle filter (independent of category)
  if(_notesFilterStatus){
    notes=notes.filter(n=>_noteStatus(n)===_notesFilterStatus);
  }
  // Text search: every word of every note (-244), ranked.
  const q=_notesFilterText.trim().toLowerCase();
  const pq=_noteParseQuery(_notesFilterText);
  const _score=new Map();
  if(q&&!pq.empty){
    notes=notes.filter(n=>{const s=_noteSearchScore(n,pq);if(s>0)_score.set(n,s);return s>0;});
  }
  // Tag facet (multi-select AND logic)
  if(_notesFilterTags.size>0){
    notes=notes.filter(n=>{
      const noteTags=(n.tags||[]).map(t=>t.toLowerCase());
      for(const ft of _notesFilterTags){
        if(!noteTags.includes(ft.toLowerCase()))return false;
      }
      return true;
    });
  }
  // Source facet (multi-select OR logic)
  if(_notesFilterSources.size>0){
    notes=notes.filter(n=>_notesFilterSources.has((n.source||'Manual').toLowerCase()));
  }
  // Date range
  const now=new Date();
  let fromDate=null,toDate=null;
  if(_notesFilterDatePreset==='today'){
    fromDate=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  } else if(_notesFilterDatePreset==='week'){
    fromDate=_pd(now); fromDate.setDate(fromDate.getDate()-7);
  } else if(_notesFilterDatePreset==='month'){
    fromDate=_pd(now); fromDate.setMonth(fromDate.getMonth()-1);
  } else if(_notesFilterDatePreset==='year'){
    fromDate=_pd(now); fromDate.setFullYear(fromDate.getFullYear()-1);
  } else if(_notesFilterDatePreset==='custom'){
    if(_notesFilterDateFrom)fromDate=_pd(_notesFilterDateFrom);
    if(_notesFilterDateTo){toDate=_pd(_notesFilterDateTo);toDate.setHours(23,59,59,999);}
  }
  if(fromDate||toDate){
    notes=notes.filter(n=>{
      const d=_parseNoteDate(n);
      if(fromDate&&d<fromDate)return false;
      if(toDate&&d>toDate)return false;
      return true;
    });
  }
  // Sort. "Recent" defaults to newest-CREATED-first (since "Recent" without
  // recency makes no sense), but ONLY while the user is still on the default
  // sort. An explicit pick from the Sort dropdown always wins — 'Recent' is
  // the default category, so overriding it unconditionally made the whole
  // Sort control a no-op on the page's default view.
  // With a search on the default sort, best matches come first.
  if(_score.size&&_notesSort==='newest'){
    notes=[...notes].sort((a,b)=>(_score.get(b)-_score.get(a))||(_parseNoteDate(b)-_parseNoteDate(a)));
  }
  else if(_notesFilterCategory==='Recent'&&!_notesFilterSmart&&!_notesFilterFolder&&_notesSort==='newest'){
    // Recent = most recently CREATED first (by createdAt / id, not the
    // freeform 'updated' string which is unreliable to parse).
    notes=[...notes].sort((a,b)=>_noteCreatedTime(b)-_noteCreatedTime(a));
  }
  else if(_notesSort==='newest')notes=[...notes].sort((a,b)=>_parseNoteDate(b)-_parseNoteDate(a));
  else if(_notesSort==='oldest')notes=[...notes].sort((a,b)=>_parseNoteDate(a)-_parseNoteDate(b));
  else if(_notesSort==='az')notes=[...notes].sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  else if(_notesSort==='za')notes=[...notes].sort((a,b)=>(b.title||'').localeCompare(a.title||''));
  else if(_notesSort==='longest')notes=[...notes].sort((a,b)=>(b.body||'').length-(a.body||'').length);
  else if(_notesSort==='tagged')notes=[...notes].sort((a,b)=>(b.tags||[]).length-(a.tags||[]).length);
  // Render note cards with optional text highlight
  // Render note cards with optional text highlight
  function hi(str){return q?_noteMark(str||'',pq):esc(str||'');}
  // Precompute backlink counts once (notes whose body [[links]] to a title).
  const _blCount={};
  D.notes.forEach(n=>{
    const text=(n.body||'')+' '+(n.bodyHtml||'');
    (text.match(/\[\[([^\]\n]+)\]\]/g)||[]).forEach(s=>{const t=s.slice(2,-2).trim();_blCount[t]=(_blCount[t]||0)+1;});
  });
  // Clean plain-text snippet from a note body (strips html/markdown/wiki).
  function _noteSnippet(n){
    let s=String(n.bodyHtml?n.bodyHtml.replace(/<[^>]+>/g,' '):(n.body||''));
    s=s.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[\[([^\]]+)\]\]/g,'$1')
       .replace(/[#>*_`~]/g,'').replace(/\s+/g,' ').trim();
    return s;
  }
  function noteCard(n,i){
    const st=_noteStatusMeta(_noteStatus(n));
    let snippet=_noteSnippet(n);
    const plain=snippet;
    if(q){
      snippet=_noteSearchSnippet(n,pq,140);
    } else {
      snippet=esc(plain.slice(0,130))+(plain.length>130?'…':'');
    }
    const img=_noteFirstImage(n.bodyHtml||n.body||'');
    const thumb=img?`<img class="nc-thumb" src="${esc(img)}" loading="lazy" onerror="this.style.display='none'" alt="">`:'';
    const colorDot=n.color?`<span class="nc-color" style="background:${esc(n.color)};color:${esc(n.color)}" title="Color tag"></span>`:'';
    const pin=n.pinned?'<span class="nc-pin" title="Pinned">📌</span>':'';
    const checked=_notesBulkSelected.has(n.id);
    const bulkCb=_notesBulkMode?`<div class="nc-bulk-cb chk ${checked?'on':''}" onclick="toggleNotesBulkSelect(${_tidLit(n.id)},event)" style="flex-shrink:0;margin-top:3px"></div>`:'';
    const isGrid=document.body.classList.contains('notes-grid-view');
    const clickAttr=_notesBulkMode
      ?`onclick="toggleNotesBulkSelect(${_tidLit(n.id)},event)"`
      :(isGrid?`onclick="openDrawer('note',D.notes.find(x=>x.id==${_tidLit(n.id)}))"`:`onclick="showNoteInEditor(${_tidLit(n.id)})"`);
    const bl=_blCount[n.title]||0;
    const {mins}=_readingTime(n.body||n.bodyHtml||'');
    const metaBits=[];
    metaBits.push(`<span class="nc-status" style="color:color-mix(in srgb,${st.color} 42%,var(--t1));background:color-mix(in srgb,${st.color} 14%,transparent);border:1px solid color-mix(in srgb,${st.color} 28%,transparent)">${st.icon} ${st.label}</span>`);
    if(bl)metaBits.push(`<span title="${bl} note${bl===1?'':'s'} link here">⛓ ${bl}</span>`);
    if(mins)metaBits.push(`<span>⏱ ${mins}m</span>`);
    metaBits.push(`<span class="nc-dim">${fmtNoteDate(n.updated)}</span>`);
    return `<div class="nc ${String(n.id)===String(_noteInlineEditId)&&!_notesBulkMode?'on':''} ${checked?'bulk-checked':''}" data-nid="${n.id}" draggable="${_notesBulkMode?'false':'true'}" ondragstart="_noteCardDragStart(event,${_tidLit(n.id)})" ondragend="_noteCardDragEnd()" ${clickAttr}>
      <div class="nc-row">
        ${bulkCb}
        ${colorDot}
        <div class="nc-body">
          <div class="nc-t">${pin}${n.icon?esc(n.icon)+' ':''}${hi(n.title)||'<span style="color:var(--t3)">Untitled</span>'}</div>
          ${snippet?`<div class="nc-snip">${snippet}</div>`:''}
          ${(n.tags||[]).length?`<div class="nc-tg">${(n.tags||[]).slice(0,4).map(t=>`<span>${_notesFilterTags.has(t.toLowerCase())?`<b style="color:var(--ac)">#${esc(t)}</b>`:`#${esc(t)}`}</span>`).join('')}</div>`:''}
          <div class="nc-m">${metaBits.join('')}</div>
        </div>
        ${thumb}
      </div>
      <div class="nc-quick-actions">
        <button class="${n.starred?'on':''}" onclick="event.stopPropagation();_quickToggleNoteStar(${_tidLit(n.id)})" title="${n.starred?'Unstar':'Star'}">${n.starred?'★':'☆'}</button>
        <button class="${n.pinned?'on':''}" onclick="event.stopPropagation();_quickToggleNotePin(${_tidLit(n.id)})" title="${n.pinned?'Unpin':'Pin'}">📌</button>
      </div>
    </div>`;
  }
  // Split pinned out — they always appear first under a "📌 Pinned" header,
  // regardless of grouping/sort. Skip when an explicit search/tag filter is
  // active so users can still see only the matched notes.
  const pinnedFirst=!q&&_notesFilterTags.size===0&&_notesFilterSources.size===0;
  const pinned=pinnedFirst?notes.filter(n=>n.pinned):[];
  if(pinnedFirst&&pinned.length)notes=notes.filter(n=>!n.pinned);
  const pinnedHtml=pinned.length?`<div class="nc-section-h">📌 Pinned</div>`+pinned.map((n,i)=>noteCard(n,i)).join(''):'';
  let html;
  if(_notesGroupBy==='tag'){
    const groups={};
    notes.forEach(n=>{
      const tags=(n.tags||[]);
      if(!tags.length){(groups['(No tag)']=groups['(No tag)']||[]).push(n);}
      else{tags.forEach(t=>{(groups[t]=groups[t]||[]).push(n);});}
    });
    html=Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([grp,gnotes])=>
      `<div style="padding:5px 8px 2px;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;background:var(--s2);border-bottom:1px solid var(--bd1)">#${esc(grp)} <span style="font-weight:400">(${gnotes.length})</span></div>`
      +gnotes.map((n,i)=>noteCard(n,i)).join('')
    ).join('');
  } else if(_notesGroupBy==='source'){
    const groups={};
    notes.forEach(n=>{const s=n.source||'Manual';(groups[s]=groups[s]||[]).push(n);});
    html=Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([grp,gnotes])=>
      `<div style="padding:5px 8px 2px;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;background:var(--s2);border-bottom:1px solid var(--bd1)">${esc(grp)} <span style="font-weight:400">(${gnotes.length})</span></div>`
      +gnotes.map((n,i)=>noteCard(n,i)).join('')
    ).join('');
  } else if(_notesGroupBy==='date'){
    const groups={};
    const now2=new Date();
    notes.forEach(n=>{
      const d=_parseNoteDate(n);
      const diff=Math.floor((now2-d)/(1000*60*60*24));
      let grp=diff===0?'Today':diff===1?'Yesterday':diff<=7?'This week':diff<=30?'This month':diff<=365?'This year':'Older';
      (groups[grp]=groups[grp]||[]).push(n);
    });
    const order=['Today','Yesterday','This week','This month','This year','Older'];
    html=order.filter(g=>groups[g]).map(grp=>
      `<div style="padding:5px 8px 2px;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;background:var(--s2);border-bottom:1px solid var(--bd1)">${esc(grp)} <span style="font-weight:400">(${groups[grp].length})</span></div>`
      +groups[grp].map((n,i)=>noteCard(n,i)).join('')
    ).join('');
  } else {
    html=notes.map((n,i)=>noteCard(n,i)).join('');
  }
  const el=document.getElementById('notes-list-inner');
  if(!el)return;
  // Visible escape hatch: if a filter/scope/category/folder is clamping the
  // list well below the true total, say so loudly with a one-tap "Show
  // all" — on mobile the active filter is otherwise invisible.
  const _total=(D.notes||[]).length;
  const _clamped=(_notesFilterCategory!=='Recent')||_notesFilterSmart||_notesFilterStatus||
    (_notesFilterFolder!=null)||_notesMyOnly||_notesFilterTags.size||_notesFilterSources.size||
    _notesFilterDatePreset||q;
  const _banner=(_clamped&&_total>0&&notes.length<_total)
    ?`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--warns);border:1px solid var(--warn);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--t1)">
        <span>Showing <b>${notes.length}</b> of <b>${_total}</b> notes — a filter is active.</span>
        <button class="btn btn-p" style="height:24px;font-size:11px;padding:0 10px;margin-left:auto" onclick="clearNotesFilters()">Show all notes</button>
      </div>`
    :'';
  const _sharedNotesHtml=(typeof _renderSharedNotesSection==='function')?_renderSharedNotesSection():'';
  el.innerHTML=_banner+_sharedNotesHtml+((pinnedHtml+(html||''))||(_sharedNotesHtml?'':renderEmptyState({icon:'search',title:'No matches',hint:'No notes match your current filters. Try a broader search or clear the active filters.',ctaLabel:'Clear filters',ctaFn:'clearNotesFilters()'})));

  if(typeof curScreen!=='undefined'&&curScreen==='notes')_noteHighlightOpen(); // follow the search box in the open note
  // Update result count in filter bar
  const countEl=document.getElementById('notes-filter-count');
  if(countEl)countEl.textContent=`${notes.length} note${notes.length!==1?'s':''}`;
  // Show/hide clear button and update summary bar
  const hasFilters=q||_notesFilterTags.size||_notesFilterSources.size||_notesFilterDatePreset||_notesSort!=='newest';
  const clearBtn=document.getElementById('notes-filter-clear');
  if(clearBtn)clearBtn.style.display=hasFilters?'inline-flex':'none';
  // Show active filter count in summary bar
  const summaryEl=document.getElementById('notes-filter-summary');
  if(summaryEl){
    const existingCount=summaryEl.querySelector('.nf-active-count');
    if(hasFilters){
      const countText=`${notes.length} result${notes.length!==1?'s':''} matching filters`;
      if(existingCount)existingCount.textContent=countText;
      else{
        const span=document.createElement('span');
        span.className='nf-active-count';
        span.style.cssText='font-size:11px;color:var(--t3);margin-left:4px';
        span.textContent=countText;
        summaryEl.appendChild(span);
      }
    } else {
      if(existingCount)existingCount.remove();
    }
  }
}
function clearNotesFilters(){
  _notesFilterText='';
  _notesFilterTags=new Set();
  _notesFilterSources=new Set();
  _notesFilterDatePreset='';
  _notesFilterDateFrom='';
  _notesFilterDateTo='';
  _notesSort='newest';
  _notesGroupBy='';
  _notesFilterSmart=null;
  _notesFilterStatus=null;
  // These were NOT being reset — a stuck category (e.g. 'Resources' only
  // matches source==='Manual'), a folder filter, or 'Mine' scope could
  // clamp the list to a handful even after "Clear filters". Reset them
  // too, and persist the reset so it survives a reload.
  _notesFilterCategory='Recent';
  _notesFilterFolder=null;
  _notesMyOnly=false;
  try{_persistPageState('notes',{category:'Recent',smart:null,status:null,folder:null,myOnly:false,sort:'newest',groupBy:''});}catch(_){}
  const si=document.getElementById('notes-search');
  if(si)si.value='';
  // Reset all chip/button states
  document.querySelectorAll('.nf-tag-chip').forEach(c=>{c.dataset.active='';c.style.background='var(--s3)';c.style.color='var(--t2)';});
  document.querySelectorAll('.nf-src-chip').forEach(c=>{c.dataset.active='';c.style.background='var(--s3)';c.style.color='var(--t2)';});
  document.querySelectorAll('.nf-date-btn').forEach(b=>{b.dataset.active='';b.style.background='var(--s3)';b.style.color='var(--t2)';});
  const customRow=document.getElementById('nf-custom-date-row');
  if(customRow)customRow.style.display='none';
  const sortSel=document.getElementById('nf-sort-select');
  if(sortSel)sortSel.value='newest';
  // Full re-render so the left-nav category highlight + Mine/All scope
  // buttons reflect the reset (applyNotesFilters alone wouldn't).
  if(typeof renderNotes==='function')renderNotes();else applyNotesFilters();
}
function toggleNotesFilterTag(tag,el){
  const k=tag.toLowerCase();
  if(_notesFilterTags.has(k)){_notesFilterTags.delete(k);el.dataset.active='';el.style.background='var(--s3)';el.style.color='var(--t2)';}
  else{_notesFilterTags.add(k);el.dataset.active='1';el.style.background='var(--ac)';el.style.color='#fff';}
  applyNotesFilters();
}
function toggleNotesFilterSource(src,el){
  const k=src.toLowerCase();
  if(_notesFilterSources.has(k)){_notesFilterSources.delete(k);el.dataset.active='';el.style.background='var(--s3)';el.style.color='var(--t2)';}
  else{_notesFilterSources.add(k);el.dataset.active='1';el.style.background='var(--ac)';el.style.color='#fff';}
  applyNotesFilters();
}
function setNotesDatePreset(preset,el){
  const wasActive=_notesFilterDatePreset===preset;
  _notesFilterDatePreset=wasActive?'':preset;
  document.querySelectorAll('.nf-date-btn').forEach(b=>{b.dataset.active='';b.style.background='var(--s3)';b.style.color='var(--t2)';});
  const customRow=document.getElementById('nf-custom-date-row');
  if(!wasActive){
    el.dataset.active='1';el.style.background='var(--ac)';el.style.color='#fff';
    if(preset==='custom'&&customRow)customRow.style.display='flex';
    else if(customRow)customRow.style.display='none';
  } else {
    if(customRow)customRow.style.display='none';
  }
  applyNotesFilters();
}
function renderNotesList_html(myOnly){
  // Legacy wrapper — now delegates to the unified filter engine
  _notesMyOnly=myOnly!==undefined?myOnly:_notesMyOnly;
  applyNotesFilters();
  return ''; // applyNotesFilters writes directly to notes-list-inner
}
function renderNotesList(){
  applyNotesFilters();
}
function filterNotesList(q){
  _notesFilterText=q||'';
  applyNotesFilters();
}
function filterNotesByTag(tag){
  // Routes through the unified filter engine (_notesFilterTags) instead of
  // writing its own list HTML. The old version painted the list directly, so
  // it silently ignored the active Sort, the category/lifecycle filters and
  // the pinned section — a second place where "sort doesn't work". It also
  // took an `el` argument and dereferenced `el.dataset`, which threw for the
  // note-properties chips (they call this with the tag only), making those
  // chips dead on click.
  const k=String(tag||'').toLowerCase();
  const alreadyOnlyThis=_notesFilterTags.size===1&&_notesFilterTags.has(k);
  _notesFilterTags=alreadyOnlyThis?new Set():new Set([k]); // click again to clear
  _notesFilterText='';
  if(typeof renderNotes==='function')renderNotes();else applyNotesFilters();
}
function filterNotesBySmart(filter,el){
  document.querySelectorAll('.nn').forEach(n=>{n.classList.remove('on');});
  el.classList.add('on');
  _notesFilterSmart=filter;
  _notesFilterCategory='Recent'; // reset category
  _persistPageState('notes',{smart:filter,category:'Recent'});
  applyNotesFilters();
}
function exportNotesMarkdown(){
  const me=D.creds.userName||'Idris Grant';
  const notes=_notesMyOnly?D.notes.filter(n=>!n.createdBy||n.createdBy===me):D.notes;
  if(!notes.length){toast('No notes to export.');return;}
  const md=notes.map(n=>{
    const lines=[
      `# ${n.title}`,
      `> **Tags:** ${(n.tags||[]).map(t=>'#'+t).join(' ')} | **Source:** ${n.source||''} | **Updated:** ${n.updated||''}`,
      '',
      n.body||'',
    ];
    // Include rich text body (bodyHtml) if present
    if(n.bodyHtml){
      const bodyMd=typeof _htmlToMd==='function'?_htmlToMd(n.bodyHtml):n.bodyHtml.replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
      if(bodyMd){
        lines.push('');
        lines.push('## Rich Text Body');
        lines.push('');
        lines.push(bodyMd);
      }
    }
    lines.push('');
    lines.push('---');
    return lines.join('\n');
  }).join('\n\n');
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`levelup-notes-${_ymd(new Date())}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`⬇ Exported ${notes.length} notes as Markdown`);
}
function exportNotesPDF(){
  const me=D.creds.userName||'Idris Grant';
  const notes=_notesMyOnly?D.notes.filter(n=>!n.createdBy||n.createdBy===me):D.notes;
  if(!notes.length){toast('No notes to export.');return;}
  let notesHtml='';
  notes.forEach((n,idx)=>{
    const tagBadges=(n.tags||[]).map(t=>`<span style="background:#eef2ff;color:#4f46e5;border-radius:10px;padding:1px 8px;font-size:11px;margin-right:3px">#${t}</span>`).join('');
    const titleColor=n.titleColor?`color:${n.titleColor}`:'color:#111';
    const bodyHtml=n.body?`<div style="font-size:11px;color:#374151;line-height:1.7;margin:8px 0;white-space:pre-wrap">${n.body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`:'';
    const richHtml=n.bodyHtml?`<div style="margin-top:8px;padding:8px;background:#f9fafb;border-left:3px solid #4f46e5;border-radius:0 5px 5px 0"><div style="font-size:11px;font-weight:700;color:#4f46e5;margin-bottom:5px">Rich Text Body</div><div style="font-size:11px;color:#374151;line-height:1.7">${n.bodyHtml}</div></div>`:'';
    notesHtml+=`<div style="page-break-inside:avoid;margin-bottom:20px;padding-bottom:16px;${idx<notes.length-1?'border-bottom:1px solid #e5e7eb':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <h2 style="font-size:14px;font-weight:700;margin:0;${titleColor}">${n.title||'Untitled'}</h2>
        <div style="font-size:11px;color:#9ca3af;white-space:nowrap;margin-left:8px">${fmtNoteDate(n.updated)}</div>
      </div>
      ${tagBadges?`<div style="margin-bottom:6px">${tagBadges}</div>`:''}
      ${n.source?`<div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Source: ${n.source}</div>`:''}
      ${bodyHtml}${richHtml}
    </div>`;
  });
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notes Export</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#111}@media print{body{padding:0}}</style></head><body>
  <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #4f46e5">
    <h1 style="font-size:22px;font-weight:800;margin:0 0 4px">\ud83d\udcdd Notes Export</h1>
    <div style="font-size:12px;color:#6b7280">${notes.length} note${notes.length===1?'':'s'} \u2022 Exported ${new Date().toLocaleDateString()}</div>
  </div>
  ${notesHtml}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">Generated by LevelUp Second Brain \u2022 ${new Date().toLocaleDateString()}</div>
</body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
  toast('\ud83d\udda8 Opening print dialog\u2026 ('+notes.length+' notes)');
}
function importMarkdownFiles(files){
  if(!files||!files.length)return;
  const fileArr=[...files];
  let imported=0;
  let errors=0;
  let processed=0;
  const total=fileArr.length;
  fileArr.forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      processed++;
      try{
        const raw=e.target.result;
        // Extract title from first H1 heading or filename
        const h1Match=raw.match(/^#\s+(.+)$/m);
        const nameNoExt=file.name.replace(/\.(md|markdown|txt)$/i,'');
        const title=h1Match?h1Match[1].trim():nameNoExt;
        // Extract tags from frontmatter (---) or from #tag patterns in body
        let tags=[];
        let body=raw;
        // Parse YAML frontmatter
        const fmMatch=raw.match(/^---\n([\s\S]*?)\n---\n/);
        if(fmMatch){
          const fm=fmMatch[1];
          const tagLine=fm.match(/^tags:\s*(.+)$/m);
          if(tagLine){
            const tagStr=tagLine[1].trim();
            if(tagStr.startsWith('[')){
              tags=tagStr.slice(1,-1).split(',').map(t=>t.trim().replace(/["']/g,'').replace(/^#/,''));
            } else {
              tags=tagStr.split(/[,\s]+/).map(t=>t.trim().replace(/^#/,'')).filter(Boolean);
            }
          }
          body=raw.slice(fmMatch[0].length);
        }
        // Also extract inline #tags from body
        const inlineTags=[...body.matchAll(/(?:^|\s)#([a-zA-Z][\w-]+)/g)].map(m=>m[1]);
        tags=[...new Set([...tags,...inlineTags])].slice(0,10);
        // Remove the first H1 from body to avoid duplication
        body=body.replace(/^#\s+.+\n?/m,'').trim();
        const noteId=nextId(D.notes);
        D.notes.push({
          id:noteId,
          title,
          tags,
          source:'Markdown Import',
          updated:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
          starred:false,
          body,
          createdBy:D.creds.userName||'Idris Grant',
          createdAt:new Date().toISOString()
        });
        imported++;
      } catch(err){
        errors++;
        console.error('Import error for '+file.name,err);
      }
      if(processed===total){
        save('notes');
        invalidateSearchIndex();
        renderNotes();
        const msg=imported===1
          ?`📥 Imported 1 note: "${D.notes[D.notes.length-1].title}"`
          :`📥 Imported ${imported} note${imported!==1?'s':''}${errors?' (⚠ '+errors+' failed)':''}`;
        toast(msg);
        // Reset input so same file can be re-imported
        const inp=document.getElementById('md-import-input');
        if(inp)inp.value='';
      }
    };
    reader.onerror=()=>{
      errors++;processed++;
      if(processed===total&&imported>0){save('notes');renderNotes();}
      toast('⚠ Failed to read: '+file.name);
    };
    reader.readAsText(file);
  });
}
// ─── Document Import (PDF / DOCX / TXT / RTF) ────────────────────────────────
// Bulk importer: parses every selected file server-side, stages the resulting
// notes, then opens a review modal where the user picks which notes to import
// and how to handle title duplicates (skip / overwrite / rename) — mirrors the
// Word-doc importer in Settings.
let _docImportStaged=[];   // [{title,body,bodyHtml,source,tags,fileName}]
let _docImportWarnings=[]; // per-file warnings collected during parsing

// Encode one file to base64 and parse it via the notesImport endpoint.
async function _parseDocumentFile(file){
  const base64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const bytes=new Uint8Array(e.target.result);
      let b64str='';const chunk=8192;
      for(let c=0;c<bytes.length;c+=chunk){
        b64str+=String.fromCharCode.apply(null,bytes.subarray(c,c+chunk));
      }
      resolve(btoa(b64str));
    };
    reader.onerror=reject;
    reader.readAsArrayBuffer(file);
  });
  return _trpc('notesImport.importDocument',{
    fileBase64:base64,
    fileName:file.name,
    mimeType:file.type||'application/octet-stream'
  },'mutation');
}

// Shared full-screen overlay — used first for the parsing progress bar, then
// swapped to the review UI.
function _docImportOverlay(){
  let ov=document.getElementById('doc-import-ov');
  if(ov)return ov;
  ov=document.createElement('div');
  ov.id='doc-import-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  document.body.appendChild(ov);
  return ov;
}
function closeDocImportReview(){
  const ov=document.getElementById('doc-import-ov');
  if(ov)ov.remove();
}

async function importDocumentsBatch(fileList){
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  const MAX_BYTES=100*1024*1024; // 100 MB
  const tooBig=files.filter(f=>f.size>MAX_BYTES);
  const ok=files.filter(f=>f.size<=MAX_BYTES);
  const inp=document.getElementById('doc-import-input');
  if(inp)inp.value=''; // clear so re-selecting the same files works
  if(tooBig.length)toast({type:'error',title:`⚠ ${tooBig.length} file${tooBig.length===1?'':'s'} over 100 MB skipped`,duration:5000});
  if(!ok.length)return;
  _docImportStaged=[];
  _docImportWarnings=[];
  const ov=_docImportOverlay();
  let failed=0;
  for(let i=0;i<ok.length;i++){
    const f=ok[i];
    ov.innerHTML=`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:12px;padding:26px 32px;text-align:center;min-width:300px;max-width:90vw">
      <div style="font-size:13px;font-weight:700;margin-bottom:6px">📄 Reading documents…</div>
      <div style="font-size:11px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i+1} of ${ok.length} · ${esc(f.name)}</div>
      <div style="margin-top:12px;height:4px;background:var(--s2);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.round((i/ok.length)*100)}%;background:var(--ac);transition:width .2s"></div></div>
    </div>`;
    try{
      const result=await _parseDocumentFile(f);
      (result.warnings||[]).forEach(w=>_docImportWarnings.push(`${f.name}: ${w}`));
      // Build -190: a PDF/Word file whose original was NOT stored means the
      // 📄 Original view will be missing — say so loudly, with the server's reason.
      if(/\.(pdf|docx?)$/i.test(f.name)&&(result.notes||[]).length&&!(result.notes||[]).some(n=>n.original&&n.original.url)){
        const why=(result.warnings||[]).find(w=>/could not be stored/i.test(w))||'storage rejected the file';
        toast({type:'error',title:'⚠ Original file not stored — '+f.name,msg:why.replace(/^.*?\(/,'(').slice(0,220),duration:12000});
      }
      (result.notes||[]).forEach(n=>{
        _docImportStaged.push({
          title:((n.title||'').trim()||f.name.replace(/\.[^.]+$/,'')||'Imported Document'),
          body:n.body||'',
          bodyHtml:n.bodyHtml||'',
          source:n.source||'Document Import',
          tags:Array.isArray(n.tags)?n.tags:[],
          original:n.original||null,
          fileName:f.name
        });
      });
    }catch(e){
      failed++;
      console.warn('[docImport] parse failed:',f.name,e);
      _docImportWarnings.push(`${f.name}: ${(e&&e.message)||'could not be read'}`);
    }
  }
  if(!_docImportStaged.length){
    closeDocImportReview();
    toast({type:'error',title:'⚠ No importable content found',msg:failed?`${failed} file${failed===1?'':'s'} failed — see console.`:'The selected files were empty.',duration:6000});
    return;
  }
  openDocImportReview();
}

// ─── Notes bulk-select mode ─────────────────────────────────────────────
let _notesBulkMode=false;
let _notesBulkSelected=new Set();
function toggleNotesBulkMode(){
  _notesBulkMode=!_notesBulkMode;
  if(!_notesBulkMode)_notesBulkSelected.clear();
  const bar=document.getElementById('notes-bulk-bar');
  if(bar)bar.style.display=_notesBulkMode?'flex':'none';
  // Bulk mode is entered from the ⋯ More menu; highlight that button while
  // active so the mode has a visible anchor (exit via the bar's ✕ Done).
  const btn=document.getElementById('btn-notes-more');
  if(btn){btn.style.background=_notesBulkMode?'var(--page-accent)':'';btn.style.color=_notesBulkMode?'#fff':'';btn.textContent=_notesBulkMode?'☑ Selecting…':'⋯ More';}
  document.body.classList.toggle('notes-bulk-mode',_notesBulkMode);
  _updateNotesBulkCount();
  if(typeof applyNotesFilters==='function')applyNotesFilters();
}
function toggleNotesBulkSelect(id,ev){
  if(ev){ev.stopPropagation();}
  id=Number(id);
  if(_notesBulkSelected.has(id))_notesBulkSelected.delete(id);
  else _notesBulkSelected.add(id);
  _updateNotesBulkCount();
  // Update just the visible checkbox without re-rendering everything
  const card=document.querySelector(`.nc[data-nid="${id}"]`);
  if(card){
    const cb=card.querySelector('.nc-bulk-cb');
    if(cb)cb.classList.toggle('on',_notesBulkSelected.has(id));
    card.classList.toggle('bulk-checked',_notesBulkSelected.has(id));
  }
}
function bulkNotesSelectAll(all){
  if(all){
    const visible=document.querySelectorAll('#notes-list-inner .nc[data-nid]');
    visible.forEach(n=>_notesBulkSelected.add(Number(n.dataset.nid)));
  }else{
    _notesBulkSelected.clear();
  }
  _updateNotesBulkCount();
  if(typeof applyNotesFilters==='function')applyNotesFilters();
}
function _updateNotesBulkCount(){
  const el=document.getElementById('notes-bulk-count');
  if(el)el.textContent=`${_notesBulkSelected.size} selected`;
}
function _bulkNotesArr(){return D.notes.filter(n=>_notesBulkSelected.has(n.id));}

async function bulkNotesAutoTag(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  if(!confirm(`Auto-tag ${arr.length} note${arr.length===1?'':'s'}? Up to 5 tags per note will be appended based on content keywords + similar notes.`))return;
  toast({type:'info',title:`🏷 Auto-tagging ${arr.length} notes…`,duration:2500});
  // Lightweight keyword + similar-tag extraction (mirrors aiAutoTagNote logic
  // but no modal). Skip notes with <20 chars of body.
  const stopWords=new Set(['this','that','with','from','have','been','will','they','their','there','what','when','where','which','about','into','more','also','some','than','then','these','those','were','your','just','like','very','over','such','each','both','after','before','could','would','should','other','only','most','many','much','even','well','back','good','here','time','year','work','need','want','make','take','give','know','think','come','look','going','doing','being','having']);
  const allTags=[...new Set(D.notes.flatMap(x=>x.tags||[]))];
  let touched=0;
  arr.forEach(n=>{
    const body=(n.body||'').trim();if(body.length<20)return;
    const words=body.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter(w=>w.length>=4&&!stopWords.has(w));
    const freq={};words.forEach(w=>{freq[w]=(freq[w]||0)+1;});
    const top=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([w])=>w);
    const related=allTags.filter(t=>body.toLowerCase().includes(t.toLowerCase())&&!(n.tags||[]).includes(t)).slice(0,3);
    const newTags=[...new Set([...related,...top])].slice(0,5);
    const existing=new Set((n.tags||[]).map(t=>t.toLowerCase()));
    const adds=newTags.filter(t=>!existing.has(t.toLowerCase()));
    if(adds.length){n.tags=[...(n.tags||[]),...adds];touched++;}
  });
  save('notes');toggleNotesBulkMode();renderNotes();
  toast({type:'success',title:`✓ Tagged ${touched} of ${arr.length} notes`,duration:3500});
}
function bulkNotesTag(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  const tag=prompt(`Add a tag to ${arr.length} note${arr.length===1?'':'s'} (no # prefix):`,'');
  if(!tag||!tag.trim())return;
  const t=tag.trim().replace(/^#/,'');
  arr.forEach(n=>{n.tags=n.tags||[];if(!n.tags.includes(t))n.tags.push(t);});
  save('notes');toggleNotesBulkMode();renderNotes();
  toast(`✓ Added #${t} to ${arr.length} note${arr.length===1?'':'s'}`);
}
function bulkNotesStar(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  const anyUnstarred=arr.some(n=>!n.starred);
  arr.forEach(n=>{n.starred=anyUnstarred;});
  save('notes');toggleNotesBulkMode();renderNotes();
  toast(anyUnstarred?`⭐ Starred ${arr.length}`:`Unstarred ${arr.length}`);
}
function bulkNotesPin(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  const anyUnpinned=arr.some(n=>!n.pinned);
  arr.forEach(n=>{n.pinned=anyUnpinned;});
  save('notes');toggleNotesBulkMode();renderNotes();
  toast(anyUnpinned?`📌 Pinned ${arr.length}`:`Unpinned ${arr.length}`);
}
function bulkNotesDelete(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  if(!confirm(`Delete ${arr.length} note${arr.length===1?'':'s'}? They stay in the Trash for 30 days.`))return;
  _noteAutosaveNow();
  const ids=new Set(arr.map(n=>n.id));
  const gone=[];D.notes.forEach((n,i)=>{if(ids.has(n.id))gone.push({n,i});});
  D.notes=D.notes.filter(n=>!ids.has(n.id));
  if(_notesOpenId!=null&&gone.some(g=>String(g.n.id)===_notesOpenId))_notesRememberOpen(null);
  save('notes');toggleNotesBulkMode();renderNotes();
  toast({type:'info',title:`🗑 Deleted ${ids.size} note${ids.size===1?'':'s'}`,msg:'They stay in the Trash for 30 days.',duration:8000,
    actions:[{label:'Undo',primary:true,onClick:()=>_noteUndoDelete(gone)}]});
}
function bulkNotesExport(){
  const arr=_bulkNotesArr();if(!arr.length){toast('Nothing selected');return;}
  const md=arr.map(n=>`# ${n.title||'Untitled'}\n\n${(n.tags||[]).map(t=>'#'+t).join(' ')}\n\n${n.body||''}\n\n---\n`).join('\n');
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`notes-export-${_ymd(new Date())}.md`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(`⬇ Exported ${arr.length} note${arr.length===1?'':'s'} as Markdown`);
}

// Review modal: lists every staged note with a checkbox + duplicate badge,
// plus a skip / overwrite / rename selector for title duplicates.
function openDocImportReview(){
  const ov=_docImportOverlay();
  ov.onclick=e=>{if(e.target===ov)closeDocImportReview();};
  const warnHtml=_docImportWarnings.length
    ?`<div style="background:var(--warn-bg,#fffbeb);border:1px solid var(--warn,#f59e0b);border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--t2);max-height:96px;overflow-y:auto">
        <div style="font-weight:700;margin-bottom:3px">⚠ ${_docImportWarnings.length} warning${_docImportWarnings.length===1?'':'s'}</div>
        ${_docImportWarnings.map(w=>`<div>• ${esc(w)}</div>`).join('')}
      </div>`
    :'';
  ov.innerHTML=`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:12px;width:560px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--bd1)">
      <div style="font-size:14px;font-weight:700">📄 Review import — ${_docImportStaged.length} note${_docImportStaged.length===1?'':'s'}</div>
      <button class="btn btn-s" style="height:24px;width:24px;padding:0" onclick="closeDocImportReview()">✕</button>
    </div>
    <div style="padding:14px 16px;overflow-y:auto">
      ${warnHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;gap:6px">
          <button class="btn btn-s" style="font-size:11px;height:24px" onclick="docImportSelectAll(true)">Select all</button>
          <button class="btn btn-s" style="font-size:11px;height:24px" onclick="docImportSelectAll(false)">Deselect all</button>
        </div>
        <div id="doc-import-dupinfo" style="font-size:11px;color:var(--t3)"></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px;background:var(--s2);border-radius:6px">
        <span style="font-size:11px;font-weight:600;color:var(--t2);white-space:nowrap">Duplicate handling:</span>
        <select id="doc-import-dup-mode" class="inp" style="height:24px;font-size:11px;flex:1" onchange="_renderDocImportRows()">
          <option value="skip">Skip duplicates (keep existing)</option>
          <option value="overwrite">Overwrite duplicates</option>
          <option value="rename">Import as new (rename with suffix)</option>
        </select>
      </div>
      <div id="doc-import-list" style="max-height:46vh;overflow-y:auto;border:1px solid var(--bd1);border-radius:8px"></div>
    </div>
    <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--bd1)">
      <button class="btn btn-s" style="flex:1;font-size:12px" onclick="closeDocImportReview()">Cancel</button>
      <button class="btn btn-p" style="flex:2;font-size:12px" onclick="confirmDocImport()">📥 Import selected</button>
    </div>
  </div>`;
  _renderDocImportRows();
}

// A staged note is a duplicate when its (trimmed, case-insensitive) title
// already exists among the user's notes.
function _docImportIsDup(title){
  const t=(title||'').trim().toLowerCase();
  return !!t&&D.notes.some(n=>(n.title||'').trim().toLowerCase()===t);
}

function _renderDocImportRows(){
  const list=document.getElementById('doc-import-list');
  if(!list)return;
  // Preserve checkbox state — changing the duplicate mode re-renders the list.
  const wasChecked=_docImportStaged.map((_,i)=>{
    const c=document.getElementById('doc-import-chk-'+i);
    return c?c.checked:true;
  });
  const dupMode=(document.getElementById('doc-import-dup-mode')||{}).value||'skip';
  let dupCount=0;
  list.innerHTML=_docImportStaged.map((n,i)=>{
    const isDup=_docImportIsDup(n.title);
    if(isDup)dupCount++;
    const dupTag=isDup
      ?`<span style="margin-left:6px;font-size:11px;background:var(--warn,#f59e0b);color:#fff;padding:1px 6px;border-radius:8px">duplicate · ${dupMode}</span>`
      :'';
    const plain=String(n.body||(n.bodyHtml||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,90);
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;${i<_docImportStaged.length-1?'border-bottom:1px solid var(--bd1)':''}">
      <input type="checkbox" id="doc-import-chk-${i}" ${wasChecked[i]?'checked':''} style="margin-top:2px;flex-shrink:0;accent-color:var(--ac)">
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.title)}${dupTag}</div>
        <div style="font-size:11px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.fileName)}${plain?' · '+esc(plain):''}</div>
      </div>
    </div>`;
  }).join('');
  const info=document.getElementById('doc-import-dupinfo');
  if(info)info.textContent=dupCount?`${dupCount} duplicate${dupCount===1?'':'s'} found`:'No duplicates';
}

function docImportSelectAll(sel){
  _docImportStaged.forEach((_,i)=>{
    const chk=document.getElementById('doc-import-chk-'+i);
    if(chk)chk.checked=sel;
  });
}

async function confirmDocImport(){
  const dupMode=(document.getElementById('doc-import-dup-mode')||{}).value||'skip';
  const selected=_docImportStaged.filter((_,i)=>{
    const chk=document.getElementById('doc-import-chk-'+i);
    return chk&&chk.checked;
  });
  if(!selected.length){toast('⚠ Select at least one note to import','error');return;}
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  let imported=0,skipped=0,overwritten=0;
  for(const n of selected){
    const isDup=_docImportIsDup(n.title);
    if(isDup&&dupMode==='skip'){skipped++;continue;}
    if(isDup&&dupMode==='overwrite'){
      const t=n.title.trim().toLowerCase();
      const ex=D.notes.find(x=>(x.title||'').trim().toLowerCase()===t);
      if(ex){
        ex.body=n.body;ex.bodyHtml=n.bodyHtml;ex.source=n.source;
        if(n.original)ex.original=n.original;
        if(n.tags.length)ex.tags=[...new Set([...(ex.tags||[]),...n.tags])];
        ex.updated=now;
        overwritten++;
        continue;
      }
    }
    const title=(isDup&&dupMode==='rename')?n.title+' (imported)':n.title;
    D.notes.push({
      id:nextId(D.notes),
      title,
      body:n.body,
      bodyHtml:n.bodyHtml,
      tags:n.tags,
      source:n.source,
      original:n.original||null,
      updated:now,
      starred:false,
      createdBy:D.creds.userName||'Idris Grant',
      createdAt:new Date().toISOString()
    });
    imported++;
  }
  save('notes');
  invalidateSearchIndex();
  renderNotes();
  // Push to the server immediately — a freshly imported note too big for the
  // localStorage cache lives only in memory until the server has it.
  if(typeof _pushKeyToServer==='function'){
    try{await _pushKeyToServer('notes');}catch(_){}
  }
  closeDocImportReview();
  _docImportStaged=[];
  _docImportWarnings=[];
  const parts=[];
  if(imported)parts.push(`${imported} imported`);
  if(overwritten)parts.push(`${overwritten} overwritten`);
  if(skipped)parts.push(`${skipped} skipped`);
  toast({type:'success',title:'📄 Document import complete',msg:parts.join(' · ')||'Nothing imported',duration:4500});
}
const _noteTemplates=[
  {label:'📅 Meeting Notes',icon:'📅',tags:['meetings'],body:`# Meeting Notes\n**Date:** ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}\n**Attendees:** \n**Facilitator:** \n\n## Agenda\n- \n- \n\n## Discussion\n\n## Decisions Made\n- \n\n## Action Items\n| Task | Owner | Due |\n|------|-------|-----|\n| | | |\n\n## Next Meeting\n**Date:** \n**Agenda:** `},
  {label:'📁 Project Brief',icon:'📁',tags:['process'],body:`# Project Brief\n**Project:** \n**Owner:** ${D.creds.userName||'Idris Grant'}\n**Start Date:** ${_ymd(new Date())}\n**Target Date:** \n\n## Objective\n\n## Background & Context\n\n## Scope\n### In Scope\n- \n### Out of Scope\n- \n\n## Success Metrics\n- \n\n## Key Stakeholders\n| Name | Role | Involvement |\n|------|------|-------------|\n| | | |\n\n## Risks & Mitigations\n| Risk | Likelihood | Impact | Mitigation |\n|------|-----------|--------|-----------|\n| | | | |\n\n## Resources Needed\n- `},
  {label:'🗓 Weekly Review',icon:'🗓',tags:['strategy','productivity'],body:`# Weekly Review\n**Week of:** ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}\n\n## 🌟 Wins This Week\n- \n\n## 🚧 What Didn't Go Well\n- \n\n## 📊 Progress on Goals\n| Goal | Progress | Notes |\n|------|----------|-------|\n| | | |\n\n## 📌 Carry-Over Tasks\n- \n\n## 🔭 Focus for Next Week\n1. \n2. \n3. \n\n## 💡 Insights & Learnings\n`},
  {label:'💡 Idea Capture',icon:'💡',tags:['vision'],body:`# Idea: \n**Captured:** ${new Date().toLocaleDateString()}\n**Category:** \n\n## The Idea\n\n## Why It Matters\n\n## How It Could Work\n\n## Next Steps\n- [ ] \n\n## Related Notes\n- `},
  {label:'📚 Book Notes',icon:'📚',tags:['books','research'],body:`# Book Notes: [Title]\n**Author:** \n**Finished:** \n**Rating:** /5\n\n## One-Line Summary\n\n## Key Ideas\n1. \n2. \n3. \n\n## Favourite Quotes\n> \n\n## How I'll Apply This\n- \n\n## Related Books\n- `}
];
function openNoteTemplates(){
  const ov=document.createElement('div');
  ov.id='note-tmpl-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  ov.innerHTML=`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:10px;padding:20px;width:420px;max-width:95vw">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">${_icon('bookOpen',13,'currentColor')} Note Templates</div>
    <button class="btn btn-s" style="height:24px;width:24px;padding:0" onclick="document.getElementById('note-tmpl-ov').remove()">✕</button>
  </div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Select a template to create a new note with pre-filled structure.</div>
  ${_noteTemplates.map((tmpl,i)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid var(--bd1);margin-bottom:6px" onmouseover="this.style.background='var(--s2)'" onmouseout="this.style.background=''" onclick="applyNoteTemplate(${i})">
    <span style="font-size:20px">${tmpl.icon}</span>
    <div><div style="font-size:12px;font-weight:600">${tmpl.label}</div><div style="font-size:11px;color:var(--t3)">${(tmpl.tags||[]).map(t=>'#'+t).join(' ')}</div></div>
  </div>`).join('')}
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}
function applyNoteTemplate(idx){
  const tmpl=_noteTemplates[idx];
  if(!tmpl)return;
  document.getElementById('note-tmpl-ov')?.remove();
  const newNote={
    id:Date.now(),
    title:tmpl.label.replace(/^[^a-zA-Z]+/,'').trim()+' — '+new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
    body:tmpl.body,
    tags:[...tmpl.tags],
    source:'Template',
    category:'Recent',
    starred:false,
    updated:new Date().toISOString(),createdAt:new Date().toISOString(),
    createdBy:D.creds.userName||'Idris Grant'
  };
  D.notes.unshift(newNote);
  save('notes');
  renderNotes();
  showNoteInEditor(newNote.id);
  toggleNoteInlineEdit(newNote.id);
  toast('📝 Template applied — start editing!');
}
// Collapsible Notes-nav sections — persisted so the panel stays how you left it.
function _nnc(k){return !!(D.prefs&&D.prefs.notesNavCollapsed&&D.prefs.notesNavCollapsed[k]);}
function _toggleNotesNavSec(k){D.prefs=D.prefs||{};const c=D.prefs.notesNavCollapsed=D.prefs.notesNavCollapsed||{};c[k]=!c[k];save('prefs');renderNotes();}
function renderNotes(){
  _noteAutosaveNow(); // the page is about to be rebuilt: keep any typing
  // Update header subtitle with live counts (matches the .ph-r subtitle
  // pattern used on Tasks / Projects / Goals etc.)
  const subEl=document.getElementById('notes-page-sub');
  if(subEl){
    const total=D.notes.length;
    const inFolders=D.notes.filter(n=>n.folderId).length;
    const starred=D.notes.filter(n=>n.starred).length;
    const pinned=D.notes.filter(n=>n.pinned).length;
    const recent=D.notes.filter(n=>{try{const d=_pd(n.updated);const w=new Date();w.setDate(w.getDate()-7);return d>=w;}catch(_){return false;}}).length;
    const parts=[`${total} note${total===1?'':'s'}`];
    if(inFolders>0)parts.push(`${inFolders} in folders`);
    if(recent>0)parts.push(`${recent} this week`);
    if(starred>0)parts.push(`${starred} starred`);
    if(pinned>0)parts.push(`${pinned} pinned`);
    subEl.textContent=parts.join(' · ');
  }
  // Populate Notes nav panel
  const nav=$('notes-nav-panel');
  // Collapsible section headings (state persists in D.prefs.notesNavCollapsed)
  const _nnHead=(key,label)=>`<div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin:10px 0 4px;padding:0 4px;cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px" onclick="_toggleNotesNavSec('${_jsAttr(key)}')" title="Click to ${_nnc(key)?'expand':'collapse'}"><span style="font-size:11px">${_nnc(key)?'▸':'▾'}</span>${label}</div>`;
  nav.innerHTML=`<div style="font-size:13px;font-weight:600;margin-bottom:10px;padding:0 4px">Notes</div>
  ${['Recent','Favorites','Web Clips','Meeting Notes','Journal','Resources'].map((n,i)=>`<div class="nn ${i===0&&!_notesFilterStatus?'on':''}" onclick="filterNotesByCategory('${_jsAttr(n)}',this)">${n}</div>`).join('')}
  ${_nnHead('lifecycle','Lifecycle')}
  ${_nnc('lifecycle')?'':(()=>{
    const _u=D.notes.filter(n=>!n.folderId);
    return _NOTE_STATUSES.map(s=>{
      const c=_u.filter(n=>_noteStatus(n)===s.id).length;
      const on=_notesFilterStatus===s.id;
      return `<div class="nn ${on?'on':''}" onclick="filterNotesByStatus('${_jsAttr(s.id)}')" style="display:flex;align-items:center;gap:6px" title="${esc(s.hint)}"><span style="color:${s.color}">${s.icon}</span> ${s.label}<span style="margin-left:auto;font-size:11px;color:var(--t3)">${c}</span></div>`;
    }).join('');
  })()}
  ${_nnHead('smart','Smart Folders')}
  ${_nnc('smart')?'':(()=>{
    const now=new Date(); const todayStr=_ymd(now);
    const weekAgo=_pd(now); weekAgo.setDate(weekAgo.getDate()-7);
    // Counts only consider un-foldered notes so they match what the smart
    // folder views actually show after applyNotesFilters hides foldered notes.
    const _unfiled=D.notes.filter(n=>!n.folderId);
    const modThisWeek=_unfiled.filter(n=>{ try{const d=_pd(n.updated);return d>=weekAgo;}catch(e){return false;} }).length;
    const noTags=_unfiled.filter(n=>!n.tags||!n.tags.length).length;
    const longNotes=_unfiled.filter(n=>(n.body||'').length>500).length;
    const unlinked=_unfiled.filter(n=>!((n.body||'').includes('[['))).length;
    // (#H) Three more derived folders: notes with embedded images, the most-
    // backlinked notes, and stale notes (>90 days untouched).
    const withImages=_unfiled.filter(n=>typeof _noteFirstImage==='function'&&_noteFirstImage(n.bodyHtml||n.body||'')).length;
    // Backlink count = how many other notes contain [[this title]]
    const titleSet=D.notes.map(n=>n.title||'');
    const backlinkCount={};
    titleSet.forEach(t=>backlinkCount[t]=0);
    D.notes.forEach(n=>{
      const text=(n.body||'')+' '+(n.bodyHtml||'');
      const m=text.match(/\[\[([^\]\n]+)\]\]/g)||[];
      m.forEach(s=>{const t=s.slice(2,-2).trim();if(t in backlinkCount)backlinkCount[t]++;});
    });
    const mostLinked=_unfiled.filter(n=>(backlinkCount[n.title]||0)>0).length;
    const staleCutoff=Date.now()-90*86400000;
    const staleNotes=_unfiled.filter(n=>{try{const d=Date.parse(n.updated);return !isNaN(d)&&d<staleCutoff;}catch(_){return false;}}).length;
    const smartFolders=[
      {icon:'🕐',label:'Modified this week',count:modThisWeek,filter:'smart_recent'},
      {icon:'🏷',label:'No tags',count:noTags,filter:'smart_notags'},
      {icon:'📖',label:'Long notes',count:longNotes,filter:'smart_long'},
      {icon:'🔗',label:'Unlinked notes',count:unlinked,filter:'smart_unlinked'},
      {icon:'🖼',label:'Has images',count:withImages,filter:'smart_images'},
      {icon:'⭐',label:'Most-linked',count:mostLinked,filter:'smart_mostlinked'},
      {icon:'🧹',label:'Stale (>90d)',count:staleNotes,filter:'smart_stale'},
    ];
    return `<div class="nn" role="button" tabindex="0" title="Notes deleted in the last 30 days"${_act('openNotesTrash',[])} style="display:flex;align-items:center;gap:5px">🗑 Trash</div>`+smartFolders.map(sf=>`<div class="nn" onclick="filterNotesBySmart('${_jsAttr(sf.filter)}',this)" style="display:flex;align-items:center;gap:5px">${sf.icon} ${sf.label}<span style="margin-left:auto;font-size:11px;color:var(--t3)">${sf.count}</span></div>`).join('');
  })()}
  <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin:10px 0 4px;padding:0 4px;display:flex;align-items:center;justify-content:space-between">
    <span>${_icon('folder',12,'currentColor')} Folders</span>
    <span style="cursor:pointer;color:var(--ac);font-size:13px;font-weight:700;padding:0 3px;line-height:1" onclick="addNoteFolder(null)" title="New top-level folder">+</span>
  </div>
  ${(()=>{
    const renderTree=(parentId,depth)=>{
      return _noteFoldersChildrenOf(parentId).map(f=>{
        const count=D.notes.filter(n=>n.folderId===f.id).length;
        const subs=_noteFoldersChildrenOf(f.id);
        const hasChildren=subs.length>0;
        const isActive=_notesFilterFolder===f.id;
        const indent=depth*10;
        return `<div class="nn nn-folder ${isActive?'on':''}" style="padding-left:${4+indent}px;display:flex;align-items:center;gap:4px;position:relative" data-folder-id="${f.id}" ondragover="_folderDragOver(event)" ondragleave="_folderDragLeave(event)" ondrop="_folderDrop(event,${f.id})" onclick="setNotesFolderFilter(${f.id})">
          <span style="color:${f.color||'var(--ac)'};font-size:12px;width:14px;text-align:center">${esc(f.icon||'📁')}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
          <span style="font-size:11px;color:var(--t3);flex-shrink:0">${count}</span>
          <span class="nn-folder-act" onclick="event.stopPropagation();addNoteFolder(${f.id})" title="Add subfolder">+</span>
          <span class="nn-folder-act" onclick="event.stopPropagation();changeNoteFolderIcon(${f.id})" title="Change icon">🎨</span>
          <span class="nn-folder-act" onclick="event.stopPropagation();renameNoteFolder(${f.id})" title="Rename">✏</span>
          <span class="nn-folder-act nn-folder-del" onclick="event.stopPropagation();deleteNoteFolder(${f.id})" title="Delete">×</span>
        </div>${hasChildren?renderTree(f.id,depth+1):''}`;
      }).join('');
    };
    const tree=renderTree(null,0);
    const allDrop=`<div class="nn nn-folder ${_notesFilterFolder===null?'':'nn-no-folder'}" style="padding-left:4px;display:flex;align-items:center;gap:4px;font-size:11px;color:var(--t3)" ondragover="_folderDragOver(event)" ondragleave="_folderDragLeave(event)" ondrop="_folderDrop(event,null)" onclick="clearNotesFolderFilter()" title="Drop here to remove from folder">↩ No folder · ${D.notes.filter(n=>!n.folderId).length}</div>`;
    return tree?(tree+allDrop):`<div style="font-size:11px;color:var(--t3);padding:4px 8px;line-height:1.5">No folders. Click + above to add one.<br>Drag any note onto a folder to assign.</div>${allDrop}`;
  })()}
  <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin:10px 0 4px;padding:0 4px">Tag Cloud</div>
  <div style="padding:0 4px" id="notes-tag-cloud">${(()=>{
    const freq={};
    D.notes.forEach(n=>(n.tags||[]).forEach(t=>{freq[t]=(freq[t]||0)+1;}));
    const tags=Object.entries(freq).sort((a,b)=>b[1]-a[1]);
    if(!tags.length)return '<span style="font-size:11px;color:var(--t3)">No tags yet</span>';
    const maxF=tags[0][1];
    const minF=tags[tags.length-1][1];
    const range=Math.max(maxF-minF,1);
    return tags.map(([tag,count])=>{
      const sz=Math.round(9+(count-minF)/range*7); // 9px–16px
      const op=0.55+(count-minF)/range*0.45; // 0.55–1.0
      const hue=Math.abs(tag.split('').reduce((h,c)=>h*31+c.charCodeAt(0),0))%360;
      return `<span style="font-size:${sz}px;opacity:${op.toFixed(2)};color:hsl(${hue},55%,62%);cursor:pointer;margin:2px 3px 2px 0;display:inline-block;line-height:1.4;transition:opacity .15s,transform .15s" onmouseover="this.style.opacity='1';this.style.transform='scale(1.12)'" onmouseout="this.style.opacity='${op.toFixed(2)}';this.style.transform=''" onclick="filterNotesByTag('${_jsAttr(tag)}')" title="${count} note${count>1?'s':''}">#${esc(tag)}</span>`;
    }).join('');
  })()}</div>
  <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin:10px 0 4px;padding:0 4px">PARA</div>
  ${(()=>{
    // (#I) Wire PARA categories to real tag-based counts. Click a row to filter
    // the list to notes carrying that tag. Tag name lookup is case-insensitive
    // and tries both singular/plural forms.
    const paraCats=[
      {label:'Projects',icons:'📁',tags:['project','projects']},
      {label:'Areas',icons:'🗂',tags:['area','areas']},
      {label:'Resources',icons:'📚',tags:['resource','resources']},
      {label:'Archive',icons:'🗄',tags:['archive','archived']},
    ];
    return paraCats.map(p=>{
      const count=D.notes.filter(n=>(n.tags||[]).some(t=>p.tags.includes((t||'').toLowerCase()))).length;
      return `<div class="nn" onclick="filterNotesByTag('${_jsAttr(p.tags[0])}');" style="display:flex;align-items:center;gap:5px" title="Filter to notes tagged #${p.tags[0]}">${p.icons} ${p.label}<span style="margin-left:auto;font-size:11px;color:var(--t3)">${count}</span></div>`;
    }).join('');
  })()}
  <div style="margin-top:auto;padding:8px 4px 0">
    <button class="btn btn-p" style="width:100%;height:28px;font-size:11px" onclick="openFA('note')">+ New Note</button>
  </div>`;

  // Populate Notes list panel
  const list=$('notes-list-panel');
  // Build unique tags and sources from notes data for filter chips
  const _allNoteTags=[...new Set(D.notes.flatMap(n=>n.tags||[]))].sort();
  const _allNoteSources=[...new Set(D.notes.map(n=>n.source||'Manual'))].sort();
  list.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
  <!-- Header row -->
  <div style="padding:8px 8px 4px;border-bottom:1px solid var(--bd1);flex-shrink:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
      <div style="font-size:12px;font-weight:600">Notes <span id="notes-filter-count" style="font-size:11px;color:var(--t3);font-weight:400">${D.notes.length} notes</span></div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
        <input type="file" id="md-import-input" accept=".md,.markdown,.txt" multiple style="display:none" onchange="importMarkdownFiles(this.files)">
        <input type="file" id="doc-import-input" accept=".pdf,.docx,.doc,.txt,.rtf" multiple style="display:none" onchange="importDocumentsBatch(this.files)">
        <!-- View mode segment (#C) -->
        <div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:5px;overflow:hidden">
          <button id="notes-view-list" class="btn" style="height:22px;width:24px;padding:0;font-size:11px;border:none;background:${(D.prefs&&D.prefs.notesViewMode==='grid')?'transparent':'var(--ac)'};color:${(D.prefs&&D.prefs.notesViewMode==='grid')?'var(--t2)':'#fff'}" title="List view" onclick="setNotesViewMode('list')">☰</button>
          <button id="notes-view-grid" class="btn" style="height:22px;width:24px;padding:0;font-size:11px;border:none;background:${(D.prefs&&D.prefs.notesViewMode==='grid')?'var(--ac)':'transparent'};color:${(D.prefs&&D.prefs.notesViewMode==='grid')?'#fff':'var(--t2)'}" title="Grid view" onclick="setNotesViewMode('grid')">▦</button>
        </div>
        <!-- Scope segment -->
        <div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:5px;overflow:hidden">
          <button id="notes-scope-my" class="btn" style="height:22px;font-size:11px;padding:0 6px;border:none;background:${_notesMyOnly?'var(--ac)':'transparent'};color:${_notesMyOnly?'#fff':'var(--t2)'}" onclick="setNotesScope(true)">Mine</button>
          <button id="notes-scope-all" class="btn" style="height:22px;font-size:11px;padding:0 6px;border:none;background:${_notesMyOnly?'transparent':'var(--ac)'};color:${_notesMyOnly?'var(--t2)':'#fff'}" onclick="setNotesScope(false)">All</button>
        </div>
        <!-- Overflow menu (#B) — collects infrequent actions -->
        <div style="position:relative;display:inline-block">
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();togglePopMenu('notes-overflow-menu')" title="More actions">⋮</button>
          <div id="notes-overflow-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:26px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');openNoteTemplates()">${_icon('bookOpen',13,'currentColor')} Templates</button>
            <div style="height:1px;background:var(--bd1);margin:3px 2px"></div>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');document.getElementById('md-import-input').click()">📥 Import .md / .txt</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');document.getElementById('doc-import-input').click()">📄 Import PDF / Word / RTF</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" title="Pull meeting notes from your OneNote meeting-notes section (set it in Settings → Integrations → OneNote)" onclick="closePopMenu('notes-overflow-menu');syncOnenoteMeetingNotes()">⟳ Sync OneNote meeting notes</button>
            <div style="height:1px;background:var(--bd1);margin:3px 2px"></div>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');exportNotesMarkdown()">⬇ Export all as Markdown</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');exportNotesPDF()">🖨 Export all as PDF</button>
            <div style="height:1px;background:var(--bd1);margin:3px 2px"></div>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');aiNoteQA()">🤔 Ask AI across all notes</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;color:#8B5CF6;background:transparent;border:none;text-align:left" onclick="closePopMenu('notes-overflow-menu');bulkAutoTagNotes()">🏷 AI auto-tag all untagged</button>
          </div>
        </div>
      </div>
    </div>
    <!-- Search + Filter toggle row -->
    <div style="display:flex;gap:4px;align-items:center">
      <input id="notes-search" class="inp" placeholder="🔍 Search notes…" value="${esc(_notesFilterText||'')}" style="flex:1;height:26px;font-size:11px" oninput="filterNotesList(this.value)">
      <button id="notes-filter-toggle" class="btn btn-s" style="height:26px;font-size:11px;padding:0 7px;flex-shrink:0;white-space:nowrap;background:${_notesFilterPanelOpen?'var(--ac)':''};color:${_notesFilterPanelOpen?'#fff':''}" onclick="_notesFilterPanelOpen=!_notesFilterPanelOpen;document.getElementById('notes-filter-panel').style.display=_notesFilterPanelOpen?'block':'none';this.style.background=_notesFilterPanelOpen?'var(--ac)':'';this.style.color=_notesFilterPanelOpen?'#fff':'';" title="Toggle filters">⚙ Filter</button>
    </div>
    <!-- Active filter summary bar -->
    <div id="notes-filter-summary" style="display:flex;align-items:center;gap:6px;margin-top:4px;min-height:18px">
      <button id="notes-filter-clear" class="btn" style="display:none;height:18px;font-size:10px;padding:0 7px;background:var(--warn);color:#fff;border-radius:10px" onclick="clearNotesFilters()">✕ Clear filters</button>
    </div>
  </div>
  <!-- Collapsible filter panel -->
  <div id="notes-filter-panel" style="display:${_notesFilterPanelOpen?'block':'none'};padding:8px;border-bottom:1px solid var(--bd1);background:var(--s2);flex-shrink:0;overflow-y:auto;max-height:260px">
    <!-- Sort + Group By -->
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;white-space:nowrap">Sort</span>
      <select id="nf-sort-select" class="inp" style="height:22px;font-size:11px;flex:1" onchange="setNotesSort(this.value)">
        ${[['newest','Newest first'],['oldest','Oldest first'],['az','A → Z'],['za','Z → A'],['longest','Longest body'],['tagged','Most tagged']]
          .map(([v,l])=>`<option value="${v}" ${_notesSort===v?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;white-space:nowrap">Group</span>
      <select id="nf-group-select" class="inp" style="height:22px;font-size:11px;flex:1" onchange="setNotesGroupBy(this.value)">
        ${[['','None'],['tag','By Tag'],['source','By Source'],['date','By Date']]
          .map(([v,l])=>`<option value="${v}" ${_notesGroupBy===v?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <!-- Tag facet -->
    <div style="margin-bottom:8px">
      <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Tags <span style="font-weight:400;color:var(--t3)">(multi-select, AND)</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">
        ${_allNoteTags.map(tag=>{
          const _on=_notesFilterTags.has(String(tag).toLowerCase());
          return `<span class="nf-tag-chip" data-active="${_on?'1':''}" style="font-size:11px;padding:2px 7px;border-radius:10px;background:${_on?'var(--ac)':'var(--s3)'};color:${_on?'#fff':'var(--t2)'};cursor:pointer;border:1px solid var(--bd2)" onclick="toggleNotesFilterTag('${_jsAttr(tag)}',this)">#${esc(tag)}</span>`;
        }).join('')}
        ${_allNoteTags.length===0?'<span style="font-size:11px;color:var(--t3)">No tags yet</span>':''}
      </div>
    </div>
    <!-- Source facet -->
    <div style="margin-bottom:8px">
      <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Source <span style="font-weight:400;color:var(--t3)">(multi-select, OR)</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">
        ${_allNoteSources.map(src=>{
          const icons={'Manual':'✍','Meeting Notes':'📋','Web Clipper':'🔗','Template':'📄','OneNote Import':'📓','Markdown Import':'📥','Quick Capture':'⚡','AI':'🤖','PDF Import':'📕','Word Import':'📘','Document Import':'📄','Text Import':'📃'};
          const icon=icons[src]||'📝';
          const _on=_notesFilterSources.has(String(src).toLowerCase());
          return `<span class="nf-src-chip" data-active="${_on?'1':''}" style="font-size:11px;padding:2px 7px;border-radius:10px;background:${_on?'var(--ac)':'var(--s3)'};color:${_on?'#fff':'var(--t2)'};cursor:pointer;border:1px solid var(--bd2)" onclick="toggleNotesFilterSource('${_jsAttr(src)}',this)">${icon} ${esc(src)}</span>`;
        }).join('')}
      </div>
    </div>
    <!-- Date range facet -->
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Date modified</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px">
        ${['today','week','month','year','custom'].map(p=>{
          const labels={today:'Today',week:'This week',month:'This month',year:'This year',custom:'Custom…'};
          const _on=_notesFilterDatePreset===p;
          return `<button class="nf-date-btn btn btn-s" data-active="${_on?'1':''}" style="height:20px;font-size:10px;padding:0 7px;background:${_on?'var(--ac)':'var(--s3)'};color:${_on?'#fff':'var(--t2)'}" onclick="setNotesDatePreset('${_jsAttr(p)}',this)">${labels[p]}</button>`;
        }).join('')}
      </div>
      <div id="nf-custom-date-row" style="display:${_notesFilterDatePreset==='custom'?'flex':'none'};gap:4px;align-items:center">
        <input type="date" id="nf-date-from" class="inp" value="${esc(_notesFilterDateFrom||'')}" style="height:22px;font-size:11px;flex:1" onchange="_notesFilterDateFrom=this.value;applyNotesFilters()">
        <span style="font-size:11px;color:var(--t3)">to</span>
        <input type="date" id="nf-date-to" class="inp" value="${esc(_notesFilterDateTo||'')}" style="height:22px;font-size:11px;flex:1" onchange="_notesFilterDateTo=this.value;applyNotesFilters()">
      </div>
    </div>
  </div>
  <!-- Notes list -->
  <div id="notes-list-inner" style="overflow-y:auto;flex:1"></div>
  </div>`;
  // Trigger initial render via unified filter engine
  applyNotesFilters();

  // Populate Notes editor panel: the note open last time on this device
  // (showNoteInEditor fills it once the rail exists, below).
  const editor=$('notes-editor-panel');
  const _openNote=_notesOpenNote();
  if(_openNote)editor.innerHTML='';
  else{_noteEditorBase=null;_noteInlineEditId=null;editor.innerHTML=renderEmptyState({icon:'bookOpen',title:'Your second brain starts here',hint:'Capture an idea, drop a web clip, paste meeting notes, or import a document. Everything is searchable and linkable from day one.',ctaLabel:'+ Create your first note',ctaFn:"openFA('note')"});}

  // Populate Notes rail panel
  const rail=$('notes-rail-panel');
  rail.innerHTML=`<div style="font-size:11px;font-weight:600;margin-bottom:6px">Quick Capture</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px">${[['📄','Note','#3B82F6'],['🔗','Clip','#06b6d4'],['☑','Task','#10b981'],['🎤','Voice','#ef4444']].map(([ic,lbl,ac])=>`<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;border-radius:8px;background:var(--s2);border:1px solid var(--bd2);cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease" title="${lbl==='Voice'?'Dictate a new note with your voice':lbl==='Clip'?'Clip a web page into a note — paste a link, get the title + summary':'New '+lbl.toLowerCase()}" onmouseover="this.style.transform='translateY(-1px)';this.style.borderColor='${ac}';this.style.background='var(--s3)'" onmouseout="this.style.transform='';this.style.borderColor='var(--bd2)';this.style.background='var(--s2)'" onclick="${lbl==='Voice'?'startVoiceNote()':lbl==='Clip'?'startWebClip()':`openFA('${lbl==='Task'?'task':'note'}')`}"><span style="font-size:16px;line-height:1;color:${ac}">${ic}</span><span style="font-size:11px;font-weight:600;color:var(--t2)">${lbl}</span></div>`).join('')}</div>
  ${(()=>{const evs=_calEventsOn(new Date());if(!evs.length)return '';return `<div style="font-size:11px;font-weight:600;margin-bottom:4px">📅 Today's Meetings</div><div style="margin-bottom:10px">${evs.slice(0,6).map(e=>{const linked=_noteForEvent(e.id);return `<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 6px;border-radius:5px" title="${linked?'Open the meeting note':'Create a meeting note for this event'}" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'" onclick="openMeetingNote('${_jsAttr(String(e.id))}','${_jsAttr(e.dateStr||_ymd())}')"><span class="rt" style="font-size:11px">${typeof e.hour==='number'?e.hour+':00 · ':''}${esc(e.title)}</span><span style="flex-shrink:0;color:${linked?'var(--ok)':'var(--ac)'}">${linked?'📝':'＋'}</span></div>`;}).join('')}</div>`;})()}
  <div style="font-size:11px;font-weight:600;margin-bottom:4px">⭐ Starred</div>
  ${D.notes.filter(n=>n.starred).slice(0,4).map(n=>`<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 6px;border-radius:5px" onclick="showNoteInEditor(${_tidLit(n.id)})" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'"><span class="rt" style="font-size:11px">${esc(n.title)}</span><span style="color:var(--warn);flex-shrink:0">★</span></div>`).join('')||'<div style="font-size:11px;color:var(--t3);margin-bottom:8px">No starred notes</div>'}
  <div style="font-size:11px;font-weight:600;margin:10px 0 4px">🕸 Link Graph</div>
  <div id="notes-graph-container" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:8px;margin-bottom:8px"><div style="font-size:11px;color:var(--t3);text-align:center;padding:8px">Select a note</div></div>
  <div id="notes-backlinks-panel"></div>`;
  if(_openNote)showNoteInEditor(_openNote.id,{quiet:true});
  _notesAddTrashMenuItem();
  // Apply persisted column widths + (re-)attach the resize handles. Each
  // panel's innerHTML wipe above destroys the previous handle children.
  if(typeof _notesApplyWidths==='function')_notesApplyWidths();
  if(typeof _notesEnsureResizeHandles==='function')_notesEnsureResizeHandles();
  // Apply persisted mobile pane (no-op on desktop where the strip is hidden).
  if(typeof _applyNotesMobilePane==='function')_applyNotesMobilePane();
}
// ── Live note editor (build -242) ──────────────────────────────────────────
// The open note is always editable and saves itself: no Edit / Save / Cancel,
// so switching notes or closing the tab can't lose typing (the old inline
// editor threw edits away without asking). _noteInlineEditId is the open
// note (the wiki-link autocomplete, Ctrl+S and #tags key off it). The open
// note is remembered per device (lu_notes_open), so Notes reopens where you
// were instead of on the first note.
let _noteInlineEditId=null;
let _notesOpenId=(()=>{try{return localStorage.getItem('lu_notes_open')||null;}catch(_){return null;}})();
function _notesRememberOpen(id){
  _notesOpenId=id==null?null:String(id);
  try{if(id==null)localStorage.removeItem('lu_notes_open');else localStorage.setItem('lu_notes_open',String(id));}catch(_){}
}
function _notesOpenNote(){
  const list=D.notes||[];
  return (_notesOpenId!=null&&list.find(n=>String(n.id)===_notesOpenId))||list[0]||null;
}
// What the editor showed when it opened (or last saved): a note is only
// written when this changes, so opening a markdown note doesn't rewrite it.
let _noteEditorBase=null; // {id, title, html}
const _noteScrollMem={};  // note id → editor pane scroll position (this session)
let _noteAutosaveTimer=null;
function _noteSaveStatus(state){
  const el=document.getElementById('note-save-status');if(!el)return;
  el.dataset.state=state;
  el.textContent=state==='dirty'?'Editing…':state==='error'?'Not saved':'Saved ✓';
}
function _noteEdited(){
  _noteSaveStatus('dirty');
  clearTimeout(_noteAutosaveTimer);
  _noteAutosaveTimer=setTimeout(_noteAutosaveNow,900);
}
// Write the open editor into its note. Safe to call any time; returns true
// when something was saved.
function _noteAutosaveNow(){
  clearTimeout(_noteAutosaveTimer);_noteAutosaveTimer=null;
  const base=_noteEditorBase;if(!base)return false;
  const b=document.getElementById('nie-body'),t=document.getElementById('nie-title');
  if(!b||b.dataset.nid!==String(base.id))return false; // the editor shows another note now
  const n=(D.notes||[]).find(x=>String(x.id)===String(base.id));
  if(!n){_noteEditorBase=null;return false;}
  let changed=false;
  const title=t?t.value.trim():'';
  if(t&&title&&title!==base.title){n.title=title;base.title=title;changed=true;}
  const html=b.innerHTML;
  if(html!==base.html){_noteSetHtml(n,html);base.html=html;changed=true;}
  if(!changed){_noteSaveStatus('saved');return false;}
  try{save('notes');_noteSaveStatus('saved');}
  catch(e){console.warn('[notes] autosave failed',e);_noteSaveStatus('error');return false;}
  _noteListTouched(n);
  return true;
}
// Keep the list card in step without re-rendering the whole list on every
// pause: title now, full list a little later.
let _noteListTimer=null;
function _noteListTouched(n){
  const card=document.querySelector(`.nc[data-nid="${CSS.escape(String(n.id))}"] .nc-t`);
  if(card){const pin=card.querySelector('.nc-pin');card.textContent=(n.icon?n.icon+' ':'')+(n.title||'Untitled');if(pin)card.prepend(pin);}
  clearTimeout(_noteListTimer);
  _noteListTimer=setTimeout(()=>{
    if(typeof curScreen!=='undefined'&&curScreen!=='notes')return;
    const list=document.getElementById('notes-list-inner');const top=list?list.scrollTop:0;
    if(typeof applyNotesFilters==='function')applyNotesFilters();
    if(list)list.scrollTop=top;
  },4000);
}
// Re-render the open note after a property change (status, colour, pin…),
// keeping the pane's scroll position. Other notes are left alone.
function _noteRefreshOpen(id){
  if(id==null||String(id)!==String(_noteInlineEditId))return;
  _noteAutosaveNow();
  const pane=document.getElementById('notes-editor-panel');const top=pane?pane.scrollTop:0;
  showNoteInEditor(id,{quiet:true});
  if(pane)pane.scrollTop=top;
}
// Old entry points: Ctrl+S, double-click, "Apply template" → now just save /
// focus the always-open editor.
function saveNoteInlineEdit(id){
  const saved=_noteAutosaveNow();
  toast(saved?'✓ Saved':'✓ Already saved');
}
function toggleNoteInlineEdit(id){
  if(String(_noteInlineEditId)!==String(id))showNoteInEditor(id);
  setTimeout(()=>{const b=document.getElementById('nie-body');if(b){b.focus();try{const r=document.createRange();r.selectNodeContents(b);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);}catch(_){}}},50);
}
function _noteScrollToHeading(i){
  const h=document.querySelectorAll('#nie-body h1,#nie-body h2,#nie-body h3')[i];
  if(h)h.scrollIntoView({behavior:'smooth',block:'start'});
}
// Outline of the open note (3+ headings), linking into the editor.
function _noteOutlineHtml(n){
  const heads=luParseInert(_noteHtml(n)).querySelectorAll('h1,h2,h3');
  if(heads.length<3)return '';
  const items=[...heads].map((h,i)=>`<a class="lvl-${h.tagName.slice(1)}" href="#" ${_act('_noteScrollToHeading',[i])}>${esc(h.textContent.trim()||'(untitled section)')}</a>`).join('');
  return `<div class="note-toc"><div class="note-toc-h">📑 Outline · ${heads.length} sections</div>${items}</div>`;
}
// Save, and if the title changed since the note was opened, update the links
// other notes have to it.
function _noteTitleCommit(){
  const base=_noteEditorBase;
  _noteAutosaveNow();
  if(!base)return;
  const n=(D.notes||[]).find(x=>String(x.id)===String(base.id));
  if(n&&base.titleAtOpen&&n.title&&n.title!==base.titleAtOpen){
    try{_noteRenameLinks(n,base.titleAtOpen);}catch(e){console.warn('[notes] link rename failed',e);}
    base.titleAtOpen=n.title;
  }
}
// Ctrl/Cmd+click a link in the editor opens it (a plain click places the caret).
function _noteEditorClick(e){
  const a=e.target&&e.target.closest&&e.target.closest('a[href]');
  if(!a||!(e.ctrlKey||e.metaKey))return;
  e.preventDefault();
  if(typeof _luOpenUrl==='function')_luOpenUrl(a.getAttribute('href'));
}
// ── Delete with Undo, and the Trash ──
// A deleted note stays in the server's Trash for 30 days (-241).
function deleteNoteWithUndo(id){
  const i=(D.notes||[]).findIndex(x=>String(x.id)===String(id));if(i<0)return;
  if(String(_noteInlineEditId)===String(id))_noteAutosaveNow();
  const n=D.notes[i];
  D.notes.splice(i,1);
  if(String(_notesOpenId)===String(id)){const next=D.notes[Math.min(i,D.notes.length-1)];_notesRememberOpen(next?next.id:null);}
  _noteInlineEditId=null;_noteEditorBase=null;
  save('notes');
  if(typeof curScreen!=='undefined'&&curScreen==='notes')renderNotes();
  toast({type:'info',title:'Note deleted',msg:'“'+(n.title||'Untitled')+'” — it stays in the Trash for 30 days.',duration:8000,
    actions:[{label:'Undo',primary:true,onClick:()=>_noteUndoDelete([{n,i}])}]});
}
function _noteUndoDelete(list){
  let back=0;
  list.slice().sort((a,b)=>a.i-b.i).forEach(({n,i})=>{
    if((D.notes||[]).some(x=>String(x.id)===String(n.id)))return;
    D.notes.splice(Math.min(i,D.notes.length),0,n);back++;
  });
  if(!back)return;
  save('notes');
  if(list.length===1)_notesRememberOpen(list[0].n.id);
  if(typeof curScreen!=='undefined'&&curScreen==='notes')renderNotes();
  toast('↩ Restored '+(back===1?'the note':back+' notes'));
}
// The header's ⋯ More menu lives in index.html; add "Trash" to it from here.
function _notesAddTrashMenuItem(){
  const m=document.getElementById('notes-more-menu');
  if(!m||m.querySelector('[data-act="openNotesTrash"]'))return;
  const first=m.querySelector('button');
  const b=document.createElement('button');
  b.className='btn btn-s';
  if(first)b.setAttribute('style',first.getAttribute('style')||'');
  b.dataset.act='openNotesTrash';b.dataset.a='[]';
  b.textContent='🗑 Trash';
  b.addEventListener('mousedown',()=>closePopMenu('notes-more-menu'));
  m.appendChild(b);
}
async function openNotesTrash(){
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🗑 Trash</h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Notes deleted in the last 30 days. Restoring brings back the note with its tags, folder and links.</div>
  <div id="nt-list" style="max-height:380px;overflow-y:auto"><div style="font-size:12px;color:var(--t3);padding:10px">Loading…</div></div>
  <button class="btn btn-s" onclick="closeModal()" style="margin-top:8px;font-size:11px">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
  let rows=null;try{rows=await _trpc('noteVersions.trash',undefined,'query');}catch(_){}
  const box=document.getElementById('nt-list');if(!box)return;
  if(!Array.isArray(rows)){box.innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px">The Trash isn’t available right now. It needs a connection to LevelUp.</div>';return;}
  if(!rows.length){box.innerHTML='<div style="font-size:12px;color:var(--t3);padding:10px">The Trash is empty.</div>';return;}
  box.innerHTML=rows.map(r=>`<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--bd1);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:var(--s1)">
    <div style="min-width:0;flex:1"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title||'(untitled)')}</div>
    <div style="font-size:11px;color:var(--t3)">Deleted ${_noteVerWhen(r.savedAt)} · ${(r.chars||0).toLocaleString()} characters</div></div>
    <button class="btn btn-p" style="height:24px;font-size:11px"${_act('_notesTrashRestore',[r.id])}>↩ Restore</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" title="Delete forever"${_act('_notesTrashPurge',[r.id])}>✕</button>
  </div>`).join('');
}
async function _notesTrashRestore(vid){
  let v=null;try{v=await _trpc('noteVersions.get',{id:Number(vid)},'query');}catch(_){}
  let n=null;try{n=v&&v.raw?JSON.parse(v.raw):null;}catch(_){}
  if(!n||n.id==null){toast({type:'error',title:'Could not restore',msg:'That note could not be read.'});return;}
  if((D.notes||[]).some(x=>String(x.id)===String(n.id))){toast('That note is already back.');openNotesTrash();return;}
  D.notes.unshift(n);
  save('notes');
  _notesRememberOpen(n.id);
  closeModal();
  if(typeof curScreen!=='undefined'&&curScreen==='notes')renderNotes();else nav('notes');
  toast('↩ “'+(n.title||'Untitled')+'” is back');
}
async function _notesTrashPurge(vid){
  if(!confirm('Delete this note forever? It can’t be brought back.'))return;
  try{await _trpc('noteVersions.purge',{ids:[Number(vid)]},'mutation');}catch(_){toast({type:'error',title:'Could not delete',msg:'Try again when you’re online.'});return;}
  openNotesTrash();
}
// Never lose the last pause's typing to a closing tab or a sleeping phone.
if(!window._noteAutosaveWired){
  window._noteAutosaveWired=true;
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')_noteTitleCommit();});
  window.addEventListener('pagehide',()=>_noteTitleCommit());
}
(function _noteLiveCSS(){
  if(document.getElementById('lu-note-live-css'))return;
  const s=document.createElement('style');s.id='lu-note-live-css';
  s.textContent=
    '.note-live .rte-wrap{border:none;background:transparent;overflow:visible}'+
    '.note-live .rte-toolbar{position:sticky;top:0;z-index:5;border:1px solid var(--bd1);border-radius:10px;background:color-mix(in srgb,var(--s2) 94%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);margin-bottom:12px}'+
    '.note-live .rte-body.note-body{padding:2px 2px 40px;overflow:visible;font-size:15.5px;line-height:1.78}'+
    '.note-live .rte-char-count{display:none}'+
    // One text colour in the editor: when blocks differ, Chrome "keeps" the
    // colour by wrapping new lines in <font color=…> (a fixed colour that is
    // wrong in the other theme).
    '.note-live .note-body p,.note-live .note-body ul,.note-live .note-body ol,.note-live .note-body li,.note-live .note-body blockquote,.note-live .note-body div{color:var(--t1)}'+
    '.note-title-input{display:block;width:100%;border:none;outline:none;background:transparent;font:inherit;font-size:30px;font-weight:780;letter-spacing:-.5px;line-height:1.18;color:var(--t1);margin:14px 0 16px;padding:0}'+
    '.note-title-input::placeholder{color:var(--t3)}'+
    '.note-title-input:focus-visible{outline:2px solid var(--page-accent,var(--ac));outline-offset:4px;border-radius:4px}'+
    '.note-save-status{font-size:11px;color:var(--t3);white-space:nowrap;min-width:56px;text-align:right}'+
    '.note-save-status[data-state=dirty]{color:var(--warn)}'+
    '.note-save-status[data-state=error]{color:var(--red)}'+
    '@media (max-width:560px){.note-title-input{font-size:24px}}';
  document.head.appendChild(s);
})();
// Note version timeline sparkline (#16). Renders a tiny SVG strip showing each
// saved version as a clickable dot positioned by timestamp. Hover for the
// timestamp; click to jump straight into the diff viewer for that version.
// Notes view mode toggle (#C). Persists to D.prefs.notesViewMode and applies
// body class so the existing card markup re-flows into a grid.
function setNotesViewMode(mode){
  if(!['list','grid'].includes(mode))mode='list';
  D.prefs=D.prefs||{};
  D.prefs.notesViewMode=mode;
  save('prefs');
  document.body.classList.toggle('notes-grid-view',mode==='grid');
  // Re-render to refresh the toolbar segment highlight.
  if(typeof renderNotes==='function')renderNotes();
}
// Apply persisted view mode on initial load.
try{if((D.prefs&&D.prefs.notesViewMode)==='grid')document.body.classList.add('notes-grid-view');}catch(_){}
// Notes distraction-free focus mode (#F). Toggles body class that hides nav +
// list + rail and centers the editor. Esc exits.
function toggleNoteFocusMode(force){
  const want=force!==undefined?!!force:!document.body.classList.contains('notes-focus-mode');
  document.body.classList.toggle('notes-focus-mode',want);
  let exit=document.getElementById('notes-focus-exit');
  if(want&&!exit){
    exit=document.createElement('button');
    exit.id='notes-focus-exit';
    exit.innerHTML='⛶ Exit focus (Esc)';
    exit.onclick=()=>toggleNoteFocusMode(false);
    document.body.appendChild(exit);
  }else if(!want&&exit){exit.remove();}
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.body.classList.contains('notes-focus-mode')){toggleNoteFocusMode(false);}
});
// Notes outline / TOC (#D). Parses bodyHtml for h1/h2/h3 and returns a small
// nav block with anchor IDs injected. The injected IDs are scoped to the
// current note via a setTimeout that runs after the body is in the DOM.
function _renderNoteOutline(n,bodyHtml){
  if(!bodyHtml)return {toc:'',htmlWithIds:bodyHtml};
  const tmp=luParseInert(bodyHtml);
  const heads=tmp.querySelectorAll('h1,h2,h3');
  if(heads.length<3)return {toc:'',htmlWithIds:bodyHtml};
  const items=[];
  heads.forEach((h,i)=>{
    const id=`note-h-${n.id}-${i}`;
    h.id=id;
    const lvl=Number(h.tagName.slice(1));
    items.push({id,text:h.textContent.trim(),lvl});
  });
  const tocLinks=items.map(it=>`<a class="lvl-${it.lvl}" onclick="document.getElementById('${_jsAttr(it.id)}')?.scrollIntoView({behavior:'smooth',block:'start'})">${esc(it.text||'(untitled section)')}</a>`).join('');
  return {
    toc:`<div class="note-toc"><div class="note-toc-h">📑 Outline · ${items.length} sections</div>${tocLinks}</div>`,
    htmlWithIds:luSanitizeHtml(tmp.innerHTML),
  };
}
// Notes keyboard navigation (#E). j/k to move selection, Enter to open in
// the editor, e to toggle star, p to toggle pin. Active only on the Notes
// screen and skipped when typing in inputs / textareas / contenteditable.
let _notesKbSelectedId=null;
function _notesKbHandler(e){
  if(typeof curScreen==='undefined'||curScreen!=='notes')return;
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const visible=Array.from(document.querySelectorAll('#notes-list-inner .nc[data-nid]'));
  if(!visible.length)return;
  let idx=visible.findIndex(el=>Number(el.dataset.nid)===_notesKbSelectedId);
  if(idx<0)idx=visible.findIndex(el=>el.classList.contains('on'));
  const sel=()=>{
    const el=visible[idx];if(!el)return;
    visible.forEach(v=>v.classList.remove('nc-kb-on'));
    el.classList.add('nc-kb-on');
    _notesKbSelectedId=Number(el.dataset.nid);
    el.scrollIntoView({block:'nearest'});
  };
  if(e.key==='j'||e.key==='ArrowDown'){idx=Math.min(visible.length-1,(idx<0?0:idx+1));sel();e.preventDefault();}
  else if(e.key==='k'||e.key==='ArrowUp'){idx=Math.max(0,(idx<0?0:idx-1));sel();e.preventDefault();}
  else if(e.key==='Enter'&&_notesKbSelectedId){showNoteInEditor(_notesKbSelectedId);e.preventDefault();}
  else if(e.key==='e'&&_notesKbSelectedId){const n=D.notes.find(x=>x.id===_notesKbSelectedId);if(n){n.starred=!n.starred;save('notes');applyNotesFilters();showNoteInEditor(_notesKbSelectedId);toast(n.starred?'⭐ Starred':'Unstarred');}e.preventDefault();}
  else if(e.key==='p'&&_notesKbSelectedId){if(typeof toggleNotePinned==='function'){toggleNotePinned(_notesKbSelectedId);}e.preventDefault();}
}
document.addEventListener('keydown',_notesKbHandler);
// ====== NOTE HISTORY (build -241) ======
// Earlier versions live on the server (note_versions): the sync keeps the
// note as it was before each editing session, a teammate's edit, a restore,
// a OneNote sync or a conflict with another device. Notes no longer carry
// copies of themselves; any left in n.versions (from before -241, or filed
// while offline) are moved up by _noteDrainVersions.
const _NOTE_VERSION_KIND={edit:'Before editing',shared:'Before a teammate’s edit',conflict:'Your copy from another device',restore:'Before a restore',sync:'Before a OneNote sync',legacy:'Earlier version'};
function _noteVerWhen(t){
  const d=new Date(t);if(isNaN(d.getTime()))return '';
  return d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
}
function _noteVerKind(v){return v.label||_NOTE_VERSION_KIND[v.kind]||'Earlier version';}
async function openNoteHistory(id){
  const n=D.notes.find(x=>x.id==id);
  if(!n)return;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🕐 History: ${esc(n.title||'Untitled')}</h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Kept on the server, the same on every device: the note as it was before each editing session, and before anything replaced its text.</div>
  <div id="nh-list" style="max-height:380px;overflow-y:auto"><div style="font-size:12px;color:var(--t3);padding:10px">Loading…</div></div>
  <button class="btn btn-s" onclick="closeModal()" style="margin-top:8px;font-size:11px">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
  let rows=null,err='';
  try{rows=await _trpc('noteVersions.list',{noteId:String(n.id)},'query');}catch(e){err=String(e&&e.message||e);}
  const box=document.getElementById('nh-list');if(!box)return;
  if(!Array.isArray(rows)){
    box.innerHTML=`<div style="font-size:12px;color:var(--t3);padding:10px">History isn’t available right now${err?` (${esc(err.slice(0,120))})`:''}. It needs a connection to LevelUp.</div>`;
    return;
  }
  const pending=(n.versions||[]).length;
  box.innerHTML=(pending?`<div style="font-size:11px;color:var(--t3);margin-bottom:8px">${pending} older cop${pending===1?'y is':'ies are'} still being moved to the server.</div>`:'')+
    (rows.length?rows.map(v=>`<div role="button" tabindex="0" style="border:1px solid var(--bd1);border-radius:6px;padding:8px 10px;margin-bottom:6px;cursor:pointer;background:var(--s1)"${_act('previewNoteVersion',[n.id,v.id])}>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:600;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.title||'(untitled)')}</span>
        <span style="font-size:11px;color:var(--t3);white-space:nowrap">${_noteVerWhen(v.savedAt)}</span>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-top:3px">${esc(_noteVerKind(v))} · ${(v.chars||0).toLocaleString()} characters</div>
    </div>`).join(''):`<div style="font-size:12px;color:var(--t3);padding:10px">No earlier versions yet. One is kept the next time this note is edited.</div>`);
}
// Line diff (longest common subsequence) between two texts. Falls back to a
// set comparison when the texts are too long for the table.
function _noteLineDiff(a,b){
  const A=String(a||'').split('\n'),B=String(b||'').split('\n');
  if(A.length*B.length>2500000){
    const sb=new Set(B),sa=new Set(A);
    return A.map(l=>({t:sb.has(l)?'=':'-',l})).concat(B.filter(l=>!sa.has(l)).map(l=>({t:'+',l})));
  }
  const n=A.length,m=B.length,L=[];
  for(let i=0;i<=n;i++)L.push(new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<n&&j<m){
    if(A[i]===B[j]){out.push({t:'=',l:A[i]});i++;j++;}
    else if(L[i+1][j]>=L[i][j+1])out.push({t:'-',l:A[i++]});
    else out.push({t:'+',l:B[j++]});
  }
  while(i<n)out.push({t:'-',l:A[i++]});
  while(j<m)out.push({t:'+',l:B[j++]});
  return out;
}
let _noteVerOpen=null; // the version shown in the preview
function _noteVerTab(which){
  ['diff','was'].forEach(k=>{
    const pane=document.getElementById('nv-'+k),tab=document.getElementById('nv-tab-'+k);
    if(pane)pane.style.display=k===which?'':'none';
    if(tab){tab.setAttribute('aria-selected',k===which?'true':'false');tab.classList.toggle('btn-p',k===which);tab.classList.toggle('btn-s',k!==which);}
  });
}
async function previewNoteVersion(noteId,versionId){
  const n=D.notes.find(x=>x.id==noteId);if(!n)return;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<div style="font-size:12px;color:var(--t3);padding:14px">Loading…</div>`;
  let v=null;try{v=await _trpc('noteVersions.get',{id:Number(versionId)},'query');}catch(_){}
  if(!v){m.innerHTML=`<div style="font-size:12px;color:var(--t3);padding:14px">That version couldn’t be loaded.</div><button class="btn btn-s"${_act('openNoteHistory',[noteId])}>← Back</button>`;return;}
  _noteVerOpen=v;
  const vText=(v.bodyHtml&&String(v.bodyHtml).trim())?luRTE_htmlToMd(v.bodyHtml):(v.body||'');
  const diff=_noteLineDiff(vText,n.body||'');
  const changed=diff.some(d=>d.t!=='=')||(v.title||'')!==(n.title||'');
  const row=(bg,fg,mark,l)=>`<div style="${bg?`background:color-mix(in srgb,${bg} 13%,transparent);`:''}color:${fg};font-size:11px;padding:1px 4px;font-family:monospace;white-space:pre-wrap">${mark} ${esc(l)||'&nbsp;'}</div>`;
  const diffHtml=diff.map(d=>d.t==='='?row('','var(--t2)','&nbsp;',d.l):d.t==='-'?row('var(--red)','var(--red)','−',d.l):row('var(--ok)','var(--ok)','+',d.l)).join('');
  const asWas=luSanitizeHtml((v.bodyHtml&&String(v.bodyHtml).trim())?v.bodyHtml:_noteMdToHtml(v.body||''));
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:4px">🕐 ${esc(v.title||'(untitled)')}</h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${esc(_noteVerKind(v))} · ${_noteVerWhen(v.savedAt)}${(v.title||'')!==(n.title||'')?` · the title is now “${esc(n.title||'')}”`:''}</div>
  <div role="tablist" style="display:flex;gap:6px;margin-bottom:8px">
    <button class="btn btn-p" id="nv-tab-diff" role="tab" aria-selected="true" style="height:24px;font-size:11px"${_act('_noteVerTab',['diff'])}>Changes since</button>
    <button class="btn btn-s" id="nv-tab-was" role="tab" aria-selected="false" style="height:24px;font-size:11px"${_act('_noteVerTab',['was'])}>As it was</button>
  </div>
  <div id="nv-diff" style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:8px;max-height:300px;overflow-y:auto;margin-bottom:12px">${changed?diffHtml:'<div style="font-size:11px;color:var(--t3)">Same as the note now.</div>'}<div style="font-size:11px;color:var(--t3);margin-top:6px">− only in this version · + only in the note now</div></div>
  <div id="nv-was" class="note-body" style="display:none;background:var(--s1);border:1px solid var(--bd1);border-radius:6px;padding:10px 12px;max-height:300px;overflow-y:auto;margin-bottom:12px">${asWas||'<em style="color:var(--t3)">Empty</em>'}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn btn-p" style="font-size:11px"${_act('restoreNoteVersion',[noteId])}${changed?'':' disabled'}>↩ Restore this version</button>
    <button class="btn btn-s" style="font-size:11px"${_act('openNoteHistory',[noteId])}>← Back to list</button>
    <button class="btn btn-s" style="font-size:11px" onclick="closeModal()">Close</button>
  </div>`;
}
async function restoreNoteVersion(noteId){
  const n=D.notes.find(x=>x.id==noteId);const v=_noteVerOpen;
  if(!n||!v||String(v.noteId)!==String(n.id))return;
  if(!confirm(`Restore the version from ${_noteVerWhen(v.savedAt)}? The note as it is now is kept in its history.`))return;
  const cur={title:n.title||'',body:n.body||'',bodyHtml:n.bodyHtml||''};
  try{await _trpc('noteVersions.add',{noteId:String(n.id),kind:'restore',title:cur.title,bodyHtml:cur.bodyHtml,body:cur.body},'mutation');}
  catch(_){ // offline: file it on the note; it moves to the server later
    n.versions=n.versions||[];n.versions.push(Object.assign(cur,{savedAt:new Date().toISOString(),from:'Before a restore'}));
  }
  n.title=v.title||n.title;
  if(v.bodyHtml&&String(v.bodyHtml).trim())_noteSetHtml(n,v.bodyHtml);else _noteSetMd(n,v.body||'');
  save('notes');
  closeModal();
  renderNotesList();
  showNoteInEditor(n.id);
  toast('✓ Version restored');
}
// Move copies still filed on notes (n.versions) to the server, then drop
// them from the notes. Runs after load and after a notes push; one run at a
// time; a failure leaves them in place for the next run.
let _noteDraining=false;
async function _noteDrainVersions(){
  if(_noteDraining||window._luItemSyncOff||(typeof _serverSyncReady!=='undefined'&&!_serverSyncReady))return;
  const withV=(D.notes||[]).filter(n=>n&&Array.isArray(n.versions)&&n.versions.length);
  if(!withV.length)return;
  _noteDraining=true;
  let moved=0;
  try{
    let batch=[],size=0;
    const flush=async()=>{
      if(!batch.length)return;
      const res=await _trpc('noteVersions.importLegacy',{items:batch.map(b=>({noteId:String(b.n.id),versions:b.v}))},'mutation');
      if(!res||!res.ok)throw new Error('import failed');
      // Drop only the copies sent (more may have been filed meanwhile).
      batch.forEach(b=>{if(Array.isArray(b.n.versions)){b.n.versions=b.n.versions.slice(b.count);if(!b.n.versions.length)delete b.n.versions;moved++;}});
      batch=[];size=0;
    };
    for(const n of withV){
      if(n.versions.length>60)n.versions=n.versions.slice(-60);
      const v=n.versions.map(x=>({title:String(x.title||'').slice(0,512),body:x.body||'',bodyHtml:x.bodyHtml||'',savedAt:x.savedAt||null,from:x.from?String(x.from).slice(0,255):null,conflict:!!x.conflict}));
      const s=JSON.stringify(v).length;
      if(batch.length&&(size+s>1500000||batch.length>=100))await flush();
      batch.push({n,v,count:v.length});size+=s;
    }
    await flush();
  }catch(e){console.warn('[notes] moving history to the server failed; will retry',e&&e.message);}
  finally{
    _noteDraining=false;
    if(moved)save('notes');
  }
}
// ====== [[LINKS]], #TAGS AND THE / MENU (build -243) ======
// A [[link]] is a chip in the note's HTML:
//   <span class="lu-wiki" data-nid="ID" contenteditable="false">Title</span>
// luRTE_htmlToMd turns it back into [[Title]] in the derived body, so
// backlinks, the graph, search and AI read links as before. Holding the
// note's id lets a rename update every link (_noteRenameLinks). Plain
// [[Title]] text (older notes, typed by hand, imports) becomes a chip when
// the note opens in an editor (_noteDecorateHtml) — saved only if the note
// is then edited. A link to a note that doesn't exist yet is a dashed chip;
// clicking it creates the note.
// The editors that hold a note body get the [[ / # autocomplete and the
// / menu: the Notes editor, the note drawer and New Note.
const _NOTE_RTE_IDS=new Set(['nie-body','dr-note-rte','fa-note-rte']);
function _noteByTitle(t){
  const k=String(t||'').trim().toLowerCase();
  return k?(D.notes||[]).find(n=>(n.title||'').trim().toLowerCase()===k)||null:null;
}
function _noteWikiChip(doc,title,note){
  const s=doc.createElement('span');
  s.className='lu-wiki'+(note?'':' missing');
  s.setAttribute('contenteditable','false');
  if(note)s.dataset.nid=String(note.id);
  s.textContent=note?(note.title||title):title;
  return s;
}
// Chips for every [[Title]] in a DOM tree, and existing chips brought up to
// date (renamed note, note created or deleted since). Returns the count.
function _noteDecorateLinks(root){
  if(!root)return 0;
  const doc=root.ownerDocument||document;
  let count=0;
  root.querySelectorAll('span.lu-wiki').forEach(s=>{
    s.setAttribute('contenteditable','false');
    let note=s.dataset.nid?(D.notes||[]).find(x=>String(x.id)===s.dataset.nid):null;
    if(!note){note=_noteByTitle(s.textContent);if(note)s.dataset.nid=String(note.id);else delete s.dataset.nid;}
    if(note&&note.title&&s.textContent!==note.title)s.textContent=note.title;
    s.classList.toggle('missing',!note);
  });
  const w=doc.createTreeWalker(root,4);const nodes=[];
  while(w.nextNode())nodes.push(w.currentNode);
  nodes.forEach(node=>{
    const t=node.textContent;
    if(t.indexOf('[[')<0||!node.parentNode)return;
    if(node.parentNode.closest&&node.parentNode.closest('code,pre,a,.lu-wiki'))return;
    const re=/\[\[([^\]\n]{1,200})\]\]/g;let m,last=0,hit=false;
    const frag=doc.createDocumentFragment();
    while((m=re.exec(t))){
      const title=m[1].trim();if(!title)continue;
      hit=true;count++;
      frag.appendChild(doc.createTextNode(t.slice(last,m.index)));
      frag.appendChild(_noteWikiChip(doc,title,_noteByTitle(title)));
      last=m.index+m[0].length;
    }
    if(!hit)return;
    frag.appendChild(doc.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(frag,node);
  });
  return count;
}
function _noteDecorateHtml(html){
  const s=String(html||'');
  if(s.indexOf('[[')<0&&s.indexOf('lu-wiki')<0)return s;
  const root=luParseInert(s);
  _noteDecorateLinks(root);
  return root.innerHTML;
}
function _noteCreateStub(title){
  const now=new Date().toISOString();
  const n={id:nextId(D.notes),title:String(title).trim().slice(0,300),tags:[],source:'Link',createdAt:now,updated:now,updatedAt:now,starred:false,createdBy:(D.creds&&D.creds.userName)||''};
  _noteSetHtml(n,'',{keepTime:true});
  D.notes.unshift(n);
  save('notes');
  return n;
}
// Open the note a chip points at; a missing one is created first.
function _noteOpenWiki(chip){
  let n=chip.dataset.nid?(D.notes||[]).find(x=>String(x.id)===chip.dataset.nid):null;
  if(!n)n=_noteByTitle(chip.textContent);
  if(!n){
    if(!confirm('Create a note called “'+chip.textContent+'”?'))return;
    n=_noteCreateStub(chip.textContent);
    chip.dataset.nid=String(n.id);chip.classList.remove('missing');
    const host=chip.closest('[contenteditable="true"]');
    if(host&&host.id==='nie-body')_noteEdited();
  }
  if(typeof closeDrawer==='function'&&chip.closest('#drawer-ov'))closeDrawer();
  if(typeof curScreen!=='undefined'&&curScreen!=='notes'){nav('notes');setTimeout(()=>showNoteInEditor(n.id),120);}
  else showNoteInEditor(n.id);
}
// One click handler for chips everywhere (editor, drawer, shared viewer,
// history preview) and for checklist boxes inside editors.
if(!window._noteChipWired){
  window._noteChipWired=true;
  // A click anywhere outside the popup closes it.
  document.addEventListener('mousedown',e=>{if(_notePop&&!(e.target&&e.target.closest&&e.target.closest('#wiki-autocomplete')))_wikiAcHide();});
  document.addEventListener('click',e=>{
    const t=e.target;if(!t||!t.closest)return;
    const chip=t.closest('.lu-wiki');
    if(chip&&!(e.ctrlKey||e.metaKey||e.shiftKey)){e.preventDefault();e.stopPropagation();_noteOpenWiki(chip);return;}
    const li=t.closest('ul.lu-check>li');
    if(li&&li.closest('[contenteditable="true"]')){
      const r=li.getBoundingClientRect();
      if(e.clientX-r.left<24){
        e.preventDefault();
        li.dataset.checked=li.dataset.checked==='true'?'false':'true';
        const host=li.closest('[contenteditable="true"]');
        if(host&&host.id==='nie-body')_noteEdited();
      }
    }
  });
}
// A note was renamed: links to it (chips by id, and any [[Old title]] text)
// follow. Other notes keep their update time. Returns how many changed.
function _noteRenameLinks(note,oldTitle){
  const nt=(note&&note.title||'').trim(),ot=String(oldTitle||'').trim();
  if(!note||!nt||!ot||nt===ot)return 0;
  const idAttr='data-nid="'+String(note.id)+'"',tok=('[['+ot+']]').toLowerCase();
  let changed=0;
  (D.notes||[]).forEach(o=>{
    if(o===note)return;
    const h=_noteHtml(o);
    if(h.indexOf(idAttr)<0&&h.toLowerCase().indexOf(tok)<0)return;
    const root=luParseInert(h);let hit=false;
    root.querySelectorAll('span.lu-wiki').forEach(s=>{if(s.dataset.nid===String(note.id)&&s.textContent!==nt){s.textContent=nt;hit=true;}});
    const w=root.ownerDocument.createTreeWalker(root,4);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
    const re=new RegExp('\\[\\['+ot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\]\\]','gi');
    nodes.forEach(n=>{if(re.test(n.textContent)){re.lastIndex=0;n.textContent=n.textContent.replace(re,'[['+nt+']]');hit=true;}re.lastIndex=0;});
    if(hit){_noteSetHtml(o,root.innerHTML,{keepTime:true});changed++;}
  });
  if(changed){save('notes');toast({type:'info',title:'Links updated',msg:'“'+nt+'” is now the link text in '+changed+' other note'+(changed===1?'':'s')+'.',duration:4000});}
  return changed;
}
// ── The popup shared by [[ links, #tags and the / menu ──
let _notePop=null; // {mode:'note'|'tag'|'slash', id, node, triggerStart, caretOff, items:[], idx}
function _notePopEl(){
  let el=document.getElementById('wiki-autocomplete');
  if(!el){
    el=document.createElement('div');el.id='wiki-autocomplete';el.setAttribute('role','listbox');
    el.style.cssText='display:none;position:fixed;z-index:4000;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.22);min-width:240px;max-width:320px;max-height:300px;overflow-y:auto';
    document.body.appendChild(el);
  }
  return el;
}
function _wikiAcHide(){const el=document.getElementById('wiki-autocomplete');if(el)el.style.display='none';_notePop=null;}
function _notePopShow(state,head){
  const el=_notePopEl();
  _notePop=state;state.idx=0;
  el.innerHTML=`<div class="wac-h">${head}</div>`+state.items.map((it,i)=>`<div class="wac-i ${i===0?'on':''}" role="option" data-idx="${i}" onmousedown="event.preventDefault();_notePopPick(${i})">${it.label}</div>`).join('');
  const sel=window.getSelection();
  const r=sel.getRangeAt(0).cloneRange();r.collapse(true);
  let rect=r.getClientRects()[0];
  if(!rect){const sp=document.createElement('span');sp.textContent='​';r.insertNode(sp);rect=sp.getBoundingClientRect();sp.remove();}
  el.style.display='block';
  const h=el.offsetHeight||200;
  el.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-330))+'px';
  el.style.top=(rect.bottom+4+h>window.innerHeight?Math.max(8,rect.top-h-4):rect.bottom+4)+'px';
}
// The / menu.
const _NOTE_SLASH=[
  {k:'text',icon:'¶',label:'Text',kw:'paragraph plain p',run:id=>luRTE_heading('p',id)},
  {k:'h1',icon:'H1',label:'Heading 1',kw:'title big',run:id=>luRTE_heading('h1',id)},
  {k:'h2',icon:'H2',label:'Heading 2',kw:'subtitle',run:id=>luRTE_heading('h2',id)},
  {k:'h3',icon:'H3',label:'Heading 3',kw:'small heading',run:id=>luRTE_heading('h3',id)},
  {k:'bullet',icon:'•',label:'Bulleted list',kw:'ul unordered dots',run:id=>luRTE_cmd('insertUnorderedList',id)},
  {k:'number',icon:'1.',label:'Numbered list',kw:'ol ordered',run:id=>luRTE_cmd('insertOrderedList',id)},
  {k:'check',icon:'☑',label:'Checklist',kw:'todo checkbox tick',run:id=>_noteInsertChecklist(id)},
  {k:'quote',icon:'❝',label:'Quote',kw:'blockquote',run:id=>luRTE_heading('blockquote',id)},
  {k:'code',icon:'‹›',label:'Code block',kw:'pre monospace',run:id=>luRTE_heading('pre',id)},
  {k:'divider',icon:'—',label:'Divider',kw:'hr line rule separator',run:id=>luRTE_cmd('insertHorizontalRule',id)},
  {k:'table',icon:'▦',label:'Table',kw:'grid columns rows',run:id=>_noteInsertTable(id)},
  {k:'link',icon:'⛓',label:'Link to a note',kw:'wiki [[ note',run:id=>{document.execCommand('insertText',false,'[[');_noteRteInput(id);}},
  {k:'image',icon:'🖼',label:'Image',kw:'picture photo upload',run:id=>luRTE_insertImage(id)},
  {k:'date',icon:'📅',label:'Today’s date',kw:'now day today',run:id=>document.execCommand('insertText',false,new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}))},
  {k:'task',icon:'✓',label:'Make this line a task',kw:'todo action item',only:'nie-body',run:id=>_noteLineToTask(id)},
];
// Called on every input in a note editor: opens, filters or closes the popup.
function _noteRteInput(id){
  if(!_NOTE_RTE_IDS.has(id))return;
  const el=document.getElementById(id);if(!el)return;
  const sel=window.getSelection&&window.getSelection();
  if(!sel||!sel.rangeCount||!sel.isCollapsed){_wikiAcHide();return;}
  const node=sel.anchorNode;
  if(!node||node.nodeType!==3||!el.contains(node)){_wikiAcHide();return;}
  if(node.parentNode&&node.parentNode.closest&&node.parentNode.closest('code,pre')){_wikiAcHide();return;}
  const off=sel.anchorOffset;
  const before=node.textContent.slice(0,off);
  let m=before.match(/\[\[([^\]\n]{0,80})$/);
  if(m){
    const q=m[1].toLowerCase().trim(),openId=id==='nie-body'?_noteInlineEditId:null;
    const items=(D.notes||[]).filter(n=>String(n.id)!==String(openId)&&(n.title||'').toLowerCase().includes(q))
      .sort((a,b)=>((a.title||'').toLowerCase().startsWith(q)?0:1)-((b.title||'').toLowerCase().startsWith(q)?0:1))
      .slice(0,8).map(n=>({label:'📄 '+esc(n.title||'Untitled'),note:n}));
    if(m[1].trim()&&!_noteByTitle(m[1]))items.push({label:'＋ Create note “'+esc(m[1].trim())+'”',create:m[1].trim()});
    if(!items.length){_wikiAcHide();return;}
    _notePopShow({mode:'note',id,node,triggerStart:off-m[0].length,caretOff:off,items},'Link to a note · ↑↓ ↵');
    return;
  }
  m=before.match(/(^|[\s( ])#([\p{L}0-9_-]{0,30})$/u);
  if(m){
    const q=m[2].toLowerCase();const freq={};
    (D.notes||[]).forEach(n=>(n.tags||[]).forEach(t=>{freq[t]=(freq[t]||0)+1;}));
    const items=Object.keys(freq).filter(t=>t.toLowerCase().includes(q)).sort((a,b)=>freq[b]-freq[a]).slice(0,7).map(t=>({label:'# '+esc(t)+'  ·  '+freq[t],tag:t}));
    if(m[2]&&!items.some(i=>i.tag.toLowerCase()===q))items.push({label:'＋ New tag “#'+esc(m[2])+'”',tag:m[2]});
    if(!items.length){_wikiAcHide();return;}
    _notePopShow({mode:'tag',id,node,triggerStart:off-m[2].length-1,caretOff:off,items},'Tag · ↑↓ ↵');
    return;
  }
  m=before.match(/(^|[\s ])\/([a-z0-9’' ]{0,24})$/i);
  if(m&&!/ {2}/.test(m[2])){
    const q=m[2].toLowerCase().trim();
    const items=_NOTE_SLASH.filter(c=>(!c.only||c.only===id)&&(!q||c.label.toLowerCase().includes(q)||c.kw.includes(q)))
      .map(c=>({label:`<span style="display:inline-flex;width:24px;justify-content:center;font-weight:700;color:var(--t3)">${c.icon}</span>${esc(c.label)}`,cmd:c}));
    if(!items.length){_wikiAcHide();return;}
    _notePopShow({mode:'slash',id,node,triggerStart:off-m[2].length-1,caretOff:off,items},'Insert · ↑↓ ↵ · Esc');
    return;
  }
  _wikiAcHide();
}
// Keys while the popup is open, plus Tab between table cells and Enter in a
// checklist. Returns true when the key was handled (the editor skips it).
function _notePopKeydown(e,id){
  if(_notePop&&_notePop.id===id){
    const n=_notePop.items.length;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      _notePop.idx=(_notePop.idx+(e.key==='ArrowDown'?1:n-1))%n;
      document.querySelectorAll('#wiki-autocomplete .wac-i').forEach((el,i)=>el.classList.toggle('on',i===_notePop.idx));
      return true;
    }
    if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();_notePopPick(_notePop.idx);return true;}
    if(e.key==='Escape'){e.preventDefault();_wikiAcHide();return true;}
  }
  if(!_NOTE_RTE_IDS.has(id))return false;
  const sel=window.getSelection();
  const at=sel&&sel.anchorNode?(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentNode):null;
  if(e.key==='Tab'&&at&&at.closest&&at.closest('table.lu-table td,table.lu-table th')){
    e.preventDefault();
    const cell=at.closest('td,th');const cells=[...cell.closest('table').querySelectorAll('td,th')];
    const next=cells[cells.indexOf(cell)+(e.shiftKey?-1:1)];
    if(next){const r=document.createRange();r.selectNodeContents(next);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}
    return true;
  }
  if(e.key==='Enter'&&!e.shiftKey&&at&&at.closest&&at.closest('ul.lu-check>li')){
    // The browser copies the item it splits, ticked or not: start unticked.
    setTimeout(()=>{const s=window.getSelection();const a=s&&s.anchorNode;const li=a&&(a.nodeType===1?a:a.parentNode).closest&&(a.nodeType===1?a:a.parentNode).closest('ul.lu-check>li');if(li)li.dataset.checked='false';},0);
  }
  return false;
}
function _notePopPick(i){
  const p=_notePop;if(!p||!p.items[i])return;
  const it=p.items[i];const node=p.node;
  const el=document.getElementById(p.id);
  _wikiAcHide();
  if(!el||!node||!node.parentNode)return;
  const txt=node.textContent;
  // Take out what was typed to trigger the popup ("[[que", "#ta", "/hea").
  node.textContent=txt.slice(0,p.triggerStart)+txt.slice(p.caretOff);
  const sel=window.getSelection();const r=document.createRange();
  const parent=node.parentNode;
  if(!node.textContent&&parent&&!parent.textContent.trim()&&!parent.querySelector('br,img,.lu-wiki')){
    // The line is empty now. An empty text node lets the browser move the
    // caret into the line before (a / command then reformats that line), so
    // leave a <br> and put the caret in front of it.
    const br=document.createElement('br');
    const at=[...parent.childNodes].indexOf(node);
    parent.replaceChild(br,node);
    r.setStart(parent,at);
  }else r.setStart(node,Math.min(p.triggerStart,node.textContent.length));
  r.collapse(true);
  el.focus();
  sel.removeAllRanges();sel.addRange(r);
  if(p.mode==='note'){
    const note=it.note||_noteCreateStub(it.create);
    const chip=_noteWikiChip(document,note.title,note);
    r.insertNode(chip);
    const sp=document.createTextNode(' ');chip.after(sp);
    const r2=document.createRange();r2.setStart(sp,1);r2.collapse(true);sel.removeAllRanges();sel.addRange(r2);
  }else if(p.mode==='tag'){
    document.execCommand('insertText',false,'#'+it.tag+' ');
    if(p.id==='nie-body'&&_noteInlineEditId!=null){
      const n=(D.notes||[]).find(x=>String(x.id)===String(_noteInlineEditId));
      if(n){n.tags=n.tags||[];if(!n.tags.some(t=>t.toLowerCase()===it.tag.toLowerCase())){n.tags.push(it.tag);save('notes');}}
    }
  }else if(p.mode==='slash'){
    try{it.cmd.run(p.id);}catch(err){console.warn('[notes] / command failed',err);}
  }
  luRTE_updateCharCount(p.id);
  if(p.id==='nie-body')_noteEdited();
  try{if(p.id.slice(0,3)==='fa-'&&typeof _faHasChanges!=='undefined')_faHasChanges=true;}catch(_){}
}
function _noteInsertChecklist(id){
  luRTE_cmd('insertUnorderedList',id);
  const s=window.getSelection();const a=s&&s.anchorNode;
  const ul=a&&(a.nodeType===1?a:a.parentNode).closest&&(a.nodeType===1?a:a.parentNode).closest('ul');
  if(ul){ul.classList.add('lu-check');ul.querySelectorAll(':scope>li').forEach(li=>{if(!li.dataset.checked)li.dataset.checked='false';});}
}
function _noteInsertTable(id){
  const el=document.getElementById(id);if(!el)return;
  const row='<tr><td><br></td><td><br></td><td><br></td></tr>';
  document.execCommand('insertHTML',false,'<table class="lu-table" data-new="1"><tbody>'+row+row+row+'</tbody></table><p><br></p>');
  // Put the caret in the first cell of the table just inserted.
  const tb=el.querySelector('table.lu-table[data-new]');if(!tb)return;
  tb.removeAttribute('data-new');
  const td=tb.querySelector('td');
  if(td){const s=window.getSelection();const r=document.createRange();r.selectNodeContents(td);r.collapse(true);s.removeAllRanges();s.addRange(r);}
}
// "Make this line a task": a task with the line's text, linked both ways.
function _noteLineToTask(id){
  const n=(D.notes||[]).find(x=>String(x.id)===String(_noteInlineEditId));if(!n)return;
  const s=window.getSelection();const a=s&&s.anchorNode;
  const block=a&&(a.nodeType===1?a:a.parentNode).closest&&(a.nodeType===1?a:a.parentNode).closest('li,p,div:not(.rte-body),h1,h2,h3,blockquote');
  let title=(block&&block.closest('#'+id)?block.textContent:'').replace(/ /g,' ').trim();
  if(!title)title=(prompt('Task title:')||'').trim();
  if(!title)return;
  const t={id:nextId(D.tasks),title:title.slice(0,300),assignedTo:null,due:'',status:'Not Started',priority:'Medium',notes:'From the note: '+(n.title||'Untitled'),createdBy:(D.creds&&D.creds.userName)||'',tags:[],linkedNoteIds:[n.id],subtasks:[],comments:[],createdAt:new Date().toISOString()};
  D.tasks.push(t);save('tasks');
  n.linkedTaskIds=Array.from(new Set([...(n.linkedTaskIds||[]),t.id]));
  _noteAutosaveNow();save('notes');
  toast({type:'success',title:'Task created',msg:'“'+t.title.slice(0,60)+'” — linked to this note.',duration:5000,actions:[{label:'Open task',onClick:()=>{try{openDrawer('task',t);}catch(_){}}}]});
}
// Back-compat names (older callers).
function noteWikiInput(el){if(el&&el.id)_noteRteInput(el.id);}
function noteWikiKeydown(e){return _notePop?_notePopKeydown(e,_notePop.id):false;}
function insertWikiLink(title){if(_notePop&&_notePop.mode==='note'){const i=_notePop.items.findIndex(x=>x.note&&x.note.title===title);_notePopPick(i>=0?i:0);}}
(function _noteLinkCSS(){
  if(document.getElementById('lu-note-link-css'))return;
  const s=document.createElement('style');s.id='lu-note-link-css';
  s.textContent=
    '.lu-wiki{color:var(--ac);background:color-mix(in srgb,var(--ac) 11%,transparent);border-radius:5px;padding:0 4px;cursor:pointer;white-space:nowrap;font-weight:550;text-decoration:none}'+
    '.lu-wiki:hover{background:color-mix(in srgb,var(--ac) 20%,transparent)}'+
    '.lu-wiki.missing{color:var(--t2);background:transparent;border:1px dashed var(--bd2)}'+
    'ul.lu-check{list-style:none!important;padding-left:2px!important;margin-left:0!important}'+
    'ul.lu-check>li{list-style:none!important;position:relative;padding-left:26px}'+
    'ul.lu-check>li::before{content:"";position:absolute;left:2px;top:.32em;width:15px;height:15px;box-sizing:border-box;border:1.5px solid var(--bd2);border-radius:4px;background:var(--s1)}'+
    '[contenteditable="true"] ul.lu-check>li::before{cursor:pointer}'+
    'ul.lu-check>li[data-checked="true"]::before{background:var(--ac);border-color:var(--ac)}'+
    'ul.lu-check>li[data-checked="true"]::after{content:"✓";position:absolute;left:4.5px;top:.05em;font-size:12px;font-weight:700;color:#fff;pointer-events:none}'+
    'ul.lu-check>li[data-checked="true"]{opacity:.6;text-decoration:line-through}'+
    'table.lu-table{border-collapse:collapse;margin:8px 0 14px;width:100%;font-size:.95em}'+
    'table.lu-table td,table.lu-table th{border:1px solid var(--bd2);padding:6px 8px;min-width:60px;vertical-align:top}';
  document.head.appendChild(s);
})();
// Display path for a note body, shared by the editor pane AND the
// shared-note viewer so a recipient reads exactly what the owner sees.
// Prefer rich-HTML body (from RTE saves or document imports) when present;
// fall back to markdown-style rendering of n.body for older / plain notes.
function _noteBodyDisplayHtml(n){return luSanitizeHtml(_noteDecorateHtml(_noteBodyDisplayHtmlRaw(n)));}
function _noteBodyDisplayHtmlRaw(n){
  if(n.bodyHtml&&n.bodyHtml.trim()){
    // Run through mdToHtml: real-HTML bodies (starting with '<') pass through
    // untouched; plain-typed bodies like "- a<br>- b" become real lists.
    return luRTE_mdToHtml(n.bodyHtml);
  }
  // Markdown-only note: the same converter the editor loads it with, so the
  // first edit doesn't change what it looks like (links + images kept).
  return _noteMdToHtml(n.body||'');
}
function renderNoteEditor(n){
  const {wc,mins}=_readingTime(n.body||n.bodyHtml||'');
  const st=_noteStatusMeta(_noteStatus(n));
  const created=n.createdAt?fmtNoteDate(n.createdAt):(typeof n.id==='number'&&n.id>1e9?fmtNoteDate(_pd(n.id).toISOString()):'');
  const colorDots=NOTE_COLOR_PALETTE.map(c=>{
    const sel=(n.color||'')===c.value;
    return `<span class="ncp-dot ${c.value?'':'ncp-none'} ${sel?'selected':''}" style="${c.value?`background:${c.value}`:''}" title="${esc(c.name)}" onclick="setNoteColor(${_tidLit(n.id)},'${_jsAttr(c.value)}')"></span>`;
  }).join('');
  const hideBody=_noteOrigMode(n)==='original';
  return `<div class="note-doc note-live"><button class="btn notes-mobile-back" onclick="setNotesMobilePane('list')" title="Back to notes list">← All Notes</button>
  <div class="note-toolbar" style="margin-bottom:14px">
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="openDrawer('note',D.notes.find(x=>x.id==${_tidLit(n.id)}))" title="Tags, source, icon, folder and links">⚙ Details</button>
      <button class="btn btn-s" style="height:26px;font-size:11px${n.pinned?';color:var(--page-accent);font-weight:600':''}" onclick="toggleNotePinned(${_tidLit(n.id)})" title="${n.pinned?'Unpin':'Pin to top'}">📌</button>
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="toggleNoteFocusMode()" title="Focus mode (Esc to exit)">⛶</button>
      <button class="btn btn-s" style="height:26px;font-size:11px;color:var(--ac)" onclick="moveNoteToFolder(${_tidLit(n.id)})" title="${n.folderId?'Move folder':'Move to a folder'}">📁 ${n.folderId?esc((_noteFolderById(n.folderId)?.name||'?').slice(0,12)):'Move'}</button>
      <button class="btn btn-s" style="height:26px;font-size:11px"${_act('openNoteHistory',[n.id])} title="History — earlier versions of this note" aria-label="History">🕐</button>
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="exportNotePDF(${_tidLit(n.id)})" title="Export PDF">📄</button>
      <div style="position:relative;display:inline-block">
        <button class="btn btn-s" style="height:26px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('note-ai-menu')" title="AI tools">✨ AI ▾</button>
        <div id="note-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:30px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left;font-weight:600;border-bottom:1px solid var(--bd1);padding-bottom:6px;margin-bottom:4px" onclick="closePopMenu('note-ai-menu');_openNoteInsightPanel(${_tidLit(n.id)})">${_icon('brain',13,'currentColor')} Deep Insight panel</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('note-ai-menu');aiSummarizeNote(${_tidLit(n.id)})">✨ Summarize into bullets</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('note-ai-menu');aiAutoTagNote(${_tidLit(n.id)})">${_icon('tag',12,'currentColor')} Auto-tag</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('note-ai-menu');aiConceptLink(${_tidLit(n.id)})">🔗 Find related notes</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--warn);background:transparent;border:none;text-align:left" onclick="closePopMenu('note-ai-menu');aiGapDetect(${_tidLit(n.id)})">🔍 Detect knowledge gaps</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('note-ai-menu');aiExpandToDoc(${_tidLit(n.id)})">📄 Expand to full doc</button>
        </div>
      </div>
      <button class="btn btn-s" style="height:26px;font-size:11px;${(n.assignedTo||(n.assignees||[]).length)?'color:var(--purp)':''}" onclick="_openNoteAssign(${_tidLit(n.id)})" title="Assign to team members">👥</button>
      <button class="btn btn-s" style="height:26px;font-size:11px" title="Delete — it stays in the Trash for 30 days" aria-label="Delete note"${_act('deleteNoteWithUndo',[n.id])}>🗑</button>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      <span id="note-save-status" class="note-save-status" data-state="saved" aria-live="polite">Saved ✓</span>
      <span role="button" tabindex="0" style="font-size:18px;cursor:pointer;color:${n.starred?'var(--warn)':'var(--t3)'}" aria-label="${n.starred?'Unstar':'Star'}" title="${n.starred?'Unstar':'Star'}"${_act('_quickToggleNoteStar',[n.id])}>★</span>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:10px">${n.color?`<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${esc(n.color)};flex-shrink:0"></span>`:''}${n.icon?`<span style="font-size:26px;line-height:1">${esc(n.icon)}</span>`:''}
    <input id="nie-title" class="note-title-input" value="${esc(n.title||'')}" placeholder="Untitled" aria-label="Note title" autocomplete="off" oninput="_noteEdited()" onblur="_noteTitleCommit()" onkeydown="if(event.key==='Enter'){event.preventDefault();_noteTitleCommit();toggleNoteInlineEdit(_noteInlineEditId);}else if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();saveNoteInlineEdit(_noteInlineEditId);}">
  </div>
  <div class="note-props">
    <div class="k">◇ Status</div>
    <div class="v"><div style="position:relative;display:inline-block">
      <span class="chip ac" onclick="event.stopPropagation();togglePopMenu('nsp-${n.id}')" style="border-color:color-mix(in srgb,${st.color} 40%,transparent);color:color-mix(in srgb,${st.color} 42%,var(--t1));background:color-mix(in srgb,${st.color} 13%,transparent)">${st.icon} ${st.label} ▾</span>
      <div id="nsp-${n.id}" data-pop-menu="1" class="nsp" style="display:none;top:30px;left:0">${_noteStatusPickerHTML(n.id,_noteStatus(n))}</div>
    </div></div>
    <div class="k">⬡ Type</div>
    <div class="v"><select class="chip" aria-label="Note type" style="border:1px solid var(--bd2);background:var(--s2);color:var(--t2);height:24px;padding:0 6px" onchange="setNoteType(${_tidLit(n.id)},this.value)"><option value="">— none —</option>${_NOTE_TYPES.map(t=>`<option ${n.noteType===t?'selected':''}>${t}</option>`).join('')}</select></div>
    <div class="k">⛓ Source</div>
    <div class="v" style="color:var(--t2)">${esc(n.source||'Manual')}</div>
    <div class="k">🏷 Tags</div>
    <div class="v">${(n.tags||[]).length?(n.tags||[]).map(t=>`<span class="chip" onclick="filterNotesByTag('${_jsAttr(t)}')">#${esc(t)}</span>`).join(''):'<span style="color:var(--t3)">No tags — type # in the note to add one</span>'}</div>
    <div class="k">📅 Meetings</div>
    <div class="v">${_noteMeetings(n).map(mm=>`<span class="chip" title="Open this meeting on the calendar" onclick="openMeetingFromNote('${_jsAttr(String(mm.id))}')">📅 ${esc(mm.title)} · ${esc(mm.date)} <span style="cursor:pointer;opacity:.65" title="Unlink this meeting" onclick="event.stopPropagation();unlinkNoteMeeting(${_tidLit(n.id)},'${_jsAttr(String(mm.id))}')">✕</span></span>`).join('')}<span class="chip" style="color:var(--ac);cursor:pointer" title="Link this note to a calendar event" onclick="openMeetingPicker(${_tidLit(n.id)})">＋ Link meeting</span></div>
    <div class="k">🎨 Colour</div>
    <div class="v"><span class="note-color-palette">${colorDots}</span></div>
    <div class="k">📅 Dates</div>
    <div class="v" style="color:var(--t3);font-size:12px">Updated ${fmtNoteDate(n.updated)}${created?` · created ${created}`:''}${n.createdBy?` · ${esc(n.createdBy)}`:''} · ${wc} word${wc===1?'':'s'} · ${mins} min</div>
  </div>
  ${_noteOutlineHtml(n)}
  ${_noteOriginalHtml(n)}
  <div${hideBody?' style="display:none"':''}>${luRTE_render({id:'nie-body',placeholder:'Start writing… type / for headings, lists and more, [[ to link a note',value:_noteDecorateHtml(_noteHtml(n)),height:'260px',bodyClass:'note-body',showCharCount:false})}</div>
  <!-- Chip-based linker — Projects / Goals / Tasks / Other Notes / Bookmarks /
       Journal. Hydrated by showNoteInEditor() so it persists across re-renders. -->
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid var(--bd1)">
    <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px;display:flex;align-items:center;gap:8px">🔗 Linked Items <span style="font-size:11px;color:var(--t3);font-weight:400">Pick from each dropdown to link · click ✕ on a chip to unlink · auto-saves</span></div>
    <div id="note-inline-links" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"></div>
  </div>
  </div>`;
}

// Rehydrate persisted Projects page state from D.prefs.pageViews.projects.
const _projRestored=_restorePageState('projects');
let projView=_projRestored.view||'list';
if(typeof _projSearch==='undefined')var _projSearch=''; // search NOT persisted (transient)
if(typeof _projStatusFilter==='undefined')var _projStatusFilter=_projRestored.status||'Active';
if(typeof _projHealthFilter==='undefined')var _projHealthFilter=_projRestored.health||'All';
if(typeof _projShowArchived==='undefined')var _projShowArchived=_projRestored.showArchived===true;
if(typeof _projGroupBy==='undefined')var _projGroupBy=_projRestored.groupBy||'none';
if(typeof _projSort==='undefined')var _projSort=_projRestored.sort||'order';
if(typeof _projGanttZoom==='undefined')var _projGanttZoom=_projRestored.ganttZoom||'month';
function setProjFilter(field,val){
  if(field==='search')_projSearch=val||'';
  else if(field==='status')_projStatusFilter=val||'All';
  else if(field==='health')_projHealthFilter=val||'All';
  else if(field==='showArchived')_projShowArchived=!!val;
  else if(field==='groupBy')_projGroupBy=val||'none';
  else if(field==='sort')_projSort=val||'order';
  else if(field==='ganttZoom')_projGanttZoom=val||'month';
  // Persist everything except the transient search box.
  if(field!=='search')_persistPageState('projects',{view:projView,status:_projStatusFilter,health:_projHealthFilter,showArchived:_projShowArchived,groupBy:_projGroupBy,sort:_projSort,ganttZoom:_projGanttZoom});
  renderProjects();
}
function setProjView(v){projView=v;_persistPageState('projects',{view:v});renderProjects();}
function clearProjFilters(){_projSearch='';_projStatusFilter='Active';_projHealthFilter='All';_projShowArchived=false;_projGroupBy='none';_projSort='order';_persistPageState('projects',{status:'Active',health:'All',showArchived:false,groupBy:'none',sort:'order'});renderProjects();}
function _projHasFilters(){return !!_projSearch||_projStatusFilter!=='Active'||_projHealthFilter!=='All'||_projShowArchived||_projGroupBy!=='none'||_projSort!=='order';}
function _filteredProjects(){
  let arr=[...(D.projects||[])];
  // P3: archived hidden unless toggled
  if(!_projShowArchived)arr=arr.filter(p=>!p.archived);
  if(_projSearch){const q=_projSearch.toLowerCase();arr=arr.filter(p=>(p.name||'').toLowerCase().includes(q)||(p.desc||'').toLowerCase().includes(q));}
  if(_projStatusFilter==='Active')arr=arr.filter(p=>p.status==='Active'||p.status==='In Progress');
  else if(_projStatusFilter==='On Hold')arr=arr.filter(p=>p.status==='On Hold');
  else if(_projStatusFilter==='Completed')arr=arr.filter(p=>p.status==='Completed'||p.status==='Done');
  else if(_projStatusFilter==='Not Started')arr=arr.filter(p=>p.status==='Not Started');
  if(_projHealthFilter!=='All')arr=arr.filter(p=>projectHealth(p).label===_projHealthFilter);
  // P2 sort: pinned first, then by sort selection, then sortOrder, then array order
  if(_projSort==='dueAsc')arr.sort((a,b)=>(Date.parse(a.due||'9999')||9e15)-(Date.parse(b.due||'9999')||9e15));
  else if(_projSort==='pctDesc')arr.sort((a,b)=>(b.pct||0)-(a.pct||0));
  else if(_projSort==='pctAsc')arr.sort((a,b)=>(a.pct||0)-(b.pct||0));
  else if(_projSort==='az')arr.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else arr.sort((a,b)=>(typeof a.sortOrder==='number'?a.sortOrder:9e9)-(typeof b.sortOrder==='number'?b.sortOrder:9e9));
  arr.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)); // pinned float to top
  return arr;
}
function _projToggleStar(id,e){if(e)e.stopPropagation();const p=D.projects.find(x=>x.id===id);if(!p)return;p.pinned=!p.pinned;save('projects');renderProjects();toast(p.pinned?'📌 Pinned':'Unpinned');}
function _projToggleArchive(id,e){if(e)e.stopPropagation();const p=D.projects.find(x=>x.id===id);if(!p)return;p.archived=!p.archived;if(p.archived)p.archivedAt=new Date().toISOString();save('projects');renderProjects();toast(p.archived?'🗄 Archived':'Restored from archive');}
async function aiProjectHealth(){
  if(!D.projects.length){toast('No projects yet');return;}
  toast({type:'info',title:'Generating project health summary…',duration:2000});
  try{
    const {provider,configured}=_getAIConfig();
    const lines=D.projects.filter(p=>!p.archived).map(p=>{const h=projectHealth(p);const tasks=D.tasks.filter(t=>t.projectId===p.id);return `- ${p.name}: ${p.status||'—'}, ${p.pct||0}% complete, due ${p.due||'—'}, ${h.label}, ${tasks.length} tasks (${tasks.filter(t=>t.status==='Done').length} done)`;}).join('\n');
    const sys=`You are an experienced project manager. Read the active project list with health flags and produce a 3-paragraph health report: 1) what's going well, 2) what needs attention this week, 3) the single most important next action across the portfolio. Be specific — name the projects. No fluff.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`Active projects:\n${lines}`,provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim();
    const m=document.getElementById('modal-content');
    if(m){m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🩺 Project Health Summary</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:12px;font-size:12px;line-height:1.65;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;document.getElementById('modal-capture').classList.add('show');}
  }catch(e){toast({type:'error',title:'AI summary failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
async function aiProjectNextMilestone(){
  if(!D.projects.length){toast('No projects yet');return;}
  const active=D.projects.filter(p=>!p.archived&&(p.status==='Active'||p.status==='In Progress'));
  if(!active.length){toast('No active projects');return;}
  toast({type:'info',title:'Suggesting next milestones…',duration:2000});
  try{
    const {provider,configured}=_getAIConfig();
    const lines=active.map(p=>{const tasks=D.tasks.filter(t=>t.projectId===p.id&&t.status!=='Done').slice(0,5).map(t=>'  · '+t.title).join('\n');return `- ${p.name} (${p.pct||0}%, due ${p.due||'—'}):\n${tasks||'  (no open tasks)'}`;}).join('\n');
    const sys=`You are a project planner. For each active project, suggest the SINGLE next milestone the user should ship in the next 7-14 days. Reply as a markdown bulleted list, one project per bullet, format: "**Project name** — milestone (1 sentence why)". No preamble.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:lines,provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim();
    const m=document.getElementById('modal-content');
    if(m){m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🎯 Next Milestones</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:12px;font-size:12px;line-height:1.65;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;document.getElementById('modal-capture').classList.add('show');}
  }catch(e){toast({type:'error',title:'AI failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
async function aiProjectRisks(){
  if(!D.projects.length){toast('No projects yet');return;}
  const at=D.projects.filter(p=>!p.archived&&(projectHealth(p).label!=='On Track'));
  if(!at.length){toast('Nothing flagged — all projects on track 🎉');return;}
  toast({type:'info',title:'Identifying risks…',duration:2000});
  try{
    const {provider,configured}=_getAIConfig();
    const lines=at.map(p=>{const h=projectHealth(p);const overdueTasks=D.tasks.filter(t=>t.projectId===p.id&&t.status!=='Done'&&t.due&&t.due<_todayStr).slice(0,5).map(t=>'  · OVERDUE: '+t.title+' (due '+t.due+')').join('\n');return `- ${p.name} [${h.label}], ${p.pct||0}% complete, due ${p.due||'—'}\n${overdueTasks||'  (no overdue tasks but at-risk)'}`;}).join('\n');
    const sys=`You are an experienced PM doing a risk review. For each at-risk project, identify the top 1-2 risks and suggest a concrete unblock. Output a markdown list: project name → risk → unblock action. Be specific.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:lines,provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim();
    const m=document.getElementById('modal-content');
    if(m){m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">⚠️ Project Risks</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:12px;font-size:12px;line-height:1.65;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;document.getElementById('modal-capture').classList.add('show');}
  }catch(e){toast({type:'error',title:'AI failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
function _renderProjRail(){
  const r=document.getElementById('proj-rail');if(!r)return;
  const ps=(D.projects||[]).filter(p=>!p.archived);
  const byHealth={'On Track':0,'Needs Attention':0,'At Risk':0};
  ps.forEach(p=>{const h=projectHealth(p).label;if(byHealth[h]!==undefined)byHealth[h]++;});
  const onDeck=ps.filter(p=>p.status==='Not Started').slice(0,5);
  const due30=ps.filter(p=>{if(!p.due)return false;const d=+_pd(p.due);if(isNaN(d))return false;const days=Math.ceil((d-Date.now())/86400000);return days>=0&&days<=30;}).sort((a,b)=>+_pd(a.due)-+_pd(b.due)).slice(0,6);
  const recentTasks=D.tasks.filter(t=>t.projectId&&t.completedAt).sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||'')).slice(0,5);
  r.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700">${_icon('barChart',14,'currentColor')} Insights</div>
  </div>
  <div data-mod="pr-health" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px">Health</div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
      <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--ok);flex-shrink:0"></span><span style="flex:1">On Track</span><strong>${byHealth['On Track']}</strong></div>
      <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--warn);flex-shrink:0"></span><span style="flex:1">Needs Attention</span><strong style="color:var(--warn)">${byHealth['Needs Attention']}</strong></div>
      <div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0"></span><span style="flex:1">At Risk</span><strong style="color:var(--red)">${byHealth['At Risk']}</strong></div>
    </div>
  </div>
  ${due30.length?`<div data-mod="pr-due30" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">⏰ Due in next 30 days</div>${due30.map(p=>{const days=Math.ceil((+_pd(p.due)-Date.now())/86400000);return `<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 0" onclick="openProjectDetail(${p.id})"><span style="width:6px;height:6px;border-radius:2px;background:${p.color};flex-shrink:0"></span><span class="rt" style="font-size:11px">${esc(p.name)}</span><span style="font-size:11px;color:${days<=7?'var(--warn)':'var(--t3)'};flex-shrink:0">${days===0?'today':days+'d'}</span></div>`;}).join('')}</div>`:''}
  ${onDeck.length?`<div data-mod="pr-ondeck" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">🚧 On deck</div>${onDeck.map(p=>`<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 0" onclick="openProjectDetail(${p.id})"><span style="width:6px;height:6px;border-radius:2px;background:${p.color};flex-shrink:0"></span><span class="rt" style="font-size:11px">${esc(p.name)}</span></div>`).join('')}</div>`:''}
  ${recentTasks.length?`<div data-mod="pr-recent" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">🕐 Recent completions</div>${recentTasks.map(t=>{const p=D.projects.find(x=>x.id===t.projectId);return `<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 0" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><span style="font-size:11px;color:var(--ok);flex-shrink:0">✓</span><span class="rt" style="font-size:11px">${esc(t.title)}</span>${p?`<span style="width:6px;height:6px;border-radius:2px;background:${p.color};flex-shrink:0"></span>`:''}</div>`;}).join('')}</div>`:''}`;
}

// ─── Project Health helper ──────────────────────────────────────────────────
// Compute project-level KPIs from native + linked-external tasks. Used by the
// Command Center, Programs page, and project drawer health strip.
//   velocity : completions per week (avg across last 4 weeks).
//   burn     : open tasks now vs 14 days ago (positive = work piling up).
//   risk     : % of open tasks that are overdue or stalled (>7d no update).
//   etaWeeks : open ÷ velocity (Infinity if velocity is 0).
//   trend    : 'up' (velocity rising), 'flat', 'down'.
// Pass `null` projectId to roll up across ALL projects (Command Center "All").
function _projectHealth(projectId){
  const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const today=_todayStr;
  const tMs=Date.now();
  // Collect rows.
  const native=(D.tasks||[]).filter(t=>!t.parentTaskId&&(projectId==null||String(t.projectId)===String(projectId)));
  const ext=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(et=>{
    const ov=et.override||{};
    if(ov.tombstoned)return false;
    if(projectId==null)return true;
    return String(ov.localProjectId||'')===String(projectId);
  });
  const rows=native.map(t=>({
    done:t.status==='Done',
    completedAt:t.completedAt||null,
    due:t.due||'',
    updatedAt:t.updatedAt||t.completedAt||t.createdAt||'',
    status:t.status||'',
  })).concat(ext.map(et=>{
    const done=isExtDone(et);
    return {
      done,
      completedAt:done?(et.completedAt||et.fetchedAt||null):null,
      due:(et.override&&et.override.localDue)||et.due||'',
      updatedAt:et.updatedAt||et.fetchedAt||'',
      status:et.status||'',
    };
  }));
  const open=rows.filter(r=>!r.done);
  const done=rows.filter(r=>r.done);
  // Velocity: completions in last 28d, divided by 4.
  const cutoff28=new Date(tMs-28*86400000).toISOString();
  const recentDone=done.filter(r=>r.completedAt&&r.completedAt>=cutoff28);
  const velocity=recentDone.length/4;          // /wk
  // Trend: compare last 2 weeks vs prior 2 weeks.
  const cutoff14=new Date(tMs-14*86400000).toISOString();
  const last2w=done.filter(r=>r.completedAt&&r.completedAt>=cutoff14).length;
  const prior2w=recentDone.length-last2w;
  const trend=last2w>prior2w*1.15?'up':last2w<prior2w*0.85?'down':'flat';
  // Burn: open count now vs 14d ago. Approximation: openNow + doneInLast14d − (assumed) openThen.
  // We don't have a snapshot; cheaper proxy: doneInLast14d − createdInLast14d.
  const createdRecent=(D.tasks||[]).filter(t=>!t.parentTaskId&&(projectId==null||String(t.projectId)===String(projectId))).filter(t=>(t.createdAt||'')>=cutoff14).length
                    +(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(et=>{
                       const ov=et.override||{};if(ov.tombstoned)return false;
                       if(projectId!=null&&String(ov.localProjectId||'')!==String(projectId))return false;
                       return (et.fetchedAt||'')>=cutoff14;
                     }).length;
  const burn=createdRecent-last2w; // positive → backlog growing
  // Risk: overdue + stalled (>7d no update) as fraction of open.
  const overdue=open.filter(r=>r.due&&r.due<today).length;
  const stallCut=new Date(tMs-7*86400000).toISOString();
  const stalled=open.filter(r=>r.updatedAt&&r.updatedAt<stallCut).length;
  const risk=open.length?Math.round(((overdue+stalled)/open.length)*100):0;
  const etaWeeks=velocity>0?(open.length/velocity):Infinity;
  return {
    open:open.length,done:done.length,total:rows.length,
    velocity:Math.round(velocity*10)/10,
    burn, trend,
    overdue,stalled,risk,
    etaWeeks:isFinite(etaWeeks)?Math.round(etaWeeks*10)/10:null,
    pct:rows.length?Math.round(done.length/rows.length*100):0,
  };
}
// Compact health strip used in drawers + cards.
function _renderHealthStrip(h){
  const trendArrow=h.trend==='up'?'<span style="color:var(--ok)">▲</span>':h.trend==='down'?'<span style="color:var(--red)">▼</span>':'<span style="color:var(--t3)">▬</span>';
  const burnColor=h.burn>0?'var(--warn)':'var(--ok)';
  const burnLabel=h.burn>0?'+'+h.burn:String(h.burn);
  const riskColor=h.risk>=50?'var(--red)':h.risk>=25?'var(--warn)':'var(--ok)';
  const eta=h.etaWeeks==null?'—':h.etaWeeks>52?'>1y':h.etaWeeks+'w';
  const stat=(v,l,c)=>`<div style="flex:1;min-width:0;background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:750;color:${c||'var(--t1)'};line-height:1">${v}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin-top:4px">${l}</div></div>`;
  return `<div style="display:flex;gap:6px;margin:8px 0">
    ${stat(h.velocity+'/wk '+trendArrow,'Velocity','var(--ac)')}
    ${stat(burnLabel,'Burn (14d)',burnColor)}
    ${stat(h.risk+'%','Risk',riskColor)}
    ${stat(eta,'ETA',h.etaWeeks==null||h.etaWeeks>52?'var(--t3)':'var(--t1)')}
  </div>`;
}

// ─── Command Center (cross-tool PM dashboard) ──────────────────────────────
// Hat: 'all' | 'cf' (CommunityForce/Smartsheet) | 'lsi' (LSI Media/Nifty)
//      | 'personal' (native only). Persisted in D.prefs.ccContext.
// Module-scope so the chip toggle survives re-renders (filter-state rule).
let _ccContext=null;
function _ccHat(){
  if(_ccContext)return _ccContext;
  _ccContext=(D.prefs&&D.prefs.ccContext)||'all';
  return _ccContext;
}
function setCcContext(h){
  _ccContext=h;
  D.prefs=D.prefs||{};D.prefs.ccContext=h;save('prefs');
  renderCommandCenter();
}
// Return a unified, normalised array filtered by current hat.
function _ccTasks(){
  const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const hat=_ccHat();
  const out=[];
  if(hat==='all'||hat==='personal'){
    _topLevelTasks(D.tasks||[]).forEach(t=>{
      out.push({
        id:t.id,title:t.title||'',
        status:t.status==='Done'?'Done':(t.status||'Not Started'),
        priority:t.priority||'Medium',
        due:t.due||'',
        completedAt:t.completedAt||null,
        updatedAt:t.updatedAt||t.completedAt||t.createdAt||'',
        projectId:t.projectId||null,
        project:(t.projectId&&(D.projects||[]).find(p=>p.id===t.projectId)||{}).name||'',
        assignee:t.assignedTo||'',
        source:'personal',sourceLabel:'Personal',
        hasPendingPush:false,
        _raw:t,
      });
    });
  }
  if(hat==='all'||hat==='cf'||hat==='lsi'){
    (Array.isArray(D.externalTasks)?D.externalTasks:[]).forEach(et=>{
      const ov=et.override||{};
      if(ov.tombstoned)return;
      if(hat==='cf'&&et.source!=='smartsheet')return;
      if(hat==='lsi'&&et.source!=='nifty')return;
      const done=isExtDone(et);
      out.push({
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title||'',
        status:done?'Done':(et.status||'Not Started'),
        rawStatus:et.status||'',
        priority:(ov.localPriority||et.priority||'Medium'),
        due:(ov.localDue||et.due||''),
        completedAt:done?(et.completedAt||et.fetchedAt||null):null,
        updatedAt:et.updatedAt||et.fetchedAt||'',
        projectId:ov.localProjectId||null,
        project:et.projectLabel||(et.source==='smartsheet'?'CF':'LSI'),
        assignee:et.assignee||'',
        source:et.source,
        sourceLabel:et.source==='smartsheet'?'CF':'LSI',
        hasPendingPush:!!ov.pendingStatus,
        externalUrl:et.externalUrl||'',
        _ext:et,
      });
    });
  }
  return out;
}
