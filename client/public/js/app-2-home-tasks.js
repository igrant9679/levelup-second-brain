// LevelUp client, file 2 of 7: tasks AI, workspace layout (LU_PAGES), Home, and every Tasks view (list, cards, board, matrix, Gantt, calendar, clusters).
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
// ====== TASKS AI ======
function aiDecomposeGoal(){
  const goal=prompt('Enter a goal or project to decompose into tasks:');
  if(!goal||!goal.trim())return;
  toast('🧩 Decomposing goal into tasks...');
  // Generate subtasks based on the goal using heuristic decomposition
  const g=goal.trim();
  const verbs=['Research','Draft','Review','Finalize','Schedule','Send','Create','Set up','Test','Present','Coordinate','Document','Implement','Analyze','Design'];
  const count=5+Math.floor(Math.random()*4);
  const subtasks=[];
  const phases=['Planning','Execution','Review'];
  // Build contextual subtasks based on keywords in the goal
  const lower=g.toLowerCase();
  if(lower.includes('launch')||lower.includes('ship')||lower.includes('release')){
    subtasks.push('Define launch criteria and success metrics','Prepare launch checklist','Draft announcement copy','Set up monitoring and alerts','Coordinate with stakeholders','Run final QA pass','Schedule launch date','Prepare rollback plan');
  } else if(lower.includes('report')||lower.includes('analysis')||lower.includes('research')){
    subtasks.push('Define scope and key questions','Gather data sources','Conduct primary research','Analyze findings','Draft executive summary','Create supporting visuals','Review with stakeholders','Finalize and distribute');
  } else if(lower.includes('meeting')||lower.includes('workshop')||lower.includes('session')){
    subtasks.push('Define agenda and objectives','Send calendar invites','Prepare materials and slides','Share pre-read with attendees','Facilitate the session','Capture action items','Send follow-up summary','Track action item completion');
  } else {
    verbs.slice(0,count).forEach((v,i)=>{
      subtasks.push(v+' '+g.split(' ').slice(0,3).join(' ')+(i<3?' — Phase '+(i+1):''));
    });
  }
  const today=new Date();
  const dueDate=_ymd(new Date(today.getTime()+7*24*60*60*1000));
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🧩 AI Task Decomposition</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Goal: <strong>${esc(g)}</strong></div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Select tasks to add (all selected by default):</div>
  <div id="decomp-list" style="max-height:260px;overflow-y:auto">${subtasks.slice(0,8).map((s,i)=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:12px"><input type="checkbox" checked data-idx="${i}" style="accent-color:var(--ac)"> ${esc(s)}</label>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="(function(){
    const checks=document.querySelectorAll('#decomp-list input:checked');
    if(!checks.length){toast('Select at least one task');return;}
    const titles=[...checks].map(c=>c.closest('label').textContent.trim());
    titles.forEach(title=>{
      D.tasks.push({id:Date.now()+Math.random(),title,priority:'Medium',due:'${_jsAttr(dueDate)}',status:'Not Started',context:'Deep Work',project:'',tags:['ai-generated'],notes:'Generated from goal: ${_jsAttr(g)}',myDay:false,energy:'medium',subtasks:[],comments:[],createdBy:D.creds.userName||'Idris Grant'});
    });
    save('tasks');renderScreen('tasks');closeModal();
    toast('✓ '+titles.length+' tasks added!');
  })()">✓ Add Selected Tasks</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiDeadlineRisk(){
  toast('⚠️ Analyzing deadline risk...');
  const today=new Date();
  const risks=[];
  D.tasks.filter(t=>t.status!=='Done'&&t.due).forEach(t=>{
    const due=_pd(t.due);
    const daysLeft=Math.ceil((due-today)/(1000*60*60*24));
    const subtasksDone=(t.subtasks||[]).filter(s=>s.done).length;
    const subtasksTotal=(t.subtasks||[]).length;
    const pct=subtasksTotal>0?subtasksDone/subtasksTotal:0;
    const estMins=t.estimatedMins||60;
    const hoursNeeded=estMins/60;
    let risk='low';
    if(daysLeft<0)risk='overdue';
    else if(daysLeft<=1&&pct<0.5)risk='critical';
    else if(daysLeft<=3&&pct<0.3)risk='high';
    else if(daysLeft<=7&&pct<0.2)risk='medium';
    if(risk!=='low')risks.push({t,daysLeft,pct,risk,hoursNeeded});
  });
  if(!risks.length){toast('✅ No deadline risks detected — you\'re on track!');return;}
  risks.sort((a,b)=>['overdue','critical','high','medium'].indexOf(a.risk)-['overdue','critical','high','medium'].indexOf(b.risk));
  const riskColors={overdue:'var(--red)',critical:'var(--red)',high:'#f97316',medium:'#eab308'};
  const riskLabels={overdue:'🔴 OVERDUE',critical:'🔴 CRITICAL',high:'🟠 HIGH',medium:'🟡 MEDIUM'};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">⚠️ Deadline Risk Report</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">${risks.length} task${risks.length!==1?'s':''} at risk:</div>
  <div style="max-height:300px;overflow-y:auto">${risks.map(r=>`<div style="padding:8px;margin-bottom:6px;border-radius:6px;border-left:3px solid ${riskColors[r.risk]};background:var(--s2)">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px"><span style="font-size:11px;font-weight:700;color:${riskColors[r.risk]}">${riskLabels[r.risk]}</span><span style="font-size:11px;font-weight:600">${esc(r.t.title)}</span></div>
    <div style="font-size:11px;color:var(--t3)">${r.daysLeft<0?Math.abs(r.daysLeft)+' days overdue':r.daysLeft+' day'+( r.daysLeft!==1?'s':'')+' left'} · ${Math.round(r.pct*100)}% complete · ~${r.hoursNeeded.toFixed(1)}h estimated</div>
  </div>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="closeModal()">Got it</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiAutoPriority(){
  toast('✨ Scoring and re-prioritizing tasks...');
  const today=new Date();
  D.tasks.filter(t=>t.status!=='Done').forEach(t=>{
    const due=new Date(t.due||'2099-12-31');
    const daysLeft=Math.ceil((due-today)/(1000*60*60*24));
    // Urgency: 0-40 pts
    const urgency=daysLeft<=0?40:daysLeft<=1?35:daysLeft<=3?28:daysLeft<=7?20:daysLeft<=14?12:5;
    // Importance: 0-30 pts (based on existing priority + linked goal)
    const impBase={High:30,Medium:20,Low:10}[t.priority]||15;
    const goalBonus=t.linkedGoalId?10:0;
    const importance=Math.min(30,impBase+goalBonus);
    // Energy alignment: 0-15 pts
    const energyScore={high:15,medium:10,low:5}[t.energy]||10;
    // Subtask progress: 0-15 pts
    const subs=t.subtasks||[];
    const progScore=subs.length>0?Math.round((subs.filter(s=>s.done).length/subs.length)*15):0;
    const total=urgency+importance+energyScore+progScore;
    t._aiScore=total;
    // Assign priority based on score
    if(total>=75)t.priority='High';
    else if(total>=45)t.priority='Medium';
    else t.priority='Low';
  });
  D.tasks.sort((a,b)=>(b._aiScore||0)-(a._aiScore||0));
  save('tasks');
  renderCurrentTaskView();
  toast('✨ Tasks re-scored and sorted by AI priority!');
}

// ─── AI Compose for task notes ──────────────────────────────────────────────
// Generates a draft description for a task based on its title, project, tags,
// and existing notes. Targets the dr-notes-rte contenteditable (the Notes
// field is now a Rich Text Editor, not a plain textarea). The preview modal
// detects target type and inserts rendered HTML when targeting an RTE.
async function aiComposeTaskNotes(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  // Prefer the RTE; fall back to the legacy textarea id for back-compat.
  const target=document.getElementById('dr-notes-rte')||document.getElementById('dr-notes');
  if(!target)return;
  const btn=document.getElementById('btn-dr-task-ai-desc');
  const orig=btn?btn.textContent:'';
  if(btn){btn.textContent='⏳ Composing...';btn.disabled=true;}
  try{
    const projectName=t.project||(t.projectId?(D.projects.find(p=>p.id===t.projectId)||{}).name:'')||'';
    // Pull existing notes as PLAIN TEXT so the AI doesn't see HTML tags.
    // RTE: innerText. Textarea: .value.
    // Cap existing notes so the combined userContent stays under ai.assist's
    // 8000-char zod limit (rich-text task notes can be long).
    const existingText=(target.isContentEditable?(target.innerText||'').trim():(target.value||'').trim()).slice(0,6000);
    const ctxLines=[
      `Title: ${t.title}`,
      projectName?`Project: ${projectName}`:'',
      t.priority?`Priority: ${t.priority}`:'',
      t.due?`Due: ${t.due}`:'',
      (t.tags||[]).length?`Tags: ${(t.tags||[]).join(', ')}`:'',
      existingText?`Existing notes (rewrite/extend):\n${existingText}`:'',
    ].filter(Boolean).join('\n').slice(0,7800);
    const {provider,configured}=_getAIConfig();
    const sys='You are a task description writer for a productivity app. Given the task metadata, write a clear description explaining what the task involves, why it matters, and what "done" looks like. Markdown formatting (## headings, **bold**, bullets) is allowed when it genuinely helps clarity.'+(typeof _aiLengthHint==='function'?_aiLengthHint():'');
    const res=await _trpc('ai.assist',{
      systemPrompt:sys,
      userContent:ctxLines,
      provider:provider||'manus',
    },'mutation');
    const text=res?.result||res?.text||'';
    if(text){_aiComposePreview('task',id,text.trim(),target.id,'aiComposeTaskNotes');}
    else toast('No description generated');
  }catch(e){toast('AI compose failed: '+(e.message||e));}
  finally{if(btn){btn.textContent=orig||'✨ AI Compose';btn.disabled=false;}}
}

// AI Suggest Subtasks: ask the model to propose 3-6 subtasks for the current
// task. Shows a checkbox modal letting the user pick which to keep.
async function aiSuggestSubtasks(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  const btn=document.getElementById('btn-dr-task-ai-subs');
  const orig=btn?btn.textContent:'';
  if(btn){btn.textContent='⏳ Thinking...';btn.disabled=true;}
  try{
    const projectName=t.project||(t.projectId?(D.projects.find(p=>p.id===t.projectId)||{}).name:'')||'';
    // Notes are now rich text and can be long — strip HTML and cap so the
    // combined userContent stays under ai.assist's 8000-char zod limit.
    const _plain=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const notesPlain=_plain(t.notes).slice(0,6000);
    const ctxLines=[
      `Task: ${t.title}`,
      projectName?`Project: ${projectName}`:'',
      notesPlain?`Notes:\n${notesPlain}`:'',
      (t.subtasks||[]).length?`Existing subtasks (avoid duplicates):\n- `+(t.subtasks||[]).map(s=>s.title).join('\n- '):'',
    ].filter(Boolean).join('\n').slice(0,7800);
    const {provider,configured}=_getAIConfig();
    const res=await _trpc('ai.assist',{
      systemPrompt:'You are a task breakdown assistant. Given a task, propose 3-6 concrete subtasks that, completed in order, would finish it. Return ONLY a JSON object of the form {"subtasks":["First action","Second action",...]} with no extra commentary. Each subtask is a short imperative phrase, max 80 chars.',
      userContent:ctxLines,
      provider:provider||'manus',
    },'mutation');
    const text=res?.result||res?.text||'';
    let arr=[];
    try{const parsed=JSON.parse(text.replace(/^```(?:json)?|```$/g,'').trim());arr=Array.isArray(parsed.subtasks)?parsed.subtasks:[];}catch(_){
      // Fallback: parse plain bullet/line list
      arr=text.split('\n').map(l=>l.replace(/^[-*\d.\s]+/,'').trim()).filter(l=>l&&l.length<200);
    }
    arr=arr.slice(0,8);
    if(!arr.length){toast('No subtasks suggested');return;}
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🧩 AI Suggested Subtasks</h2>
      <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Task: <strong>${esc(t.title)}</strong></div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Pick which to add (all selected by default):</div>
      <div id="ai-sub-list" style="max-height:300px;overflow-y:auto">${arr.map((s,i)=>`<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;font-size:12px;line-height:1.4"><input type="checkbox" checked data-idx="${i}" style="accent-color:var(--ac);margin-top:3px"><span>${esc(s)}</span></label>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-p" onclick="_applyAISubtasks(${id})">Add Selected</button>
        <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      </div>`;
    window._aiSubtasksList=arr;window._aiSubtasksTaskId=id;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast('AI suggest failed: '+(e.message||e));}
  finally{if(btn){btn.textContent=orig||'🧩 AI Suggest Subtasks';btn.disabled=false;}}
}
function _applyAISubtasks(id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  t.subtasks=t.subtasks||[];
  const arr=window._aiSubtasksList||[];
  const picks=[...document.querySelectorAll('#ai-sub-list input[type=checkbox]')]
    .filter(cb=>cb.checked).map(cb=>arr[Number(cb.dataset.idx)]).filter(Boolean);
  let nextId=window.nextId(t.subtasks);
  picks.forEach(title=>{t.subtasks.push({id:nextId++,title,done:false});});
  save('tasks');closeModal();
  // Refresh drawer if open. The actual open marker is `.show` on #drawer-ov;
  // the previous `.drawer.open` selector never matched, so the new subtasks
  // didn't appear until the user closed and reopened the task.
  const ov=document.getElementById('drawer-ov');
  if(ov&&ov.classList.contains('show')&&typeof openDrawer==='function')openDrawer('task',t);
  toast('✓ Added '+picks.length+' subtask'+(picks.length===1?'':'s'));
}

// AI Compose for project description
async function aiComposeProjectDesc(id){
  const p=D.projects.find(x=>x.id===id);if(!p)return;
  const ta=document.getElementById('dr-body');if(!ta)return;
  const btn=document.getElementById('btn-dr-proj-ai-desc');
  const orig=btn?btn.textContent:'';
  if(btn){btn.textContent='⏳ Composing...';btn.disabled=true;}
  try{
    const projTasks=D.tasks.filter(t=>t.projectId===id||t.project===p.name).slice(0,15);
    const ctxLines=[
      `Project: ${p.name}`,
      p.status?`Status: ${p.status}`:'',
      p.due?`Due: ${p.due}`:'',
      ta.value.trim()?`Existing description (rewrite/extend):\n${ta.value.trim()}`:'',
      projTasks.length?`Sample tasks already in this project:\n- `+projTasks.map(t=>t.title).join('\n- '):'',
    ].filter(Boolean).join('\n');
    const {provider,configured}=_getAIConfig();
    // Drop the hardcoded "Max 130 words" so the user's length preference
    // (Short / Medium / Long via _aiLengthHint) becomes the sole guidance.
    const sys='You are a project description writer. Write a clear description explaining the project goal, scope, and success criteria. Markdown formatting (## headings, **bold**, bullets) is allowed when it genuinely helps clarity.'+(typeof _aiLengthHint==='function'?_aiLengthHint():'');
    const res=await _trpc('ai.assist',{
      systemPrompt:sys,
      userContent:ctxLines,
      provider:provider||'manus',
    },'mutation');
    const text=res?.result||res?.text||'';
    if(text){_aiComposePreview('project',id,text.trim(),'dr-body','aiComposeProjectDesc');}
    else toast('No description generated');
  }catch(e){toast('AI compose failed: '+(e.message||e));}
  finally{if(btn){btn.textContent=orig||'✨ AI Describe';btn.disabled=false;}}
}

// Compose-flow preview modal. Used by aiComposeTaskNotes + aiComposeProjectDesc
// to show a rendered-markdown preview of the AI output BEFORE stomping the
// underlying textarea. Buttons: Insert (writes raw markdown text into the
// target textarea), Regenerate (re-fires the originating compose function),
// Cancel. `entityType` is informational ('task' / 'project'); `entityId` is
// passed back to the regenerate function so a second call works without
// requiring drawer state.
function _aiComposePreview(entityType,entityId,text,targetTextareaId,regenFnName){
  const html=(typeof renderMd==='function')?renderMd(text):`<div style="white-space:pre-wrap">${esc(text)}</div>`;
  // Pass the generated text as a single-quoted JS string literal via _jsAttr.
  // Raw JSON.stringify emits DOUBLE quotes, which terminate the double-quoted
  // onclick="" attribute and silently break the Insert/Copy buttons (the
  // documented inline-onclick escaping gotcha — "nothing happens" on click).
  const argText="'"+_jsAttr(text)+"'";
  const m=document.getElementById('modal-content');
  if(!m)return;
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:4px">✨ AI ${entityType==='task'?'Task Notes':'Project Description'} Preview</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Review the rendered output, then choose to insert it into the description field. Markdown formatting will display correctly when the ${entityType} is viewed.</div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;font-size:12px;line-height:1.65;max-height:380px;overflow-y:auto;margin-bottom:10px">${html}</div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_aiComposeInsert('${_jsAttr(targetTextareaId)}',${argText})">⬇ Insert</button>
      <button class="btn btn-s" onclick="closeModal();${_jsAttr(regenFnName)}(${entityId})">🔄 Regenerate</button>
      ${typeof _aiLengthChip==='function'?_aiLengthChip():''}
      <button class="btn btn-s" onclick="navigator.clipboard.writeText(${argText});toast('📋 Copied')">📋 Copy</button>
      <button class="btn btn-s" onclick="closeModal()" style="margin-left:auto">Cancel</button>
    </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
// Insert AI-composed content into the target field then close the preview
// modal. Two target types are supported:
//   - <textarea> (project description) — sets .value with the raw markdown
//     source. Markdown is rendered later via renderMd() on display.
//   - contenteditable RTE (task Notes) — replaces the editor's HTML with the
//     renderMd-rendered HTML so formatting (headings, lists, bold) lives in
//     the editor immediately.
function _aiComposeInsert(targetElId,text){
  const el=document.getElementById(targetElId);
  if(!el){toast({type:'error',title:'Could not insert',msg:'The editor field is no longer open — reopen the item and try again. Your text was copied so you can paste it.'});try{navigator.clipboard.writeText(String(text||''));}catch(_){}return;}
  const md=String(text||'').trim();
  if(el.isContentEditable){
    // RTE target. Render markdown → HTML and replace the editor contents.
    // We replace (not append) to match the prompt phrasing "rewrite/extend"
    // — the AI was given the existing notes and produced the next version.
    const html=(typeof renderMd==='function')?renderMd(md):`<div style="white-space:pre-wrap">${esc(md)}</div>`;
    el.innerHTML=html;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }else if('value' in el){
    // Plain textarea — store the raw markdown source.
    el.value=md;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  closeModal();
  toast('✨ Description inserted');
}

// AI Suggest Tasks for a project
async function aiSuggestProjectTasks(id){
  const p=D.projects.find(x=>x.id===id);if(!p)return;
  toast('⏳ Thinking...');
  try{
    const existing=D.tasks.filter(t=>t.projectId===id||t.project===p.name).slice(0,20);
    const ctxLines=[
      `Project: ${p.name}`,
      p.desc?`Description:\n${p.desc}`:'',
      existing.length?`Existing tasks (avoid duplicates):\n- `+existing.map(t=>t.title).join('\n- '):'',
    ].filter(Boolean).join('\n');
    const {provider,configured}=_getAIConfig();
    const res=await _trpc('ai.assist',{
      systemPrompt:'You are a project planning assistant. Propose 5-8 concrete, action-oriented tasks needed to advance this project. Return ONLY a JSON object: {"tasks":[{"title":"...","priority":"High|Medium|Low"}]}. Each title is short imperative, max 80 chars.',
      userContent:ctxLines,
      provider:provider||'manus',
    },'mutation');
    const text=res?.result||res?.text||'';
    let arr=[];
    try{const parsed=JSON.parse(text.replace(/^```(?:json)?|```$/g,'').trim());arr=Array.isArray(parsed.tasks)?parsed.tasks:[];}catch(_){
      arr=text.split('\n').map(l=>l.replace(/^[-*\d.\s]+/,'').trim()).filter(l=>l&&l.length<200).map(t=>({title:t,priority:'Medium'}));
    }
    arr=arr.slice(0,10);
    if(!arr.length){toast('No tasks suggested');return;}
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🧩 AI Suggested Tasks</h2>
      <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Project: <strong>${esc(p.name)}</strong></div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Pick which to add (all selected by default):</div>
      <div id="ai-proj-task-list" style="max-height:340px;overflow-y:auto">${arr.map((t,i)=>`<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;font-size:12px;line-height:1.4"><input type="checkbox" checked data-idx="${i}" style="accent-color:var(--ac);margin-top:3px"><span><strong>${esc(t.title||'')}</strong> <span style="font-size:11px;color:var(--t3);background:var(--s3);padding:1px 5px;border-radius:8px;margin-left:4px">${esc(t.priority||'Medium')}</span></span></label>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-p" onclick="_applyAIProjectTasks(${id})">Add Selected</button>
        <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      </div>`;
    window._aiProjTaskList=arr;window._aiProjTaskId=id;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast('AI suggest failed: '+(e.message||e));}
}
function _applyAIProjectTasks(id){
  const p=D.projects.find(x=>x.id===id);if(!p)return;
  const arr=window._aiProjTaskList||[];
  const picks=[...document.querySelectorAll('#ai-proj-task-list input[type=checkbox]')]
    .filter(cb=>cb.checked).map(cb=>arr[Number(cb.dataset.idx)]).filter(Boolean);
  let nextId=window.nextId(D.tasks);
  picks.forEach(t=>{
    D.tasks.push({id:nextId++,title:t.title,priority:t.priority||'Medium',status:'Not Started',
      project:p.name,projectId:p.id,createdBy:D.creds.userName||'',
      assignedTo:D.creds.userName||'',tags:[],subtasks:[]});
  });
  save('tasks');closeModal();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast('✓ Added '+picks.length+' task'+(picks.length===1?'':'s'));
}

function aiSuggestDelegate(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  const members=D.teams.flatMap(tm=>tm.members);
  if(!members.length){toast('No team members found');return;}
  // Score each member by role/skill match with task tags and context
  const taskText=(t.title+' '+(t.notes||'')+' '+(t.tags||[]).join(' ')).toLowerCase();
  const scored=members.map(m=>{
    const roleText=(m.role||'').toLowerCase();
    const nameText=(m.name||'').toLowerCase();
    // Check workload: count tasks assigned to this member
    const workload=D.tasks.filter(x=>x.assignedTo===m.name&&x.status!=='Done').length;
    // Skill match: count keyword overlaps
    const roleWords=roleText.split(/\s+/);
    const matches=roleWords.filter(w=>w.length>3&&taskText.includes(w)).length;
    const score=matches*10 - workload*2;
    return{m,score,workload,matches};
  }).sort((a,b)=>b.score-a.score);
  const top=scored.slice(0,3);
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🤖 AI Delegation Suggestion</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Task: <strong>${esc(t.title)}</strong></div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Recommended based on role match and current workload:</div>
  ${top.map(({m:member,score,workload,matches})=>`<div style="padding:8px;margin-bottom:6px;border-radius:6px;background:var(--s2);display:flex;align-items:center;gap:10px">
    <div style="width:32px;height:32px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${member.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
    <div style="flex:1"><div style="font-size:12px;font-weight:600">${esc(member.name)}</div><div style="font-size:11px;color:var(--t3)">${esc(member.role)} · ${workload} active task${workload!==1?'s':''} · ${matches} keyword match${matches!==1?'es':''}</div></div>
    <button class="btn btn-p" style="height:26px;font-size:11px" onclick="D.tasks.find(x=>x.id===${id}).assignedTo='${_jsAttr(member.name)}';save('tasks');renderScreen(curScreen);closeModal();toast('✓ Delegated to ${member.name}')">Assign</button>
  </div>`).join('')}
  <button class="btn btn-s" style="margin-top:8px" onclick="closeModal()">Cancel</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiUnblockTask(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  const blockerTitle=t.blockedBy?D.tasks.find(x=>x.id===t.blockedBy)?.title||'unknown task':'unknown blocker';
  const suggestions=[
    'Schedule a 15-minute sync with the task owner to clarify requirements',
    'Break the dependency: identify which parts of this task can proceed independently',
    'Escalate to your manager with a clear decision request and deadline',
    'Document the blocker in the task notes and set a follow-up reminder for tomorrow',
    'Find an alternative approach that does not depend on the blocking item',
    'Reassign the blocking task to someone with available capacity',
  ];
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔓 AI Unblock Suggestions</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:4px">Blocked task: <strong>${esc(t.title)}</strong></div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Blocked by: <em>${esc(blockerTitle)}</em></div>
  <div style="max-height:240px;overflow-y:auto">${suggestions.map((s,i)=>`<div style="padding:7px 10px;margin-bottom:5px;border-radius:6px;background:var(--s2);font-size:12px;display:flex;gap:8px;align-items:flex-start"><span style="color:var(--ac);font-weight:700;flex-shrink:0">${i+1}.</span><span>${esc(s)}</span></div>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="const task=D.tasks.find(x=>x.id===${id});if(task){task.blockedBy=null;task.status='Not Started';save('tasks');renderScreen(curScreen);closeModal();toast('🔓 Task unblocked!')}">Mark as Unblocked</button>
  <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function togglePin(type,id){
  if(!D.prefs.pinned)D.prefs.pinned=[];
  const idx=D.prefs.pinned.findIndex(p=>p.type===type&&p.id===id);
  if(idx>=0){D.prefs.pinned.splice(idx,1);toast('📌 Unpinned');}
  else{D.prefs.pinned.push({type,id});toast('📌 Pinned to Home');}
  save('prefs');
  if(curScreen==='home')renderScreen('home');
}
// A: row-action overflow popover toggle
function _closeAllRowActs(){document.querySelectorAll('.lr-row-acts-pop.show').forEach(el=>el.classList.remove('show'));}
function _taskRowMoreToggle(e,id){
  const pop=document.getElementById('lr-row-acts-'+id);
  if(!pop)return;
  const wasOpen=pop.classList.contains('show');
  _closeAllRowActs();
  if(!wasOpen){pop.classList.add('show');setTimeout(()=>document.addEventListener('click',_closeAllRowActs,{once:true}),0);}
}
// L: snooze submenu — popover with tomorrow / Mon / next week / custom
function _taskSnoozePopover(e,id){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  // Close any existing popover.
  const old=document.getElementById('task-snooze-pop');if(old)old.remove();
  const r=e.currentTarget.getBoundingClientRect();
  const today=new Date();today.setHours(0,0,0,0);
  const opts=[];
  const fmt=d=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  const iso=d=>_ymd(d);
  const tomorrow=_pd(today);tomorrow.setDate(today.getDate()+1);
  opts.push({label:`Tomorrow · ${fmt(tomorrow)}`,iso:iso(tomorrow)});
  // Next Monday (or following Mon if today IS Mon)
  const nextMon=_pd(today);const dow=nextMon.getDay();const addDays=dow===1?7:((1-dow+7)%7||7);nextMon.setDate(today.getDate()+addDays);
  opts.push({label:`Next Monday · ${fmt(nextMon)}`,iso:iso(nextMon)});
  const nextWeek=_pd(today);nextWeek.setDate(today.getDate()+7);
  opts.push({label:`In a week · ${fmt(nextWeek)}`,iso:iso(nextWeek)});
  const inMonth=_pd(today);inMonth.setMonth(today.getMonth()+1);
  opts.push({label:`In a month · ${fmt(inMonth)}`,iso:iso(inMonth)});
  const pop=document.createElement('div');
  pop.id='task-snooze-pop';
  pop.className='lu-pill-pop';
  pop.style.left=Math.min(window.innerWidth-220,r.left)+'px';
  pop.style.top=(r.bottom+6)+'px';
  pop.innerHTML=opts.map(o=>`<button data-iso="${o.iso}">⏰ ${esc(o.label)}</button>`).join('')+`<div style="height:1px;background:var(--bd1);margin:3px 2px"></div><button data-custom="1">📅 Pick a date…</button>`;
  document.body.appendChild(pop);
  pop.querySelectorAll('button').forEach(b=>{
    b.onclick=ev=>{
      ev.stopPropagation();
      let ds=b.dataset.iso||'';
      if(b.dataset.custom){ds=prompt('Snooze until (YYYY-MM-DD):',iso(tomorrow))||'';if(!/^\d{4}-\d{2}-\d{2}$/.test(ds))return;}
      t.myDay=false;t.snoozeUntil=ds;
      t.due=t.due&&t.due!=='Carry Over'?ds:ds;
      save('tasks');
      pop.remove();
      if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();
      toast(`💭 Snoozed until ${ds}`);
    };
  });
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
}
// E: inline picker for priority + status pills
function _taskPillPicker(e,id,field){
  const t=D.tasks.find(x=>x.id===id);if(!t)return;
  const old=document.getElementById('task-pill-pop');if(old)old.remove();
  const r=e.currentTarget.getBoundingClientRect();
  const opts=field==='priority'?['High','Medium','Low']:TASK_STATUSES;
  const pop=document.createElement('div');
  pop.id='task-pill-pop';pop.className='lu-pill-pop';
  pop.style.left=Math.min(window.innerWidth-150,r.left)+'px';
  pop.style.top=(r.bottom+6)+'px';
  pop.innerHTML=opts.map(o=>`<button data-v="${esc(o)}" ${t[field]===o?'style="background:var(--acs);color:var(--ac)"':''}>${esc(o)}</button>`).join('');
  document.body.appendChild(pop);
  pop.querySelectorAll('button').forEach(b=>{
    b.onclick=ev=>{
      ev.stopPropagation();
      if(field==='status')setTaskStatus(t,b.dataset.v,{noSave:true});else t[field]=b.dataset.v;
      save('tasks');pop.remove();
      if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();
      toast(`${field==='priority'?'⚡':'🏷'} ${field} set to ${b.dataset.v}`);
    };
  });
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
}
// G: smart quick-add parser. Returns {title, priority, due, tags, project, est}
// from "Buy milk !high tomorrow #shopping @groceries ~30m" style input.
function _taskSmartParse(raw){
  let s=' '+raw+' ';
  const out={title:'',priority:null,due:null,tags:[],project:null,est:null};
  // Priority: !high / !med / !medium / !low
  const pm=s.match(/\s!(high|hi|med|medium|low)\b/i);
  if(pm){out.priority={hi:'High',high:'High',med:'Medium',medium:'Medium',low:'Low'}[pm[1].toLowerCase()];s=s.replace(pm[0],' ');}
  // Date keywords + ISO date
  const today=new Date();today.setHours(0,0,0,0);
  const iso=d=>_ymd(d);
  // Full words (today, tomorrow, friday…) count anywhere except as a
  // possessive ("tomorrow's launch"). Short forms are also ordinary words
  // ("Call Tom re budget", "sat", "wed"), so they count only at the end
  // of the line (before any #tag @project ~est !pri) or after
  // due / on / by / next / this. "tod" and "tom" are gone.
  const dateKeywords={today:0,tomorrow:1,tmrw:1,'next week':7,nextweek:7};
  const weekdayFull={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
  const weekdayShort={sun:0,mon:1,tue:2,tues:2,wed:3,thu:4,thur:4,thurs:4,fri:5,sat:6};
  const TAILTOK="(?=(?:\\s+[#@~!]\\S*)*\\s*$)";
  const anywhere=kw=>new RegExp("\\s(?:(?:due|on|by)\\s+)?"+kw.replace(' ','\\s+')+"\\b(?!['’])",'i');
  const placed=kw=>new RegExp("\\s(?:due|on|by|next|this)\\s+"+kw+"\\b(?!['’])|\\s"+kw+"\\b"+TAILTOK,'i');
  const nextWd=wd=>{const d=_pd(today);let diff=wd-d.getDay();if(diff<=0)diff+=7;d.setDate(today.getDate()+diff);return iso(d);};
  for(const [kw,offset] of Object.entries(dateKeywords)){
    const re=anywhere(kw);
    if(re.test(s)){const d=_pd(today);d.setDate(today.getDate()+offset);out.due=iso(d);s=s.replace(re,' ');break;}
  }
  for(const [table,mk] of [[weekdayFull,anywhere],[weekdayShort,placed]]){
    if(out.due)break;
    for(const [name,wd] of Object.entries(table)){
      const re=mk(name);
      if(re.test(s)){out.due=nextWd(wd);s=s.replace(re,' ');break;}
    }
  }
  const dm=s.match(/\s(\d{4}-\d{2}-\d{2})\b/);if(dm){out.due=dm[1];s=s.replace(dm[0],' ');}
  // Tags: #word
  const tagMatches=[...s.matchAll(/\s#([\w-]+)/g)];
  tagMatches.forEach(m=>out.tags.push(m[1]));
  s=s.replace(/\s#[\w-]+/g,' ');
  // Project: @word
  const pjm=s.match(/\s@([\w-]+)/);
  if(pjm){out.project=pjm[1];s=s.replace(pjm[0],' ');}
  // Estimated minutes: ~30m / ~2h
  const em=s.match(/\s~(\d+)(m|h)\b/i);
  if(em){out.est=em[2].toLowerCase()==='h'?Number(em[1])*60:Number(em[1]);s=s.replace(em[0],' ');}
  out.title=s.trim().replace(/\s+/g,' ');
  return out;
}
// F: keyboard navigation on Tasks screen
let _taskKbSelectedId=null;
function _tasksKbHandler(e){
  if(typeof curScreen==='undefined'||curScreen!=='tasks')return;
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  // Visible task rows: cluster taskRow has no data-task-id directly; we look at any [data-task-id]
  const visible=Array.from(document.querySelectorAll('#tasks-list [data-task-id]'));
  if(!visible.length)return;
  let idx=visible.findIndex(el=>Number(el.dataset.taskId)===_taskKbSelectedId);
  const sel=()=>{
    const el=visible[idx];if(!el)return;
    visible.forEach(v=>v.classList.remove('lr-kb-on','tl-kb-on'));
    el.classList.add(el.classList.contains('tl-row')?'tl-kb-on':'lr-kb-on');
    _taskKbSelectedId=Number(el.dataset.taskId);
    el.scrollIntoView({block:'nearest'});
  };
  if(e.key==='j'||e.key==='ArrowDown'){idx=Math.min(visible.length-1,(idx<0?0:idx+1));sel();e.preventDefault();}
  else if(e.key==='k'||e.key==='ArrowUp'){idx=Math.max(0,(idx<0?0:idx-1));sel();e.preventDefault();}
  else if(e.key==='Enter'&&_taskKbSelectedId){const tt=D.tasks.find(x=>x.id===_taskKbSelectedId);if(tt)openDrawer('task',tt);e.preventDefault();}
  else if(e.key==='c'&&_taskKbSelectedId){toggleTask(_taskKbSelectedId);setTimeout(renderCurrentTaskView,80);e.preventDefault();}
  else if(e.key==='x'&&_taskKbSelectedId){if(typeof toggleBulkSelect==='function'&&_bulkMode){toggleBulkSelect(_taskKbSelectedId,e);}else if(typeof toggleBulkMode==='function'){toggleBulkMode();setTimeout(()=>toggleBulkSelect(_taskKbSelectedId,e),50);}e.preventDefault();}
  else if(e.key==='e'&&_taskKbSelectedId){const tt=D.tasks.find(x=>x.id===_taskKbSelectedId);if(tt)openDrawer('task',tt);e.preventDefault();}
}
document.addEventListener('keydown',_tasksKbHandler);
// C: saved task views — capture current filter as a named view
function _currentTaskViewState(){
  const tabIdx=_taskTabDefs.findIndex(td=>td.filter===_taskFilter);
  return {tabIdx:tabIdx>=0?tabIdx:0,priority:_taskPriorityFilter||'All',myOnly:!!_taskMyOnly,view:_taskView};
}
function saveCurrentTaskView(){
  const name=prompt('Name this view:','My view');
  if(!name||!name.trim())return;
  D.prefs=D.prefs||{};
  D.prefs.taskSavedViews=D.prefs.taskSavedViews||[];
  D.prefs.taskSavedViews.push({id:Date.now(),name:name.trim(),state:_currentTaskViewState()});
  save('prefs');
  if(typeof renderTasks==='function')renderTasks();
  toast({type:'success',title:'⭐ View saved',msg:`"${name.trim()}" added to your tabs.`,duration:2200});
}
function applySavedTaskView(id){
  const v=(D.prefs&&D.prefs.taskSavedViews||[]).find(x=>x.id===id);if(!v)return;
  const s=v.state||{};
  if(typeof s.tabIdx==='number'&&_taskTabDefs[s.tabIdx])_taskFilter=_taskTabDefs[s.tabIdx].filter;
  _taskPriorityFilter=s.priority||'All';
  _taskMyOnly=!!s.myOnly;
  if(s.view)_taskView=s.view;
  if(typeof renderTasks==='function')renderTasks();
}
function deleteSavedTaskView(id,e){
  if(e){e.stopPropagation();}
  if(!confirm('Delete this saved view?'))return;
  D.prefs.taskSavedViews=(D.prefs.taskSavedViews||[]).filter(v=>v.id!==id);
  save('prefs');
  if(typeof renderTasks==='function')renderTasks();
}
// N: AI Today's Plan — ranks the current Today set into a suggested order
// ─── AI PRODUCTIVITY ENGINE ─────────────────────────────────────────────────
// Capacity check + smart scheduler + manual time blocker. Turns LevelUp from
// a cockpit (showing reality) into an active scheduling assistant.

// Working hours (24h). Configurable via Settings → General → Working Hours.
//   D.prefs.workingHours       = {start, end}                — default window
//   D.prefs.workingHoursByDow  = {0:{start,end}, 1:{…}, …}   — per-day overrides
// _workingHours(dateObj?) resolves the right window for the given date:
//   1. Per-day override for that DOW (0=Sun … 6=Sat) when present
//   2. Default workingHours
//   3. Hard-coded 9-17 (8h) when neither is set
// A per-day entry of {start:N,end:N} or {nonWorking:true} means "no working
// hours on this day" — capacity check returns 0 free mins and the scheduler
// treats it as fully booked.
function _workingHours(dateObj){
  const def=(D.prefs&&D.prefs.workingHours)||{};
  const byDow=(D.prefs&&D.prefs.workingHoursByDow)||{};
  let cfg=def;
  if(dateObj){
    const dow=dateObj.getDay(); // 0=Sun..6=Sat
    if(byDow[dow])cfg=byDow[dow];
  }
  if(cfg&&cfg.nonWorking)return {start:0,end:0,nonWorking:true};
  const start=Number.isFinite(cfg&&cfg.start)?cfg.start:(Number.isFinite(def.start)?def.start:9);
  const end=Number.isFinite(cfg&&cfg.end)?cfg.end:(Number.isFinite(def.end)?def.end:17);
  return {start,end};
}
// Save handlers for the Settings → Working Hours panel.
function _saveWorkingHoursDefault(){
  const startEl=document.getElementById('gen-wh-start');
  const endEl=document.getElementById('gen-wh-end');
  if(!startEl||!endEl)return;
  let s=parseInt(startEl.value,10),e=parseInt(endEl.value,10);
  if(!Number.isFinite(s))s=9;if(!Number.isFinite(e))e=17;
  if(e<=s)e=s+1; // guard against inverted range
  D.prefs=D.prefs||{};
  D.prefs.workingHours={start:s,end:e};
  saveAll();
  // Re-render the override grid (default-day chips reflect the new default).
  const grid=document.getElementById('gen-wh-dow');
  if(grid)grid.innerHTML=_renderDowOverrideGrid();
  toast({type:'success',title:`⏰ Working hours: ${String(s).padStart(2,'0')}:00 – ${String(e).padStart(2,'0')}:00`,duration:1800});
}
function _renderDowOverrideGrid(){
  const byDow=(D.prefs&&D.prefs.workingHoursByDow)||{};
  const dowNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return dowNames.map((nm,dow)=>{
    const o=byDow[dow];
    const isOverride=!!o;
    const isOff=o&&o.nonWorking;
    const label=isOff?'OFF':isOverride?`${String(o.start).padStart(2,'0')}–${String(o.end).padStart(2,'0')}`:'default';
    const color=isOff?'#ef4444':isOverride?'#3b82f6':'var(--t3)';
    return `<button class="btn btn-s" style="height:auto;padding:6px 4px;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:2px;border-color:${isOverride?color:'var(--bd2)'};color:${color}" onclick="_openDowOverride(${dow})" title="Click to set working hours for ${nm}"><span style="font-weight:600">${nm}</span><span style="font-size:11px">${label}</span></button>`;
  }).join('');
}
function _openDowOverride(dow){
  const byDow=(D.prefs&&D.prefs.workingHoursByDow)||{};
  const cur=byDow[dow]||{};
  const startNow=Number.isFinite(cur.start)?cur.start:'';
  const endNow=Number.isFinite(cur.end)?cur.end:'';
  const isOff=!!cur.nonWorking;
  const m=document.getElementById('modal-content');
  if(!m){toast({type:'warn',title:'Modal not available'});return;}
  const dowName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
  m.innerHTML=`<div style="padding:16px;max-width:380px">
    <h2 style="font-size:14px;font-weight:650;margin:0 0 6px">⏰ ${esc(dowName)} working hours</h2>
    <p style="font-size:11px;color:var(--t3);margin:0 0 12px">Override the default window for this day, or mark it non-working (no capacity, no AI-scheduled blocks).</p>
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <select class="inp" id="wh-dow-start" style="width:90px;font-size:12px" ${isOff?'disabled':''}>
        ${Array.from({length:24},(_,h)=>`<option value="${h}" ${startNow===h?'selected':''}>${String(h).padStart(2,'0')}:00</option>`).join('')}
      </select>
      <span style="color:var(--t3)">→</span>
      <select class="inp" id="wh-dow-end" style="width:90px;font-size:12px" ${isOff?'disabled':''}>
        ${Array.from({length:24},(_,h)=>{const v=h+1;return `<option value="${v}" ${endNow===v?'selected':''}>${String(v).padStart(2,'0')}:00</option>`;}).join('')}
      </select>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--t2);cursor:pointer;margin-bottom:14px">
      <input type="checkbox" id="wh-dow-off" ${isOff?'checked':''} onchange="document.getElementById('wh-dow-start').disabled=this.checked;document.getElementById('wh-dow-end').disabled=this.checked">
      Non-working day (e.g. weekend)
    </label>
    <div style="display:flex;gap:6px;justify-content:flex-end;padding-top:10px;border-top:1px solid var(--bd1)">
      <button class="btn btn-d" onclick="_saveDowOverride(${dow},'clear')" title="Drop the override — fall back to default hours">✕ Clear override</button>
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_saveDowOverride(${dow},'save')">Save</button>
    </div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _saveDowOverride(dow,action){
  D.prefs=D.prefs||{};
  D.prefs.workingHoursByDow=D.prefs.workingHoursByDow||{};
  if(action==='clear'){
    delete D.prefs.workingHoursByDow[dow];
  } else {
    const off=document.getElementById('wh-dow-off')&&document.getElementById('wh-dow-off').checked;
    if(off){
      D.prefs.workingHoursByDow[dow]={nonWorking:true};
    } else {
      let s=parseInt(document.getElementById('wh-dow-start').value,10);
      let e=parseInt(document.getElementById('wh-dow-end').value,10);
      if(!Number.isFinite(s))s=9;if(!Number.isFinite(e))e=17;
      if(e<=s)e=s+1;
      D.prefs.workingHoursByDow[dow]={start:s,end:e};
    }
  }
  saveAll();
  closeModal();
  const grid=document.getElementById('gen-wh-dow');
  if(grid)grid.innerHTML=_renderDowOverrideGrid();
}
function _applyWorkingHoursPreset(name){
  D.prefs=D.prefs||{};
  if(name==='clear-overrides'){
    D.prefs.workingHoursByDow={};
  } else if(name==='weekdays-only'){
    D.prefs.workingHoursByDow=D.prefs.workingHoursByDow||{};
    D.prefs.workingHoursByDow[0]={nonWorking:true}; // Sun
    D.prefs.workingHoursByDow[6]={nonWorking:true}; // Sat
    delete D.prefs.workingHoursByDow[1];delete D.prefs.workingHoursByDow[2];
    delete D.prefs.workingHoursByDow[3];delete D.prefs.workingHoursByDow[4];
    delete D.prefs.workingHoursByDow[5];
  }
  saveAll();
  const grid=document.getElementById('gen-wh-dow');
  if(grid)grid.innerHTML=_renderDowOverrideGrid();
  toast({type:'success',title:name==='weekdays-only'?'⏰ Weekends marked non-working':'⏰ Per-day overrides cleared',duration:1800});
}

/**
 * Compute today's (or any day's) capacity check:
 *   plannedMins  — sum of estimatedMins across tasks targeted at that day
 *                  (myDay flag OR due===date OR startDate===date).
 *   bookedMins   — sum of calendar-event durations within working hours.
 *   freeMins     — working hours total − bookedMins.
 *   deltaMins    — plannedMins − freeMins (positive = over capacity).
 *   focusMins    — already-logged focus minutes today (D.prefs.focusLog).
 * Used by the capacity indicator + the smart-scheduler prompt.
 */
function _dayCapacityCheck(dateObj){
  const d=dateObj||new Date();
  const ds=_ymd(d);
  // Resolve hours per the date's day-of-week — honours per-day overrides
  // (weekends, shortened Fridays, etc.).
  const wh=_workingHours(d);
  const wsH=wh.start,weH=wh.end;
  const workingMins=wh.nonWorking?0:Math.max(0,(weH-wsH))*60;
  const isToday=ds===_todayStr;
  // Tasks targeted at the day. For "today" we include myDay; for other days
  // we restrict to explicit due/startDate hits.
  const tasks=(D.tasks||[]).filter(t=>{
    if(t.status==='Done'||t.status==='Someday')return false;
    if(t.parentTaskId)return false; // subtasks roll into parents
    if(isToday&&t.myDay)return true;
    return t.due===ds||t.startDate===ds;
  });
  const plannedMins=tasks.reduce((s,t)=>s+(Number(t.estimatedMins)||30),0);
  // Calendar events for the day, intersected with working hours.
  const events=(typeof _calEventsOn==='function')?_calEventsOn(d):[];
  let bookedMins=0;
  for(const e of events){
    const h=typeof e.hour==='number'?e.hour:null;
    if(h==null)continue;
    const eh=typeof e.endHour==='number'?e.endHour:h+1;
    const overlapStart=Math.max(h,wsH);
    const overlapEnd=Math.min(eh,weH);
    if(overlapEnd>overlapStart)bookedMins+=(overlapEnd-overlapStart)*60;
  }
  const freeMins=Math.max(0,workingMins-bookedMins);
  const deltaMins=plannedMins-freeMins;
  const focusMins=Number((D.prefs&&D.prefs.focusLog&&D.prefs.focusLog[ds])||0);
  return {
    date:ds,
    workingHoursStart:wsH,workingHoursEnd:weH,
    workingMins,bookedMins,freeMins,
    plannedMins,deltaMins,
    taskCount:tasks.length,eventCount:events.length,
    focusMins,
    tasks,events,
  };
}

// Compact "Xh Ym" formatter for capacity numbers.
function _fmtHm(mins){
  const m=Math.max(0,Math.round(mins));
  if(m<60)return m+'m';
  const h=Math.floor(m/60),r=m%60;
  return r?(h+'h '+r+'m'):(h+'h');
}

/**
 * Render a one-line capacity indicator that drops anywhere. Color codes:
 *   green  = under capacity (>15min buffer)
 *   amber  = right at edge (±15min)
 *   red    = over capacity
 * Click the bar to expand into a longer explanation (today's events + plan).
 */
function _renderCapacityIndicator(check, opts){
  const c=check||_dayCapacityCheck();
  const compact=opts&&opts.compact;
  const color=c.deltaMins>15?'#ef4444':c.deltaMins<-15?'#10b981':'#f59e0b';
  const verdict=c.deltaMins>15?`over by ${_fmtHm(c.deltaMins)}`:c.deltaMins<-15?`${_fmtHm(-c.deltaMins)} buffer`:'balanced';
  const planned=_fmtHm(c.plannedMins);
  const free=_fmtHm(c.freeMins);
  // Bar visualises planned vs available. Cap planned at 1.5× free for sane bar widths.
  const barMax=Math.max(c.freeMins,1);
  const fillPct=Math.min(150,Math.round(c.plannedMins/barMax*100));
  if(compact){
    return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--t2)" title="${c.taskCount} task${c.taskCount===1?'':'s'} (${planned}) vs ${free} free in working hours">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
      <strong style="color:${color}">${planned} planned</strong> · ${free} free · ${verdict}
    </span>`;
  }
  return `<div class="cd" style="padding:11px 14px;border-left:3px solid ${color};margin-bottom:10px;cursor:pointer" onclick="_openCapacityDetail()" title="Click for details">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div style="font-size:12px;font-weight:600">${_icon('barChart',16,'currentColor')} Today's Capacity</div>
      <div style="font-size:11px;color:${color};font-weight:600">${verdict}</div>
    </div>
    <div style="display:flex;gap:14px;font-size:11px;color:var(--t2);margin-top:6px;flex-wrap:wrap">
      <span>📋 <strong style="color:var(--t1)">${planned}</strong> planned (${c.taskCount} task${c.taskCount===1?'':'s'})</span>
      <span>📅 <strong style="color:var(--t1)">${_fmtHm(c.bookedMins)}</strong> booked (${c.eventCount} event${c.eventCount===1?'':'s'})</span>
      <span>⏱ <strong style="color:var(--t1)">${free}</strong> free of ${_fmtHm(c.workingMins)} working hours</span>
    </div>
    <div style="height:7px;background:var(--s3);border-radius:4px;overflow:hidden;margin-top:7px;position:relative">
      <div style="height:100%;width:${Math.min(100,fillPct)}%;background:${color};border-radius:4px"></div>
      ${fillPct>100?`<div style="position:absolute;top:0;right:0;height:100%;width:${Math.min(50,fillPct-100)}%;background:repeating-linear-gradient(45deg,${color},${color} 4px,color-mix(in srgb,${color} 50%,transparent) 4px,color-mix(in srgb,${color} 50%,transparent) 8px);border-radius:0 4px 4px 0"></div>`:''}
    </div>
  </div>`;
}

function _openCapacityDetail(){
  const c=_dayCapacityCheck();
  const m=document.getElementById('modal-content');
  if(!m)return;
  const tasksList=c.tasks.length?c.tasks.map(t=>`<li style="font-size:11px;color:var(--t1);padding:4px 0;display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title||'')}</span><span style="color:var(--t3);font-size:11px;flex-shrink:0">${_fmtHm(t.estimatedMins||30)}</span></li>`).join(''):'<li style="font-size:11px;color:var(--t3);font-style:italic">No tasks for today.</li>';
  const eventsList=c.events.length?c.events.map(e=>`<li style="font-size:11px;color:var(--t1);padding:4px 0;display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title||'(untitled)')}</span><span style="color:var(--t3);font-size:11px;flex-shrink:0">${String(e.hour||0).padStart(2,'0')}:00 – ${String(e.endHour||e.hour+1).padStart(2,'0')}:00</span></li>`).join(''):'<li style="font-size:11px;color:var(--t3);font-style:italic">No calendar events today.</li>';
  m.innerHTML=`<div style="padding:14px 16px;max-width:560px">
    <h2 style="font-size:14px;font-weight:650;margin:0 0 4px">📊 Capacity for ${esc(new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}))}</h2>
    <p style="font-size:11px;color:var(--t3);margin:0 0 12px">Working hours: ${c.workingHoursStart}:00 – ${c.workingHoursEnd}:00 (${_fmtHm(c.workingMins)}). Adjust in Settings → General.</p>
    ${_renderCapacityIndicator(c)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
      <div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">📋 Tasks (${c.tasks.length})</div><ul style="margin:0;padding:0;list-style:none">${tasksList}</ul></div>
      <div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">📅 Events (${c.events.length})</div><ul style="margin:0;padding:0;list-style:none">${eventsList}</ul></div>
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px;padding-top:10px;border-top:1px solid var(--bd1)">
      <button class="btn btn-s" onclick="closeModal();aiSmartSchedule()" style="color:var(--purp);border-color:var(--purp)">🧠 AI Smart Plan</button>
      <button class="btn btn-p" onclick="closeModal()">Close</button>
    </div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

/**
 * AI Smart Scheduler. Inputs:
 *   - today's open tasks targeted at today (myDay, due, startDate)
 *   - today's calendar events
 *   - D.prefs.focusByHour peak-hour productivity data
 *   - per-task energy field (high/medium/low)
 *   - working hours
 * Output: a time-blocked schedule [{taskId, startHour, durationMins, reason}]
 * + an "unscheduled" list with reasons (over capacity, no estimate, etc.).
 *
 * Caches latest schedule on D.prefs.todaySchedule so re-opening the modal
 * shows the prior plan without spending another AI call. The "Apply to
 * Calendar" button creates _calEvents entries linked to each task.
 */
async function aiSmartSchedule(opts){
  const force=opts&&opts.force;
  const cached=(D.prefs&&D.prefs.todaySchedule);
  const cacheFresh=cached&&cached.date===_todayStr;
  if(cacheFresh&&!force){
    return _renderSmartScheduleModal(cached);
  }
  const m=document.getElementById('modal-content');
  if(!m){toast({type:'warn',title:'Modal not available'});return;}
  const {provider,configured}=_getAIConfig?_getAIConfig():{};
  if(!configured){toast({type:'warn',title:'AI key missing',msg:'Add a provider key in Settings → AI Features.'});return;}
  const c=_dayCapacityCheck();
  if(!c.taskCount){toast({type:'info',title:'No tasks set for today',msg:'Add some via My Day → Plan or set a due date for today.'});return;}
  m.innerHTML=`<div style="padding:14px 16px;max-width:520px">
    <div style="font-size:14px;font-weight:650;margin-bottom:6px">🧠 AI is planning your day…</div>
    <div style="font-size:11px;color:var(--t3);line-height:1.55">Slotting ${c.taskCount} task${c.taskCount===1?'':'s'} (${_fmtHm(c.plannedMins)}) around ${c.eventCount} calendar event${c.eventCount===1?'':'s'}, biasing toward your peak-hour focus data. Usually takes ~10s.</div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  try{
    // Build the snapshot. Tasks first.
    const snapshotTasks=c.tasks.map((t,i)=>({
      taskId:String(t.id),
      title:(t.title||'').slice(0,160),
      estimatedMins:Number(t.estimatedMins)||30,
      priority:t.priority||'Medium',
      energy:t.energy||null, // high/medium/low if set
      due:t.due||null,
      project:(t.projectId&&(D.projects||[]).find(p=>p.id===t.projectId)||{}).name||t.project||null,
      idx:i,
    }));
    // Calendar events as fixed obstacles.
    const snapshotEvents=c.events.map(e=>({
      title:(e.title||'event').slice(0,80),
      startHour:typeof e.hour==='number'?e.hour:0,
      endHour:typeof e.endHour==='number'?e.endHour:(e.hour||0)+1,
    }));
    // Focus-by-hour distribution (sum across past sessions). Used by AI to
    // identify "your best hours". Sort and pick top-3 peak hours.
    const focusByHour=(D.prefs&&D.prefs.focusByHour)||{};
    const peakHours=Object.entries(focusByHour).map(([h,m])=>({hour:Number(h),mins:Number(m)||0}))
      .filter(x=>Number.isFinite(x.hour)&&x.hour>=c.workingHoursStart&&x.hour<c.workingHoursEnd)
      .sort((a,b)=>b.mins-a.mins).slice(0,3).map(x=>x.hour);
    const sys=`You are a focus-scheduling coach. Build a time-blocked schedule for the user's day. Output STRICTLY one JSON object, no prose, no markdown:
{
  "blocks": [ {"taskId":"<must be from input>", "startMins": <integer 0-1440>, "durationMins": <integer>, "reason":"<one short sentence, ~12 words>"} ],
  "unscheduled": [ {"taskId":"<from input>", "reason":"<one short sentence on why it didn't fit>"} ],
  "summary": "<one sentence on the overall plan, 15-25 words>"
}
RULES:
- Working hours: ${c.workingHoursStart}:00 to ${c.workingHoursEnd}:00 (minutes ${c.workingHoursStart*60} to ${c.workingHoursEnd*60}). Never schedule outside.
- Calendar events are IMMOVABLE obstacles — schedule AROUND them, not on top of them.
- **NO TWO BLOCKS MAY OVERLAP IN TIME.** A block at startMins=600 dur=30 ends at 630; the next block must start at 635 or later (5-min buffer). This is the most important rule — verify each block's [startMins, startMins+durationMins] does not intersect any other block OR any calendar event before emitting.
- Prefer the user's peak focus hours (${peakHours.length?peakHours.join(', ')+':00':'unknown'}) for high-priority or high-energy tasks.
- Batch shallow/admin work (low energy or low priority).
- Leave a 5-minute buffer between consecutive blocks.
- Items that don't fit go to "unscheduled" with a reason — don't squeeze, don't overlap.
- startMins is minutes from midnight (e.g. 9:00 AM = 540, 14:30 = 870); durationMins respects each task's estimatedMins.
- Items in "blocks" MUST reference task IDs from the input; do not invent.`;
    const userContent=`Working hours: ${c.workingHoursStart}-${c.workingHoursEnd}. Peak hours: ${JSON.stringify(peakHours)}. Calendar events (immovable): ${JSON.stringify(snapshotEvents)}. Tasks to schedule: ${JSON.stringify(snapshotTasks)}.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent,provider:provider||'manus'},'mutation');
    const raw=String(res?.result||res?.text||'').trim();
    const m2=raw.match(/\{[\s\S]*\}/);
    if(!m2)throw new Error('AI returned no JSON');
    const plan=JSON.parse(m2[0]);
    // Normalise block times. AI may return either startMins (preferred, new
    // schema) or startHour (legacy). Convert legacy → startMins so the rest
    // of the pipeline only sees one shape.
    const normBlocks=(Array.isArray(plan.blocks)?plan.blocks:[]).map(b=>{
      let startMins=Number(b.startMins);
      if(!Number.isFinite(startMins)){
        const sh=Number(b.startHour);
        if(Number.isFinite(sh))startMins=sh*60;
      }
      const dur=Math.max(5,Number(b.durationMins)||30);
      return {taskId:String(b.taskId||''),startMins:Math.max(0,Math.min(1440,startMins||0)),durationMins:dur,reason:String(b.reason||'')};
    }).filter(b=>b.taskId);
    // Dedup overlap: sort by startMins, drop any block whose range overlaps
    // an already-accepted block OR a calendar event. Pushed-aside blocks are
    // appended to unscheduled with an explanation so the user sees them.
    normBlocks.sort((a,b)=>a.startMins-b.startMins);
    const accepted=[];
    const dropped=[];
    const eventRanges=c.events.map(e=>{
      const h=typeof e.hour==='number'?e.hour:0;
      const eh=typeof e.endHour==='number'?e.endHour:h+1;
      return [h*60,eh*60];
    });
    const overlaps=(s,e,ranges)=>ranges.some(([rs,re])=>s<re&&e>rs);
    for(const b of normBlocks){
      const s=b.startMins,e=b.startMins+b.durationMins;
      // Reject if outside working hours, overlaps an existing event, or
      // overlaps any already-accepted block.
      if(s<c.workingHoursStart*60||e>c.workingHoursEnd*60){
        dropped.push({taskId:b.taskId,reason:'Block fell outside working hours; dropped.'});continue;
      }
      if(overlaps(s,e,eventRanges)){
        dropped.push({taskId:b.taskId,reason:'AI scheduled this on top of a calendar event; dropped.'});continue;
      }
      if(overlaps(s,e,accepted.map(a=>[a.startMins,a.startMins+a.durationMins]))){
        dropped.push({taskId:b.taskId,reason:'AI returned an overlapping slot; dropped to keep schedule clean.'});continue;
      }
      accepted.push(b);
    }
    const mergedUnsched=(Array.isArray(plan.unscheduled)?plan.unscheduled:[]).concat(dropped);
    const record={
      date:_todayStr,
      generatedAt:new Date().toISOString(),
      workingHoursStart:c.workingHoursStart,
      workingHoursEnd:c.workingHoursEnd,
      blocks:accepted,
      unscheduled:mergedUnsched,
      summary:String(plan.summary||'').trim(),
      // Snapshot of task titles so the renderer can show them without
      // re-looking-up in case a task changes.
      taskTitles:Object.fromEntries(c.tasks.map(t=>[String(t.id),t.title||''])),
    };
    D.prefs=D.prefs||{};
    D.prefs.todaySchedule=record;
    save('prefs');
    _renderSmartScheduleModal(record);
  }catch(e){
    m.innerHTML=`<div style="padding:14px 16px;max-width:520px"><div style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:6px">⚠ Smart scheduler failed</div><div style="font-size:11px;color:var(--t2);line-height:1.55">${esc(e.message||String(e))}</div><div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-s" onclick="closeModal()">Close</button></div></div>`;
  }
}
function _renderSmartScheduleModal(record){
  const m=document.getElementById('modal-content');
  if(!m||!record)return;
  const fmtMins=mins=>{const h=Math.floor(mins/60),mm=mins%60;return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');};
  // Tolerate legacy {startHour} records by upgrading them to {startMins} on the fly.
  const blocks=(record.blocks||[]).map(b=>{
    const startMins=Number.isFinite(b.startMins)?b.startMins:(Number(b.startHour)||0)*60;
    return Object.assign({},b,{startMins});
  }).sort((a,b)=>a.startMins-b.startMins);
  const blockRows=blocks.map(b=>{
    const title=(record.taskTitles&&record.taskTitles[String(b.taskId)])||'(task)';
    const dur=Number(b.durationMins)||30;
    return `<div class="lr" style="padding:8px 11px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px">
      <span style="font-size:11px;color:var(--ac);font-weight:600;min-width:96px">${fmtMins(b.startMins)} → ${fmtMins(b.startMins+dur)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--t1);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
        ${b.reason?`<div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(b.reason)}</div>`:''}
      </div>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0">${_fmtHm(dur)}</span>
    </div>`;
  }).join('')||'<div style="padding:14px;text-align:center;color:var(--t3);font-size:12px">No blocks scheduled.</div>';
  const unschedRows=(record.unscheduled||[]).slice(0,6).map(u=>{
    const title=(record.taskTitles&&record.taskTitles[String(u.taskId)])||'(task)';
    return `<div style="font-size:11px;padding:5px 8px;background:var(--s3);border-radius:4px;margin-bottom:4px"><strong>${esc(title)}</strong> — <span style="color:var(--t3)">${esc(u.reason||'no slot available')}</span></div>`;
  }).join('');
  const ago=_relTime(record.generatedAt);
  m.innerHTML=`<div style="padding:16px;max-width:640px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <h2 style="font-size:15px;font-weight:650;margin:0">${_icon('brain',16,'currentColor')} Today's Plan</h2>
      <span style="font-size:11px;color:var(--t3)">Generated ${esc(ago)}</span>
    </div>
    ${record.summary?`<div style="font-size:13px;color:var(--t1);font-style:italic;padding:9px 11px;background:color-mix(in srgb,var(--ac) 10%,transparent);border-left:3px solid var(--ac);border-radius:4px;margin-bottom:10px">"${esc(record.summary)}"</div>`:''}
    <div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px">⏱ Time-blocked schedule (${blocks.length} block${blocks.length===1?'':'s'})</div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;overflow:hidden">${blockRows}</div>
    ${unschedRows?`<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 4px">📥 Couldn't fit (${(record.unscheduled||[]).length})</div>${unschedRows}`:''}
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px;padding-top:10px;border-top:1px solid var(--bd1);flex-wrap:wrap">
      <button class="btn btn-s" onclick="aiSmartSchedule({force:true})" title="Regenerate with current data">↻ Refresh</button>
      <button class="btn btn-s" onclick="_copyScheduleToClipboard()" title="Copy as markdown">📋 Copy</button>
      <button class="btn btn-p" style="background:var(--ac)" onclick="_applyScheduleToCalendar()" title="Add blocks to LevelUp's local calendar">📅 Apply to Calendar</button>
      <button class="btn btn-s" style="color:#9333ea;border-color:#9333ea" onclick="_pushScheduleToOAuthCalendar()" title="Create matching events in your connected Outlook / Google calendar">📤 Push to Outlook</button>
      <button class="btn btn-s" onclick="closeModal()">Close</button>
    </div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
async function _pushScheduleToOAuthCalendar(){
  const rec=D.prefs&&D.prefs.todaySchedule;
  if(!rec||!(rec.blocks||[]).length){toast({type:'warn',title:'No blocks to push'});return;}
  // Probe which provider the user is connected to. The OAuth status query
  // says which providers are connected; pick whichever is on.
  let provider=null;
  try{
    const status=await _trpc('oauthSync.status',undefined,'query');
    // status is {microsoft:{connected}, google:{connected}} (it read
    // microsoftConnected, which never existed, so this always said "not connected").
    if(status&&status.microsoft&&status.microsoft.connected)provider='microsoft';
    else if(status&&status.google&&status.google.connected)provider='google';
  }catch(_){/* fall through */}
  if(!provider){
    toast({type:'warn',title:'No OAuth calendar connected',msg:'Settings → Accounts → connect Microsoft 365 or Google.',duration:4500});
    return;
  }
  if(!confirm(`Create ${rec.blocks.length} event(s) on your ${provider==='microsoft'?'Outlook':'Google'} calendar? Each block becomes a separate event titled "▶ <task>".`))return;
  // Build ISO strings for each block. Date is from the schedule record;
  // browser local time zone is used so the user sees the right hour in
  // their OWA / Google Calendar UI.
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const payload=rec.blocks.map(b=>{
    const dur=Number(b.durationMins)||30;
    const startMins=Number.isFinite(b.startMins)?b.startMins:(Number(b.startHour)||0)*60;
    const endMins=startMins+dur;
    const [y,mo,da]=(rec.date||_todayStr).split('-').map(Number);
    // Build local-tz date strings without UTC conversion (Graph + Google
    // accept dateTime + timeZone separately, no Z suffix).
    const pad=n=>String(n).padStart(2,'0');
    const startISO=`${y}-${pad(mo)}-${pad(da)}T${pad(Math.floor(startMins/60))}:${pad(startMins%60)}:00`;
    const endISO=`${y}-${pad(mo)}-${pad(da)}T${pad(Math.floor(endMins/60))}:${pad(endMins%60)}:00`;
    return {
      title:`▶ ${(rec.taskTitles&&rec.taskTitles[String(b.taskId)])||'Focus block'}`,
      startISO,endISO,
      linkedTaskId:String(b.taskId||''),
      body:b.reason?`${b.reason} · Scheduled by LevelUp AI`:undefined,
    };
  });
  toast({type:'info',title:`📤 Pushing ${payload.length} event${payload.length===1?'':'s'}…`,duration:2000});
  try{
    const res=await _trpc('oauthSync.createCalendarEvents',{provider,timeZone:tz,blocks:payload},'mutation');
    const ok=res&&res.okCount||0,total=res&&res.totalCount||payload.length;
    if(ok===total){
      toast({type:'success',title:`✓ ${ok} event${ok===1?'':'s'} created on ${provider==='microsoft'?'Outlook':'Google'}`,duration:3000});
    } else {
      const errs=(res&&res.created||[]).filter(c=>c.error).slice(0,3).map(c=>`• ${c.blockTitle}: ${c.error}`).join('\n');
      toast({type:'warn',title:`Pushed ${ok}/${total}`,msg:errs||'Some events failed',duration:5000});
    }
    // Mark the local schedule record so the modal can show "✉ Pushed Xm ago".
    if(rec){rec.pushedAt=new Date().toISOString();rec.pushedProvider=provider;save('prefs');}
  }catch(e){
    toast({type:'warn',title:'Push failed',msg:e.message||String(e),duration:5000});
  }
}
function _copyScheduleToClipboard(){
  const rec=D.prefs&&D.prefs.todaySchedule;
  if(!rec){toast({type:'warn',title:'No plan to copy'});return;}
  const fmt=h=>String(h).padStart(2,'0')+':00';
  const lines=[];
  lines.push(`# Today's Plan — ${rec.date}`);
  if(rec.summary){lines.push('');lines.push(`> ${rec.summary}`);}
  lines.push('');
  const fmtMins=mins=>{const h=Math.floor(mins/60),mm=mins%60;return String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0');};
  for(const b of (rec.blocks||[]).slice().map(b=>Object.assign({},b,{startMins:Number.isFinite(b.startMins)?b.startMins:(Number(b.startHour)||0)*60})).sort((a,b)=>a.startMins-b.startMins)){
    const title=(rec.taskTitles&&rec.taskTitles[String(b.taskId)])||'(task)';
    lines.push(`- **${fmtMins(b.startMins)}** (${_fmtHm(b.durationMins||30)}) — ${title}${b.reason?` _(${b.reason})_`:''}`);
  }
  if((rec.unscheduled||[]).length){
    lines.push('');
    lines.push('**Unscheduled:**');
    for(const u of rec.unscheduled){
      const title=(rec.taskTitles&&rec.taskTitles[String(u.taskId)])||'(task)';
      lines.push(`- ${title} — ${u.reason||''}`);
    }
  }
  const md=lines.join('\n');
  try{navigator.clipboard.writeText(md).then(()=>toast({type:'success',title:'Plan copied',duration:1800}),fallback);}catch(_){fallback();}
  function fallback(){const ta=document.createElement('textarea');ta.value=md;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast({type:'success',title:'Copied',duration:1600});}catch{}ta.remove();}
}
function _applyScheduleToCalendar(){
  const rec=D.prefs&&D.prefs.todaySchedule;
  if(!rec||!(rec.blocks||[]).length){toast({type:'warn',title:'No blocks to apply'});return;}
  if(!confirm(`Create ${rec.blocks.length} calendar event${rec.blocks.length===1?'':'s'} on today's calendar? Each will be linked to its source task. Existing events aren't touched.`))return;
  const ds=rec.date;
  let created=0;
  for(const b of rec.blocks){
    const title=(rec.taskTitles&&rec.taskTitles[String(b.taskId)])||'Focus block';
    const dur=Number(b.durationMins)||30;
    // Accept either schema (post-A1 startMins / legacy startHour).
    const startMins=Number.isFinite(b.startMins)?b.startMins:(Number(b.startHour)||0)*60;
    const endMins=startMins+dur;
    const startH=Math.floor(startMins/60),startM=startMins%60;
    const endH=Math.floor(endMins/60),endM=endMins%60;
    // _calEvents shape: {id,title,hour,endHour,color,dateStr,linkedTaskId?}
    _calEvents=Array.isArray(_calEvents)?_calEvents:[];
    _calEvents.push({
      id:Date.now()+Math.floor(Math.random()*1000)+created,
      title:`▶ ${title}`,
      hour:startH,
      endHour:endH+(endM?1:0), // round up to next full hour for the bar
      color:'var(--ac)',
      dateStr:ds,
      linkedTaskId:b.taskId,
      _planned:true,
    });
    // Stamp the task's startTime/endTime too so the My Day Execute list shows
    // the block in-place.
    const t=D.tasks.find(x=>String(x.id)===String(b.taskId));
    if(t){
      t.startTime=String(startH).padStart(2,'0')+':'+String(startM).padStart(2,'0');
      t.endTime=String(endH).padStart(2,'0')+':'+String(endM).padStart(2,'0');
    }
    created++;
  }
  try{_calPersist();}catch(_){}
  save('tasks');
  toast({type:'success',title:`📅 ${created} block${created===1?'':'s'} added to today's calendar`,duration:3000});
  closeModal();
  if(curScreen==='calendar'&&typeof renderCal==='function')renderCal();
  if(curScreen==='myday'&&typeof renderMyDay==='function')renderMyDay();
}

/**
 * Manual time-block picker for a single task. Shows free slots in a day's
 * working hours (today by default; any of the next two weeks, build -239);
 * click one to create a calendar event linked to the task. Busy = events,
 * other scheduled tasks and time blocks on that day, to the minute.
 */
function openTimeBlockPicker(taskId,ymd){
  const t=D.tasks.find(x=>String(x.id)===String(taskId));
  if(!t){toast({type:'warn',title:'Task not found'});return;}
  const today=_todayStr;
  const day=/^\d{4}-\d{2}-\d{2}$/.test(String(ymd||''))?String(ymd):today;
  const d=_pd(day);
  const wh=_workingHours(d);
  const dur=Number(t.estimatedMins)||30;
  // Busy intervals in minutes (all-day events and bills don't block time).
  const busy=((typeof _calEventsOn==='function')?_calEventsOn(d):[]).filter(e=>e&&!e._finBill&&!(typeof _calIsAllDay==='function'&&_calIsAllDay(e))&&!(e._task&&String(e.id)===String(t.id))&&String(e.linkedTaskId||'')!==String(t.id)).map(e=>{
    if(typeof _calEvMins==='function')return _calEvMins(e);
    const s=(Number(e.hour)||0)*60;return {s,e:(Number(e.endHour)||Number(e.hour)+1)*60};
  });
  // Today: nothing before now (rounded up to the next half hour).
  const nowM=day===today?Math.ceil((new Date().getHours()*60+new Date().getMinutes())/30)*30:0;
  const slots=[];
  if(!wh.nonWorking){
    for(let s=Math.max(wh.start*60,nowM);s+dur<=wh.end*60;s+=30){
      const e=s+dur;
      if(!busy.some(b=>s<b.e&&e>b.s))slots.push({startMins:s,endMins:e});
    }
  }
  const m=document.getElementById('modal-content');
  if(!m){toast({type:'warn',title:'Modal not available'});return;}
  const fmt=mins=>String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
  // Day chooser: today + the next 13 days.
  const days=Array.from({length:14},(_,i)=>{const x=_pd(today);x.setDate(x.getDate()+i);return x;});
  const dayChips=days.map((x,i)=>{
    const k=_ymd(x),on=k===day,off=_workingHours(x).nonWorking;
    const lbl=i===0?'Today':i===1?'Tomorrow':x.toLocaleDateString('en-US',{weekday:'short',day:'numeric'});
    return `<button class="btn btn-s" style="height:26px;font-size:11px;padding:0 8px;${on?'background:var(--acs);color:var(--ac);font-weight:700;':''}${off?'opacity:.6;':''}"${_act('openTimeBlockPicker',[t.id,k])} aria-pressed="${on}">${lbl}</button>`;
  }).join('');
  const dayLabel=day===today?'today':fmtDate(day);
  const slotButtons=slots.length?slots.slice(0,24).map(s=>`<button class="btn btn-s" style="height:30px;font-size:11px;padding:0 10px;justify-content:flex-start" onclick="_blockTaskAt(${_jsArg(taskId)},${s.startMins},${s.endMins},'${_jsAttr(day)}')">${fmt(s.startMins)} – ${fmt(s.endMins)}</button>`).join(''):`<div style="font-size:11px;color:var(--t3);font-style:italic;padding:8px">${wh.nonWorking?'Not a working day (Settings → General → Working Hours).':'No free slots fit '+_fmtHm(dur)+' '+esc(dayLabel)+'. Pick another day above, or drag the task onto the calendar.'}</div>`;
  m.innerHTML=`<div style="padding:16px;max-width:520px">
    <h2 style="font-size:14px;font-weight:650;margin:0 0 6px">⏱ Time-block "${esc((t.title||'').slice(0,80))}"</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Estimated ${_fmtHm(dur)}. Pick a day and a free slot — a linked calendar event will be created.</div>
    <div role="group" aria-label="Day" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${dayChips}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;margin-bottom:12px">${slotButtons}</div>
    <div style="display:flex;gap:6px;justify-content:flex-end;padding-top:10px;border-top:1px solid var(--bd1)">
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
    </div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _blockTaskAt(taskId,startMins,endMins,ymd){
  const t=D.tasks.find(x=>String(x.id)===String(taskId));
  if(!t)return;
  const ds=/^\d{4}-\d{2}-\d{2}$/.test(String(ymd||''))?String(ymd):_todayStr;
  const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  _calEvents=Array.isArray(_calEvents)?_calEvents:[];
  // One block per task: re-blocking moves the old one.
  for(let i=_calEvents.length-1;i>=0;i--){if(_calEvents[i]&&String(_calEvents[i].linkedTaskId||'')===String(taskId)&&_calEvents[i]._planned)_calEvents.splice(i,1);}
  _calEvents.push({
    id:Date.now()+Math.floor(Math.random()*1000),
    title:`▶ ${t.title||'Focus block'}`,
    dateStr:ds,
    hour:Math.floor(startMins/60),minute:startMins%60,
    endHour:Math.ceil(endMins/60), // the grid cell the block reaches
    start:hm(startMins),time:hm(startMins),end:hm(endMins),
    color:'var(--ac)',
    linkedTaskId:String(taskId),
    _planned:true,
  });
  try{_calPersist();}catch(_){}
  t.startTime=hm(startMins);
  t.endTime=hm(endMins);
  if(ds!==_todayStr||t.startDate)t.startDate=ds;
  if(ds===_todayStr&&!t.myDay)t.myDay=true; // blocking time today puts it in today's plan
  save('tasks');
  toast({type:'success',title:`⏱ Blocked ${ds===_todayStr?'today':fmtDate(ds)} ${t.startTime}–${t.endTime}`,duration:2400});
  closeModal();
  if(curScreen==='calendar'&&typeof renderCal==='function')renderCal();
  if(curScreen==='myday'&&typeof renderMyDay==='function')renderMyDay();
  if(curScreen==='tasks'&&typeof renderCurrentTaskView==='function')renderCurrentTaskView();
}

async function aiTodaysPlan(){
  const today=_todayStr;
  const tasks=D.tasks.filter(t=>t.status!=='Done'&&(t.due===today||t.startDate===today||t.myDay));
  if(!tasks.length){toast('Nothing on your plate today — enjoy it.');return;}
  const btn=document.getElementById('ai-today-plan-btn');if(btn){btn.disabled=true;btn.innerText='⏳ Thinking…';}
  try{
    const {provider,configured}=_getAIConfig();
    const lines=tasks.map((t,i)=>`${i+1}. [${t.priority||'Medium'}] ${t.title}${t.estimatedMins?` (~${t.estimatedMins}m)`:''}${t.energy?` energy:${t.energy}`:''}`).join('\n');
    const sys=`You are a focused productivity coach. Reorder the user's task list for today into the most effective sequence considering: deep work first when energy is high, batch shallow/admin work, finish the highest-impact item early. Reply with ONLY a numbered list of the same task titles in your suggested order, plus a one-line reason for each. No preamble.`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`My tasks for today:\n${lines}\n\nReorder them into the best sequence.`,provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim();
    // Render as a modal so the user can read + dismiss.
    const m=document.getElementById('modal-content');
    if(m){
      m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🧭 Today's Plan</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">AI-suggested order for your ${tasks.length} task${tasks.length===1?'':'s'} today.</div><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:10px;max-height:400px;overflow-y:auto;font-size:12px;line-height:1.6;white-space:pre-wrap">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()" style="font-size:11px">Close</button></div>`;
      document.getElementById('modal-capture').classList.add('show');
    }
  }catch(e){
    toast({type:'error',title:'AI plan failed',msg:String(e.message||e).slice(0,200),duration:5000});
  }finally{
    if(btn){btn.disabled=false;btn.innerText='🧭 Today\'s Plan';}
  }
}
function snoozeTask(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  const tomorrow=new Date();
  tomorrow.setDate(tomorrow.getDate()+1);
  const ds=_ymd(tomorrow);
  t.myDay=false;
  t.snoozeUntil=ds;
  t.due=t.due&&t.due!=='Carry Over'?t.due:ds;
  save('tasks');
  invalidateSearchIndex();
  if(document.getElementById('myday-main'))renderScreen('myday');
  else renderCurrentTaskView();
  toast(`💭 Snoozed until tomorrow (${tomorrow.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})})`);
}
function moveSomeday(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  if(t.status==='Someday'){
    t.status='Not Started';
    toast('📥 Moved back to Inbox');
  } else {
    t.status='Someday';
    t.myDay=false;
    toast('💤 Moved to Someday');
  }
  save('tasks');
  renderScreen(curScreen);
}
// Keep completedAt in sync with status: stamp it when a task enters Done,
// clear it when it leaves. Tasks completed before this was tracked have none.
function _syncTaskCompletedAt(t){
  if(!t)return;
  if(t.status==='Done'){if(!t.completedAt)t.completedAt=new Date().toISOString();}
  else t.completedAt='';
}
// The ONE way a task's status changes (Phase 5, build -230). Whatever control
// did it — checkbox, drawer, status pill, Board "Start", GTD, bulk, the
// opportunity/project drawers — the same bookkeeping follows: completedAt is
// stamped or cleared, a repeating task spawns its next copy, linked goals
// recalculate, and completions are logged. Each path used to skip some of
// this (no completedAt → missing from Done today / Shipped / velocity).
// Returns true when the status changed. opts.noSave lets a caller that saves
// other fields too save once.
function setTaskStatus(t,status,opts){
  if(!t||!status||t.status===status)return false;
  const wasDone=t.status==='Done',nowDone=status==='Done';
  t.status=status;
  t.updatedAt=new Date().toISOString();
  _syncTaskCompletedAt(t);
  if(nowDone&&!wasDone){
    try{_trpc('activityFeed.log',{action:'task_completed',entityType:'task',entityTitle:t.title},'mutation').catch(()=>{});}catch(_){}
    if(t.recurring&&t.recurring!=='None'&&typeof maybeSpawnRecurring==='function')maybeSpawnRecurring(t);
  }
  if(nowDone!==wasDone){
    const gids=new Set();
    (D.goals||[]).forEach(g=>{if((g.linkedTaskIds||[]).some(x=>String(x)===String(t.id)))gids.add(g.id);});
    if(t.linkedGoalId)gids.add(t.linkedGoalId);
    gids.forEach(gid=>{const g=(D.goals||[]).find(x=>String(x.id)===String(gid));if(g&&typeof autoCalcGoalPctBidirectional==='function')autoCalcGoalPctBidirectional(g);});
  }
  if(!(opts&&opts.noSave))save('tasks');
  return true;
}
function toggleTask(id){
  const t=D.tasks.find(x=>x.id===id);
  if(!t)return;
  const wasDone=t.status==='Done';
  setTaskStatus(t,wasDone?'Not Started':'Done');
  if(!wasDone){
    // Strikethrough sweep on the row, confetti on High-priority completions.
    try{
      const row=document.querySelector(`[data-task-id="${id}"]`);
      if(row){row.classList.add('done');}
      if(t.priority==='High'){spawnConfetti();}
      // Streak detection: 3+ completions in <2 min → encouraging toast.
      _trackCompletionStreak();
    }catch(_){}
  }
  renderScreen(curScreen);
}
function autoCalcGoalPctBidirectional(g){
  // Respect manual override — see comment on autoCalcGoalPct() in app-part2.js.
  if(g.pctManual)return;
  // Collect tasks linked in BOTH directions: goal.linkedTaskIds and tasks with task.linkedGoalId===g.id
  const linkedIds=new Set([...(g.linkedTaskIds||[])]);
  D.tasks.forEach(t=>{if(t.linkedGoalId===g.id)linkedIds.add(t.id);});
  const tasks=D.tasks.filter(t=>linkedIds.has(t.id));
  const ms=g.milestones||[];
  const taskScore=tasks.length?tasks.filter(t=>t.status==='Done').length/tasks.length:null;
  const msScore=ms.length?ms.filter(m=>m.done).length/ms.length:null;
  if(taskScore===null&&msScore===null)return;
  const weights=taskScore!==null&&msScore!==null?[0.6,0.4]:[1,0];
  const scores=[taskScore!==null?taskScore:msScore,msScore!==null?msScore:taskScore];
  const newPct=Math.round((scores[0]*weights[0]+scores[1]*weights[1])*100);
  if(g.pct!==newPct){
    g.pct=newPct;
    save('goals');
    if(newPct===100)toast(`🎉 Goal "${g.title}" is 100% complete!`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE CUSTOMIZATION — registry + resolvers
// ═══════════════════════════════════════════════════════════════════════════
// Per-user control over which pages, right rails and page sections are shown.
// NOTHING is removed from the app: this is a visibility layer the user opts
// into, so every feature stays one checkbox away.
//
// Stored in D.prefs.workspace, which is server-synced ('prefs' is in
// _syncKeys), so a layout follows the user between devices. The two older
// per-page systems (lu_home_cards / lu_task_rail) were localStorage-only —
// they're read as a fallback here and folded in on first mutation.
//
//   D.prefs.workspace = {
//     v:1,
//     preset:'everything',
//     pages:{ tasks:{on:true,rail:true,modules:{topOverdue:false}} },
//     onboarded:true,
//   }
//
// ⚠ SPARSE BY DESIGN. Only deviations from today's UI are ever written, and
// every resolver falls back to the pre-existing default — so an absent or
// empty workspace object renders EXACTLY what the app rendered before this
// feature existed. Keep it that way: "reset to defaults" is simply
// `delete D.prefs.workspace`.
//
// Visibility is applied through ONE generated stylesheet (#lu-layout-css,
// built by _luRebuildLayoutCSS) rather than inline styles on each node. That
// survives the async re-renders several pages do after their data loads, and
// keeps all of it out of index.html — same approach applyTheme() already uses
// for #lu-page-accents.

// Every route in SM. `nav:true` = has a sidebar entry, and so gets a
// visibility checkbox. `core:true` = can never be hidden, so nobody can lock
// themselves out. `rail` mirrors which screens carry a .bg.wr right rail in
// index.html — keep in sync with that markup.
const LU_PAGES=[
  {id:'home',     label:'Home',            group:'today', nav:true,  core:true,  rail:true },
  {id:'myday',    label:'Planner',         group:'today', nav:true,  core:false, rail:true },
  {id:'tasks',    label:'Tasks',           group:'work',  nav:true,  core:false, rail:true },
  {id:'command',  label:'Command Center',  group:'work',  nav:true,  core:false, rail:true },
  {id:'programs', label:'Programs',        group:'work',  nav:true,  core:false, rail:true },
  {id:'projects', label:'Projects',        group:'work',  nav:true,  core:false, rail:true },
  {id:'pipeline', label:'Pipeline',        group:'work',  nav:true,  core:false, rail:true },
  {id:'atlas',    label:'Atlas',           group:'work',  nav:true,  core:false, rail:true },
  {id:'notes',    label:'Notes',           group:'mind',  nav:true,  core:false, rail:false},
  {id:'mindmaps', label:'Mind Maps',       group:'mind',  nav:true,  core:false, rail:false},
  {id:'ideas',    label:'Ideas',           group:'mind',  nav:true,  core:false, rail:true },
  {id:'focus',    label:'Focus',           group:'mind',  nav:true,  core:false, rail:false},
  {id:'calendar', label:'Calendar',        group:'life',  nav:true,  core:false, rail:true },
  {id:'goals',    label:'Goals',           group:'life',  nav:true,  core:false, rail:false},
  {id:'habits',   label:'Habits',          group:'life',  nav:true,  core:false, rail:true },
  {id:'money',    label:'Money',           group:'life',  nav:true,  core:false, rail:true },
  {id:'coach',    label:'Coach',           group:'life',  nav:true,  core:false, rail:true },
  {id:'journal',  label:'Journal',         group:'life',  nav:true,  core:false, rail:true },
  {id:'mail',     label:'Mail',            group:'comms', nav:true,  core:false, rail:true },
  {id:'team',     label:'Team',            group:'comms', nav:true,  core:false, rail:true },
  {id:'contacts', label:'Contacts',        group:'comms', nav:true,  core:false, rail:true },
  {id:'reports',  label:'Reports',         group:'other', nav:true,  core:false, rail:false},
  {id:'bookmarks',label:'Bookmarks',       group:'other', nav:true,  core:false, rail:true },
  {id:'archive',  label:'Archive',         group:'other', nav:true,  core:false, rail:false},
  {id:'help',     label:'Help & Learning', group:'other', nav:true,  core:true,  rail:false},
  {id:'settings', label:'Settings',        group:'other', nav:true,  core:true,  rail:false},
  // Reached from in-app links / the command palette rather than the sidebar.
  // They get rail + section control but no visibility checkbox — hiding a page
  // with no nav entry would only break the links that point at it.
  {id:'clusters', label:'Clusters',        group:'work',  nav:false, core:true,  rail:true },
  {id:'standup',  label:'Standup',         group:'work',  nav:false, core:true,  rail:false},
  {id:'myweek',   label:'My Week',         group:'today', nav:false, core:true,  rail:false},
  {id:'myyear',   label:'My Year',         group:'today', nav:false, core:true,  rail:true },
  {id:'process',  label:'Process (GTD)',   group:'work',  nav:false, core:true,  rail:false},
  {id:'graph',    label:'Knowledge Graph', group:'mind',  nav:false, core:true,  rail:false},
];
const LU_PAGE_GROUPS={today:'Today',work:'Work',mind:'Mind',life:'Life',comms:'Comms',other:'Other'};
function luPageDef(id){return LU_PAGES.find(p=>p.id===id)||null;}

// Read-only view of the stored prefs. Never creates objects — it runs during
// render, and lazily writing here would defeat the sparse-by-default rule.
function _wsRead(){return (D&&D.prefs&&D.prefs.workspace)||{};}
function _wsReadPage(id){return (_wsRead().pages||{})[id]||{};}
// Mutable accessors — only called from explicit user actions.
function _ws(){D.prefs=D.prefs||{};return D.prefs.workspace=D.prefs.workspace||{};}
function _wsPage(id){const w=_ws();w.pages=w.pages||{};return w.pages[id]=w.pages[id]||{};}
function _wsSave(){try{save('prefs');}catch(_){try{localStorage.setItem('lu_prefs',JSON.stringify(D.prefs));}catch(__){}}}

// The per-page module lists. Home and Tasks reuse the defs that already drive
// their existing Customize dialogs, so those keep working untouched; the rest
// are tagged with data-mod attributes on their render output.
function _luPageModules(pageId){
  if(pageId==='home')return typeof _homeCardDefs!=='undefined'?_homeCardDefs:[];
  if(pageId==='tasks')return typeof _taskRailDefs!=='undefined'?_taskRailDefs:[];
  return (typeof LU_PAGE_MODULES!=='undefined'&&LU_PAGE_MODULES[pageId])||[];
}
// Pre-workspace layout prefs. Read-only fallback so a user who customised
// Home/Tasks before this feature keeps their layout until they touch it again.
function _wsLegacyModules(pageId){
  const key=pageId==='home'?'lu_home_cards':pageId==='tasks'?'lu_task_rail':null;
  if(!key)return null;
  try{const raw=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(raw)&&raw.length)return raw;}catch(_){}
  return null;
}

function luPageOn(id){
  const def=luPageDef(id);
  if(!def||def.core)return true;
  return _wsReadPage(id).on!==false;
}
function luRailOn(id){
  const def=luPageDef(id);
  if(!def||!def.rail)return true;
  return _wsReadPage(id).rail!==false;
}
function luModuleOn(pageId,modId){
  const mods=_wsReadPage(pageId).modules;
  if(mods&&Object.prototype.hasOwnProperty.call(mods,modId))return mods[modId]!==false;
  const legacy=_wsLegacyModules(pageId);
  if(legacy){const row=legacy.find(r=>r.id===modId);if(row)return row.visible!==false;}
  const def=(_luPageModules(pageId)||[]).find(m=>m.id===modId);
  return def?def.default!==false:true;
}

// Fold the two legacy localStorage stores into the synced workspace object.
// Runs once, on the first change the user makes through the new UI — doing it
// at boot would mean writing prefs for everyone before they've asked for
// anything, and could race the server hydrating D.prefs.
function _wsMigrateLegacy(){
  const w=_ws();
  if(w.v)return;
  [['home',typeof _homeCardDefs!=='undefined'?_homeCardDefs:[]],
   ['tasks',typeof _taskRailDefs!=='undefined'?_taskRailDefs:[]]].forEach(([pageId,defs])=>{
    const legacy=_wsLegacyModules(pageId);
    if(!legacy)return;
    const mods={};
    legacy.slice().sort((a,b)=>(a.order||0)-(b.order||0)).forEach(r=>{
      const def=defs.find(d=>d.id===r.id);
      if(!def)return;
      // Store deviations only, so untouched widgets keep following their default.
      if((r.visible!==false)!==(def.default!==false))mods[r.id]=r.visible!==false;
    });
    if(Object.keys(mods).length){const p=_wsPage(pageId);p.modules=Object.assign({},p.modules||{},mods);}
  });
  w.v=1;
  if(!w.preset)w.preset='everything';
}

// Both setters below store a value only when it DEVIATES from the default
// (pages visible, rails shown). Writing `on:true` would work, but it would
// let the object grow every time someone toggles something off and back on,
// and "reset" would stop meaning "nothing stored".
function _wsTrimPage(id){
  const w=_ws();
  const p=(w.pages||{})[id];
  if(p&&!Object.keys(p).length)delete w.pages[id];
}
// Any individual toggle means the layout no longer matches the level or role
// preset it came from, so drop those markers — the dial should read "Custom"
// rather than keep claiming a level that is no longer true.
function _wsClearLevelMarker(){
  const w=_ws();
  delete w.level;
  delete w.preset;
}
function luSetPageOn(id,on){
  const def=luPageDef(id);
  if(!def||def.core)return;
  _wsMigrateLegacy();
  const p=_wsPage(id);
  if(on)delete p.on;else p.on=false;
  _wsClearLevelMarker();_wsTrimPage(id);_wsSave();
  _luRebuildLayoutCSS();
  if(typeof initSidebars==='function')initSidebars(typeof curScreen!=='undefined'?curScreen:'home');
}
function luSetRailOn(id,on){
  _wsMigrateLegacy();
  const p=_wsPage(id);
  if(on)delete p.rail;else p.rail=false;
  _wsClearLevelMarker();_wsTrimPage(id);_wsSave();
  _luRebuildLayoutCSS();
  if(typeof _applyCurrentPaneSizes==='function')_applyCurrentPaneSizes();
  if(typeof initPaneResizers==='function')setTimeout(initPaneResizers,60);
}
function luSetModuleOn(pageId,modId,on){
  _wsMigrateLegacy();
  const p=_wsPage(pageId);p.modules=p.modules||{};
  // Sparse: a module back at its default stores nothing, so the page (and
  // eventually the whole workspace object) collapses away again.
  const def=(_luPageModules(pageId)||[]).find(m=>m.id===modId);
  const defaultOn=def?def.default!==false:true;
  if(!!on===defaultOn)delete p.modules[modId];else p.modules[modId]=!!on;
  if(!Object.keys(p.modules).length)delete p.modules;
  if(!Object.keys(p).length){const w=_ws();if(w.pages)delete w.pages[pageId];}
  _wsClearLevelMarker();_wsSave();_luRebuildLayoutCSS();
}
// Back to stock. Deliberately deletes the whole object rather than writing
// every default back, so "default" always means the same thing.
function luResetWorkspace(){
  if(D&&D.prefs)delete D.prefs.workspace;
  try{localStorage.removeItem('lu_home_cards');localStorage.removeItem('lu_task_rail');}catch(_){}
  _wsSave();_luRebuildLayoutCSS(true);
  if(typeof initSidebars==='function')initSidebars(typeof curScreen!=='undefined'?curScreen:'home');
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
}

// ── Detail level: one dial, 5 stops ────────────────────────────────────────
// A single "how much do you want to see" axis, for anyone who finds ~30 pages
// and ~11 dashboard widgets overwhelming. Distinct from LU_PRESETS below,
// which slice by ROLE rather than by volume.
//
// Level 5 IS the stock app — picking it clears every override rather than
// writing defaults back, so "everything" always means exactly one thing.
// Levels are a STARTING POINT: every individual page, rail and widget toggle
// keeps working on top, so anything can be switched back on one at a time.
const LU_LEVELS=[
  {n:1,label:'Essentials',   blurb:'Tasks and notes only. No sidebars, 2 dashboard widgets.',
   rails:false, pages:['tasks','notes'],
   home:['tasks','notes']},
  {n:2,label:'Simple',       blurb:'Adds your planner and calendar. Still no sidebars.',
   rails:false, pages:['tasks','notes','myday','calendar'],
   home:['tasks','notes','meetings','habits']},
  {n:3,label:'Balanced',     blurb:'Projects, goals, habits and journal. Sidebars back on.',
   rails:true,  pages:['tasks','notes','myday','calendar','projects','goals','habits','journal'],
   home:['tasks','notes','meetings','habits','projects','goals']},
  {n:4,label:'Full',         blurb:'Nearly everything — adds work and comms pages.',
   rails:true,  pages:['tasks','notes','myday','calendar','projects','goals','habits','journal',
                       'command','programs','mail','team','reports','ideas','mindmaps','focus','coach'],
   home:['tasks','notes','meetings','habits','projects','goals','recent','pinned','focus']},
  {n:5,label:'Everything',   blurb:'Every page, sidebar and widget. How LevelUp ships.',
   rails:true,  pages:null, home:null},
];
function luCurrentLevel(){
  const w=_wsRead();
  if(w.level>=1&&w.level<=5)return w.level;
  // No stored level, so infer it. Only VISIBILITY counts as a deviation —
  // a custom card `order` (which the legacy lu_home_cards migration brings
  // across for existing users) rearranges the dashboard without hiding
  // anything, so it's still level 5. Treating it as "Custom" made the dial
  // read blank for anyone who had ever reordered their Home cards.
  const pages=w.pages||{};
  const hidesSomething=Object.keys(pages).some(k=>{
    const p=pages[k]||{};
    return p.on===false||p.rail===false||(p.modules&&Object.keys(p.modules).length>0);
  });
  return hidesSomething?null:5;
}
function luApplyLevel(n){
  n=Math.max(1,Math.min(5,Number(n)||5));
  const lv=LU_LEVELS.find(l=>l.n===n);
  if(!lv)return;
  if(!lv.pages){ // level 5 == stock, which means storing nothing at all
    luResetWorkspace();
    if(typeof toast==='function')toast('Showing everything');
    return;
  }
  _wsMigrateLegacy();
  const w=_ws();w.pages=w.pages||{};
  const keep=new Set(lv.pages);
  LU_PAGES.forEach(def=>{
    const cur=Object.assign({},w.pages[def.id]||{});
    if(def.nav&&!def.core){if(keep.has(def.id))delete cur.on;else cur.on=false;}
    if(def.rail){if(lv.rails===false)cur.rail=false;else delete cur.rail;}
    if(Object.keys(cur).length)w.pages[def.id]=cur;else delete w.pages[def.id];
  });
  // Dashboard widgets. Only deviations are stored, so a widget this level
  // happens to agree with the default on records nothing.
  if(lv.home&&typeof _homeCardDefs!=='undefined'){
    const wantHome=new Set(lv.home),mods={};
    _homeCardDefs.forEach(d=>{
      const want=wantHome.has(d.id);
      if(want!==(d.default!==false))mods[d.id]=want;
    });
    const hp=_wsPage('home');
    if(Object.keys(mods).length)hp.modules=mods;else delete hp.modules;
    if(!Object.keys(hp).length)delete w.pages.home;
  }
  w.level=n;
  delete w.preset; // the level is now the thing in charge
  _wsSave();_luRebuildLayoutCSS(true);
  if(typeof initSidebars==='function')initSidebars(typeof curScreen!=='undefined'?curScreen:'home');
  if(typeof _applyCurrentPaneSizes==='function')_applyCurrentPaneSizes();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  if(typeof toast==='function')toast(`Detail level ${n} — ${lv.label}`);
}

// Starter layouts. `pages:null` means "no overrides at all" — the stock app.
// Everything else lists the pages to KEEP; the rest get hidden. Core pages are
// always kept regardless of what's listed here.
const LU_PRESETS=[
  {id:'everything',label:'Everything',desc:'Every page and rail. Exactly how LevelUp ships — the default.',pages:null},
  {id:'focused',   label:'Focused',   desc:'Today, tasks, notes and calendar only. Rails off for a calm screen.',
   rails:false, pages:['home','myday','tasks','notes','calendar']},
  {id:'balanced',  label:'Balanced',  desc:'Core planning plus projects, goals, habits and journal.',
   pages:['home','myday','tasks','notes','calendar','projects','goals','habits','journal']},
  {id:'exec',      label:'Executive', desc:'The roll-up view: portfolio, pipeline, reports and team.',
   pages:['home','command','programs','projects','pipeline','reports','team','calendar','mail','tasks']},
  {id:'pm',        label:'Project Manager', desc:'Delivery focus: tasks, projects, programs and the command center.',
   pages:['home','myday','tasks','projects','programs','command','calendar','team','notes']},
  {id:'creator',   label:'Creator',   desc:'Thinking tools: notes, mind maps, ideas and focus sessions.',
   pages:['home','notes','mindmaps','ideas','focus','journal','goals','tasks']},
  {id:'personal',  label:'Personal',  desc:'Life tracking: habits, goals, journal and calendar.',
   pages:['home','myday','habits','goals','journal','calendar','notes','tasks']},
];
function luApplyPreset(presetId){
  const p=LU_PRESETS.find(x=>x.id===presetId);
  if(!p)return;
  // "Everything" is stock, and stock means no stored overrides at all.
  if(!p.pages){luResetWorkspace();if(typeof toast==='function')toast('Layout reset to Everything');return;}
  _wsMigrateLegacy();
  const w=_ws();w.pages=w.pages||{};
  const keep=new Set(p.pages);
  LU_PAGES.forEach(def=>{
    const cur=Object.assign({},w.pages[def.id]||{});
    if(def.nav&&!def.core){if(keep.has(def.id))delete cur.on;else cur.on=false;}
    if(def.rail){if(p.rails===false)cur.rail=false;else delete cur.rail;}
    // Keep storage sparse: a page matching the default stores nothing.
    if(Object.keys(cur).length)w.pages[def.id]=cur;else delete w.pages[def.id];
  });
  w.preset=presetId;
  delete w.level; // a role preset isn't a point on the detail dial
  _wsSave();_luRebuildLayoutCSS(true);
  if(typeof initSidebars==='function')initSidebars(typeof curScreen!=='undefined'?curScreen:'home');
  if(typeof _applyCurrentPaneSizes==='function')_applyCurrentPaneSizes();
  if(typeof toast==='function')toast(`Layout set to ${p.label}`);
}
function luExportWorkspace(){
  try{
    const blob=new Blob([JSON.stringify(_wsRead(),null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='levelup-workspace-layout.json';
    document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);
    if(typeof toast==='function')toast('Layout exported');
  }catch(e){if(typeof toast==='function')toast('Export failed: '+(e.message||e));}
}
function luImportWorkspace(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='application/json,.json';
  inp.onchange=()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const parsed=JSON.parse(String(r.result||'{}'));
        if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('not a layout file');
        D.prefs=D.prefs||{};
        D.prefs.workspace=Object.assign({v:1,preset:'custom'},parsed);
        _wsSave();_luRebuildLayoutCSS(true);
        if(typeof initSidebars==='function')initSidebars(typeof curScreen!=='undefined'?curScreen:'home');
        if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
        if(typeof toast==='function')toast('Layout imported');
      }catch(e){if(typeof toast==='function')toast('Import failed: '+(e.message||e));}
    };
    r.readAsText(f);
  };
  inp.click();
}

// One generated stylesheet carries every hide rule. Rebuilt only when the
// stored shape actually changes, so calling it each render is cheap.
let _luLayoutCSSKey=null;
function _luRebuildLayoutCSS(force){
  try{
    const w=_wsRead();
    const key=JSON.stringify(w.pages||{});
    if(!force&&key===_luLayoutCSSKey)return;
    _luLayoutCSSKey=key;
    const out=[];
    LU_PAGES.forEach(def=>{
      const scr='#'+(typeof SM!=='undefined'&&SM[def.id]?SM[def.id]:'s-'+def.id);
      if(def.nav&&!luPageOn(def.id))out.push(`.si[data-n="${def.id}"]{display:none!important}`);
      if(def.rail&&!luRailOn(def.id)){
        out.push(`${scr} > .bg.wr > .rr{display:none!important}`);
        // Beats the inline grid the pane-resizer writes, so the main column
        // reclaims the space instead of leaving a 280px gap.
        out.push(`${scr} > .bg.wr{grid-template-columns:var(--side) 1fr!important}`);
      }
      const mods=(w.pages||{})[def.id];
      if(mods&&mods.modules){
        Object.keys(mods.modules).forEach(mid=>{
          if(mods.modules[mid]===false)out.push(`${scr} [data-mod="${mid}"]{display:none!important}`);
        });
      }
    });
    let tag=document.getElementById('lu-layout-css');
    if(!tag){tag=document.createElement('style');tag.id='lu-layout-css';document.head.appendChild(tag);}
    tag.textContent=out.join('\n');
  }catch(e){if(window.__DEV__)console.warn('[workspace] rebuild CSS failed',e);}
}
// Right rails are where the optional, glanceable content lives, and every
// page builds them the same way: a stack of cards, each opening with a short
// bold heading. Rather than hand-tagging ~60 cards across a dozen render
// functions (and risking their template literals), derive a stable id from
// each card's own heading after render — so the label the user toggles is
// literally the label they see. An explicit data-mod in the markup always
// wins, and ids only drift if a heading is reworded, which self-heals by
// showing the card again.
function _luSlug(s){return String(s||'').replace(/[^\w\s-]/g,'').trim().toLowerCase().replace(/\s+/g,'-').slice(0,32);}
function _luRailModules(){
  const scr=document.querySelector('.scr.on');if(!scr)return[];
  const rail=scr.querySelector(':scope > .bg > .rr');if(!rail)return[];
  const found=[],seen=Object.create(null);
  [...rail.children].forEach(el=>{
    if(!el.getAttribute)return;
    // Skip chrome that isn't page content. The mini-week strip, shortcuts
    // legend and the customize button are injected into every rail after
    // render by the renderScreen wrapper — they aren't this page's content.
    if(el.classList.contains('notes-resize')||el.classList.contains('lu-sc-legend'))return;
    if(el.classList.contains('lu-page-customize')||el.id==='lu-mini-week')return;
    // The card's own heading is the label either way, so an explicitly tagged
    // section still reads as the words on screen rather than its slug.
    const head=[...el.querySelectorAll('*')].find(n=>{
      const st=(n.getAttribute&&n.getAttribute('style'))||'';
      const t=(n.textContent||'').trim();
      return /font-weight:\s*(600|700|bold)/.test(st)&&t.length>1&&t.length<48;
    });
    const label=((head?head.textContent:el.textContent)||'').replace(/\s+/g,' ').trim().slice(0,42);
    if(el.dataset.mod){
      found.push({id:el.dataset.mod,label:label||el.dataset.modLabel||el.dataset.mod});
      return;
    }
    const slug=_luSlug(label);
    if(!slug)return;
    let id='r-'+slug;
    if(seen[id]){seen[id]++;id=id+'-'+seen[id];}else seen[id]=1;
    el.setAttribute('data-mod',id);
    el.setAttribute('data-mod-label',label);
    found.push({id,label});
  });
  return found;
}
// Post-render hook. The stylesheet does the hiding; this keeps the grid and
// the pane resizers agreeing with it. Tagging runs after the CSS is built —
// that's fine, the rules are declarative and match as soon as the attribute
// lands.
function applyPageLayout(page){
  try{
    _luRebuildLayoutCSS();
    _luRailModules();
    if(typeof _applyCurrentPaneSizes==='function')_applyCurrentPaneSizes();
  }catch(e){if(window.__DEV__)console.warn('[workspace] applyPageLayout failed',e);}
}
// Generic per-page customize dialog, reachable from the ⚙ button in a page
// header. Home and Tasks keep their own richer dialogs (they add per-card
// "determination modes" and reordering that this one deliberately doesn't
// duplicate), so those two delegate rather than lose functionality.
function openPageCustomize(page){
  page=page||(typeof curScreen!=='undefined'?curScreen:'home');
  if(page==='home'&&typeof openHomeDashCustomize==='function')return openHomeDashCustomize();
  if(page==='tasks'&&typeof openTaskRailCustomize==='function')return openTaskRailCustomize();
  closeModal();
  const def=luPageDef(page)||{id:page,label:page};
  const mods=luPageModuleList(page);
  const groups={};
  mods.forEach(m=>{(groups[m.group]=groups[m.group]||[]).push(m);});
  const groupHtml=Object.keys(groups).map(g=>`
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--t3);font-weight:700;margin:10px 0 4px">${esc(g)}</div>
    ${groups[g].map(m=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px">
      <span style="flex:1;font-size:12px">${esc(m.label)}</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
        <input type="checkbox" ${luModuleOn(page,m.id)?'checked':''}
          onchange="luSetModuleOn('${_jsAttr(page)}','${_jsAttr(m.id)}',this.checked)">Show
      </label>
    </div>`).join('')}`).join('');
  const railRow=def.rail?`<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px">
      <span style="flex:1;font-size:12px;font-weight:600">Right sidebar</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
        <input type="checkbox" ${luRailOn(page)?'checked':''}
          onchange="luSetRailOn('${_jsAttr(page)}',this.checked);renderScreen('${_jsAttr(page)}');setTimeout(()=>openPageCustomize('${_jsAttr(page)}'),60)">Show
      </label>
    </div>`:'';
  const html=`<div style="padding:18px;min-width:380px;max-width:520px;max-height:74vh;overflow:auto">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:6px">⚙ Customize ${esc(def.label)}</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:10px">Switch off what you don't use. Nothing is deleted — turn it back on any time here or in Settings → Workspace. Saves automatically and syncs to your other devices.</p>
    ${railRow}
    ${groupHtml||'<div style="font-size:11px;color:var(--t3);padding:10px 0">This page has no optional sections yet. You can still hide the page itself or its sidebar from Settings → Workspace.</div>'}
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px">
      <button class="btn btn-s" style="font-size:11px" onclick="closeModal();nav('settings');setTimeout(()=>{const t=[...document.querySelectorAll('#s-settings .si')].find(x=>/Workspace/.test(x.textContent));if(t)t.click();},120)">All settings…</button>
      <div style="display:flex;gap:6px">
        <button class="btn btn-s" style="font-size:11px" onclick="luResetPage('${_jsAttr(page)}');setTimeout(()=>openPageCustomize('${_jsAttr(page)}'),60)">Reset page</button>
        <button class="btn btn-p" style="font-size:11px" onclick="closeModal()">Done</button>
      </div>
    </div>
  </div>`;
  const mc=document.getElementById('modal-content');if(mc)mc.innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
}
function luResetPage(page){
  const w=_wsRead();
  if(w.pages&&w.pages[page]){delete _ws().pages[page];_wsSave();}
  _luRebuildLayoutCSS(true);
  if(typeof renderScreen==='function')renderScreen(page);
  if(typeof toast==='function')toast('Page reset to defaults');
}
// Everything the current page can show/hide: the page's own registered
// modules (Home cards, Tasks rail widgets, explicitly tagged sections) plus
// whatever its rail is currently rendering.
function luPageModuleList(page){
  const out=[],seen=Object.create(null);
  (_luPageModules(page)||[]).forEach(m=>{
    if(seen[m.id])return;seen[m.id]=1;
    out.push({id:m.id,label:m.label||m.id,group:page==='home'?'Dashboard cards':'Widgets'});
  });
  _luRailModules().forEach(m=>{
    if(seen[m.id])return;seen[m.id]=1;
    out.push({id:m.id,label:m.label,group:'Right sidebar'});
  });
  return out;
}

// Home dashboard card order & visibility
// Each def carries an `icon` (an _ICON_PATHS name) plus a plain-text `label`.
// Render sites place the icon themselves via _icon(def.icon,…) so the label
// stays clean text — safe for any consumer (the customization list renders
// icon+label as innerHTML; nothing here feeds a <select> or textContent).
const _homeCardDefs=[
  {id:'tasks',icon:'list',label:'Top Tasks',default:true},
  {id:'notes',icon:'edit',label:'Recent Notes',default:true},
  {id:'projects',icon:'folder',label:'Active Projects',default:true},
  {id:'goals',icon:'target',label:'Goals',default:true},
  {id:'files',icon:'folder',label:'Recent Files',default:true},
  {id:'habits',icon:'checkCircle',label:'Today\'s Habits',default:true},
  {id:'meetings',icon:'calendar',label:'Upcoming Meetings',default:true},
  {id:'recent',icon:'clock',label:'Recently Added',default:true},
  {id:'pinned',icon:'pin',label:'Pinned',default:true},
  {id:'focus',icon:'clock',label:'Focus Widget',default:true},
  {id:'reports',icon:'barChart',label:'Reports & Insights',default:true},
  {id:'habitHeatmap',icon:'flame',label:'Habit Heatmap (30 days)',default:false},
  {id:'moodTrend',icon:'activity',label:'Mood Trend (14 days)',default:false},
  {id:'money',icon:'barChart',label:'Money Snapshot',default:false},
  {id:'mindmaps',icon:'brain',label:'Recent Mind Maps',default:false},
  {id:'bookmarks',icon:'bookmark',label:'Recent Bookmarks',default:false},
  {id:'deadlines',icon:'clock',label:'Upcoming Deadlines',default:false},
  // 6 NEW widgets
  {id:'productivityScore',icon:'barChart',label:'Productivity Score (today)',default:false},
  {id:'streaks',icon:'trophy',label:'Top Streaks',default:false},
  {id:'weekAhead',icon:'calendar',label:'Week Ahead (7-day plan)',default:false},
  {id:'ideasPipeline',icon:'lightbulb',label:'Ideas Pipeline',default:false},
  {id:'taskVelocity',icon:'zap',label:'Task Velocity (this vs last week)',default:false},
  {id:'tagCloud',icon:'tag',label:'Tag Cloud (all sources)',default:false},
  // 5 NEW variety widgets (May 2026)
  {id:'weather',icon:'cloud',label:'Weather',default:false},
  {id:'quoteOfDay',icon:'quote',label:'Quote of the Day',default:false},
  {id:'yesteryear',icon:'camera',label:'On this day',default:false},
  {id:'aiInsight',icon:'sparkles',label:'AI Insight',default:false},
  {id:'focusSuggestion',icon:'target',label:'Peak Focus Hour',default:false},
  {id:'staleContent',icon:'trash',label:'Stale Content (>30d)',default:false},
];
// ── Bridge: legacy pref shape ⇄ the synced workspace store ──────────────────
// Home cards and the Tasks rail predate D.prefs.workspace and stored their
// layout in localStorage, so it never followed the user to another device.
// These two helpers present the workspace store in the exact legacy
// [{id,visible,order}] shape, so every existing consumer keeps working
// untouched while the data itself becomes server-synced.
function _wsPrefsList(pageId,defs){
  const page=_wsReadPage(pageId);
  const mods=page.modules||{};
  const order=Array.isArray(page.order)?page.order:null;
  // Only fall back to the old localStorage layout while nothing has been
  // written to the new store for this page.
  const legacy=(order||Object.keys(mods).length)?null:_wsLegacyModules(pageId);
  return defs.map((d,i)=>{
    let visible=d.default!==false,ord=i;
    if(Object.prototype.hasOwnProperty.call(mods,d.id))visible=mods[d.id]!==false;
    else if(legacy){const r=legacy.find(x=>x.id===d.id);if(r)visible=r.visible!==false;}
    if(order){const oi=order.indexOf(d.id);ord=oi>=0?oi:order.length+i;}
    else if(legacy){const r=legacy.find(x=>x.id===d.id);if(r&&typeof r.order==='number')ord=r.order;}
    return {id:d.id,visible,order:ord};
  });
}
function _wsPrefsSave(pageId,defs,prefs){
  _wsMigrateLegacy();
  const p=_wsPage(pageId);
  const mods={};
  (prefs||[]).forEach(r=>{
    const d=defs.find(x=>x.id===r.id);if(!d)return;
    // Store deviations only, so an untouched widget keeps following its default.
    if((r.visible!==false)!==(d.default!==false))mods[r.id]=r.visible!==false;
  });
  if(Object.keys(mods).length)p.modules=mods;else delete p.modules;
  const ordered=(prefs||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0)).map(r=>r.id);
  if(ordered.length&&JSON.stringify(ordered)!==JSON.stringify(defs.map(d=>d.id)))p.order=ordered;else delete p.order;
  if(!Object.keys(p).length){const w=_ws();if(w.pages)delete w.pages[pageId];}
  // Home-card / Tasks-rail dialogs change widget visibility, so the level no
  // longer describes the layout either.
  _wsClearLevelMarker();
  _wsSave();_luRebuildLayoutCSS();
}
function getHomeCardPrefs(){return _wsPrefsList('home',_homeCardDefs);}
function saveHomeCardPrefs(prefs){_wsPrefsSave('home',_homeCardDefs,prefs);}
// ── Home card "determination" modes ─────────────────────────────────────────
// Each card that surfaces a list (tasks / notes / projects / etc.) supports
// multiple selection strategies. The user picks one from the Customize
// dashboard dialog; it persists per-user via D.prefs.homeCardMode and is
// applied on the next render. Cards not listed here are deterministic
// (weather, productivity score, etc.) and don't need a mode picker.
const _homeCardModes={
  tasks:[
    {id:'smart',label:'Smart: overdue → due today → priority → soonest'},
    {id:'priority',label:'Highest priority first (skip Done/Someday)'},
    {id:'dueSoon',label:'Soonest due first (skip Done/Someday)'},
    {id:'recent',label:'Most recently created'},
    {id:'myDay',label:'My Day only'},
    {id:'oldest',label:'Storage order (oldest first — legacy)'},
  ],
  notes:[
    {id:'recent',label:'Most recently updated'},
    {id:'created',label:'Most recently created'},
    {id:'pinned',label:'Pinned first, then recent'},
    {id:'starred',label:'Starred first, then recent'},
  ],
  projects:[
    {id:'active',label:'Active projects (lowest %% first)'},
    {id:'recentActivity',label:'Recently updated'},
    {id:'mostTasks',label:'Most open tasks'},
    {id:'dueSoon',label:'Soonest due'},
  ],
  deadlines:[
    {id:'14d',label:'Next 14 days · all types'},
    {id:'7d',label:'Next 7 days · all types'},
    {id:'30d',label:'Next 30 days · all types'},
    {id:'tasks14d',label:'Tasks only · next 14 days'},
  ],
  mindmaps:[
    {id:'recent',label:'Most recently created'},
    {id:'biggest',label:'Most nodes first'},
  ],
  bookmarks:[
    {id:'recent',label:'Most recently added'},
    {id:'pinned',label:'Pinned first'},
  ],
  staleContent:[
    {id:'oldest',label:'Oldest untouched first (>30 days)'},
    {id:'newest',label:'Most recently went stale first'},
    {id:'tasksOnly',label:'Tasks only (>30 days)'},
    {id:'notesOnly',label:'Notes only (>30 days)'},
  ],
  streaks:[
    {id:'longest',label:'Longest streak first'},
    {id:'shortest',label:'Shortest active streak first'},
  ],
};
const _homeCardModeDefaults={tasks:'smart',notes:'recent',projects:'active',deadlines:'14d',mindmaps:'recent',bookmarks:'recent',staleContent:'oldest',streaks:'longest'};
function getHomeCardMode(id){
  const m=(D.prefs&&D.prefs.homeCardMode)||{};
  return m[id]||_homeCardModeDefaults[id]||'';
}
function setHomeCardMode(id,mode){
  D.prefs=D.prefs||{};
  D.prefs.homeCardMode=D.prefs.homeCardMode||{};
  D.prefs.homeCardMode[id]=mode;
  save('prefs');
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}
function openHomeDashCustomize(){
  const prefs=getHomeCardPrefs();
  const ov=document.createElement('div');
  ov.id='home-cust-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  const sorted=[...prefs].sort((a,b)=>a.order-b.order);
  const _aiBriefOn=!!(D.prefs&&D.prefs.heroAIBrief);
  const _todLayoutOn=!!(D.prefs&&D.prefs.homeTimeOfDayLayout);
  const _miniWeekOn=!(D.prefs&&D.prefs.miniWeekStrip===false);
  ov.innerHTML=`<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:10px;padding:20px;width:380px;max-width:95vw;max-height:90dvh;overflow-y:auto">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">⚙️ Customize Dashboard</div>
    <button class="btn btn-s" style="height:24px;width:24px;padding:0" onclick="document.getElementById('home-cust-ov').remove()">✕</button>
  </div>
  <div style="padding:8px 10px;border:1px solid var(--bd1);border-radius:6px;margin-bottom:8px;background:var(--s2)">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600">
      <input type="checkbox" id="hc-ai-brief" ${_aiBriefOn?'checked':''} onchange="toggleHeroAIBrief(this.checked)">
      ✨ AI greeting line in hero
    </label>
    <div style="font-size:11px;color:var(--t3);margin-top:4px;margin-left:24px">Replace the rotating quote with a daily AI brief tailored to your workspace. Uses your AI key from Settings.</div>
  </div>
  <div style="padding:8px 10px;border:1px solid var(--bd1);border-radius:6px;margin-bottom:8px;background:var(--s2)">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600">
      <input type="checkbox" id="hc-tod-layout" ${_todLayoutOn?'checked':''} onchange="toggleHomeTimeOfDayLayout(this.checked)">
      🕓 Reorder cards by time of day
    </label>
    <div style="font-size:11px;color:var(--t3);margin-top:4px;margin-left:24px">Morning surfaces habits + agenda; afternoon prioritises tasks + focus; evening lifts reflection cards. Manual order is preserved as a fallback.</div>
  </div>
  <div style="padding:8px 10px;border:1px solid var(--bd1);border-radius:6px;margin-bottom:10px;background:var(--s2)">
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600">
      <input type="checkbox" id="hc-mini-week" ${_miniWeekOn?'checked':''} onchange="toggleMiniWeekStrip(this.checked)">
      🗓 Mini-week strip in right rail
    </label>
    <div style="font-size:11px;color:var(--t3);margin-top:4px;margin-left:24px">Shows today + the next 6 days with task and event indicators. Visible on every page with a right rail.</div>
  </div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:12px">Toggle cards on/off or drag to reorder (use ↑↓ buttons).</div>
  <div id="home-cust-list">${sorted.map((p,i)=>{
    const def=_homeCardDefs.find(c=>c.id===p.id);
    const modes=_homeCardModes[p.id];
    const cur=modes?getHomeCardMode(p.id):'';
    const modeRow=modes?`<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:24px"><span style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;flex-shrink:0">Show</span><select class="inp" style="font-size:11px;height:22px;padding:0 4px;flex:1" onchange="setHomeCardMode('${_jsAttr(p.id)}',this.value)">${modes.map(m=>`<option value="${esc(m.id)}" ${m.id===cur?'selected':''}>${esc(m.label)}</option>`).join('')}</select></div>`:'';
    return `<div style="padding:7px 8px;border-radius:6px;border:1px solid var(--bd1);margin-bottom:5px;background:var(--s2)" data-card-id="${p.id}">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="display:flex;flex-direction:column;gap:1px">
          <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="homeCardMove('${_jsAttr(p.id)}',-1)">↑</button>
          <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="homeCardMove('${_jsAttr(p.id)}',1)">↓</button>
        </div>
        <span style="flex:1;font-size:12px;display:inline-flex;align-items:center;gap:6px">${def?`${_icon(def.icon,14,'currentColor')} ${esc(def.label)}`:esc(p.id)}</span>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
          <input type="checkbox" id="hc-${p.id}" ${p.visible?'checked':''} onchange="homeCardToggle('${_jsAttr(p.id)}',this.checked)">
          Show
        </label>
      </div>
      ${modeRow}
    </div>`;
  }).join('')}</div>
  <div style="display:flex;gap:6px;margin-top:12px">
    <button class="btn btn-p" style="flex:1" onclick="document.getElementById('home-cust-ov').remove();renderHome()">Done</button>
    <button class="btn btn-s" onclick="localStorage.removeItem('lu_home_cards');document.getElementById('home-cust-ov').remove();renderHome()">Reset</button>
  </div></div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}
function toggleHeroAIBrief(on){
  D.prefs=D.prefs||{};
  D.prefs.heroAIBrief=!!on;
  // Clear cached brief so the new state is reflected immediately on next render.
  if(on)delete D.prefs.aiHeroBrief;
  save('prefs');
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}
function toggleHomeTimeOfDayLayout(on){
  D.prefs=D.prefs||{};
  D.prefs.homeTimeOfDayLayout=!!on;
  save('prefs');
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}
function toggleMiniWeekStrip(on){
  D.prefs=D.prefs||{};
  D.prefs.miniWeekStrip=!!on;
  save('prefs');
  // Hide immediately if turned off; redraw on render otherwise.
  if(!on)document.querySelectorAll('#lu-mini-week').forEach(el=>el.remove());
  else if(typeof _renderMiniWeekStrip==='function')_renderMiniWeekStrip();
}
// Stale-content panel actions (#11). _staleOpen drops the user into the right
// drawer; _staleTouch stamps lastTouchedAt=now so the item is suppressed for
// another 30 days without changing its semantics.
function _staleOpen(type,id){
  const arr=type==='note'?D.notes:type==='task'?D.tasks:type==='goal'?D.goals:null;
  if(!arr)return;
  const it=arr.find(x=>x.id==id);
  if(!it)return;
  // Stamp touch so the item isn't immediately stale on next render either.
  it.lastTouchedAt=Date.now();
  if(typeof openDrawer==='function')openDrawer(type,it);
  if(type==='note')save('notes');else if(type==='task')save('tasks');else save('goals');
}
function _staleTouch(type,id){
  const arr=type==='note'?D.notes:type==='task'?D.tasks:type==='goal'?D.goals:null;
  if(!arr)return;
  const it=arr.find(x=>x.id==id);
  if(!it)return;
  it.lastTouchedAt=Date.now();
  if(type==='note')save('notes');else if(type==='task')save('tasks');else save('goals');
  toast({type:'success',title:'Marked as fresh',msg:`Hidden from Stale for 30 more days.`,duration:2200});
  if(curScreen==='home'&&typeof renderHome==='function')renderHome();
}
function homeCardToggle(id,visible){
  const prefs=getHomeCardPrefs();
  const p=prefs.find(x=>x.id===id);
  if(p)p.visible=visible;
  saveHomeCardPrefs(prefs);
}
function homeCardMove(id,dir){
  const prefs=getHomeCardPrefs();
  const sorted=[...prefs].sort((a,b)=>a.order-b.order);
  const idx=sorted.findIndex(x=>x.id===id);
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=sorted.length)return;
  [sorted[idx].order,sorted[newIdx].order]=[sorted[newIdx].order,sorted[idx].order];
  saveHomeCardPrefs(prefs);
  // Re-render the list
  const list=document.getElementById('home-cust-list');
  if(list){
    const newSorted=[...prefs].sort((a,b)=>a.order-b.order);
    list.innerHTML=newSorted.map((p,i)=>{
      const def=_homeCardDefs.find(c=>c.id===p.id);
      const modes=_homeCardModes[p.id];
      const cur=modes?getHomeCardMode(p.id):'';
      const modeRow=modes?`<div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:24px"><span style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;flex-shrink:0">Show</span><select class="inp" style="font-size:11px;height:22px;padding:0 4px;flex:1" onchange="setHomeCardMode('${_jsAttr(p.id)}',this.value)">${modes.map(m=>`<option value="${esc(m.id)}" ${m.id===cur?'selected':''}>${esc(m.label)}</option>`).join('')}</select></div>`:'';
      return `<div style="padding:7px 8px;border-radius:6px;border:1px solid var(--bd1);margin-bottom:5px;background:var(--s2)" data-card-id="${p.id}">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="display:flex;flex-direction:column;gap:1px">
            <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="homeCardMove('${_jsAttr(p.id)}',-1)">↑</button>
            <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="homeCardMove('${_jsAttr(p.id)}',1)">↓</button>
          </div>
          <span style="flex:1;font-size:12px;display:inline-flex;align-items:center;gap:6px">${def?`${_icon(def.icon,14,'currentColor')} ${esc(def.label)}`:esc(p.id)}</span>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
            <input type="checkbox" id="hc-${p.id}" ${p.visible?'checked':''} onchange="homeCardToggle('${_jsAttr(p.id)}',this.checked)">
            Show
          </label>
        </div>
        ${modeRow}
      </div>`;
    }).join('');
  }
}
function renderHome(){
  const m=$('home-main');const r=$('home-rail');
  const _greetName=(D.creds.userName||'Idris Grant').split(' ')[0];
  const _greetTime=new Date().getHours();
  // 4 phases (#1) — used for both copy and the gradient picker.
  const _greetWord=_greetTime<12?'morning':_greetTime<17?'afternoon':_greetTime<21?'evening':'night';
  const _homePrefs=getHomeCardPrefs();
  const _homeVisible=new Set(_homePrefs.filter(p=>p.visible).map(p=>p.id));
  let _homeOrder=[..._homePrefs].sort((a,b)=>a.order-b.order).map(p=>p.id);
  // Time-of-day Home layout (#12). When opted-in via D.prefs.homeTimeOfDayLayout,
  // re-rank the user's visible cards using a phase priority list so morning shows
  // habits + agenda first, evening surfaces reflection cards, etc. Cards not in
  // the phase list keep their original relative order at the end.
  if(D.prefs&&D.prefs.homeTimeOfDayLayout){
    const phaseOrders={
      morning:['habits','meetings','tasks','focus','goals','weather','quoteOfDay','aiInsight','recent'],
      afternoon:['tasks','focus','projects','deadlines','meetings','goals','reports','recent','focusSuggestion'],
      evening:['moodTrend','yesteryear','recent','notes','weekAhead','reports','tasks','goals'],
      night:['weekAhead','deadlines','recent','notes','moodTrend','reports','goals'],
    };
    const phase=_greetTime<12?'morning':_greetTime<17?'afternoon':_greetTime<21?'evening':'night';
    const priority=phaseOrders[phase]||[];
    _homeOrder=[..._homeOrder].sort((a,b)=>{
      const ai=priority.indexOf(a),bi=priority.indexOf(b);
      if(ai>=0&&bi>=0)return ai-bi;
      if(ai>=0)return -1;
      if(bi>=0)return 1;
      return 0;
    });
  }
  // ── #1 + #3 — time-of-day adaptive gradient, tinted with theme accent.
  // Phase determines the temperature; the user's accent is the middle stop
  // so the hero always feels "their" theme regardless of time of day.
  const _accent=(getComputedStyle(document.documentElement).getPropertyValue('--ac')||'#5b21b6').trim()||'#5b21b6';
  const _phaseGrad={
    morning:`linear-gradient(125deg,#fb923c 0%,${_accent} 50%,#a855f7 100%)`,
    afternoon:`linear-gradient(125deg,#0ea5e9 0%,${_accent} 50%,#7c3aed 100%)`,
    evening:`linear-gradient(125deg,#1e3a8a 0%,${_accent} 45%,#9d174d 100%)`,
    night:`linear-gradient(125deg,#020617 0%,#1e1b4b 50%,${_accent} 100%)`,
  };
  const _heroGradient=_phaseGrad[_greetWord]||_phaseGrad.evening;
  // Compute today's primary stats.
  const _stTasksToday=D.tasks.filter(t=>t.status!=='Done'&&(t.due===_todayStr||t.startDate===_todayStr)).length;
  const _stOverdue=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;
  const _stMeetings=_calMeetingsOn(_todayStr).length;
  const _stMyDay=D.tasks.filter(t=>t.myDay&&t.status!=='Done').length;
  const _stHabitsDone=(D.habits||[]).filter(h=>h.cadence==='Daily'&&h.doneToday).length;
  const _stHabitsTotal=(D.habits||[]).filter(h=>h.cadence==='Daily').length;
  const _todayLabel=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  // ── #6 — momentum metrics used to replace zero-stat tiles.
  const _bestStreak=Math.max(0,...(D.habits||[]).map(h=>Number(h.streak)||0));
  const _focusToday=Number((D.prefs&&D.prefs.focusLog||{})[_todayStr]||0);
  const _journalToday=(D.journal||[]).filter(j=>{const d=String(j.date||'').toLowerCase();return d.startsWith(_todayStr)||d.startsWith('today');});
  const _wordsToday=_journalToday.reduce((s,j)=>s+String(j.body||'').trim().split(/\s+/).filter(Boolean).length,0);
  const _doneToday=D.tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===_todayStr).length;
  // ── #4 — daily-rotating motivational tagline (extended pool) +
  // ── #8 — opt-in AI brief (toggled in Customize Dashboard).
  const _heroLines=[
    'Small consistent wins compound into big outcomes.',
    'Pick three things that move the needle. Ignore the rest.',
    "What would make today feel like a win? Start there.",
    'Deep work first. Shallow work fills the cracks on its own.',
    'Energy is finite — spend it on what compounds.',
    'Done > perfect. Ship the messy first draft.',
    "You don't have to do it all today. Just do the next right thing.",
    "Your future self is built one focused hour at a time.",
    "Clarity comes from action, not from thinking about action.",
    "The work you avoid is usually the work that matters most.",
    "Protect your attention like it's your most valuable asset — because it is.",
    "Show up before you feel ready. Motivation follows momentum.",
    "Cut what doesn't compound. Double down on what does.",
    "Tiny systems beat grand intentions every time.",
  ];
  const _doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0).getTime())/86400000);
  const _aiBriefOn=!!(D.prefs&&D.prefs.heroAIBrief);
  const _aiBriefCache=(D.prefs&&D.prefs.aiHeroBrief)||null;
  let _heroSub;
  if(_aiBriefOn){
    if(_aiBriefCache&&_aiBriefCache.date===_todayStr&&_aiBriefCache.text&&!_aiBriefCache.pending){
      _heroSub=_aiBriefCache.text;
    }else{
      _heroSub=_aiBriefCache&&_aiBriefCache.text?_aiBriefCache.text:'Generating your daily brief…';
      if(typeof _refreshHeroBrief==='function')setTimeout(_refreshHeroBrief,300);
    }
  }else{
    _heroSub=_heroLines[_doy%_heroLines.length];
  }
  // ── #5 + #7 — build dynamic stat tiles with click-to-navigate and
  //   hover popovers. When a primary metric is 0, we swap in a momentum
  //   metric (#6) so we never show a wall of zeros.
  const _overdueTasks=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).slice(0,5);
  const _todayTasks=D.tasks.filter(t=>t.status!=='Done'&&(t.due===_todayStr||t.startDate===_todayStr)).slice(0,5);
  const _todayMeetings=_calMeetingsOn(_todayStr).slice(0,5);
  const _myDayTasks=D.tasks.filter(t=>t.myDay&&t.status!=='Done').slice(0,5);
  const _habitsList=(D.habits||[]).slice(0,5);
  const _topStreaks=(D.habits||[]).filter(h=>(Number(h.streak)||0)>0).sort((a,b)=>(b.streak||0)-(a.streak||0)).slice(0,5);
  const popList=(arr,empty)=>arr.length?arr.map(t=>`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">• ${esc(t.title||t.name||'(untitled)')}</div>`).join(''):`<div style="font-size:11px;color:rgba(226,232,240,.55);padding:3px 0">${esc(empty||'Nothing here.')}</div>`;
  const popText=t=>`<div style="font-size:11px;color:rgba(226,232,240,.85);padding:2px 0">${esc(t)}</div>`;
  const _tiles=[];
  // Tile 1 — Tasks Today, or Done Today if nothing scheduled.
  _tiles.push(_stTasksToday>0
    ?{icon:'📋',label:'Tasks Today',val:_stTasksToday,color:'#22c55e',navTo:'tasks',pop:`<div style="font-weight:600;margin-bottom:4px">Due today</div>${popList(_todayTasks,'Nothing due today.')}`}
    :{icon:'✅',label:'Done Today',val:_doneToday,color:'#22c55e',navTo:'tasks',pop:popText(`${_doneToday} task${_doneToday===1?'':'s'} completed today.`)});
  // Tile 2 — Overdue (always shown; a non-zero overdue is too important to swap out).
  _tiles.push({icon:'⚠️',label:'Overdue',val:_stOverdue,color:_stOverdue?'#ef4444':'#64748b',navTo:'tasks',pop:_stOverdue?`<div style="font-weight:600;margin-bottom:4px">Overdue</div>${popList(_overdueTasks)}`:popText('Nothing overdue. Keep it up.')});
  // Tile 3 — Meetings, or Focus minutes if no meetings.
  _tiles.push(_stMeetings>0
    ?{icon:'📅',label:'Meetings',val:_stMeetings,color:'#0284c7',navTo:'calendar',pop:`<div style="font-weight:600;margin-bottom:4px">Today</div>${popList(_todayMeetings)}`}
    :{icon:'⏱',label:'Focus (min)',val:_focusToday,color:'#0284c7',navTo:'focus',pop:popText(`${_focusToday} focus minute${_focusToday===1?'':'s'} logged today.`)});
  // Tile 4 — My Day, or Best Streak if My Day empty.
  _tiles.push(_stMyDay>0
    ?{icon:'☀',label:'My Day',val:_stMyDay,color:'#f59e0b',navTo:'tasks',pop:`<div style="font-weight:600;margin-bottom:4px">My Day</div>${popList(_myDayTasks)}`}
    :{icon:'🔥',label:'Best Streak',val:_bestStreak,color:'#f59e0b',navTo:'habits',pop:_topStreaks.length?`<div style="font-weight:600;margin-bottom:4px">Top streaks</div>${_topStreaks.map(h=>`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)">🔥${h.streak} · ${esc(h.title||'')}</div>`).join('')}`:popText('No active streaks yet — check off a habit today.')});
  // Tile 5 — Habits ratio, or Words today if no habits configured.
  _tiles.push(_stHabitsTotal
    ?{icon:'✅',label:'Habits',val:`${_stHabitsDone}/${_stHabitsTotal}`,color:'#10b981',navTo:'habits',pop:_habitsList.map(h=>`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)">${h.doneToday?'✅':'⬜'} ${esc(h.title||'')}</div>`).join('')}
    :{icon:'📔',label:'Words',val:_wordsToday,color:'#10b981',navTo:'journal',pop:popText(`${_wordsToday} word${_wordsToday===1?'':'s'} journaled today.`)});
  // Stash popover content for the shared hover handler.
  window._heroTilePops=_tiles.map(t=>t.pop);
  m.innerHTML=`<div class="home-hero" style="position:relative;padding:18px 22px 14px;margin-bottom:14px;border-radius:18px;overflow:hidden;background:${_heroGradient};background-size:200% 200%;animation:heroBgDrift 30s ease-in-out infinite alternate;border:1px solid rgba(255,255,255,.08);box-shadow:0 12px 48px rgba(91,33,182,.32),0 2px 8px rgba(0,0,0,.4)">
    <!-- Decorative blurred orbs -->
    <div style="position:absolute;top:-50px;right:-40px;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.45),transparent 70%);pointer-events:none;filter:blur(8px)"></div>
    <div style="position:absolute;bottom:-70px;left:30%;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,.28),transparent 70%);pointer-events:none;filter:blur(10px)"></div>
    <div style="position:absolute;top:10px;left:35%;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(96,165,250,.34),transparent 70%);pointer-events:none;filter:blur(6px)"></div>
    <!-- Faint grid + #2 noise overlay -->
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px);background-size:32px 32px;pointer-events:none;opacity:.5"></div>
    <div class="home-hero-noise"></div>
    <div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:3px 10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:20px;font-size:11px;color:#fff;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;backdrop-filter:blur(8px)">
          <span style="width:5px;height:5px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;animation:pulse 2s infinite"></span>
          ${_todayLabel}
        </div>
        <h1 style="font-size:24px;font-weight:800;line-height:1.15;margin:0;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.35);letter-spacing:-.4px">Good ${_greetWord}, <span style="background:linear-gradient(90deg,#fbbf24,#fb7185);-webkit-background-clip:text;background-clip:text;color:transparent">${_greetName}</span>! <span style="display:inline-block;animation:wave 2.4s ease-in-out infinite;transform-origin:70% 70%">👋</span></h1>
        <p style="font-size:12.5px;color:rgba(255,255,255,.85);margin-top:4px;border-left:none!important;padding-left:0!important;font-weight:400;line-height:1.45;text-shadow:0 1px 8px rgba(0,0,0,.3)">${esc(_heroSub)}</p>
      </div>
      <button class="btn btn-s" style="height:30px;font-size:11px;flex-shrink:0;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;backdrop-filter:blur(8px);font-weight:500" onclick="openHomeDashCustomize()">⚙ Customize</button>
    </div>
    <!-- Compressed stat strip with click-through (#5) and hover popovers (#7) -->
    <div style="position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px">
      ${_tiles.map((s,i)=>`<div class="home-hero-tile" data-tile-idx="${i}" onclick="nav('${_jsAttr(s.navTo)}')" onmouseenter="_heroTilePopShow(event)" onmouseleave="_heroTilePopHide()" style="display:flex;align-items:center;gap:9px;padding:8px 11px;background:rgba(10,14,28,.72);border:1px solid color-mix(in srgb,${s.color} 50%,transparent);border-radius:10px;backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)">
        <div style="width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,${s.color} 28%,rgba(0,0,0,.25));display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;border:1px solid color-mix(in srgb,${s.color} 35%,transparent)">${s.icon}</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:18px;font-weight:800;color:${s.color};line-height:1;text-shadow:0 1px 8px color-mix(in srgb,${s.color} 35%,transparent)">${s.val}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.78);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-top:2px">${s.label}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
  ${(()=>{
    // ── Today's Plan strip (unified-landing v1): actionable My Day tasks,
    // today's schedule and habit check-offs directly on Home, so the day can
    // be worked without bouncing between Home / My Day / Command Center.
    const myday=D.tasks.filter(t=>t.myDay&&t.status!=='Done').slice(0,6);
    const evs=_calMeetingsOn(_todayStr)
      .sort((a,b)=>String(a.start).localeCompare(String(b.start))).slice(0,6);
    const daily=(D.habits||[]).filter(h=>h.cadence==='Daily').slice(0,8);
    const col=(icon,title,navRoute,inner)=>`<div class="cd" style="padding:12px;min-width:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700">${icon} ${title}</span>
        <span style="font-size:11px;color:var(--ac);cursor:pointer" onclick="nav('${_jsAttr(navRoute)}')">Open →</span>
      </div>${inner}</div>`;
    const taskRows=myday.length?myday.map(t=>`<div class="lr" style="padding:3px 0">
        <div class="chk" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderHome,80)" title="Mark done"></div>
        <span class="rt" style="font-size:12px;cursor:pointer" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">${esc(t.title)}</span>
        ${t.priority?`<span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span>`:''}
      </div>`).join('')
      :`<div style="font-size:11px;color:var(--t3);padding:6px 0">No My Day tasks yet — star tasks into My Day to plan your day.</div>`;
    const evRows=evs.length?evs.map(e=>`<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;border-bottom:1px solid var(--bd1)">
        <span style="font-size:11px;font-weight:700;color:var(--ac);min-width:38px">${esc((e.start||'').slice(11,16)||'—')}</span>
        <span style="font-size:12px;color:var(--t1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.title||e.subject||'(untitled)')}</span>
      </div>`).join('')
      :`<div style="font-size:11px;color:var(--t3);padding:6px 0">No events scheduled today.</div>`;
    const habitChips=daily.length?`<div style="display:flex;flex-wrap:wrap;gap:5px">${daily.map(h=>`<span onclick="toggleHabit(${h.id});setTimeout(renderHome,80)" style="cursor:pointer;font-size:11px;padding:4px 10px;border-radius:14px;font-weight:600;${h.doneToday?'background:var(--oks);color:var(--ok);border:1px solid color-mix(in srgb,var(--ok) 40%,transparent)':'background:transparent;color:var(--t2);border:1px solid var(--bd2)'}">${h.doneToday?'✓ ':''}${esc(h.name||h.title||'Habit')}</span>`).join('')}</div>`
      :`<div style="font-size:11px;color:var(--t3);padding:6px 0">No daily habits yet.</div>`;
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:12px">
      ${col('☀️',"Today's Plan",'myday',taskRows)}
      ${col('📅','Schedule','calendar',evRows)}
      ${col('✅',`Habits ${daily.length?`<span style="font-size:11px;color:var(--t3);font-weight:400">${daily.filter(h=>h.doneToday).length}/${daily.length}</span>`:''}`,'habits',habitChips)}
    </div>`;
  })()}
  <div class="cd" style="display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;align-items:center"><span style="font-size:12px;font-weight:600;color:var(--ac);margin-right:4px">${_icon('zap',15,'var(--page-accent)')} Quick Add</span>
  ${[['Task','#22c55e'],['Note','#f97316'],['Project','#a855f7'],['Goal','#dc2626'],['Journal','#f43f5e'],['Habit','#10b981']].map(([t,c])=>`<span style="font-size:11px;color:${c};cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid color-mix(in srgb,${c} 25%,var(--bd2));background:color-mix(in srgb,${c} 8%,transparent);font-weight:500;transition:filter .12s,transform .1s" onmouseover="this.style.filter='brightness(1.2)';this.style.transform='translateY(-1px)'" onmouseout="this.style.filter='';this.style.transform=''" onclick="openFA('${t.toLowerCase()}')">+ ${t}</span>`).join('')}</div>
  ${(()=>{
    const cardHtml={
      tasks:(()=>{
        const mode=getHomeCardMode('tasks');
        const today=_todayStr;
        const priRank={High:3,Medium:2,Low:1};
        let pool=D.tasks.slice();
        const skipDone=t=>t.status!=='Done'&&t.status!=='Someday';
        let chosen;
        if(mode==='oldest'){chosen=pool.slice(0,5);}
        else if(mode==='myDay'){chosen=pool.filter(t=>t.myDay&&t.status!=='Done').slice(0,5);}
        else if(mode==='recent'){chosen=pool.filter(skipDone).sort((a,b)=>{const ka=Date.parse(a.createdAt||0)||a.id||0;const kb=Date.parse(b.createdAt||0)||b.id||0;return kb-ka;}).slice(0,5);}
        else if(mode==='priority'){chosen=pool.filter(skipDone).sort((a,b)=>(priRank[b.priority||'Medium']||0)-(priRank[a.priority||'Medium']||0)||(a.due||'9999').localeCompare(b.due||'9999')).slice(0,5);}
        else if(mode==='dueSoon'){chosen=pool.filter(skipDone).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,5);}
        else{ // 'smart' default — overdue → due today → priority desc → soonest due → newest
          chosen=pool.filter(skipDone).map(t=>{
            const overdue=t.due&&t.due<today?1:0;
            const dueToday=t.due===today?1:0;
            return {t,overdue,dueToday,pri:priRank[t.priority||'Medium']||0,due:t.due||'9999',ts:Date.parse(t.createdAt||0)||t.id||0};
          }).sort((a,b)=>b.overdue-a.overdue||b.dueToday-a.dueToday||b.pri-a.pri||a.due.localeCompare(b.due)||b.ts-a.ts).slice(0,5).map(x=>x.t);
        }
        const modeLabel=(_homeCardModes.tasks.find(m=>m.id===mode)||{}).label||'';
        return `<div class="cd"><div class="cd-h"><div class="cd-t" title="${esc(modeLabel)}">${_icon('list',15,'#22c55e')} Top Tasks</div><span class="cd-a" onclick="nav('tasks')">View all</span></div>${chosen.length?chosen.map(t=>taskRow(t,false)).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">Nothing here for this filter.</div>'}<div class="add-c" onclick="openModal('capture')">+ Add Task</div></div>`;
      })(),
      notes:(()=>{
        const mode=getHomeCardMode('notes');
        const tsCreated=n=>Date.parse(n.createdAt||0)||n.id||0;
        const tsUpdated=n=>(typeof _parseNoteDate==='function'?_parseNoteDate(n):0)||tsCreated(n);
        let arr=D.notes.slice();
        if(mode==='created')arr.sort((a,b)=>tsCreated(b)-tsCreated(a));
        else if(mode==='pinned')arr.sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||(tsUpdated(b)-tsUpdated(a)));
        else if(mode==='starred')arr.sort((a,b)=>((b.starred?1:0)-(a.starred?1:0))||(tsUpdated(b)-tsUpdated(a)));
        else arr.sort((a,b)=>tsUpdated(b)-tsUpdated(a)); // 'recent' default
        const byRecent=arr.slice(0,5);
        const modeLabel=(_homeCardModes.notes.find(m=>m.id===mode)||{}).label||'';
        return `<div class="cd"><div class="cd-h"><div class="cd-t" title="${esc(modeLabel)}">${_icon('edit',15,'#f97316')} Recent Notes</div><span class="cd-a" onclick="nav('notes')">View all</span></div>${byRecent.length?byRecent.map(n=>`<div class="lr" onclick="openDrawer('note',D.notes.find(x=>x.id==${_tidLit(n.id)}))"><span class="rt">${esc(n.title)}</span><span class="rm">${fmtNoteDate(n.updated)}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No notes match this filter.</div>'}<div class="add-c" onclick="openModal('capture')">+ New Note</div></div>`;
      })(),
      projects:(()=>{
        const mode=getHomeCardMode('projects');
        let arr=D.projects.filter(p=>p.status==='Active');
        if(mode==='recentActivity'){
          const upd=p=>Date.parse(p.updatedAt||p.updated||p.createdAt||0)||p.id||0;
          arr=arr.slice().sort((a,b)=>upd(b)-upd(a));
        }else if(mode==='mostTasks'){
          const open=p=>(D.tasks||[]).filter(t=>(t.projectId===p.id||t.project===p.name)&&t.status!=='Done').length;
          arr=arr.slice().sort((a,b)=>open(b)-open(a));
        }else if(mode==='dueSoon'){
          arr=arr.slice().filter(p=>p.due&&p.due!=='TBD').sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
        }else{ // 'active' default — lowest pct first (needs the most attention)
          arr=arr.slice().sort((a,b)=>(a.pct||0)-(b.pct||0));
        }
        const top=arr.slice(0,5);
        const modeLabel=(_homeCardModes.projects.find(m=>m.id===mode)||{}).label||'';
        return `<div class="cd"><div class="cd-h"><div class="cd-t" title="${esc(modeLabel)}">${_icon('folder',15,'#a855f7')} Active Projects</div><span class="cd-a" onclick="nav('projects')">View all</span></div>${top.length?top.map(p=>`<div class="lr" onclick="openDrawer('project',D.projects.find(x=>x.id==${_tidLit(p.id)}))"><span style="width:7px;height:7px;border-radius:2px;background:${p.color};flex-shrink:0"></span><span class="rt">${p.icon?esc(p.icon)+' ':''}${esc(p.name)}</span><span class="rm">${p.pct}%</span><div class="pb" style="width:40px"><div class="f" style="width:${p.pct}%;background:${p.color}"></div></div></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No projects match this filter.</div>'}<div class="add-c" onclick="openModal('capture')">+ New Project</div></div>`;
      })(),
      goals:renderGoalCards(3),
      focus:(()=>{
        const _fl=D.prefs&&D.prefs.focusLog||{};
        const todayKey=_ymd(new Date());
        const todayMins=_fl[todayKey]||0;
        const todaySessions=D.prefs&&D.prefs.focusSessions?D.prefs.focusSessions.filter(s=>s.date===todayKey).length:0;
        const weekMins=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return _fl[_ymd(d)]||0;}).reduce((a,b)=>a+b,0);
        const activeFocusTask=D.tasks.find(t=>t.id===(_focusTaskId||null));
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('clock',15,'currentColor')} Focus</div><span class="cd-a" onclick="nav('focus')">Open Focus</span></div>
          <div style="display:flex;gap:16px;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd1);margin-bottom:10px">
            <div style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--ac)">${todaySessions}</div><div style="font-size:11px;color:var(--t3)">Sessions</div></div>
            <div style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--ac)">${todayMins}</div><div style="font-size:11px;color:var(--t3)">Minutes Today</div></div>
            <div style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--t2)">${weekMins}</div><div style="font-size:11px;color:var(--t3)">This Week</div></div>
          </div>
          ${activeFocusTask?`<div style="font-size:11px;color:var(--t2);margin-bottom:8px">Current: <strong>${esc(activeFocusTask.title)}</strong></div>`:'<div style="font-size:11px;color:var(--t3);margin-bottom:8px">No task selected</div>'}
          <button class="btn btn-p" style="width:100%;height:30px;font-size:11px" onclick="nav('focus')">▶ Start Focus Session</button>
        </div>`;
      })(),
      files:`<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('folder',15,'#3b82f6')} Recent Files</div><span class="cd-a" onclick="nav('mail')">Open Files</span></div><div style="padding:14px 8px;text-align:center;color:var(--t3);font-size:11px">File sync requires a connected cloud account.<br><span style="color:var(--ac);cursor:pointer" onclick="nav('settings')">Connect in Settings →</span></div></div>`,
      reports:(()=>{
        const today=new Date();
        const todayKey=_ymd(today);
        // 7-day completion bars (last 7 days, oldest left)
        const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d;});
        const dayLabels=['S','M','T','W','T','F','S'];
        const counts=days.map(d=>{const k=_ymd(d);return (D.tasks||[]).filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===k).length;});
        const maxC=Math.max(...counts,1);
        const totalC=counts.reduce((a,b)=>a+b,0);
        const bars=counts.map((c,i)=>{const h=Math.round(c/maxC*48)+2;const isToday=i===6;return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:100%;background:${isToday?'var(--ac)':'var(--s3)'};border-radius:3px 3px 0 0;height:${h}px;min-height:3px;position:relative" title="${c} done"><span style="position:absolute;top:-14px;left:0;right:0;text-align:center;font-size:11px;font-weight:600;color:${isToday?'var(--ac)':'var(--t3)'}">${c||''}</span></div><div style="font-size:11px;color:${isToday?'var(--ac)':'var(--t3)'};font-weight:${isToday?'600':'400'}">${dayLabels[days[i].getDay()]}</div></div>`;}).join('');
        // Goal progress (avg)
        const gs=D.goals||[];
        const avgGoal=gs.length?Math.round(gs.reduce((s,g)=>s+(g.pct||0),0)/gs.length):0;
        // Habits today
        const hbs=(D.habits||[]).filter(h=>h.cadence==='Daily');
        const hbsDone=hbs.filter(h=>h.doneToday).length;
        const hbsPct=hbs.length?Math.round(hbsDone/hbs.length*100):0;
        // Active vs Done overall
        const totalActive=(D.tasks||[]).filter(t=>t.status!=='Done'&&t.status!=='Someday').length;
        const totalDone=(D.tasks||[]).filter(t=>t.status==='Done').length;
        const totalAll=totalActive+totalDone;
        const donePct=totalAll?Math.round(totalDone/totalAll*100):0;
        // Donut SVG (CSS-only ring)
        const ringStyle=`background:conic-gradient(var(--ok) 0% ${donePct}%, var(--s3) ${donePct}% 100%);width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative`;
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('barChart',15,'#3b82f6')} Reports & Insights</div><span class="cd-a" onclick="openExportPicker()">Export</span></div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;align-items:start">
            <div>
              <div style="font-size:11px;color:var(--t3);margin-bottom:18px">Tasks completed — last 7 days <strong style="color:var(--ac)">(${totalC} total)</strong></div>
              <div style="display:flex;align-items:flex-end;gap:5px;height:64px">${bars}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="${ringStyle}"><div style="width:48px;height:48px;background:var(--bg);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--ok)">${donePct}%</div></div>
                <div><div style="font-size:11px;font-weight:600">All-time done</div><div style="font-size:11px;color:var(--t3)">${totalDone} of ${totalAll} tasks</div></div>
              </div>
              <div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span>Goals avg</span><strong style="color:var(--ac)">${avgGoal}%</strong></div>
                <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${avgGoal}%;background:var(--ac);border-radius:3px"></div></div>
              </div>
              <div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span>Habits today</span><strong style="color:${hbsPct===100?'var(--ok)':'var(--warn)'}">${hbsDone}/${hbs.length||0}</strong></div>
                <div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${hbsPct}%;background:${hbsPct===100?'var(--ok)':'var(--warn)'};border-radius:3px"></div></div>
              </div>
            </div>
          </div>
        </div>`;
      })(),
      // ── 30-day Habit Heatmap ──
      habitHeatmap:(()=>{
        const days=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(29-i));return _ymd(d);});
        const habits=(D.habits||[]).filter(h=>h.cadence==='Daily');
        const cells=days.map(k=>{const total=habits.length;const done=habits.filter(h=>(h.completedDates||[]).includes(k)).length;const pct=total?done/total:0;const c=pct===0?'var(--s3)':(pct<.34?'rgba(34,197,94,.25)':(pct<.67?'rgba(34,197,94,.55)':'rgba(34,197,94,.95)'));return `<div title="${k}: ${done}/${total}" style="width:14px;height:14px;background:${c};border-radius:3px"></div>`;}).join('');
        const totalCompletions=habits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>days.includes(d)).length,0);
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('flame',15,'#ef4444')} Habit Heatmap</div><span class="cd-a" onclick="nav('habits')">All habits</span></div>
          <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Last 30 days · ${totalCompletions} completion${totalCompletions===1?'':'s'} across ${habits.length} habit${habits.length===1?'':'s'}</div>
          <div style="display:grid;grid-template-columns:repeat(15,1fr);gap:4px">${cells}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:11px;color:var(--t3)"><span>Less</span><div style="width:10px;height:10px;background:var(--s3);border-radius:2px"></div><div style="width:10px;height:10px;background:rgba(34,197,94,.25);border-radius:2px"></div><div style="width:10px;height:10px;background:rgba(34,197,94,.55);border-radius:2px"></div><div style="width:10px;height:10px;background:rgba(34,197,94,.95);border-radius:2px"></div><span>More</span></div>
        </div>`;
      })(),
      // ── Money snapshot (net worth · month cash flow · next bill) ──
      money:(typeof _finData==='function'?(()=>{
        try{
          const f=_finData(); const ym=_finYM(new Date());
          const inc=_finIncome(ym),sp=_finSpent(ym),net=_finNetWorth();
          const bills=(f.bills||[]).filter(b=>b.active!==false).map(b=>({b,due:_finBillNextDue(b)})).sort((a,b)=>a.due-b.due);
          const nb=bills[0];
          const budget=_finBudgetTotal(ym);
          const pct=budget?Math.min(100,Math.round(sp/budget*100)):0;
          return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('barChart',15,'#0d9488')} Money</div><span class="cd-a" onclick="nav('money')">Open Money</span></div>
            <div style="display:flex;gap:14px;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd1);margin-bottom:8px">
              <div style="text-align:center"><div style="font-size:19px;font-weight:750;color:${net>=0?'var(--ok)':'var(--red)'}">${_finFmt(net,0)}</div><div style="font-size:10px;color:var(--t3);text-transform:uppercase">Net worth</div></div>
              <div style="text-align:center"><div style="font-size:19px;font-weight:750;color:${inc-sp>=0?'var(--ok)':'var(--red)'}">${_finFmt(inc-sp,0)}</div><div style="font-size:10px;color:var(--t3);text-transform:uppercase">Cash flow</div></div>
            </div>
            ${budget?`<div style="font-size:11px;color:var(--t2);margin-bottom:4px">Spent ${_finFmt(sp,0)} of ${_finFmt(budget,0)} budget</div><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:${pct}%;background:${sp>budget?'var(--red)':pct>85?'var(--warn)':'var(--ok)'}"></div></div>`:''}
            ${nb?`<div style="font-size:11px;color:var(--t2)">Next bill: <b>${esc(nb.b.name)}</b> · ${nb.due.toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${_finFmt(nb.b.amount,0)}</div>`:'<div style="font-size:11px;color:var(--t3)">No bills set up yet.</div>'}
          </div>`;
        }catch(_){return '';}
      })():''),
      // ── 14-day Mood Trend (from journal) ──
      moodTrend:(()=>{
        const moodMap={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};
        const days=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));return d;});
        const dayKey=d=>_ymd(d);
        const series=days.map(d=>{const k=dayKey(d);const e=(D.journal||[]).find(j=>j.date===k);return {date:k,mood:e?e.mood:null,score:e&&moodMap[e.mood]?moodMap[e.mood]:null};});
        const max=5,min=1;
        const points=series.map((s,i)=>{const x=i/(series.length-1)*100;const y=s.score?100-((s.score-min)/(max-min))*90-5:null;return {x,y,score:s.score,date:s.date,mood:s.mood};});
        const validPts=points.filter(p=>p.y!==null);
        const path=validPts.length>1?'M '+validPts.map(p=>`${p.x},${p.y}`).join(' L '):'';
        const dots=points.map(p=>p.y!==null?`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--ac)"><title>${p.date}: ${p.mood} (${p.score}/5)</title></circle>`:'').join('');
        const avgScore=validPts.length?(validPts.reduce((s,p)=>s+p.score,0)/validPts.length).toFixed(1):'—';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('activity',15,'#14b8a6')} Mood Trend</div><span class="cd-a" onclick="nav('journal')">Open journal</span></div>
          <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Last 14 days · avg ${avgScore}/5 from ${validPts.length} entr${validPts.length===1?'y':'ies'}</div>
          ${validPts.length?`<svg viewBox="0 0 100 60" style="width:100%;height:80px;overflow:visible" preserveAspectRatio="none"><path d="${path}" stroke="var(--ac)" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke"/>${dots}</svg>`:'<div style="font-size:11px;color:var(--t3);padding:14px;text-align:center">Write journal entries with a mood to see your trend.</div>'}
        </div>`;
      })(),
      // ── Recent Mind Maps ──
      mindmaps:(()=>{
        const mode=getHomeCardMode('mindmaps');
        let maps;
        if(mode==='biggest'){
          maps=(D.mindmaps||[]).slice().sort((a,b)=>(b.nodes||[]).length-(a.nodes||[]).length).slice(0,5);
        }else{ // 'recent' default
          maps=(D.mindmaps||[]).slice(-5).reverse();
        }
        const body=maps.length?maps.map(m=>`<div class="lr" style="cursor:pointer" onclick="nav('mindmaps');setTimeout(()=>typeof mmOpen==='function'&&mmOpen(${m.id}),100)"><span style="font-size:14px;flex-shrink:0">🧠</span><span class="rt" style="font-size:11px">${esc(m.title||m.name||'Untitled')}</span><span class="rm">${(m.nodes||[]).length} nodes</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No mind maps yet.<br><span style="color:var(--ac);cursor:pointer" onclick="nav(\'mindmaps\')">Create one →</span></div>';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('brain',15,'#ec4899')} Mind Maps</div><span class="cd-a" onclick="nav('mindmaps')">View all</span></div>${body}<div class="add-c" onclick="nav('mindmaps')">+ New Mind Map</div></div>`;
      })(),
      // ── Recent Bookmarks ──
      bookmarks:(()=>{
        const mode=getHomeCardMode('bookmarks');
        let bks;
        if(mode==='pinned'){
          bks=(D.bookmarks||[]).slice().sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||((Date.parse(b.createdAt||0)||b.id||0)-(Date.parse(a.createdAt||0)||a.id||0))).slice(0,5);
        }else{ // 'recent' default
          bks=(D.bookmarks||[]).slice().sort((a,b)=>(Date.parse(b.createdAt||0)||b.id||0)-(Date.parse(a.createdAt||0)||a.id||0)).slice(0,5);
        }
        const body=bks.length?bks.map(b=>`<div class="lr" style="cursor:pointer" onclick="_luOpenUrl('${_jsAttr(b.url||'')}')" title="${esc(b.url||'')}"><span style="font-size:14px;flex-shrink:0">🔖</span><span class="rt" style="font-size:11px">${esc(b.title||b.url||'(untitled)')}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No bookmarks yet.<br><span style="color:var(--ac);cursor:pointer" onclick="nav(\'bookmarks\')">Add one →</span></div>';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">🔖 Bookmarks</div><span class="cd-a" onclick="nav('bookmarks')">View all</span></div>${body}</div>`;
      })(),
      // ── Upcoming Deadlines (horizon configurable per-card mode) ──
      deadlines:(()=>{
        const mode=getHomeCardMode('deadlines');
        const horizonDays=mode==='7d'?7:mode==='30d'?30:14;
        const tasksOnly=mode==='tasks14d';
        const today=_ymd(new Date());
        const horizon=new Date();horizon.setDate(horizon.getDate()+horizonDays);const horizonKey=_ymd(horizon);
        const items=[];
        (D.tasks||[]).forEach(t=>{if(t.status!=='Done'&&t.due&&t.due>=today&&t.due<=horizonKey)items.push({type:'task',id:t.id,title:t.title,date:t.due,priority:t.priority||'Medium'});});
        if(!tasksOnly){
          (D.goals||[]).forEach(g=>{if(g.dueDate&&g.dueDate>=today&&g.dueDate<=horizonKey)items.push({type:'goal',id:g.id,title:(g.icon||'🎯')+' '+g.title,date:g.dueDate});});
          (D.projects||[]).forEach(p=>{if(p.due&&p.due!=='TBD'&&p.due>=today&&p.due<=horizonKey)items.push({type:'project',id:p.id,title:'📁 '+p.name,date:p.due});});
        }
        items.sort((a,b)=>a.date.localeCompare(b.date));
        const top=items.slice(0,8);
        const body=top.length?top.map(it=>{const d=new Date(it.date+'T00:00');const days=Math.round((d-new Date(today+'T00:00'))/(1000*60*60*24));const rel=days===0?'Today':days===1?'Tomorrow':`In ${days}d`;const colorMap={High:'var(--red)',Medium:'var(--warn)',Low:'var(--ok)'};const dot=it.priority?`<span style="width:6px;height:6px;border-radius:50%;background:${colorMap[it.priority]||'var(--t3)'};flex-shrink:0"></span>`:'<span style="width:6px"></span>';const drawerType=it.type;return `<div class="lr" style="cursor:pointer" onclick="openDrawer('${_jsAttr(drawerType)}',D.${drawerType==='project'?'projects':drawerType+'s'}.find(x=>x.id==${_tidLit(it.id)}))">${dot}<span class="rt" style="font-size:11px">${esc(it.title)}</span><span style="font-size:11px;color:${days<=2?'var(--red)':'var(--t3)'}">${rel}</span></div>`;}).join(''):`<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No deadlines in the next ${horizonDays} days 🎉</div>`;
        const subLabel=tasksOnly?`Tasks · next ${horizonDays} days`:`Next ${horizonDays} days`;
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('clock',15,'currentColor')} Upcoming Deadlines</div><span class="cd-a">${subLabel}</span></div>${body}</div>`;
      })(),
      // ── Productivity Score (composite metric) ──
      productivityScore:(()=>{
        const todayKey=_ymd(new Date());
        const dailyHabits=(D.habits||[]).filter(h=>h.cadence==='Daily');
        const habsDone=dailyHabits.filter(h=>h.doneToday).length;
        const habsScore=dailyHabits.length?(habsDone/dailyHabits.length)*30:15;
        const tDone=(D.tasks||[]).filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===todayKey).length;
        const tasksScore=Math.min(tDone*8,40);
        const focusMins=(D.prefs&&D.prefs.focusMinsToday)||0;
        const focusScore=Math.min(focusMins/2,20);
        const ovd=(D.tasks||[]).filter(t=>t.status!=='Done'&&t.due&&t.due<todayKey).length;
        const overduePenalty=Math.min(ovd*2,10);
        const score=Math.max(0,Math.min(100,Math.round(habsScore+tasksScore+focusScore-overduePenalty+10)));
        const grade=score>=90?{l:'A+',c:'var(--ok)'}:score>=80?{l:'A',c:'var(--ok)'}:score>=70?{l:'B',c:'var(--ac)'}:score>=60?{l:'C',c:'var(--warn)'}:{l:'D',c:'var(--red)'};
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('barChart',15,'#3b82f6')} Productivity Score</div><span class="cd-a" onclick="nav('reports')">Reports</span></div>
          <div style="display:flex;gap:14px;align-items:center">
            <div style="text-align:center;flex-shrink:0">
              <div style="font-size:38px;font-weight:700;color:${grade.c};line-height:1">${score}</div>
              <div style="font-size:18px;color:${grade.c};font-weight:600">${grade.l}</div>
            </div>
            <div style="flex:1">
              <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden;margin-bottom:10px"><div style="height:100%;width:${score}%;background:${grade.c};border-radius:4px;transition:width .6s"></div></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--t2)">
                <div>✓ Tasks done: <strong>${tDone}</strong></div>
                <div>${_icon('flame',12,'#ef4444')} Habits:<strong>${habsDone}/${dailyHabits.length}</strong></div>
                <div>⏱ Focus: <strong>${focusMins}m</strong></div>
                <div style="color:${ovd>0?'var(--red)':'var(--t3)'}">⚠ Overdue: <strong>${ovd}</strong></div>
              </div>
            </div>
          </div>
        </div>`;
      })(),
      // ── Top Streaks (across habits + journal) ──
      streaks:(()=>{
        const items=[];
        (D.habits||[]).filter(h=>h.streak&&h.streak>0).forEach(h=>items.push({icon:h.icon||'🔥',title:h.title,count:h.streak,unit:'day',type:'habit'}));
        if(typeof calcJournalStreak==='function'){const s=calcJournalStreak();if(s>0)items.push({icon:'📔',title:'Journal',count:s,unit:'day',type:'journal'});}
        const streakMode=getHomeCardMode('streaks');
        items.sort((a,b)=>streakMode==='shortest'?a.count-b.count:b.count-a.count);
        const top=items.slice(0,6);
        const body=top.length?top.map(it=>`<div class="lr" style="padding:5px 0"><span style="font-size:14px;flex-shrink:0">${it.icon}</span><span class="rt" style="font-size:11px">${esc(it.title)}</span><span style="font-size:11px;color:var(--warn);font-weight:700;flex-shrink:0">🔥 ${it.count}${it.unit==='day'?'d':''}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No active streaks yet. Build one by checking off a habit daily.</div>';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('trophy',15,'#f59e0b')} Top Streaks</div><span class="cd-a" onclick="nav('habits')">All habits</span></div>${body}</div>`;
      })(),
      // ── Week Ahead (next 7 days mini-calendar) ──
      weekAhead:(()=>{
        const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()+i);return d;});
        const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const cells=days.map(d=>{const k=_ymd(d);const dayTasks=(D.tasks||[]).filter(t=>t.status!=='Done'&&(t.due===k||t.startDate===k));const dayEvents=_calMeetingsOn(k);const isToday=k===_ymd(new Date());return `<div style="border:1px solid ${isToday?'var(--ac)':'var(--bd1)'};border-radius:6px;padding:8px;background:${isToday?'rgba(59,130,246,.05)':'var(--s2)'};min-height:62px"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:${isToday?'var(--ac)':'var(--t2)'};margin-bottom:4px"><span>${weekdays[d.getDay()]}</span><span>${d.getDate()}</span></div>${dayTasks.length?`<div style="font-size:11px;color:var(--t1);margin-bottom:2px">📋 ${dayTasks.length}</div>`:''}${dayEvents.length?`<div style="font-size:11px;color:var(--t1)">📅 ${dayEvents.length}</div>`:''}${(!dayTasks.length&&!dayEvents.length)?'<div style="font-size:11px;color:var(--t3)">—</div>':''}</div>`;}).join('');
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('calendar',15,'#6366f1')} Week Ahead</div><span class="cd-a" onclick="nav('myweek')">My Week</span></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells}</div></div>`;
      })(),
      // ── Ideas Pipeline (counts by stage) ──
      ideasPipeline:(()=>{
        const ideas=D.ideas||[];
        const stages=[{k:'spark',label:'💥 Spark',c:'var(--warn)'},{k:'develop',label:'🌱 Develop',c:'var(--ac)'},{k:'stress_test',label:'🧪 Stress Test',c:'var(--purp)'},{k:'promoted',label:'🚀 Promoted',c:'var(--ok)'},{k:'parked',label:'⏸ Parked',c:'var(--t3)'},{k:'graveyard',label:'🪦 Graveyard',c:'var(--t3)'}];
        const counts=stages.map(s=>({...s,c2:s.c,n:ideas.filter(i=>i.stage===s.k).length}));
        const max=Math.max(...counts.map(c=>c.n),1);
        const body=ideas.length?counts.filter(c=>c.n>0).map(c=>`<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${c.label}</span><strong style="color:${c.c}">${c.n}</strong></div><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${c.n/max*100}%;background:${c.c};border-radius:3px"></div></div></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No ideas yet.<br><span style="color:var(--ac);cursor:pointer" onclick="nav(\'ideas\')">Capture one →</span></div>';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('lightbulb',15,'#eab308')} Ideas Pipeline</div><span class="cd-a" onclick="nav('ideas')">All ideas</span></div>${body}</div>`;
      })(),
      // ── Task Velocity (this week vs last week) ──
      taskVelocity:(()=>{
        const now=new Date();
        const thisStart=new Date();thisStart.setDate(thisStart.getDate()-7);
        const lastStart=new Date();lastStart.setDate(lastStart.getDate()-14);
        const thisKey=_ymd(thisStart);
        const lastKey=_ymd(lastStart);
        const thisWeek=(D.tasks||[]).filter(t=>t.status==='Done'&&(t.completedAt||'')>=thisKey).length;
        const lastWeek=(D.tasks||[]).filter(t=>t.status==='Done'&&(t.completedAt||'')>=lastKey&&(t.completedAt||'')<thisKey).length;
        const delta=thisWeek-lastWeek;
        const arrow=delta>0?'↑':delta<0?'↓':'→';
        const dColor=delta>0?'var(--ok)':delta<0?'var(--red)':'var(--t3)';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('zap',15,'#ef4444')} Task Velocity</div><span class="cd-a" onclick="nav('reports')">Reports</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center">
            <div style="background:var(--s2);border-radius:8px;padding:14px"><div style="font-size:24px;font-weight:700;color:var(--ac)">${thisWeek}</div><div style="font-size:11px;color:var(--t3)">This week</div></div>
            <div style="background:var(--s2);border-radius:8px;padding:14px"><div style="font-size:24px;font-weight:700;color:var(--t2)">${lastWeek}</div><div style="font-size:11px;color:var(--t3)">Last week</div></div>
          </div>
          <div style="text-align:center;margin-top:10px;font-size:13px;color:${dColor};font-weight:600">${arrow} ${Math.abs(delta)} task${Math.abs(delta)===1?'':'s'} ${delta>0?'more':delta<0?'less':'same'} than last week</div>
        </div>`;
      })(),
      // ── Tag Cloud (across tasks, notes, journal) ──
      tagCloud:(()=>{
        const freq={};
        (D.tasks||[]).forEach(t=>(t.tags||[]).forEach(tg=>{freq[tg]=(freq[tg]||0)+1;}));
        (D.notes||[]).forEach(n=>(n.tags||[]).forEach(tg=>{freq[tg]=(freq[tg]||0)+1;}));
        (D.journal||[]).forEach(j=>(j.tags||[]).forEach(tg=>{freq[tg]=(freq[tg]||0)+1;}));
        const arr=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,30);
        const max=arr.length?arr[0][1]:1;const min=arr.length?arr[arr.length-1][1]:1;const range=Math.max(max-min,1);
        const body=arr.length?arr.map(([t,c])=>{const sz=Math.round(10+(c-min)/range*8);const hue=Math.abs(t.split('').reduce((h,ch)=>h*31+ch.charCodeAt(0),0))%360;return `<span style="display:inline-block;padding:3px 9px;margin:3px;border-radius:12px;background:hsl(${hue},45%,30%);color:hsl(${hue},65%,80%);font-size:${sz}px;cursor:pointer" title="${c} item${c===1?'':'s'}">#${esc(t)}</span>`;}).join(''):'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No tags yet — add tags to tasks, notes, or journal entries.</div>';
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('tag',15,'#06b6d4')} Tag Cloud</div><span class="cd-a">${arr.length} unique</span></div><div style="line-height:1.8">${body}</div></div>`;
      })(),
      // 🌤 Weather — wttr.in / no key required. Cached for 30 mins.
      weather:(()=>{
        const loc=(D.prefs&&D.prefs.weatherLocation)||'';
        const cached=(D.prefs&&D.prefs.weatherCache)||null;
        const fresh=cached&&(Date.now()-cached.ts<30*60*1000);
        if(!loc){
          return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('cloud',15,'#38bdf8')} Weather</div></div><div style="padding:10px 4px;font-size:11px;color:var(--t3);text-align:center"><div style="margin-bottom:6px">Set your city to see the forecast.</div><input id="home-weather-loc" class="inp" placeholder="e.g. New York" style="font-size:11px;margin-bottom:6px" onkeydown="if(event.key==='Enter')_setWeatherLoc(this.value)"><button class="btn btn-p" style="font-size:11px;height:24px" onclick="_setWeatherLoc(document.getElementById('home-weather-loc').value)">Save</button></div></div>`;
        }
        if(fresh&&cached.data){
          const w=cached.data;
          return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('cloud',15,'#38bdf8')} Weather</div><span class="cd-a" onclick="_refreshWeather()" title="Refresh">↻ ${esc(loc)}</span></div>
            <div style="display:flex;align-items:center;gap:14px;padding:6px 4px">
              <div style="font-size:48px;line-height:1">${esc(w.icon||'☀')}</div>
              <div style="flex:1">
                <div style="font-size:28px;font-weight:800;line-height:1">${esc(w.temp||'?')}°</div>
                <div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(w.desc||'')}</div>
                <div style="font-size:11px;color:var(--t3);margin-top:4px">Feels ${esc(w.feels||'?')}° · 💧 ${esc(w.humidity||'0')}% · 💨 ${esc(w.wind||'0')} mph</div>
              </div>
            </div></div>`;
        }
        // Trigger a refresh in the background; show a placeholder for now.
        if(!fresh)setTimeout(_refreshWeather,200);
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('cloud',15,'#38bdf8')} Weather</div></div><div style="padding:10px 4px;font-size:11px;color:var(--t3);text-align:center">Loading ${esc(loc)}…</div></div>`;
      })(),
      // 💭 Quote of the day — day-of-year seeded so it's stable through the day.
      quoteOfDay:(()=>{
        const QUOTES=[
          {q:"What we do every day matters more than what we do once in a while.",a:"Gretchen Rubin"},
          {q:"You don't rise to the level of your goals, you fall to the level of your systems.",a:"James Clear"},
          {q:"It's not always that we need to do more but rather that we need to focus on less.",a:"Nathan W. Morris"},
          {q:"The future depends on what you do today.",a:"Mahatma Gandhi"},
          {q:"Done is better than perfect.",a:"Sheryl Sandberg"},
          {q:"You can't depend on your eyes when your imagination is out of focus.",a:"Mark Twain"},
          {q:"Action is the foundational key to all success.",a:"Pablo Picasso"},
          {q:"The secret of getting ahead is getting started.",a:"Mark Twain"},
          {q:"Don't watch the clock; do what it does. Keep going.",a:"Sam Levenson"},
          {q:"Quality is not an act, it is a habit.",a:"Aristotle"},
          {q:"The best time to plant a tree was 20 years ago. The second best time is now.",a:"Chinese proverb"},
          {q:"You are what you repeatedly do. Excellence is not an act but a habit.",a:"Will Durant"},
          {q:"Discipline equals freedom.",a:"Jocko Willink"},
          {q:"Energy and persistence conquer all things.",a:"Benjamin Franklin"},
          {q:"The mind is everything. What you think you become.",a:"Buddha"},
          {q:"Do the hard jobs first. The easy jobs will take care of themselves.",a:"Dale Carnegie"},
          {q:"It is during our darkest moments that we must focus to see the light.",a:"Aristotle"},
          {q:"Whether you think you can or you think you can't, you're right.",a:"Henry Ford"},
          {q:"The only way to do great work is to love what you do.",a:"Steve Jobs"},
          {q:"Be the change you want to see in the world.",a:"Mahatma Gandhi"},
          {q:"Tomorrow becomes never. No matter how small the task, take the first step now.",a:"Tim Ferriss"},
          {q:"Slow is smooth, smooth is fast.",a:"Navy SEAL adage"},
          {q:"You miss 100% of the shots you don't take.",a:"Wayne Gretzky"},
          {q:"Compound interest is the eighth wonder of the world.",a:"Albert Einstein"},
          {q:"Focus on being productive instead of busy.",a:"Tim Ferriss"},
          {q:"It does not matter how slowly you go as long as you do not stop.",a:"Confucius"},
          {q:"Either you run the day or the day runs you.",a:"Jim Rohn"},
          {q:"Productivity is never an accident. It is always the result of a commitment to excellence.",a:"Paul J. Meyer"},
          {q:"Small things become big things only when you do them every day.",a:"unknown"},
          {q:"The only impossible journey is the one you never begin.",a:"Tony Robbins"},
        ];
        const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0).getTime())/86400000);
        const q=QUOTES[doy%QUOTES.length];
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('quote',15,'#a78bfa')} Quote of the Day</div></div>
          <div style="padding:6px 4px">
            <div style="font-size:14px;color:var(--t1);line-height:1.5;font-style:italic;quotes:'\\201C''\\201D'">${esc(q.q)}</div>
            <div style="font-size:11px;color:var(--t3);margin-top:8px;text-align:right">— ${esc(q.a)}</div>
          </div></div>`;
      })(),
      // 📸 On this day — past tasks/journal/notes from the same month-day in previous years.
      yesteryear:(()=>{
        const now=new Date();const mm=String(now.getMonth()+1).padStart(2,'0');const dd=String(now.getDate()).padStart(2,'0');const todayKey=`${mm}-${dd}`;const thisYear=now.getFullYear();
        const items=[];
        (D.tasks||[]).forEach(t=>{const k=_dayOf(t.completedAt||t.due||t.createdAt);if(!k)return;const y=Number(k.slice(0,4));if(y<thisYear&&k.slice(5,10)===todayKey)items.push({type:'task',title:t.title,year:y,when:k});});
        (D.journal||[]).forEach(j=>{const k=(j.date||'').slice(0,10);if(!k)return;const y=Number(k.slice(0,4));if(y<thisYear&&k.slice(5,10)===todayKey)items.push({type:'journal',title:j.title||(j.body||'').slice(0,80),year:y,when:k});});
        (D.notes||[]).forEach(n=>{const k=(n.created||n.updated||'').slice(0,10);if(!k)return;const y=Number(k.slice(0,4));if(y<thisYear&&k.slice(5,10)===todayKey)items.push({type:'note',title:n.title,year:y,when:k});});
        items.sort((a,b)=>b.year-a.year);
        if(!items.length){return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('camera',15,'#f472b6')} On this day</div></div><div style="padding:12px 4px;font-size:11px;color:var(--t3);text-align:center">Nothing yet from previous years — come back next year!</div></div>`;}
        const ICONS={task:'✓',journal:'✏',note:'📝'};
        const body=items.slice(0,5).map(it=>`<div class="lr" style="padding:4px 2px"><span style="font-size:11px;flex-shrink:0">${ICONS[it.type]}</span><span class="rt" style="font-size:11px;color:var(--t1)">${esc(it.title||'(untitled)')}</span><span style="font-size:11px;color:var(--t3);white-space:nowrap">${thisYear-it.year}y ago</span></div>`).join('');
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('camera',15,'#f472b6')} On this day</div><span class="cd-a">${items.length} memor${items.length===1?'y':'ies'}</span></div>${body}</div>`;
      })(),
      // 🧠 AI Insight — cached daily, calls ai.assist with a workspace snapshot.
      aiInsight:(()=>{
        const cache=(D.prefs&&D.prefs.aiInsightCard)||null;
        const today=_ymd(new Date());
        const fresh=cache&&cache.date===today&&cache.text;
        if(fresh){
          return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('sparkles',15,'#8b5cf6')} AI Insight</div><span class="cd-a" onclick="_refreshAIInsight()" title="Generate fresh insight">↻ refresh</span></div><div style="padding:8px 4px;font-size:12px;color:var(--t1);line-height:1.55">${esc(cache.text)}</div><div style="font-size:11px;color:var(--t3);margin-top:6px;text-align:right">Updated ${esc(cache.date)}</div></div>`;
        }
        if(!cache||cache.date!==today)setTimeout(_refreshAIInsight,800);
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('sparkles',15,'#8b5cf6')} AI Insight</div></div><div style="padding:14px 4px;font-size:11px;color:var(--t3);text-align:center">⏳ Generating today's insight…</div></div>`;
      })(),
      // 🎯 Peak Focus Hour — analyses D.prefs.focusLog to find the best-performing hour.
      focusSuggestion:(()=>{
        const fl=(D.prefs&&D.prefs.focusLog)||{};
        const hourly=(D.prefs&&D.prefs.focusByHour)||{};
        const hours=Object.entries(hourly).sort((a,b)=>b[1]-a[1]).slice(0,3);
        if(!hours.length){
          // Fall back to total focus across days
          const total=Object.values(fl).reduce((a,b)=>a+(Number(b)||0),0);
          return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('target',15,'#ef4444')} Peak Focus Hour</div></div><div style="padding:8px 4px;font-size:11px;color:var(--t3);text-align:center">Use the Focus timer for a few sessions and we'll surface your most productive hours here.<br><span style="display:block;margin-top:6px;font-size:11px">${total} minutes logged so far.</span></div></div>`;
        }
        const fmt=h=>{const n=Number(h);const ap=n>=12?'pm':'am';const h12=((n%12)||12);return h12+ap;};
        const top=hours[0];
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('target',15,'#ef4444')} Peak Focus Hour</div></div>
          <div style="padding:4px;font-size:12px;color:var(--t1);line-height:1.55">
            Your peak focus is around <strong style="color:var(--page-accent)">${fmt(top[0])}</strong> — ${top[1]} minutes logged in this hour across all sessions.
            <div style="font-size:11px;color:var(--t3);margin-top:8px">Other strong hours: ${hours.slice(1).map(h=>fmt(h[0])+' ('+h[1]+'m)').join(' · ')||'(none yet)'}</div>
            <button class="btn btn-s" style="margin-top:8px;font-size:11px;height:24px" onclick="nav('focus')">Start a focus session →</button>
          </div></div>`;
      })(),
      // 🧹 Stale Content (#11) — surfaces notes / open tasks / goals untouched
      // for >30 days so the user can decide if they're still relevant. The "✓"
      // button stamps `lastTouchedAt=now` to suppress the item for another 30d.
      staleContent:(()=>{
        const stMode=getHomeCardMode('staleContent');
        const cutoff=Date.now()-30*86400000;
        const ts=it=>{const v=it.lastTouchedAt||it.updated||it.updatedAt||it.createdAt||0;const n=typeof v==='number'?v:Date.parse(v);return Number.isFinite(n)?n:0;};
        const stale=[];
        if(stMode!=='tasksOnly'){
          (D.notes||[]).forEach(n=>{const t=ts(n);if(t&&t<cutoff)stale.push({type:'note',icon:'📝',id:n.id,title:n.title||'(untitled note)',ago:Math.floor((Date.now()-t)/86400000)});});
        }
        if(stMode!=='notesOnly'){
          (D.tasks||[]).filter(t=>t.status!=='Done'&&t.status!=='Someday').forEach(t=>{const u=ts(t);if(u&&u<cutoff)stale.push({type:'task',icon:'📋',id:t.id,title:t.title||'(untitled task)',ago:Math.floor((Date.now()-u)/86400000)});});
        }
        if(stMode!=='tasksOnly'&&stMode!=='notesOnly'){
          (D.goals||[]).forEach(g=>{const u=ts(g);if(u&&u<cutoff&&(g.pct||0)<100)stale.push({type:'goal',icon:'🎯',id:g.id,title:g.title||'(untitled goal)',ago:Math.floor((Date.now()-u)/86400000)});});
        }
        // 'oldest' default sorts by largest ago first; 'newest' flips it.
        stale.sort((a,b)=>stMode==='newest'?a.ago-b.ago:b.ago-a.ago);
        if(!stale.length)return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('trash',15,'#f59e0b')} Stale Content</div></div><div style="padding:18px 4px;font-size:11px;color:var(--t3);text-align:center">Nothing stale — your workspace is fresh. ✨</div></div>`;
        const top=stale.slice(0,8);
        const rows=top.map(it=>`<div class="lr" style="cursor:pointer;align-items:center;gap:6px" onclick="_staleOpen('${_jsAttr(it.type)}',${it.id})" title="Open ${it.type}">
          <span style="font-size:13px;flex-shrink:0">${it.icon}</span>
          <span class="rt" style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.title)}</span>
          <span style="font-size:11px;color:var(--t3);flex-shrink:0">${it.ago}d</span>
          <button class="btn btn-s" style="height:18px;width:22px;padding:0;font-size:10px;flex-shrink:0" onclick="event.stopPropagation();_staleTouch('${_jsAttr(it.type)}',${it.id})" title="Mark as still relevant — hide for 30 more days">✓</button>
        </div>`).join('');
        return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('trash',15,'#f59e0b')} Stale Content</div><span class="cd-a">${stale.length} item${stale.length===1?'':'s'} >30d old</span></div>${rows}</div>`;
      })()
    };
    const visCards=_homeOrder.filter(id=>_homeVisible.has(id)&&cardHtml[id]);
    // Append pinned report widgets (D.prefs.homePinnedWidgets) so users can
    // surface their custom analytics on the Home dashboard alongside the
    // standard cards. Each pinned widget reuses _renderWidget() with its
    // own unpin button so they're easy to manage from Home directly.
    const pinned=(D.prefs&&D.prefs.homePinnedWidgets)||[];
    let pinnedHtml='';
    if(pinned.length&&typeof _renderWidget==='function'){
      pinnedHtml=`<div style="margin-top:14px"><div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;display:flex;align-items:center;gap:6px">📌 Pinned widgets <span style="font-size:11px;font-weight:400;color:var(--t3)">— pinned from Reports</span></div><div style="display:grid;grid-template-columns:repeat(12,1fr);gap:10px">${pinned.map((w,i)=>{
        // Save the original widget context, render via the widget engine,
        // then inject an Unpin button after the title row.
        const saved=_reportWidgets;_reportWidgets=pinned;
        let html=_renderWidget(w,i);
        _reportWidgets=saved;
        // Replace the report-context toolbar with a smaller Unpin-only toolbar
        html=html.replace(/<div class="no-print"[\s\S]*?<\/div>\s*<\/div>/, `<div class="no-print" style="display:flex;gap:3px"><button class="btn btn-s" style="height:22px;font-size:11px;color:var(--ac)" onclick="nav('reports')" title="Edit in Reports">✏</button><button class="btn btn-d" style="height:22px;font-size:11px" onclick="unpinHomeWidget(${w.id})" title="Unpin">✕</button></div></div>`);
        // Make pinned widgets non-draggable on Home (drag handlers reference _reportWidgets which would be wrong).
        html=html.replace(/draggable="true"[^>]*?ondragstart="[^"]*"[^>]*?ondragover="[^"]*"[^>]*?ondragleave="[^"]*"[^>]*?ondrop="[^"]*"[^>]*?ondragend="[^"]*"/,'draggable="false"');
        return html;
      }).join('')}</div></div>`;
    }
    // Drag-to-reorder: wrap every card so it can be dragged. The drag
    // handle is on a tiny ⋮⋮ pill in the top-right of each card. Reorder
    // persists to D.prefs.homeCards via _moveHomeCard().
    const wrapped=visCards.map((id,i)=>`<div class="home-card-wrap" data-home-id="${esc(id)}" draggable="true" ondragstart="_homeDragStart(event,'${esc(id)}')" ondragover="_homeDragOver(event,'${esc(id)}')" ondragleave="_homeDragLeave(event)" ondrop="_homeDrop(event,'${esc(id)}')" ondragend="_homeDragEnd(event)" style="position:relative">
      <span class="home-card-drag" title="Drag to reorder" style="position:absolute;top:6px;right:8px;font-size:11px;color:var(--t3);background:var(--s3);border-radius:4px;padding:2px 5px;cursor:grab;opacity:0;transition:opacity .12s;z-index:5">⋮⋮</span>
      ${cardHtml[id]}
    </div>`).join('');
    return `<div class="g3" id="home-grid">${wrapped}</div>${pinnedHtml}`;
  })()}`;
  // Build 7-day focus chart data
  const _focusLog=D.prefs&&D.prefs.focusLog||{};
  const _chartDays=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return d;});
  const _dayNames=['S','M','T','W','T','F','S'];
  const _chartVals=_chartDays.map(d=>_focusLog[_ymd(d)]||0);
  const _chartMax=Math.max(..._chartVals,1);
  const _todayIdx=6;
  const focusChartHtml=`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:12px;font-weight:600">⏱ Focus Time (7 days)</span><span style="font-size:11px;color:var(--t3)">${_chartVals.reduce((a,b)=>a+b,0)}m total</span></div><div style="display:flex;align-items:flex-end;gap:4px;height:52px">${_chartVals.map((v,i)=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:100%;background:${i===_todayIdx?'var(--ac)':'var(--s3)'};border-radius:3px 3px 0 0;height:${Math.round((v/_chartMax)*40)+2}px;min-height:2px;transition:height .3s" title="${v}m"></div><div style="font-size:9px;color:${i===_todayIdx?'var(--ac)':'var(--t3)'}">${_dayNames[_chartDays[i].getDay()]}</div></div>`).join('')}</div></div>`;
  // Daily cross-source command-center card — Today across CF / LSI / Personal.
  // Always rendered on Home; collapses to a single line when external sources
  // aren't configured yet (still useful as a personal-tasks-today summary).
  const dailyCommandCenterHtml=_renderDailyCommandCenterCard();
  r.innerHTML=dailyCommandCenterHtml+focusChartHtml+`${_homeVisible.has('meetings')?`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;font-weight:600">Upcoming Meetings</span><span class="cd-a" onclick="nav('calendar')">View calendar</span></div>
  ${(()=>{const now=new Date();const ev=_upcomingCalEvents(4);if(!ev.length)return '<div style="font-size:11px;color:var(--t3);padding:6px 0">No upcoming meetings.</div>';const fmtT=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});return ev.map(o=>{const s=o.start,en=o.end;const range=en?fmtT(s)+'–'+fmtT(en):fmtT(s);const mins=Math.floor((s-now)/60000);const rel=mins<60?'In '+mins+'m':mins<1440?'In '+Math.floor(mins/60)+'h':'In '+Math.floor(mins/1440)+'d';return '<div class="lr"><span style="font-size:14px">📅</span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500">'+esc(o.e.title||'(untitled)')+'</div><div style="font-size:11px;color:var(--t3)">'+range+'</div></div><span style="font-size:11px;padding:2px 5px;border-radius:3px;background:var(--acs);color:var(--ach)">'+rel+'</span></div>';}).join('');})()}</div>`:''}
  ${_homeVisible.has('habits')?`<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;font-weight:600">Today's Habits</span><span class="cd-a" onclick="nav('habits')">View all</span></div>
  ${D.habits.filter(h=>{const sd=typeof _habitScheduledDays==='function'?_habitScheduledDays(h):null;return sd?sd.has(new Date().getDay()):h.cadence==='Daily';}).map(h=>`<div class="lr"><div class="chk ${h.doneToday?'on':''}" onclick="event.stopPropagation();toggleHabit(${_tidLit(h.id)});renderScreen('home')"></div><span class="rt">${h.icon} ${esc(h.title)}</span><span style="font-size:11px;color:var(--warn)">🔥${h.streak}</span></div>`).join('')}</div>`:''}
  ${(()=>{
    if(!_homeVisible.has('recent'))return '';
    const typeIcon={task:'📋',note:'📝',project:'📁',goal:'🎯',journal:'📔',habit:'⚡'};
    const typeColor={task:'var(--ac)',note:'var(--ok)',project:'var(--warn)',goal:'var(--red)',journal:'#a78bfa',habit:'#fb923c'};
    const recent=[];
    D.tasks.forEach(x=>{if(x.createdAt)recent.push({type:'task',title:x.title,ts:x.createdAt,id:x.id,obj:x});});
    D.notes.forEach(x=>{if(x.createdAt)recent.push({type:'note',title:x.title,ts:x.createdAt,id:x.id,obj:x});});
    D.goals.forEach(x=>{if(x.createdAt)recent.push({type:'goal',title:x.title,ts:x.createdAt,id:x.id,obj:x});});
    D.projects.forEach(x=>{if(x.createdAt)recent.push({type:'project',title:x.name,ts:x.createdAt,id:x.id,obj:x});});
    D.habits.forEach(x=>{if(x.createdAt)recent.push({type:'habit',title:x.title,ts:x.createdAt,id:x.id,obj:x});});
    recent.sort((a,b)=>b.ts.localeCompare(a.ts));
    const top=recent.slice(0,7);
    if(!top.length)return '';
    const fmtTs=ts=>{const d=_pd(ts);const now=new Date();const diff=Math.floor((now-d)/60000);if(diff<1)return 'just now';if(diff<60)return diff+'m ago';if(diff<1440)return Math.floor(diff/60)+'h ago';return Math.floor(diff/1440)+'d ago';};
    return `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:600">🕐 Recently Added</span></div>${top.map(r=>`<div class="lr" onclick="openDrawer('${_jsAttr(r.type)}',D.${r.type==='project'?'projects':r.type==='habit'?'habits':r.type+'s'}.find(x=>x.id==${_tidLit(r.id)}))" style="cursor:pointer" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background=''"><span style="width:18px;height:18px;border-radius:4px;background:${typeColor[r.type]}22;color:${typeColor[r.type]};font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${typeIcon[r.type]}</span><span class="rt" style="font-size:11px">${esc(r.title)}</span><span style="font-size:11px;color:var(--t3);flex-shrink:0">${fmtTs(r.ts)}</span></div>`).join('')}</div>`;
  })()}
  ${(()=>{
    if(!_homeVisible.has('pinned')||!D.prefs.pinned||!D.prefs.pinned.length)return '';
    const typeIcon={task:'📋',note:'📝',project:'📁',goal:'🎯',journal:'📔',habit:'⚡'};
    const typeColor={task:'var(--ac)',note:'var(--ok)',project:'var(--warn)',goal:'var(--red)',journal:'#a78bfa',habit:'#fb923c'};
    const rows=D.prefs.pinned.map(p=>{
      const arr=p.type==='project'?D.projects:p.type==='habit'?D.habits:D[p.type+'s'];
      const item=arr&&arr.find(x=>x.id===p.id);
      if(!item)return '';
      const label=item.title||item.name||'Untitled';
      return `<div class="lr" onclick="openDrawer('${_jsAttr(p.type)}',D.${p.type==='project'?'projects':p.type==='habit'?'habits':p.type+'s'}.find(x=>x.id==${_tidLit(p.id)}))" style="cursor:pointer" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background=''"><span style="width:18px;height:18px;border-radius:4px;background:${typeColor[p.type]}22;color:${typeColor[p.type]};font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${typeIcon[p.type]}</span><span class="rt" style="font-size:11px">${esc(label)}</span><span style="font-size:11px;color:var(--t3);cursor:pointer" onclick="event.stopPropagation();togglePin('${_jsAttr(p.type)}',${p.id})" title="Unpin">📌</span></div>`;
    }).filter(Boolean).join('');
    if(!rows)return '';
    return `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:600">📌 Pinned</span></div>${rows}</div>`;
  })()}`;
  // Kick AI Daily Focus generation if cache is stale and not already in
  // flight. Fire-and-forget — the render call inside _refreshDailyFocusAI
  // will re-render Home when results land.
  try{
    const todayKey=_ymd(new Date());
    const cache=(D.prefs&&D.prefs.dailyFocusAI)||null;
    const stale=!cache||cache.date!==todayKey;
    if(stale&&!(cache&&cache.pending)&&typeof _refreshDailyFocusAI==='function'){
      // Defer slightly so the Home render isn't blocked by the AI call setup.
      setTimeout(()=>_refreshDailyFocusAI(),700);
    }
  }catch{ /* never break Home */ }
}
function renderGoalCards(max){return `<div class="cd"><div class="cd-h"><div class="cd-t">${_icon('target',15,'#dc2626')} Goals</div><span class="cd-a" onclick="nav('goals')">View all</span></div>${D.goals.slice(0,max).map(g=>`<div class="lr" onclick="openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))"><span class="rt">${g.icon} ${esc(g.title)}</span><span class="rm">${g.pct}%</span><div class="pb" style="width:40px"><div class="f" style="width:${g.pct}%;background:var(--ac)"></div></div></div>`).join('')}<div class="add-c" onclick="openModal('capture')">+ New Goal</div></div>`}

// Module-level task list state so tab clicks work after renderTasks() returns
let _taskTabDefs=null;
// Persisted page state (Tasks/Notes/Projects views + sorts) — synced across
// devices via D.prefs.pageViews, written through the existing prefs save path.
function _restorePageState(page){return (D&&D.prefs&&D.prefs.pageViews&&D.prefs.pageViews[page])||{};}
function _persistPageState(page,patch){if(!D)return;D.prefs=D.prefs||{};D.prefs.pageViews=D.prefs.pageViews||{};D.prefs.pageViews[page]=Object.assign({},D.prefs.pageViews[page]||{},patch);try{save('prefs');}catch(_){try{localStorage.setItem('lu_prefs',JSON.stringify(D.prefs));}catch(__){}}}
const _tasksRestored=_restorePageState('tasks');
let _taskFilter=t=>t.status!=='Done'&&t.status!=='Someday'; // resolved against _taskTabDefs at first render via _taskFilterTabIdx
let _taskFilterTabIdx=typeof _tasksRestored.tabIdx==='number'?_tasksRestored.tabIdx:0;
let _taskMyOnly=_tasksRestored.myOnly===true;
// Drill-through filter set by Command Center → Tasks. Project label (matches
// row.project on both native and external rows). Cleared via the chip ✕.
let _taskProjectFilter=null;
// Drill-through kind filter set by Command Center At-Risk badge clicks.
// One of 'overdue' | 'today' | 'stalled' | null. Cleared via the chip ✕.
let _taskKindFilter=null;
let _taskView=_tasksRestored.view||'clusters'; // 'list' | 'board' | 'matrix' | 'gantt' | 'calendar' | 'clusters'
let _taskCalCursor=null; // YYYY-MM string for calendar nav
function renderCurrentTaskView(){
  // Render the read-only "Shared with you" section above the view (it lives in
  // a sibling container, so it persists no matter which view renders below).
  if(typeof _renderSharedTasksSection==='function')_renderSharedTasksSection();
  if(_taskView==='board')return renderTaskBoard();
  if(_taskView==='matrix')return renderTaskMatrix();
  if(_taskView==='gantt')return renderTaskGantt();
  if(_taskView==='calendar')return renderTaskCalendar();
  if(_taskView==='clusters')return renderTaskClusters();
  if(_taskView==='focus')return renderTaskFocus();
  if(_taskView==='cards')return renderTaskCards();
  return renderTaskList();
}
// Generic dropdown-menu toggle. Closes on the next outside click.
function togglePopMenu(menuId){
  const m=document.getElementById(menuId);
  if(!m)return;
  const willOpen=m.style.display==='none'||m.style.display==='';
  // Close any other open pop-menus first
  document.querySelectorAll('[data-pop-menu="1"]').forEach(el=>{if(el.id!==menuId)el.style.display='none';});
  m.style.display=willOpen?'block':'none';
  if(willOpen)setTimeout(()=>document.addEventListener('click',()=>{m.style.display='none';},{once:true}),0);
}
function closePopMenu(menuId){const m=document.getElementById(menuId);if(m)m.style.display='none';}
// Backwards-compatible aliases (still referenced by inline onclicks generated earlier)
function toggleTaskAIMenu(e){togglePopMenu('task-ai-menu');}
function closeTaskAIMenu(){closePopMenu('task-ai-menu');}
function setTaskView(v){
  _taskView=v;
  _persistPageState('tasks',{view:v});
  ['list','board','matrix','gantt','calendar','clusters','focus','cards'].forEach(k=>{
    const b=document.getElementById('tasks-view-'+k);
    if(!b)return;
    const on=k===v;
    b.style.background=on?'var(--ac)':'transparent';
    b.style.color=on?'#fff':'var(--t2)';
  });
  renderCurrentTaskView();
}
// Wrapper helpers so the inline tab/scope/priority handlers can persist too.
function setTaskScope(my){_taskMyOnly=!!my;_persistPageState('tasks',{myOnly:_taskMyOnly});if(typeof renderTasks==='function')renderTasks();}

// ─── Nested-subtask helpers ────────────────────────────────────────────────
// A task is a "subtask" if its parentTaskId points at another task. The
// flat-JSON t.subtasks array is the legacy storage; child task rows are
// the new shape. Both coexist during a soak period — drawer renders both,
// main views hide child rows so backfilled subtasks don't double-appear
// as standalone tasks in List/Board/Matrix/etc.
function _isSubtaskRow(t){ return !!(t&&t.parentTaskId); }
function _topLevelTasks(arr){ return (arr||[]).filter(t=>!_isSubtaskRow(t)); }

// ── Team-visibility (shared-workspace): tasks ASSIGNED to me by other members
//    (or, for admins, every other member's tasks). They live in another user's
//    blob, so they are kept SEPARATE from D.tasks — never saved into my blob,
//    never written to localStorage — and merged in only at render time, marked
//    read-only. _taskPool() returns my own tasks + these shared ones for views.
let _sharedTasksLoaded=false;
function _taskPool(){
  const own=Array.isArray(D.tasks)?D.tasks:[];
  const shared=Array.isArray(D._sharedTasks)?D._sharedTasks:[];
  return shared.length?own.concat(shared):own;
}
async function _loadSharedTasks(){
  try{
    if(typeof _trpc!=='function')return;
    const res=await _trpc('appData.sharedTasksForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.tasks)){
      // Mark each so views render it read-only and the save path skips it.
      // Stamp a stable index so cards can be opened by position — robust even
      // when a task's id is unusual (e.g. Nifty-origin string ids) where an
      // id-string match in an onclick attribute would fail.
      // Safety net: external-origin tasks (Nifty/LSI, Smartsheet/CF) must never
      // show as "shared" — they render via their own source path. Drop them here
      // too, in case the server build hasn't redeployed yet.
      const _extOrigin=t=>!!(t&&(t.externalId||t._externalId||['nifty','smartsheet'].includes(String(t.source||t._source||'').toLowerCase())||/nifty|smartsheet/i.test(String(t._url||t.url||''))));
      D._sharedTasks=res.tasks.filter(t=>!_extOrigin(t)).map((t,i)=>({...t,_shared:true,_readOnly:true,_idx:i}));
      _sharedTasksLoaded=true;
      if(typeof curScreen!=='undefined'&&curScreen==='tasks'&&typeof renderCurrentTaskView==='function')renderCurrentTaskView();
      if(typeof curScreen!=='undefined'&&curScreen==='team'&&typeof renderTeam==='function')renderTeam();
    }
  }catch(e){ /* non-fatal — just show my own tasks */ }
}
function _userNameById(uid){
  if(uid==null)return '';
  try{
    const m=(D.teams||[]).flatMap(t=>t.members||[]).find(x=>x&&(x.userId===uid||x.id===uid));
    if(m&&m.name)return m.name;
  }catch(_){}
  return 'a teammate';
}
// Read-only detail view for a shared task (it lives in another member's blob,
// so it can be viewed but not edited from here).
async function _openSharedTaskView(idx){
  let t=(D._sharedTasks||[])[idx];
  // Robustness: if the in-memory list is stale/empty, re-fetch once and retry.
  if(!t&&typeof _loadSharedTasks==='function'){ await _loadSharedTasks(); t=(D._sharedTasks||[])[idx]; }
  if(!t){toast('Shared task not found — try refreshing the page.');return;}
  const from=t._delegated?'you':_userNameById(t._sharedFromUserId);
  const modal=document.getElementById('modal-content');
  const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const notes=String(t.notes||t.description||'').replace(/<[^>]+>/g,' ');
  const statusOpts=TASK_STATUSES;
  const priOpts=['High','Medium','Low'];
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  modal.innerHTML=`<div style="padding:16px;max-width:520px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${t._delegated?'DELEGATED':'SHARED'} · EDITABLE</span>
      <span style="font-size:11px;color:var(--t3)">${t._delegated?('assigned to '+esc(t._assigneeName||'someone')):('owned by '+esc(from))}</span>
    </div>
    <div class="field"><label>Title</label><input class="inp" id="st-title" value="${esc(t.title||'')}"></div>
    <div class="field-row">
      <div class="field"><label>Status</label><select class="inp" id="st-status">${statusOpts.map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Priority</label><select class="inp" id="st-pri">${priOpts.map(s=>`<option ${t.priority===s?'selected':''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Due</label><input class="inp" id="st-due" value="${esc(t.due||'')}" placeholder="YYYY-MM-DD"></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('st-ma',t)}</div>
    <div class="field"><label>Notes</label><textarea class="inp" id="st-notes" style="min-height:90px">${esc(notes)}</textarea></div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedTask(${Number(idx)||0})">Save</button>
      ${adminSh&&!t._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeOwnership(${Number(idx)||0},'tasks')" title="Move this task into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedItem(${Number(idx)||0},'tasks','st')">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${adminSh?'Admin: full edit, reassign, take ownership &amp; delete — saved to the owner.':('Saved to '+(t._delegated?'this task':esc(from)+"&#39;s copy")+'.')}</div>
  </div>`;
  bg.classList.add('show');
}
// Save edits to a shared task back to the owner (assignee/owner/admin only).
async function _saveSharedTask(idx){
  const t=(D._sharedTasks||[])[idx];
  if(!t){toast('Could not save — task not loaded. Refresh and try again.');return;}
  const ownerUserId=Number(t._sharedFromUserId)||0;
  const taskId=String(t.id);
  const g=id=>document.getElementById(id);
  const patch={
    title:(g('st-title')?.value||'').trim(),
    status:g('st-status')?.value||'',
    priority:g('st-pri')?.value||'',
    due:(g('st-due')?.value||'').trim(),
    notes:g('st-notes')?.value||'',
  };
  // Multi-assignee: send the full list + Primary Responsible.
  if(typeof _maGet==='function'){ const ma=_maGet('st-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedTask',{ownerUserId,taskId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(t,patch);
      // Delegated task = my own task → keep the normal list in sync locally too.
      const mine=(D.tasks||[]).find(x=>String(x.id)===taskId);
      if(mine){ Object.assign(mine,patch); try{save('tasks');}catch(_){} }
      toast({type:'success',title:'Saved',msg:'Changes saved to the task owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      // Assignment changes who can see the task — re-pull the shared list.
      if(typeof _loadSharedTasks==='function')_loadSharedTasks();
      if(typeof _renderSharedTasksSection==='function')_renderSharedTasksSection();
      if(typeof curScreen!=='undefined'&&curScreen==='tasks'&&typeof renderCurrentTaskView==='function')renderCurrentTaskView();
    }else{
      toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'});
    }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
// Admin: take ownership of a shared TASK/PROJECT — move it into my workspace.
async function _takeOwnership(idx,kind){
  const arr=kind==='programs'?(D._sharedPrograms||[]):kind==='mindmaps'?(D._sharedMindMaps||[]):kind==='notes'?(D._sharedNotes||[]):kind==='projects'?(D._sharedProjects||[]):(D._sharedTasks||[]);
  const it=arr[idx];
  if(!it){toast('Item not loaded — refresh and try again.');return;}
  const noun=kind==='programs'?'program':kind==='mindmaps'?'mind map':kind==='notes'?'note':kind==='projects'?'project':'task';
  const ownerUserId=Number(it._sharedFromUserId)||0;
  const itemId=String(it.id);
  if(!confirm('Take ownership of this '+noun+'?\n\nIt moves into your workspace and you become the owner. The current owner stays on as an assignee so they keep access.'))return;
  try{
    const res=await _trpc('appData.transferItemOwnership',{ownerUserId,kind,itemId},'mutation');
    if(res&&res.ok){
      toast({type:'success',title:'Ownership taken',msg:'This '+noun+' is now in your workspace.',duration:2600});
      try{document.getElementById('modal-capture').classList.remove('show');}catch(_){}
      if(typeof loadServerData==='function')loadServerData();
      if(kind==='programs'){ if(typeof _loadSharedPrograms==='function')_loadSharedPrograms(); if(typeof renderPrograms==='function'&&typeof curScreen!=='undefined'&&curScreen==='programs')renderPrograms(); }
      else if(kind==='mindmaps'){ if(typeof _loadSharedMindMaps==='function')_loadSharedMindMaps(); if(typeof renderMindmaps==='function'&&typeof curScreen!=='undefined'&&curScreen==='mindmaps')renderMindmaps(); }
      else if(kind==='notes'){ if(typeof _loadSharedNotes==='function')_loadSharedNotes(); if(typeof renderNotes==='function'&&typeof curScreen!=='undefined'&&curScreen==='notes')renderNotes(); }
      else if(kind==='projects'){ if(typeof _loadSharedProjects==='function')_loadSharedProjects(); if(typeof renderProjects==='function'&&typeof curScreen!=='undefined'&&curScreen==='projects')renderProjects(); }
      else { if(typeof _loadSharedTasks==='function')_loadSharedTasks(); if(typeof renderCurrentTaskView==='function'&&typeof curScreen!=='undefined'&&curScreen==='tasks')renderCurrentTaskView(); }
    }else{
      toast({type:'error',title:'Could not take ownership',msg:(res&&res.error)||'Try again.'});
    }
  }catch(e){ toast({type:'error',title:'Failed',msg:String(e&&e.message||e)}); }
}
// Admin/owner: delete a shared/delegated item from the owner's workspace.
async function _deleteSharedItem(idx,kind){
  const arr=kind==='programs'?(D._sharedPrograms||[]):kind==='mindmaps'?(D._sharedMindMaps||[]):kind==='notes'?(D._sharedNotes||[]):kind==='projects'?(D._sharedProjects||[]):(D._sharedTasks||[]);
  const item=arr[idx];
  if(!item){toast('Could not delete — item not loaded. Refresh and try again.');return;}
  const label=item.title||item.name||'this item';
  if(!confirm(`Delete "${label}" from the owner's workspace? This can't be undone.`))return;
  const ownerUserId=Number(item._sharedFromUserId)||0;
  const itemId=String(item.id);
  try{
    const res=await _trpc('appData.deleteSharedItem',{ownerUserId,kind,itemId},'mutation');
    if(res&&res.ok){
      // Drop it locally from the shared list AND (if it's my own delegated item) my list.
      if(kind==='programs')D._sharedPrograms=(D._sharedPrograms||[]).filter((_,i)=>i!==idx);
      else if(kind==='mindmaps')D._sharedMindMaps=(D._sharedMindMaps||[]).filter((_,i)=>i!==idx);
      else if(kind==='notes')D._sharedNotes=(D._sharedNotes||[]).filter((_,i)=>i!==idx);
      else if(kind==='projects')D._sharedProjects=(D._sharedProjects||[]).filter((_,i)=>i!==idx);
      else D._sharedTasks=(D._sharedTasks||[]).filter((_,i)=>i!==idx);
      const ownKey=kind==='programs'?'programs':kind==='mindmaps'?'mindmaps':kind==='notes'?'notes':kind==='projects'?'projects':'tasks';
      if(Array.isArray(D[ownKey])){ const f=D[ownKey].filter(x=>String(x.id)!==itemId); if(f.length!==D[ownKey].length){ D[ownKey]=f; try{ if(ownKey==='mindmaps'&&typeof saveMindmaps==='function')saveMindmaps(); else save(ownKey); }catch(_){} } }
      toast({type:'success',title:'Deleted',msg:"Removed from the owner's workspace.",duration:2200});
      document.getElementById('modal-capture')?.classList.remove('show');
      // Re-fetch to re-stamp the stable indexes cleanly, then re-render.
      if(kind==='programs'){ if(typeof _loadSharedPrograms==='function')_loadSharedPrograms(); else if(typeof renderPrograms==='function')renderPrograms(); }
      else if(kind==='mindmaps'){ if(typeof _loadSharedMindMaps==='function')_loadSharedMindMaps(); else if(typeof renderMindmaps==='function')renderMindmaps(); }
      else if(kind==='notes'){ if(typeof _loadSharedNotes==='function')_loadSharedNotes(); else if(typeof renderNotes==='function')renderNotes(); }
      else if(kind==='projects'){ if(typeof _loadSharedProjects==='function')_loadSharedProjects(); else if(typeof renderProjects==='function')renderProjects(); }
      else { if(typeof _loadSharedTasks==='function')_loadSharedTasks(); if(typeof _renderSharedTasksSection==='function')_renderSharedTasksSection(); }
    }else{
      toast({type:'error',title:'Could not delete',msg:(res&&res.error)||'Try again.'});
    }
  }catch(e){ toast({type:'error',title:'Could not delete',msg:String(e&&e.message||e)}); }
}
// Dedicated "Shared with you" section, rendered into #shared-tasks-section
// above the task list. Shown in EVERY task view (the view renderers only touch
// #tasks-list, so this sibling persists). Read-only; collapsible.
function _renderSharedTasksSection(){
  const el=document.getElementById('shared-tasks-section');
  if(!el)return;
  const shared=Array.isArray(D._sharedTasks)?D._sharedTasks:[];
  if(!shared.length){ el.innerHTML=''; return; }
  let items=shared.filter(t=>!_isSubtaskRow(t));
  // Respect the active search/priority filters for consistency with the list.
  try{ if(typeof _taskFilter==='function')items=items.filter(_taskFilter); }catch(_){}
  try{ if(typeof _applyPriorityFilter==='function')items=_applyPriorityFilter(items); }catch(_){}
  const open=!(D.prefs&&D.prefs.sharedSectionCollapsed);
  el.innerHTML=`<div class="cd" style="border-left:3px solid var(--purp)">
    <div onclick="_toggleSharedSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open&&items.length?'margin-bottom:8px':''}">
      <span style="display:inline-block;transition:transform .2s;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${items.length}</span>
      <span style="flex:1"></span>
      <span style="font-size:11px;color:var(--t3)">click to edit · assigned to/by you</span>
    </div>
    ${open?(items.length?items.map(_sharedTaskCard).join(''):'<div style="font-size:11px;color:var(--t3);padding:4px 0">Nothing matches the current filter.</div>'):''}
  </div>`;
}
function _toggleSharedSection(){
  D.prefs=D.prefs||{};
  D.prefs.sharedSectionCollapsed=!D.prefs.sharedSectionCollapsed;
  try{ save('prefs'); }catch(_){}
  _renderSharedTasksSection();
}
// ── Shared PROJECTS (assigned to me / admin view). Same model as tasks, but
//    projects are blob-only so the server scans blobs. Kept in D._sharedProjects
//    (separate, read-only). Rendered as a section in the Projects list view.
async function _loadSharedProjects(){
  try{
    if(typeof _trpc!=='function')return;
    const res=await _trpc('appData.sharedProjectsForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.projects)){
      D._sharedProjects=res.projects.map((p,i)=>({...p,_idx:i}));
      if(typeof curScreen!=='undefined'&&curScreen==='projects'&&typeof renderProjects==='function')renderProjects();
    }
  }catch(e){ /* non-fatal */ }
}
function _renderSharedProjectsSection(){
  const shared=Array.isArray(D._sharedProjects)?D._sharedProjects:[];
  if(!shared.length)return '';
  const open=!(D.prefs&&D.prefs.sharedProjSectionCollapsed);
  return `<div class="cd" style="border-left:3px solid var(--purp);margin-bottom:10px">
    <div onclick="_toggleSharedProjSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open?'margin-bottom:8px':''}">
      <span style="display:inline-block;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${shared.length}</span>
      <span style="flex:1"></span><span style="font-size:11px;color:var(--t3)">click to edit · assigned to/by you</span>
    </div>
    ${open?shared.map(_sharedProjectCard).join(''):''}
  </div>`;
}
function _toggleSharedProjSection(){
  D.prefs=D.prefs||{};
  D.prefs.sharedProjSectionCollapsed=!D.prefs.sharedProjSectionCollapsed;
  try{ save('prefs'); }catch(_){}
  if(typeof renderProjects==='function')renderProjects();
}
// Editable detail modal for a shared/delegated project.
async function _openSharedProjectView(idx){
  let p=(D._sharedProjects||[])[idx];
  if(!p&&typeof _loadSharedProjects==='function'){ await _loadSharedProjects(); p=(D._sharedProjects||[])[idx]; }
  if(!p){toast('Shared project not found — try refreshing the page.');return;}
  const from=p._delegated?'you':_userNameById(p._sharedFromUserId);
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  const desc=String(p.desc||p.descriptionHtml||'').replace(/<[^>]+>/g,' ');
  const statusOpts=['Active','On Hold','Completed'];
  modal.innerHTML=`<div style="padding:16px;max-width:520px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${p._delegated?'DELEGATED':'SHARED'} · EDITABLE</span>
      <span style="font-size:11px;color:var(--t3)">${p._delegated?('assigned to '+esc(p._assigneeName||'someone')):('owned by '+esc(from))}</span>
    </div>
    <div class="field"><label>Name</label><input class="inp" id="sp-name" value="${esc(p.name||'')}"></div>
    <div class="field-row">
      <div class="field"><label>Status</label><select class="inp" id="sp-status">${statusOpts.map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Due</label><input class="inp" id="sp-due" value="${esc(p.due||'')}" placeholder="YYYY-MM-DD"></div>
    </div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('sp-ma',p)}</div>
    <div class="field"><label>Description</label><textarea class="inp" id="sp-desc" style="min-height:90px">${esc(desc)}</textarea></div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedProject(${Number(idx)||0})">Save</button>
      ${adminSh&&!p._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeOwnership(${Number(idx)||0},'projects')" title="Move this project into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedItem(${Number(idx)||0},'projects')">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${adminSh?'Admin: full edit, reassign, take ownership &amp; delete — saved to the owner.':'Saved to the project owner.'}</div>
  </div>`;
  bg.classList.add('show');
}
async function _saveSharedProject(idx){
  const p=(D._sharedProjects||[])[idx];
  if(!p){toast('Could not save — project not loaded. Refresh and try again.');return;}
  const ownerUserId=Number(p._sharedFromUserId)||0; const projectId=String(p.id);
  const g=id=>document.getElementById(id);
  const patch={ name:(g('sp-name')?.value||'').trim(), status:g('sp-status')?.value||'', due:(g('sp-due')?.value||'').trim(), desc:g('sp-desc')?.value||'' };
  if(typeof _maGet==='function'){ const ma=_maGet('sp-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedProject',{ownerUserId,projectId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(p,patch);
      const mine=(D.projects||[]).find(x=>String(x.id)===projectId);
      if(mine){ Object.assign(mine,patch); try{save('projects');}catch(_){} }
      toast({type:'success',title:'Saved',msg:'Changes saved to the project owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      if(typeof _loadSharedProjects==='function')_loadSharedProjects();
      else if(typeof renderProjects==='function'&&curScreen==='projects')renderProjects();
    }else{
      toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'});
    }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
// ── Shared PROGRAMS (portfolio roll-ups) — same model as shared projects. ──
async function _loadSharedPrograms(){
  try{
    if(typeof _trpc!=='function')return;
    const res=await _trpc('appData.sharedProgramsForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.programs)){
      D._sharedPrograms=res.programs.map((p,i)=>({...p,_idx:i}));
      if(typeof curScreen!=='undefined'&&curScreen==='programs'&&typeof renderPrograms==='function')renderPrograms();
    }
  }catch(e){ /* non-fatal */ }
}
function _renderSharedProgramsSection(){
  const shared=Array.isArray(D._sharedPrograms)?D._sharedPrograms:[];
  if(!shared.length)return '';
  const open=!(D.prefs&&D.prefs.sharedProgSectionCollapsed);
  return `<div class="cd" style="border-left:3px solid var(--purp);margin-bottom:10px">
    <div onclick="_toggleSharedProgSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open?'margin-bottom:8px':''}">
      <span style="display:inline-block;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${shared.length}</span>
      <span style="flex:1"></span><span style="font-size:11px;color:var(--t3)">click to edit · assigned to/by you</span>
    </div>
    ${open?shared.map(_sharedProgramCard).join(''):''}
  </div>`;
}
function _toggleSharedProgSection(){ D.prefs=D.prefs||{}; D.prefs.sharedProgSectionCollapsed=!D.prefs.sharedProgSectionCollapsed; try{save('prefs');}catch(_){} if(typeof renderPrograms==='function')renderPrograms(); }
function _sharedProgramCard(p){
  const delegated=!!p._delegated;
  const who=delegated?(p._assigneeName||'someone'):_userNameById(p._sharedFromUserId);
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  return `<div onclick="_openSharedProgramView(${Number(p._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid ${p.color||'var(--purp)'};border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer" title="Shared program — click to edit">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:700;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px;flex-shrink:0">${badge}</span>
      <span style="font-size:13px;font-weight:600;color:var(--t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((p.icon?p.icon+' ':'')+(p.name||'Untitled'))}</span>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${p.status?esc(p.status):''} · ${sub}</div>
  </div>`;
}
async function _openSharedProgramView(idx){
  let p=(D._sharedPrograms||[])[idx];
  if(!p&&typeof _loadSharedPrograms==='function'){ await _loadSharedPrograms(); p=(D._sharedPrograms||[])[idx]; }
  if(!p){toast('Shared program not found — try refreshing.');return;}
  const from=p._delegated?'you':_userNameById(p._sharedFromUserId);
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  const desc=String(p.description||'').replace(/<[^>]+>/g,' ');
  const statusOpts=['Active','Paused','Completed'];
  modal.innerHTML=`<div style="padding:16px;max-width:520px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${p._delegated?'DELEGATED':'SHARED'} · EDITABLE</span>
      <span style="font-size:11px;color:var(--t3)">${p._delegated?('assigned to '+esc(p._assigneeName||'someone')):('owned by '+esc(from))}</span>
    </div>
    <div class="field"><label>Name</label><input class="inp" id="sg-name" value="${esc(p.name||'')}"></div>
    <div class="field"><label>Status</label><select class="inp" id="sg-status">${statusOpts.map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('sg-ma',p)}</div>
    <div class="field"><label>Description</label><textarea class="inp" id="sg-desc" style="min-height:90px">${esc(desc)}</textarea></div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedProgram(${Number(idx)||0})">Save</button>
      ${adminSh&&!p._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeOwnership(${Number(idx)||0},'programs')" title="Move this program into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedItem(${Number(idx)||0},'programs')">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${adminSh?'Admin: full edit, reassign, take ownership &amp; delete — saved to the owner.':'Saved to the program owner.'}</div>
  </div>`;
  bg.classList.add('show');
}
async function _saveSharedProgram(idx){
  const p=(D._sharedPrograms||[])[idx];
  if(!p){toast('Could not save — program not loaded. Refresh and try again.');return;}
  const ownerUserId=Number(p._sharedFromUserId)||0; const programId=String(p.id);
  const g=id=>document.getElementById(id);
  const patch={ name:(g('sg-name')?.value||'').trim(), status:g('sg-status')?.value||'', description:g('sg-desc')?.value||'' };
  if(typeof _maGet==='function'){ const ma=_maGet('sg-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedProgram',{ownerUserId,programId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(p,patch);
      const mine=(D.programs||[]).find(x=>String(x.id)===programId);
      if(mine){ Object.assign(mine,patch); try{save('programs');}catch(_){} }
      toast({type:'success',title:'Saved',msg:'Changes saved to the program owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      if(typeof _loadSharedPrograms==='function')_loadSharedPrograms();
      else if(typeof renderPrograms==='function'&&curScreen==='programs')renderPrograms();
    }else{ toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'}); }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
// ── Shared NOTES (relational, like tasks) — assignment + sharing ──────────
// ─── Per-item share settings (notes / sheets / decks) ─────────────────
// shareAll: item visible to EVERY workspace member (not just assignees).
// shareMode: 'view' | 'edit' — what recipients may do. Absent = legacy
// default (notes 'view', sheets/decks 'edit'), so old items behave as
// they always did. Enforced server-side; these controls are the owner UI.
function _shareEffMode(p,dflt){ return (p&&(p.shareMode==='view'||p.shareMode==='edit'))?p.shareMode:(dflt||'view'); }
function _shareControlsHtml(idPrefix,item,dfltMode){
  const mode=_shareEffMode(item,dfltMode);
  return `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--bd1)">
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2);cursor:pointer"><input type="checkbox" id="${idPrefix}-shareall" ${item&&item.shareAll?'checked':''} style="width:13px;height:13px"> 🌐 Share with everyone in the workspace</label>
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t2)">Permission
      <select id="${idPrefix}-sharemode" class="inp" style="height:24px;font-size:11px;width:auto;padding:0 6px">
        <option value="edit" ${mode==='edit'?'selected':''}>✏ Can edit</option>
        <option value="view" ${mode==='view'?'selected':''}>👁 Can view</option>
      </select>
    </label>
  </div>`;
}
function _shareControlsGet(idPrefix){
  const a=document.getElementById(idPrefix+'-shareall');
  const m=document.getElementById(idPrefix+'-sharemode');
  if(!a&&!m)return null;
  return { shareAll:!!(a&&a.checked), shareMode:(m&&m.value==='view')?'view':'edit' };
}
function _openNoteAssign(id){
  const n=(D.notes||[]).find(x=>String(x.id)===String(id)); if(!n){toast('Note not found');return;}
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  modal.innerHTML=`<div style="padding:16px;max-width:480px">
    <h2 style="font-size:14px;font-weight:600;margin-bottom:4px">👥 Share Note</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${esc(n.title||'Untitled')}</div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('note-assign-ma',n)}</div>
    ${_shareControlsHtml('note-share',n,'view')}
    <div style="font-size:11px;color:var(--t3);margin-top:6px">Recipients read the full note. "Can edit" also lets them change the note body.</div>
    <div class="dr-actions" style="margin-top:14px">
      <button class="btn btn-p" onclick="_saveNoteAssign('${String(id)}')">Save</button>
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
  </div>`;
  bg.classList.add('show');
}
function _saveNoteAssign(id){
  const n=(D.notes||[]).find(x=>String(x.id)===String(id)); if(!n)return;
  if(typeof _maGet==='function'){ const ma=_maGet('note-assign-ma'); n.assignees=ma.assignees; n.assigneeNames=ma.assigneeNames; n.primaryAssigneeId=ma.primaryAssigneeId; const pi=ma.assignees.indexOf(ma.primaryAssigneeId); n.assignedTo=pi>=0?ma.assigneeNames[pi]:''; }
  const sc=_shareControlsGet('note-share'); if(sc){ n.shareAll=sc.shareAll; n.shareMode=sc.shareMode; }
  n.updated=n.updatedAt=new Date().toISOString();
  try{save('notes');}catch(_){}
  document.getElementById('modal-capture').classList.remove('show');
  toast({type:'success',title:'Assigned',msg:n.assignedTo?('Primary: '+n.assignedTo):'Assignees updated.',duration:1800});
  if(typeof renderNotes==='function')renderNotes();
}
async function _loadSharedNotes(){
  try{ if(typeof _trpc!=='function')return; const res=await _trpc('appData.sharedNotesForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.notes)){ D._sharedNotes=res.notes.map((p,i)=>({...p,_idx:i})); if(typeof curScreen!=='undefined'&&curScreen==='notes'&&typeof renderNotes==='function')renderNotes(); }
  }catch(e){ /* non-fatal */ }
}
function _renderSharedNotesSection(){
  const shared=Array.isArray(D._sharedNotes)?D._sharedNotes:[];
  if(!shared.length)return '';
  const open=!(D.prefs&&D.prefs.sharedNotesSectionCollapsed);
  return `<div class="cd" style="border-left:3px solid var(--purp);margin-bottom:12px">
    <div onclick="_toggleSharedNotesSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open?'margin-bottom:8px':''}">
      <span style="display:inline-block;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated notes</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${shared.length}</span>
      <span style="flex:1"></span><span style="font-size:11px;color:var(--t3)">click to read · assigned to/by you</span>
    </div>
    ${open?shared.map(_sharedNoteCard).join(''):''}
  </div>`;
}
function _toggleSharedNotesSection(){ D.prefs=D.prefs||{}; D.prefs.sharedNotesSectionCollapsed=!D.prefs.sharedNotesSectionCollapsed; try{save('prefs');}catch(_){} if(typeof renderNotes==='function')renderNotes(); }
function _sharedNoteCard(p){
  const delegated=!!p._delegated;
  const who=delegated?(p._assigneeName||'someone'):_userNameById(p._sharedFromUserId);
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  return `<div onclick="_openSharedNoteView(${Number(p._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid var(--purp);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer" title="Shared note — click to read & manage assignment">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:700;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px;flex-shrink:0">${badge}</span>
      <span style="font-size:13px;font-weight:600;color:var(--t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title||'Untitled')}</span>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${sub} · ${p._canEditBody?'✏ can edit':'👁 view'}${p.shareAll?' · 🌐 everyone':''}</div>
  </div>`;
}
async function _openSharedNoteView(idx){
  let p=(D._sharedNotes||[])[idx];
  if(!p&&typeof _loadSharedNotes==='function'){ await _loadSharedNotes(); p=(D._sharedNotes||[])[idx]; }
  if(!p){toast('Shared note not found — try refreshing.');return;}
  const from=p._delegated?'you':_userNameById(p._sharedFromUserId);
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  // Full body via the same display path the note editor uses — a shared
  // note the recipient cannot READ isn't shared. When the owner granted
  // 'edit' (or I'm admin / it's my own delegated note), the body is a
  // contenteditable region and Save writes it back through updateSharedNote.
  const canEdit=!!p._canEditBody;
  const bodyHtml=(typeof _noteBodyDisplayHtml==='function')?_noteBodyDisplayHtml(p):'';
  modal.innerHTML=`<div style="padding:16px;max-width:720px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${p._delegated?'DELEGATED':'SHARED'}${p.shareAll?' · 🌐 EVERYONE':''} · ${canEdit?'✏ CAN EDIT':'👁 VIEW'}</span>
      <span style="font-size:11px;color:var(--t3)">${p._delegated?('assigned to '+esc(p._assigneeName||'someone')):('owned by '+esc(from))}</span>
      ${(p.tags||[]).slice(0,4).map(t=>`<span style="font-size:11px;color:var(--t3)">#${esc(t)}</span>`).join('')}
    </div>
    <div class="field"><label>Title</label><input class="inp" id="snt-title" value="${esc(p.title||'')}" ${canEdit?'':'readonly'}></div>
    ${(bodyHtml||canEdit)?`<div class="note-doc" style="max-width:none;margin:0 0 10px;padding:0"><div class="note-body" id="snt-body" ${canEdit?'contenteditable="true" data-editable="1" spellcheck="true"':''} style="max-height:44vh;min-height:${canEdit?'90px':'0'};overflow-y:auto;-webkit-overflow-scrolling:touch;border:1px solid ${canEdit?'var(--bd2)':'var(--bd1)'};border-radius:8px;padding:12px 14px;background:var(--s1);outline:none">${bodyHtml}</div></div>`:''}
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('snt-ma',p)}</div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedNote(${Number(idx)||0})">Save</button>
      ${adminSh&&!p._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeOwnership(${Number(idx)||0},'notes')" title="Move this note into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedItem(${Number(idx)||0},'notes')">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${canEdit?'You can edit the body — Save writes your changes back to the owner\'s note.':(adminSh?'Admin: edit assignment, take ownership &amp; delete. The owner shared this note as view-only.':'The owner shared this note as view-only. You can update its assignment.')}</div>
  </div>`;
  bg.classList.add('show');
}
async function _saveSharedNote(idx){
  const p=(D._sharedNotes||[])[idx]; if(!p){toast('Could not save — refresh and try again.');return;}
  const ownerUserId=Number(p._sharedFromUserId)||0; const noteId=String(p.id);
  const g=id=>document.getElementById(id);
  const patch={ title:(g('snt-title')?.value||'').trim() };
  const bodyEl=g('snt-body');
  if(bodyEl&&bodyEl.dataset.editable==='1'){patch.bodyHtml=luSanitizeHtml(bodyEl.innerHTML);patch.body=luRTE_htmlToMd(patch.bodyHtml);}
  if(typeof _maGet==='function'){ const ma=_maGet('snt-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedNote',{ownerUserId,noteId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(p,patch);
      const mine=(D.notes||[]).find(x=>String(x.id)===noteId);
      if(mine){ Object.assign(mine,patch); try{save('notes');}catch(_){} }
      toast({type:'success',title:'Saved',msg:'Changes saved to the note owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      if(typeof _loadSharedNotes==='function')_loadSharedNotes();
      else if(typeof renderNotes==='function')renderNotes();
    }else{ toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'}); }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
function _sharedProjectCard(p){
  const delegated=!!p._delegated;
  const who=delegated?(p._assigneeName||'someone'):_userNameById(p._sharedFromUserId);
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  const tip=delegated?('Project you delegated — assigned to '+esc(who)+' (click to edit)'):('Shared project — owned by '+esc(who)+' (click to edit)');
  return `<div onclick="_openSharedProjectView(${Number(p._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid ${p.color||'var(--purp)'};border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer" title="${tip}">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:700;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px;flex-shrink:0">${badge}</span>
      <span style="font-size:13px;font-weight:600;color:var(--t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name||'Untitled')}</span>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0">${p.pct!=null?esc(String(p.pct))+'%':''}</span>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${p.status?esc(p.status):''}${p.due?' · due '+esc(p.due):''} · ${sub}</div>
  </div>`;
}
// Read-only card for a task shared with me (assigned to me / admin view).
function _sharedTaskCard(t){
  const pri=t.priority||'Medium';
  const done=(t.status==='Done');
  const delegated=!!t._delegated;
  const who=delegated?(t._assigneeName||'someone'):_userNameById(t._sharedFromUserId);
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  const tip=delegated?('Task you delegated — assigned to '+esc(who)+' (click to edit)'):('Shared task — owned by '+esc(who)+' (click to edit)');
  return `<div onclick="_openSharedTaskView(${Number(t._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid var(--purp);border-radius:10px;padding:10px 12px;margin-bottom:6px;opacity:.95;cursor:pointer" title="${tip}">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="flex-shrink:0;font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${badge}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;${done?'text-decoration:line-through;color:var(--t3)':'color:var(--t1)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title||'Untitled')}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(pri)}${t.status?' · '+esc(t.status):''}${t.due?' · due '+esc(t.due):''} · ${sub}</div>
      </div>
    </div>
  </div>`;
}
function _childTasksOf(parentTaskId){
  if(parentTaskId==null)return [];
  return (D.tasks||[]).filter(t=>t.parentTaskId!=null&&String(t.parentTaskId)===String(parentTaskId));
}

// ─── Real subtask child rows (drawer rendering + add/promote) ──────────────
// Renders a "Subtasks (rich)" section inside the task drawer showing child
// task rows (parentTaskId === item.taskId). Each row carries the full
// status/priority/due and a click-through to open its own drawer. New
// subtasks created here are real task rows from the start.
function _renderRealSubtasksSection(parent){
  const parentTaskId=parent.taskId!=null?String(parent.taskId):String(parent.id||'');
  const children=_childTasksOf(parentTaskId);
  // Detect whether the legacy JSON subtasks have already been promoted —
  // backfillNestedSubtasks stamps _subtasksPromotedAt on the parent's raw.
  let legacyPromoted=false;
  try{
    if(parent.raw){const r=JSON.parse(parent.raw);legacyPromoted=!!r._subtasksPromotedAt;}
  }catch{ /* fall through */ }
  const legacyCount=(parent.subtasks||[]).length;
  const childRows=children.map(c=>{
    const done=c.status==='Done';
    const od=!done&&c.due&&c.due<_todayStr;
    return `<div class="lr" style="padding:5px 0;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="closeDrawer();setTimeout(()=>openDrawer('task',D.tasks.find(x=>String(x.taskId||x.id)===String(${_jsArg(c.taskId||c.id)}))),120)">
      <div class="chk ${done?'on':''}" onclick="event.stopPropagation();toggleTask(${typeof c.id==='number'?c.id:`'${_jsAttr(c.id)}'`});setTimeout(()=>openDrawer('task',D.tasks.find(x=>String(x.taskId||x.id)===String(${_jsArg(parent.taskId||parent.id)}))),120)"></div>
      <span class="rt" style="font-size:12px;${done?'text-decoration:line-through;color:var(--t3)':''}">${esc(c.title||'(untitled)')}</span>
      ${c.priority?`<span class="pill ${pillClass(c.priority)}" style="font-size:11px">${c.priority}</span>`:''}
      ${c.due?`<span style="font-size:11px;color:${od?'var(--red)':'var(--t3)'}">${esc(c.due)}</span>`:''}
      <span style="font-size:11px;color:var(--t3)">›</span>
    </div>`;
  }).join('');
  const promoteBtn=(!legacyPromoted&&legacyCount>0)
    ?`<button type="button" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;color:var(--purp)" title="Convert the ${legacyCount} legacy subtask${legacyCount===1?'':'s'} above into real task rows with full fields (assignee, due date, priority, etc.)" onclick="_promoteLegacySubtasks()">↑ Promote ${legacyCount} legacy</button>`
    :'';
  const childCount=children.length;
  const childDone=children.filter(c=>c.status==='Done').length;
  const heading=childCount
    ?`Subtasks (rich) <span style="font-size:11px;color:var(--t3);font-weight:400">(${childDone}/${childCount} done)</span>`
    :`Subtasks (rich) <span style="font-size:11px;color:var(--t3);font-weight:400">— full task fields per subtask</span>`;
  return `<div style="margin-top:14px;padding-top:10px;border-top:1px dashed var(--bd1)">
    <label style="display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px">
      <span>${heading}</span>
      ${promoteBtn}
    </label>
    ${childRows}
    <div style="display:flex;gap:6px;margin-top:6px">
      <input class="inp" id="new-real-subtask" placeholder="+ Add subtask as full task (Enter)" style="flex:1;font-size:11px;height:28px" onkeydown="if(event.key==='Enter'){event.preventDefault();_addRealSubtask(${_jsArg(parent.taskId||parent.id)})}">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="_addRealSubtask(${_jsArg(parent.taskId||parent.id)})">+ Add</button>
    </div>
  </div>`;
}

// Create a real child task row whose parentTaskId points at the parent.
// Inherits projectId so the subtask rolls up into the same project.
function _addRealSubtask(parentTaskId){
  const inp=document.getElementById('new-real-subtask');
  if(!inp)return;
  const title=inp.value.trim();
  if(!title){inp.focus();return;}
  const pidStr=String(parentTaskId);
  const parent=D.tasks.find(t=>String(t.taskId||t.id)===pidStr);
  const newId=Date.now();
  D.tasks.push({
    id:newId,
    taskId:String(newId),
    title,
    status:'Not Started',
    priority:parent?parent.priority||'Medium':'Medium',
    parentTaskId:pidStr,
    projectId:parent?parent.projectId:null,
    project:parent?parent.project:'',
    createdBy:(D.creds&&D.creds.userName)||'Idris Grant',
    createdAt:new Date().toISOString(),
  });
  save('tasks');
  inp.value='';
  // Re-open the parent drawer so the new child row appears.
  if(parent)openDrawer('task',parent);
  toast({type:'success',title:'Subtask added',duration:1200});
}

async function _promoteLegacySubtasks(){
  try{
    toast({type:'info',title:'Promoting legacy subtasks…',duration:1500});
    const r=await _trpc('taskMigrations.backfillNestedSubtasks',{dryRun:false},'mutation');
    toast({type:'success',title:`Promoted ${r.subtasksPromoted} subtask${r.subtasksPromoted===1?'':'s'} across ${r.parentsScanned} parent${r.parentsScanned===1?'':'s'}`});
    // Reload server data to pick up the new child rows + the parent
    // _subtasksPromotedAt stamp.
    if(typeof loadServerData==='function')await loadServerData();
    closeDrawer();
  }catch(e){toast({type:'warn',title:'Promote failed',msg:e.message||String(e)});}
}

// ─── Per-source visibility filter (Personal / CF / LSI) ────────────────────
// Three toggle chips on the Tasks page header. Default: all visible.
// Persisted in D.prefs.taskSourceFilter. Helper exported as
// _sourceOn(source) returning bool; consumed by every render path that
// emits external rows + the native pipeline (when personal is off, native
// tasks are excluded so the user can zoom into one company at a time).
function _getSourceFilter(){
  const f=(D.prefs&&D.prefs.taskSourceFilter)||{};
  return {
    personal:f.personal!==false,
    smartsheet:f.smartsheet!==false,
    nifty:f.nifty!==false,
  };
}
function _sourceOn(source){
  const f=_getSourceFilter();
  if(source==='local'||source==='personal'||source==='native'||!source)return f.personal;
  if(source==='smartsheet')return f.smartsheet;
  if(source==='nifty')return f.nifty;
  return true;
}
function toggleSourceFilter(source){
  D.prefs=D.prefs||{};
  const cur=_getSourceFilter();
  const key=source==='personal'?'personal':source;
  cur[key]=!cur[key];
  // Don't allow all three off — would be a confusing empty state.
  if(!cur.personal&&!cur.smartsheet&&!cur.nifty){toast({type:'warn',title:'At least one source must stay on',duration:2000});return;}
  D.prefs.taskSourceFilter=cur;
  save('prefs');
  if(typeof renderTasks==='function')renderTasks();
}
function _renderSourceFilterChips(){
  const f=_getSourceFilter();
  const ext=Array.isArray(D.externalTasks)?D.externalTasks:[];
  const cfCount=ext.filter(t=>t.source==='smartsheet'&&!(t.override&&t.override.tombstoned)).length;
  const lsiCount=ext.filter(t=>t.source==='nifty'&&!(t.override&&t.override.tombstoned)).length;
  // Hide CF/LSI chips when those sources have no data — keeps the UI clean
  // for users who haven't connected them.
  const chip=(on,active,color,label,count,key)=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:${active?color:'transparent'};color:${active?'#fff':'var(--t2)'};border:1px solid ${active?color:'var(--bd2)'};border-radius:11px" onclick="toggleSourceFilter('${_jsAttr(key)}')" title="${active?'Click to hide':'Click to show'} ${label}">${label}${count?` <span style="opacity:.85">${count}</span>`:''}</button>`;
  const personalCount=(D.tasks||[]).filter(t=>t.status!=='Done'&&t.status!=='Someday').length;
  // CF fold-all chip — only appears when there's at least one CF
  // project group on the Tasks list (i.e. at least one orphan-subtask
  // row). Toggle label flips based on whether ANY CF project is
  // currently collapsed: shows "Fold all" when everything is open,
  // "Expand all" when at least one is folded.
  const cfFoldChip=(function(){
    if(!cfCount)return '';
    const labels=new Set();
    ext.forEach(et=>{
      if(et.source!=='smartsheet'||!et.projectLabel||(et.override&&et.override.tombstoned))return;
      try{const k=JSON.parse(et.raw||'{}').kind;if(k==='subtask')labels.add(String(et.projectLabel).toLowerCase());}catch(_){}
    });
    if(!labels.size)return '';
    const collapsedNow=new Set(((D.prefs&&D.prefs.cfCollapsedProjects)||[]).map(s=>String(s).toLowerCase()));
    const collapsedCount=Array.from(labels).filter(l=>collapsedNow.has(l)).length;
    const totalLabels=labels.size;
    const allCollapsed=collapsedCount===totalLabels && totalLabels>0;
    const anyCollapsed=collapsedCount>0;
    let label, fn;
    if(allCollapsed){ label='⤢ Expand all CF'; fn='_expandAllCfProjects()'; }
    else if(anyCollapsed){ label=`⤢ Expand all (${collapsedCount}/${totalLabels} folded)`; fn='_expandAllCfProjects()'; }
    else { label='⤡ Fold all CF'; fn='_foldAllCfProjects()'; }
    return `<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:transparent;color:#1f6feb;border:1px solid color-mix(in srgb,#1f6feb 35%,transparent);border-radius:11px;margin-left:4px" onclick="${fn}" title="${allCollapsed?'Expand every CF project section':(anyCollapsed?'Expand all currently-folded CF project sections':'Fold every CF project section')}">${label}</button>`;
  })();
  return `<div style="display:flex;align-items:center;gap:6px;margin:6px 0;flex-wrap:wrap">
    <span style="font-size:11px;color:var(--t3);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Sources</span>
    ${chip(true,f.personal,'var(--ac)','Personal',personalCount,'personal')}
    ${cfCount?chip(true,f.smartsheet,'#1f6feb','CF',cfCount,'smartsheet'):''}
    ${lsiCount?chip(true,f.nifty,'#9333ea','LSI',lsiCount,'nifty'):''}
    ${cfFoldChip}
  </div>`;
}
function setTaskTabIdx(idx){
  _taskFilterTabIdx=idx;
  if(_taskTabDefs[idx])_taskFilter=_taskTabDefs[idx].filter;
  _persistPageState('tasks',{tabIdx:idx});
  // Flip the .on class on the tab strip — renderCurrentTaskView() only
  // re-paints the view body, not the parent tabs row, so the previous tab
  // would stay highlighted forever otherwise.
  const tabsRow=document.getElementById('tasks-tabs');
  if(tabsRow){tabsRow.querySelectorAll('.tab').forEach((el,i)=>el.classList.toggle('on',i===idx));}
  renderCurrentTaskView();
}
function setTaskPriorityFilter(v){_taskPriorityFilter=v||'All';_persistPageState('tasks',{priority:_taskPriorityFilter});renderCurrentTaskView();}
// J: persistent group-by selection for the List view.
if(typeof _taskListGroupBy==='undefined')var _taskListGroupBy=_tasksRestored.listGroupBy||'none';
function setTaskListGroupBy(v){_taskListGroupBy=v||'none';_persistPageState('tasks',{listGroupBy:_taskListGroupBy});renderCurrentTaskView();}
// Click-to-sort on List view column headers. Click once = ASC, click again
// on the same column = DESC, third click = clear and revert to drag order.
if(typeof _taskListSortBy==='undefined')var _taskListSortBy=_tasksRestored.listSortBy||'';
if(typeof _taskListSortDir==='undefined')var _taskListSortDir=_tasksRestored.listSortDir||'asc';
function setTaskListSort(col){
  if(_taskListSortBy===col){
    if(_taskListSortDir==='asc')_taskListSortDir='desc';
    else{_taskListSortBy='';_taskListSortDir='asc';}
  }else{
    _taskListSortBy=col;_taskListSortDir='asc';
  }
  _persistPageState('tasks',{listSortBy:_taskListSortBy,listSortDir:_taskListSortDir});
  renderCurrentTaskView();
}
// Card-view sort dropdown (no column headers to click anymore).
function setTaskListSortValue(by){
  _taskListSortBy=by||'';
  if(!_taskListSortBy){_taskListSortDir='asc';}
  else {
    // Smart default direction per sort field:
    // - priority / status: descending so the most important shows first
    //   (priRank.High=3 → desc puts High at top; statusRank.Done=5 →
    //   desc puts Done at top, BUT for status users usually want to
    //   see open work first, so we flip status to asc and let users
    //   click the column header to invert if they want Done first).
    // - dates: ascending so earliest deadlines / starts surface first.
    // - title / created: ascending (A→Z, oldest→newest).
    _taskListSortDir=(by==='priority')?'desc':'asc';
  }
  _persistPageState('tasks',{listSortBy:_taskListSortBy,listSortDir:_taskListSortDir});
  renderCurrentTaskView();
}
function toggleTaskListSortDir(){
  _taskListSortDir=_taskListSortDir==='asc'?'desc':'asc';
  _persistPageState('tasks',{listSortBy:_taskListSortBy,listSortDir:_taskListSortDir});
  renderCurrentTaskView();
}
// ── Resizable Tasks-List columns (persisted in D.prefs.taskColW) ─────────
const _TASK_COLS=[
  {k:'drag',w:18,fixed:true},
  {k:'check',w:24,fixed:true},
  {k:'title',w:260,min:120,label:'Title',sort:'title'},
  {k:'priority',w:90,min:56,label:'Priority',sort:'priority'},
  {k:'status',w:112,min:70,label:'Status',sort:'status'},
  {k:'start',w:95,min:56,label:'Start',sort:'start'},
  {k:'end',w:95,min:56,label:'End',sort:'end'},
  {k:'project',w:130,min:64,label:'Project',sort:'project'},
  {k:'assignee',w:130,min:64,label:'Assigned to',sort:'assignee'},
  {k:'created',w:100,min:60,label:'Created',sort:'created'},
  {k:'open',w:32,fixed:true},
];
function _taskColW(k){
  const d=_TASK_COLS.find(c=>c.k===k);
  const stored=D.prefs&&D.prefs.taskColW&&D.prefs.taskColW[k];
  const v=typeof stored==='number'&&stored>0?stored:(d?d.w:80);
  return d&&d.min?Math.max(d.min,v):v;
}
function _taskColTpl(){return _TASK_COLS.map(c=>_taskColW(c.k)+'px').join(' ');}
function _taskRowMinW(){return _TASK_COLS.reduce((s,c)=>s+_taskColW(c.k),0)+(_TASK_COLS.length-1)*8;}
function resetTaskColWidths(){
  if(D.prefs)D.prefs.taskColW={};
  save('prefs');renderCurrentTaskView();
  toast('↔ Column widths reset');
}
let _tlRz=null;
function _tlResizeStart(e,key){
  e.preventDefault();e.stopPropagation();
  const startX=(e.touches?e.touches[0].clientX:e.clientX);
  _tlRz={key,startX,startW:_taskColW(key)};
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
  window.addEventListener('pointermove',_tlResizeMove,{passive:false});
  window.addEventListener('pointerup',_tlResizeEnd,{once:true});
}
function _tlResizeMove(e){
  if(!_tlRz)return;
  e.preventDefault();
  const x=e.clientX;
  const def=_TASK_COLS.find(c=>c.k===_tlRz.key);
  const min=def&&def.min?def.min:50;
  const w=Math.max(min,Math.min(640,Math.round(_tlRz.startW+(x-_tlRz.startX))));
  _tlRz.cur=w;
  // Live-apply to header + every row without a full re-render.
  D.prefs=D.prefs||{};D.prefs.taskColW=D.prefs.taskColW||{};D.prefs.taskColW[_tlRz.key]=w;
  const tpl=_taskColTpl(),mw=_taskRowMinW()+'px';
  document.querySelectorAll('#tasks-list .tl-row').forEach(r=>{r.style.gridTemplateColumns=tpl;r.style.minWidth=mw;});
}
function _tlResizeEnd(){
  window.removeEventListener('pointermove',_tlResizeMove);
  document.body.style.cursor='';document.body.style.userSelect='';
  if(_tlRz){save('prefs');_tlRz=null;}
}
function renderTaskList(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  let filtered=_sourceOn('personal')?_topLevelTasks(D.tasks).filter(_taskFilter):[];
  if(_taskMyOnly)filtered=filtered.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  filtered=_applyPriorityFilter(filtered);
  // Inject external tasks (Smartsheet/Nifty) into the list. Coerced into a
  // task-shape so the existing sort + group-by + cardRow pipeline works.
  // Skipped under "My Items" scope (external rows don't carry createdBy).
  if(!_taskMyOnly&&Array.isArray(D.externalTasks)){
    const today=_todayStr;
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    // Pull ALL external rows including done ones — done rows flow into the
    // Done tab + Reports just like native completions. Status normalised to
    // 'Done' for done synonyms so the existing _taskFilter('Done') matches.
    const extShaped=D.externalTasks
      .filter(t=>!(t.override&&t.override.tombstoned)&&_sourceOn(t.source))
      .map(et=>{
        const ov=et.override||{};
        const due=ov.localDue||et.due||'';
        const done=isExtDone(et);
        return {
          id:'ext:'+et.source+':'+et.externalId,
          title:et.title,
          // Normalise done-synonyms to "Done" so _taskFilter and group-by
          // bucket the row consistently. Keep the source label visible via
          // _rawStatus for the row renderer.
          status:done?'Done':(et.status||'Not Started'),
          _rawStatus:et.status||'',
          priority:ov.localPriority||et.priority||'Medium',
          due,
          startDate:et.startDate||'',
          // Map completedAt timestamp into the same ISO shape native tasks use
          // so "Tasks Completed (by day)" reports work.
          completedAt:done?(et.completedAt||et.fetchedAt||''):null,
          project:et.projectLabel||(et.source==='smartsheet'?'CommunityForce':'LSI Media'),
          projectId:null,
          assignedTo:et.assignee||'',
          createdBy:'',
          createdAt:et.fetchedAt||'',
          tags:(ov.localTags||'').split(',').map(s=>s.trim()).filter(Boolean),
          _source:et.source,
          _url:et.externalUrl,
          _externalId:et.externalId,
          _parentExternalId:et.parentExternalId||null,
          // Extract hierarchy classification from the raw payload so the
          // renderer can spot Smartsheet subtasks even when no parent row
          // is tracked (CF 120-Day Plan has Project headers + SubTask
          // leaves with no intermediate Task rows, so parentExternalId is
          // never populated by the adapter).
          _kind:(function(){try{const r=JSON.parse(et.raw||'{}');return r.kind||r.hierarchyLevel||null;}catch(_){return null;}})(),
          _projectLabel:et.projectLabel||null,
          _override:ov,
          _readOnly:true,
        };
      });
    // Subtask grouping: re-order the array so each subtask immediately
    // follows its parent. Two grouping rules:
    //   1) Parent-by-externalId: when a subtask's parentExternalId points
    //      at another tracked external task (Nifty subtasks, Smartsheet
    //      outline subtasks). Subtask sits directly under its parent.
    //   2) CF Project-grouping fallback: when a Smartsheet row is
    //      classified subtask-kind but has no parent in the tracked set
    //      (the CF 120-Day Plan case — Project headers + SubTask leaves
    //      with no intermediate Task rows), group rows by their
    //      projectLabel so all subtasks of the same CF Project appear
    //      adjacent. Keeps the visual "↳ Project" breadcrumb clusters
    //      from looking randomly interleaved.
    (function(){
      const byExtId=new Map();
      extShaped.forEach(t=>byExtId.set(t._externalId,t));
      const parents=extShaped.filter(t=>!t._parentExternalId||!byExtId.has(t._parentExternalId));
      const subsByParent=new Map();
      extShaped.forEach(t=>{
        if(t._parentExternalId&&byExtId.has(t._parentExternalId)){
          if(!subsByParent.has(t._parentExternalId))subsByParent.set(t._parentExternalId,[]);
          subsByParent.get(t._parentExternalId).push(t);
        }
      });
      const grouped=[];
      const seen=new Set();
      const pushWithSubs=(t)=>{
        if(seen.has(t._externalId))return;
        seen.add(t._externalId);
        grouped.push(t);
        const subs=subsByParent.get(t._externalId)||[];
        subs.forEach(pushWithSubs);
      };
      parents.forEach(pushWithSubs);
      // Now reorder the grouped array to cluster CF subtasks by their
      // projectLabel. Stable sort within projects preserves the original
      // sheet row order. Non-CF rows + CF rows with no projectLabel get
      // a synthetic "" sort key so they stay clustered at the start.
      const isCfOrphanSub=(t)=>t._source==='smartsheet'&&t._kind==='subtask'&&!byExtId.has(t._parentExternalId||'')&&!!t._projectLabel;
      grouped.sort((a,b)=>{
        const aCf=isCfOrphanSub(a), bCf=isCfOrphanSub(b);
        if(!aCf&&!bCf)return 0; // preserve order for non-CF-subtask rows
        if(aCf&&!bCf)return 1;  // CF subtasks land after other rows
        if(!aCf&&bCf)return -1;
        // Both are CF orphan subtasks — sort by projectLabel.
        return String(a._projectLabel||'').localeCompare(String(b._projectLabel||''));
      });
      // Replace contents in place (extShaped is const but we mutate the array).
      extShaped.length=0;
      grouped.forEach(t=>extShaped.push(t));
    })();
    const tabLabel=_taskTabDefs&&_taskTabDefs[_taskFilterTabIdx]?_taskTabDefs[_taskFilterTabIdx].label:'';
    let extFiltered=extShaped;
    if(tabLabel==='Today')extFiltered=extShaped.filter(t=>t.status!=='Done'&&(t.due===today||(t._override&&t._override.myDay)));
    else if(tabLabel==='This Week'){
      const wkEnd=new Date();wkEnd.setDate(wkEnd.getDate()+7);
      const wkEndStr=_ymd(wkEnd);
      extFiltered=extShaped.filter(t=>t.status!=='Done'&&(!t.due||t.due<=wkEndStr));
    }else if(tabLabel==='Done'){
      extFiltered=extShaped.filter(t=>t.status==='Done');
    }else if(tabLabel==='Someday'||tabLabel==='Recurring'){
      extFiltered=[]; // not applicable to external rows
    }else{
      // All Active / Inbox: open rows only (drop Done).
      extFiltered=extShaped.filter(t=>t.status!=='Done');
    }
    filtered=filtered.concat(extFiltered);
  }
  // Apply column sort if active, else fall back to drag-reorder sortOrder.
  if(_taskListSortBy){
    const projects=D.projects||[];
    const findProj=t=>{if(t.projectId)return projects.find(p=>p.id===t.projectId);if(t.project)return projects.find(p=>p.name===t.project);return null;};
    const priRank={High:3,Medium:2,Low:1};
    const statusRank={'Done':5,'In Progress':4,'Scheduled':3,'Pending':2,'Not Started':1,'Someday':0};
    const keyFor=t=>{
      switch(_taskListSortBy){
        case 'title':return (t.title||'').toLowerCase();
        case 'priority':return priRank[t.priority||'Medium']||0;
        case 'status':return statusRank[t.status||'Not Started']||0;
        case 'start':return t.startDate||'9999';
        case 'end':return t.due||t.endDate||'9999';
        case 'project':{const p=findProj(t);return (p?p.name:t.project||'').toLowerCase();}
        case 'assignee':return (t.assignedTo||t.createdBy||'').toLowerCase();
        case 'created':return t.createdAt||(typeof t.id==='number'&&t.id>1e9?_pd(t.id).toISOString():'9999');
        // Source: native tasks have no _source field (treated as Personal);
        // external rows carry _source ∈ {'smartsheet','nifty',…}. The sort
        // key is prefixed with a rank digit so ascending order matches the
        // chip row's natural order (Personal → CF → LSI → other), instead
        // of pure alphabetical (which would put Nifty before Personal).
        case 'source':{
          const s=t._source||'';
          if(!s)return '1·Personal';
          if(s==='smartsheet')return '2·CF';
          if(s==='nifty')return '3·LSI';
          return '9·'+s;
        }
      }
      return '';
    };
    filtered=[...filtered].sort((a,b)=>{
      const ka=keyFor(a),kb=keyFor(b);
      if(ka<kb)return _taskListSortDir==='asc'?-1:1;
      if(ka>kb)return _taskListSortDir==='asc'?1:-1;
      return 0;
    });
  }else{
    filtered=[...filtered].sort((a,b)=>{
      const ao=typeof a.sortOrder==='number'?a.sortOrder:Number.MAX_SAFE_INTEGER;
      const bo=typeof b.sortOrder==='number'?b.sortOrder:Number.MAX_SAFE_INTEGER;
      return ao-bo;
    });
  }
  // J: group toolbar
  const groupBar=`<div style="display:flex;align-items:center;gap:6px;padding:6px 0;margin-bottom:4px;font-size:11px;color:var(--t3)">
    <span style="font-weight:600;text-transform:uppercase;letter-spacing:.05em">Group:</span>
    ${[['none','None'],['project','Project'],['due','Due'],['assignee','Assignee'],['status','Status']].map(([k,l])=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:${_taskListGroupBy===k?'var(--ac)':'transparent'};color:${_taskListGroupBy===k?'#fff':'var(--t2)'}" onclick="setTaskListGroupBy('${_jsAttr(k)}')">${l}</button>`).join('')}
    <span style="margin-left:auto;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Sort:</span>
    <select class="inp" style="height:22px;font-size:11px;padding:0 4px" onchange="setTaskListSortValue(this.value)">
      ${[['','Manual (drag)'],['title','Title'],['priority','Priority'],['status','Status'],['start','Start date'],['end','Due date'],['created','Created'],['source','Source']].map(([v,l])=>`<option value="${v}" ${_taskListSortBy===v?'selected':''}>${l}</option>`).join('')}
    </select>
    ${_taskListSortBy?`<button class="btn btn-s" style="height:22px;width:24px;padding:0;font-size:11px" onclick="toggleTaskListSortDir()" title="Sort direction">${_taskListSortDir==='asc'?'↑':'↓'}</button>`:''}
  </div>`;
  if(!filtered.length){list.innerHTML=groupBar+renderEmptyState({icon:'list',title:'Inbox zero — for now ✨',hint:'No tasks match your current filter. Capture the next thing on your plate, or relax the filter to see what else is around.',ctaLabel:'+ Add a task',ctaFn:"openFA('task')"});return;}
  const today=_todayStr;
  const priColors={High:'rgba(239,68,68,0.15)',Medium:'rgba(245,158,11,0.15)',Low:'rgba(34,197,94,0.15)'};
  const priText={High:'#F87171',Medium:'#FBBF24',Low:'#86EFAC'};
  const statusColors={Done:'rgba(34,197,94,0.15)','In Progress':'rgba(59,130,246,0.15)','Not Started':'rgba(148,163,184,0.15)',Someday:'rgba(245,158,11,0.15)'};
  const statusText={Done:'#86EFAC','In Progress':'#93C5FD','Not Started':'var(--t2)',Someday:'#FBBF24'};
  const projects=D.projects||[];
  const findProject=t=>{if(t.projectId)return projects.find(p=>p.id===t.projectId);if(t.project)return projects.find(p=>p.name===t.project);return null;};
  // Header — model-driven, user-resizable columns. colTpl + row min-width
  // come from _taskColW so dragging a header edge resizes that column and
  // the choice persists in D.prefs.taskColW.
  const colTpl=_taskColTpl();
  const rowMinW=_taskRowMinW();
  const arrow=col=>_taskListSortBy===col?(_taskListSortDir==='asc'?' ↑':' ↓'):'';
  const headCell=c=>{
    if(c.fixed)return '<div></div>';
    const active=_taskListSortBy===c.sort;
    return `<div class="tl-hc" style="position:relative;cursor:pointer;user-select:none;color:${active?'var(--ac)':'var(--t2)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="setTaskListSort('${_jsAttr(c.sort)}')" title="Click to sort · drag right edge to resize">${c.label}${arrow(c.sort)}<span class="tl-resizer" title="Drag to resize column" onpointerdown="_tlResizeStart(event,'${c.k}')" onclick="event.stopPropagation()"></span></div>`;
  };
  const header=`<div class="tl-row tl-head" style="display:grid;grid-template-columns:${colTpl};gap:8px;padding:8px 12px;min-width:${rowMinW}px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px 6px 0 0;font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;align-items:center;position:sticky;top:0;z-index:5">
    ${_TASK_COLS.map(headCell).join('')}
  </div>`;
  function rowFor(t){
    const proj=findProject(t);
    const projColor=proj?proj.color:null;
    const projName=proj?proj.name:(t.project||'');
    const isOverdue=t.due&&t.due<today&&t.status!=='Done';
    const done=t.status==='Done';
    const pri=t.priority||'Medium';
    const status=t.status||'Not Started';
    const startDate=t.startDate||'';
    const endDate=t.due||t.endDate||'';
    const assigned=t.assignedTo||t.createdBy||'';
    const initials=(assigned||'').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    const createdISO=t.createdAt||(typeof t.id==='number'&&t.id>1e9?_pd(t.id).toISOString():'');
    const createdStr=createdISO?fmtDate(_dayOf(createdISO)):'—';
    // D: bulk checkbox column when in _bulkMode
    const bulkChk=_bulkMode
      ?`<div class="chk ${_bulkSelected.has(t.id)?'on':''}" onclick="event.stopPropagation();toggleBulkSelect(${_tidLit(t.id)},event)" style="width:14px;height:14px"></div>`
      :`<input type="checkbox" ${done?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderCurrentTaskView,100)">`;
    return `<div class="tl-row ${isOverdue?'tl-overdue':''} ${_bulkSelected.has(t.id)?'tl-bulk':''}" data-task-id="${t.id}" data-pri="${esc(pri)}" data-done="${done?'1':'0'}" draggable="true" style="display:grid;grid-template-columns:${colTpl};gap:8px;padding:9px 12px;min-width:${rowMinW}px;border:1px solid var(--bd1);border-top:none;background:${_bulkSelected.has(t.id)?'var(--acs)':'var(--s1)'};font-size:11px;align-items:center;cursor:pointer;${isOverdue?'border-left:3px solid var(--red);padding-left:9px;':''}" ondragstart="_tlDragStart(event,${_tidLit(t.id)})" ondragover="_tlDragOver(event,${_tidLit(t.id)})" ondragleave="_tlDragLeave(event)" ondrop="_tlDrop(event,${_tidLit(t.id)})" ondragend="_tlDragEnd(event)" onclick="${_bulkMode?`toggleBulkSelect(${_tidLit(t.id)},event)`:`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`}">
      <span class="tl-drag" title="Drag to reorder" onclick="event.stopPropagation()">⋮⋮</span>
      ${bulkChk}
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <span style="font-weight:500;${done?'text-decoration:line-through;color:var(--t3)':(t.titleColor?`color:${t.titleColor};font-weight:700`:'color:var(--t1)')};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>
        ${(t.tags||[]).length?`<div style="display:flex;gap:3px;flex-wrap:wrap">${(t.tags||[]).slice(0,3).map(tg=>`<span style="font-size:11px;color:var(--t3);background:var(--s3);padding:1px 5px;border-radius:8px">#${esc(tg)}</span>`).join('')}</div>`:''}
      </div>
      <span class="lu-pill-clickable" title="Click to change priority" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'priority')" style="background:${priColors[pri]||priColors.Medium};color:${priText[pri]||priText.Medium};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;text-align:center;width:fit-content">${pri}</span>
      <span class="lu-pill-clickable" title="Click to change status" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'status')" style="background:${statusColors[status]||statusColors['Not Started']};color:${statusText[status]||statusText['Not Started']};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;width:fit-content">${status}</span>
      <span style="font-size:11px;color:var(--t3)">${startDate?fmtDate(startDate):'—'}</span>
      <span style="font-size:11px;color:${isOverdue?'var(--red)':'var(--t3)'};font-weight:${isOverdue?'600':'400'}">${endDate?fmtDate(endDate):'—'}</span>
      <span style="display:flex;align-items:center;gap:4px;min-width:0">
        ${projColor?`<span style="width:6px;height:6px;border-radius:2px;background:${projColor};flex-shrink:0"></span>`:''}
        <span style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${projName?'var(--t2)':'var(--t3)'}">${projName?esc(projName):'—'}</span>
      </span>
      <span style="display:flex;align-items:center;gap:5px;min-width:0">
        ${initials?`<span style="width:18px;height:18px;border-radius:50%;background:var(--acs);color:var(--ach);font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</span>`:''}
        <span style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${assigned?'var(--t2)':'var(--t3)'}">${assigned?esc(assigned.split(' ')[0]):'—'}</span>
      </span>
      <span style="font-size:11px;color:var(--t3)" title="${createdISO?esc(createdISO):''}">${createdStr}</span>
      <span style="font-size:14px;color:var(--t3);text-align:center" title="Open">›</span>
    </div>`;
  }
  // J: build groups when grouping is on
  // Phones can't use an 11-column grid — render stacked cards instead:
  // title full-width on line 1, meta chips on line 2. Tap opens the task;
  // the round check toggles Done. No horizontal scrolling needed.
  // Full card redesign: the List view renders modern task cards at every
  // width (no more 11-column grid). Sort/drag/bulk all preserved.
  const cardMode=true;
  function cardRow(t){
    // Tasks shared with me (assigned-to-me / admin view) live in another
    // member's blob — render a dedicated read-only card, never the mutable
    // native one, so they can't be edited/completed/deleted from here.
    // MUST be the _shared (shared-workspace) marker only — external tasks
    // (Nifty/LSI, Smartsheet/CF) also carry _readOnly but belong to the
    // external-source path below; routing them here gave them a bogus SHARED
    // badge + "Shared task not found" on click (no _idx, empty _sharedTasks).
    if(t&&t._shared&&!t._source)return _sharedTaskCard(t);
    // External tasks render as a read-only sibling card so they fit the same
    // visual rhythm but route clicks to the source URL + the annotate modal.
    if(t._source&&t._source!=='local'){
      const due=t.due||'';
      const doneExt=t.status==='Done';
      const isOverdueE=!doneExt&&due&&due<today;
      const url=t._url||'#';
      const ov=t._override||{};
      const myDay=!!ov.myDay;
      // Use the original/raw status label for display when status was
      // normalised to 'Done' (e.g. show "Closed" if the source said so).
      const statusLabel=t._rawStatus||t.status||'';
      // Subtask detection — two paths:
      //   A) parentExternalId points at another tracked external task
      //      (Nifty subtasks under parent tasks, Smartsheet rows with
      //      explicit outline parents). Breadcrumb = parent task title.
      //   B) Smartsheet row classified as kind='subtask' but no tracked
      //      parent (CF 120-Day Plan: Project headers + SubTask leaves,
      //      no intermediate Task rows). Breadcrumb = projectLabel —
      //      clicking it jumps to the corresponding LevelUp project.
      // Both paths apply the same indent + dotted left border styling.
      const pid=t._parentExternalId||t.parentExternalId||null;
      let parentRow=null;
      if(pid){
        parentRow=(D.externalTasks||[]).find(x=>x.externalId===pid&&x.source===t._source);
      }
      const isSubtaskByParent=!!parentRow;
      const isCfSubtaskByKind=!isSubtaskByParent && t._source==='smartsheet' && t._kind==='subtask' && !!t._projectLabel;
      const isSubtask=isSubtaskByParent||isCfSubtaskByKind;
      const indent=isSubtask?'margin-left:24px;border-left:2px dotted var(--bd2);padding-left:8px':'';
      let breadcrumb='';
      if(isSubtaskByParent){
        breadcrumb=`<span style="font-size:11px;color:var(--t3);background:var(--s3);padding:1px 5px;border-radius:8px;cursor:pointer" title="Open parent task" onclick="event.stopPropagation();_openExternalAnnotateModal('${_jsAttr(t._source)}','${_jsAttr(pid)}')">↳ ${esc((parentRow.title||'').slice(0,40))}</span>`;
      } else if(isCfSubtaskByKind){
        // Find the LevelUp project (auto-created from this projectLabel) so
        // the breadcrumb clicks open that project's drawer.
        const projMatch=(D.projects||[]).find(p=>(p.name||'').toLowerCase()===(t._projectLabel||'').toLowerCase());
        const clickHandler=projMatch?`openDrawer('project',D.projects.find(x=>x.id==${_tidLit(projMatch.id)}))`:`nav('projects')`;
        breadcrumb=`<span style="font-size:11px;color:var(--t3);background:rgba(31,111,235,.12);border:1px solid color-mix(in srgb,#1f6feb 25%,transparent);padding:1px 5px;border-radius:8px;cursor:pointer" title="Open parent project in LevelUp" onclick="event.stopPropagation();${clickHandler}">${_icon('folder',12,'currentColor')} ${esc((t._projectLabel||'').slice(0,48))}</span>`;
      }
      return `<div class="tlc ${isOverdueE?'tlc-od':''} ${isSubtask?'tlc-subtask':''}" style="border:1px dashed var(--bd2);cursor:pointer;${indent};${doneExt?'opacity:.6':''}" data-ext-id="${esc(t._externalId)}" data-source="${esc(t._source)}" ${pid?`data-parent-ext-id="${esc(pid)}"`:''} onclick="_openExternalAnnotateModal('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}')" title="Click row for actions (mark done, hide, annotate)">
        <div style="width:18px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px">
          <div class="tlc-chk ${doneExt?'on':''}" style="cursor:pointer" onclick="event.stopPropagation();_extToggleCompleted('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}',${doneExt?'false':'true'})" title="${doneExt?'Reopen in source':'Mark complete in source'}"></div>
          <div style="font-size:11px">${_extSourceBadge(t._source)}</div>
        </div>
        <div class="tlc-body">
          <div class="tlc-t" style="${doneExt?'text-decoration:line-through;color:var(--t3)':''}">${isSubtask?'<span style="color:var(--t3);margin-right:4px" title="Subtask">↳</span>':''}<a ${_extOpenAttrs(url)} onclick="event.stopPropagation()" style="color:${doneExt?'var(--t3)':'var(--t1)'};text-decoration:none">${esc(t.title||'Untitled')}</a>${myDay&&!doneExt?' <span title="My Day" style="color:#f59e0b">☀</span>':''} ${breadcrumb}</div>
          ${(t.tags||[]).length?`<div class="tlc-tags">${(t.tags||[]).slice(0,4).map(tg=>`<span>#${esc(tg)}</span>`).join('')}</div>`:''}
          <div class="tlc-m">
            ${doneExt?'':`<span class="lu-pill-clickable" style="background:${priColors[t.priority]||priColors.Medium};color:${priText[t.priority]||priText.Medium}">${t.priority||'Medium'}</span>`}
            ${statusLabel?`<span class="lu-pill-clickable" style="background:${doneExt?'rgba(34,197,94,0.15)':'var(--s3)'};color:${doneExt?'var(--ok)':'var(--t2)'};cursor:pointer" title="Click to change status in source" onclick="event.stopPropagation();_externalSetStatus('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}',event)">${esc(statusLabel)}</span>`:''}
            ${due?`<span class="${isOverdueE?'tlc-odt':''}">📅 ${fmtDate(due)}</span>`:''}
            ${t.completedAt?`<span style="color:var(--ok)">✓ ${fmtDate(_dayOf(t.completedAt))}</span>`:''}
            ${t.project?`<span>${_icon('folder',12,'currentColor')} ${esc(t.project)}</span>`:''}
            ${_extAnnotationChips(t._override)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
          <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" title="Snooze…" onclick="event.stopPropagation();_externalSnoozeMenu('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}',event)">⏰</button>
          <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" title="Annotate" onclick="event.stopPropagation();_openExternalAnnotateModal('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}')">✎</button>
          <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" title="${myDay?'Remove from My Day':'Add to My Day'}" onclick="event.stopPropagation();_toggleExternalMyDay('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}',${myDay?0:1})">${myDay?'☀':'+☀'}</button>
        </div>
        <a ${_extOpenAttrs(url)} class="tlc-go" onclick="event.stopPropagation()" style="color:var(--t3);text-decoration:none" title="Open in source">↗</a>
      </div>`;
    }
    const proj=findProject(t);
    const projColor=proj?proj.color:null;
    const projName=proj?proj.name:(t.project||'');
    const isOverdue=t.due&&t.due<today&&t.status!=='Done';
    const done=t.status==='Done';
    const pri=t.priority||'Medium';
    const status=t.status||'Not Started';
    const endDate=t.due||t.endDate||'';
    const startDate=t.startDate||'';
    const assigned=t.assignedTo||t.createdBy||'';
    const initials=(assigned||'').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    const subs=t.subtasks||[];const subDone=subs.filter(s=>s.done).length;
    const chk=_bulkMode
      ?`<div class="chk ${_bulkSelected.has(t.id)?'on':''}" onclick="event.stopPropagation();toggleBulkSelect(${_tidLit(t.id)},event)"></div>`
      :`<div class="tlc-chk ${done?'on':''}" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderCurrentTaskView,100)" title="Mark done"></div>`;
    return `<div class="tlc ${isOverdue?'tlc-od':''} ${_bulkSelected.has(t.id)?'tlc-sel':''}" data-task-id="${t.id}" data-pri="${esc(pri)}" data-done="${done?'1':'0'}" draggable="${_bulkMode?'false':'true'}" ondragstart="_tlDragStart(event,${_tidLit(t.id)})" ondragover="_tlDragOver(event,${_tidLit(t.id)})" ondragleave="_tlDragLeave(event)" ondrop="_tlDrop(event,${_tidLit(t.id)})" ondragend="_tlDragEnd(event)" onclick="${_bulkMode?`toggleBulkSelect(${_tidLit(t.id)},event)`:`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`}">
      ${_bulkMode?'':`<span class="tlc-drag" title="Drag to reorder" onclick="event.stopPropagation()">⋮⋮</span>`}
      ${chk}
      <div class="tlc-body">
        <div class="tlc-t" style="${done?'text-decoration:line-through;color:var(--t3)':(t.titleColor?`color:${t.titleColor};font-weight:700`:'')}">${esc(t.title||'Untitled')}</div>
        ${subs.length?`<div class="tlc-sub"><div class="tlc-sub-bar"><div style="width:${Math.round(subDone/subs.length*100)}%"></div></div><span>${subDone}/${subs.length}</span></div>`:''}
        ${(t.tags||[]).length?`<div class="tlc-tags">${(t.tags||[]).slice(0,4).map(tg=>`<span>#${esc(tg)}</span>`).join('')}</div>`:''}
        <div class="tlc-m">
          <span class="lu-pill-clickable" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'priority')" style="background:${priColors[pri]||priColors.Medium};color:${priText[pri]||priText.Medium}">${pri}</span>
          <span class="lu-pill-clickable" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'status')" style="background:${statusColors[status]||statusColors['Not Started']};color:${statusText[status]||statusText['Not Started']}">${status}</span>
          ${startDate?`<span>▶ ${fmtDate(startDate)}</span>`:''}
          ${endDate?`<span class="${isOverdue?'tlc-odt':''}">📅 ${fmtDate(endDate)}</span>`:''}
          ${projName?`<span>${projColor?`<i style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${projColor};margin-right:4px;vertical-align:middle"></i>`:''}${esc(projName)}</span>`:''}
          ${initials?`<span title="${esc(assigned)}">👤 ${esc(assigned.split(' ')[0])}</span>`:''}
          ${(()=>{const cl=t.clusterId!=null?(D.clusters||[]).find(c=>String(c.id)===String(t.clusterId)):null;return _bulkMode?'':`<span class="lu-pill-clickable" title="${cl?'Cluster: '+esc(cl.name)+' · click to change':'Move to a cluster'}" onclick="event.stopPropagation();openTaskClusterPicker(${_tidLit(t.id)},event)" style="${cl?'':'opacity:.55'}">⬡${cl?' '+esc((cl.icon?cl.icon+' ':'')+cl.name):''}</span>`;})()}
          ${t.pushedTo&&t.pushedTo.source==='nifty'?`<a title="Pushed to Nifty${t.pushedTo.projectName?' · '+esc(t.pushedTo.projectName):''} · open" style="color:#a78bfa;text-decoration:none" ${t.pushedTo.url?`href="${esc(t.pushedTo.url)}" target="_blank" rel="noopener"`:''} onclick="event.stopPropagation()">↗ Nifty</a>`:''}
        </div>
      </div>
      <span class="tlc-go">›</span>
    </div>`;
  }
  const _rowR=cardMode?cardRow:rowFor;
  // CF Project section headers: between CF orphan-subtask groups, insert
  // a collapsible "📁 <project name>" header row. Tracks transitions
  // between projects so each group gets exactly one header. The header's
  // collapsed state is persisted in D.prefs.cfCollapsedProjects[] so the
  // user's fold state survives reloads.
  // Helper kept inline — emitProjectHeaderHtml(label, projectId, count, collapsed)
  // returns the header div markup.
  const _emitCfHeader=(label,projectId,count,collapsed,doneCount)=>{
    const safe=label; // escaped where it is used (_jsAttr)
    const projName=esc(label);
    return `<div class="cf-proj-header" data-cf-project="${esc(label)}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin:10px 0 4px;background:linear-gradient(to right,rgba(31,111,235,.10),rgba(31,111,235,.02));border:1px solid color-mix(in srgb,#1f6feb 25%,transparent);border-left:3px solid #1f6feb;border-radius:6px;cursor:pointer;user-select:none" onclick="_toggleCfProjectCollapsed('${_jsAttr(safe)}')" title="Click to ${collapsed?'expand':'collapse'} this project">
      <span style="font-size:13px;color:#1f6feb;width:14px;display:inline-flex;align-items:center;justify-content:center">${collapsed?'▸':'▾'}</span>
      <span style="font-size:12px;font-weight:600;color:var(--t1);flex:1">${_icon('folder',12,'currentColor')} ${projName}</span>
      <span style="font-size:11px;color:var(--t3)">${count} task${count===1?'':'s'}${doneCount?` · ${doneCount} done`:''}</span>
      ${projectId?`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="event.stopPropagation();openDrawer('project',D.projects.find(x=>x.id===${projectId}))" title="Open this project's LevelUp page">→</button>`:''}
    </div>`;
  };
  const _collapsedSet=new Set(((D.prefs&&D.prefs.cfCollapsedProjects)||[]).map(s=>String(s).toLowerCase()));
  const _isCfOrphanSubtask=(t)=>t&&t._source==='smartsheet'&&t._kind==='subtask'&&!!t._projectLabel;
  // Pre-count rows per CF project group (for the "N tasks" badge).
  const _cfGroupCounts=new Map();
  const _cfGroupDone=new Map();
  filtered.forEach(t=>{
    if(!_isCfOrphanSubtask(t))return;
    const key=String(t._projectLabel).toLowerCase();
    _cfGroupCounts.set(key,(_cfGroupCounts.get(key)||0)+1);
    if(t.status==='Done')_cfGroupDone.set(key,(_cfGroupDone.get(key)||0)+1);
  });
  let bodyHtml='';
  if(_taskListGroupBy==='none'){
    let lastCfKey=null;
    const parts=[];
    for(const t of filtered){
      if(_isCfOrphanSubtask(t)){
        const key=String(t._projectLabel).toLowerCase();
        if(key!==lastCfKey){
          const projMatch=(D.projects||[]).find(p=>(p.name||'').toLowerCase()===key);
          const count=_cfGroupCounts.get(key)||0;
          const done=_cfGroupDone.get(key)||0;
          const isCollapsed=_collapsedSet.has(key);
          parts.push(_emitCfHeader(t._projectLabel,projMatch?projMatch.id:null,count,isCollapsed,done));
          lastCfKey=key;
        }
        // Skip rendering the row body when its project group is collapsed.
        if(_collapsedSet.has(key))continue;
      } else {
        lastCfKey=null; // reset when we leave the CF cluster
      }
      parts.push(_rowR(t));
    }
    bodyHtml=parts.join('');
  }else{
    const groups={};
    const order=[];
    const groupKey=t=>{
      switch(_taskListGroupBy){
        case 'project':{const p=findProject(t);return p?p.name:(t.project||'(no project)');}
        case 'due':{
          if(!t.due)return '(no due date)';
          const d=t.due,t2=_todayStr;
          if(d<t2)return 'Overdue';
          if(d===t2)return 'Today';
          const dd=_pd(d),td=_pd(t2);const diff=Math.round((dd-td)/86400000);
          if(diff===1)return 'Tomorrow';
          if(diff<=7)return 'This week';
          if(diff<=30)return 'This month';
          return 'Later';
        }
        case 'assignee':return t.assignedTo||t.createdBy||'(unassigned)';
        case 'status':return t.status||'Not Started';
      }
      return '(other)';
    };
    filtered.forEach(t=>{const k=groupKey(t);if(!(k in groups)){groups[k]=[];order.push(k);}groups[k].push(t);});
    bodyHtml=order.map(k=>`<div class="tl-group-h">${esc(k)}<span>${groups[k].length} task${groups[k].length===1?'':'s'}</span></div>${groups[k].map(_rowR).join('')}`).join('');
  }
  if(cardMode){
    list.innerHTML=`<div class="tlc-wrap">${groupBar}${bodyHtml}<div class="add-c" style="border:1px solid var(--bd1);border-radius:10px;margin-top:8px" onclick="openFA('task')">+ Add Task</div></div>`;
  }else{
    list.innerHTML=`<div style="overflow-x:auto">${groupBar}${header}${bodyHtml}<div class="add-c" style="border:1px solid var(--bd1);border-top:none;border-radius:0 0 6px 6px" onclick="openFA('task')">+ Add Task</div></div>`;
  }
}
// Re-render the Tasks List when the viewport crosses the phone/desktop
// breakpoint (e.g. iPhone rotate) so it swaps between card and grid layout.
if(typeof _tlBpWired==='undefined'){
  var _tlBpWired=true;
  var _tlLastNarrow=window.innerWidth<=700;
  let _tlRzT=null;
  window.addEventListener('resize',()=>{
    clearTimeout(_tlRzT);
    _tlRzT=setTimeout(()=>{
      const narrow=window.innerWidth<=700;
      if(narrow!==_tlLastNarrow){
        _tlLastNarrow=narrow;
        if(typeof curScreen!=='undefined'&&curScreen==='tasks'&&_taskView==='list'&&typeof renderCurrentTaskView==='function')renderCurrentTaskView();
      }
    },180);
  });
}
// H: drag-to-reorder handlers for the List view. Persists t.sortOrder on D.tasks.
let _tlDragId=null;
function _tlDragStart(e,id){_tlDragId=id;e.target.classList.add('tl-dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));}catch(_){}}
function _tlDragOver(e,id){if(_tlDragId&&_tlDragId!==id){e.preventDefault();e.currentTarget.classList.add('tl-drop-target');}}
function _tlDragLeave(e){e.currentTarget.classList.remove('tl-drop-target');}
function _tlDragEnd(e){e.target.classList.remove('tl-dragging');document.querySelectorAll('.tl-drop-target').forEach(el=>el.classList.remove('tl-drop-target'));_tlDragId=null;}
function _tlDrop(e,targetId){
  e.preventDefault();
  e.currentTarget.classList.remove('tl-drop-target');
  if(!_tlDragId||_tlDragId===targetId)return;
  // Pull the dragged task; insert just before the drop target in the visible list.
  // Rewrite sortOrder across all tasks so subsequent renders reflect the new order.
  const visible=Array.from(document.querySelectorAll('#tasks-list [data-task-id]')).map(el=>Number(el.dataset.taskId));
  const dragIdx=visible.indexOf(_tlDragId);const dropIdx=visible.indexOf(targetId);
  if(dragIdx<0||dropIdx<0)return;
  visible.splice(dragIdx,1);visible.splice(dragIdx<dropIdx?dropIdx-1:dropIdx,0,_tlDragId);
  visible.forEach((id,i)=>{const t=D.tasks.find(x=>x.id===id);if(t)t.sortOrder=i;});
  // Tasks not in the visible set get pushed past the visible block.
  const visibleSet=new Set(visible);
  D.tasks.filter(t=>!visibleSet.has(t.id)).forEach((t,i)=>{t.sortOrder=visible.length+i+1000;});
  save('tasks');
  renderCurrentTaskView();
}
// ⚡ Focus — an execution surface (not a list manager). Surfaces what to do
// right now in priority order with one-click complete / start / focus.
function renderTaskFocus(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  const today=_todayStr;
  let pool=D.tasks.filter(t=>!t.createdBy||!_taskMyOnly||t.createdBy===(D.creds.userName||'Idris Grant'));
  if(_taskMyOnly)pool=D.tasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  pool=_applyPriorityFilter(pool.slice());
  const active=t=>t.status!=='Done'&&t.status!=='Someday';
  const seen=new Set();
  const take=(arr)=>arr.filter(t=>!seen.has(t.id)).map(t=>{seen.add(t.id);return t;});
  const priRank={High:3,Medium:2,Low:1};
  const byPriDue=(a,b)=>(priRank[b.priority||'Medium']||0)-(priRank[a.priority||'Medium']||0)||(a.due||'9999').localeCompare(b.due||'9999');
  const overdue=take(pool.filter(t=>active(t)&&t.due&&t.due<today).sort((a,b)=>(a.due||'').localeCompare(b.due||'')));
  const dueToday=take(pool.filter(t=>active(t)&&(t.due===today||t.startDate===today)).sort(byPriDue));
  const inProg=take(pool.filter(t=>t.status==='In Progress').sort(byPriDue));
  const myDay=take(pool.filter(t=>t.myDay&&active(t)).sort(byPriDue));
  const upNext=take(pool.filter(t=>active(t)&&(t.priority==='High'||t.priority==='Medium')).sort(byPriDue)).slice(0,8);
  const doneToday=D.tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===today).length;
  const totalQueued=overdue.length+dueToday.length+inProg.length+myDay.length;
  const priColors={High:'#ef4444',Medium:'#f59e0b',Low:'#10b981'};
  const proj=t=>{const p=(D.projects||[]).find(x=>x.id===t.projectId||x.name===t.project);return p?p.name:'';};
  function row(t){
    const pc=priColors[t.priority||'Medium']||'#f59e0b';
    const od=t.due&&t.due<today;
    const pn=proj(t);
    return `<div class="tf-row" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">
      <div class="tf-chk" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderCurrentTaskView,120)" title="Mark done"></div>
      <span class="tf-pri" style="background:${pc}" title="${t.priority||'Medium'} priority"></span>
      <div class="tf-main">
        <div class="tf-t">${esc(t.title||'Untitled')}</div>
        <div class="tf-meta">
          ${t.due?`<span class="${od?'tf-od':''}">📅 ${fmtDate(t.due)}</span>`:''}
          ${t.startTime?`<span>⏰ ${esc(t.startTime)}</span>`:''}
          ${t.estimatedMins?`<span>⏱ ${t.estimatedMins}m</span>`:''}
          ${pn?`<span>${_icon('folder',12,'currentColor')} ${esc(pn)}</span>`:''}
          ${(t.subtasks||[]).length?`<span>☑ ${(t.subtasks||[]).filter(s=>s.done).length}/${(t.subtasks||[]).length}</span>`:''}
        </div>
      </div>
      <div class="tf-acts" onclick="event.stopPropagation()">
        <button title="Focus timer on this" onclick="if(typeof pomoSelectTask==='function')pomoSelectTask(${_tidLit(t.id)});toast('🎯 Focusing: '+esc(D.tasks.find(x=>x.id==${_tidLit(t.id)})?.title||''))">⏱</button>
        ${t.status!=='In Progress'?`<button title="Start" onclick="const x=D.tasks.find(z=>z.id==${_tidLit(t.id)});if(x){setTaskStatus(x,'In Progress');renderCurrentTaskView();}">▶</button>`:`<span class="tf-ip">● In progress</span>`}
      </div>
    </div>`;
  }
  const section=(icon,label,arr,color)=>arr.length?`<div class="tf-sec"><div class="tf-sec-h"><span style="color:${color}">${icon} ${label}</span><span class="tf-sec-n">${arr.length}</span></div>${arr.map(row).join('')}</div>`:'';
  let html=`<div class="tf-wrap">
    <div class="tf-hero">
      <div><div class="tf-hero-big">${totalQueued}</div><div class="tf-hero-l">to do now</div></div>
      <div><div class="tf-hero-big" style="color:var(--red)">${overdue.length}</div><div class="tf-hero-l">overdue</div></div>
      <div><div class="tf-hero-big" style="color:var(--ok)">${doneToday}</div><div class="tf-hero-l">done today</div></div>
      <div style="flex:1"></div>
      <button class="btn btn-p" style="height:30px;font-size:11px" onclick="openFA('task')">+ Add task</button>
    </div>`;
  const body=section('⚠','Overdue',overdue,'var(--red)')
    +section('🔥','Due today',dueToday,'var(--ac)')
    +section('▶','In progress',inProg,'var(--ac)')
    +section('☀','My Day',myDay,'#f59e0b')
    +section('⏭','Up next',upNext,'var(--t2)');
  html+= body || `<div style="text-align:center;padding:48px 20px;color:var(--t3)"><div style="font-size:42px;margin-bottom:10px">🎯</div><div style="font-size:15px;font-weight:600;color:var(--t1);margin-bottom:4px">Nothing demanding your attention</div><div style="font-size:12px">No overdue, due-today, in-progress or My Day tasks. Inbox zero — enjoy it.</div></div>`;
  html+=`</div>`;
  list.innerHTML=html;
}
// 🎴 Cards — responsive grid of compact task cards with subtasks expanded
// inline as a checklist. Modeled on renderTaskList's data prep but emits a
// CSS-grid of cards instead of a vertical row stack. Cards target ~340px
// wide and the grid uses repeat(auto-fit, minmax(340px, 1fr)) so the layout
// flows 1/2/3+ columns based on viewport. External tasks render as
// dashed-border read-only cards; native tasks get the full interactive
// treatment (priority pill picker, status pill picker, subtask toggles,
// click-to-drawer).
function renderTaskCards(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  const today=_todayStr;
  // 1. Native top-level tasks — mirrors renderTaskList's filter pipeline.
  let nativeTasks=_sourceOn('personal')?_topLevelTasks(D.tasks).filter(_taskFilter):[];
  if(_taskMyOnly)nativeTasks=nativeTasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  nativeTasks=_applyPriorityFilter(nativeTasks);
  // 2. External tasks — skipped under My Items (no createdBy on ext rows).
  let extCards=[];
  if(!_taskMyOnly&&Array.isArray(D.externalTasks)){
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    extCards=D.externalTasks
      .filter(t=>!(t.override&&t.override.tombstoned)&&_sourceOn(t.source))
      .map(et=>{
        const ov=et.override||{};
        const done=isExtDone(et);
        return {
          id:'ext:'+et.source+':'+et.externalId,
          title:et.title,
          status:done?'Done':(et.status||'Not Started'),
          _rawStatus:et.status||'',
          priority:ov.localPriority||et.priority||'Medium',
          due:ov.localDue||et.due||'',
          project:et.projectLabel||(et.source==='smartsheet'?'CommunityForce':'LSI Media'),
          assignedTo:et.assignee||'',
          _ext:et,
          _source:et.source,
        };
      })
      .filter(_taskFilter);
    extCards=_applyPriorityFilter(extCards);
  }
  // 3. Sort. Respects the global _taskListSortBy / _taskListSortDir set by
  // the List view's Sort dropdown so the user's choice (incl. Source) carries
  // across views. Falls back to priority desc → due asc when no explicit sort.
  const priRank={High:3,Medium:2,Low:1};
  const statusRank={'Done':5,'In Progress':4,'Scheduled':3,'Pending':2,'Not Started':1,'Someday':0};
  if(_taskListSortBy){
    const keyFor=t=>{
      switch(_taskListSortBy){
        case 'title':return (t.title||'').toLowerCase();
        case 'priority':return priRank[t.priority||'Medium']||0;
        case 'status':return statusRank[t.status||'Not Started']||0;
        case 'start':return t.startDate||'9999';
        case 'end':return t.due||t.endDate||'9999';
        case 'created':return t.createdAt||'9999';
        case 'source':{const s=t._source||'';if(!s)return '1·Personal';if(s==='smartsheet')return '2·CF';if(s==='nifty')return '3·LSI';return '9·'+s;}
      }
      return '';
    };
    const dir=_taskListSortDir==='asc'?1:-1;
    const sortFn=(a,b)=>{const ka=keyFor(a),kb=keyFor(b);if(ka<kb)return -dir;if(ka>kb)return dir;return 0;};
    nativeTasks.sort(sortFn);extCards.sort(sortFn);
  }else{
    const cmp=(a,b)=>(priRank[b.priority||'Medium']||0)-(priRank[a.priority||'Medium']||0)||(a.due||'9999').localeCompare(b.due||'9999');
    nativeTasks.sort(cmp);extCards.sort(cmp);
  }
  // 4. Render.
  const priColors={High:'#ef4444',Medium:'#f59e0b',Low:'#10b981'};
  const priBg={High:'rgba(239,68,68,.12)',Medium:'rgba(245,158,11,.12)',Low:'rgba(16,185,129,.12)'};
  const statusColors={'Not Started':'var(--s3)','In Progress':'rgba(59,130,246,.15)','Done':'rgba(34,197,94,.15)','Someday':'rgba(148,163,184,.15)','Blocked':'rgba(239,68,68,.15)'};
  const statusText={'Not Started':'var(--t2)','In Progress':'var(--ac)','Done':'var(--ok)','Someday':'var(--t3)','Blocked':'var(--red)'};
  const projOf=t=>{const p=(D.projects||[]).find(x=>x.id===t.projectId||x.name===t.project);return p||(t.project?{name:t.project,color:null}:null);};
  function nativeCard(t){
    const subs=t.subtasks||[];const subDone=subs.filter(s=>s.done).length;
    const pri=t.priority||'Medium';const pc=priColors[pri]||priColors.Medium;
    const status=t.status||'Not Started';const done=status==='Done';
    const isOverdue=t.due&&t.due<today&&!done;
    const proj=projOf(t);const projName=proj?proj.name:'';const projColor=proj?proj.color:null;
    const assigned=t.assignedTo||t.createdBy||'';
    const titleStyle=done?'text-decoration:line-through;color:var(--t3)':(t.titleColor?`color:${t.titleColor}`:'color:var(--t1)');
    return `<div class="lu-task-card" data-task-id="${t.id}" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid ${pc};border-radius:10px;padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:transform .1s,box-shadow .15s;${done?'opacity:.62':''}" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.18)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div class="tlc-chk ${done?'on':''}" style="margin-top:2px;flex-shrink:0" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderCurrentTaskView,100)" title="Mark done"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;line-height:1.35;${titleStyle}">${esc(t.title||'Untitled')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center">
            <span class="lu-pill-clickable" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'priority')" style="background:${priBg[pri]};color:${pc};font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px">${pri}</span>
            <span class="lu-pill-clickable" onclick="event.stopPropagation();_taskPillPicker(event,${_tidLit(t.id)},'status')" style="background:${statusColors[status]||statusColors['Not Started']};color:${statusText[status]||statusText['Not Started']};font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px">${status}</span>
            ${t.due?`<span style="font-size:11px;color:${isOverdue?'var(--red)':'var(--t2)'};${isOverdue?'font-weight:600':''}">📅 ${fmtDate(t.due)}</span>`:''}
          </div>
        </div>
      </div>
      ${subs.length?`<div style="border-top:1px dashed var(--bd1);padding-top:8px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <div style="flex:1;height:3px;background:var(--s3);border-radius:2px;overflow:hidden"><div style="width:${Math.round(subDone/subs.length*100)}%;height:100%;background:${pc};transition:width .3s"></div></div>
          <span style="font-size:11px;color:var(--t3);font-weight:600">${subDone}/${subs.length}</span>
        </div>
        ${subs.slice(0,6).map((s,si)=>`<div class="lr" style="padding:2px 0;gap:6px" onclick="event.stopPropagation()">
          <div class="chk ${s.done?'on':''}" style="width:12px;height:12px;flex-shrink:0" onclick="toggleSubtask(${_tidLit(t.id)},${si});setTimeout(renderCurrentTaskView,80)"></div>
          <span style="font-size:11px;line-height:1.35;${s.done?'text-decoration:line-through;color:var(--t3)':'color:var(--t1)'}">${esc(s.title)}</span>
        </div>`).join('')}
        ${subs.length>6?`<div style="font-size:11px;color:var(--t3);margin-top:3px;padding-left:18px">+ ${subs.length-6} more…</div>`:''}
      </div>`:''}
      <div style="display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:6px;border-top:1px solid var(--bd1);font-size:11px;color:var(--t3)">
        ${projName?`<span style="display:inline-flex;align-items:center;gap:3px;min-width:0;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${projColor?`<i style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${projColor};flex-shrink:0"></i>`:''}${esc(projName)}</span>`:'<span>—</span>'}
        ${assigned?`<span style="flex-shrink:0">· 👤 ${esc(assigned.split(' ')[0])}</span>`:''}
        <span style="flex:1"></span>
        <span style="color:var(--t3);font-size:14px">›</span>
      </div>
    </div>`;
  }
  function extCard(c){
    const et=c._ext;const done=c.status==='Done';
    const isOverdue=c.due&&c.due<today&&!done;
    const pri=c.priority||'Medium';const pc=priColors[pri]||priColors.Medium;
    const status=c.status;const sourceLabel=et.source==='smartsheet'?'CF':(et.source==='nifty'?'LSI':et.source.toUpperCase());
    const sourceColor=et.source==='smartsheet'?'#1f6feb':'#8b5cf6';
    return `<div class="lu-task-card" data-ext-id="${esc(et.externalId)}" data-source="${esc(et.source)}" onclick="_openExternalAnnotateModal('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}')" style="background:var(--s2);border:1px dashed var(--bd2);border-left:3px solid ${pc};border-radius:10px;padding:12px 14px;cursor:pointer;display:flex;flex-direction:column;gap:8px;${done?'opacity:.62':''}" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 14px rgba(0,0,0,.18)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div class="tlc-chk ${done?'on':''}" style="margin-top:2px;flex-shrink:0" onclick="event.stopPropagation();_extToggleCompleted('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}',${done?'false':'true'})" title="${done?'Reopen in source':'Mark complete in source'}"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;line-height:1.35;${done?'text-decoration:line-through;color:var(--t3)':'color:var(--t1)'}">${esc(c.title||'Untitled')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center">
            <span style="background:${priBg[pri]};color:${pc};font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px">${pri}</span>
            <span style="background:${statusColors[status]||statusColors['Not Started']};color:${statusText[status]||statusText['Not Started']};font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px">${esc(c._rawStatus||status)}</span>
            ${c.due?`<span style="font-size:11px;color:${isOverdue?'var(--red)':'var(--t2)'};${isOverdue?'font-weight:600':''}">📅 ${fmtDate(c.due)}</span>`:''}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:6px;border-top:1px solid var(--bd1);font-size:11px;color:var(--t3)">
        <span style="background:color-mix(in srgb,${sourceColor} 12%,transparent);color:${sourceColor};font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;flex-shrink:0">${sourceLabel}</span>
        ${c.project?`<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.project)}</span>`:''}
        ${c.assignedTo?`<span style="flex-shrink:0">· 👤 ${esc(c.assignedTo.split(' ')[0])}</span>`:''}
        <span style="flex:1"></span>
        <a ${_extOpenAttrs(et.externalUrl)} onclick="event.stopPropagation()" style="color:var(--t3);text-decoration:none;font-size:11px" title="Open in source">↗</a>
      </div>
    </div>`;
  }
  const cards=nativeTasks.map(nativeCard).concat(extCards.map(extCard));
  const addBtn=`<div onclick="openFA('task')" style="background:transparent;border:1.5px dashed var(--bd2);border-radius:10px;padding:24px 14px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:12px;min-height:120px;transition:border-color .15s,color .15s" onmouseover="this.style.borderColor='var(--ac)';this.style.color='var(--ac)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.color='var(--t3)'">+ Add Task</div>`;
  const emptyMsg='<div style="text-align:center;padding:48px 20px;color:var(--t3)"><div style="font-size:42px;margin-bottom:10px">🎴</div><div style="font-size:15px;font-weight:600;color:var(--t1);margin-bottom:4px">No tasks in this view</div><div style="font-size:12px">Try switching tabs or clearing the priority filter.</div></div>';
  const countLabel=cards.length?`<div style="font-size:11px;color:var(--t3);margin-bottom:10px">${nativeTasks.length} task${nativeTasks.length===1?'':'s'}${extCards.length?` · ${extCards.length} external`:''}</div>`:'';
  // Layout: CSS multi-column flow (masonry-like) instead of CSS grid. Grid
  // uses uniform row heights, so a 4-subtask card next to a 0-subtask card
  // leaves a giant gap below the short one. Columns pack each card flush
  // to the next, no dead space. Reading order is top-to-bottom in column 1,
  // then column 2, etc. (Pinterest-style) which is fine since each card
  // stands alone. `break-inside:avoid` keeps cards from splitting across
  // columns; `display:inline-block` is the cross-browser equivalent.
  const gridHtml=cards.length
    ?`<style>.lu-cards-grid>*{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;margin:0 0 12px;display:inline-block;width:100%;vertical-align:top}</style><div class="lu-cards-grid" style="column-width:340px;column-gap:12px">${cards.join('')}${addBtn}</div>`
    :emptyMsg;
  list.innerHTML=`${countLabel}${gridHtml}`;
}
// Map an external task's free-form status string to one of the Board columns.
// Outline-style Smartsheet rows often have "Month 1" / "Phase 2" / blank
// values — those fall through to Not Started.
function _extStatusToBoardCol(status){
  const s=(status||'').toLowerCase().trim();
  if(!s)return 'Not Started';
  if(/(^|\s)(done|complete|completed|closed|cancell?ed|resolved|shipped)/i.test(s))return 'Done';
  if(/(in\s*progress|doing|active|started|working|wip|ongoing)/i.test(s))return 'In Progress';
  if(/(someday|backlog|later|deferred|on hold|paused)/i.test(s))return 'Someday';
  return 'Not Started';
}
function renderTaskBoard(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  // Kanban columns, one per status. Pending and Scheduled tasks had no
  // column, so they vanished from the Board; any other status a task carries
  // (imports, older data) lands in Not Started rather than nowhere.
  const cols=[
    {id:'ns',label:'Not Started',status:'Not Started',color:'var(--t3)'},
    {id:'pd',label:'Pending',status:'Pending',color:'var(--purp)'},
    {id:'sc',label:'Scheduled',status:'Scheduled',color:'var(--ac2,var(--ac))'},
    {id:'ip',label:'In Progress',status:'In Progress',color:'var(--ac)'},
    {id:'dn',label:'Done',status:'Done',color:'var(--ok)'},
    {id:'sd',label:'Someday',status:'Someday',color:'var(--warn)'}
  ];
  let tasks=_sourceOn('personal')?_topLevelTasks(D.tasks):[];
  if(_taskMyOnly)tasks=tasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  tasks=_applyPriorityFilter(tasks);
  // External tasks → stay on the rail/Today rollups when this view is "My
  // tasks only" (they aren't yours by createdBy). Otherwise inject as
  // read-only cards into the column matching their status.
  const extTasks=(!_taskMyOnly&&Array.isArray(D.externalTasks))?D.externalTasks.filter(t=>!(t.override&&t.override.tombstoned)&&_sourceOn(t.source)):[];
  const colHtml=cols.map(col=>{
    const colTasks=tasks.filter(t=>t.status===col.status||(col.status==='Not Started'&&!cols.some(c=>c.status===t.status)));
    const extInCol=extTasks.filter(et=>_extStatusToBoardCol(et.status)===col.status);
    const cards=colTasks.map(t=>{
      const isBlocked=(t.predecessorIds||[]).length>0&&(t.predecessorIds||[]).some(pid=>{const pred=D.tasks.find(x=>x.id===pid);return pred&&pred.status!=='Done';});
      return `<div data-drag="task" data-drag-id="${esc(String(t.id))}" title="Drag to another column to change its status" style="background:var(--s2);border:1px solid var(--bd2);border-radius:7px;padding:8px 10px;margin-bottom:6px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.18)'" onmouseout="this.style.boxShadow=''" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">
        <div style="font-size:11px;font-weight:500;margin-bottom:4px;line-height:1.3;${t.titleColor?`color:${t.titleColor};font-weight:700`:''}">${esc(t.title)}</div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span>
           ${t.due?`<span style="font-size:11px;color:var(--t3)">${fmtDate(t.due)}</span>`:''}          ${t.project?`<span style="font-size:11px;color:var(--t3);white-space:nowrap">${_icon('folder',12,'currentColor')} ${esc(t.project)}</span>`:''}          ${isBlocked?`<span style="font-size:11px;color:var(--red);font-weight:600">🔒</span>`:''}
          ${t.assignedTo?`<span style="font-size:11px;color:var(--t3)">👤 ${esc(t.assignedTo.split(' ')[0])}</span>`:''}
          ${(()=>{const ci=t.createdAt||(typeof t.id==='number'&&t.id>1e9?_pd(t.id).toISOString():'');return ci?`<span style="font-size:11px;color:var(--t3)" title="Created ${esc(ci)}">🕒 ${fmtDate(ci.slice(0,10))}</span>`:'';})()}
        </div>
        <div style="display:flex;gap:4px;margin-top:5px">
          <button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)})">${t.status==='Done'?'↩ Undo':'✓ Done'}</button>
          ${col.status!=='In Progress'?`<button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" onclick="event.stopPropagation();setTaskStatus(D.tasks.find(x=>x.id==${_tidLit(t.id)}),'In Progress');renderTaskBoard()">▶ Start</button>`:''}
        </div>
      </div>`;
    }).join('');
    // External-task cards — read-only, click opens the source URL, not the
    // task drawer (since drawer is for local tasks). Dotted border + badge
    // so they're visually distinct from native cards.
    const extCards=extInCol.map(et=>{
      const due=(et.override&&et.override.localDue)||et.due;
      const url=et.externalUrl||'#';
      const myDay=et.override&&et.override.myDay;
      return `<div style="background:var(--s2);border:1px dashed var(--bd2);border-radius:7px;padding:8px 10px;margin-bottom:6px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.18)'" onmouseout="this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
          ${_extSourceBadge(et.source)}
          <a ${_extOpenAttrs(url)} title="Open in ${et.source==='smartsheet'?'Smartsheet':'NiftyPM'}" style="flex:1;font-size:11px;font-weight:500;line-height:1.3;color:var(--t1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(et.title)}</a>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:11px;color:var(--t3)">
          ${et.status?`<span>${esc(et.status)}</span>`:''}
          ${due?`<span>📅 ${fmtDate(due)}</span>`:''}
          ${et.projectLabel?`<span>${_icon('folder',12,'currentColor')} ${esc(et.projectLabel)}</span>`:''}
          ${_extAnnotationChips(et.override)}
        </div>
        <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">
          <button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" title="${myDay?'Remove from My Day':'Add to My Day'}" onclick="_toggleExternalMyDay('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}',${myDay?0:1})">${myDay?'☀ Remove':'+☀ My Day'}</button>
          <button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" title="Set status in source" onclick="_externalSetStatus('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}',event)">⚙ Status</button>
          <button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" title="Snooze…" onclick="_externalSnoozeMenu('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}',event)">⏰</button>
          <button class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px" title="Annotate (note, tags, override priority/due)" onclick="_openExternalAnnotateModal('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}')">✎</button>
          <a ${_extOpenAttrs(url)} class="btn btn-s" style="height:18px;font-size:9px;padding:0 4px;display:inline-flex;align-items:center;text-decoration:none">↗ Open</a>
        </div>
      </div>`;
    }).join('');
    const totalInCol=colTasks.length+extInCol.length;
    const extCount=extInCol.length?`<span style="font-size:11px;color:var(--t3);margin-left:4px" title="${extInCol.length} from Smartsheet/Nifty">+${extInCol.length} ext</span>`:'';
    return `<div data-drop="board" data-drop-v="${esc(col.status)}" style="flex:1;min-width:160px;max-width:280px;min-height:140px;border-radius:8px;padding:2px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid ${col.color}">
        <span style="font-size:11px;font-weight:700;color:${col.color}">${col.label}</span>
        <span style="font-size:11px;color:var(--t3);background:var(--s3);border-radius:10px;padding:1px 6px">${totalInCol}</span>
        ${extCount}
      </div>
      ${cards}${extCards}
      <div style="text-align:center;padding:6px;font-size:11px;color:var(--t3);cursor:pointer;border:1px dashed var(--bd2);border-radius:5px" onclick="openFA('task')">+ Add</div>
    </div>`;
  }).join('');
  list.innerHTML=`<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;height:100%;align-items:flex-start">${colHtml}</div>`;
}
// ── Drag to move, mouse and touch (build -238) ──────────────────────────────
// One pointer-based drag for the Board and the calendar (the browser's own
// drag-and-drop doesn't work with a finger on iPhone/iPad). Markup only
// carries data attributes — no handlers:
//   data-drag="<kind>"  data-drag-id="<id>"     what can be picked up
//   data-drop="<zone>"  data-drop-v="<value>"   where it can land
// A drop calls _luDropRoutes[zone](kind, id, value). Mouse: starts after 6px
// of movement. Touch: hold ~0.35s, then drag (a quick swipe still scrolls).
// The click that ends a drag is swallowed so the card doesn't also open.
// Keyboard and screen-reader users keep the existing controls (status pills,
// ✓ Done / ▶ Start, the event dialog's date and time).
const _luDropRoutes={};
const _luDrag={el:null,kind:'',id:'',x:0,y:0,on:false,ghost:null,zone:null,timer:null,touch:false,swallow:false};
function _luDragZoneAt(x,y){
  const g=_luDrag.ghost;
  if(g)g.style.display='none';
  const el=document.elementFromPoint(x,y);
  if(g)g.style.display='';
  return el&&el.closest?el.closest('[data-drop]'):null;
}
function _luDragBegin(){
  const d=_luDrag;
  if(!d.el)return;
  d.on=true;
  const r=d.el.getBoundingClientRect();
  const g=d.el.cloneNode(true);
  g.removeAttribute('id');g.removeAttribute('data-drag');g.setAttribute('aria-hidden','true');
  g.style.position='fixed';g.style.left=r.left+'px';g.style.top=r.top+'px';g.style.width=r.width+'px';g.style.margin='0';
  g.style.pointerEvents='none';g.style.opacity='.9';g.style.zIndex='10050';g.style.boxShadow='0 8px 24px rgba(0,0,0,.25)';g.style.transform='rotate(1deg)';
  g._dx=d.x-r.left;g._dy=d.y-r.top;
  document.body.appendChild(g);d.ghost=g;
  d.el.style.opacity='.4';
  document.body.classList.add('lu-dragging');
  if(d.touch&&navigator.vibrate)try{navigator.vibrate(10);}catch(_){}
}
function _luDragMove(x,y){
  const d=_luDrag;
  if(!d.on){
    if(d.touch)return; // touch waits for the hold
    if(Math.abs(x-d.x)+Math.abs(y-d.y)<6)return;
    _luDragBegin();
  }
  const g=d.ghost;
  if(g){g.style.left=(x-g._dx)+'px';g.style.top=(y-g._dy)+'px';}
  const z=_luDragZoneAt(x,y);
  if(z!==d.zone){if(d.zone)d.zone.classList.remove('lu-drop-over');d.zone=z;if(z)z.classList.add('lu-drop-over');}
  // Scroll the page (or the scrolled list under the finger) near its edges.
  const m=48;
  if(y<m)window.scrollBy(0,-14);else if(y>innerHeight-m)window.scrollBy(0,14);
  const sc=z&&z.closest?z.closest('#tasks-list>div,#cal-main [style*="overflow"]'):null;
  if(sc){const sr=sc.getBoundingClientRect();if(x<sr.left+m)sc.scrollLeft-=14;else if(x>sr.right-m)sc.scrollLeft+=14;}
}
function _luDragEnd(x,y,cancel){
  const d=_luDrag;
  clearTimeout(d.timer);
  const was=d.on,kind=d.kind,id=d.id;
  const zone=was&&!cancel?_luDragZoneAt(x,y):null;
  if(d.ghost)d.ghost.remove();
  if(d.el)d.el.style.opacity='';
  if(d.zone)d.zone.classList.remove('lu-drop-over');
  document.body.classList.remove('lu-dragging');
  Object.assign(d,{el:null,on:false,ghost:null,zone:null,timer:null});
  if(!was)return;
  d.swallow=true;setTimeout(()=>{d.swallow=false;},400);
  if(!zone)return;
  const fn=_luDropRoutes[zone.getAttribute('data-drop')];
  if(typeof fn==='function'){try{fn(kind,id,zone.getAttribute('data-drop-v')||'',zone);}catch(e){console.error('[drop]',e);}}
}
document.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const el=e.target&&e.target.closest?e.target.closest('[data-drag]'):null;
  if(!el||_luDrag.on)return;
  if(e.target.closest('button,a,input,select,textarea,label,[contenteditable="true"],.cal-resize-handle'))return;
  const d=_luDrag;
  clearTimeout(d.timer);
  Object.assign(d,{el,kind:el.getAttribute('data-drag'),id:el.getAttribute('data-drag-id')||'',x:e.clientX,y:e.clientY,on:false,touch:e.pointerType!=='mouse'});
  if(d.touch)d.timer=setTimeout(()=>{if(d.el===el&&!d.on)_luDragBegin();},350);
},true);
document.addEventListener('pointermove',e=>{
  const d=_luDrag;
  if(!d.el)return;
  if(d.touch&&!d.on){if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>8){clearTimeout(d.timer);d.el=null;}return;}
  _luDragMove(e.clientX,e.clientY);
},true);
document.addEventListener('pointerup',e=>{if(_luDrag.el)_luDragEnd(e.clientX,e.clientY,false);},true);
document.addEventListener('pointercancel',()=>{const d=_luDrag;if(d.el&&!d.on){clearTimeout(d.timer);d.el=null;}},true);
// Once a touch drag has started, the finger moves the card, not the page.
document.addEventListener('touchmove',e=>{if(_luDrag.on){e.preventDefault();const t=e.touches[0];if(t)_luDragMove(t.clientX,t.clientY);}},{passive:false,capture:true});
document.addEventListener('touchend',e=>{if(_luDrag.on){const t=e.changedTouches&&e.changedTouches[0];_luDragEnd(t?t.clientX:_luDrag.x,t?t.clientY:_luDrag.y,false);}},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_luDrag.on)_luDragEnd(0,0,true);},true);
window.addEventListener('click',e=>{if(_luDrag.swallow){e.stopPropagation();e.preventDefault();_luDrag.swallow=false;}},true);
(function(){
  if(document.getElementById('lu-dnd-css'))return;
  const s=document.createElement('style');s.id='lu-dnd-css';
  s.textContent='[data-drag]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;cursor:grab}'
    +'body.lu-dragging,body.lu-dragging *{cursor:grabbing!important;-webkit-user-select:none!important;user-select:none!important}'
    +'.lu-drop-over{outline:2px dashed var(--ac);outline-offset:-2px;background:var(--acs)!important}';
  document.head.appendChild(s);
})();
// Board: drop a card on a column to set its status.
_luDropRoutes.board=function(kind,id,status){
  if(kind!=='task'||!status)return;
  const t=(D.tasks||[]).find(x=>String(x.id)===String(id));
  if(!t||t.status===status)return;
  const prev=t.status||'Not Started';
  setTaskStatus(t,status);
  if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();else renderTaskBoard();
  const undo=status==='Done'?[]:[{label:'Undo',onClick:()=>{setTaskStatus(t,prev);if(typeof renderCurrentTaskView==='function')renderCurrentTaskView();}}];
  toast({type:'success',title:'"'+String(t.title||'Task').slice(0,60)+'" → '+status,actions:undo,duration:3500});
};
function renderTaskMatrix(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  let tasks=_sourceOn('personal')?_topLevelTasks(D.tasks).filter(t=>t.status!=='Done'&&t.status!=='Someday'):[];
  if(_taskMyOnly)tasks=tasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  tasks=_applyPriorityFilter(tasks);
  // Effort: 1=Low(estimatedMins<=30), 2=Med(<=90), 3=High(>90) | Impact: High=3, Medium=2, Low=1
  const effortScore=t=>{const m=t.estimatedMins||30;return m<=30?1:m<=90?2:3;};
  const impactScore=t=>t.priority==='High'?3:t.priority==='Medium'?2:1;
  const quadrant=(t)=>{
    const e=effortScore(t),i=impactScore(t);
    if(i>=2&&e<=2)return 'q1'; // High Impact, Low Effort → Do First
    if(i>=2&&e>2)return 'q2';  // High Impact, High Effort → Plan
    if(i<2&&e<=2)return 'q3';  // Low Impact, Low Effort → Delegate/Quick wins
    return 'q4';                // Low Impact, High Effort → Eliminate
  };
  const quads={
    q1:{label:'Do First',sub:'High Impact · Low Effort (≤90m)',hint:'Tackle these now — biggest payoff for the time spent.',color:'var(--ok)',bg:'rgba(34,197,94,.08)',targetPriority:'High',targetMins:30,tasks:[]},
    q2:{label:'Plan',sub:'High Impact · High Effort (>90m)',hint:'Schedule these — break into milestones, allocate deep-work blocks.',color:'var(--ac)',bg:'rgba(99,102,241,.08)',targetPriority:'High',targetMins:120,tasks:[]},
    q3:{label:'Quick Wins',sub:'Low Impact · Low Effort (≤90m)',hint:'Batch or delegate — small jobs that clear the deck.',color:'var(--warn)',bg:'rgba(245,158,11,.08)',targetPriority:'Low',targetMins:30,tasks:[]},
    q4:{label:'Eliminate',sub:'Low Impact · High Effort (>90m)',hint:'Cut, defer, or shrink — high cost for limited value.',color:'var(--red)',bg:'rgba(239,68,68,.08)',targetPriority:'Low',targetMins:120,tasks:[]}
  };
  tasks.forEach(t=>quads[quadrant(t)].tasks.push(t));
  // External tasks: priority defaults to Medium, no estimatedMins ⇒ they
  // all fall into q1 (High Impact, Low Effort) which is misleading. Bucket
  // them separately by their override.localPriority if set, otherwise drop
  // them into q2 ("Plan") — outline-style work usually isn't quick.
  const extTasks=(!_taskMyOnly&&Array.isArray(D.externalTasks))
    ?D.externalTasks.filter(t=>!(t.override&&t.override.tombstoned)&&!_isExtDone(t.status)&&_sourceOn(t.source)):[];
  extTasks.forEach(et=>{
    const ov=et.override||{};
    const pri=ov.localPriority||et.priority||'Medium';
    const q=pri==='High'?'q2':pri==='Low'?'q3':'q2';
    quads[q].tasks.push(et);
  });
  const isExt=t=>!!t._source||(typeof t.source==='string'&&['smartsheet','nifty'].includes(t.source));
  const quadHtml=Object.entries(quads).map(([k,q])=>{
    const cards=q.tasks.map(t=>{
      // External rows have a different shape (et.source, et.externalUrl, etc.)
      // and need a read-only treatment with a deep-link.
      if(t.source==='smartsheet'||t.source==='nifty'){
        const url=t.externalUrl||'#';
        const myDay=t.override&&t.override.myDay;
        const ov=t.override||{};
        const pri=ov.localPriority||t.priority||'Medium';
        return `<div class="mtx-card" style="background:var(--s1);border:1px dashed var(--bd2);border-radius:6px;padding:6px 8px;margin-bottom:5px;font-size:11px">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
            ${_extSourceBadge(t.source)}
            <a ${_extOpenAttrs(url)} title="Open in source" style="flex:1;font-weight:500;color:var(--t1);text-decoration:none;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</a>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <span class="pill ${pillClass(pri)}" style="font-size:9px">${pri}</span>
            ${t.status?`<span style="font-size:11px;color:var(--t3)">${esc(t.status)}</span>`:''}
            ${t.projectLabel?`<span style="font-size:11px;color:var(--t3)">${_icon('folder',12,'currentColor')} ${esc(t.projectLabel)}</span>`:''}
            ${_extAnnotationChips(t.override)}
            <button class="btn btn-s" style="height:16px;font-size:9px;padding:0 4px;margin-left:auto" title="Annotate" onclick="_openExternalAnnotateModal('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}')">✎</button>
            <button class="btn btn-s" style="height:16px;font-size:9px;padding:0 4px" title="${myDay?'Remove from My Day':'Add to My Day'}" onclick="_toggleExternalMyDay('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',${myDay?0:1})">${myDay?'☀':'+☀'}</button>
          </div>
        </div>`;
      }
      return `<div class="mtx-card" data-task-id="${t.id}" draggable="true" ondragstart="_mtxDragStart(event,${_tidLit(t.id)})" ondragend="_mtxDragEnd(event)" style="background:var(--s1);border:1px solid var(--bd1);border-radius:6px;padding:6px 8px;margin-bottom:5px;cursor:grab;font-size:11px" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">
        <div style="font-weight:500;margin-bottom:2px;line-height:1.3;${t.titleColor?`color:${t.titleColor};font-weight:700`:''}">${esc(t.title)}</div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span>
          <span style="font-size:11px;color:var(--t3)">${t.estimatedMins||30}m</span>
          ${t.project?`<span style="font-size:11px;color:var(--t3)">${_icon('folder',12,'currentColor')} ${esc(t.project)}</span>`:''}
          ${t.due?`<span style="font-size:11px;color:var(--t3)">📅 ${fmtDate(t.due)}</span>`:''}
          ${(()=>{const ci=t.createdAt||(typeof t.id==='number'&&t.id>1e9?_pd(t.id).toISOString():'');return ci?`<span style="font-size:11px;color:var(--t3)" title="Created ${esc(ci)}">🕒 ${fmtDate(ci.slice(0,10))}</span>`:'';})()}
        </div>
      </div>`;
    }).join('');
    return `<div class="mtx-quad" data-quad="${k}" data-target-priority="${q.targetPriority}" data-target-mins="${q.targetMins}" ondragover="_mtxDragOver(event)" ondragleave="_mtxDragLeave(event)" ondrop="_mtxDrop(event,'${q.targetPriority}',${q.targetMins})" style="flex:1;min-width:220px;background:${q.bg};border:1px solid var(--bd1);border-radius:10px;padding:12px;transition:outline .15s,background .15s">
      <div style="margin-bottom:6px">
        <div style="font-size:13px;font-weight:700;color:${q.color}">${q.label}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${q.sub} · ${q.tasks.length} task${q.tasks.length!==1?'s':''}</div>
        <div style="font-size:11px;color:var(--t2);margin-top:4px;line-height:1.4">${q.hint}</div>
      </div>
      <div style="max-height:340px;overflow-y:auto;min-height:60px">${cards||`<div style="font-size:11px;color:var(--t3);text-align:center;padding:18px;border:1px dashed var(--bd1);border-radius:6px">Drop tasks here</div>`}</div>
      <div class="mtx-add" style="display:flex;gap:4px;margin-top:8px">
        <input class="inp" data-mtx-add="${k}" placeholder="＋ Add a task to ${esc(q.label)}…" style="flex:1;height:26px;font-size:11px" onkeydown="if(event.key==='Enter'){event.preventDefault();_mtxAddTask('${_jsAttr(k)}',this)}" onclick="event.stopPropagation()">
        <button class="btn btn-s" style="height:26px;font-size:11px;padding:0 8px;white-space:nowrap" title="Add a task that lands in this quadrant" onclick="event.stopPropagation();_mtxAddTask('${_jsAttr(k)}',this.previousElementSibling)">Add</button>
      </div>
    </div>`;
  }).join('');
  list.innerHTML=`<div style="margin-bottom:10px;padding:10px 12px;background:var(--s2);border:1px solid var(--bd1);border-radius:8px;font-size:11px;color:var(--t2);line-height:1.55">
    <div style="font-weight:600;color:var(--t1);margin-bottom:4px">🎯 Eisenhower Matrix — Impact × Effort</div>
    Tasks are placed automatically based on their <strong>Priority</strong> (Impact: High = top row, Low = bottom row) and <strong>Estimated minutes</strong> (Effort: ≤90m = left column, &gt;90m = right column).
    <strong>Drag any task</strong> between quadrants to update both at once — drops snap the task to that quadrant's typical Priority + estimated minutes. Click a card to open the full drawer for fine-tuning.
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${quadHtml}</div>`;
}
// Matrix drag-to-reposition: drop on a quadrant snaps the task's priority +
// estimatedMins so it falls into that quadrant on the next render.
let _mtxDragId=null;
function _mtxDragStart(e,id){_mtxDragId=id;e.target.classList.add('mtx-dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));}catch(_){}}
function _mtxDragEnd(e){e.target.classList.remove('mtx-dragging');document.querySelectorAll('.mtx-quad').forEach(el=>{el.style.outline='';el.style.background='';});_mtxDragId=null;}
function _mtxDragOver(e){if(_mtxDragId){e.preventDefault();e.currentTarget.style.outline='2px dashed var(--ac)';e.currentTarget.style.outlineOffset='-3px';}}
function _mtxDragLeave(e){e.currentTarget.style.outline='';}
function _mtxDrop(e,targetPriority,targetMins){
  e.preventDefault();e.currentTarget.style.outline='';
  if(!_mtxDragId)return;
  const t=D.tasks.find(x=>x.id===_mtxDragId);if(!t)return;
  // Only update fields that need to change so we don't surprise the user with
  // unrelated edits. If priority is already in the target tier, keep it.
  const curImpactHigh=(t.priority==='High'||t.priority==='Medium');
  const wantImpactHigh=targetPriority==='High';
  if(curImpactHigh!==wantImpactHigh)t.priority=targetPriority;
  const curMins=t.estimatedMins||30;
  const curEffortLow=curMins<=90;
  const wantEffortLow=targetMins<=90;
  if(curEffortLow!==wantEffortLow)t.estimatedMins=targetMins;
  save('tasks');
  toast(`✓ Moved to ${targetPriority==='High'?'high':'low'}-impact / ${wantEffortLow?'low':'high'}-effort`);
  renderCurrentTaskView();
}
// ── Add a task straight into a quadrant (build -200) ──────────────────────
// The Matrix places tasks by Priority (impact) × estimatedMins (effort), so a
// task born in a quadrant just needs that quadrant's typical values — the same
// pair _mtxDrop snaps to. The record shape mirrors doFASave's task literal.
const _MTX_QUAD_DEFAULTS={q1:{priority:'High',mins:30},q2:{priority:'High',mins:120},q3:{priority:'Low',mins:30},q4:{priority:'Low',mins:120}};
function _mtxAddTask(quadKey,inputEl){
  const q=_MTX_QUAD_DEFAULTS[quadKey];if(!q)return;
  const title=(inputEl&&inputEl.value||'').trim();
  if(!title){if(inputEl)inputEl.focus();return;}
  const t={
    id:nextId(D.tasks),title:title.slice(0,300),notes:'',
    priority:q.priority,status:'Not Started',smartList:'Task Intake',
    startDate:'',endDate:'',due:'',startTime:'',endTime:'',
    estimatedMins:q.mins,actualMins:0,energy:'medium',context:'',location:'Anywhere',pi:'Process',recurring:'None',
    projectId:null,project:'',linkedGoalId:null,assignedTo:null,delegatedTo:null,
    snoozeUntil:'',reminder:'',myDay:false,isWorkTask:true,
    tags:[],scope:{personal:false,business:false},subtasks:[],linkedNoteIds:[],predecessorIds:[],comments:[],
    createdBy:D.creds.userName||'Me',createdAt:new Date().toISOString()
  };
  D.tasks.push(t);
  save('tasks');
  try{updateSidebarBadges();}catch(_){}
  renderCurrentTaskView();
  // Keep the cursor in the same quadrant so several tasks can be added in a row.
  setTimeout(()=>{const again=document.querySelector(`input[data-mtx-add="${quadKey}"]`);if(again)again.focus();},60);
  toast(`✓ Added "${t.title.slice(0,40)}" · ${q.priority} · ${q.mins}m`);
}
function renderTaskGantt(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  // Track skipped (no-date) counts so we can surface "why isn't task X here"
  // in the footer — Gantt requires a due or start date and silently dropped
  // everything else, which read as "the view is truncated".
  let skippedLocal=0,skippedExt=0;
  const localUniverse=_sourceOn('personal')?_topLevelTasks(D.tasks).filter(t=>t.status!=='Done'):[];
  let tasks=localUniverse.filter(t=>{const ok=!!(t.due||t.startDate);if(!ok)skippedLocal++;return ok;}).map(t=>Object.assign({},t,{_source:'local'}));
  if(_taskMyOnly)tasks=tasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  tasks=_applyPriorityFilter(tasks);
  // Overlay external tasks with dates (localDue overrides, or source-provided
  // due/startDate). Skipped under "My Items" scope. Externals are click-to-
  // open-source rather than open-drawer; rendered with dashed bar treatment.
  if(!_taskMyOnly&&Array.isArray(D.externalTasks)){
    const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    D.externalTasks.forEach(et=>{
      if(et.override&&et.override.tombstoned)return;
      if(isDone(et))return;
      if(!_sourceOn(et.source))return;
      const due=(et.override&&et.override.localDue)||et.due;
      const start=et.startDate||due;
      if(!due&&!start){skippedExt++;return;}
      tasks.push({
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title,
        due,startDate:start,
        priority:(et.override&&et.override.localPriority)||et.priority||'Medium',
        status:et.status,
        _source:et.source,
        _url:et.externalUrl,
        _externalId:et.externalId,
        _parentExternalId:et.parentExternalId||null,
      });
    });
  }
  if(!tasks.length){
    list.innerHTML=`<div style="text-align:center;padding:40px;color:var(--t3)">
      <div style="font-size:32px;margin-bottom:8px">📅</div>
      <div style="font-size:13px;font-weight:600">No tasks with dates</div>
      <div style="font-size:11px;margin-top:4px">Add start or due dates to tasks to see them here.</div>
    </div>`;
    return;
  }
  // Calculate date range
  const today=new Date(); today.setHours(0,0,0,0);
  const allDates=tasks.flatMap(t=>[t.startDate,t.due].filter(Boolean).map(d=>_pd(d)));
  let minDate=new Date(Math.min(...allDates)); minDate.setDate(minDate.getDate()-1);
  let maxDate=new Date(Math.max(...allDates)); maxDate.setDate(maxDate.getDate()+2);
  // Ensure at least 14 days visible
  const span=Math.max(14,Math.round((maxDate-minDate)/(1000*60*60*24)));
  maxDate=_pd(minDate); maxDate.setDate(minDate.getDate()+span);
  const totalDays=Math.round((maxDate-minDate)/(1000*60*60*24));
  const dayPx=Math.max(28,Math.floor(Math.min(900,list.offsetWidth-220)/totalDays));
  const totalW=totalDays*dayPx;
  // Build header (day labels)
  let headerCells='';
  for(let i=0;i<totalDays;i++){
    const d=_pd(minDate); d.setDate(minDate.getDate()+i);
    const isToday=d.toDateString()===today.toDateString();
    const dayNum=d.getDate();
    const isMonStart=dayNum===1;
    headerCells+=`<div style="width:${dayPx}px;min-width:${dayPx}px;text-align:center;font-size:11px;color:${isToday?'var(--ac)':'var(--t3)'};font-weight:${isToday?'700':'400'};border-left:1px solid ${isMonStart?'var(--bd2)':'transparent'};padding:2px 0;flex-shrink:0">${isMonStart?d.toLocaleString('default',{month:'short'})+' ':''} ${dayNum}</div>`;
  }
  // Build task rows
  const priorityColors={High:'var(--red)',Medium:'var(--ac)',Low:'var(--ok)'};
  const rows=tasks.map(t=>{
    const start=t.startDate?_pd(t.startDate):_pd(t.due);
    const end=t.due?_pd(t.due):start;
    start.setHours(0,0,0,0); end.setHours(0,0,0,0);
    const startOffset=Math.max(0,Math.round((start-minDate)/(1000*60*60*24)));
    const duration=Math.max(1,Math.round((end-start)/(1000*60*60*24))+1);
    const barLeft=startOffset*dayPx;
    const barWidth=Math.min(duration*dayPx, totalW-barLeft);
    const overdue=end<today&&t.status!=='Done';
    const barColor=overdue?'var(--red)':priorityColors[t.priority]||'var(--ac)';
    const isBlocked=(t.predecessorIds||[]).length>0&&(t.predecessorIds||[]).some(pid=>{const p=D.tasks.find(x=>x.id===pid);return p&&p.status!=='Done';});
    // Today marker offset
    const todayOffset=Math.round((today-minDate)/(1000*60*60*24));
    const isExt=t._source&&t._source!=='local';
    const titleClickHandler=isExt?(t._url&&/^https?:\/\//i.test(t._url)?`_luOpenUrl('${_jsAttr(t._url)}')`:`_openExternalAnnotateModal('${_jsAttr(t._source)}','${_jsAttr(t._externalId)}')`):`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`;
    const barStyle=isExt?`background:transparent;border:2px dashed ${barColor};color:${barColor}`:`background:${barColor};color:#fff`;
    return `<div style="display:flex;align-items:center;border-bottom:1px solid var(--bd1);min-height:32px">
      <div style="width:200px;min-width:200px;padding:0 8px;font-size:11px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer" onclick="${titleClickHandler}" title="${esc(t.title)}${isExt?' (opens in source)':''}">
        ${isBlocked?'<span style="color:var(--red);margin-right:3px">🔒</span>':''}
        ${isExt?_extSourceBadge(t._source):''}
        <span style="font-weight:500;${t.titleColor?`color:${t.titleColor};font-weight:700`:''}">${esc(t.title)}</span>
      </div>
      <div style="flex:1;position:relative;height:32px;overflow:hidden">
        <!-- Today line -->
        ${todayOffset>=0&&todayOffset<totalDays?`<div style="position:absolute;left:${todayOffset*dayPx}px;top:0;bottom:0;width:2px;background:var(--ac);opacity:.5;z-index:2"></div>`:''}
        <!-- Bar -->
        <div style="position:absolute;top:6px;left:${barLeft}px;width:${barWidth}px;height:20px;${barStyle};border-radius:4px;opacity:.9;cursor:pointer;display:flex;align-items:center;padding:0 6px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box" onclick="${titleClickHandler}" title="${esc(t.title)}">
          ${barWidth>40?esc(t.title.substring(0,20)):''}
        </div>
      </div>
    </div>`;
  }).join('');
  // Today marker column header
  const todayOffset=Math.round((today-minDate)/(1000*60*60*24));
  const skipTotal=skippedLocal+skippedExt;
  const skipNote=skipTotal>0?`<span style="margin-left:auto;color:var(--warn)" title="Gantt only shows tasks with a start or due date. Add dates to surface the rest.">${skipTotal} task${skipTotal===1?'':'s'} hidden — no date${skippedExt?` (incl. ${skippedExt} external)`:''}</span>`:'';
  // The scroll wrapper now caps vertical height + opens overflow-y:auto. With
  // both axes set to auto the rows scroll inside the panel instead of pushing
  // the page footer off-screen and looking truncated. The horizontal date
  // strip continues to scroll inside the same container.
  list.innerHTML=`
  <div style="overflow:auto;max-height:calc(100vh - 360px);border:1px solid var(--bd1);border-radius:6px">
    <div style="min-width:${200+totalW}px">
      <!-- Header (sticky so it stays visible while scrolling rows) -->
      <div style="display:flex;border-bottom:2px solid var(--bd2);background:var(--s2);position:sticky;top:0;z-index:3">
        <div style="width:200px;min-width:200px;padding:4px 8px;font-size:11px;font-weight:600;color:var(--t2);background:var(--s2);position:sticky;left:0;z-index:4">Task</div>
        <div style="display:flex;flex:1">${headerCells}</div>
      </div>
      <!-- Rows -->
      ${rows}
    </div>
  </div>
  <div style="margin-top:10px;display:flex;gap:12px;font-size:11px;color:var(--t3);align-items:center;flex-wrap:wrap">
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--red);border-radius:2px;margin-right:3px"></span>Overdue / High</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--ac);border-radius:2px;margin-right:3px"></span>Medium</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:var(--ok);border-radius:2px;margin-right:3px"></span>Low</span>
    <span><span style="display:inline-block;width:2px;height:10px;background:var(--ac);margin-right:3px"></span>Today</span>
    <span style="color:var(--t2)">${tasks.length} task${tasks.length===1?'':'s'} on chart</span>
    ${skipNote}
  </div>`;
}
function quickAddTask(){
  const inp=document.getElementById('task-quick-input');
  if(!inp)return;
  const raw=inp.value.trim();
  if(!raw){inp.focus();return;}
  // G: smart parse extracts !priority / dates / #tags / @project / ~30m
  const p=_taskSmartParse(raw);
  if(!p.title){inp.focus();return;}
  // Resolve project name -> project obj if it matches an existing project.
  let projectId=null,projectName='';
  if(p.project){
    const proj=(D.projects||[]).find(pr=>(pr.name||'').toLowerCase().includes(p.project.toLowerCase()));
    if(proj){projectId=proj.id;projectName=proj.name;}else{projectName=p.project;}
  }
  const newTask={
    id:Date.now(),
    title:p.title,
    priority:p.priority||'Medium',
    status:'Not Started',
    due:p.due||'',
    startDate:'',
    endDate:'',
    startTime:'',
    endTime:'',
    estimatedMins:p.est||30,
    context:'',
    project:projectName,
    projectId,
    myDay:false,
    energy:'medium',
    tags:p.tags||[],
    notes:'',
    recurring:'None',
    subtasks:[],
    linkedGoalId:null,
    assignedTo:D.creds.userName||'Idris Grant',
    createdBy:D.creds.userName||'Idris Grant'
  };
  D.tasks.unshift(newTask);
  save('tasks');
  updateSidebarBadges();
  inp.value='';
  inp.focus();
  renderCurrentTaskView();
  // Build a confirmation toast that surfaces what was parsed so the user
  // sees the smart parse landed correctly (or quickly notices it didn't).
  const bits=[];
  if(p.priority)bits.push(`!${p.priority.toLowerCase()}`);
  if(p.due)bits.push(`due ${p.due}`);
  if(p.tags.length)bits.push(p.tags.map(t=>'#'+t).join(' '));
  if(projectName)bits.push('@'+projectName);
  if(p.est)bits.push(`~${p.est}m`);
  toast(bits.length?`✓ Added · ${bits.join(' · ')}`:'✓ Task added!');
}
// ─── Cluster progress roll-up ────────────────────────────────────────────────
function clusterProgress(cluster){
  const projIds=new Set(cluster.projectIds||[]);
  const directTasks=D.tasks.filter(t=>String(t.clusterId)===String(cluster.id)||(t.projectId&&projIds.has(t.projectId)));
  if(!directTasks.length)return 0;
  const done=directTasks.filter(t=>t.status==='Done').length;
  return Math.round((done/directTasks.length)*100);
}
function clusterTaskCount(cluster){
  const projIds=new Set(cluster.projectIds||[]);
  return D.tasks.filter(t=>String(t.clusterId)===String(cluster.id)||(t.projectId&&projIds.has(t.projectId))).length;
}
function clusterOverdueCount(cluster){
  const today=_todayStr;
  const projIds=new Set(cluster.projectIds||[]);
  return D.tasks.filter(t=>(String(t.clusterId)===String(cluster.id)||(t.projectId&&projIds.has(t.projectId)))&&t.status!=='Done'&&t.due&&t.due<today).length;
}
// ─── Render Tasks Clusters View ──────────────────────────────────────────────
let _clusterCollapsed={};
// Relative due date: "Today", "Tomorrow", "Yesterday", weekday short name within ±6 days, else formatted date.
function _relDue(d){
  if(!d)return 'No due';
  const dt=new Date(String(d).includes('T')?d:d+'T00:00');
  if(isNaN(dt))return String(d);
  const t=new Date(_todayStr+'T00:00');
  const diff=Math.round((dt-t)/(1000*60*60*24));
  if(diff===0)return 'Today';
  if(diff===1)return 'Tomorrow';
  if(diff===-1)return 'Yesterday';
  if(Math.abs(diff)<=6)return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
  return fmtDate(d);
}
function _shiftTaskCal(delta){
  const cur=_taskCalCursor||_todayStr.slice(0,7);
  const [y,m]=cur.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  _taskCalCursor=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  renderCurrentTaskView();
}
function _taskCalToday(){_taskCalCursor=_todayStr.slice(0,7);renderCurrentTaskView();}
function renderTaskCalendar(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  let filtered=_sourceOn('personal')?_topLevelTasks(D.tasks).filter(_taskFilter):[];
  if(_taskMyOnly)filtered=filtered.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant'));
  filtered=_applyPriorityFilter(filtered);
  const cur=_taskCalCursor||_todayStr.slice(0,7);
  const [yy,mm]=cur.split('-').map(Number);
  const first=new Date(yy,mm-1,1);
  const monthName=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const startDow=first.getDay();
  const daysInMonth=new Date(yy,mm,0).getDate();
  const prevDays=new Date(yy,mm-1,0).getDate();
  // Build 6×7 grid cells
  const cells=[];
  for(let i=0;i<startDow;i++){
    const d=prevDays-startDow+i+1;
    const dt=new Date(yy,mm-2,d);
    cells.push({date:dt,inMonth:false});
  }
  for(let d=1;d<=daysInMonth;d++)cells.push({date:new Date(yy,mm-1,d),inMonth:true});
  while(cells.length<42){
    const last=cells[cells.length-1].date;
    const nd=new Date(last.getFullYear(),last.getMonth(),last.getDate()+1);
    cells.push({date:nd,inMonth:nd.getMonth()===mm-1});
  }
  const fmt=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  // Group tasks by date (use due date primarily, fall back to startDate)
  const byDay={};
  filtered.forEach(t=>{
    const k=t.due||t.startDate;
    if(!k)return;
    (byDay[k]=byDay[k]||[]).push(Object.assign({},t,{_source:'local'}));
  });
  // Overlay external tasks (Smartsheet/Nifty) with due dates. Outline-style
  // rows without due dates aren't shown on the grid — the rail/Command Center
  // surface them instead. Tombstoned + Done rows are excluded. Respects "My
  // Items only" by excluding externals when that scope is active.
  if(!_taskMyOnly&&Array.isArray(D.externalTasks)){
    const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    D.externalTasks.forEach(et=>{
      if(et.override&&et.override.tombstoned)return;
      if(isDone(et))return;
      if(!_sourceOn(et.source))return;
      const k=(et.override&&et.override.localDue)||et.due||et.startDate;
      if(!k)return;
      (byDay[k]=byDay[k]||[]).push({
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title,
        status:et.status,
        priority:et.priority,
        due:k,
        _source:et.source,
        _url:et.externalUrl,
        _externalId:et.externalId,
      });
    });
  }
  const priText={High:'#F87171',Medium:'#FBBF24',Low:'#86EFAC'};
  const dows=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const header=`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px 6px 0 0">
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-s" style="height:26px;font-size:11px;padding:0 8px" onclick="_shiftTaskCal(-1)">‹</button>
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="_taskCalToday()">Today</button>
      <button class="btn btn-s" style="height:26px;font-size:11px;padding:0 8px" onclick="_shiftTaskCal(1)">›</button>
    </div>
    <div style="font-size:13px;font-weight:600;color:var(--t1)">${monthName}</div>
    <div style="font-size:11px;color:var(--t3)">${filtered.length} tasks</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);background:var(--s2);border:1px solid var(--bd1);border-top:none;font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">${dows.map(d=>`<div style="padding:6px 8px;text-align:center;border-right:1px solid var(--bd1)">${d}</div>`).join('')}</div>`;
  const grid=`<div style="display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:minmax(96px,auto);border:1px solid var(--bd1);border-top:none;border-radius:0 0 6px 6px;overflow:hidden">${cells.map((c,i)=>{
    const k=fmt(c.date);
    const isToday=k===_todayStr;
    const items=byDay[k]||[];
    const dim=c.inMonth?1:.4;
    const bg=isToday?'rgba(99,102,241,0.10)':'transparent';
    return `<div style="border-right:1px solid var(--bd1);border-bottom:1px solid var(--bd1);padding:4px 6px;opacity:${dim};background:${bg};min-height:96px;cursor:pointer" onclick="openFA('task');setTimeout(()=>{const i=document.getElementById('fa-due');if(i)i.value='${_jsAttr(k)}';},50)">
      <div style="font-size:11px;color:${isToday?'var(--ac)':'var(--t2)'};font-weight:${isToday?'700':'500'};margin-bottom:2px">${c.date.getDate()}</div>
      ${items.slice(0,4).map(t=>{
        if(t._source&&t._source!=='local'){
          const url=t._url||'#';
          const badgeColor=t._source==='smartsheet'?'#1f6feb':'#9333ea';
          const badgeText=t._source==='smartsheet'?'CF':'LSI';
          return `<div style="font-size:11px;line-height:1.3;padding:2px 4px;margin-bottom:2px;background:var(--s1);border-left:2px dashed ${badgeColor};border-radius:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)} (open in source)"><a ${_extOpenAttrs(url)} onclick="event.stopPropagation()" style="color:var(--t1);text-decoration:none"><span style="display:inline-block;padding:0 3px;border-radius:2px;background:${badgeColor};color:#fff;font-size:7px;font-weight:700;letter-spacing:.3px;margin-right:3px">${badgeText}</span>${esc(t.title)}</a></div>`;
        }
        return `<div style="font-size:11px;line-height:1.3;padding:2px 4px;margin-bottom:2px;background:var(--s1);border-left:2px solid ${priText[t.priority]||'var(--t3)'};border-radius:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${t.status==='Done'?'text-decoration:line-through;opacity:.55;':(t.titleColor?`color:${t.titleColor};font-weight:700;`:'')}" onclick="event.stopPropagation();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))" title="${esc(t.title)}">${esc(t.title)}</div>`;
      }).join('')}
      ${items.length>4?`<div style="font-size:11px;color:var(--t3);padding:0 4px">+${items.length-4} more</div>`:''}
    </div>`;
  }).join('')}</div>`;
  list.innerHTML=header+grid;
}
// Cluster view drag-to-reassign (fixes #5).
let _clTaskDragId=null;
function _clusterTaskDragStart(e,id){
  _clTaskDragId=id;
  try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));}catch(_){}
  e.currentTarget.style.opacity='.4';
}
function _clusterTaskDragEnd(e){
  e.currentTarget.style.opacity='';
  document.querySelectorAll('.cl-card').forEach(el=>{el.style.boxShadow='';el.style.background='var(--s2)';});
  _clTaskDragId=null;
}
function _clusterDragOver(e,clId){
  if(!_clTaskDragId)return;
  e.preventDefault();
  try{e.dataTransfer.dropEffect='move';}catch(_){}
  e.currentTarget.style.boxShadow='0 0 0 2px var(--ac) inset';
  e.currentTarget.style.background=`color-mix(in srgb, var(--ac) 12%, var(--s2))`;
}
function _clusterDragLeave(e){
  e.currentTarget.style.boxShadow='';
  e.currentTarget.style.background='var(--s2)';
}
function _clusterDrop(e,clId){
  e.preventDefault();
  e.currentTarget.style.boxShadow='';e.currentTarget.style.background='var(--s2)';
  if(!_clTaskDragId)return;
  const t=D.tasks.find(x=>x.id===_clTaskDragId);if(!t){_clTaskDragId=null;return;}
  // Drop onto orphan = clear cluster; drop onto a real cluster = set t.clusterId
  if(clId==='__orphan__'){delete t.clusterId;}
  else{t.clusterId=Number(clId);}
  save('tasks');
  _clTaskDragId=null;
  renderTaskClusters();
  toast(clId==='__orphan__'?'Removed from cluster':'Moved to cluster');
}

// ── Assign to cluster WITHOUT dragging (build -200) ────────────────────────
// Drag-and-drop was the only way to put a task in a cluster from the Tasks
// page, which is invisible on touch devices and easy to miss on desktop.
// This is one picker, reused by the ⬡ button on every task row (List and
// Clusters views), the task drawer, the bulk bar and the assistant.
//   openTaskClusterPicker(taskId, ev)   → one task
//   openTaskClusterPicker(null, ev)     → every bulk-selected task
function _setTaskCluster(t,clusterId){
  if(!t)return false;
  if(clusterId==null||clusterId===''){delete t.clusterId;return true;}
  const cl=(D.clusters||[]).find(c=>c.id===Number(clusterId));
  if(!cl)return false;
  t.clusterId=cl.id;
  return true;
}
function _luClusterPickerClose(){
  const p=document.getElementById('lu-cluster-pick');if(p)p.remove();
  document.removeEventListener('click',_luClusterPickerClose,true);
}
function openTaskClusterPicker(taskId,ev){
  if(ev){try{ev.stopPropagation();ev.preventDefault();}catch(_){}}
  _luClusterPickerClose();
  const ids=taskId!=null?[taskId]:Array.from(_bulkSelected||[]);
  if(!ids.length){toast('Select at least one task first');return;}
  const single=ids.length===1?D.tasks.find(x=>x.id===ids[0]):null;
  const cur=single?single.clusterId:null;
  const rows=(D.clusters||[]).map(cl=>`<div class="lu-cp-row${cur===cl.id?' on':''}" onclick="_clusterPickerApply(${_jsArg(ids)},${cl.id})"><span style="width:20px;text-align:center">${cl.icon||'📁'}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cl.name)}</span>${cur===cl.id?'<span style="color:var(--ac)">✓</span>':''}</div>`).join('');
  const html=`<div id="lu-cluster-pick" style="position:fixed;z-index:var(--z-dropdown,600);min-width:220px;max-width:300px;background:var(--s2);border:1px solid var(--bd2);border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.35);padding:6px;font-size:12px" onclick="event.stopPropagation()">
    <div style="font-size:10.5px;color:var(--t3);padding:4px 8px 6px;text-transform:uppercase;letter-spacing:.04em">${ids.length===1?'Move to cluster':'Move '+ids.length+' tasks to cluster'}</div>
    <div style="max-height:260px;overflow-y:auto">${rows||'<div style="padding:6px 8px;color:var(--t3)">No clusters yet</div>'}</div>
    <div style="border-top:1px solid var(--bd1);margin-top:4px;padding-top:4px">
      <div class="lu-cp-row${cur==null&&single?' on':''}" onclick="_clusterPickerApply(${_jsArg(ids)},null)"><span style="width:20px;text-align:center">🗂</span><span style="flex:1">No cluster</span></div>
      <div class="lu-cp-row" style="color:var(--ac)" onclick="_luClusterPickerClose();openClusterModal(null,{preselectTaskIds:${_jsArg(ids)}})"><span style="width:20px;text-align:center">＋</span><span style="flex:1">New cluster…</span></div>
    </div>
  </div>`;
  if(!document.getElementById('lu-cluster-pick-css')){
    const s=document.createElement('style');s.id='lu-cluster-pick-css';
    s.textContent='.lu-cp-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;color:var(--t1)}.lu-cp-row:hover{background:color-mix(in srgb,var(--ac) 14%,var(--s2))}.lu-cp-row.on{background:color-mix(in srgb,var(--ac) 10%,var(--s2))}';
    document.head.appendChild(s);
  }
  document.body.insertAdjacentHTML('beforeend',html);
  const p=document.getElementById('lu-cluster-pick');
  // Anchor to the click; keep inside the viewport.
  let x=(ev&&ev.clientX)||window.innerWidth/2,y=(ev&&ev.clientY)||window.innerHeight/2;
  const w=p.offsetWidth||240,h=p.offsetHeight||200;
  if(x+w>window.innerWidth-8)x=Math.max(8,window.innerWidth-w-8);
  if(y+h>window.innerHeight-8)y=Math.max(8,y-h);
  p.style.left=x+'px';p.style.top=y+'px';
  setTimeout(()=>document.addEventListener('click',_luClusterPickerClose,true),0);
}
function _clusterPickerApply(ids,clusterId){
  _luClusterPickerClose();
  let n=0;
  (ids||[]).forEach(id=>{const t=D.tasks.find(x=>x.id===id);if(_setTaskCluster(t,clusterId))n++;});
  if(!n)return;
  save('tasks');
  if(_bulkSelected&&ids.length>1){_bulkSelected.clear();}
  try{renderCurrentTaskView();}catch(_){try{renderTaskClusters();}catch(__){}}
  // Refresh an open drawer's Cluster select so it does not show a stale value.
  try{const sel=document.getElementById('dr-cluster');if(sel&&ids.length===1)sel.value=clusterId==null?'':String(clusterId);}catch(_){}
  const cl=clusterId!=null?(D.clusters||[]).find(c=>c.id===Number(clusterId)):null;
  toast(cl?`⬡ ${n} task${n===1?'':'s'} → ${cl.name}`:`Removed ${n} task${n===1?'':'s'} from cluster`);
}
function _clusterOptionsHtml(selectedId){
  return `<option value="">None</option>${(D.clusters||[]).map(c=>`<option value="${c.id}" ${Number(selectedId)===c.id?'selected':''}>${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('')}`;
}
function renderTaskClusters(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  // Apply scope (My Items / All Items) to the entire universe of tasks first.
  // When Personal source filter is off, the native cluster cards collapse to
  // empty groups (the external pseudo-clusters still show below per their
  // own filter).
  // Top-level tasks PLUS any nested subtask that was filed into a cluster
  // directly. The cluster dialog lists subtasks too, so dropping them here
  // made "I ticked the Boat tasks and they don't show" — they were saved,
  // just never rendered. Subtasks without their own clusterId stay hidden
  // (they live under their parent).
  const scoped=_taskMyOnly?D.tasks.filter(t=>!t.createdBy||t.createdBy===(D.creds.userName||'Idris Grant')):D.tasks;
  const universe=_sourceOn('personal')?scoped.filter(t=>!_isSubtaskRow(t)||t.clusterId!=null):[];
  // Apply tab filter (All Active, Today, This Week, Inbox, Recurring, Someday, Done) and priority filter.
  let visible=typeof _taskFilter==='function'?universe.filter(_taskFilter):universe.filter(t=>t.status!=='Done'&&t.status!=='Someday');
  visible=_applyPriorityFilter(visible);
  const today=_todayStr;
  const groups=(D.clusters||[]).map(cl=>{
    const projIds=new Set(cl.projectIds||[]);
    // String compare: ids arrive as numbers from the dialog and drag path, but
    // a cluster created elsewhere could carry a string id — never let the
    // type decide whether a task shows.
    const inCluster=t=>String(t.clusterId)===String(cl.id)||(t.projectId&&projIds.has(t.projectId));
    // Progress uses the full universe (not narrowed by the tab filter) so "X of Y" stays meaningful.
    const all=universe.filter(inCluster);
    const total=all.length;
    const done=all.filter(t=>t.status==='Done').length;
    const pct=total?Math.round((done/total)*100):0;
    // Body shows the filtered set.
    const shown=visible.filter(inCluster);
    // Tasks that ARE in the cluster but the active tab / priority filter hides —
    // surfaced in the empty state so a filter never reads as "not assigned".
    const hiddenByFilter=all.filter(t=>t.status!=='Done').length-shown.filter(t=>t.status!=='Done').length;
    const overdue=shown.filter(t=>t.due&&t.due<today&&t.status!=='Done').length;
    const dueDates=shown.filter(t=>t.status!=='Done').map(t=>t.due).filter(Boolean).sort();
    return {cl,shown,done,total,pct,overdue,hiddenByFilter:Math.max(0,hiddenByFilter),earliestDue:dueDates[0]||null};
  });
  const claimedIds=new Set();
  groups.forEach(g=>g.shown.forEach(t=>claimedIds.add(t.id)));
  const orphans=visible.filter(t=>!claimedIds.has(t.id));

  // ── Lens ribbon: Cluster is the active grouping. The other lenses
  //   (status / energy etc.) are reachable via the view switcher's List
  //   group-by control or the existing tabs, so we don't render dead pills.
  const pillBar=`<div style="display:flex;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--bd1);margin-bottom:14px;align-items:center">
    <div style="font-size:11px;color:var(--t1);background:rgba(59,130,246,0.15);padding:5px 10px;border-radius:6px;display:flex;align-items:center;gap:6px;white-space:nowrap">
      <span style="color:#60A5FA;font-size:12px;line-height:1">⬡</span>Grouped by Cluster
    </div>
    <button class="btn btn-p" style="height:26px;font-size:11px;white-space:nowrap" title="Create a cluster (group) for tasks" onclick="openClusterModal(null)">＋ New Cluster</button>
    <span style="font-size:11px;color:var(--t3)">Need a different lens? Switch to <a style="color:var(--ac);cursor:pointer;text-decoration:underline" onclick="setTaskView('list')">List view</a> and use Group: Project / Due / Status / Assignee.</span>
  </div>`;

  function taskRow(t){
    const isOverdue=t.due&&t.due<today&&t.status!=='Done';
    const done=t.status==='Done';
    const pri=t.priority||'Medium';
    const priColors={
      'High':{bg:'rgba(239,68,68,0.15)',fg:'#F87171'},
      'Medium':{bg:'rgba(245,158,11,0.15)',fg:'#FBBF24'},
      'Low':{bg:'rgba(148,163,184,0.15)',fg:'var(--t2)'}
    };
    const pc=priColors[pri]||priColors['Medium'];
    const priShort=pri==='Medium'?'Med':pri;
    const dueLabel=_relDue(t.due);
    // #5 fix — make rows draggable so users can drop them onto another cluster card
    // Bulk-mode aware: when bulk select is on, the checkbox + row click toggle
    // selection instead of marking the task Done / opening the drawer.
    const isBulkChecked=_bulkSelected&&_bulkSelected.has(t.id);
    const checkboxHtml=_bulkMode
      ?`<div class="chk ${isBulkChecked?'on':''}" style="width:14px;height:14px;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();toggleBulkSelect(${_tidLit(t.id)},event)"></div>`
      :`<input type="checkbox" ${done?'checked':''} style="width:14px;height:14px;flex-shrink:0;cursor:pointer;accent-color:var(--ac)" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)});setTimeout(renderTaskClusters,100)">`;
    const rowClick=_bulkMode?`toggleBulkSelect(${_tidLit(t.id)},event)`:`openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))`;
    const bulkBg=isBulkChecked?'background:var(--acs);':'';
    return `<div class="cl-task-row" data-task-id="${t.id}" draggable="${_bulkMode?'false':'true'}" ${_bulkMode?'':`ondragstart="_clusterTaskDragStart(event,${_tidLit(t.id)})" ondragend="_clusterTaskDragEnd(event)"`} style="display:flex;align-items:center;gap:12px;padding:10px 14px 10px 56px;border-top:1px solid var(--bd1);cursor:pointer;position:relative;${bulkBg}${isBulkChecked?'border-left:3px solid var(--ac);padding-left:53px':''}" onclick="${rowClick}">
      ${_bulkMode?'':`<span class="cl-task-grip" style="position:absolute;left:32px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--t3);cursor:grab;user-select:none;opacity:.6" title="Drag to another cluster">⋮⋮</span>`}
      ${checkboxHtml}
      <span style="flex:1;font-size:12px;font-weight:500;${done?'text-decoration:line-through;color:var(--t3)':(t.titleColor?`color:${t.titleColor};font-weight:700`:'color:var(--t1)')};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}${(()=>{if(!_isSubtaskRow(t))return '';const p=D.tasks.find(x=>String(x.id)===String(t.parentTaskId));return `<span style="font-size:10px;color:var(--t3);font-weight:400;margin-left:6px" title="A subtask filed into this cluster directly">↳ ${esc(p?p.title:'subtask')}</span>`;})()}</span>
      ${_bulkMode?'':`<button class="btn btn-s" style="height:20px;font-size:11px;padding:0 6px;flex-shrink:0" title="Move to another cluster" onclick="openTaskClusterPicker(${_tidLit(t.id)},event)">⬡</button>`}
      <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${pc.bg};color:${pc.fg};font-weight:600;flex-shrink:0">${priShort}</span>
      ${(()=>{const ci=t.createdAt||(typeof t.id==='number'&&t.id>1e9?_pd(t.id).toISOString():'');return ci?`<span style="font-size:11px;color:var(--t3);min-width:70px;text-align:right;flex-shrink:0" title="Created ${esc(ci)}">🕒 ${fmtDate(ci.slice(0,10))}</span>`:'';})()}
      <span style="font-size:11px;${isOverdue?'color:var(--red);font-weight:600':'color:var(--t3)'};min-width:64px;text-align:right;flex-shrink:0">${dueLabel}</span>
    </div>`;
  }

  function clusterCard(g){
    const {cl,shown,done,total,pct,overdue,earliestDue,hiddenByFilter}=g;
    const activeTab=(()=>{try{const el=document.querySelector('#tasks-tabs > .tab.on');return el?el.textContent.trim():'';}catch(_){return '';}})();
    const emptyMsg=hiddenByFilter>0
      ?`${hiddenByFilter} task${hiddenByFilter===1?' is':'s are'} in this cluster but hidden by the <b>${esc(activeTab||'current')}</b> tab${_taskMyOnly?' / My Items scope':''} · switch to <a style="color:var(--ac);cursor:pointer;text-decoration:underline" onclick="event.stopPropagation();setTaskTabIdx(0)">All Active</a> to see them`
      :'No tasks yet · use ⬡ on any task, or ⋯ to manage';
    const collapsed=!!_clusterCollapsed[cl.id];
    const ownerInitials=(cl.owner||'?').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
    const accent=cl.color||'#3B82F6';
    let subtitle=`${done} of ${total} task${total!==1?'s':''}`;
    if(total===0)subtitle+=' · empty';
    else if(pct===100)subtitle+=' · all done';
    else if(earliestDue)subtitle+=` · due ${fmtDate(earliestDue)}`;
    else subtitle+=' · no deadlines';
    if(overdue>0)subtitle+=` · <span style="color:var(--red);font-weight:600">${overdue} overdue</span>`;
    const progressColor=pct===100?'#22c55e':accent;
    const progressTextColor=pct===100?'#22c55e':'var(--t3)';
    // #6 fix — left accent stripe + drop target for #5 drag-to-reassign
    return `<div class="cl-card" data-cluster-id="${cl.id}" style="background:var(--s2);border:1px solid var(--bd1);border-left:4px solid ${accent};border-radius:10px;margin-bottom:10px;overflow:hidden;transition:box-shadow .12s,background .12s" ondragover="_clusterDragOver(event,${cl.id})" ondragleave="_clusterDragLeave(event)" ondrop="_clusterDrop(event,${cl.id})">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;user-select:none" onclick="_clusterCollapsed['${_jsAttr(cl.id)}']=!_clusterCollapsed['${_jsAttr(cl.id)}'];renderTaskClusters()">
        <span style="font-size:14px;color:var(--t2);transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg);width:14px;text-align:center;flex-shrink:0">▾</span>
        <div style="width:28px;height:28px;border-radius:6px;background:${accent}22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${cl.icon||'📁'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cl.name)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitle}</div>
        </div>
        <div title="${esc(cl.owner||'')}" style="width:24px;height:24px;border-radius:50%;background:${accent}33;color:${accent};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${ownerInitials}</div>
        <div style="width:120px;flex-shrink:0">
          <div style="height:4px;background:var(--s3);border-radius:999px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${progressColor};border-radius:999px;transition:width .3s"></div>
          </div>
          <div style="font-size:11px;color:${progressTextColor};text-align:right;margin-top:3px">${pct}%</div>
        </div>
        <button title="Edit cluster" style="height:24px;width:24px;padding:0;font-size:14px;background:transparent;border:none;color:var(--t3);cursor:pointer;flex-shrink:0;border-radius:4px" onclick="event.stopPropagation();openClusterModal(${cl.id})">⋯</button>
      </div>
      ${collapsed?'':`<div>${shown.length?shown.map(taskRow).join(''):`<div style="padding:12px 14px 12px 56px;font-size:11px;color:var(--t3);border-top:1px solid var(--bd1)">${emptyMsg}</div>`}</div>`}
    </div>`;
  }

  // Orphan section
  const orphanCollapsed=!!_clusterCollapsed['__orphan__'];
  const orphanCard=orphans.length?`<div class="cl-card" data-cluster-id="__orphan__" style="background:var(--s2);border:1px solid var(--bd1);border-left:4px solid var(--t3);border-radius:10px;margin-bottom:10px;overflow:hidden;transition:box-shadow .12s,background .12s" ondragover="_clusterDragOver(event,'__orphan__')" ondragleave="_clusterDragLeave(event)" ondrop="_clusterDrop(event,'__orphan__')">
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer" onclick="_clusterCollapsed['__orphan__']=!_clusterCollapsed['__orphan__'];renderTaskClusters()">
      <span style="font-size:14px;color:var(--t2);transition:transform .2s;display:inline-block;transform:rotate(${orphanCollapsed?'-90':'0'}deg);width:14px;text-align:center;flex-shrink:0">▾</span>
      <div style="width:28px;height:28px;border-radius:6px;background:rgba(148,163,184,0.15);color:var(--t3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🗂</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--t1)">No cluster</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${orphans.length} task${orphans.length!==1?'s':''} · drag onto a cluster to organise</div>
      </div>
    </div>
    ${orphanCollapsed?'':`<div>${orphans.map(taskRow).join('')}</div>`}
  </div>`:'';

  const newClusterBtn=`<div style="text-align:center;padding:8px"><button class="btn btn-s" style="font-size:11px" onclick="openClusterModal(null)">+ New Cluster</button></div>`;

  // External-task pseudo-clusters — one card per active source. Skipped under
  // "My Items" scope (external rows have no `createdBy` field to match).
  const extCards=(!_taskMyOnly)?_renderExternalClusterCards():'';

  // "No cluster" group floats to the TOP — it's the inbox / triage zone
  // for tasks not yet assigned to a cluster, so it should be the first
  // thing the user sees on the page.
  list.innerHTML=pillBar+orphanCard+extCards+groups.map(clusterCard).join('')+newClusterBtn;
}

// Build pseudo-cluster cards for each active external source (Smartsheet/Nifty).
// Same visual chrome as native clusters (collapse toggle, count badge) but
// rows are dotted-border + deep-link + read-only. Returns '' when no external
// tasks loaded — keeps the page clean for users without integrations.
function _renderExternalClusterCards(){
  const ext=Array.isArray(D.externalTasks)?D.externalTasks.filter(t=>!(t.override&&t.override.tombstoned)):[];
  if(!ext.length)return '';
  const today=_todayStr;
  const sources=[
    {key:'smartsheet',label:'CommunityForce · Smartsheet',accent:'#1f6feb',icon:'📊'},
    {key:'nifty',     label:'LSI Media · NiftyPM',       accent:'#9333ea',icon:'💜'},
  ];
  return sources.map(src=>{
    if(!_sourceOn(src.key))return '';
    const rows=ext.filter(t=>t.source===src.key);
    if(!rows.length)return '';
    const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    const open=rows.filter(t=>!isDone(t));
    const overdue=open.filter(t=>{const due=(t.override&&t.override.localDue)||t.due;return due&&due<today;}).length;
    const collapseKey='__ext__'+src.key;
    const collapsed=!!_clusterCollapsed[collapseKey];
    const total=rows.length;
    const doneN=total-open.length;
    let subtitle=`${doneN} of ${total} task${total!==1?'s':''} · from source`;
    if(overdue>0)subtitle+=` · <span style="color:var(--red);font-weight:600">${overdue} overdue</span>`;
    const pct=total?Math.round((doneN/total)*100):0;
    // Build a depth map for Smartsheet sub-row hierarchy: walk up
    // parentExternalId chain to count ancestors in the open set. Indent
    // visually so sheet hierarchy mirrors the source's row indenting.
    const byExtId=new Map(open.map(t=>[String(t.externalId),t]));
    const depthOf=(t,seen)=>{
      const pid=t.parentExternalId;if(!pid)return 0;
      if(seen&&seen.has(String(pid)))return 0;
      const parent=byExtId.get(String(pid));if(!parent)return 0;
      const s=seen||new Set();s.add(String(t.externalId));
      return 1+depthOf(parent,s);
    };
    // Sort by Smartsheet rowNumber so parents appear before children.
    const sorted=open.slice().sort((a,b)=>{
      let ra=0,rb=0;
      try{ra=(JSON.parse(a.raw||'{}').rowNumber)||0;}catch{}
      try{rb=(JSON.parse(b.raw||'{}').rowNumber)||0;}catch{}
      return ra-rb;
    });
    const taskRows=sorted.slice(0,40).map(t=>{
      const due=(t.override&&t.override.localDue)||t.due;
      const overdueRow=due&&due<today;
      const myDay=t.override&&t.override.myDay;
      const url=t.externalUrl||'#';
      const dueLabel=due?_relDue(due):'';
      const depth=Math.min(depthOf(t,null),4);
      const indent=56+depth*16;
      const hierBadge=depth>0?`<span title="Subtask depth ${depth}" style="font-size:11px;color:var(--t3);margin-right:2px">↳</span>`:'';
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px 10px ${indent}px;border-top:1px solid var(--bd1);background:rgba(${src.key==='smartsheet'?'31,111,235':'147,51,234'},${(0.04+depth*0.02).toFixed(2)})">
        ${hierBadge}<span style="flex:0 0 auto">${_extSourceBadge(t.source)}</span>
        <a ${_extOpenAttrs(url)} title="Open in ${src.key==='smartsheet'?'Smartsheet':'NiftyPM'}" style="flex:1;font-size:12px;font-weight:${depth?400:500};color:var(--t1);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</a>
        ${_extAnnotationChips(t.override)}
        ${t.status?`<span style="font-size:11px;padding:2px 6px;border-radius:3px;background:var(--s3);color:var(--t2);font-weight:600;flex-shrink:0;cursor:pointer" title="Click to change status in source" onclick="_externalSetStatus('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',event)">${esc(t.status)}</span>`:`<button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px;flex-shrink:0" title="Set status…" onclick="_externalSetStatus('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',event)">⚙ Status</button>`}
        <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px;flex-shrink:0" title="Snooze…" onclick="_externalSnoozeMenu('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',event)">⏰</button>
        <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px;flex-shrink:0" title="Annotate" onclick="_openExternalAnnotateModal('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}')">✎</button>
        <button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px;flex-shrink:0" title="${myDay?'Remove from My Day':'Add to My Day'}" onclick="_toggleExternalMyDay('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',${myDay?0:1})">${myDay?'☀':'+☀'}</button>
        <span style="font-size:11px;${overdueRow?'color:var(--red);font-weight:600':'color:var(--t3)'};min-width:64px;text-align:right;flex-shrink:0">${dueLabel}</span>
      </div>`;
    }).join('');
    const tooMany=open.length>40?`<div style="padding:8px 14px 8px 56px;font-size:11px;color:var(--t3);border-top:1px solid var(--bd1);font-style:italic">… and ${open.length-40} more. Open the source to see all.</div>`:'';
    return `<div class="cl-card" style="background:var(--s2);border:1px solid var(--bd1);border-left:4px solid ${src.accent};border-radius:10px;margin-bottom:10px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;user-select:none" onclick="_clusterCollapsed['${_jsAttr(collapseKey)}']=!_clusterCollapsed['${_jsAttr(collapseKey)}'];renderTaskClusters()">
        <span style="font-size:14px;color:var(--t2);transition:transform .2s;display:inline-block;transform:rotate(${collapsed?'-90':'0'}deg);width:14px;text-align:center;flex-shrink:0">▾</span>
        <div style="width:28px;height:28px;border-radius:6px;background:${src.accent}22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${src.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--t1)">${esc(src.label)}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${subtitle}</div>
        </div>
        <div style="width:120px;flex-shrink:0">
          <div style="height:4px;background:var(--s3);border-radius:999px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${src.accent};border-radius:999px;transition:width .3s"></div>
          </div>
          <div style="font-size:11px;color:var(--t3);text-align:right;margin-top:3px">${pct}%</div>
        </div>
        <button title="Refresh from source" style="height:24px;width:24px;padding:0;font-size:12px;background:transparent;border:none;color:var(--t3);cursor:pointer;flex-shrink:0;border-radius:4px" onclick="event.stopPropagation();refreshExternalTasksNow()">↻</button>
      </div>
      ${collapsed?'':`<div>${taskRows}${tooMany}</div>`}
    </div>`;
  }).join('');
}
// ─── Cluster Modal (create/edit) ─────────────────────────────────────────────
function openClusterModal(id,opts){
  opts=opts||{};
  // preselectTaskIds: the picker's "New cluster…" hands over the task(s) the
  // user was trying to file, so a brand-new cluster starts with them ticked.
  const preselect=new Set((opts.preselectTaskIds||[]).map(Number));
  const cl=id?D.clusters.find(x=>x.id===id):null;
  const allProjects=D.projects||[];
  const selProjs=cl?new Set(cl.projectIds||[]):new Set();
  const projOptions=allProjects.map(p=>`<label style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;cursor:pointer"><input type="checkbox" value="${p.id}" ${selProjs.has(p.id)?'checked':''} class="cl-proj-cb"> ${esc(p.name)}</label>`).join('');
  // #4 — also let users attach individual tasks directly via t.clusterId
  // Parents first, each followed by its nested subtasks (indented, "↳"), and
  // every subtask names its parent: "↳ Back Hatch Strap · Boat Cleaning".
  // A subtask whose parent is not in this list (the parent is Done, or was
  // deleted) goes under a greyed, untickable heading for that parent at the
  // end. Before -207 such subtasks were appended with the same indent and no
  // parent name, so they read as subtasks of whichever task happened to be
  // last (user report: the boat subtasks under "Setup online payment…").
  const openTasks=(D.tasks||[]).filter(t=>t.status!=='Done');
  const taskById={};(D.tasks||[]).forEach(t=>{taskById[String(t.id)]=t;});
  const openIds=new Set(openTasks.map(t=>String(t.id)));
  const byParent={};openTasks.filter(_isSubtaskRow).forEach(s=>{const k=String(s.parentTaskId);(byParent[k]=byParent[k]||[]).push(s);});
  const allTasks=[];openTasks.filter(t=>!_isSubtaskRow(t)).forEach(p=>{allTasks.push(p);(byParent[String(p.id)]||[]).forEach(s=>allTasks.push(s));});
  const orphanParents=Object.keys(byParent).filter(k=>!openIds.has(k)); // parent Done or gone
  const parentNameOf=t=>{const p=taskById[String(t.parentTaskId)];return p?p.title:'a deleted task';};
  const taskRow=t=>{
    const checked=(cl&&String(t.clusterId)===String(cl.id))||preselect.has(t.id);
    const projOwned=t.projectId&&selProjs.has(t.projectId);
    const sub=_isSubtaskRow(t);
    const parentName=sub?parentNameOf(t):'';
    const tip=projOwned?'Already in this cluster via its project':(sub?`A subtask of “${esc(parentName)}” — shows in the cluster with a ↳ marker`:'');
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 0 3px ${sub?'18px':'0'};font-size:11px;cursor:pointer;${projOwned?'opacity:.55':''}" title="${tip}"><input type="checkbox" value="${t.id}" ${checked?'checked':''} class="cl-task-cb" ${projOwned?'disabled':''}> ${sub?'<span style="color:var(--t3)">↳</span> ':''}${esc(t.title)}${sub?` <span class="cl-task-parent" style="color:var(--t3)">· ${esc(parentName)}</span>`:''}${projOwned?' <span style="font-size:11px;color:var(--t3)">(via project)</span>':''}</label>`;
  };
  // The heading for subtasks whose parent is not listed: a label, not a checkbox.
  const orphanHead=k=>{const p=taskById[k];return `<div class="cl-orphan-head" style="padding:7px 0 2px;font-size:11px;color:var(--t3);font-style:italic;user-select:none" title="This task is not in the list above, so its open subtasks are shown here">${p?`${esc(p.title)} (done)`:'A deleted task'}</div>`;};
  const taskOptions=allTasks.map(taskRow).join('')+orphanParents.map(k=>orphanHead(k)+byParent[k].map(taskRow).join('')).join('');
  const html=`<div style="padding:16px;max-width:540px">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">${cl?'Edit':'New'} Cluster</h3>
    <div class="field-row">
      <div class="field" style="flex:1"><label>Name</label><input id="cl-name" class="inp" value="${esc(cl?.name||'')}" placeholder="Cluster name"></div>
      <div class="field"><label>Icon</label>${_iconPickBtn('cl-icon',cl?.icon||'📁','Pick…')}</div>
      <div class="field"><label>Color</label><input id="cl-color" type="color" value="${cl?.color||'#3B82F6'}" style="width:60px;height:32px;padding:2px;border:1px solid var(--bd2);border-radius:6px"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="field"><label>Projects <span style="font-size:11px;color:var(--t3);font-weight:400">all their tasks join automatically</span></label>
        <div style="max-height:200px;overflow-y:auto;border:1px solid var(--bd2);border-radius:5px;padding:6px">${projOptions||'<span style="font-size:11px;color:var(--t3)">No projects yet</span>'}</div>
      </div>
      <div class="field"><label>Individual tasks <span style="font-size:11px;color:var(--t3);font-weight:400">attach single tasks not in any picked project</span></label>
        <div style="max-height:200px;overflow-y:auto;border:1px solid var(--bd2);border-radius:5px;padding:6px">${taskOptions||'<span style="font-size:11px;color:var(--t3)">No active tasks</span>'}</div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn btn-p" style="flex:1" onclick="saveCluster(${id||'null'})">Save</button>
      ${cl?`<button class="btn btn-d" onclick="deleteCluster(${id})">Delete</button>`:''}
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
    </div>
  </div>`;
  const mc=document.getElementById('modal-content');
  if(mc)mc.innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
  setTimeout(()=>{const f=document.getElementById('cl-name');if(f)f.focus();},80);
}
function saveCluster(id){
  const name=document.getElementById('cl-name')?.value?.trim();
  if(!name)return;
  const icon=document.getElementById('cl-icon')?.value||'📁';
  const color=document.getElementById('cl-color')?.value||'#3B82F6';
  const projIds=Array.from(document.querySelectorAll('.cl-proj-cb:checked')).map(cb=>parseInt(cb.value));
  // #4 — read individual task selections
  const taskIds=Array.from(document.querySelectorAll('.cl-task-cb:checked')).map(cb=>parseInt(cb.value));
  let clusterId;
  if(id){
    const cl=D.clusters.find(x=>x.id===id);
    if(cl){cl.name=name;cl.icon=icon;cl.color=color;cl.projectIds=projIds;}
    clusterId=id;
  }else{
    clusterId=nextId(D.clusters);
    D.clusters.push({id:clusterId,name,icon,color,owner:D.creds.userName||'Me',collaborators:[],projectIds:projIds,pct:0,createdAt:_ymd(new Date())});
  }
  // Apply direct task assignments: a ticked task joins this cluster; a task
  // that was SHOWN in the dialog and left unticked leaves it. Tasks the dialog
  // did not list (it shows open tasks only) keep their cluster — renaming a
  // cluster used to strip every Done task from it and drop its %. Ids compare
  // as strings (server-promoted subtasks have string ids).
  const wantSet=new Set(Array.from(document.querySelectorAll('.cl-task-cb:checked')).map(cb=>String(cb.value)));
  const shown=new Set(Array.from(document.querySelectorAll('.cl-task-cb')).map(cb=>String(cb.value)));
  void taskIds;
  D.tasks.forEach(t=>{
    const k=String(t.id);
    if(wantSet.has(k))t.clusterId=clusterId;
    else if(shown.has(k)&&String(t.clusterId)===String(clusterId))delete t.clusterId;
  });
  save('clusters');save('tasks');
  closeModal();
  renderTaskClusters();
  toast({type:'success',title:`✓ Cluster saved`,msg:`${projIds.length} project${projIds.length===1?'':'s'} · ${taskIds.length} direct task${taskIds.length===1?'':'s'}`,duration:2500});
}
function deleteCluster(id){
  if(!confirm('Delete this cluster? Tasks will move to No Cluster.'))return;
  D.clusters=D.clusters.filter(x=>x.id!==id);
  D.tasks.forEach(t=>{if(t.clusterId===id)delete t.clusterId;});
  save('clusters');save('tasks');
  closeModal();
  renderTaskClusters();
}
function handleQuickAdd(e){
  if(e.key==='Enter'){e.preventDefault();quickAddTask();}
  // Alt+P cycles the priority filter. It was Tab, which trapped keyboard
  // users in the box (every press re-filtered instead of moving on).
  if(e.altKey&&(e.key==='p'||e.key==='P')){
    e.preventDefault();
    const pri=document.getElementById('task-priority-filter');
    if(!pri)return;
    const opts=['All','High','Medium','Low'];
    const cur=opts.indexOf(pri.value);
    pri.value=opts[(cur+1)%opts.length];
    _taskPriorityFilter=pri.value;_persistPageState('tasks',{priority:_taskPriorityFilter});
    renderCurrentTaskView();
  }
}
// Priority filter — global so it persists across re-renders.
if(typeof _taskPriorityFilter==='undefined')var _taskPriorityFilter=(_tasksRestored.priority)||'All';
function _applyPriorityFilter(tasks){
  let out=tasks;
  if(_taskPriorityFilter&&_taskPriorityFilter!=='All')out=out.filter(t=>t.priority===_taskPriorityFilter);
  // Project drill-through: matches the same column shown in Command Center
  // tiles. For native rows the project label is `t.project`, for external
  // rows it's `t.project` too (set during the inject in renderTaskList).
  // For native rows where `project` isn't denormalised, derive from
  // projectId so the filter still matches.
  if(_taskProjectFilter){
    out=out.filter(t=>{
      const label=t.project||((t.projectId&&(D.projects||[]).find(p=>p.id===t.projectId)||{}).name)||'';
      return label===_taskProjectFilter;
    });
  }
  if(_taskAssigneeFilter){
    out=out.filter(t=>{
      const a=t.assignedTo||t.assignee||'';
      // Treat both empty string and "(unassigned)" sentinel as a match for unassigned.
      if(_taskAssigneeFilter==='(unassigned)')return !a;
      return a===_taskAssigneeFilter;
    });
  }
  if(_taskKindFilter){
    const today=_todayStr;
    const stallCut=new Date(Date.now()-7*86400000).toISOString();
    if(_taskKindFilter==='overdue'){
      out=out.filter(t=>t.status!=='Done'&&t.due&&t.due<today);
    }else if(_taskKindFilter==='today'){
      out=out.filter(t=>t.due===today);
    }else if(_taskKindFilter==='stalled'){
      out=out.filter(t=>t.status!=='Done'&&(t.updatedAt||t.completedAt||t.createdAt||'')<stallCut&&t.due!==today&&!(t.due&&t.due<today));
    }else if(_taskKindFilter==='dateless'){
      // Tasks without start OR due date — the ones the Portfolio Timeline hides.
      out=out.filter(t=>t.status!=='Done'&&!t.due&&!t.startDate);
    }
  }
  return out;
}
function setTaskKindFilter(kind){
  _taskKindFilter=kind||null;
  if(typeof renderTasks==='function')renderTasks();
}
function clearTaskKindFilter(){setTaskKindFilter(null);}
// Drill into dateless tasks across all sources — used by the Portfolio
// Timeline "X hidden (no dates)" deep link. Source filter stays on all so
// the user can fix dates on every project's hidden rows in one place.
function _drillIntoDatelessTasks(){
  D.prefs=D.prefs||{};
  D.prefs.taskSourceFilter={personal:true,smartsheet:true,nifty:true};
  save('prefs');
  _taskFilterTabIdx=0;
  _taskFilter=t=>true;
  _taskMyOnly=false;
  _taskPriorityFilter='All';
  _taskProjectFilter=null;
  _taskAssigneeFilter=null;
  _taskKindFilter='dateless';
  nav('tasks');
}
// Drill from Command Center at-risk badges. Sets the kind + jumps to Tasks
// preserving the active source filter (hat scoping). Wired via inline onclick
// on the kindBadge spans.
function _ccDrillIntoKind(kind){
  const hat=_ccHat();
  D.prefs=D.prefs||{};
  if(hat==='cf')D.prefs.taskSourceFilter={personal:false,smartsheet:true,nifty:false};
  else if(hat==='lsi')D.prefs.taskSourceFilter={personal:false,smartsheet:false,nifty:true};
  else if(hat==='personal')D.prefs.taskSourceFilter={personal:true,smartsheet:false,nifty:false};
  else D.prefs.taskSourceFilter={personal:true,smartsheet:true,nifty:true};
  save('prefs');
  _taskFilterTabIdx=0;
  _taskFilter=t=>true;
  _taskMyOnly=false;
  _taskPriorityFilter='All';
  _taskProjectFilter=null;
  _taskAssigneeFilter=null;
  _taskKindFilter=kind;
  nav('tasks');
}
function setTaskProjectFilter(name){
  _taskProjectFilter=name||null;
  if(typeof renderTasks==='function')renderTasks();
}
function clearTaskProjectFilter(){setTaskProjectFilter(null);}
// Drill-through helper called from Command Center By-Project tiles.
// Sets the source filter to match the project's source so external-only
// tiles don't pollute the view, clears my-items / priority, jumps to All
// tab, and navigates to Tasks.
// Assignee drill — set _taskAssigneeFilter, keep sources as-is (assignee is
// orthogonal to source), jump to Tasks.
let _taskAssigneeFilter=null;
function _ccDrillIntoAssignee(name){
  _taskAssigneeFilter=name||null;
  _taskFilterTabIdx=0;
  _taskFilter=t=>true;
  _taskMyOnly=false;
  _taskPriorityFilter='All';
  _taskProjectFilter=null;
  nav('tasks');
}
function clearTaskAssigneeFilter(){_taskAssigneeFilter=null;if(typeof renderTasks==='function')renderTasks();}
function _ccDrillIntoProject(name, source){
  D.prefs=D.prefs||{};
  // Source filter: turn off the irrelevant sources for clarity.
  if(source==='smartsheet')D.prefs.taskSourceFilter={personal:false,smartsheet:true,nifty:false};
  else if(source==='nifty')D.prefs.taskSourceFilter={personal:false,smartsheet:false,nifty:true};
  else D.prefs.taskSourceFilter={personal:true,smartsheet:false,nifty:false};
  save('prefs');
  _taskFilterTabIdx=0; // All
  _taskFilter=t=>true;
  _taskMyOnly=false;
  _taskPriorityFilter='All';
  _taskProjectFilter=name||null;
  nav('tasks');
}
// ════════════════════════════════════════════════════════════════════════════
// TASKS RAIL WIDGETS — customizable right-pane widgets on the Tasks page
// ════════════════════════════════════════════════════════════════════════════
const _taskRailDefs=[
  {id:'quickStats',label:'📊 Quick Stats (4 tiles)',default:true},
  {id:'last7Days',label:'📈 Last 7 Days completion bars',default:true},
  {id:'statusDonut',label:'🍩 Status Breakdown (donut)',default:true},
  {id:'priorityBars',label:'⚡ Active by Priority (bars)',default:true},
  {id:'todaySchedule',label:'📅 Today\'s Schedule',default:true},
  {id:'topOverdue',label:'⚠ Top Overdue',default:true},
  {id:'todayHabits',label:'✓ Today\'s Habits',default:true},
  // New widget options
  {id:'goalsSnapshot',label:'🎯 Goals Snapshot',default:false},
  {id:'projectVelocity',label:'🚀 Project Velocity (this week)',default:false},
  {id:'topTags',label:'🏷 Top Tags (cloud)',default:false},
  {id:'recentActivity',label:'🕐 Recent Activity Feed',default:false},
  {id:'productivityScore',label:'📊 Productivity Score (today)',default:false},
  {id:'reportsLink',label:'📊 Open full Reports button',default:true}
];
function getTaskRailPrefs(){return _wsPrefsList('tasks',_taskRailDefs);}
function saveTaskRailPrefs(p){_wsPrefsSave('tasks',_taskRailDefs,p);}
function taskRailToggle(id,visible){const p=getTaskRailPrefs();const it=p.find(x=>x.id===id);if(it){it.visible=visible;saveTaskRailPrefs(p);renderTasks();}}
function taskRailMove(id,dir){const p=getTaskRailPrefs().sort((a,b)=>a.order-b.order);const idx=p.findIndex(x=>x.id===id);if(idx<0)return;const ni=idx+dir;if(ni<0||ni>=p.length)return;[p[idx].order,p[ni].order]=[p[ni].order,p[idx].order];saveTaskRailPrefs(p);renderTasks();setTimeout(openTaskRailCustomize,80);}
function openTaskRailCustomize(){
  closeModal();
  const prefs=getTaskRailPrefs().sort((a,b)=>a.order-b.order);
  const html=`<div style="padding:18px;min-width:380px;max-width:500px">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:6px">⚙ Customize Tasks Sidebar</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:14px">Toggle visibility and reorder widgets. Saves automatically.</p>
    ${prefs.map(p=>{const def=_taskRailDefs.find(d=>d.id===p.id);return def?`<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px;margin-bottom:4px">
      <div style="display:flex;flex-direction:column;gap:1px">
        <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="taskRailMove('${_jsAttr(p.id)}',-1)">↑</button>
        <button class="btn btn-s" style="height:16px;width:20px;padding:0;font-size:10px" onclick="taskRailMove('${_jsAttr(p.id)}',1)">↓</button>
      </div>
      <span style="flex:1;font-size:12px">${def.label}</span>
      <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px">
        <input type="checkbox" ${p.visible?'checked':''} onchange="taskRailToggle('${_jsAttr(p.id)}',this.checked)">Show
      </label>
    </div>`:'';}).join('')}
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-s" onclick="closeModal()">Done</button></div>
  </div>`;
  const mc=document.getElementById('modal-content');if(mc)mc.innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
}

function renderTaskRailHTML(){
  const today=new Date();
  const todayKey=_ymd(today);
  const evs=_calMeetingsOn(todayKey).sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const dateLabel=today.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  const allTasks=D.tasks||[];
  const doneToday=allTasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===todayKey).length;
  const myDay=allTasks.filter(t=>t.myDay&&t.status!=='Done').length;
  const overdue=allTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<todayKey).sort((a,b)=>(a.due||'').localeCompare(b.due||''));
  const focusMins=(D.prefs&&D.prefs.focusMinsToday)||0;

  const widgets={
    quickStats:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">
      <div style="background:var(--s2);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--bd1)"><div style="font-size:20px;font-weight:700;color:var(--ok)">${doneToday}</div><div style="font-size:11px;color:var(--t3)">Done today</div></div>
      <div style="background:var(--s2);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--bd1)"><div style="font-size:20px;font-weight:700;color:var(--ac)">${myDay}</div><div style="font-size:11px;color:var(--t3)">My Day</div></div>
      <div style="background:var(--s2);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--bd1)"><div style="font-size:20px;font-weight:700;color:${overdue.length>0?'var(--red)':'var(--t3)'}">${overdue.length}</div><div style="font-size:11px;color:var(--t3)">Overdue</div></div>
      <div style="background:var(--s2);border-radius:8px;padding:10px;text-align:center;border:1px solid var(--bd1)"><div style="font-size:20px;font-weight:700;color:var(--purp)">${focusMins}m</div><div style="font-size:11px;color:var(--t3)">Focus</div></div>
    </div>`,
    last7Days:(()=>{
      const days7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return d;});
      const dayLabels=['S','M','T','W','T','F','S'];
      const counts7=days7.map(d=>{const k=_ymd(d);return allTasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===k).length;});
      const max7=Math.max(...counts7,1);
      const total7=counts7.reduce((a,b)=>a+b,0);
      const bars=counts7.map((c,i)=>{const h=Math.round(c/max7*52)+2;const isToday=i===6;return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="width:100%;background:${isToday?'var(--ac)':'var(--s3)'};border-radius:3px 3px 0 0;height:${h}px;min-height:3px;position:relative" title="${c} done"><span style="position:absolute;top:-13px;left:0;right:0;text-align:center;font-size:11px;font-weight:600;color:${isToday?'var(--ac)':'var(--t3)'}">${c||''}</span></div><div style="font-size:11px;color:${isToday?'var(--ac)':'var(--t3)'};font-weight:${isToday?'600':'400'}">${dayLabels[days7[i].getDay()]}</div></div>`;}).join('');
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">📈 Last 7 Days</div><div style="font-size:11px;color:var(--t3);margin-bottom:14px">${total7} task${total7===1?'':'s'} completed</div><div style="display:flex;align-items:flex-end;gap:5px;height:64px">${bars}</div></div>`;
    })(),
    statusDonut:(()=>{
      const sCounts={Done:allTasks.filter(t=>t.status==='Done').length,'In Progress':allTasks.filter(t=>t.status==='In Progress').length,'Not Started':allTasks.filter(t=>t.status==='Not Started').length,Someday:allTasks.filter(t=>t.status==='Someday').length};
      const sTotal=Object.values(sCounts).reduce((a,b)=>a+b,0)||1;
      const sColors={'Done':'var(--ok)','In Progress':'var(--ac)','Not Started':'var(--t3)','Someday':'var(--warn)'};
      let acc=0;const stops=Object.entries(sCounts).map(([k,v])=>{const start=acc/sTotal*100;acc+=v;const end=acc/sTotal*100;return `${sColors[k]} ${start}% ${end}%`;}).join(',');
      const legend=Object.entries(sCounts).filter(([,v])=>v>0).map(([k,v])=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px"><span style="width:8px;height:8px;border-radius:2px;background:${sColors[k]};flex-shrink:0"></span><span style="color:var(--t2);flex:1">${k}</span><strong>${v}</strong></div>`).join('');
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">🍩 Status Breakdown</div>${sTotal>0?`<div style="display:flex;gap:10px;align-items:center"><div style="background:conic-gradient(${stops});width:80px;height:80px;border-radius:50%;flex-shrink:0"></div><div style="flex:1;display:flex;flex-direction:column;gap:3px">${legend}</div></div>`:'<div style="font-size:11px;color:var(--t3)">No tasks yet.</div>'}</div>`;
    })(),
    priorityBars:(()=>{
      const active=allTasks.filter(t=>t.status!=='Done'&&t.status!=='Someday');
      const pCounts={High:active.filter(t=>t.priority==='High').length,Medium:active.filter(t=>t.priority==='Medium').length,Low:active.filter(t=>t.priority==='Low').length};
      const pMax=Math.max(...Object.values(pCounts),1);
      const pColors={High:'var(--red)',Medium:'var(--warn)',Low:'var(--ok)'};
      const bars=Object.entries(pCounts).map(([k,v])=>`<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:2px"><span>${k}</span><strong style="color:${pColors[k]}">${v}</strong></div><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${v/pMax*100}%;background:${pColors[k]};border-radius:3px;transition:width .4s"></div></div></div>`).join('');
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">${_icon('zap',14,'currentColor')} Active by Priority</div>${active.length?bars:'<div style="font-size:11px;color:var(--t3)">No active tasks.</div>'}</div>`;
    })(),
    todaySchedule:(()=>{
      const body=evs.length?evs.slice(0,5).map(e=>{const t=e.start?_pd(e.start).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).replace(' ',''):'';return `<div style="display:flex;gap:6px;margin-bottom:4px"><span style="font-size:11px;color:var(--t3);width:46px;flex-shrink:0">${t}</span><div class="cal-ev" style="flex:1;font-size:11px">${esc(e.title||'(untitled)')}</div></div>`;}).join(''):'<div style="font-size:11px;color:var(--t3);padding:4px 0">No meetings today.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:2px">${_icon('calendar',14,'currentColor')} Today's Schedule</div><div style="font-size:11px;color:var(--t3);margin-bottom:8px">${dateLabel}</div>${body}</div>`;
    })(),
    topOverdue:(()=>{
      const body=overdue.length?overdue.slice(0,5).map(t=>`<div class="lr" style="padding:4px 0;cursor:pointer" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><span style="width:5px;height:5px;border-radius:50%;background:var(--red);flex-shrink:0"></span><span class="rt" style="font-size:11px">${esc(t.title)}</span><span style="font-size:11px;color:var(--red);flex-shrink:0">${fmtDate(t.due)}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:4px 0">Nothing overdue 🎉</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">⚠ Top Overdue</div>${body}</div>`;
    })(),
    todayHabits:(()=>{
      const habs=(D.habits||[]).filter(h=>h.cadence==='Daily').slice(0,6);
      const body=habs.length?habs.map(h=>`<div class="lr" style="padding:4px 0;cursor:pointer" onclick="toggleHabit(${h.id});setTimeout(()=>renderTasks(),200)"><div class="chk ${h.doneToday?'on':''}" style="width:13px;height:13px"></div><span class="rt" style="font-size:11px">${h.icon||'•'} ${esc(h.title)}</span>${h.streak?`<span style="font-size:11px;color:var(--warn);flex-shrink:0">🔥${h.streak}</span>`:''}</div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:4px 0">No daily habits yet.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">✓ Today's Habits</div>${body}</div>`;
    })(),
    goalsSnapshot:(()=>{
      const gs=(D.goals||[]).slice(0,5);
      const body=gs.length?gs.map(g=>{const pct=g.pct||0;const c=pct>=70?'var(--ok)':pct>=40?'var(--ac)':'var(--warn)';return `<div style="margin-bottom:6px;cursor:pointer" onclick="openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${g.icon||'🎯'} ${esc(g.title)}</span><strong style="color:${c}">${pct}%</strong></div><div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c}"></div></div></div>`;}).join(''):'<div style="font-size:11px;color:var(--t3)">No goals yet.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">${_icon('target',14,'currentColor')} Goals Snapshot</div>${body}</div>`;
    })(),
    projectVelocity:(()=>{
      const wkStart=new Date();wkStart.setDate(wkStart.getDate()-7);const wkKey=_ymd(wkStart);
      const byProj={};(D.projects||[]).forEach(p=>byProj[p.id]={name:p.name,count:0});
      allTasks.filter(t=>t.status==='Done'&&(t.completedAt||'')>=wkKey&&t.projectId).forEach(t=>{if(byProj[t.projectId])byProj[t.projectId].count++;});
      const arr=Object.values(byProj).filter(p=>p.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
      const max=Math.max(...arr.map(p=>p.count),1);
      const body=arr.length?arr.map(p=>`<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${esc(p.name)}</span><strong style="color:var(--ac)">${p.count}</strong></div><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${p.count/max*100}%;background:var(--ac)"></div></div></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">No completions this week.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:2px">🚀 Project Velocity</div><div style="font-size:11px;color:var(--t3);margin-bottom:8px">Tasks done by project · last 7 days</div>${body}</div>`;
    })(),
    topTags:(()=>{
      const freq={};allTasks.forEach(t=>(t.tags||[]).forEach(tag=>{freq[tag]=(freq[tag]||0)+1;}));
      const arr=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,15);
      const max=arr.length?arr[0][1]:1;const min=arr.length?arr[arr.length-1][1]:1;const range=Math.max(max-min,1);
      const body=arr.length?arr.map(([t,c])=>{const sz=Math.round(9+(c-min)/range*4);return `<span style="display:inline-block;padding:2px 7px;margin:2px 3px 2px 0;background:var(--s3);border-radius:10px;font-size:${sz}px;color:var(--ac);cursor:pointer" onclick="toast('Tag: ${_jsAttr(t)} (${c})')">#${esc(t)}</span>`;}).join(''):'<div style="font-size:11px;color:var(--t3)">No tags yet.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:6px">${_icon('tag',14,'currentColor')} Top Tags</div>${body}</div>`;
    })(),
    recentActivity:(()=>{
      const recent=[];
      allTasks.forEach(t=>{if(t.completedAt)recent.push({type:'✓',t:'Completed: '+t.title,when:t.completedAt});if(t.createdAt)recent.push({type:'+',t:'Created task: '+t.title,when:t.createdAt});});
      (D.notes||[]).forEach(n=>{if(n.createdAt)recent.push({type:'📝',t:'Note: '+n.title,when:n.createdAt});});
      (D.journal||[]).forEach(j=>{if(j.createdAt)recent.push({type:'📔',t:'Journal: '+(j.title||'(entry)'),when:j.createdAt});});
      recent.sort((a,b)=>(b.when||'').localeCompare(a.when||''));
      const top=recent.slice(0,8);
      const body=top.length?top.map(r=>`<div style="display:flex;gap:6px;align-items:flex-start;padding:3px 0;font-size:11px"><span style="flex-shrink:0">${r.type}</span><span style="flex:1;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.t)}</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">No activity yet.</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:6px">🕐 Recent Activity</div>${body}</div>`;
    })(),
    productivityScore:(()=>{
      const dailyHabits=(D.habits||[]).filter(h=>h.cadence==='Daily');
      const habsDone=dailyHabits.filter(h=>h.doneToday).length;
      const habsScore=dailyHabits.length?(habsDone/dailyHabits.length)*30:15;
      const tasksScore=Math.min(doneToday*8,40);
      const focusScore=Math.min(focusMins/2,20);
      const overduePenalty=Math.min(overdue.length*2,10);
      const score=Math.max(0,Math.min(100,Math.round(habsScore+tasksScore+focusScore-overduePenalty+10)));
      const grade=score>=90?{l:'A+',c:'var(--ok)'}:score>=80?{l:'A',c:'var(--ok)'}:score>=70?{l:'B',c:'var(--ac)'}:score>=60?{l:'C',c:'var(--warn)'}:{l:'D',c:'var(--red)'};
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:14px;margin-bottom:12px;text-align:center">
        <div style="font-size:11px;font-weight:600;margin-bottom:8px">${_icon('barChart',14,'#3b82f6')} Productivity Score</div>
        <div style="font-size:36px;font-weight:700;color:${grade.c};line-height:1">${score}</div>
        <div style="font-size:18px;color:${grade.c};font-weight:600;margin-bottom:8px">${grade.l}</div>
        <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${score}%;background:${grade.c};border-radius:4px;transition:width .6s"></div></div>
        <div style="font-size:11px;color:var(--t3);margin-top:8px">Tasks ${doneToday} · Habits ${habsDone}/${dailyHabits.length} · Focus ${focusMins}m</div>
      </div>`;
    })(),
    reportsLink:`<div style="text-align:center;margin-top:6px"><button class="btn btn-s" style="font-size:11px" onclick="nav('reports')">📊 Open full Reports →</button></div>`
  };
  const prefs=getTaskRailPrefs().sort((a,b)=>a.order-b.order);
  const visibleHTML=prefs.filter(p=>p.visible).map(p=>widgets[p.id]||'').join('');
  // External-tasks widget — always rendered when external tasks exist (not
  // governed by the customize-rail prefs system, so it shows up without any
  // per-user setup once Smartsheet/Nifty is wired in Settings).
  const externalWidget=_renderExternalTasksRailWidget();
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700">${_icon('barChart',14,'currentColor')} Insights</div>
    <button class="btn btn-s" style="font-size:11px;padding:0 8px;height:22px" onclick="openTaskRailCustomize()">⚙ Customize</button>
  </div>${externalWidget}${visibleHTML}`;
}

// External-tasks rail widget — surfaces today's + overdue rows from Smartsheet
// and NiftyPM with deep-links back to the source. Empty (returns '') when no
// external tasks are loaded so the rail isn't cluttered for users without
// integrations configured.
function _renderExternalTasksRailWidget(){
  const ext=Array.isArray(D.externalTasks)?D.externalTasks:[];
  if(!ext.length)return '';
  const today=_ymd(new Date());
  // Show: overdue + today + next 7 days, excluding tombstoned overrides.
  const horizon=new Date();horizon.setDate(horizon.getDate()+7);
  const horizonKey=_ymd(horizon);
  // Include: anything dated within the horizon, anything flagged My Day, and
  // any open item without a due date (common in outline-style sheets like CF's
  // 120-Day Plan — there's no "due", just a Phase). Sort by due (no-due last).
  const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const relevant=ext.filter(t=>{
    if(t.override&&t.override.tombstoned)return false;
    if(isDone(t))return false;
    if(!_sourceOn(t.source))return false;
    const due=(t.override&&t.override.localDue)||t.due;
    if(!due)return true;
    return due<=horizonKey;
  }).sort((a,b)=>{
    const ad=(a.override&&a.override.localDue)||a.due||'9999';
    const bd=(b.override&&b.override.localDue)||b.due||'9999';
    return ad.localeCompare(bd);
  });
  if(!relevant.length)return '';
  const rows=relevant.slice(0,12).map(t=>{
    const due=(t.override&&t.override.localDue)||t.due;
    const overdue=due&&due<today;
    const dueLabel=due?(due===today?'Today':(overdue?'Overdue · '+due:due)):'';
    const url=t.externalUrl||'#';
    const myDay=t.override&&t.override.myDay;
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd1);font-size:11px">
      ${_extSourceBadge(t.source)}
      <a ${_extOpenAttrs(url)} title="Open in ${t.source==='smartsheet'?'Smartsheet':'NiftyPM'}" style="flex:1;color:var(--t1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</a>
      ${_extAnnotationChips(t.override)}
      <span style="color:${overdue?'var(--red)':'var(--t3)'};white-space:nowrap;font-size:11px">${dueLabel}</span>
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" title="Set status in source" onclick="_externalSetStatus('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',event)">⚙</button>
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" title="Snooze…" onclick="_externalSnoozeMenu('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',event)">⏰</button>
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" title="Annotate" onclick="_openExternalAnnotateModal('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}')">✎</button>
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" title="${myDay?'Remove from My Day':'Add to My Day'}" onclick="_toggleExternalMyDay('${_jsAttr(t.source)}','${_jsAttr(t.externalId)}',${myDay?0:1})">${myDay?'☀':'+☀'}</button>
    </div>`;
  }).join('');
  const counts={
    smartsheet:relevant.filter(t=>t.source==='smartsheet').length,
    nifty:relevant.filter(t=>t.source==='nifty').length,
  };
  const summary=[counts.smartsheet?`${counts.smartsheet} CF`:'',counts.nifty?`${counts.nifty} LSI`:''].filter(Boolean).join(' · ');
  return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:11px;font-weight:600">🔗 External · Next 7 days</div>
      <div style="display:flex;gap:3px">
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="_extBulkMyDay(true)" title="Add visible items to My Day">+☀ All</button>
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="_extBulkMyDay(false)" title="Clear My Day flag on visible items">✕☀</button>
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="_extBulkStatusMenu(event)" title="Set status on visible items">⚙</button>
        <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="refreshExternalTasksNow()" title="Refresh from NiftyPM">↻</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:6px">${summary}${relevant.length>12?` · showing 12 of ${relevant.length}`:''}</div>
    ${rows}
  </div>`;
}

// Bulk status change for all visible rail items. Opens a popover with the
// union of valid status options across all watches in the visible set;
// applies to every visible task (uses queue mode if enabled, otherwise
// fires each push back-to-back). Same horizon filter as the rail.
function _extBulkStatusMenu(event){
  if(event){event.stopPropagation();event.preventDefault();}
  document.querySelectorAll('[data-ext-bulk-status-pop]').forEach(el=>el.remove());
  const btn=event&&event.currentTarget;if(!btn)return;
  const rect=btn.getBoundingClientRect();
  const pop=document.createElement('div');
  pop.setAttribute('data-ext-bulk-status-pop','1');
  pop.style.cssText=`position:fixed;left:${Math.min(rect.left,window.innerWidth-260)}px;top:${rect.bottom+4}px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:6px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3);min-width:240px`;
  pop.innerHTML='<div style="font-size:11px;color:var(--t3);padding:2px 6px 6px">Loading…</div>';
  document.body.appendChild(pop);
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
  (async()=>{
    // Find visible items + which watches they belong to.
    const ext=Array.isArray(D.externalTasks)?D.externalTasks:[];
    const today=_ymd(new Date());
    const horizon=new Date();horizon.setDate(horizon.getDate()+7);
    const horizonKey=_ymd(horizon);
    const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    const visible=ext.filter(t=>{
      if(t.override&&t.override.tombstoned)return false;
      if(isDone(t))return false;
      const due=(t.override&&t.override.localDue)||t.due;
      if(!due)return true;
      return due<=horizonKey;
    });
    if(!visible.length){pop.innerHTML='<div style="padding:6px;font-size:11px;color:var(--t3)">Nothing visible to act on.</div>';return;}
    // Collect unique watch IDs grouped by source.
    const ssWatchIds=Array.from(new Set(visible.filter(t=>t.source==='smartsheet').map(t=>t.sourceConfigId)));
    const nfWatchIds=Array.from(new Set(visible.filter(t=>t.source==='nifty').map(t=>t.sourceConfigId)));
    // Fetch status options from each watch and INTERSECT to find common
    // values. If there's no intersection, fall back to UNION + show source
    // labels next to each option.
    const ssOpts=[];for(const id of ssWatchIds){try{const r=await _trpc('externalSources.smartsheetStatusOptions',{watchId:id},'query');ssOpts.push(r.options||[]);}catch{ssOpts.push([]);}}
    const nfOpts=[];for(const id of nfWatchIds){try{const r=await _trpc('externalSources.niftyStatusOptions',{watchId:id},'query');nfOpts.push(r.options||[]);}catch{nfOpts.push([]);}}
    const ssCommon=ssOpts.length?ssOpts.reduce((a,b)=>a.filter(v=>b.includes(v))):[];
    const nfCommon=nfOpts.length?nfOpts.reduce((a,b)=>a.filter(v=>b.includes(v))):[];
    // Build menu sections per source.
    const sections=[];
    if(ssCommon.length){sections.push(`<div style="font-size:11px;color:var(--t3);padding:6px 6px 2px;text-transform:uppercase;letter-spacing:.4px">CF · Set ${visible.filter(t=>t.source==='smartsheet').length} Smartsheet row${visible.filter(t=>t.source==='smartsheet').length===1?'':'s'} to:</div>`+ssCommon.map(v=>`<button class="btn btn-s" style="display:block;width:100%;text-align:left;height:24px;font-size:11px;padding:0 8px;background:transparent;border:none;cursor:pointer" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'" data-source="smartsheet" data-status="${esc(v)}">${esc(v)}</button>`).join(''));}
    if(nfCommon.length){sections.push(`<div style="font-size:11px;color:var(--t3);padding:6px 6px 2px;text-transform:uppercase;letter-spacing:.4px">LSI · Set ${visible.filter(t=>t.source==='nifty').length} Nifty task${visible.filter(t=>t.source==='nifty').length===1?'':'s'} to:</div>`+nfCommon.map(v=>`<button class="btn btn-s" style="display:block;width:100%;text-align:left;height:24px;font-size:11px;padding:0 8px;background:transparent;border:none;cursor:pointer" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'" data-source="nifty" data-status="${esc(v)}">${esc(v)}</button>`).join(''));}
    if(!sections.length){pop.innerHTML='<div style="padding:8px;font-size:11px;color:var(--warn)">No common status options found across the visible items\' source watches. Configure the statusColumn on each watch first.</div>';return;}
    pop.innerHTML=sections.join('');
    pop.querySelectorAll('button[data-status]').forEach(b=>{
      b.onclick=async(e)=>{
        e.stopPropagation();
        const src=b.getAttribute('data-source');
        const val=b.getAttribute('data-status');
        pop.remove();
        const targets=visible.filter(t=>t.source===src);
        if(!confirm(`Set ${targets.length} ${src==='smartsheet'?'Smartsheet':'Nifty'} row${targets.length===1?'':'s'} to "${val}"?\n\n(${_isQueueMode()?'Will queue — click Push in topbar to flush.':'Will push to source immediately.'})`))return;
        toast({type:'info',title:`${_isQueueMode()?'Queuing':'Pushing'} ${targets.length}…`,duration:1500});
        let ok=0,failed=0;
        for(const t of targets){
          try{
            if(_isQueueMode()){
              await _trpc('externalSources.upsertOverride',{source:src,externalId:t.externalId,pendingStatus:val},'mutation');
            }else{
              const proc=src==='smartsheet'?'externalSources.smartsheetSetRowStatus':'externalSources.niftySetTaskStatus';
              const payload=src==='smartsheet'?{externalId:t.externalId,status:val}:{externalId:t.externalId,statusName:val};
              await _trpc(proc,payload,'mutation');
            }
            ok++;
          }catch{failed++;}
        }
        await loadExternalTasks();
        await _refreshPendingCount();
        if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
        toast({type:failed?'warn':'success',title:_isQueueMode()?`Queued ${ok}${failed?` · ${failed} failed`:''}`:`Pushed ${ok}${failed?` · ${failed} failed`:''}`});
      };
    });
  })();
}

// Bulk My-Day flag for all external tasks currently in the rail window.
// "All" = set to true; "Clear" = set to false. Sequential mutations so we
// surface partial failures cleanly. Toast summarises the actual count changed.
async function _extBulkMyDay(setOn){
  const ext=Array.isArray(D.externalTasks)?D.externalTasks:[];
  if(!ext.length){toast({type:'info',title:'No external tasks loaded'});return;}
  // Same filter as the rail's "Next 7 days" view so the user's intent matches
  // what's visible.
  const today=_ymd(new Date());
  const horizon=new Date();horizon.setDate(horizon.getDate()+7);
  const horizonKey=_ymd(horizon);
  const isDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const targets=ext.filter(t=>{
    if(t.override&&t.override.tombstoned)return false;
    if(isDone(t))return false;
    const isFlagged=!!(t.override&&t.override.myDay);
    if(setOn&&isFlagged)return false; // nothing to do
    if(!setOn&&!isFlagged)return false;
    const due=(t.override&&t.override.localDue)||t.due;
    if(!due)return true;
    return due<=horizonKey;
  });
  if(!targets.length){toast({type:'info',title:setOn?'All visible already flagged':'No flags to clear in visible items'});return;}
  if(targets.length>5&&!confirm(`${setOn?'Add':'Clear'} My Day on ${targets.length} ${setOn?'tasks':'flagged tasks'}?`))return;
  toast({type:'info',title:`${setOn?'Adding':'Clearing'} ${targets.length}…`,duration:1500});
  let ok=0,failed=0;
  for(const t of targets){
    try{
      await _trpc('externalSources.upsertOverride',{source:t.source,externalId:t.externalId,myDay:setOn},'mutation');
      ok++;
    }catch{failed++;}
  }
  await loadExternalTasks();
  if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  toast({type:failed?'warn':'success',title:`${ok} updated${failed?` · ${failed} failed`:''}`});
}
// Daily command-center card — single-glance rollup of what's on the user's
// plate TODAY across CF (Smartsheet), LSI (Nifty), and personal (D.tasks).
// Lives on the Home rail; refresh button kicks the external-sources cron.
function _renderDailyCommandCenterCard(){
  const today=_ymd(new Date());
  const all=typeof _unifiedTasks==='function'?_unifiedTasks():D.tasks.map(t=>Object.assign({},t,{_source:'local'}));
  const isOpen=t=>(t.status||'Not Started')!=='Done';
  const dueByBucket=(src)=>{
    const items=all.filter(t=>t._source===src&&isOpen(t));
    const overdue=items.filter(t=>t.due&&t.due<today).length;
    const today_=items.filter(t=>t.due===today||t.myDay).length;
    return {overdue,today:today_,total:items.length};
  };
  const local=dueByBucket('local');
  const ss=dueByBucket('smartsheet');
  const nf=dueByBucket('nifty');
  const noExternal=(ss.total+nf.total)===0;
  // Headline metric is "total open items on my plate" (works for sheets without
  // a due column). Subtitle adds today/overdue context when present, else
  // shows total to make it explicit.
  const cell=(label,color,c)=>{
    const headline=c.today>0?c.today:c.total;
    const sub=c.overdue>0
      ?`<span style="color:var(--red)">${c.overdue} overdue</span>`
      :(c.today>0?`${c.total} open total`:(c.total>0?'no due dates':'on track'));
    return `<div style="background:var(--s3);border-radius:6px;padding:8px;text-align:center">
      <div style="font-size:11px;font-weight:600;color:${color};letter-spacing:.4px">${label}</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px">${headline}</div>
      <div style="font-size:11px;color:var(--t3)">${sub}</div>
    </div>`;
  };
  return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:12px;font-weight:600">${_icon('target',16,'currentColor')} Today's Command Center</span>
      <button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px" onclick="refreshExternalTasksNow()" title="Refresh CF + LSI">↻</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
      ${cell('PERSONAL','var(--ac)',local)}
      ${cell('CF',(noExternal?'var(--t3)':'#1f6feb'),ss)}
      ${cell('LSI',(noExternal?'var(--t3)':'#9333ea'),nf)}
    </div>
    ${noExternal?`<div style="font-size:11px;color:var(--t3);margin-top:8px;text-align:center">Connect NiftyPM in Settings → Integrations to pull CF/LSI tasks.</div>`:''}
    ${_renderDailyFocusAISection()}
  </div>`;
}

async function _toggleExternalMyDay(source,externalId,myDay){
  try{
    await _trpc('externalSources.upsertOverride',{source,externalId,myDay:!!myDay},'mutation');
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(e){
    toast({type:'warn',title:'My Day toggle failed',msg:e.message||String(e)});
  }
}

// Snooze an external task by writing a localDue override N days from today.
// Days=-1 (special) clears the snooze (removes localDue override; source due
// becomes effective again). Also clears the My Day flag if days>1 so a
// "snooze for a week" actually pushes the task off today's plate.
// Queue-mode helper. When D.prefs.externalQueueMode is true, status changes
// don't push immediately — they're saved as override.pendingStatus and a
// topbar "Push N pending" button shows up. User clicks Push to flush all.
function _isQueueMode(){ return !!(D.prefs && D.prefs.externalQueueMode); }

// Pending push state (cached count for the topbar button). Populated by
// _refreshPendingCount on app boot + after any queue/push action.
window._extPendingCount = 0;
async function _refreshPendingCount(){
  try{
    const r=await _trpc('externalSources.pendingPushCount',undefined,'query');
    window._extPendingCount=r&&typeof r.count==='number'?r.count:0;
  }catch{window._extPendingCount=0;}
  _topbarPushBtnUpdate();
}
function _topbarPushBtnUpdate(){
  const btn=document.getElementById('topbar-push-btn');
  if(!btn)return;
  const n=window._extPendingCount||0;
  if(n>0){
    btn.style.display='';
    const lbl=btn.querySelector('[data-pcount]');
    if(lbl)lbl.textContent=String(n);
    btn.title=`Push ${n} pending status change${n===1?'':'s'} to NiftyPM`;
  }else{
    btn.style.display='none';
  }
}
async function _pushPendingNow(){
  if(!(window._extPendingCount>0)){toast({type:'info',title:'No pending changes to push'});return;}
  if(!confirm(`Push ${window._extPendingCount} queued status change${window._extPendingCount===1?'':'s'} to NiftyPM?`))return;
  _topbarSyncSpin(true);
  try{
    toast({type:'info',title:'Pushing queued changes…',duration:2000});
    const r=await _trpc('externalSources.pushPendingChanges',undefined,'mutation');
    await loadExternalTasks();
    await _refreshPendingCount();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
    if(r.failed===0)toast({type:'success',title:`✓ Pushed ${r.pushed}`});
    else toast({type:'warn',title:`${r.pushed} pushed · ${r.failed} failed`,msg:(r.errors||[]).slice(0,2).join(' · '),duration:6000});
  }catch(e){toast({type:'warn',title:'Push failed',msg:e.message||String(e)});}
  finally{_topbarSyncSpin(false);}
}

// Pending pill — shows on rendered external task rows when a status change
// is queued. Yellow tint + arrow indicating direction.
function _extPendingPill(ov){
  if(!ov||!ov.pendingStatus)return '';
  const err=ov.pendingError;
  const color=err?'#dc2626':'#f59e0b';
  return `<span title="${err?'Push failed: '+esc(err).slice(0,200):'Queued — will push to source on next Push'}" style="font-size:11px;padding:1px 5px;border-radius:3px;background:${err?'rgba(220,38,38,.15)':'rgba(245,158,11,.18)'};color:${color};font-weight:600;cursor:help">${err?'⚠ ':''}→ ${esc(ov.pendingStatus)}</span>`;
}

// Write-back: change external task status in the source (Smartsheet/Nifty).
// Opens a popover with the source's valid status values (PICKLIST for
// Smartsheet, project-scoped status names for Nifty) so the user picks
// from real options. Successful PUT triggers a server-side re-pull so the
// new status reflects in LevelUp immediately.
async function _externalSetStatus(source,externalId,event){
  if(event){event.stopPropagation();event.preventDefault();}
  document.querySelectorAll('[data-ext-status-pop]').forEach(el=>el.remove());
  const btn=event&&event.currentTarget;if(!btn)return;
  const rect=btn.getBoundingClientRect();
  const pop=document.createElement('div');
  pop.setAttribute('data-ext-status-pop','1');
  pop.style.cssText=`position:fixed;left:${Math.min(rect.left,window.innerWidth-220)}px;top:${rect.bottom+4}px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:6px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3);min-width:200px`;
  pop.innerHTML='<div style="font-size:11px;color:var(--t3);padding:2px 6px 6px">Loading statuses…</div>';
  document.body.appendChild(pop);
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
  // Find which watch this task belongs to so we can fetch its allowed statuses.
  const et=(D.externalTasks||[]).find(t=>t.source===source&&t.externalId===externalId);
  if(!et){pop.innerHTML='<div style="color:var(--red);font-size:11px;padding:4px">Task not loaded locally — refresh first.</div>';return;}
  const watchId=et.sourceConfigId;
  try{
    const fetcher=source==='smartsheet'?'externalSources.smartsheetStatusOptions':'externalSources.niftyStatusOptions';
    const result=await _trpc(fetcher,{watchId},'query');
    const opts=Array.isArray(result.options)?result.options:[];
    if(!opts.length){
      pop.innerHTML=`<div style="color:var(--warn);font-size:11px;padding:4px">No status options${source==='smartsheet'?' — set the watch\'s statusColumn in Settings → Integrations':''}.</div>`;
      return;
    }
    const isDoneVal=v=>_isExtDone(v);
    pop.innerHTML=`<div style="font-size:11px;color:var(--t3);padding:2px 6px 4px;text-transform:uppercase;letter-spacing:.4px">Set ${source==='smartsheet'?'Smartsheet':'NiftyPM'} status</div>${opts.map(v=>`<button class="btn btn-s" style="display:block;width:100%;text-align:left;height:26px;font-size:11px;padding:0 8px;background:transparent;border:none;color:${isDoneVal(v)?'var(--ok)':'var(--t1)'};border-radius:3px" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='transparent'" data-status="${esc(v)}">${isDoneVal(v)?'✓ ':''}${esc(v)}</button>`).join('')}`;
    pop.querySelectorAll('button[data-status]').forEach(b=>{
      b.onclick=async(e)=>{
        e.stopPropagation();
        const val=b.getAttribute('data-status');
        pop.remove();
        if(_isQueueMode()){
          // Queue, don't push. Topbar button flushes all queued.
          try{
            await _trpc('externalSources.upsertOverride',{source,externalId,pendingStatus:val},'mutation');
            await loadExternalTasks();
            await _refreshPendingCount();
            if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
            toast({type:'success',title:`Queued: ${val} (click Push in topbar to apply)`,duration:2500});
          }catch(err){toast({type:'warn',title:'Queue failed',msg:err.message||String(err)});}
          return;
        }
        try{
          toast({type:'info',title:`Setting status to "${val}"…`,duration:1200});
          const proc=source==='smartsheet'?'externalSources.smartsheetSetRowStatus':'externalSources.niftySetTaskStatus';
          const payload=source==='smartsheet'?{externalId,status:val}:{externalId,statusName:val};
          await _trpc(proc,payload,'mutation');
          toast({type:'success',title:`✓ Set to ${val}`});
          await loadExternalTasks();
          if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
        }catch(err){toast({type:'warn',title:'Status change failed',msg:err.message||String(err)});}
      };
    });
  }catch(e){pop.innerHTML=`<div style="color:var(--red);font-size:11px;padding:4px">${esc(e.message||String(e))}</div>`;}
}

async function _snoozeExternal(source,externalId,days){
  try{
    let localDue=null;
    if(days>=0){
      const d=new Date();d.setDate(d.getDate()+days);
      localDue=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    }
    const payload={source,externalId,localDue};
    if(days>1)payload.myDay=false;
    await _trpc('externalSources.upsertOverride',payload,'mutation');
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
    const label=days<0?'snooze cleared':days===0?'snoozed to today':days===1?'snoozed to tomorrow':`snoozed ${days}d`;
    toast({type:'success',title:'⏰ '+label,duration:1500});
  }catch(e){toast({type:'warn',title:'Snooze failed',msg:e.message||String(e)});}
}

// Snooze popover — small menu so the snooze button can offer +1d / +3d / +7d
// without opening the full annotate modal.
function _externalSnoozeMenu(source,externalId,event){
  if(event){event.stopPropagation();event.preventDefault();}
  // Close any existing snooze popover
  document.querySelectorAll('[data-ext-snooze-pop]').forEach(el=>el.remove());
  const btn=event&&event.currentTarget;
  if(!btn)return;
  const rect=btn.getBoundingClientRect();
  const pop=document.createElement('div');
  pop.setAttribute('data-ext-snooze-pop','1');
  pop.style.cssText=`position:fixed;left:${Math.min(rect.left,window.innerWidth-180)}px;top:${rect.bottom+4}px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:4px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.3);min-width:160px;display:flex;flex-direction:column;gap:2px`;
  const items=[
    {label:'⏰ Tomorrow',days:1},
    {label:'⏰ In 3 days',days:3},
    {label:'⏰ Next week',days:7},
    {label:'⏰ In 2 weeks',days:14},
    {label:'↺ Clear snooze',days:-1},
  ];
  items.forEach(it=>{
    const b=document.createElement('button');
    b.className='btn btn-s';
    b.style.cssText='justify-content:flex-start;height:26px;font-size:11px;padding:0 8px;text-align:left;background:transparent;border:none;color:var(--t1);cursor:pointer';
    b.textContent=it.label;
    b.onmouseover=()=>{b.style.background='var(--s3)';};
    b.onmouseout=()=>{b.style.background='transparent';};
    b.onclick=(e)=>{e.stopPropagation();pop.remove();_snoozeExternal(source,externalId,it.days);};
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  setTimeout(()=>document.addEventListener('click',()=>pop.remove(),{once:true}),0);
}

// ─── External-task local annotations modal ─────────────────────────────────
// External tasks are read-only against the source (Smartsheet/Nifty), but we
// keep a server-side per-user overlay for: My Day flag, local priority,
// personal note, local tags (comma-separated), local due-date override.
// This modal edits everything except myDay (which has its own one-click toggle).
// Anchor attributes for "open external task in source". A real http(s) URL
// opens in a new tab; a missing URL (e.g. NiftyPM's API returns no per-task
// web URL) is routed to the in-app detail modal instead of an href="#" link —
// the latter, combined with target="_blank", was spawning a blank LevelUp Home
// tab (the "clicking a Nifty task takes me to Home" bug). Takes only the url so
// it can be dropped into every external-task anchor regardless of the local
// item variable; the no-url click walks up to the row's data-ext-id/source.
function _extOpenAttrs(u){
  if(u && /^https?:\/\//i.test(u)) return `href="${esc(u)}" target="_blank" rel="noopener"`;
  return `href="javascript:void(0)" onclick="event.preventDefault();event.stopPropagation();_extOpenFromEl(this)"`;
}
function _extOpenFromEl(el){
  if(!el)return;
  // Cards carry data-ext-id/data-source on the row — use them directly.
  const row=el.closest&&el.closest('[data-ext-id][data-source]');
  if(row&&row.dataset.source&&row.dataset.extId){
    _openExternalAnnotateModal(row.dataset.source,row.dataset.extId);return;
  }
  // Board/list rows don't carry data attrs but DO have an annotate (✎) button
  // wired to _openExternalAnnotateModal — walk up a few levels and reuse it so
  // the title click opens the detail modal everywhere.
  let node=el.parentElement,hops=0;
  while(node&&hops<6){
    const ann=node.querySelector&&node.querySelector('[onclick*="_openExternalAnnotateModal"]');
    if(ann){ann.click();return;}
    node=node.parentElement;hops++;
  }
}
function _openExternalAnnotateModal(source,externalId){
  const et=(D.externalTasks||[]).find(t=>t.source===source&&t.externalId===externalId);
  if(!et){toast({type:'warn',title:'Task not found locally — try refresh'});return;}
  const ov=et.override||{};
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal){toast({type:'warn',title:'Modal not available'});return;}
  const badge=_extSourceBadge(source);
  const sourceLabel=source==='smartsheet'?'Smartsheet':'NiftyPM';
  const externalUrl=et.externalUrl||et._url||'';
  modal.innerHTML=`<div style="padding:14px;max-width:560px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${badge}<span style="font-size:11px;color:var(--t3)">${sourceLabel}</span>${externalUrl?`<a href="${esc(externalUrl)}" target="_blank" rel="noopener" style="margin-left:auto;font-size:11px;color:var(--ac);text-decoration:none">Open in ${sourceLabel} ↗</a>`:''}</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:2px;line-height:1.3">${esc(et.title||'(untitled)')}</div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${et.projectLabel?esc(et.projectLabel)+' · ':''}${et.status?esc(et.status):''}${et.due?' · due '+esc(et.due):''}${et.assignee?' · '+esc(et.assignee):''}</div>
    ${(function(){
      // Subtask awareness — if this row's parentExternalId points at another
      // tracked external task, surface a "view parent" breadcrumb at the top
      // of the modal. Completion writes ARE supported for Nifty subtasks
      // (via POST /tasks/{id}/complete) so the Mark Done button stays.
      const pid=et.parentExternalId||null;
      if(!pid)return '';
      const parent=(D.externalTasks||[]).find(x=>x.externalId===pid&&x.source===source);
      if(!parent)return '';
      return `<div style="padding:6px 8px;background:rgba(99,102,241,.10);border:1px solid rgba(99,102,241,.30);border-radius:4px;margin-bottom:8px;font-size:11px">
        ↳ <strong>Subtask</strong> of <a href="javascript:void(0)" onclick="closeModal();setTimeout(()=>_openExternalAnnotateModal('${_jsAttr(source)}','${_jsAttr(pid)}'),50)" style="color:var(--ac);text-decoration:none">${esc(parent.title||'(untitled parent)')}</a>
      </div>`;
    })()}
    <!-- Top action row: completion toggle pushes to source; Hide in
         LevelUp marks the row removed locally (as a fallback when the
         source rejects or doesn't accept the change). -->
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      ${et.status==='Done'
        ?`<button class="btn" style="font-size:11px;height:28px;background:#1e40af;color:#fff;border-color:#1e3a8a" onclick="_extToggleCompleted('${_jsAttr(source)}','${_jsAttr(externalId)}',false)" title="Reopen this task in ${sourceLabel}.">↺ Reopen in ${sourceLabel}</button>`
        :`<button class="btn btn-p" style="font-size:11px;height:28px;background:#16a34a;border-color:#15803d" onclick="_extToggleCompleted('${_jsAttr(source)}','${_jsAttr(externalId)}',true)" title="Mark this task done in ${sourceLabel}.">✓ Mark Done in ${sourceLabel}</button>`}
      <button class="btn" style="font-size:11px;height:28px;background:#7c2d12;color:#fff;border-color:#5b2010" onclick="_extHideFromModal(${et.id||'null'})" title="Hide this row in LevelUp without touching the source.">🚫 Hide in LevelUp</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:8px;padding:6px;background:var(--s3);border-radius:4px">Local annotations below are <strong>your personal overlay</strong> — they don't write back to ${sourceLabel}. Source fields (title, status, due, assignee) stay authoritative.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Local priority</div>
        <select id="ext-ann-priority" class="inp" style="width:100%;font-size:11px">
          <option value="">(use source)</option>
          ${['High','Medium','Low'].map(p=>`<option value="${p}" ${ov.localPriority===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Local due date <span style="color:var(--t3);font-size:11px">(overrides ${et.due?esc(et.due):'(none)'})</span></div>
        <input id="ext-ann-due" type="date" class="inp" style="width:100%;font-size:11px" value="${esc(ov.localDue||'')}">
      </div>
    </div>
    <div style="margin-bottom:8px">
      <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Link to LevelUp project</div>
      <select id="ext-ann-project" class="inp" style="width:100%;font-size:11px">
        <option value="">(not linked)</option>
        ${(D.projects||[]).map(p=>`<option value="${p.id}" ${String(ov.localProjectId||'')===String(p.id)?'selected':''}>${esc(p.name||'(untitled project)')}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom:8px">
      <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Local tags (comma-separated)</div>
      <input id="ext-ann-tags" class="inp" style="width:100%;font-size:11px" placeholder="follow-up, blocker, this-week" value="${esc(ov.localTags||'')}">
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--t2);margin-bottom:3px">Personal note</div>
      <textarea id="ext-ann-note" class="inp" style="width:100%;font-size:11px;min-height:80px;resize:vertical;font-family:inherit" placeholder="Why this matters, what you're waiting on, who you talked to…">${esc(ov.localNote||'')}</textarea>
    </div>
    <div style="display:flex;gap:6px;justify-content:space-between;align-items:center">
      <button class="btn" style="font-size:11px" onclick="_clearExternalAnnotations('${_jsAttr(source)}','${_jsAttr(externalId)}')" title="Clear all overrides (keeps My Day flag)">Clear overrides</button>
      <div style="display:flex;gap:6px">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-p" onclick="_saveExternalAnnotations('${_jsAttr(source)}','${_jsAttr(externalId)}')">Save</button>
      </div>
    </div>
  </div>`;
  modalBg.classList.add('show');
  setTimeout(()=>{const n=document.getElementById('ext-ann-note');if(n)n.focus();},50);
}

// Two-way completion toggle for external tasks. For NiftyPM, flips the
// `completed` boolean directly via niftySetTaskCompleted (works even in
// workspaces with no named statuses — the LSI Media case). For Smartsheet,
// picks the first done-style status from the watch's status column.
//
// completed=true → mark done in source; completed=false → reopen.
async function _extToggleCompleted(source,externalId,completed){
  closeModal();
  try{
    const et=(D.externalTasks||[]).find(t=>t.source===source&&t.externalId===externalId);
    if(!et){toast({type:'warn',title:'Task not found locally'});return;}
    if(source==='nifty'){
      toast({type:'info',title:completed?'Marking done in NiftyPM…':'Reopening in NiftyPM…',duration:1200});
      await _trpc('externalSources.niftySetTaskCompleted',{externalId,completed},'mutation');
      toast({type:'success',title:completed?'✓ Marked done in NiftyPM':'↺ Reopened in NiftyPM'});
    } else if (source==='smartsheet'){
      // Smartsheet uses status names. Look up the first done/open style
      // and PUT that. Reopen falls back to "Not Started" or "In Progress".
      const result=await _trpc('externalSources.smartsheetStatusOptions',{watchId:et.sourceConfigId},'query');
      const opts=Array.isArray(result.options)?result.options:[];
      const doneRe=/(done|complete|closed|cancell?ed|resolved|shipped)/i;
      const openRe=/(not started|in[\s_-]?progress|open|todo|pending|new)/i;
      const target=completed?opts.find(v=>doneRe.test(v||'')):opts.find(v=>openRe.test(v||''))||opts.find(v=>!doneRe.test(v||''));
      if(!target){
        toast({type:'warn',title:`No matching status configured in Smartsheet`,msg:'Open the status picker on the card to pick manually.'});
        return;
      }
      toast({type:'info',title:`Setting status to "${target}"…`,duration:1200});
      await _trpc('externalSources.smartsheetSetRowStatus',{externalId,status:target},'mutation');
      toast({type:'success',title:`✓ Set to ${target}`});
    } else {
      toast({type:'warn',title:`Unknown source: ${source}`});
      return;
    }
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(err){
    toast({type:'warn',title:'Completion toggle failed',msg:err.message||String(err)});
  }
}

// Back-compat shim: the modal Mark-Done button used to call this. Now
// delegates to the two-way toggle with completed=true.
async function _extMarkDoneFromModal(source,externalId){
  return _extToggleCompleted(source,externalId,true);
}

// Hide an external task locally without touching the source. Uses the
// niftyHideRows endpoint for Nifty rows (extending later for Smartsheet
// would need a parallel endpoint, but for now this covers the user's
// concrete need — Nifty tasks done in spirit but not in the API).
async function _extHideFromModal(rowId){
  if(!rowId){toast({type:'warn',title:'Could not resolve row id — refresh and retry'});return;}
  if(!confirm('Hide this task in LevelUp?\n\nIt vanishes from Tasks immediately. Local notes/links survive (tombstoned after 72h if not re-pulled by source). The source row is untouched.')) return;
  closeModal();
  try{
    const res=await _trpc('externalSources.niftyHideRows',{ids:[rowId]},'mutation');
    toast({type:'success',title:`✅ Hidden ${res.hidden} row in LevelUp`});
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(err){
    toast({type:'warn',title:'Hide failed',msg:err.message||String(err)});
  }
}

async function _saveExternalAnnotations(source,externalId){
  try{
    const priority=document.getElementById('ext-ann-priority').value;
    const due=document.getElementById('ext-ann-due').value;
    const tags=document.getElementById('ext-ann-tags').value;
    const note=document.getElementById('ext-ann-note').value;
    const projectId=document.getElementById('ext-ann-project').value;
    await _trpc('externalSources.upsertOverride',{
      source,externalId,
      localPriority:priority||null,
      localDue:due||null,
      localTags:tags||null,
      localNote:note||null,
      localProjectId:projectId||null,
    },'mutation');
    closeModal();
    toast({type:'success',title:'Annotations saved'});
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

async function _clearExternalAnnotations(source,externalId){
  if(!confirm('Clear local note, tags, priority, due, and project link for this task? (Your My Day flag is preserved.)'))return;
  try{
    await _trpc('externalSources.upsertOverride',{
      source,externalId,
      localPriority:null,localDue:null,localTags:null,localNote:null,localProjectId:null,
    },'mutation');
    closeModal();
    toast({type:'success',title:'Overrides cleared'});
    await loadExternalTasks();
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(e){toast({type:'warn',title:'Clear failed',msg:e.message||String(e)});}
}

// Helper: build the small inline indicators shown on rendered external task
// rows so users can see at a glance if a task has been annotated.
function _extAnnotationChips(ov){
  if(!ov)return '';
  const bits=[];
  if(ov.pendingStatus)bits.push(_extPendingPill(ov));
  if(ov.localNote)bits.push(`<span title="${esc(ov.localNote).slice(0,200)}" style="font-size:11px;color:var(--ac);cursor:help">📝</span>`);
  if(ov.localPriority)bits.push(`<span class="pill ${pillClass(ov.localPriority)}" style="font-size:9px" title="Local priority override">${ov.localPriority}</span>`);
  if(ov.localTags){
    const tags=String(ov.localTags).split(',').map(t=>t.trim()).filter(Boolean).slice(0,3);
    tags.forEach(t=>bits.push(`<span style="font-size:9px;padding:1px 4px;background:var(--s3);color:var(--ac);border-radius:3px">#${esc(t)}</span>`));
  }
  return bits.length?`<span style="display:inline-flex;gap:3px;align-items:center;flex-wrap:wrap">${bits.join('')}</span>`:'';
}

function renderTasks(){
  // Compute week bounds for This Week filter
  const _twNow=new Date();
  const _twDay=_twNow.getDay();
  const _twMon=_pd(_twNow);
  _twMon.setDate(_twNow.getDate()-(_twDay===0?6:_twDay-1));
  _twMon.setHours(0,0,0,0);
  const _twSun=_pd(_twMon);
  _twSun.setDate(_twMon.getDate()+6);
  _twSun.setHours(23,59,59,999);
  const _twFmt=_ymd; // local YYYY-MM-DD — not UTC
  const _twStart=_twFmt(_twMon);
  const _twEnd=_twFmt(_twSun);
  function _taskInWeek(t){
    if(!t||t.status==='Done'||t.status==='Someday')return false;
    const d=t.startDate||t.due||'';
    return d>=_twStart&&d<=_twEnd;
  }
  // _todayStr is global
  _taskTabDefs=[
    {label:'All Active',filter:t=>t.status!=='Done'&&t.status!=='Someday'},
    {label:'Today',filter:t=>t.due===_todayStr||t.startDate===_todayStr,badge:D.tasks.filter(t=>t.due===_todayStr||t.startDate===_todayStr).length||undefined},
    {label:'This Week',filter:_taskInWeek,badge:D.tasks.filter(_taskInWeek).length||undefined},
    {label:'Inbox',filter:t=>t.status==='Not Started'},
    {label:'Recurring',filter:t=>t.recurring&&t.recurring!=='None'},
    {label:'Someday',filter:t=>t.status==='Someday'},
    {label:'Done',filter:t=>t.status==='Done'},
  ];
  // Restore the selected tab from persisted index (or default to All Active).
  // Filter functions are recreated on every render so we can't compare references
  // across renders — index is the source of truth.
  if(typeof _taskFilterTabIdx==='number'&&_taskTabDefs[_taskFilterTabIdx]){
    _taskFilter=_taskTabDefs[_taskFilterTabIdx].filter;
  }else if(!_taskTabDefs.some(td=>td.filter===_taskFilter)){
    _taskFilter=_taskTabDefs[0].filter;_taskFilterTabIdx=0;
  }
  $('tasks-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('list',22,'var(--page-accent)')}Tasks & Planning</h1><p style="font-size:12px;color:var(--t2)">${(()=>{const a=D.tasks.filter(t=>t.status!=='Done'&&t.status!=='Someday').length;const o=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;const w=D.tasks.filter(_taskInWeek).length;return `${a} active${o?` · <span style="color:var(--red);font-weight:600">${o} overdue</span>`:''}${w?` · ${w} this week`:''}`;})()}</p></div><div style="display:flex;gap:6px;align-items:center"><div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden"><button id="tasks-scope-my" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_taskMyOnly?'var(--ac)':'transparent'};color:${_taskMyOnly?'#fff':'var(--t2)'};border:none" onclick="setTaskScope(true)">My Items</button><button id="tasks-scope-all" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_taskMyOnly?'transparent':'var(--ac)'};color:${_taskMyOnly?'var(--t2)':'#fff'};border:none" onclick="setTaskScope(false)">All Items</button></div>${(()=>{
    // B: visible 3 most-used views + a More dropdown for the rest
    const visible=[{k:'focus',icon:'⚡',label:'Focus'},{k:'cards',icon:'🎴',label:'Cards'},{k:'clusters',icon:'⬡',label:'Clusters'},{k:'list',icon:'☰',label:'List'},{k:'board',icon:'🗂',label:'Board'}];
    const overflow=[{k:'matrix',icon:'⊞',label:'Matrix'},{k:'gantt',icon:'📅',label:'Gantt'},{k:'calendar',icon:'🗓',label:'Calendar'}];
    // If the current view is in overflow, surface it inline so the user sees it active
    const cur=[...visible,...overflow].find(v=>v.k===_taskView);
    const inOverflow=overflow.some(v=>v.k===_taskView);
    const seg=visible.map(v=>{const isOn=_taskView===v.k;return `<button id="tasks-view-${v.k}" class="btn" title="${v.label} view" style="border-radius:0;height:28px;width:36px;padding:0;font-size:14px;background:${isOn?'var(--ac)':'transparent'};color:${isOn?'#fff':'var(--t2)'};border:none" onclick="setTaskView('${_jsAttr(v.k)}')">${v.icon}</button>`;}).join('');
    const moreLabel=inOverflow?`${cur.icon} ${cur.label} ▾`:'⋯ More ▾';
    return `<div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden">${seg}</div><div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px;padding:0 8px;background:${inOverflow?'var(--ac)':''};color:${inOverflow?'#fff':''}" onclick="event.stopPropagation();togglePopMenu('tasks-more-views')">${moreLabel}</button><div id="tasks-more-views" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,.35)">${overflow.map(v=>`<button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:26px;font-size:11px;background:transparent;border:none;text-align:left;color:${_taskView===v.k?'var(--ac)':'var(--t1)'}" onclick="closePopMenu('tasks-more-views');setTaskView('${_jsAttr(v.k)}')">${v.icon} ${v.label}${_taskView===v.k?' ✓':''}</button>`).join('')}</div></div>`;
  })()}<div style="position:relative;display:inline-block"><button id="bulk-toggle-btn" class="btn btn-s" style="height:28px;font-size:11px" onclick="event.stopPropagation();toggleTaskAIMenu(event)" title="Tools menu">🛠 Tools ▾</button><div id="task-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();toggleBulkMode()">☑ Bulk Select Mode</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();window._syncDiagnose&&window._syncDiagnose()">🩺 Diagnose sync</button><div style="height:1px;background:var(--bd1);margin:4px 2px"></div><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();aiDecomposeGoal()">🧩 Decompose Goal</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--red);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();aiDeadlineRisk()">⚠️ Risk Check</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();aiAutoPriority()">✨ Auto-Priority</button><div style="height:1px;background:var(--bd1);margin:4px 2px"></div><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();exportTasks('csv')">⬇ Export CSV</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closeTaskAIMenu();exportTasks('html')">📄 Export HTML (Word-ready)</button></div></div><button class="btn btn-p" onclick="openFA('task')">+ Full Add Task</button></div></div>
  <div id="bulk-action-bar" style="display:none;align-items:center;gap:6px;padding:6px 0;margin-bottom:6px;background:var(--acs);border:1px solid var(--ac);border-radius:6px;padding:6px 10px">
    <span id="bulk-count" style="font-size:11px;color:var(--ac);font-weight:600;flex:1">0 selected</span>
    <button class="btn btn-p" style="height:24px;font-size:11px" onclick="bulkAction('done')">✓ Done</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" onclick="bulkAction('someday')">💤 Someday</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" onclick="bulkAction('project')">${_icon('folder',12,'currentColor')} Move</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" title="Move the selected tasks into a cluster" onclick="bulkAction('cluster')">⬡ Cluster</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" title="Create the selected tasks in NiftyPM" onclick="bulkAction('nifty')">↗ Nifty</button>
    <button class="btn btn-d" style="height:24px;font-size:11px" onclick="bulkAction('delete')">${_icon('trash',12,'currentColor')} Delete</button>
    <button class="btn btn-s" style="height:24px;font-size:11px" onclick="toggleBulkMode()">✕ Cancel</button>
  </div>
  <div class="tabs" id="tasks-tabs" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">${_taskTabDefs.map((td,i)=>`<div class="tab ${i===_taskFilterTabIdx?'on':''}" onclick="setTaskTabIdx(${i})">${td.label}${td.badge?` <span class="tc">${td.badge}</span>`:''}</div>`).join('')}${(()=>{
    // C: render saved views as additional tabs
    const saved=(D.prefs&&D.prefs.taskSavedViews)||[];
    if(!saved.length)return `<button class="btn btn-s" style="height:24px;font-size:11px;padding:0 8px;color:var(--t3);margin-left:6px" onclick="saveCurrentTaskView()" title="Save the current filter + view as a tab">⭐ Save view</button>`;
    return `<div style="width:1px;height:18px;background:var(--bd2);margin:0 4px"></div>`+saved.map(v=>`<span class="task-saved-view" onclick="applySavedTaskView(${v.id})" title="Apply saved view">⭐ ${esc(v.name)}<span class="x" onclick="deleteSavedTaskView(${v.id},event)" title="Delete view">✕</span></span>`).join('')+`<button class="btn btn-s" style="height:24px;font-size:11px;padding:0 8px;color:var(--ac);margin-left:6px" onclick="saveCurrentTaskView()" title="Save current filter as a view">⭐ +</button>`;
  })()}</div>
  ${_renderSourceFilterChips()}
  ${(_taskProjectFilter||_taskAssigneeFilter||_taskKindFilter)?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
    ${_taskProjectFilter?`<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:color-mix(in srgb,var(--page-accent) 18%,transparent);border:1px solid var(--page-accent);border-radius:13px;font-size:11px;color:var(--page-accent);font-weight:600">📁 Project: ${esc(_taskProjectFilter)}<span style="cursor:pointer;font-weight:400" onclick="clearTaskProjectFilter()" title="Clear project filter">✕</span></div>`:''}
    ${_taskAssigneeFilter?`<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:color-mix(in srgb,var(--page-accent) 18%,transparent);border:1px solid var(--page-accent);border-radius:13px;font-size:11px;color:var(--page-accent);font-weight:600">👤 Assignee: ${esc(_taskAssigneeFilter)}<span style="cursor:pointer;font-weight:400" onclick="clearTaskAssigneeFilter()" title="Clear assignee filter">✕</span></div>`:''}
    ${_taskKindFilter?(function(){
      const labels={overdue:{e:'⚠',l:'Overdue',c:'#ef4444'},today:{e:'📅',l:'Due today',c:'#f59e0b'},stalled:{e:'💤',l:'Stalled (7d+)',c:'#64748b'},dateless:{e:'📭',l:'No date set',c:'#a855f7'}};
      const k=labels[_taskKindFilter]||{e:'•',l:_taskKindFilter,c:'var(--t2)'};
      return `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:color-mix(in srgb,${k.c} 18%,transparent);border:1px solid ${k.c};border-radius:13px;font-size:11px;color:${k.c};font-weight:600">${k.e} ${esc(k.l)}<span style="cursor:pointer;font-weight:400" onclick="clearTaskKindFilter()" title="Clear status filter">✕</span></div>`;
    })():''}
  </div>`:''}
  ${(()=>{
    // N: AI Today's Plan banner — only shown when the active filter is the Today tab
    const isToday=_taskTabDefs[1]&&_taskFilter===_taskTabDefs[1].filter;
    if(!isToday)return '';
    const todayCount=D.tasks.filter(t=>t.status!=='Done'&&(t.due===_todayStr||t.startDate===_todayStr||t.myDay)).length;
    if(!todayCount)return '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin:6px 0;background:linear-gradient(90deg,color-mix(in srgb,var(--ac) 14%,transparent),color-mix(in srgb,var(--purp) 14%,transparent));border:1px solid color-mix(in srgb,var(--ac) 30%,var(--bd2));border-radius:8px"><span style="font-size:18px">🧭</span><div style="flex:1"><div style="font-size:11px;font-weight:600">Want a plan for today?</div><div style="font-size:11px;color:var(--t3)">AI ranks your ${todayCount} task${todayCount===1?'':'s'} by impact + energy + deadlines.</div></div><button id="ai-today-plan-btn" class="btn btn-p" style="font-size:11px;height:28px" onclick="aiTodaysPlan()">🧭 Today's Plan</button></div>`;
  })()}
  <div id="task-quick-add" style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;margin-bottom:6px">
    <span style="font-size:14px;color:var(--ac)">+</span>
    <!-- Chrome honeypot: a hidden, off-screen email + password pair Chrome
         autofills INSTEAD of our real input. This is the most reliable
         fix once Chrome has decided the page has a login-ish form (the
         email started leaking into the quick-add after Chrome saw it on
         another page and "helpfully" auto-completed). The honeypot pair
         absorbs the autofill; our real input below stays clean. -->
    <input type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0">
    <input type="password" name="password" autocomplete="current-password" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0">
    <input id="task-quick-input" class="inp" name="lu-task-${Date.now()}" type="search" autocomplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" readonly onfocus="this.removeAttribute('readonly')" style="flex:1;height:28px;font-size:12px;border:none;background:transparent;outline:none;padding:0" placeholder="Quick add… try: Buy milk !high tomorrow #shopping @groceries" onkeydown="handleQuickAdd(event)">
    <select id="task-priority-filter" class="inp" title="Filter by priority" style="height:28px;font-size:11px;width:88px;padding:0 4px" onchange="setTaskPriorityFilter(this.value)">
      <option value="All"${_taskPriorityFilter==='All'?' selected':''}>All Pri</option>
      <option value="High"${_taskPriorityFilter==='High'?' selected':''}>High</option>
      <option value="Medium"${_taskPriorityFilter==='Medium'?' selected':''}>Medium</option>
      <option value="Low"${_taskPriorityFilter==='Low'?' selected':''}>Low</option>
    </select>
    <button class="btn btn-p" style="height:28px;font-size:11px;padding:0 8px" onclick="quickAddTask()">Add</button>
  </div>
  <div id="shared-tasks-section" style="margin-bottom:8px"></div>
  <div class="cd" id="tasks-list"></div>`;
  renderCurrentTaskView();
  $('tasks-rail').innerHTML=renderTaskRailHTML();
}

function bulkCompleteVisible(){
  const list=document.getElementById('tasks-list');
  if(!list)return;
  const rows=list.querySelectorAll('[data-task-id]');
  if(!rows.length){toast('No tasks to complete');return;}
  if(!confirm(`Mark ${rows.length} visible task(s) as Done?`))return;
  rows.forEach(el=>{
    const id=parseInt(el.dataset.taskId);
    const t=D.tasks.find(x=>x.id===id);
    if(t&&t.status!=='Done'){t.status='Done';_syncTaskCompletedAt(t);maybeSpawnRecurring(t);}
  });
  save('tasks');updateSidebarBadges();renderScreen(curScreen);
  toast(`✓ ${rows.length} task(s) marked Done`);
}
