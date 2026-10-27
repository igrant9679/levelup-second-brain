// LevelUp client, file 4 of 7: Command Center, Standup, Pipeline, Programs, Projects.
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
function renderCommandCenter(){
  const m=document.getElementById('command-main');
  const r=document.getElementById('command-rail');
  if(!m)return;
  const hat=_ccHat();
  const tasks=_ccTasks();
  const open=tasks.filter(t=>t.status!=='Done');
  const today=_todayStr;
  const tMs=Date.now();
  const overdue=open.filter(t=>t.due&&t.due<today);
  const dueToday=open.filter(t=>t.due===today);
  const stallCut=new Date(tMs-7*86400000).toISOString();
  const stalled=open.filter(t=>t.updatedAt&&t.updatedAt<stallCut&&t.due!==today&&!(t.due&&t.due<today));
  const week=new Date(tMs-7*86400000).toISOString();
  const shipped=tasks.filter(t=>t.status==='Done'&&t.completedAt&&t.completedAt>=week)
                     .sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
  const pendingPush=tasks.filter(t=>t.hasPendingPush);
  // Pending push count from server reality (overrides).
  const pendingRows=(Array.isArray(D.externalTasks)?D.externalTasks:[])
    .filter(et=>!(et.override&&et.override.tombstoned)&&et.override&&et.override.pendingStatus)
    .filter(et=>hat==='all'||(hat==='cf'&&et.source==='smartsheet')||(hat==='lsi'&&et.source==='nifty'));
  // Time tracked in the rolling 7d window, filtered by the active hat. Sums
  // minutes from D.timeEntries (populated by loadTimeEntries at boot).
  const weekStart=new Date(tMs-7*86400000);
  const timeRows=(Array.isArray(D.timeEntries)?D.timeEntries:[]).filter(r=>{
    if(!r.startedAt)return false;
    if(_pd(r.startedAt)<weekStart)return false;
    if(hat==='cf')return r.source==='smartsheet';
    if(hat==='lsi')return r.source==='nifty';
    if(hat==='personal')return r.source==='local';
    return true;
  });
  const timeMins=timeRows.reduce((a,r)=>a+(Number(r.durationMins)||0),0);
  const timeLabel=timeMins<60?`${timeMins}m`:`${Math.floor(timeMins/60)}h ${timeMins%60}m`;

  // Group open work by project label.
  const byProj={};
  open.forEach(t=>{const k=t.project||'(no project)';(byProj[k]=byProj[k]||[]).push(t);});
  const projCards=Object.entries(byProj).sort((a,b)=>b[1].length-a[1].length).slice(0,12).map(([name,rows])=>{
    // health metrics for this label.
    const allInLabel=tasks.filter(t=>(t.project||'(no project)')===name);
    const doneN=allInLabel.filter(t=>t.status==='Done').length;
    const totalN=allInLabel.length;
    const pct=totalN?Math.round(doneN/totalN*100):0;
    const overdueN=rows.filter(t=>t.due&&t.due<today).length;
    const accent=rows[0]?(rows[0].source==='smartsheet'?'#1f6feb':rows[0].source==='nifty'?'#9333ea':'#10b981'):'#64748b';
    const src=rows[0]?rows[0].source:'personal';
    return `<div class="cd cc-proj-tile" style="padding:11px 13px;border-left:3px solid ${accent};cursor:pointer;transition:transform .12s ease,background .12s ease" onclick="_ccDrillIntoProject('${_jsAttr(name)}','${_jsAttr(src)}')" title="Click to open these tasks in the Tasks view">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
        <div style="font-size:12px;font-weight:600;color:var(--t1);min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div>
        <span style="font-size:11px;font-weight:600;letter-spacing:.04em;color:#fff;background:${accent};padding:2px 6px;border-radius:3px">${rows[0]?(rows[0].sourceLabel||'').toUpperCase():''}</span>
      </div>
      <div style="display:flex;gap:10px;font-size:11px;color:var(--t2);margin-bottom:6px">
        <span><strong style="color:var(--t1)">${rows.length}</strong> open</span>
        ${overdueN?`<span style="color:var(--red)"><strong>${overdueN}</strong> overdue</span>`:''}
        <span style="color:var(--t3)">${doneN}/${totalN} done</span>
      </div>
      <div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${accent};border-radius:3px"></div></div>
    </div>`;
  }).join('');

  const atRiskRow=(t,kind)=>{
    const pcolor=t.priority==='High'?'#ef4444':t.priority==='Medium'?'#f59e0b':'#64748b';
    const srcBadge=t.source==='smartsheet'?'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">CF</span>':t.source==='nifty'?'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">LSI</span>':'';
    // Badge is clickable — drills into Tasks filtered to that kind + current hat.
    const kindMeta=kind==='overdue'?{e:'⚠',l:'overdue',c:'var(--red)'}:kind==='today'?{e:'📅',l:'today',c:'var(--warn)'}:{e:'💤',l:'stalled',c:'var(--t3)'};
    const kindBadge=`<span style="color:${kindMeta.c};font-size:11px;font-weight:${kind==='stalled'?'400':'600'};cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px" onclick="event.stopPropagation();_ccDrillIntoKind('${kind}')" title="Click to see all ${kindMeta.l} tasks in the current hat">${kindMeta.e} ${kindMeta.l}</span>`;
    const dueDays=t.due?_daysUntil(t.due):null;
    const dueLabel=t.due?(dueDays===0?'today':dueDays<0?`${-dueDays}d ago`:`${dueDays}d`):'—';
    const extId=t._ext?t._ext.externalId:'';
    const clickAction=t.source==='personal'?`openDrawer('task',D.tasks.find(x=>String(x.id)==='${_jsAttr(String(t.id))}'))`:`_openExternalAnnotateModal('${_jsAttr(t.source)}','${_jsAttr(extId)}')`;
    return `<div class="lr" style="padding:8px 10px;border-bottom:1px solid var(--bd1);cursor:pointer;display:flex;align-items:center;gap:8px" onclick="${clickAction}">
      <span style="width:6px;height:6px;border-radius:50%;background:${pcolor};flex-shrink:0"></span>
      ${srcBadge}
      <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0">${esc(t.project||'')}</span>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0;min-width:48px;text-align:right">${dueLabel}</span>
      ${kindBadge}
    </div>`;
  };
  const atRiskBody = (()=>{
    const sections=[];
    if(overdue.length)sections.push(`<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;padding:8px 10px 4px;background:var(--s3)">Overdue (${overdue.length})</div>`+overdue.slice(0,8).map(t=>atRiskRow(t,'overdue')).join(''));
    if(dueToday.length)sections.push(`<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;padding:8px 10px 4px;background:var(--s3)">Due today (${dueToday.length})</div>`+dueToday.slice(0,8).map(t=>atRiskRow(t,'today')).join(''));
    if(stalled.length)sections.push(`<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;padding:8px 10px 4px;background:var(--s3)">Stalled (${stalled.length})</div>`+stalled.slice(0,6).map(t=>atRiskRow(t,'stalled')).join(''));
    return sections.length?sections.join(''):renderEmptyState({icon:'checkCircle',title:'Nothing at risk',hint:'No overdue, due-today, or stalled tasks in this context.'});
  })();

  // Stakeholder column (group by assignee, top 8)
  const byAssignee={};
  open.forEach(t=>{const k=t.assignee||'(unassigned)';(byAssignee[k]=byAssignee[k]||[]).push(t);});
  const assigneeRows=Object.entries(byAssignee).sort((a,b)=>b[1].length-a[1].length).slice(0,8);
  const stakeholderBody=assigneeRows.length?assigneeRows.map(([name,rows])=>{
    const overdueN=rows.filter(t=>t.due&&t.due<today).length;
    const initials=(name||'?').split(/\s+/).map(s=>s[0]).filter(Boolean).join('').slice(0,2).toUpperCase()||'?';
    return `<div class="lr cc-assignee-row" style="padding:7px 10px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px;cursor:pointer" onclick="_ccDrillIntoAssignee('${_jsAttr(name)}')" title="Click to filter Tasks to this assignee">
      <span style="width:24px;height:24px;border-radius:50%;background:var(--ac);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${esc(initials)}</span>
      <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</span>
      <span style="font-size:11px;color:var(--t2)"><strong>${rows.length}</strong> open</span>
      ${overdueN?`<span style="font-size:11px;color:var(--red)">${overdueN} late</span>`:''}
    </div>`;
  }).join(''):'<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">No assignees in scope.</div>';

  // Recently shipped (last 7d).
  const shippedBody=shipped.length?shipped.slice(0,10).map(t=>{
    const srcBadge=t.source==='smartsheet'?'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">CF</span>':t.source==='nifty'?'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">LSI</span>':'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#10b981;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">YOU</span>';
    const when=t.completedAt?_relTime(t.completedAt):'';
    return `<div class="lr" style="padding:7px 10px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:8px">
      <span style="font-size:13px;color:var(--ok);flex-shrink:0">✓</span>
      ${srcBadge}
      <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0">${when}</span>
    </div>`;
  }).join(''):renderEmptyState({icon:'zap',title:'Nothing shipped yet this week',hint:'Tasks marked Done in the last 7 days will appear here — push some over the line.'});

  const pendingPushBody=pendingRows.length?pendingRows.slice(0,12).map(et=>{
    const ov=et.override||{};
    const badge=et.source==='smartsheet'?'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600">CF</span>':'<span style="display:inline-block;padding:1px 5px;border-radius:3px;background:#9333ea;color:#fff;font-size:9px;font-weight:600">LSI</span>';
    return `<div class="lr" style="padding:7px 10px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:8px">
      ${badge}
      <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(et.title)}</span>
      <span style="font-size:11px;color:var(--warn)">${esc(ov.pendingStatus||'')}</span>
    </div>`;
  }).join(''):'';

  // Chip switcher
  const chip=(key,label,color)=>{
    const on=hat===key;
    return `<button class="btn btn-s" onclick="setCcContext('${key}')" style="height:26px;padding:0 12px;font-size:11px;border:1px solid ${on?color:'var(--bd2)'};background:${on?color:'transparent'};color:${on?'#fff':'var(--t2)'};border-radius:13px;font-weight:${on?600:500}">${label}</button>`;
  };

  const cfCount=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>t.source==='smartsheet'&&!(t.override&&t.override.tombstoned)).length;
  const lsiCount=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>t.source==='nifty'&&!(t.override&&t.override.tombstoned)).length;

  // Saved views row (only when at least one)
  const savedViews=(D.prefs&&D.prefs.savedCCViews)||[];
  const savedRow=savedViews.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:11px;color:var(--t3)">
    <span style="text-transform:uppercase;letter-spacing:.05em">Saved views:</span>
    ${savedViews.slice(0,8).map(v=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 9px;border-radius:11px" onclick="_applySavedCCView(${v.id})" title="Apply view (${esc(v.hat||'all').toUpperCase()})">⭐ ${esc(v.name)}</button>`).join('')}
    <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px" onclick="_openSavedCCViews()">Manage</button>
  </div>`:'';
  m.innerHTML=`<div class="ph-r" style="margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div style="flex:1;min-width:0">
      <h1 style="font-size:22px;font-weight:700;display:flex;align-items:center;gap:8px">${_icon('target',22,'var(--page-accent)')}Command Center</h1>
      <p style="font-size:12px;color:var(--t2)">Cross-tool dashboard — what's at risk, what's shipping, what's queued. ${open.length} open · ${shipped.length} shipped this week · ${overdue.length} overdue.</p>
      ${savedRow}
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${chip('all','All hats','#f59e0b')}
      ${chip('cf','CF · '+cfCount,'#1f6feb')}
      ${chip('lsi','LSI · '+lsiCount,'#9333ea')}
      ${chip('personal','Personal','#10b981')}
      <button class="btn btn-s" style="height:26px;padding:0 10px;font-size:11px" onclick="_saveCurrentCCView()" title="Save the current hat as a view">⭐ Save view</button>
      <button class="btn btn-s" style="height:26px;padding:0 10px;font-size:11px" onclick="refreshExternalTasksNow()" title="Force fresh pull">↻ Sync</button>
    </div>
  </div>

  <!-- KPI strip -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #ef4444;cursor:pointer" onclick="_ccDrillIntoKind('overdue')" title="Click to see all overdue tasks in this hat"><div style="font-size:22px;font-weight:750;color:#ef4444;line-height:1">${overdue.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Overdue</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #f59e0b;cursor:pointer" onclick="_ccDrillIntoKind('today')" title="Click to see all due-today tasks in this hat"><div style="font-size:22px;font-weight:750;color:#f59e0b;line-height:1">${dueToday.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Due Today</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #64748b;cursor:pointer" onclick="_ccDrillIntoKind('stalled')" title="Click to see all stalled tasks in this hat"><div style="font-size:22px;font-weight:750;color:var(--t2);line-height:1">${stalled.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Stalled (7d+)</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #10b981"><div style="font-size:22px;font-weight:750;color:#10b981;line-height:1">${shipped.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Shipped (7d)</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #06b6d4"><div style="font-size:22px;font-weight:750;color:#06b6d4;line-height:1">${open.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Open Total</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #0ea5e9" title="Sum of timer minutes in the last 7 days (current hat)"><div style="font-size:22px;font-weight:750;color:#0ea5e9;line-height:1">${timeLabel}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Time Tracked (7d)</div></div>
    ${(function(){
      // Capacity tile — only visible on All Hats / Personal where today's tasks live.
      if(hat==='cf'||hat==='lsi')return '';
      const c=_dayCapacityCheck();
      if(!c.taskCount)return '';
      const cColor=c.deltaMins>15?'#ef4444':c.deltaMins<-15?'#10b981':'#f59e0b';
      const cVerdict=c.deltaMins>15?'over':c.deltaMins<-15?'on track':'tight';
      return `<div class="cd" style="padding:12px;text-align:center;border-left:3px solid ${cColor};cursor:pointer" onclick="_openCapacityDetail()" title="${c.taskCount} task${c.taskCount===1?'':'s'} (${_fmtHm(c.plannedMins)}) vs ${_fmtHm(c.freeMins)} free in working hours — click for details"><div style="font-size:18px;font-weight:750;color:${cColor};line-height:1">${_fmtHm(c.plannedMins)}/${_fmtHm(c.freeMins)}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Capacity · ${cVerdict}</div></div>`;
    })()}
    ${pendingRows.length?`<div class="cd" style="padding:12px;text-align:center;border-left:3px solid #f97316;cursor:pointer" onclick="openPushQueueDrawer()" title="Click to preview"><div style="font-size:22px;font-weight:750;color:#f97316;line-height:1">${pendingRows.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Pending Push</div></div>`:''}
  </div>

  ${_renderBriefingCard()}

  <!-- Two-column main body -->
  <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;align-items:start;margin-top:${(D.prefs&&D.prefs.briefings&&D.prefs.briefings.length)?'14px':'0'}" id="cc-grid">
    <!-- At-risk -->
    <div class="cd" style="padding:0;overflow:hidden">
      <div style="padding:11px 13px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:600">⚠ At Risk</div><div style="font-size:11px;color:var(--t3)">${overdue.length+dueToday.length+stalled.length} items</div></div>
      <div style="max-height:520px;overflow-y:auto">${atRiskBody}</div>
    </div>
    <!-- Stakeholders -->
    <div class="cd" style="padding:0;overflow:hidden">
      <div style="padding:11px 13px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:600">👥 By Stakeholder</div><div style="font-size:11px;color:var(--t3)">${Object.keys(byAssignee).length} owners</div></div>
      <div style="max-height:280px;overflow-y:auto">${stakeholderBody}</div>
    </div>
    <!-- Projects -->
    <div class="cd" style="padding:11px 13px;grid-column:1/-1">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:12px;font-weight:600">📁 By Project (open work)</div><div style="font-size:11px;color:var(--t3)">top ${Object.keys(byProj).length>12?12:Object.keys(byProj).length} of ${Object.keys(byProj).length}</div></div>
      ${projCards?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">${projCards}</div>`:renderEmptyState({icon:'folder',title:'No open work',hint:'No active projects in this context.'})}
    </div>
    <!-- Shipped -->
    <div class="cd" style="padding:0;overflow:hidden">
      <div style="padding:11px 13px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:600">🚀 Recently Shipped (7d)</div><div style="font-size:11px;color:var(--t3)">${shipped.length}</div></div>
      <div style="max-height:380px;overflow-y:auto">${shippedBody}</div>
    </div>
    <!-- Pending push -->
    ${pendingRows.length?`<div class="cd" style="padding:0;overflow:hidden;border-left:3px solid #f97316">
      <div style="padding:11px 13px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:12px;font-weight:600">⬆ Pending Push to Source</div>
        <button class="btn btn-s" style="height:22px;font-size:11px;background:#f97316;color:#fff;border:none" onclick="openPushQueueDrawer()">Preview</button>
      </div>
      <div style="max-height:380px;overflow-y:auto">${pendingPushBody}</div>
    </div>`:`<div class="cd" style="padding:14px;text-align:center;color:var(--t3);font-size:11px"><div style="font-size:18px;margin-bottom:6px">📥</div>Push queue clear — every status change is live on the source.</div>`}
  </div>`;

  // Responsive: collapse to single col under 900px
  if(!document.getElementById('cc-resp-css')){
    const s=document.createElement('style');s.id='cc-resp-css';
    s.textContent='@media(max-width:900px){#cc-grid{grid-template-columns:1fr!important}}';
    document.head.appendChild(s);
  }

  if(r){
    const last=D.prefs&&D.prefs.lastExternalSyncAt;
    const lastLabel=last?_relTime(last):'never';
    r.innerHTML=`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:8px">⚡ Quick Actions</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button id="cc-briefing-btn" class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left;color:var(--purp);border-color:var(--purp)" onclick="aiPortfolioBriefing()" title="Generate an AI weekly portfolio briefing for the current hat">📝 Generate weekly briefing</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="refreshExternalTasksNow()">↻ Force sync now</button>
        ${pendingRows.length?`<button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left;color:#f97316;border-color:#f97316" onclick="openPushQueueDrawer()">⬆ Preview push queue (${pendingRows.length})</button>`:''}
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="nav('standup')">📋 Open Standup view</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="nav('clusters')">⬡ Clusters dashboard</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="nav('process')">⚡ Process (GTD)</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="nav('programs')">📊 Portfolio view</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="nav('reports')">📈 Build a widget</button>
        <button class="btn btn-s" style="font-size:11px;justify-content:flex-start;text-align:left" onclick="_openSavedCCViews()" title="Save the current hat + filter set">⭐ Saved views</button>
      </div>
    </div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px">📡 Sync status</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.7">
        Last pull: <strong>${lastLabel}</strong><br>
        CF rows: <strong>${cfCount}</strong> · LSI rows: <strong>${lsiCount}</strong><br>
        ${pendingRows.length?`<span style="color:var(--warn)">⏳ ${pendingRows.length} pending push</span>`:'<span style="color:var(--ok)">✓ Push queue clear</span>'}
      </div>
    </div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px">💡 Tip</div>
      <div style="font-size:11px;color:var(--t3);line-height:1.6">Pin a project here by linking its <em>defaultProjectId</em> in <a href="#" onclick="nav('settings');return false" style="color:var(--ac)">Settings → Integrations</a>. Pending pushes show up automatically when queue mode is on.</div>
    </div>`;
  }
}
// Standup view — three columns: Yesterday / Today / Blockers + copy.
let _standupMode='copy';
let _standupWindow24h=false; // Toggle: when true, "Yesterday" widens to the trailing 24h instead of strict yesterday's-date
function renderStandup(){
  const m=document.getElementById('standup-main');
  if(!m)return;
  const tasks=_ccTasks();
  const today=_todayStr;
  const yesterday=(()=>{const d=new Date();d.setDate(d.getDate()-1);return _ymd?_ymd(d):_ymd(d);})();
  // "Yesterday" column has two modes:
  //   strict (default) — completedAt date === yesterday's date
  //   24h window       — completedAt within last 24h (handy when you stamp
  //                      tasks done late at night or first thing in the
  //                      morning; otherwise the column reads empty until
  //                      midnight rollover the next day).
  const window24hStart=new Date(Date.now()-24*60*60*1000).toISOString();
  const yest=_standupWindow24h
    ?tasks.filter(t=>t.status==='Done'&&t.completedAt&&t.completedAt>=window24hStart&&_dayOf(t.completedAt)!==today)
    :tasks.filter(t=>t.status==='Done'&&t.completedAt&&_dayOf(t.completedAt)===yesterday);
  const todayItems=tasks.filter(t=>t.status!=='Done'&&(t.due===today||(t._raw&&t._raw.myDay)||(t._ext&&t._ext.override&&t._ext.override.myDay)));
  const blockers=tasks.filter(t=>{
    if(t.status==='Done')return false;
    const tags=(t._raw&&t._raw.tags)||((t._ext&&t._ext.override&&t._ext.override.localTags)||'').split(',');
    return tags.some(tag=>/block/i.test(String(tag||'')))||/block/i.test(t.status||'')||(t.due&&t.due<today);
  });

  const renderColumn=(title,emoji,rows,empty,color)=>{
    const body=rows.length?rows.map(t=>{
      const srcBadge=t.source==='smartsheet'?'<span style="display:inline-block;padding:1px 4px;border-radius:3px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">CF</span>':t.source==='nifty'?'<span style="display:inline-block;padding:1px 4px;border-radius:3px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;letter-spacing:.4px">LSI</span>':'';
      return `<div class="lr" style="padding:8px 10px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:8px">
        ${srcBadge}
        <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</span>
        ${t.project?`<span style="font-size:11px;color:var(--t3);flex-shrink:0">${esc(t.project)}</span>`:''}
      </div>`;
    }).join(''):`<div style="padding:18px;text-align:center;color:var(--t3);font-size:11px">${empty}</div>`;
    return `<div class="cd" style="padding:0;overflow:hidden;border-top:3px solid ${color}">
      <div style="padding:11px 13px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><div style="font-size:12px;font-weight:600">${emoji} ${title}</div><div style="font-size:11px;color:var(--t3)">${rows.length}</div></div>
      <div style="max-height:520px;overflow-y:auto">${body}</div>
    </div>`;
  };

  const summary=()=>{
    const lines=[];
    lines.push(`*Standup — ${_ymd(new Date())}*`);
    lines.push('');
    lines.push('**Yesterday:**');
    yest.length?yest.forEach(t=>lines.push(`- ${t.sourceLabel?'['+t.sourceLabel+'] ':''}${t.title}`)):lines.push('- (nothing logged)');
    lines.push('');
    lines.push('**Today:**');
    todayItems.length?todayItems.forEach(t=>lines.push(`- ${t.sourceLabel?'['+t.sourceLabel+'] ':''}${t.title}`)):lines.push('- (no tasks set)');
    lines.push('');
    lines.push('**Blockers:**');
    blockers.length?blockers.forEach(t=>lines.push(`- ${t.sourceLabel?'['+t.sourceLabel+'] ':''}${t.title}`)):lines.push('- None');
    return lines.join('\n');
  };
  const hat=_ccHat();
  const chip=(key,label,color)=>{const on=hat===key;return `<button class="btn btn-s" onclick="setCcContext('${key}');renderStandup()" style="height:24px;padding:0 10px;font-size:11px;border:1px solid ${on?color:'var(--bd2)'};background:${on?color:'transparent'};color:${on?'#fff':'var(--t2)'};border-radius:12px;font-weight:${on?600:500}">${label}</button>`;};
  m.innerHTML=`<div class="ph-r" style="margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div>
      <h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('list',22,'var(--page-accent)')}Daily Standup</h1>
      <p style="font-size:12px;color:var(--t2)">What you closed yesterday, what's on today, and what's blocked across CF + LSI + Personal.${hat!=='all'?` <strong style="color:var(--page-accent)">Filtered to ${hat.toUpperCase()}</strong>`:''}</p>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${chip('all','All','#14b8a6')}
      ${chip('cf','CF','#1f6feb')}
      ${chip('lsi','LSI','#9333ea')}
      ${chip('personal','Personal','#10b981')}
      <button class="btn btn-s" onclick="_standupWindow24h=!_standupWindow24h;renderStandup()" title="${_standupWindow24h?'Currently showing the last 24 hours of completions. Click to switch back to yesterday\'s date only.':'Currently showing yesterday\'s date only. Click to widen the window to the last 24 hours (catches late-night completions).'}" style="${_standupWindow24h?'background:color-mix(in srgb,var(--ac) 22%,transparent);color:var(--ac);border-color:var(--ac)':''}">⏳ ${_standupWindow24h?'24h':'Yesterday'}</button>
      <button class="btn btn-s" onclick="_copyStandup()" title="Copy markdown to clipboard">📋 Copy</button>
      <button class="btn btn-s" onclick="nav('command')">→ Command Center</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px" id="standup-grid">
    ${renderColumn('Yesterday','✅',yest,'Nothing closed yesterday.','#10b981')}
    ${renderColumn('Today','🎯',todayItems,'No tasks marked for today / My Day.','#3b82f6')}
    ${renderColumn('Blockers','🚧',blockers,'No blockers — clear runway.','#ef4444')}
  </div>
  <div class="cd" style="padding:11px 13px;border-left:3px solid var(--page-accent)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-size:12px;font-weight:600">📝 Standup summary (markdown)</div><span style="font-size:11px;color:var(--t3)">Click "Copy summary" to copy this</span></div>
    <pre id="standup-md" style="font-size:11px;color:var(--t2);background:var(--s3);padding:10px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;font-family:'SF Mono',Menlo,monospace;line-height:1.55">${esc(summary())}</pre>
  </div>`;
  if(!document.getElementById('standup-resp-css')){
    const s=document.createElement('style');s.id='standup-resp-css';
    s.textContent='@media(max-width:900px){#standup-grid{grid-template-columns:1fr!important}}';
    document.head.appendChild(s);
  }
}
function _copyStandup(){
  const pre=document.getElementById('standup-md');if(!pre)return;
  const txt=pre.textContent;
  try{navigator.clipboard.writeText(txt).then(()=>toast({type:'success',title:'Standup copied','msg':'Paste into Slack / Teams / email.',duration:2500}),()=>fallback());}catch(_){fallback();}
  function fallback(){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast({type:'success',title:'Standup copied',duration:1800});}catch{}ta.remove();}
}

// ─── Sales Pipeline (s-pipeline) ────────────────────────────────────────────
// Opportunities live on D.opportunities. A native task can link to an
// opportunity via task.linkedOpportunityId; we surface those in the opp
// drawer + show an Opp badge on the task row.
let _pipelineView='kanban'; // 'kanban' | 'table' | 'forecast'
let _pipelineHideClosed=true; // Closed Won/Lost hidden from kanban by default
function _opps(){return Array.isArray(D.opportunities)?D.opportunities:(D.opportunities=[]);}
function _fmtMoney(v){
  const n=Number(v)||0;
  if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(1)+'M';
  if(Math.abs(n)>=1e3)return '$'+(n/1e3).toFixed(1)+'K';
  return '$'+n.toFixed(0);
}
function _weightedValue(o){
  const stage=_stageDef(o.stage);
  const prob=o.probability!=null?Number(o.probability):stage.probability;
  return (Number(o.value)||0)*(prob/100);
}
function _opportunityTaskCount(oppId){
  let n=0;
  for(const t of (D.tasks||[])){
    if(t.status==='Done')continue;
    if(String(t.linkedOpportunityId||'')===String(oppId))n++;
  }
  return n;
}
function renderPipeline(){
  const m=document.getElementById('pipeline-main');
  const r=document.getElementById('pipeline-rail');
  if(!m)return;
  const opps=_opps();
  // Header KPIs.
  const open=opps.filter(o=>o.status!=='won'&&o.status!=='lost');
  const won=opps.filter(o=>o.status==='won');
  const lost=opps.filter(o=>o.status==='lost');
  const totalPipelineValue=open.reduce((s,o)=>s+(Number(o.value)||0),0);
  const weighted=open.reduce((s,o)=>s+_weightedValue(o),0);
  const wonValue=won.reduce((s,o)=>s+(Number(o.value)||0),0);
  const winRate=(won.length+lost.length)?Math.round(won.length/(won.length+lost.length)*100):0;
  // View switcher
  const viewBtn=(key,label)=>`<button class="btn btn-s" onclick="_pipelineView='${key}';renderPipeline()" style="${_pipelineView===key?'background:var(--ac);color:#fff;border-color:var(--ac)':''}">${label}</button>`;
  const reportBtn=viewBtn('reports','📊 Reports');
  const header=`<div class="ph-r" style="margin-bottom:14px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <div>
      <h1 style="font-size:22px;font-weight:700">💼 Sales Pipeline</h1>
      <p style="font-size:12px;color:var(--t2)">${open.length} open · ${_fmtMoney(totalPipelineValue)} total · <strong style="color:var(--ok)">${_fmtMoney(weighted)} weighted</strong> · ${won.length} won (${_fmtMoney(wonValue)}) · ${winRate}% win rate</p>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${viewBtn('kanban','📋 Kanban')}
      ${viewBtn('table','📋 Table')}
      ${viewBtn('forecast','📈 Forecast')}
      ${reportBtn}
      <button class="btn btn-p" onclick="_newOpportunity()">+ New opportunity</button>
    </div>
  </div>`;
  // KPI strip.
  const kpis=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #3b82f6"><div style="font-size:20px;font-weight:750;color:#3b82f6;line-height:1">${_fmtMoney(totalPipelineValue)}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Pipeline Value</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #10b981"><div style="font-size:20px;font-weight:750;color:#10b981;line-height:1">${_fmtMoney(weighted)}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Weighted Forecast</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #f59e0b"><div style="font-size:20px;font-weight:750;color:#f59e0b;line-height:1">${open.length}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Open Opps</div></div>
    <div class="cd" style="padding:12px;text-align:center;border-left:3px solid #16a34a"><div style="font-size:20px;font-weight:750;color:#16a34a;line-height:1">${winRate}%</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px">Win Rate</div></div>
  </div>`;
  let body='';
  if(_pipelineView==='kanban'){
    // Group opps by stage. Show non-terminal stages by default.
    const visibleStages=_PIPELINE_STAGES.filter(s=>!s.terminal||!_pipelineHideClosed);
    const byStage={};
    visibleStages.forEach(s=>byStage[s.key]=[]);
    // Bucket by the NORMALISED stage ("On-Hold", "closed/won", synced
    // spellings). A stage that matches no column lands in the first one —
    // it used to be counted in the KPIs but shown in no column at all.
    for(const o of opps){
      if(o.status==='lost'&&_pipelineHideClosed)continue;
      const def=_stageDef(o.stage);
      if(byStage[def.key])byStage[def.key].push(o);
      else if(def.terminal&&_pipelineHideClosed)continue;
      else if(visibleStages[0])byStage[visibleStages[0].key].push(o);
    }
    body=`<div style="display:flex;gap:6px;margin-bottom:6px;font-size:11px"><label style="display:flex;align-items:center;gap:6px;color:var(--t2);cursor:pointer"><input type="checkbox" ${_pipelineHideClosed?'checked':''} onchange="_pipelineHideClosed=this.checked;renderPipeline()"> Hide Closed Won/Lost</label></div>
    <div style="display:grid;grid-template-columns:repeat(${visibleStages.length},minmax(220px,1fr));gap:10px;align-items:flex-start;overflow-x:auto">
    ${visibleStages.map(s=>{
      const stageOpps=byStage[s.key]||[];
      const stageValue=stageOpps.reduce((sum,o)=>sum+(Number(o.value)||0),0);
      const cards=stageOpps.sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0)).map(o=>{
        const closeDays=o.closeDate?Math.ceil((+_pd(o.closeDate)-Date.now())/86400000):null;
        const closeLabel=closeDays==null?'':closeDays<0?`<span style="color:var(--red)">${-closeDays}d late</span>`:closeDays===0?'<span style="color:var(--warn)">today</span>':closeDays<=14?`<span style="color:var(--warn)">${closeDays}d</span>`:`${closeDays}d`;
        const taskN=_opportunityTaskCount(o.id);
        return `<div class="cd" style="padding:9px 11px;margin-bottom:6px;border-left:3px solid ${s.color};cursor:pointer" onclick="openOpportunityDetail(${o.id})">
          <div style="font-size:12px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.name||'(unnamed)')}</div>
          ${o.accountName?`<div style="font-size:11px;color:var(--t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.accountName)}</div>`:''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px">
            <span style="color:var(--t2);font-weight:600">${_fmtMoney(o.value||0)}</span>
            <span style="color:var(--t3)">${closeLabel}</span>
          </div>
          ${taskN?`<div style="font-size:11px;color:var(--ac);margin-top:3px">📋 ${taskN} active task${taskN===1?'':'s'}</div>`:''}
        </div>`;
      }).join('')||'<div style="font-size:11px;color:var(--t3);font-style:italic;padding:8px 0;text-align:center">empty</div>';
      return `<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;min-height:300px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${s.color}"></span><span style="font-size:11px;font-weight:700;color:var(--t1)">${esc(s.label)}</span></div>
          <div style="font-size:11px;color:var(--t3)">${stageOpps.length} · ${_fmtMoney(stageValue)}</div>
        </div>
        ${cards}
      </div>`;
    }).join('')}</div>`;
  } else if(_pipelineView==='table'){
    const rows=opps.slice().sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0)).map(o=>{
      const s=_stageDef(o.stage);
      const taskN=_opportunityTaskCount(o.id);
      const closeDays=o.closeDate?Math.ceil((+_pd(o.closeDate)-Date.now())/86400000):null;
      const closeLabel=closeDays==null?'—':closeDays<0?`<span style="color:var(--red)">${o.closeDate} (${-closeDays}d late)</span>`:`${o.closeDate}`;
      return `<tr style="cursor:pointer;border-bottom:1px solid var(--bd1)" onclick="openOpportunityDetail(${o.id})">
        <td style="padding:8px 10px;font-size:12px;color:var(--t1);font-weight:600">${esc(o.name||'(unnamed)')}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--t2)">${esc(o.accountName||'')}</td>
        <td style="padding:8px 10px;font-size:11px"><span style="padding:2px 7px;border-radius:3px;background:color-mix(in srgb,${s.color} 18%,transparent);color:${s.color};font-weight:600">${esc(o.stage||'Lead')}</span></td>
        <td style="padding:8px 10px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${_fmtMoney(o.value||0)}</td>
        <td style="padding:8px 10px;font-size:11px;text-align:right;color:var(--ok)">${_fmtMoney(_weightedValue(o))}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--t2)">${closeLabel}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--t2)">${esc(o.owner||'')}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--t2)">${taskN?taskN+' tasks':''}</td>
      </tr>`;
    }).join('');
    body=`<div class="cd" style="padding:0;overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--s2);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em">
          <th style="padding:8px 10px;text-align:left">Opportunity</th>
          <th style="padding:8px 10px;text-align:left">Account</th>
          <th style="padding:8px 10px;text-align:left">Stage</th>
          <th style="padding:8px 10px;text-align:right">Value</th>
          <th style="padding:8px 10px;text-align:right">Weighted</th>
          <th style="padding:8px 10px;text-align:left">Close</th>
          <th style="padding:8px 10px;text-align:left">Owner</th>
          <th style="padding:8px 10px;text-align:left">Tasks</th>
        </tr></thead>
        <tbody>${rows||'<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--t3);font-size:12px">No opportunities yet. Click <strong>+ New opportunity</strong> to add one.</td></tr>'}</tbody>
      </table>
    </div>`;
  } else { // forecast
    // Group by close month → sum weighted value.
    const months={};
    open.forEach(o=>{
      const m=(o.closeDate||'').slice(0,7);
      if(!m)return;
      months[m]=(months[m]||0)+_weightedValue(o);
    });
    const monthKeys=Object.keys(months).sort();
    const maxMo=Math.max(1,...monthKeys.map(k=>months[k]));
    const bars=monthKeys.length?monthKeys.map(k=>{
      const v=months[k];const pct=Math.round(v/maxMo*100);
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:11px"><span style="min-width:80px;color:var(--t2)">${esc(k)}</span><div style="flex:1;height:14px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#16a34a;border-radius:3px"></div></div><span style="min-width:80px;text-align:right;font-weight:600">${_fmtMoney(v)}</span></div>`;
    }).join(''):'<div style="font-size:11px;color:var(--t3);font-style:italic;text-align:center;padding:20px">Add close dates to your open opportunities to see a monthly forecast.</div>';
    // Stage donut (weighted by stage).
    const byStageW={};
    open.forEach(o=>{byStageW[o.stage||'Lead']=(byStageW[o.stage||'Lead']||0)+_weightedValue(o);});
    const stageEntries=Object.entries(byStageW).sort((a,b)=>b[1]-a[1]);
    const stageTotal=stageEntries.reduce((s,[,v])=>s+v,0)||1;
    let acc=0;
    const stops=stageEntries.map(([k,v])=>{const stageCol=_stageDef(k).color;const start=acc/stageTotal*100;acc+=v;const end=acc/stageTotal*100;return `${stageCol} ${start}% ${end}%`;}).join(',');
    const legend=stageEntries.map(([k,v])=>`<div style="display:flex;align-items:center;gap:7px;font-size:11px;padding:4px 0"><span style="width:9px;height:9px;background:${_stageDef(k).color};border-radius:2px"></span><span style="flex:1">${esc(k)}</span><span style="font-weight:600">${_fmtMoney(v)}</span></div>`).join('');
    body=`<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px">
      <div class="cd" style="padding:13px 15px">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px">📅 Weighted Forecast by Close Month</div>
        ${bars}
      </div>
      <div class="cd" style="padding:13px 15px">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px">🎯 Pipeline by Stage (weighted)</div>
        ${stageEntries.length?`<div style="display:flex;gap:14px;align-items:center"><div style="background:conic-gradient(${stops});width:120px;height:120px;border-radius:50%;flex-shrink:0;mask:radial-gradient(circle,transparent 40%,#000 42%);-webkit-mask:radial-gradient(circle,transparent 40%,#000 42%)"></div><div style="flex:1">${legend}</div></div>`:'<div style="font-size:11px;color:var(--t3);font-style:italic;text-align:center;padding:20px">No open opportunities to forecast.</div>'}
      </div>
    </div>`;
  }
  // ── Reports view: 4 cards in a 2×2 grid ─────────────────────────────────
  if(_pipelineView==='reports'){
    body=_renderPipelineReports(opps,open,won,lost);
  }
  m.innerHTML=header+kpis+body;
  if(r){
    // Right rail: quick add + recent activity.
    const recentWon=won.slice().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,5);
    const overdue=open.filter(o=>o.closeDate&&o.closeDate<_todayStr);
    r.innerHTML=`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:8px">⚡ Quick Actions</div>
      <button class="btn btn-p" style="width:100%;margin-bottom:6px;font-size:11px" onclick="_newOpportunity()">+ New opportunity</button>
      <button class="btn btn-s" style="width:100%;margin-bottom:6px;font-size:11px;justify-content:flex-start;text-align:left" onclick="_pipelineView='kanban';renderPipeline()">📋 Kanban view</button>
      <button class="btn btn-s" style="width:100%;font-size:11px;justify-content:flex-start;text-align:left" onclick="_pipelineView='forecast';renderPipeline()">📈 Forecast</button>
    </div>
    ${overdue.length?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px;border-left:3px solid var(--red)">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--red)">⚠ ${overdue.length} past close date</div>
      ${overdue.slice(0,5).map(o=>`<div class="lr" style="font-size:11px;padding:3px 0;cursor:pointer" onclick="openOpportunityDetail(${o.id})"><span class="rt" style="font-size:11px">${esc(o.name)}</span><span style="color:var(--t3);font-size:11px">${esc(o.closeDate)}</span></div>`).join('')}
    </div>`:''}
    ${recentWon.length?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--ok)">🎉 Recent wins</div>
      ${recentWon.map(o=>`<div class="lr" style="font-size:11px;padding:3px 0;cursor:pointer" onclick="openOpportunityDetail(${o.id})"><span class="rt" style="font-size:11px">${esc(o.name)}</span><span style="color:var(--ok);font-size:11px;font-weight:600">${_fmtMoney(o.value||0)}</span></div>`).join('')}
    </div>`:''}`;
  }
}

// ─── Pipeline Reports view (4 cards) ────────────────────────────────────────
function _pipelineQuota(){
  // Total annual / quarterly target. Configurable via Settings → General.
  // Shape: D.prefs.pipelineQuota = {amount: number, periodLabel: string,
  // coverageTarget: number (typically 3 for 3x)}.
  const q=(D.prefs&&D.prefs.pipelineQuota)||{};
  return {
    amount:Number(q.amount)||0,
    periodLabel:q.periodLabel||'Annual',
    coverageTarget:Number(q.coverageTarget)||3,
  };
}
function _renderPipelineReports(opps,open,won,lost){
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
    ${_reportByCustomer(opps,open,won,lost)}
    ${_reportStageAging(open)}
    ${_reportQuarterlyBooking(open)}
    ${_reportCoverage(open)}
  </div>`;
}
function _reportByCustomer(opps,open,won,lost){
  const byAccount={};
  for(const o of opps){
    const k=o.accountName||'(no account)';
    const slot=byAccount[k]||{name:k,open:0,won:0,lost:0,onhold:0,totalOpen:0,weighted:0,wonValue:0,lastActivity:''};
    if(o.status==='won'){slot.won++;slot.wonValue+=Number(o.value)||0;}
    else if(o.status==='lost')slot.lost++;
    else {
      slot.open++;
      slot.totalOpen+=Number(o.value)||0;
      slot.weighted+=_weightedValue(o);
      if(o.stage==='On-Hold')slot.onhold++;
    }
    if((o.updatedAt||'')>slot.lastActivity)slot.lastActivity=o.updatedAt||'';
    byAccount[k]=slot;
  }
  const rows=Object.values(byAccount).sort((a,b)=>(b.totalOpen+b.weighted)-(a.totalOpen+a.weighted));
  const body=rows.length?rows.map(a=>{
    const winRate=(a.won+a.lost)?Math.round(a.won/(a.won+a.lost)*100):null;
    const winRateLabel=winRate==null?'<span style="color:var(--t3)">—</span>':`<span style="color:${winRate>=50?'var(--ok)':winRate>=25?'var(--warn)':'var(--red)'};font-weight:600">${winRate}%</span>`;
    return `<tr style="border-bottom:1px solid var(--bd1)">
      <td style="padding:6px 8px;font-size:12px;font-weight:600;color:var(--t1)">${esc(a.name)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${a.open}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;font-variant-numeric:tabular-nums">${_fmtMoney(a.totalOpen)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right;color:var(--ok);font-variant-numeric:tabular-nums">${_fmtMoney(a.weighted)}</td>
      <td style="padding:6px 8px;font-size:11px;text-align:right">${winRateLabel}</td>
      <td style="padding:6px 8px;font-size:11px;color:var(--t3);text-align:right">${a.won}W · ${a.lost}L</td>
    </tr>`;
  }).join(''):'<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--t3);font-size:11px">No opportunities to group.</td></tr>';
  return `<div class="cd" style="padding:13px 15px;border-left:3px solid #3b82f6">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:600">🏢 By Customer / Agency</div><div style="font-size:11px;color:var(--t3)">${rows.length} account${rows.length===1?'':'s'} · sorted by total open</div></div>
    <p style="font-size:11px;color:var(--t3);margin:0 0 8px">Where your pipeline lives. Win rate shown when at least one deal has closed.</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:var(--s2);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em">
        <th style="padding:5px 8px;text-align:left">Account</th>
        <th style="padding:5px 8px;text-align:right">Open</th>
        <th style="padding:5px 8px;text-align:right">Total $</th>
        <th style="padding:5px 8px;text-align:right">Weighted</th>
        <th style="padding:5px 8px;text-align:right">Win Rate</th>
        <th style="padding:5px 8px;text-align:right">Track</th>
      </tr></thead><tbody>${body}</tbody>
    </table>
  </div>`;
}
function _reportStageAging(open){
  // "Days in current stage" approximated by (now - updatedAt). Federal sales
  // cycles are long so this is a useful aging proxy without needing a full
  // stage-history audit log on every opp.
  const now=Date.now();
  const daysSince=iso=>iso?Math.max(0,Math.floor((now-_pd(iso).getTime())/86400000)):null;
  const stageBuckets={};
  for(const s of _PIPELINE_STAGES){if(!s.terminal)stageBuckets[s.key]={count:0,daysSum:0,oldest:null};}
  for(const o of open){
    const b=stageBuckets[_stageDef(o.stage).key];if(!b)continue;
    // Days since the deal ENTERED its stage (o.stageAt, set from -229 on).
    // Older manual deals fall back to updatedAt; deals from the retired
    // Smartsheet sync have no reliable date (updatedAt froze at -223), so
    // they are left out rather than all turning "stalled" in December.
    const entered=o.stageAt||(o.source==='smartsheet'?null:o.updatedAt);
    const d=daysSince(entered);if(d==null)continue;
    b.count++;b.daysSum+=d;
    if(!b.oldest||d>b.oldest.days)b.oldest={days:d,opp:o};
  }
  const stageRows=Object.entries(stageBuckets).filter(([,b])=>b.count>0).map(([key,b])=>{
    const avg=Math.round(b.daysSum/b.count);
    const def=_stageDef(key);
    const ageBadge=avg>=90?'<span style="color:var(--red);font-weight:600">⚠ '+avg+'d</span>':avg>=60?'<span style="color:var(--warn);font-weight:600">'+avg+'d</span>':`<span style="color:var(--t2)">${avg}d</span>`;
    return `<tr style="border-bottom:1px solid var(--bd1)">
      <td style="padding:5px 8px;font-size:11px"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${def.color};margin-right:6px"></span>${esc(def.label)}</td>
      <td style="padding:5px 8px;font-size:11px;text-align:right">${b.count}</td>
      <td style="padding:5px 8px;font-size:11px;text-align:right">${ageBadge}</td>
      <td style="padding:5px 8px;font-size:11px;color:var(--t3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.oldest?esc(b.oldest.opp.name):''}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--t3);font-size:11px">No open opportunities.</td></tr>';
  // Stalled list: open opps not updated in 60+ days. Cap to top 8.
  const stalled=open.filter(o=>{const d=daysSince(o.updatedAt);return d!=null&&d>=60;}).sort((a,b)=>(new Date(a.updatedAt||0).getTime())-(new Date(b.updatedAt||0).getTime())).slice(0,8);
  const stalledBody=stalled.length?stalled.map(o=>{
    const d=daysSince(o.updatedAt);
    return `<div class="lr" style="padding:5px 0;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:8px;cursor:pointer" onclick="openOpportunityDetail(${o.id})">
      <span style="font-size:11px;color:var(--t1);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.name||'')}</span>
      <span style="font-size:11px;color:${d>=120?'var(--red)':'var(--warn)'};font-weight:600;flex-shrink:0">${d}d</span>
      <span style="font-size:11px;color:var(--t3);flex-shrink:0">${esc(o.stage||'')}</span>
    </div>`;
  }).join(''):'<div style="font-size:11px;color:var(--t3);font-style:italic;padding:8px 0">No stalled deals — every open opp updated within 60 days.</div>';
  return `<div class="cd" style="padding:13px 15px;border-left:3px solid #f59e0b">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:600">⏱ Stage Aging</div><div style="font-size:11px;color:var(--t3)">Avg days at current stage</div></div>
    <p style="font-size:11px;color:var(--t3);margin:0 0 8px">Where deals get stuck. Aging measured as days since last update (proxy for stage entry).</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
      <thead><tr style="background:var(--s2);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em">
        <th style="padding:5px 8px;text-align:left">Stage</th>
        <th style="padding:5px 8px;text-align:right">Count</th>
        <th style="padding:5px 8px;text-align:right">Avg</th>
        <th style="padding:5px 8px;text-align:left">Oldest</th>
      </tr></thead><tbody>${stageRows}</tbody>
    </table>
    <div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">🚨 Stalled (60d+) · ${stalled.length}</div>
    ${stalledBody}
  </div>`;
}
function _reportQuarterlyBooking(open){
  const now=new Date();
  const horizon=_pd(now);horizon.setDate(now.getDate()+90);
  const horizonStr=_ymd(horizon);
  const todayStr=_todayStr;
  const inWindow=open.filter(o=>o.closeDate&&o.closeDate>=todayStr&&o.closeDate<=horizonStr);
  const byMonth={};
  for(const o of inWindow){
    const m=(o.closeDate||'').slice(0,7);
    const slot=byMonth[m]||{value:0,weighted:0,count:0,opps:[]};
    slot.value+=Number(o.value)||0;
    slot.weighted+=_weightedValue(o);
    slot.count++;
    slot.opps.push(o);
    byMonth[m]=slot;
  }
  const months=Object.keys(byMonth).sort();
  const maxW=Math.max(1,...months.map(m=>byMonth[m].weighted));
  const totalWeighted=months.reduce((s,m)=>s+byMonth[m].weighted,0);
  const totalValue=months.reduce((s,m)=>s+byMonth[m].value,0);
  const totalCount=months.reduce((s,m)=>s+byMonth[m].count,0);
  const bars=months.length?months.map(m=>{
    const slot=byMonth[m];
    const pct=Math.round(slot.weighted/maxW*100);
    const mLabel=_pd(m+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'});
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px">
        <span style="font-weight:600;color:var(--t1)">${esc(mLabel)}</span>
        <span style="color:var(--t3)">${slot.count} deal${slot.count===1?'':'s'} · ${_fmtMoney(slot.value)} total · <strong style="color:var(--ok)">${_fmtMoney(slot.weighted)}</strong></span>
      </div>
      <div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#10b981;border-radius:4px"></div></div>
    </div>`;
  }).join(''):'<div style="font-size:11px;color:var(--t3);font-style:italic;padding:20px;text-align:center">No open deals with close dates in the next 90 days. Set close dates on your opportunities to populate this forecast.</div>';
  return `<div class="cd" style="padding:13px 15px;border-left:3px solid #10b981">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:600">📅 Quarterly Booking (next 90d)</div><div style="font-size:11px;color:var(--t3)">${totalCount} deal${totalCount===1?'':'s'}</div></div>
    <p style="font-size:11px;color:var(--t3);margin:0 0 10px">Open deals closing in the next 90 days. Use this as your Q forecast — weighted is the expected commit.</p>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 11px;background:color-mix(in srgb,#10b981 10%,transparent);border-radius:6px;margin-bottom:10px">
      <div style="font-size:11px;color:var(--t2)">Q forecast</div>
      <div style="text-align:right"><div style="font-size:16px;font-weight:700;color:#10b981">${_fmtMoney(totalWeighted)}</div><div style="font-size:11px;color:var(--t3)">weighted · ${_fmtMoney(totalValue)} unweighted</div></div>
    </div>
    ${bars}
  </div>`;
}
// The quota's period as local days: this year / half / quarter / month.
function _quotaWindow(label){
  const n=new Date(),y=n.getFullYear(),m=n.getMonth();
  let s,e;
  if(label==='Monthly'){s=new Date(y,m,1);e=new Date(y,m+1,0);}
  else if(label==='Quarterly'){const q0=Math.floor(m/3)*3;s=new Date(y,q0,1);e=new Date(y,q0+3,0);}
  else if(label==='Half-Year'){const h0=m<6?0:6;s=new Date(y,h0,1);e=new Date(y,h0+6,0);}
  else{s=new Date(y,0,1);e=new Date(y,11,31);}
  return {start:_ymd(s),end:_ymd(e)};
}
// Coverage = open pipeline CLOSING IN THE QUOTA PERIOD ÷ what is still left
// to win in it. It used to divide all open pipeline (far-future and On-Hold
// deals included) by a quarterly or monthly quota.
function _reportCoverage(openAll){
  const q=_pipelineQuota();
  const win=_quotaWindow(q.periodLabel);
  const inWin=d=>!!d&&d>=win.start&&d<=win.end;
  const open=openAll.filter(o=>inWin(o.closeDate)&&_stageDef(o.stage).key!=='On-Hold');
  const wonValue=_opps().filter(o=>o.status==='won'&&inWin(_dayOf(o.wonAt||o.closeDate))).reduce((s,o)=>s+(Number(o.value)||0),0);
  const remaining=Math.max(0,q.amount-wonValue);
  const totalOpen=open.reduce((s,o)=>s+(Number(o.value)||0),0);
  const totalWeighted=open.reduce((s,o)=>s+_weightedValue(o),0);
  const coverage=q.amount>0?(remaining>0?totalOpen/remaining:Infinity):null;
  const weightedCoverage=q.amount>0?(remaining>0?totalWeighted/remaining:Infinity):null;
  const outside=openAll.length-open.length;
  const target=q.coverageTarget||3;
  const status=coverage==null?'unset':coverage>=target?'healthy':coverage>=target*0.6?'caution':'gap';
  const statusColor={unset:'#64748b',healthy:'#10b981',caution:'#f59e0b',gap:'#ef4444'}[status];
  const statusLabel={unset:'Quota not set',healthy:'Healthy',caution:'Light',gap:'Gap'}[status];
  const gaugePct=coverage==null?0:Math.min(100,Math.round((coverage/target)*100));
  const body=q.amount<=0?
    `<div style="text-align:center;padding:14px 8px">
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px">Set your ${esc(q.periodLabel)} revenue target to see coverage.</div>
      <button class="btn btn-p" style="font-size:11px" onclick="_openPipelineQuotaSettings()">⚙ Configure quota</button>
    </div>`
    :`<div style="text-align:center;margin-bottom:12px">
      <div style="font-size:28px;font-weight:800;color:${statusColor};line-height:1">${isFinite(coverage)?coverage.toFixed(1)+'x':'✓ met'}</div>
      <div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-top:3px">coverage · target ${target}x · ${esc(statusLabel)}</div>
    </div>
    <div style="height:10px;background:var(--s3);border-radius:5px;overflow:hidden;margin-bottom:10px"><div style="height:100%;width:${gaugePct}%;background:${statusColor};border-radius:5px"></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
      <div style="padding:8px;background:var(--s3);border-radius:5px"><div style="color:var(--t3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">${esc(q.periodLabel)} Target</div><div style="font-size:14px;font-weight:700;color:var(--t1);margin-top:2px">${_fmtMoney(q.amount)}</div></div>
      <div style="padding:8px;background:var(--s3);border-radius:5px"><div style="color:var(--t3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Pipeline</div><div style="font-size:14px;font-weight:700;color:var(--t1);margin-top:2px">${_fmtMoney(totalOpen)}</div></div>
      <div style="padding:8px;background:var(--s3);border-radius:5px"><div style="color:var(--t3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Weighted</div><div style="font-size:14px;font-weight:700;color:var(--ok);margin-top:2px">${_fmtMoney(totalWeighted)}</div></div>
      <div style="padding:8px;background:var(--s3);border-radius:5px"><div style="color:var(--t3);font-size:11px;text-transform:uppercase;letter-spacing:.04em">Weighted Cov.</div><div style="font-size:14px;font-weight:700;color:var(--t1);margin-top:2px">${weightedCoverage==null?'—':isFinite(weightedCoverage)?weightedCoverage.toFixed(1)+'x':'met'}</div></div>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:10px;text-align:center">Deals closing ${esc(win.start)} → ${esc(win.end)}${wonValue?` · ${_fmtMoney(wonValue)} already won counts toward the target`:''}${outside?` · ${outside} open deal${outside===1?'':'s'} outside the period or on hold not counted`:''}. ${target}x is the usual rule of thumb.</div>
    <div style="margin-top:8px;text-align:center"><button class="btn btn-s" style="font-size:11px" onclick="_openPipelineQuotaSettings()">⚙ Adjust quota</button></div>`;
  return `<div class="cd" style="padding:13px 15px;border-left:3px solid ${statusColor}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:600">🎯 Pipeline Coverage</div><div style="font-size:11px;color:${statusColor};font-weight:600">${esc(statusLabel)}</div></div>
    <p style="font-size:11px;color:var(--t3);margin:0 0 10px">Total open pipeline value divided by your revenue quota. The 3x rule of thumb assumes you'll win roughly a third of your pipeline.</p>
    ${body}
  </div>`;
}
function _openPipelineQuotaSettings(){
  const q=_pipelineQuota();
  const m=document.getElementById('modal-content');
  if(!m){toast({type:'warn',title:'Modal not available'});return;}
  m.innerHTML=`<div style="padding:16px;max-width:420px">
    <h2 style="font-size:14px;font-weight:650;margin:0 0 6px">🎯 Pipeline Quota</h2>
    <p style="font-size:11px;color:var(--t3);margin:0 0 14px">Sets the revenue target the Pipeline Coverage report compares against.</p>
    <div style="margin-bottom:10px"><div style="font-size:11px;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em">Target amount ($)</div><input class="inp" id="quota-amt" type="number" value="${q.amount||''}" placeholder="e.g. 5000000" style="font-size:12px"></div>
    <div style="margin-bottom:10px"><div style="font-size:11px;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em">Period label</div><select class="inp" id="quota-period" style="font-size:12px">
      ${['Annual','Quarterly','Monthly','Half-Year'].map(p=>`<option value="${p}" ${q.periodLabel===p?'selected':''}>${p}</option>`).join('')}
    </select></div>
    <div style="margin-bottom:10px"><div style="font-size:11px;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em">Coverage target (default 3x)</div><input class="inp" id="quota-cov" type="number" step="0.5" min="1" max="10" value="${q.coverageTarget||3}" style="font-size:12px"></div>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid var(--bd1)">
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_savePipelineQuota()">💾 Save</button>
    </div>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function _savePipelineQuota(){
  const amt=Number(document.getElementById('quota-amt').value)||0;
  const period=document.getElementById('quota-period').value||'Annual';
  const cov=Math.max(1,Math.min(10,Number(document.getElementById('quota-cov').value)||3));
  D.prefs=D.prefs||{};
  D.prefs.pipelineQuota={amount:amt,periodLabel:period,coverageTarget:cov};
  save('prefs');
  closeModal();
  toast({type:'success',title:`✓ Quota set: ${_fmtMoney(amt)} (${period}, ${cov}x target)`,duration:2400});
  if(curScreen==='pipeline')renderPipeline();
}

function _newOpportunity(){
  const id=Date.now();
  const opp={
    id,
    name:'New Opportunity',
    accountName:'',
    stage:'Lead',
    value:0,
    probability:null, // null = use stage default
    closeDate:'',
    owner:(D.creds&&D.creds.userName)||'',
    contact:'',
    notes:'',
    status:'open',
    linkedTaskIds:[],
    source:'manual',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
  };
  _opps().unshift(opp);
  save('opportunities');
  openOpportunityDetail(id,{editMode:true});
  if(curScreen==='pipeline')renderPipeline();
}

function openOpportunityDetail(oppId,opts){
  const o=_opps().find(x=>String(x.id)===String(oppId));
  if(!o){toast({type:'warn',title:'Opportunity not found'});return;}
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  if(!d||!ov)return;
  const editMode=opts&&opts.editMode;
  const stage=_stageDef(o.stage);
  const linkedTasks=(D.tasks||[]).filter(t=>String(t.linkedOpportunityId||'')===String(o.id));
  const linkedOpen=linkedTasks.filter(t=>t.status!=='Done');
  const linkedDone=linkedTasks.filter(t=>t.status==='Done');
  const taskRow=t=>`<div class="lr" style="padding:6px 0;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="closeDrawer();setTimeout(()=>openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)})),120)">
    <div class="chk ${t.status==='Done'?'on':''}" onclick="event.stopPropagation();(t=>setTaskStatus(t,t.status==='Done'?'Not Started':'Done'))(D.tasks.find(x=>x.id==${_tidLit(t.id)}));openOpportunityDetail(${_tidLit(o.id)})"></div>
    <span class="rt" style="font-size:12px;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span>
    <span class="pill ${pillClass?pillClass(t.priority):''}" style="font-size:11px">${esc(t.priority||'')}</span>
    <span style="font-size:11px;color:var(--t3)">${esc(t.due||'')}</span>
  </div>`;
  // Stage progression buttons — quick-advance through non-terminal stages.
  const stageButtons=_PIPELINE_STAGES.map(s=>{
    const active=s.key===o.stage;
    return `<button class="btn btn-s" style="height:24px;font-size:11px;padding:0 9px;background:${active?s.color:'transparent'};color:${active?'#fff':s.color};border-color:${s.color}" onclick="_setOpportunityStage(${o.id},'${s.key}')">${esc(s.label)}</button>`;
  }).join('');
  // Form fields — always editable inline.
  const field=(label,id,type,value,extra)=>{
    if(type==='textarea')return `<div style="margin-bottom:10px"><div style="font-size:11px;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div><textarea class="inp" id="${id}" style="min-height:60px;font-size:12px" ${extra||''}>${esc(value||'')}</textarea></div>`;
    return `<div style="margin-bottom:10px"><div style="font-size:11px;color:var(--t3);margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div><input class="inp" id="${id}" type="${type}" style="font-size:12px" value="${esc(value??'')}" ${extra||''}></div>`;
  };
  d.innerHTML=`<h2 style="display:flex;align-items:center;gap:8px;margin:0 0 6px"><span style="width:11px;height:11px;border-radius:3px;background:${stage.color}"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(o.name||'(unnamed)')}</span><button class="close" onclick="closeDrawer()">✕</button></h2>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      <span class="pill" style="background:color-mix(in srgb,${stage.color} 18%,transparent);color:${stage.color};font-weight:700">${esc(stage.label)}</span>
      <span style="font-size:11px;color:var(--t2);align-self:center;font-weight:600">💰 ${_fmtMoney(o.value||0)}</span>
      <span style="font-size:11px;color:var(--ok);align-self:center">⚖ ${_fmtMoney(_weightedValue(o))} weighted</span>
      ${o.closeDate?`<span style="font-size:11px;color:var(--t3);align-self:center">📅 ${esc(o.closeDate)}</span>`:''}
      ${o.source==='smartsheet'?`<span class="pill" style="background:color-mix(in srgb,#1f6feb 16%,transparent);color:#1f6feb;font-weight:600;font-size:11px" title="Auto-synced from Smartsheet">📊 Synced</span>`:''}
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Stage</div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px">${stageButtons}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${field('Name','opp-name','text',o.name)}
      ${field('Account / Customer','opp-account','text',o.accountName)}
      ${field('Value ($)','opp-value','number',o.value,'min="0" step="100"')}
      ${field('Probability % (blank = stage default)','opp-prob','number',o.probability,'min="0" max="100"')}
      ${field('Close Date','opp-close','date',o.closeDate)}
      ${field('Owner','opp-owner','text',o.owner)}
      ${field('Primary Contact','opp-contact','text',o.contact)}
      <div></div>
    </div>
    ${field('Notes','opp-notes','textarea',o.notes)}
    <div style="display:flex;gap:6px;margin-bottom:14px">
      <button class="btn btn-p" onclick="_saveOpportunityFields(${o.id})">💾 Save changes</button>
      <button class="btn btn-s" style="color:var(--ok);border-color:var(--ok)" onclick="_setOpportunityStage(${o.id},'Closed Won')">🎉 Mark Won</button>
      <button class="btn btn-s" style="color:var(--red);border-color:var(--red)" onclick="_setOpportunityStage(${o.id},'Closed Lost')">✕ Mark Lost</button>
      <button class="btn btn-d" style="margin-left:auto" onclick="_deleteOpportunity(${o.id})">${_icon('trash',12,'currentColor')} Delete</button>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Tasks to win this opportunity (${linkedOpen.length})</div>
    ${linkedOpen.length?linkedOpen.map(taskRow).join(''):'<p style="font-size:11px;color:var(--t3);padding:6px 0;font-style:italic">No active tasks linked yet — click below to add one.</p>'}
    ${linkedDone.length?`<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 5px">Done (${linkedDone.length})</div>${linkedDone.map(taskRow).join('')}`:''}
    <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_newTaskForOpportunity(${o.id})">+ New task for this opportunity</button>
      <button class="btn btn-s" onclick="_aiOpportunityNextSteps(${o.id})" style="color:var(--purp)" title="AI-suggested next 3 actions for advancing this deal">✨ AI: Next steps</button>
    </div>`;
  ov.classList.add('show');
}
function _readOpportunityForm(o){
  if(!document.getElementById('opp-name'))return false;
  const g=id=>(document.getElementById(id)||{}).value||'';
  o.name=g('opp-name').trim()||'(unnamed)';
  o.accountName=g('opp-account').trim();
  o.value=Number(g('opp-value'))||0;
  const prob=g('opp-prob');o.probability=prob===''?null:Math.max(0,Math.min(100,Number(prob)||0));
  o.closeDate=g('opp-close')||'';
  o.owner=g('opp-owner').trim();
  o.contact=g('opp-contact').trim();
  o.notes=g('opp-notes')||'';
  return true;
}
function _saveOpportunityFields(oppId){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  const g=id=>(document.getElementById(id)||{}).value;
  o.name=g('opp-name').trim()||'(unnamed)';
  o.accountName=g('opp-account').trim();
  o.value=Number(g('opp-value'))||0;
  const prob=g('opp-prob');o.probability=prob===''?null:Math.max(0,Math.min(100,Number(prob)||0));
  o.closeDate=g('opp-close')||'';
  o.owner=g('opp-owner').trim();
  o.contact=g('opp-contact').trim();
  o.notes=g('opp-notes')||'';
  o.updatedAt=new Date().toISOString();
  save('opportunities');
  toast({type:'success',title:'✓ Saved',duration:1500});
  openOpportunityDetail(oppId);
  if(curScreen==='pipeline')renderPipeline();
}
function _setOpportunityStage(oppId,stage){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  // Keep what was typed in the drawer: the re-render below used to throw
  // unsaved field edits away.
  _readOpportunityForm(o);
  if(_stageDef(o.stage).key!==_stageDef(stage).key){
    const at=new Date().toISOString();
    o.stageAt=at;
    o.stageHistory=Array.isArray(o.stageHistory)?o.stageHistory.slice(-49):[];
    o.stageHistory.push({stage,at});
  }
  o.stage=stage;
  const def=_stageDef(stage);
  if(def.outcome==='won'){o.status='won';o.wonAt=new Date().toISOString();}
  else if(def.outcome==='lost'){o.status='lost';o.lostAt=new Date().toISOString();}
  else {o.status='open';delete o.wonAt;delete o.lostAt;}
  o.updatedAt=new Date().toISOString();
  save('opportunities');
  openOpportunityDetail(oppId);
  if(curScreen==='pipeline')renderPipeline();
  toast({type:def.outcome==='won'?'success':'info',title:`Stage → ${stage}`,duration:1800});
}
function _deleteOpportunity(oppId){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  if(!confirm(`Delete "${o.name}"? Linked tasks will keep their linkedOpportunityId but won't render under any opportunity.`))return;
  D.opportunities=_opps().filter(x=>String(x.id)!==String(oppId));
  save('opportunities');
  closeDrawer();
  if(curScreen==='pipeline')renderPipeline();
  toast({type:'info',title:'Opportunity deleted',duration:1500});
}
// Open the Full-Add task modal pre-filled with linkedOpportunityId so the
// resulting task automatically surfaces under the opp drawer.
function _newTaskForOpportunity(oppId){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  // Use openFA('task') if present, otherwise quick-create.
  if(typeof openFA==='function'){
    // openFA pre-fills via window._faPrefill so we can stash the opp id.
    window._faPrefill={linkedOpportunityId:String(o.id),title:'',notes:`Linked to opportunity: ${o.name}`};
    openFA('task');
    return;
  }
  // Fallback: quick create directly.
  const id=Date.now();
  D.tasks.unshift({id,title:`Task for: ${o.name}`,status:'Not Started',priority:'Medium',linkedOpportunityId:String(o.id),createdAt:new Date().toISOString(),createdBy:(D.creds&&D.creds.userName)||''});
  save('tasks');
  closeDrawer();
  setTimeout(()=>openDrawer('task',D.tasks.find(x=>x.id===id)),120);
}
async function _aiOpportunityNextSteps(oppId){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  const {provider,configured}=_getAIConfig?_getAIConfig():{};
  if(!configured){toast({type:'warn',title:'AI key missing'});return;}
  const m=document.getElementById('modal-content');
  if(!m){toast({type:'warn',title:'Modal not available'});return;}
  m.innerHTML=`<div style="padding:14px 16px;max-width:520px"><div style="font-size:14px;font-weight:650;margin-bottom:6px">✨ Next steps for "${esc(o.name)}"</div><div style="font-size:11px;color:var(--t3)">Reading your pipeline + stage history — usually takes ~8s.</div></div>`;
  document.getElementById('modal-capture').classList.add('show');
  try{
    const linkedTitles=(D.tasks||[]).filter(t=>String(t.linkedOpportunityId||'')===String(o.id)).map(t=>`${t.status==='Done'?'[done] ':''}${t.title}`).slice(0,15);
    const stage=_stageDef(o.stage);
    const snapshot={
      name:o.name,
      account:o.accountName,
      stage:o.stage,
      stageDefaultProbability:stage.probability,
      value:o.value,
      closeDate:o.closeDate||null,
      owner:o.owner,
      contact:o.contact,
      notes:(o.notes||'').slice(0,400),
      existingTasks:linkedTitles,
    };
    const sys=`You are a sales coach helping a COO advance a B2B opportunity. Read the deal snapshot and recommend the next 3 actions to move it to the next stage. Output STRICTLY one JSON object, no markdown:
{
  "headline": "<one sentence assessment of the deal's state, 15-25 words>",
  "actions": [ {"title":"<concrete action, ~10-15 words>", "owner":"<who does it>", "why":"<one short sentence on why this advances the deal>"} ]
}
Pick exactly 3 actions. Avoid actions already in existingTasks. Be specific (mention the actual account name where possible).`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:JSON.stringify(snapshot),provider:provider||'manus'},'mutation');
    const raw=String(res?.result||res?.text||'').trim();
    const mm=raw.match(/\{[\s\S]*\}/);if(!mm)throw new Error('AI returned no JSON');
    const out=JSON.parse(mm[0]);
    const actionRows=(out.actions||[]).slice(0,3).map((a,i)=>`<div style="padding:9px 11px;background:var(--s3);border-radius:6px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px"><div style="font-size:12px;color:var(--t1);font-weight:600">${i+1}. ${esc(a.title||'')}</div><button class="btn btn-s" style="height:22px;font-size:11px;color:var(--ac)" onclick='_addAiActionToOpp(${oppId},${JSON.stringify(a).replace(/"/g,"&quot;")})'>+ Add task</button></div>
      ${a.owner?`<div style="font-size:11px;color:var(--t3);margin-top:2px">👤 ${esc(a.owner)}</div>`:''}
      ${a.why?`<div style="font-size:11px;color:var(--t2);margin-top:3px">${esc(a.why)}</div>`:''}
    </div>`).join('');
    m.innerHTML=`<div style="padding:16px;max-width:560px">
      <h2 style="font-size:14px;font-weight:650;margin:0 0 6px">✨ Next steps · ${esc(o.name)}</h2>
      ${out.headline?`<div style="font-size:13px;color:var(--t1);font-style:italic;padding:9px 11px;background:color-mix(in srgb,var(--purp) 10%,transparent);border-left:3px solid var(--purp);border-radius:4px;margin-bottom:10px">"${esc(out.headline)}"</div>`:''}
      ${actionRows}
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;padding-top:10px;border-top:1px solid var(--bd1)">
        <button class="btn btn-s" onclick="_aiOpportunityNextSteps(${oppId})">↻ Refresh</button>
        <button class="btn btn-p" onclick="closeModal()">Done</button>
      </div>
    </div>`;
  }catch(e){
    m.innerHTML=`<div style="padding:14px 16px;max-width:480px"><div style="font-size:13px;font-weight:600;color:var(--red)">AI failed</div><div style="font-size:11px;color:var(--t2);margin-top:6px">${esc(e.message||String(e))}</div><div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div></div>`;
  }
}
function _addAiActionToOpp(oppId,actionJson){
  const o=_opps().find(x=>String(x.id)===String(oppId));if(!o)return;
  const a=typeof actionJson==='string'?JSON.parse(actionJson):actionJson;
  const id=Date.now()+Math.floor(Math.random()*1000);
  D.tasks.unshift({
    id,
    title:a.title||'(unnamed)',
    status:'Not Started',
    priority:'Medium',
    notes:a.why||'',
    assignedTo:a.owner||'',
    linkedOpportunityId:String(o.id),
    createdAt:new Date().toISOString(),
    createdBy:(D.creds&&D.creds.userName)||'',
  });
  save('tasks');
  toast({type:'success',title:`✓ Added "${(a.title||'').slice(0,40)}"`,duration:1800});
  // Re-render the opp drawer so the new task appears.
  setTimeout(()=>openOpportunityDetail(oppId),120);
}

// ─── Push-queue preview drawer ──────────────────────────────────────────────
// Module-scope selection set, keyed "source:externalId". Persists across
// re-renders of the drawer (toggling one row shouldn't drop the others).
let _pushQueueSel=new Set();
function _pushQueueKey(et){return et.source+':'+et.externalId;}
function _togglePushQueueRow(key){
  if(_pushQueueSel.has(key))_pushQueueSel.delete(key);else _pushQueueSel.add(key);
  _refreshPushQueueFooter();
}
function _refreshPushQueueFooter(){
  const f=document.getElementById('push-queue-footer');
  if(!f)return;
  const sel=_pushQueueSel.size;
  f.querySelectorAll('[data-push-sel-count]').forEach(el=>{el.textContent=sel;});
  const selBtn=f.querySelector('[data-push-sel-btn]');
  if(selBtn){
    selBtn.style.display=sel?'':'none';
    selBtn.textContent=`⬆ Push selected (${sel})`;
  }
}
function _pushQueueSelectAll(){
  _pushQueueSel.clear();
  (Array.isArray(D.externalTasks)?D.externalTasks:[])
    .filter(et=>!(et.override&&et.override.tombstoned)&&et.override&&et.override.pendingStatus)
    .forEach(et=>_pushQueueSel.add(_pushQueueKey(et)));
  openPushQueueDrawer();
}
function _pushQueueSelectClear(){
  _pushQueueSel.clear();
  openPushQueueDrawer();
}
function openPushQueueDrawer(){
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  if(!d||!ov)return;
  const rows=(Array.isArray(D.externalTasks)?D.externalTasks:[])
    .filter(et=>!(et.override&&et.override.tombstoned)&&et.override&&et.override.pendingStatus);
  // Drop selections that no longer correspond to a pending row (e.g. dropped
  // since the drawer was last opened).
  const validKeys=new Set(rows.map(_pushQueueKey));
  for(const k of Array.from(_pushQueueSel))if(!validKeys.has(k))_pushQueueSel.delete(k);
  const body=rows.length?rows.map(et=>{
    const ovr=et.override||{};
    const srcLabel=et.source==='smartsheet'?'CF':'LSI';
    const srcColor=et.source==='smartsheet'?'#1f6feb':'#9333ea';
    const key=_pushQueueKey(et);
    const checked=_pushQueueSel.has(key);
    return `<div class="lr" style="padding:9px 11px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px;${checked?'background:color-mix(in srgb,var(--ac) 8%,transparent)':''}">
      <div class="chk ${checked?'on':''}" style="flex-shrink:0" onclick="_togglePushQueueRow('${_jsAttr(key)}');this.classList.toggle('on');this.parentElement.style.background=this.classList.contains('on')?'color-mix(in srgb,var(--ac) 8%,transparent)':''"></div>
      <span style="display:inline-block;padding:2px 6px;border-radius:3px;background:${srcColor};color:#fff;font-size:11px;font-weight:600;letter-spacing:.4px">${srcLabel}</span>
      <span style="flex:1;font-size:12px;color:var(--t1);min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(et.title||'')}</span>
      <span style="font-size:11px;color:var(--t3)">${esc(et.status||'')}</span>
      <span style="font-size:11px;color:var(--ac);font-weight:600">→ ${esc(ovr.pendingStatus||'')}</span>
      <button class="btn btn-s" style="height:22px;font-size:11px" onclick="_dropPushItem('${_jsAttr(et.source)}','${_jsAttr(et.externalId)}')" title="Drop from queue">✕</button>
    </div>`;
  }).join(''):`<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px">No pending pushes — every status change has been delivered.</div>`;
  d.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid var(--bd1)">
    <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:16px;font-weight:650">⬆ Push Queue (${rows.length})</h2><button class="btn btn-s" onclick="closeDrawer()">✕</button></div>
    <p style="font-size:11px;color:var(--t2);margin-top:4px">Status changes saved locally, waiting to be written back to the source. Tick rows to push a subset, or use "Push all" to flush everything. Click ✕ to drop a row without pushing.</p>
    ${rows.length?`<div style="display:flex;gap:6px;margin-top:6px;font-size:11px"><button class="btn btn-s" style="height:22px;font-size:11px" onclick="_pushQueueSelectAll()">☑ Select all</button><button class="btn btn-s" style="height:22px;font-size:11px" onclick="_pushQueueSelectClear()">☐ Clear selection</button></div>`:''}
  </div>
  <div style="overflow-y:auto;max-height:60vh">${body}</div>
  ${rows.length?`<div id="push-queue-footer" style="padding:12px 16px;border-top:1px solid var(--bd1);display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button>
    <button class="btn btn-p" data-push-sel-btn style="background:#f97316;border-color:#f97316;display:${_pushQueueSel.size?'':'none'}" onclick="_flushPushQueueSelected()">⬆ Push selected (<span data-push-sel-count>${_pushQueueSel.size}</span>)</button>
    <button class="btn btn-p" style="background:#f97316;border-color:#f97316" onclick="_flushPushQueue()">⬆ Push all ${rows.length}</button>
  </div>`:''}`;
  ov.classList.add('show');
  d.classList.add('show');
}
async function _flushPushQueueSelected(){
  if(!_pushQueueSel.size)return;
  const only=Array.from(_pushQueueSel).map(k=>{const i=k.indexOf(':');return {source:k.slice(0,i),externalId:k.slice(i+1)};});
  try{
    toast({type:'info',title:`Pushing ${only.length} change(s)…`,duration:1500});
    const res=await _trpc('externalSources.pushPendingChanges',{only},'mutation');
    await loadExternalTasks();
    _pushQueueSel.clear();
    closeDrawer();
    toast({type:'success',title:`✓ Pushed ${res&&res.pushed||0} change(s)`,duration:2400});
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(e){
    toast({type:'warn',title:'Push failed',msg:e.message||String(e),duration:4000});
  }
}
async function _flushPushQueue(){
  try{
    toast({type:'info',title:'Pushing queue…',duration:1500});
    const res=await _trpc('externalSources.pushPendingChanges',undefined,'mutation');
    await loadExternalTasks();
    closeDrawer();
    toast({type:'success',title:`✓ Pushed ${res&&res.pushed||0} change(s)`,duration:2400});
    if(typeof renderScreen==='function'&&typeof curScreen!=='undefined')renderScreen(curScreen);
  }catch(e){
    toast({type:'warn',title:'Push failed',msg:e.message||String(e),duration:4000});
  }
}
async function _dropPushItem(source,externalId){
  try{
    await _trpc('externalSources.upsertOverride',{source,externalId,patch:{pendingStatus:null}},'mutation');
    await loadExternalTasks();
    openPushQueueDrawer();
  }catch(e){toast({type:'warn',title:'Drop failed',msg:e.message||String(e)});}
}

// ─── Saved Command Center views ─────────────────────────────────────────────
// A saved view captures the active hat (and, when present, a future filter set
// stored under `extra`). Persisted in D.prefs.savedCCViews so they sync across
// devices. Pin-to-Home would clone the latest briefing or the current at-risk
// list onto the Home dashboard, but is deferred — for now the views just one-
// click restore the hat.
function _saveCurrentCCView(){
  const name=prompt('Name this view (e.g. "CF Recruiting overdue", "LSI shipping"):',(_ccHat()==='all'?'All hats':_ccHat().toUpperCase())+' view');
  if(!name||!name.trim())return;
  D.prefs=D.prefs||{};
  D.prefs.savedCCViews=Array.isArray(D.prefs.savedCCViews)?D.prefs.savedCCViews:[];
  // Capture the full filter state, not just the hat. _taskProjectFilter,
  // _taskAssigneeFilter, _taskPriorityFilter are module-scope on Tasks; they
  // persist across navigations so we can grab them right here.
  D.prefs.savedCCViews.unshift({
    id:Date.now(),
    name:name.trim(),
    hat:_ccHat(),
    projectFilter:_taskProjectFilter||null,
    assigneeFilter:_taskAssigneeFilter||null,
    priorityFilter:(_taskPriorityFilter&&_taskPriorityFilter!=='All')?_taskPriorityFilter:null,
  });
  // Cap at 12.
  if(D.prefs.savedCCViews.length>12)D.prefs.savedCCViews.length=12;
  save('prefs');
  toast({type:'success',title:`⭐ Saved "${name.trim()}"`,duration:1800});
  renderCommandCenter();
}
function _applySavedCCView(id){
  const v=((D.prefs&&D.prefs.savedCCViews)||[]).find(x=>x.id===id);
  if(!v)return;
  // Restore Tasks-page filters first so when the hat-change re-renders
  // anything that reads them (drill-through chips), they're already correct.
  _taskProjectFilter=v.projectFilter||null;
  _taskAssigneeFilter=v.assigneeFilter||null;
  _taskPriorityFilter=v.priorityFilter||'All';
  setCcContext(v.hat||'all'); // re-renders Command Center
  // If the view captured a Tasks-only filter (project or assignee), jumping
  // straight to Tasks is more useful than landing on Command Center where
  // those filters don't visibly apply.
  if(v.projectFilter||v.assigneeFilter){
    setTimeout(()=>{ if(typeof nav==='function')nav('tasks'); },50);
  }
}
function _deleteSavedCCView(id){
  if(!confirm('Delete this saved view?'))return;
  D.prefs.savedCCViews=(D.prefs.savedCCViews||[]).filter(v=>v.id!==id);
  save('prefs');
  if(curScreen==='command')renderCommandCenter();
  _openSavedCCViews();
}
function _renameSavedCCView(id){
  const v=((D.prefs&&D.prefs.savedCCViews)||[]).find(x=>x.id===id);
  if(!v)return;
  const next=prompt('New name:',v.name);
  if(!next||!next.trim())return;
  v.name=next.trim();save('prefs');
  if(curScreen==='command')renderCommandCenter();
  _openSavedCCViews();
}
function _openSavedCCViews(){
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  if(!d||!ov)return;
  const list=(D.prefs&&D.prefs.savedCCViews)||[];
  const rows=list.length?list.map(v=>{
    const hatLabel=v.hat==='all'?'All hats':v.hat.toUpperCase();
    const color=v.hat==='cf'?'#1f6feb':v.hat==='lsi'?'#9333ea':v.hat==='personal'?'#10b981':'#f59e0b';
    // Build extra-filter chips so the user can see what each view captures.
    const extras=[];
    if(v.projectFilter)extras.push('📁 '+v.projectFilter);
    if(v.assigneeFilter)extras.push('👤 '+v.assigneeFilter);
    if(v.priorityFilter)extras.push('★ '+v.priorityFilter);
    const detail=`Hat: ${esc(hatLabel)}${extras.length?' · '+extras.map(esc).join(' · '):''}`;
    // Icon prefix: 🎯 when view captures drill-through filters (project /
    // assignee / priority), 🪪 when it's hat-only. Helps the user pick
    // between "open my CF cockpit" and "open my CF Recruiting filter" at a
    // glance from a long list.
    const hasFilters=v.projectFilter||v.assigneeFilter||v.priorityFilter;
    const icon=hasFilters?'🎯':'🪪';
    return `<div class="lr" style="padding:10px 12px;border-bottom:1px solid var(--bd1);display:flex;align-items:center;gap:9px;cursor:pointer" onclick="_applySavedCCView(${v.id});closeDrawer()">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="font-size:14px;flex-shrink:0" title="${hasFilters?'View captures drill-through filters':'View captures the hat only'}">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--t1);font-weight:600">${esc(v.name)}</div>
        <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${detail}</div>
      </div>
      <button class="btn btn-s" style="height:22px;font-size:11px" onclick="event.stopPropagation();_renameSavedCCView(${v.id})" title="Rename">✏</button>
      <button class="btn btn-d" style="height:22px;font-size:11px" onclick="event.stopPropagation();_deleteSavedCCView(${v.id})" title="Delete">✕</button>
    </div>`;
  }).join(''):'<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px">No saved views yet. Pick a hat + drill into a project / assignee, then click ⭐ Save view to capture it.</div>';
  d.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid var(--bd1)">
    <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:16px;font-weight:650">⭐ Saved Command Center Views</h2><button class="btn btn-s" onclick="closeDrawer()">✕</button></div>
    <p style="font-size:11px;color:var(--t2);margin-top:4px">${list.length} saved view${list.length===1?'':'s'} · click any row to apply it.</p>
  </div>
  <div style="overflow-y:auto;max-height:60vh">${rows}</div>
  <div style="padding:12px 16px;border-top:1px solid var(--bd1);display:flex;gap:8px;justify-content:flex-end">
    <button class="btn btn-s" onclick="closeDrawer()">Close</button>
    <button class="btn btn-p" onclick="closeDrawer();_saveCurrentCCView()">+ Save current</button>
  </div>`;
  ov.classList.add('show');
}

// ─── AI Portfolio Briefing ──────────────────────────────────────────────────
// Generates a weekly portfolio briefing for the current Command Center hat
// from a snapshot of _ccTasks(): wins, risks, blockers, recommendations.
// Persists to D.prefs.briefings[] so the user can read week-over-week.
async function aiPortfolioBriefing(){
  const btn=document.getElementById('cc-briefing-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Generating…';}
  try{
    const {provider,configured}=_getAIConfig?_getAIConfig():{};
    if(!configured){
      toast({type:'warn',title:'AI key missing',msg:'Add a provider key in Settings → AI Features.',duration:3000});
      if(btn){btn.disabled=false;btn.textContent='📝 Generate weekly briefing';}
      return;
    }
    const hat=_ccHat();
    const tasks=_ccTasks();
    const today=_todayStr;
    const tMs=Date.now();
    const week=new Date(tMs-7*86400000).toISOString();
    const open=tasks.filter(t=>t.status!=='Done');
    const shipped=tasks.filter(t=>t.status==='Done'&&t.completedAt&&t.completedAt>=week);
    const overdue=open.filter(t=>t.due&&t.due<today);
    const stallCut=new Date(tMs-7*86400000).toISOString();
    const stalled=open.filter(t=>t.updatedAt&&t.updatedAt<stallCut);
    // Sample down to keep the prompt compact.
    const summarise=arr=>arr.slice(0,40).map(t=>({
      title:(t.title||'').slice(0,180),
      project:t.project||'',
      due:t.due||'',
      priority:t.priority||'',
      assignee:t.assignee||'',
      source:t.sourceLabel||t.source||'',
    }));
    const snapshot={
      asOf:_ymd(new Date()),
      hat,
      counts:{open:open.length,shipped7d:shipped.length,overdue:overdue.length,stalled:stalled.length},
      shippedThisWeek:summarise(shipped),
      overdueOpen:summarise(overdue),
      stalledOpen:summarise(stalled.slice(0,20)),
      hottestOpen:summarise(open.filter(t=>t.priority==='High'||t.priority==='Critical')),
    };
    const sys=`You are the chief of staff to a COO/CEO running two companies (CommunityForce = CF, LSI Media = LSI). Read the portfolio snapshot and produce a one-page executive briefing for the week. Be specific — reference real task titles. Be decisive — pick the actual 3 things to focus on next. Output STRICTLY valid JSON, no markdown:
{
  "headline": "<one sentence summary of the week, 15-25 words>",
  "wins": [ {"title":"<task title>", "source":"<CF/LSI/Personal>", "why":"<one short sentence, ~12 words, why this matters>"} ],
  "risks": [ {"title":"<task title or theme>", "why":"<why it's a risk, ~15 words>", "action":"<concrete next step, ~10 words>"} ],
  "blockers": [ {"title":"<task title>", "why":"<what's blocking, ~12 words>"} ],
  "next_three": [ "<concrete action 1, ~10 words>", "<action 2>", "<action 3>" ]
}
Pick 3-5 wins, 3-5 risks, 0-4 blockers, exactly 3 next_three. Items not in the snapshot must NOT appear.`;
    const userContent=`Portfolio snapshot:\n${JSON.stringify(snapshot)}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent,provider:provider||'manus'},'mutation');
    const raw=String(res?.result||res?.text||'').trim();
    const m=raw.match(/\{[\s\S]*\}/);
    if(!m)throw new Error('AI returned no JSON');
    const briefing=JSON.parse(m[0]);
    D.prefs=D.prefs||{};
    D.prefs.briefings=Array.isArray(D.prefs.briefings)?D.prefs.briefings:[];
    const record={
      id:Date.now(),
      dateISO:new Date().toISOString(),
      hat,
      snapshot:{counts:snapshot.counts},
      briefing,
      emailed:false,
    };
    D.prefs.briefings.unshift(record);
    // Keep last 24 briefings.
    if(D.prefs.briefings.length>24)D.prefs.briefings.length=24;
    save('prefs');
    if(typeof renderCommandCenter==='function'&&curScreen==='command')renderCommandCenter();
    toast({type:'success',title:'✓ Briefing ready',duration:2400});
  }catch(e){
    toast({type:'warn',title:'Briefing failed',msg:e.message||String(e),duration:4500});
    if(btn){btn.disabled=false;btn.textContent='📝 Generate weekly briefing';}
  }
}
function _renderBriefingCard(){
  const list=(D.prefs&&D.prefs.briefings)||[];
  if(!list.length)return '';
  const latest=list[0];
  const b=latest.briefing||{};
  const ago=_relTime(latest.dateISO);
  const hatBadge=latest.hat==='all'?'All hats':latest.hat==='cf'?'CF':latest.hat==='lsi'?'LSI':'Personal';
  const sec=(emoji,title,items,opts)=>{
    if(!items||!items.length)return '';
    return `<div style="margin-top:10px"><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${emoji} ${title}</div><ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px">${items.slice(0,5).map(it=>{
      if(typeof it==='string')return `<li style="font-size:12px;color:var(--t1);padding:4px 8px;background:var(--s3);border-radius:4px">${esc(it)}</li>`;
      const sub=opts==='risk'?(it.action?`<div style="font-size:11px;color:var(--ac);margin-top:2px">→ ${esc(it.action)}</div>`:''):'';
      const srcBadge=it.source?` <span style="font-size:11px;color:var(--t3)">[${esc(it.source)}]</span>`:'';
      return `<li style="font-size:12px;color:var(--t1);padding:5px 8px;background:var(--s3);border-radius:4px"><div style="font-weight:600">${esc(it.title||'')}${srcBadge}</div>${it.why?`<div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(it.why)}</div>`:''}${sub}</li>`;
    }).join('')}</ul></div>`;
  };
  return `<div class="cd" style="padding:13px 15px;border-left:3px solid var(--page-accent);grid-column:1/-1">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--t1);display:flex;align-items:center;gap:8px">✨ Weekly Portfolio Briefing <span style="font-size:11px;color:var(--t3);background:var(--s3);padding:2px 6px;border-radius:3px">${esc(hatBadge)}</span></div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">Generated ${ago}${latest.emailed?' · ✉ emailed':''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="aiPortfolioBriefing()" title="Regenerate from current data">↻ Refresh</button>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="_emailLatestBriefing()" title="Email this briefing to yourself">✉ Email</button>
        <button class="btn btn-s" style="height:24px;font-size:11px" onclick="_openBriefingHistory()" title="See past briefings">📚 History (${list.length})</button>
      </div>
    </div>
    ${b.headline?`<div style="font-size:13px;color:var(--t1);font-style:italic;padding:9px 11px;background:color-mix(in srgb,var(--page-accent) 12%,transparent);border-radius:6px;line-height:1.55">"${esc(b.headline)}"</div>`:''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:4px">
      <div>${sec('🚀','Wins this week',b.wins||[])}</div>
      <div>${sec('⚠','Risks',b.risks||[],'risk')}</div>
      <div>${sec('🚧','Blockers',b.blockers||[])}</div>
      <div>${sec('🎯','Next 3 actions',b.next_three||[])}</div>
    </div>
  </div>`;
}
async function _emailLatestBriefing(){
  const list=(D.prefs&&D.prefs.briefings)||[];
  if(!list.length){toast({type:'warn',title:'No briefing to email'});return;}
  const latest=list[0];
  const b=latest.briefing||{};
  const dateLine=_pd(latest.dateISO).toLocaleString('en-US',{weekday:'long',month:'short',day:'numeric'});
  const hatLabel=latest.hat==='all'?'All hats':latest.hat.toUpperCase();
  const renderList=(arr,opts)=>arr&&arr.length?arr.slice(0,6).map(it=>{
    if(typeof it==='string')return `<li style="margin-bottom:4px">${esc(it)}</li>`;
    const action=opts==='risk'&&it.action?` <em style="color:#2563eb">→ ${esc(it.action)}</em>`:'';
    const src=it.source?` <small style="color:#64748b">[${esc(it.source)}]</small>`:'';
    return `<li style="margin-bottom:4px"><strong>${esc(it.title||'')}</strong>${src}${it.why?` — ${esc(it.why)}`:''}${action}</li>`;
  }).join(''):'<li><em>none</em></li>';
  const html=`<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#0f172a">
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 4px">📊 Weekly Portfolio Briefing</h1>
    <div style="font-size:12px;color:#64748b;margin-bottom:14px">${esc(dateLine)} · ${esc(hatLabel)}</div>
    ${b.headline?`<blockquote style="border-left:3px solid #f59e0b;margin:14px 0;padding:6px 14px;background:#fffbeb;font-style:italic;color:#0f172a">${esc(b.headline)}</blockquote>`:''}
    <h2 style="font-size:14px;color:#10b981;margin:18px 0 6px">🚀 Wins</h2>
    <ul style="font-size:13px;line-height:1.55;color:#0f172a;padding-left:18px;margin:0">${renderList(b.wins)}</ul>
    <h2 style="font-size:14px;color:#ef4444;margin:18px 0 6px">⚠ Risks</h2>
    <ul style="font-size:13px;line-height:1.55;color:#0f172a;padding-left:18px;margin:0">${renderList(b.risks,'risk')}</ul>
    <h2 style="font-size:14px;color:#a855f7;margin:18px 0 6px">🚧 Blockers</h2>
    <ul style="font-size:13px;line-height:1.55;color:#0f172a;padding-left:18px;margin:0">${renderList(b.blockers)}</ul>
    <h2 style="font-size:14px;color:#3b82f6;margin:18px 0 6px">🎯 Next 3 Actions</h2>
    <ul style="font-size:13px;line-height:1.55;color:#0f172a;padding-left:18px;margin:0">${renderList(b.next_three)}</ul>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;color:#94a3b8;text-align:center">Generated by LevelUp · open Command Center for live data.</div>
  </div>`;
  try{
    toast({type:'info',title:'Sending…',duration:1500});
    await _trpc('oauthSync.sendCustom',{subject:`Weekly Briefing — ${dateLine} (${hatLabel})`,html},'mutation');
    latest.emailed=true;save('prefs');
    if(typeof renderCommandCenter==='function'&&curScreen==='command')renderCommandCenter();
    toast({type:'success',title:'✓ Briefing emailed',duration:2400});
  }catch(e){
    toast({type:'warn',title:'Email failed',msg:e.message||String(e),duration:4500});
  }
}
function _openBriefingHistory(){
  const list=(D.prefs&&D.prefs.briefings)||[];
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  if(!d||!ov)return;
  const rows=list.length?list.map((rec,i)=>{
    const dt=_pd(rec.dateISO);
    const hatLabel=rec.hat==='all'?'All':rec.hat.toUpperCase();
    const head=(rec.briefing&&rec.briefing.headline)||'(no headline)';
    return `<div class="lr" style="padding:10px 12px;border-bottom:1px solid var(--bd1);display:flex;align-items:flex-start;gap:9px;cursor:pointer" onclick="_loadBriefing(${rec.id})">
      <span style="font-size:11px;color:var(--t3);min-width:80px">${dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
      <span style="font-size:11px;background:var(--s3);color:var(--t2);padding:2px 6px;border-radius:3px;font-weight:600">${esc(hatLabel)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--t1);line-height:1.45">${esc(head)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${rec.emailed?'✉ emailed · ':''}${(rec.snapshot&&rec.snapshot.counts)?`${rec.snapshot.counts.open} open · ${rec.snapshot.counts.shipped7d} shipped`:''}</div>
      </div>
      <button class="btn btn-d" style="height:22px;font-size:11px" onclick="event.stopPropagation();_deleteBriefing(${rec.id})">✕</button>
    </div>`;
  }).join(''):'<div style="padding:24px;text-align:center;color:var(--t3);font-size:12px">No briefings yet — generate one from Command Center.</div>';
  d.innerHTML=`<div style="padding:14px 16px;border-bottom:1px solid var(--bd1)"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:16px;font-weight:650">📚 Briefing History</h2><button class="btn btn-s" onclick="closeDrawer()">✕</button></div><p style="font-size:11px;color:var(--t2);margin-top:4px">Last ${list.length} briefings · click one to load it back into Command Center.</p></div><div style="overflow-y:auto;max-height:70vh">${rows}</div>`;
  ov.classList.add('show');
}
function _loadBriefing(id){
  const list=(D.prefs&&D.prefs.briefings)||[];
  const idx=list.findIndex(r=>r.id===id);
  if(idx<=0)return; // already latest or not found
  const rec=list.splice(idx,1)[0];
  list.unshift(rec);
  save('prefs');
  closeDrawer();
  if(typeof renderCommandCenter==='function'&&curScreen==='command')renderCommandCenter();
}
function _deleteBriefing(id){
  if(!confirm('Delete this briefing? This cannot be undone.'))return;
  D.prefs.briefings=(D.prefs.briefings||[]).filter(r=>r.id!==id);
  save('prefs');
  _openBriefingHistory();
}

// Tiny "X ago" formatter used by Command Center.
function _relTime(iso){
  if(!iso)return '';
  const t=_pd(iso).getTime();if(isNaN(t))return '';
  const ago=(Date.now()-t)/60000;
  if(ago<1)return 'just now';
  if(ago<60)return Math.floor(ago)+'m ago';
  if(ago<1440)return Math.floor(ago/60)+'h ago';
  return Math.floor(ago/1440)+'d ago';
}

function renderPrograms(){
  const m=document.getElementById('prog-main');
  const r=document.getElementById('prog-rail');
  if(!m)return;
  const programs=D.programs||[];
  const cards=programs.map(prog=>{
    const projs=(D.projects||[]).filter(p=>(prog.projectIds||[]).includes(p.id));
    const allTasks=[];
    projs.forEach(p=>{
      _topLevelTasks(D.tasks).forEach(t=>{if(t.projectId===p.id)allTasks.push(t);});
    });
    // External tasks: those linked to one of this program's projects.
    const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(et=>{
      const ov=et.override;if(!ov||!ov.localProjectId||ov.tombstoned)return false;
      return projs.some(p=>String(p.id)===String(ov.localProjectId));
    });
    const totalTasks=allTasks.length+extLinked.length;
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    const doneN=allTasks.filter(t=>t.status==='Done').length+extLinked.filter(isExtDone).length;
    const overdueN=allTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;
    const pct=totalTasks?Math.round(doneN/totalTasks*100):0;
    return `<div class="pc" style="border-left:5px solid ${prog.color||'#1f6feb'};cursor:pointer" onclick="openProgramDetail(${prog.id})">
      <div class="pc-head">
        <span style="font-size:20px;flex-shrink:0">${esc(prog.icon||'📊')}</span>
        <span class="pc-name">${esc(prog.name||'Untitled program')}</span>
      </div>
      ${prog.description?`<div class="pc-desc" title="${esc(prog.description)}">${esc(prog.description)}</div>`:''}
      <div class="pc-mid">
        <div class="pc-ring" style="background:conic-gradient(${prog.color||'#1f6feb'} ${pct}%, var(--s3) ${pct}% 100%)"><div class="pc-ring-in">${pct}%</div></div>
        <div class="pc-stats">
          <div><b>${projs.length}</b> project${projs.length===1?'':'s'}</div>
          <div><b>${doneN}</b>/${totalTasks} task${totalTasks===1?'':'s'} done</div>
          ${overdueN?`<div style="color:var(--red)"><b>${overdueN}</b> overdue</div>`:'<div style="color:var(--t3)">on track</div>'}
        </div>
      </div>
      <div class="pc-foot">
        <span>${prog.owner?'👤 '+esc(prog.owner.split(' ')[0]):''}</span>
        <span class="pc-acts">
          <button class="btn btn-s" style="font-size:11px;padding:2px 7px" onclick="event.stopPropagation();openDrawer('program',D.programs.find(x=>x.id==${_tidLit(prog.id)}))" title="Edit">✏</button>
        </span>
      </div>
    </div>`;
  }).join('');
  const empty=programs.length?'':renderEmptyState({icon:'barChart',title:'No programs yet',hint:'Programs group your projects into a portfolio (one per company or strategic area).',ctaLabel:'+ New program',ctaFn:'_newProgram()'});
  m.innerHTML=`<div class="ph-r" style="margin-bottom:14px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('barChart',22,'var(--page-accent)')}Programs</h1><p style="font-size:12px;color:var(--t2)">Portfolio view — group projects under a strategic umbrella. ${programs.length} program${programs.length===1?'':'s'} · ${(D.projects||[]).length} project${(D.projects||[]).length===1?'':'s'} total.</p></div><div style="display:flex;gap:6px"><button class="btn btn-s" onclick="nav('command')" title="Open the Command Center">🎯 Command Center</button><button class="btn btn-p" onclick="_newProgram()">+ New program</button></div></div>
    ${typeof _renderSharedProgramsSection==='function'?_renderSharedProgramsSection():''}
    ${programs.length?`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${cards}</div>`:empty}
    ${(D.projects||[]).length?_renderPortfolioTimeline():''}`;
  if(r){
    const totalProjects=(D.projects||[]).length;
    const assignedProjects=new Set();
    programs.forEach(p=>(p.projectIds||[]).forEach(id=>assignedProjects.add(id)));
    const orphans=(D.projects||[]).filter(p=>!assignedProjects.has(p.id));
    r.innerHTML=`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;margin-bottom:8px">Portfolio summary</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.8">
        Programs: <strong>${programs.length}</strong><br>
        Projects (assigned): <strong>${assignedProjects.size}/${totalProjects}</strong><br>
        Tasks: <strong>${_topLevelTasks(D.tasks).filter(t=>t.status!=='Done'&&t.status!=='Someday').length}</strong> open
      </div>
    </div>
    ${orphans.length?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px"><div style="font-size:11px;font-weight:600;margin-bottom:6px">🗂 Unassigned projects (${orphans.length})</div><div style="font-size:11px;color:var(--t3);margin-bottom:8px">Edit a program to link them.</div>${orphans.slice(0,15).map(p=>`<div class="lr" style="font-size:11px;padding:3px 0;cursor:pointer" onclick="openProjectDetail(${p.id})"><span style="width:6px;height:6px;border-radius:2px;background:${p.color};flex-shrink:0"></span><span class="rt" style="font-size:11px">${esc(p.name)}</span></div>`).join('')}</div>`:''}`;
  }
}

function _newProgram(){
  const newId=Date.now();
  D.programs=D.programs||[];
  D.programs.push({id:newId,name:'New Program',icon:'📊',color:'#1f6feb',owner:(D.creds&&D.creds.userName)||'Idris Grant',status:'Active',description:'',projectIds:[],createdAt:new Date().toISOString()});
  save('programs');
  openDrawer('program',D.programs.find(p=>p.id===newId));
  setTimeout(renderPrograms,0);
}

// ─── Portfolio Timeline (swimlane gantt across all projects) ────────────────
// One row per project that has dated tasks. Bars: native task (project color)
// + external task linked to the project (source color). Date axis spans the
// rolling window: max(today-14d, earliest start) … max(today+60d, latest due).
function _renderPortfolioTimeline(){
  const projects=(D.projects||[]).filter(p=>!p.archived);
  // Build per-project task rows with start/end dates.
  const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const rowsByProj={};
  let minD=null,maxD=null;
  const consider=(date)=>{if(!date)return;const d=date.slice(0,10);if(d.length!==10)return;if(!minD||d<minD)minD=d;if(!maxD||d>maxD)maxD=d;};
  projects.forEach(p=>{
    const arr=[];
    _topLevelTasks(D.tasks).forEach(t=>{
      if(t.projectId!==p.id)return;
      const s=t.startDate||t.due||'';const e=t.due||t.startDate||'';
      if(!s&&!e)return;
      consider(s);consider(e);
      arr.push({title:t.title,start:s||e,end:e||s,color:p.color||'#3b82f6',done:t.status==='Done',src:'personal',raw:t});
    });
    (Array.isArray(D.externalTasks)?D.externalTasks:[]).forEach(et=>{
      const ov=et.override;if(!ov||String(ov.localProjectId||'')!==String(p.id)||ov.tombstoned)return;
      const s=et.startDate||ov.localDue||et.due||'';const e=ov.localDue||et.due||et.startDate||'';
      if(!s&&!e)return;
      consider(s);consider(e);
      arr.push({title:et.title,start:s||e,end:e||s,color:et.source==='smartsheet'?'#1f6feb':'#9333ea',done:isExtDone(et),src:et.source,raw:et});
    });
    if(arr.length)rowsByProj[p.id]={project:p,tasks:arr};
  });
  const projIds=Object.keys(rowsByProj);
  if(!projIds.length)return '';
  // Clamp the window: 14d back to 60d forward, but expand if data goes further.
  const today=new Date();const todayStr=_ymd(today);
  const back=_pd(today);back.setDate(today.getDate()-14);
  const fwd=_pd(today);fwd.setDate(today.getDate()+60);
  const winStart=(minD&&minD<_ymd(back))?minD:_ymd(back);
  const winEnd=(maxD&&maxD>_ymd(fwd))?maxD:_ymd(fwd);
  const winStartMs=Date.parse(winStart);
  const winEndMs=Date.parse(winEnd);
  const winDays=Math.max(1,Math.round((winEndMs-winStartMs)/86400000));
  const dayPx=Math.max(8,Math.min(24,Math.round(1100/winDays)));
  const totalW=winDays*dayPx;
  // Axis: month headers across.
  const axisCells=[];
  let cur=_pd(winStartMs);cur.setHours(0,0,0,0);
  let monthStartIdx=0;let curMonth=cur.getMonth();let curYear=cur.getFullYear();
  for(let i=0;i<=winDays;i++){
    const d=new Date(winStartMs+i*86400000);
    if(d.getMonth()!==curMonth||i===winDays){
      const span=i-monthStartIdx;
      axisCells.push(`<div style="position:absolute;left:${monthStartIdx*dayPx}px;width:${span*dayPx}px;font-size:10px;color:var(--t3);text-align:left;padding-left:5px;border-left:1px solid var(--bd1);box-sizing:border-box;height:18px;line-height:18px">${new Date(curYear,curMonth,1).toLocaleString('en-US',{month:'short',year:'2-digit'})}</div>`);
      curMonth=d.getMonth();curYear=d.getFullYear();monthStartIdx=i;
    }
  }
  // Today line position.
  const todayMs=Date.parse(todayStr);
  const todayX=Math.max(0,Math.round((todayMs-winStartMs)/86400000)*dayPx);
  // Swimlanes.
  const lanes=projIds.map(pid=>{
    const {project,tasks}=rowsByProj[pid];
    const bars=tasks.map(t=>{
      const s=Date.parse((t.start||'').slice(0,10));
      const e=Date.parse((t.end||'').slice(0,10));
      if(isNaN(s)||isNaN(e))return '';
      const x=Math.round((s-winStartMs)/86400000)*dayPx;
      const w=Math.max(dayPx,Math.round((e-s)/86400000+1)*dayPx);
      const overdue=!t.done&&e<todayMs;
      const bg=t.done?'color-mix(in srgb, '+t.color+' 35%, transparent)':t.color;
      const border=overdue?'2px solid #ef4444':'1px solid color-mix(in srgb,'+t.color+' 60%, #000)';
      return `<div title="${esc(t.title)} (${esc(t.start)} → ${esc(t.end)})" style="position:absolute;left:${x}px;width:${w}px;top:4px;bottom:4px;background:${bg};border:${border};border-radius:4px;padding:0 6px;font-size:10px;color:#fff;line-height:18px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;${t.done?'opacity:.7':''}">${esc(t.title)}</div>`;
    }).join('');
    return `<div style="display:flex;border-bottom:1px solid var(--bd1);min-height:30px">
      <div style="width:180px;padding:6px 9px;font-size:11px;color:var(--t1);flex-shrink:0;border-right:1px solid var(--bd1);background:var(--s2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="openProjectDetail(${project.id})">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${project.color};margin-right:6px;vertical-align:middle"></span>
        ${esc(project.name)}
        <span style="font-size:11px;color:var(--t3);margin-left:4px">${tasks.length}</span>
      </div>
      <div style="position:relative;flex:1;min-height:30px;background:repeating-linear-gradient(90deg,transparent,transparent ${dayPx-1}px,var(--bd1) ${dayPx-1}px,var(--bd1) ${dayPx}px);width:${totalW}px">
        ${bars}
      </div>
    </div>`;
  }).join('');
  const hiddenN=(()=>{
    let n=0;
    (D.tasks||[]).forEach(t=>{if(t.projectId&&!t.due&&!t.startDate)n++;});
    (D.externalTasks||[]).forEach(et=>{const ov=et.override;if(ov&&ov.localProjectId&&!et.due&&!et.startDate&&!ov.tombstoned)n++;});
    return n;
  })();
  return `<div class="cd" style="padding:11px 13px;margin-top:18px;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:12px;font-weight:600">📅 Portfolio Timeline</div>
      <div style="font-size:11px;color:var(--t3)">${projIds.length} project${projIds.length===1?'':'s'} on chart${hiddenN?` · <span style="cursor:pointer;text-decoration:underline;text-decoration-style:dotted;color:var(--ac)" onclick="_drillIntoDatelessTasks()" title="Filter Tasks to dateless rows so you can add dates in batch">${hiddenN} hidden (no dates)</span>`:''}</div>
    </div>
    <div style="display:flex;gap:10px;font-size:11px;color:var(--t3);margin-bottom:6px;flex-wrap:wrap">
      <span><span style="display:inline-block;width:10px;height:10px;background:#1f6feb;border-radius:2px;vertical-align:middle"></span> Smartsheet</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#9333ea;border-radius:2px;vertical-align:middle"></span> NiftyPM</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;vertical-align:middle"></span> Native</span>
      <span style="border-left:2px solid #ef4444;padding-left:4px">overdue</span>
    </div>
    <div style="overflow:auto;max-height:calc(100vh - 460px);border:1px solid var(--bd1);border-radius:6px;background:var(--s1);position:relative">
      <div style="display:flex;position:sticky;top:0;z-index:5;background:var(--s2);border-bottom:1px solid var(--bd1)">
        <div style="width:180px;font-size:11px;padding:6px 9px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;font-weight:600;flex-shrink:0;border-right:1px solid var(--bd1)">Project</div>
        <div style="position:relative;flex:1;width:${totalW}px;height:18px">${axisCells.join('')}</div>
      </div>
      <div style="position:relative">
        <div style="position:absolute;left:${180+todayX}px;top:0;bottom:0;width:2px;background:#ef4444;opacity:.7;z-index:2;pointer-events:none" title="Today"></div>
        ${lanes}
      </div>
    </div>
  </div>`;
}

function openProgramDetail(pid){
  const prog=(D.programs||[]).find(p=>p.id===pid);
  if(!prog)return;
  const projs=(D.projects||[]).filter(p=>(prog.projectIds||[]).includes(p.id));
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  // Roll up tasks across all child projects.
  const nativeTasks=[];projs.forEach(p=>_topLevelTasks(D.tasks).forEach(t=>{if(t.projectId===p.id)nativeTasks.push(t);}));
  const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(et=>{
    const o=et.override;if(!o||!o.localProjectId||o.tombstoned)return false;
    return projs.some(p=>String(p.id)===String(o.localProjectId));
  });
  const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
  const doneN=nativeTasks.filter(t=>t.status==='Done').length+extLinked.filter(isExtDone).length;
  const totalN=nativeTasks.length+extLinked.length;
  const pct=totalN?Math.round(doneN/totalN*100):0;
  const overdueN=nativeTasks.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;
  const statChip=(n,l,c)=>`<div style="flex:1;min-width:64px;background:var(--s2);border:1px solid var(--bd1);border-radius:9px;padding:9px;text-align:center"><div style="font-size:18px;font-weight:750;color:${c||'var(--t1)'};line-height:1">${n}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin-top:3px">${l}</div></div>`;
  const projRows=projs.length?projs.map(p=>{
    const pt=_topLevelTasks(D.tasks).filter(t=>t.projectId===p.id);
    const pdone=pt.filter(t=>t.status==='Done').length;
    const ptotal=pt.length;
    const ppct=ptotal?Math.round(pdone/ptotal*100):p.pct||0;
    return `<div class="lr" style="padding:8px 0;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="closeDrawer();setTimeout(()=>openProjectDetail(${p.id}),120)">
      <span style="width:8px;height:8px;border-radius:2px;background:${p.color};flex-shrink:0"></span>
      <span class="rt" style="font-size:12px;font-weight:500">${p.icon?esc(p.icon)+' ':''}${esc(p.name)}</span>
      <span style="font-size:11px;color:var(--t3)">${pdone}/${ptotal}</span>
      <div style="width:60px;height:5px;background:var(--s3);border-radius:3px;overflow:hidden;flex-shrink:0"><div style="height:100%;width:${ppct}%;background:${p.color};border-radius:3px"></div></div>
      <span style="font-size:11px;color:var(--t3)">›</span>
    </div>`;
  }).join(''):'<p style="font-size:11px;color:var(--t3);padding:6px 0">No projects linked. ✏ Edit Program to assign projects.</p>';
  d.innerHTML=`<h2 style="display:flex;align-items:center;gap:8px"><span style="font-size:22px;flex-shrink:0">${esc(prog.icon||'📊')}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(prog.name)}</span><button class="close" onclick="closeDrawer()">✕</button></h2>
    ${prog.description?`<p style="font-size:12px;color:var(--t2);margin-bottom:14px;line-height:1.6">${esc(prog.description)}</p>`:''}
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="background:conic-gradient(${prog.color||'#1f6feb'} ${pct}%, var(--s3) ${pct}%);width:52px;height:52px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center"><div style="width:40px;height:40px;border-radius:50%;background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:750">${pct}%</div></div>
      <div style="display:flex;gap:6px;flex:1;flex-wrap:wrap">
        ${statChip(projs.length,'Projects')}
        ${statChip(nativeTasks.length+'/'+(nativeTasks.length+extLinked.length),'Tasks')}
        ${statChip(doneN,'Done','var(--ok)')}
        ${statChip(overdueN,'Overdue',overdueN?'var(--red)':'var(--t2)')}
        ${statChip(extLinked.length,'External')}
      </div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Health (rolled up across projects)</div>
    ${_renderHealthStrip((function(){
      // Aggregate health across child projects.
      const h={open:0,done:0,total:0,velocity:0,burn:0,risk:0,overdue:0,stalled:0,etaWeeks:null,trend:'flat',pct:0};
      projs.forEach(p=>{
        const ph=_projectHealth(p.id);
        h.open+=ph.open;h.done+=ph.done;h.total+=ph.total;
        h.velocity+=ph.velocity;h.burn+=ph.burn;h.overdue+=ph.overdue;h.stalled+=ph.stalled;
      });
      h.velocity=Math.round(h.velocity*10)/10;
      h.risk=h.open?Math.round(((h.overdue+h.stalled)/h.open)*100):0;
      h.etaWeeks=h.velocity>0?Math.round((h.open/h.velocity)*10)/10:null;
      h.pct=h.total?Math.round(h.done/h.total*100):0;
      return h;
    })())}
    <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;margin-top:14px">Projects (${projs.length})</div>
    ${projRows}
    <div style="display:flex;gap:8px;margin-top:16px;position:sticky;bottom:0;background:var(--s1);padding:10px 0">
      <button class="btn btn-p" onclick="closeDrawer();openDrawer('program',D.programs.find(x=>x.id===${pid}))">✏ Edit Program</button>
      <button class="btn btn-s" onclick="closeDrawer();nav('reports')">📊 Reports</button>
      <button class="btn btn-s" onclick="closeDrawer()">Close</button>
    </div>`;
  ov.classList.add('show');
}
function renderProjects(){
  // Header — filter row + view tabs + AI menu + New Project
  const ps=D.projects||[];
  const a=ps.filter(p=>!p.archived&&(p.status==='Active'||p.status==='In Progress')).length;
  const oh=ps.filter(p=>!p.archived&&p.status==='On Hold').length;
  const dn=ps.filter(p=>!p.archived&&(p.status==='Completed'||p.status==='Done')).length;
  const ar=ps.filter(p=>p.archived).length;
  const subtitle=`${a} active${oh?` · ${oh} on hold`:''}${dn?` · ${dn} completed`:''}${ar?` · ${ar} archived`:''}`||`${ps.length} project${ps.length!==1?'s':''}`;
  const aiMenu=`<div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('proj-ai-menu')" title="AI tools">✨ AI ▾</button><div id="proj-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
    <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('proj-ai-menu');aiProjectHealth()">🩺 Health Summary</button>
    <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('proj-ai-menu');aiProjectNextMilestone()">🎯 Suggest Next Milestone</button>
    <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--red);background:transparent;border:none;text-align:left" onclick="closePopMenu('proj-ai-menu');aiProjectRisks()">⚠️ Identify Risks</button>
  </div></div>`;
  // Compact filter dropdowns — styled like the small header buttons and
  // moved up into the top action row (per user request).
  const _selSty=`height:28px;font-size:10px;padding:0 7px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;color:var(--t2);cursor:pointer;max-width:120px`;
  const headerFilters=`<select title="Status filter" style="${_selSty}" onchange="setProjFilter('status',this.value)">
      ${['Active','On Hold','Not Started','Completed','All'].map(s=>`<option ${_projStatusFilter===s?'selected':''}>${s}</option>`).join('')}
    </select><select title="Health filter" style="${_selSty}" onchange="setProjFilter('health',this.value)">
      ${['All','On Track','Needs Attention','At Risk'].map(s=>`<option ${_projHealthFilter===s?'selected':''}>${s==='All'?'Health: All':s}</option>`).join('')}
    </select><select title="Sort" style="${_selSty}" onchange="setProjFilter('sort',this.value)">
      <option value="order" ${_projSort==='order'?'selected':''}>Sort: Default</option>
      <option value="dueAsc" ${_projSort==='dueAsc'?'selected':''}>Due soon</option>
      <option value="pctDesc" ${_projSort==='pctDesc'?'selected':''}>% high → low</option>
      <option value="pctAsc" ${_projSort==='pctAsc'?'selected':''}>% low → high</option>
      <option value="az" ${_projSort==='az'?'selected':''}>A → Z</option>
    </select>`;
  const filterRow=`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px">
    <input class="inp" placeholder="🔍 Search projects…" value="${esc(_projSearch)}" style="flex:1;min-width:160px;height:28px;font-size:11px" oninput="_keepFocus(()=>setProjFilter('search',this.value))">
    ${ar?`<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--t2);cursor:pointer"><input type="checkbox" ${_projShowArchived?'checked':''} onchange="setProjFilter('showArchived',this.checked)" style="width:13px;height:13px">Show archive (${ar})</label>`:''}
    ${_projHasFilters()?`<button class="btn btn-s" style="height:28px;font-size:11px;color:var(--warn)" onclick="clearProjFilters()">✕ Clear</button>`:''}
  </div>`;
  const header=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('folder',22,'var(--page-accent)')}Projects</h1><p style="font-size:12px;color:var(--t2)">${subtitle}</p></div><div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><button class="btn ${projView==='list'?'btn-p':'btn-s'}" onclick="setProjView('list')">${_icon('list',13,'currentColor')} List</button><button class="btn ${projView==='kanban'?'btn-p':'btn-s'}" onclick="setProjView('kanban')">${_icon('columns',13,'currentColor')} Kanban</button><button class="btn ${projView==='gantt'?'btn-p':'btn-s'}" onclick="setProjView('gantt')">${_icon('barChart',13,'currentColor')} Gantt</button><button class="btn ${projView==='workload'?'btn-p':'btn-s'}" onclick="setProjView('workload')" title="Tasks grouped by assignee — workload across people">${_icon('users',13,'currentColor')} Workload</button><span style="width:1px;height:20px;background:var(--bd2);margin:0 2px"></span>${headerFilters}${aiMenu}<button class="btn btn-p" onclick="openFA('project')">+ New Project</button></div></div>${filterRow}`;
  if(projView==='list') renderProjectsList(header);
  else if(projView==='kanban') renderProjectsKanban(header);
  else if(projView==='workload'||projView==='team') renderProjectsTeamKanban(header);
  else renderProjectsGantt(header);
  _renderProjRail();
}
function renderProjectsTeamKanban(header){
  // This lives on the PROJECTS page, so it shows project work only:
  // programs contain projects, projects contain tasks. Tasks without a
  // projectId belong to the Tasks page, not here — including them made the
  // Projects page look like a task dump on accounts with no projects yet.
  const activeProjects=(D.projects||[]).filter(p=>!p.archived);
  if(!activeProjects.length){
    $('proj-main').innerHTML=header+renderEmptyState({icon:'users',title:'No projects yet',hint:'Workload shows each person’s project tasks side by side. Create a project and link tasks to it to see the spread.',ctaLabel:'+ New Project',ctaFn:"openFA('project')"});
    return;
  }
  const pool=_topLevelTasks(D.tasks).filter(t=>t.projectId!=null&&t.projectId!=='');
  const allMembers=D.teams.flatMap(t=>t.members);
  // Build columns: one per member + Unassigned
  const cols=[...allMembers.map(m=>({key:m.name,label:m.name,color:m.color,initials:m.name.split(' ').map(w=>w[0]).join('')})),{key:null,label:'Unassigned',color:'var(--t3)',initials:'?'}];
  const colHtml=cols.map(col=>{
    const tasks=pool.filter(t=>t.status!=='Done'&&(col.key===null?(t.assignedTo==null||t.assignedTo===''):(t.assignedTo===col.key)));
    const done=pool.filter(t=>t.status==='Done'&&(col.key===null?(t.assignedTo==null||t.assignedTo===''):(t.assignedTo===col.key))).length;
    return`<div style="flex:1;min-width:200px;max-width:280px">
      <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px 6px 0 0;background:var(--s3);margin-bottom:6px">
        <div style="width:22px;height:22px;border-radius:50%;background:${col.color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${col.initials}</div>
        <span style="font-size:11px;font-weight:600;flex:1">${col.label}</span>
        <span style="font-size:11px;color:var(--t3)">${tasks.length} active · ${done} done</span>
      </div>
      ${tasks.map(t=>{const pname=t.project||((D.projects||[]).find(x=>String(x.id)===String(t.projectId))||{}).name||'';return `<div class="cd" style="cursor:pointer;margin-bottom:6px;border-left:3px solid ${pillClass(t.priority)==='hi'?'var(--red)':pillClass(t.priority)==='md'?'var(--warn)':'var(--ok)'}" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">
        <div style="font-size:12px;font-weight:500;margin-bottom:3px">${esc(t.title)}</div>
        <div style="display:flex;gap:6px;font-size:11px;color:var(--t3)">
          <span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span>
          ${pname?`<span>${_icon('folder',12,'currentColor')} ${esc(pname)}</span>`:''}
          ${t.due?`<span>📅 ${fmtDate(t.due)}</span>`:''}        </div>
        ${(t.subtasks||[]).length?`<div style="font-size:11px;color:var(--t3);margin-top:3px">✓ ${(t.subtasks||[]).filter(s=>s.done).length}/${(t.subtasks||[]).length} subtasks</div>`:''}
      </div>`;}).join('')}
      ${tasks.length===0?`<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No active tasks</div>`:''}
    </div>`}).join('');
  $('proj-main').innerHTML=header+`<div style="font-size:11px;color:var(--t2);margin-bottom:10px">Project tasks grouped by assignee. Tasks not linked to a project live on the Tasks page. Click any card to edit assignment.</div><div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">${colHtml}</div>`;
}
function projectHealth(p){
  const pts=D.tasks.filter(t=>t.projectId===p.id&&t.status!=='Done');
  const overdue=pts.filter(t=>t.due&&t.due<_todayStr).length;
  const total=D.tasks.filter(t=>t.projectId===p.id).length;
  const overdueRatio=total>0?overdue/total:0;
  // Check deadline proximity
  let daysLeft=Infinity;
  if(p.due&&p.due!=='TBD'){
    const d=_pd(p.due);
    if(!isNaN(d))daysLeft=Math.ceil((d-new Date())/(1000*60*60*24));
  }
  if(overdueRatio>0.3||daysLeft<0)return{icon:'🔴',label:'At Risk',color:'var(--red)'};
  if(overdueRatio>0.1||daysLeft<=7)return{icon:'🟡',label:'Needs Attention',color:'var(--warn)'};
  return{icon:'🟢',label:'On Track',color:'var(--ok)'};
}
function _projPortfolioStrip(){
  const all=(D.projects||[]).filter(p=>!p.archived);
  if(!all.length)return '';
  const active=all.filter(p=>p.status==='Active'||p.status==='In Progress');
  let onTrack=0,attention=0,risk=0;
  all.forEach(p=>{const h=projectHealth(p);if(h.label==='On Track')onTrack++;else if(h.label==='At Risk')risk++;else attention++;});
  const pctOnTrack=all.length?Math.round(onTrack/all.length*100):0;
  const today=_todayStr;
  let msOverdue=0,msTotal=0;
  all.forEach(p=>(Array.isArray(p.milestones)?p.milestones:[]).forEach(m=>{msTotal++;if(!m.done&&m.due&&m.due<today)msOverdue++;}));
  const avgPct=all.length?Math.round(all.reduce((s,p)=>s+(p.pct||0),0)/all.length):0;
  const cell=(big,lbl,col)=>`<div class="pf-cell"><div class="pf-n" style="${col?`color:${col}`:''}">${big}</div><div class="pf-l">${lbl}</div></div>`;
  return `<div class="pf-strip">
    ${cell(all.length,'Projects')}
    ${cell(active.length,'Active','var(--ac)')}
    ${cell(pctOnTrack+'%','On track',pctOnTrack>=70?'var(--ok)':pctOnTrack>=40?'var(--warn)':'var(--red)')}
    ${cell(risk,'At risk',risk?'var(--red)':'var(--t2)')}
    ${cell(attention,'Needs attn',attention?'var(--warn)':'var(--t2)')}
    ${cell(avgPct+'%','Avg progress')}
    ${cell(msOverdue+'/'+msTotal,'Milestones overdue',msOverdue?'var(--red)':'var(--t2)')}
  </div>`;
}
function renderProjectsList(header){
  const filtered=_filteredProjects();
  // P5: group-by toolbar
  const groupBar=`<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--t3);margin-bottom:8px">
    <span style="font-weight:600;text-transform:uppercase;letter-spacing:.05em">Group:</span>
    ${[['none','None'],['status','Status'],['owner','Owner'],['quarter','Quarter'],['health','Health']].map(([k,l])=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:${_projGroupBy===k?'var(--ac)':'transparent'};color:${_projGroupBy===k?'#fff':'var(--t2)'}" onclick="setProjFilter('groupBy','${k}')">${l}</button>`).join('')}
    <span style="margin-left:auto;font-size:11px;color:var(--t3)">Drag the ⋮⋮ handle to reorder · 📌 to pin</span>
  </div>`;
  function projCard(p){
    const pts=D.tasks.filter(t=>t.projectId===p.id);
    // Roll external linked tasks into the project totals so cards reflect the
    // actual work scoped to this project, not just native-task count.
    const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>{
      const ov=t.override;return ov&&String(ov.localProjectId||'')===String(p.id)&&!ov.tombstoned;
    });
    const extDone=extLinked.filter(t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);}).length;
    const done=pts.filter(t=>t.status==='Done').length+extDone;
    const subs=pts.flatMap(t=>t.subtasks||[]);
    const totalTasks=pts.length+extLinked.length;
    const health=projectHealth(p);
    // Auto-pct: when there's no manual override and there are tasks, show the
    // actual done/total ratio. Manual override (p.pctManual===true) is rare
    // but preserved — set it via the drawer if you want to lock a value.
    const autoPct=totalTasks?Math.round(done/totalTasks*100):null;
    const pct=p.pctManual?Math.max(0,Math.min(100,p.pct||0)):(autoPct!==null?autoPct:Math.max(0,Math.min(100,p.pct||0)));
    const ms=Array.isArray(p.milestones)?p.milestones:[];
    const msDone=ms.filter(m=>m.done).length;
    const overdue=pts.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;
    const dueOverdue=p.due&&p.due!=='TBD'&&p.due<_todayStr;
    const ring=`background:conic-gradient(${health.color} ${pct}%, var(--s3) ${pct}% 100%)`;
    return`<div class="pc" data-project-id="${p.id}" draggable="true" style="--pc-h:${health.color};${p.archived?'opacity:.55':''}" onclick="openProjectDetail(${p.id})" ondragstart="_projDragStart(event,${p.id})" ondragover="_projDragOver(event,${p.id})" ondragleave="_projDragLeave(event)" ondrop="_projDrop(event,${p.id})" ondragend="_projDragEnd(event)">
      <span class="proj-drag pc-drag" title="Drag to reorder" onclick="event.stopPropagation()">⋮⋮</span>
      <div class="pc-head">
        <span class="pc-dot" style="background:${p.color}"></span>
        <span class="pc-star" onclick="_projToggleStar(${p.id},event)" title="${p.pinned?'Unpin':'Pin to top'}" style="${p.pinned?'color:var(--warn)':'color:var(--t3)'}">${p.pinned?'★':'☆'}</span>
        <span class="pc-name" style="${p.archived?'text-decoration:line-through':''}">${p.icon?esc(p.icon)+' ':''}${esc(p.name||'Untitled project')}</span>
      </div>
      <div class="pc-pills">
        <span class="pc-health" style="color:${health.color};background:color-mix(in srgb,${health.color} 16%,transparent)">${health.icon} ${health.label}</span>
        <span class="pill ${statusPill(p.status)}">${p.status||'—'}</span>
        ${overdue?`<span class="pc-health" style="color:var(--red);background:color-mix(in srgb,var(--red) 16%,transparent)">⚠ ${overdue} overdue</span>`:''}
      </div>
      ${p.desc?`<div class="pc-desc" title="${esc(p.desc)}">${esc(p.desc)}</div>`:''}
      <div class="pc-mid">
        <div class="pc-ring" style="${ring}"><div class="pc-ring-in">${pct}%</div></div>
        <div class="pc-stats">
          <div>${totalTasks?`<b>${done}</b>/${totalTasks} tasks done${extLinked.length?` <span style="font-size:11px;color:var(--t3)" title="${extLinked.length} from external sources">(+${extLinked.length} ext)</span>`:''}`:'<span style="color:var(--t3)">No linked tasks</span>'}</div>
          <div><b>${subs.filter(s=>s.done).length}</b>/${subs.length} subtasks</div>
          ${ms.length?`<div><b>${msDone}</b>/${ms.length} milestones</div>`:'<div style="color:var(--t3)">No milestones</div>'}
        </div>
      </div>
      ${ms.length?`<div class="pc-msbar">${ms.slice(0,12).map(m=>`<span class="${m.done?'on':''}" title="${esc(m.title||'Milestone')}"></span>`).join('')}</div>`:''}
      <div class="pc-foot">
        <span>${p.owner?'👤 '+esc(p.owner.split(' ')[0]):''}</span>
        <span class="${dueOverdue?'pc-od':''}">${p.due&&p.due!=='TBD'?'📅 '+esc(p.due):'No due date'}</span>
        <span class="pc-acts">
          <button class="btn btn-s" style="font-size:11px;padding:2px 7px" onclick="event.stopPropagation();openDrawer('project',D.projects.find(x=>x.id==${_tidLit(p.id)}))" title="Edit">✏</button>
          <button class="btn btn-s" style="font-size:11px;padding:2px 7px" onclick="_projToggleArchive(${p.id},event)" title="${p.archived?'Restore':'Archive'}">${p.archived?'↩':'🗄'}</button>
        </span>
      </div>
    </div>`;
  }
  let body;
  if(_projGroupBy==='none'){
    body=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${filtered.map(projCard).join('')||'<p style="font-size:11px;color:var(--t3);padding:16px">No projects match your filters.</p>'}</div>`;
  }else{
    const groups={};const order=[];
    const groupKey=p=>{
      switch(_projGroupBy){
        case 'status':return p.status||'—';
        case 'owner':return p.owner||'(no owner)';
        case 'quarter':return p.quarter||(p.due?('Due '+(p.due.slice(0,7))):'(no quarter)');
        case 'health':return projectHealth(p).label;
      }
      return '(other)';
    };
    filtered.forEach(p=>{const k=groupKey(p);if(!(k in groups)){groups[k]=[];order.push(k);}groups[k].push(p);});
    body=order.map(k=>`<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${esc(k)} <span style="font-weight:400;color:var(--t3)">(${groups[k].length})</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${groups[k].map(projCard).join('')}</div></div>`).join('');
  }
  $('proj-main').innerHTML=header+_renderSharedProjectsSection()+_projPortfolioStrip()+groupBar+body;
}
// P6: drag-reorder handlers for project list
let _projDragId=null;
function _projDragStart(e,id){_projDragId=id;e.target.classList.add('proj-dragging');try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id));}catch(_){}}
function _projDragOver(e,id){if(_projDragId&&_projDragId!==id){e.preventDefault();e.currentTarget.style.outline='2px dashed var(--ac)';e.currentTarget.style.outlineOffset='-2px';}}
function _projDragLeave(e){e.currentTarget.style.outline='';}
function _projDragEnd(e){e.target.classList.remove('proj-dragging');document.querySelectorAll('.proj-card').forEach(el=>{el.style.outline='';});_projDragId=null;}
function _projDrop(e,targetId){
  e.preventDefault();e.currentTarget.style.outline='';
  if(!_projDragId||_projDragId===targetId)return;
  const visible=Array.from(document.querySelectorAll('.proj-card[data-project-id]')).map(el=>Number(el.dataset.projectId));
  const dragIdx=visible.indexOf(_projDragId);const dropIdx=visible.indexOf(targetId);
  if(dragIdx<0||dropIdx<0)return;
  visible.splice(dragIdx,1);visible.splice(dragIdx<dropIdx?dropIdx-1:dropIdx,0,_projDragId);
  visible.forEach((id,i)=>{const p=D.projects.find(x=>x.id===id);if(p)p.sortOrder=i;});
  const set=new Set(visible);
  D.projects.filter(p=>!set.has(p.id)).forEach((p,i)=>{p.sortOrder=visible.length+i+1000;});
  save('projects');renderProjects();
}
function openProjectDetail(pid){
  const p=D.projects.find(x=>x.id===pid);
  if(!p)return;
  const pts=D.tasks.filter(t=>t.projectId===pid);
  // Include linked external tasks in the rollup just like the card view does.
  const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>{
    const ov2=t.override;return ov2&&String(ov2.localProjectId||'')===String(pid)&&!ov2.tombstoned;
  });
  const extDoneN=extLinked.filter(t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);}).length;
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  const health=projectHealth(p);
  const doneN=pts.filter(t=>t.status==='Done').length+extDoneN;
  const ipN=pts.filter(t=>t.status==='In Progress').length;
  const nsN=pts.filter(t=>t.status==='Not Started').length+(extLinked.length-extDoneN);
  const odN=pts.filter(t=>t.status!=='Done'&&t.due&&t.due<_todayStr).length;
  const subs=pts.flatMap(t=>t.subtasks||[]);
  const ms=Array.isArray(p.milestones)?p.milestones:[];
  const msDone=ms.filter(m=>m.done).length;
  const totalAll=pts.length+extLinked.length;
  const autoPct=totalAll?Math.round(doneN/totalAll*100):null;
  const pct=p.pctManual?Math.max(0,Math.min(100,p.pct||0)):(autoPct!==null?autoPct:Math.max(0,Math.min(100,p.pct||0)));
  const goalIds=[...new Set(pts.map(t=>t.linkedGoalId).filter(Boolean))];
  const goals=(D.goals||[]).filter(g=>goalIds.includes(g.id)||g.projectId===pid);
  const statChip=(n,l,c)=>`<div style="flex:1;min-width:64px;background:var(--s2);border:1px solid var(--bd1);border-radius:9px;padding:9px;text-align:center"><div style="font-size:18px;font-weight:750;color:${c||'var(--t1)'};line-height:1">${n}</div><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.04em;margin-top:3px">${l}</div></div>`;
  const msRows=ms.length?ms.map((m,i)=>{
    const od=!m.done&&(m.date||m.due)&&(m.date||m.due)<_todayStr;
    return `<div class="lr" style="padding:7px 0;border-bottom:1px solid var(--bd1);align-items:center">
      <div class="chk ${m.done?'on':''}" style="flex-shrink:0" onclick="event.stopPropagation();(D.projects.find(x=>x.id===${pid}).milestones||[])[${i}].done=!(D.projects.find(x=>x.id===${pid}).milestones||[])[${i}].done;save('projects');openProjectDetail(${pid})"></div>
      <span class="rt" style="font-size:12px;${m.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m.title||m.name||'Milestone')}</span>
      ${(m.date||m.due)?`<span style="font-size:11px;color:${od?'var(--red)':'var(--t3)'};flex-shrink:0">${esc(m.date||m.due)}</span>`:''}
    </div>`;}).join(''):'<p style="font-size:11px;color:var(--t3);padding:4px 0">No milestones yet — add them in ✏ Edit Project.</p>';
  const taskRows=pts.slice().sort((a,b)=>(a.status==='Done')-(b.status==='Done')||(a.due||'9999').localeCompare(b.due||'9999')).map(t=>{
    const sb=t.subtasks||[];const sd=sb.filter(s=>s.done).length;
    const od=t.status!=='Done'&&t.due&&t.due<_todayStr;
    return`<div style="padding:6px 0;border-bottom:1px solid var(--bd1)">
      <div class="lr" onclick="closeDrawer();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))" style="cursor:pointer">
        <div class="chk ${t.status==='Done'?'on':''}" onclick="event.stopPropagation();(t=>setTaskStatus(t,t.status==='Done'?'In Progress':'Done'))(D.tasks.find(x=>x.id==${_tidLit(t.id)}));openProjectDetail(${_tidLit(pid)})"></div>
        <span class="rt" style="font-size:12px;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span>
        <span class="pill ${pillClass(t.priority)}" style="font-size:11px">${t.priority}</span>
        <span style="font-size:11px;color:${od?'var(--red)':'var(--t3)'};flex-shrink:0">${t.due||''}</span>
      </div>
      ${sb.length?`<div style="padding-left:24px;font-size:11px;color:var(--t3)">${sd}/${sb.length} subtasks</div>`:''}
    </div>`}).join('');
  d.innerHTML=`<h2 style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;border-radius:3px;background:${p.color}"></span>${p.icon?`<span style="font-size:18px;flex-shrink:0">${esc(p.icon)}</span>`:''}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</span><button class="close" onclick="closeDrawer()">✕</button></h2>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
    <span class="pill" style="background:color-mix(in srgb,${health.color} 16%,transparent);color:${health.color};font-weight:700">${health.icon} ${health.label}</span>
    <span class="pill ${statusPill(p.status)}">${p.status||'—'}</span>
    ${p.autoCreatedBy?(function(){
      const src=(p.autoSyncSource&&p.autoSyncSource.source)||(p.autoCreatedBy==='nifty-sync'?'nifty':'smartsheet');
      const label=src==='nifty'?'LSI · NiftyPM':'CF · Smartsheet';
      const color=src==='nifty'?'#9333ea':'#1f6feb';
      const sheetName=(p.autoSyncSource&&p.autoSyncSource.sheetName)?` · ${esc(p.autoSyncSource.sheetName)}`:'';
      return `<span class="pill" style="background:color-mix(in srgb,${color} 16%,transparent);color:${color};font-weight:600;font-size:11px" title="Auto-synced from ${esc(label)}${sheetName}">📊 Auto-synced${sheetName}</span>`;
    })():''}
    ${p.owner?`<span style="font-size:11px;color:var(--t3);align-self:center">👤 ${esc(p.owner)}</span>`:''}
    <span style="font-size:11px;color:${p.due&&p.due!=='TBD'&&p.due<_todayStr?'var(--red)':'var(--t3)'};align-self:center">📅 ${esc(p.due||'No due date')}</span>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <div style="background:conic-gradient(${p.color} ${pct}%,var(--s3) ${pct}%);width:52px;height:52px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center"><div style="width:40px;height:40px;border-radius:50%;background:var(--s1);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:750">${pct}%</div></div>
    <div style="display:flex;gap:6px;flex:1;flex-wrap:wrap">
      ${statChip(pts.length,'Tasks')}
      ${statChip(doneN,'Done','var(--ok)')}
      ${statChip(ipN,'Active','var(--ac)')}
      ${statChip(odN,'Overdue',odN?'var(--red)':'var(--t2)')}
      ${statChip(msDone+'/'+ms.length,'Milestones')}
    </div>
  </div>
  <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Project Health (velocity, burn, risk, ETA)</div>
  ${_renderHealthStrip(_projectHealth(pid))}
  ${p.desc?`<div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;margin-top:14px">Overview</div>
  <div class="md-body" style="font-size:13px;color:var(--t2);margin-bottom:16px;line-height:1.65;max-width:62ch">${renderMd(p.desc||'')}</div>`:''}
  <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;margin-top:14px">Milestones (${msDone}/${ms.length})</div>
  ${ms.length?`<div class="pb" style="margin-bottom:8px"><div class="f" style="width:${ms.length?Math.round(msDone/ms.length*100):0}%;background:${p.color}"></div></div>`:''}
  ${msRows}
  ${goals.length?`<div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:16px 0 5px">Linked goals (${goals.length})</div>${goals.map(g=>`<div class="lr" style="cursor:pointer;padding:6px 0" onclick="closeDrawer();openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))"><span>${g.icon||'🎯'}</span><span class="rt" style="font-size:12px">${esc(g.title)}</span><span style="font-size:11px;color:var(--t3)">${g.pct||0}%</span></div>`).join('')}`:''}
  <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:16px 0 5px">Tasks (${pts.length}) · ${subs.filter(s=>s.done).length}/${subs.length} subtasks</div>
  ${taskRows||'<p style="font-size:11px;color:var(--t3)">No tasks linked to this project yet.</p>'}
  ${_renderLinkedExternalTasksSection(pid)}
  <div style="display:flex;gap:8px;margin-top:16px;position:sticky;bottom:0;background:var(--s1);padding:10px 0;flex-wrap:wrap">
    <button class="btn btn-p" onclick="closeDrawer();openDrawer('project',D.projects.find(x=>x.id===${pid}))">✏ Edit Project</button>
    <button class="btn btn-s" onclick="closeDrawer();openFA('task')">+ Add task</button>
    <button class="btn btn-s" onclick="_openExternalTaskPicker(${pid})" title="Pick CF/LSI tasks to include in this project">🔗 Link external task</button>
    ${p.autoCreatedBy&&p.autoCreatedBy!=='smartsheet-sync'?`<button class="btn btn-s" style="color:#1f6feb;border-color:#1f6feb" onclick="_resyncProjectSource(${pid})" title="Pull fresh data from the originating Smartsheet/Nifty source">↻ Resync source</button>`:''}
    <button class="btn btn-s" style="color:var(--purp)" onclick="_aiProjectCoach(${pid})" title="AI health summary + blockers + suggested next milestone for this project">🩺 AI Coach</button>
    <button class="btn btn-s" style="color:var(--purp)" onclick="_aiProjectStatusUpdate(${pid})" title="AI-generated stakeholder summary you can paste into an email">✨ Status update</button>
    <button class="btn btn-s" onclick="closeDrawer()">Close</button>
  </div>`;
  ov.classList.add('show');
}

// ─── AI Project Status Update Generator ─────────────────────────────────────
// Reads the project's tasks (native + linked external), recent completions,
// upcoming work, then asks the AI for a stakeholder-ready summary in 4
// sections: Shipped / In Progress / Blocked or At Risk / Coming Next.
// Modal shows the result with copy-to-clipboard.
// AI Coach — health summary + blockers + suggested next milestone for one
// project. Reads native (D.tasks where projectId===pid) + linked external
// (override.localProjectId===pid), feeds the AI a compact snapshot, parses
// the JSON response into a structured modal card. Persists the latest
// coaching result under p.aiCoach so re-opening shows the most recent
// without spending another AI call.
async function _aiProjectCoach(pid){
  const p=(D.projects||[]).find(x=>String(x.id)===String(pid));
  if(!p)return;
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal){toast({type:'warn',title:'Modal not available'});return;}
  const {provider,configured}=_getAIConfig?_getAIConfig():{};
  if(!configured){toast({type:'warn',title:'AI key missing',msg:'Add a provider key in Settings → AI Features.'});return;}
  // Build snapshot.
  const today=_todayStr;
  const tMs=Date.now();
  const native=(D.tasks||[]).filter(t=>!t.parentTaskId&&String(t.projectId)===String(pid));
  const ext=(D.externalTasks||[]).filter(et=>{
    const ov=et.override;return ov&&String(ov.localProjectId||'')===String(pid)&&!ov.tombstoned;
  });
  const isExtDone=s=>_isExtDone(s);
  const rows=native.map(t=>({
    title:(t.title||'').slice(0,180),
    status:t.status||'',
    priority:t.priority||'',
    due:t.due||null,
    assignee:t.assignedTo||null,
    source:'native',
  })).concat(ext.map(et=>({
    title:(et.title||'').slice(0,180),
    status:isExtDone(et.status)?'Done':(et.status||'Open'),
    priority:(et.override&&et.override.localPriority)||et.priority||null,
    due:(et.override&&et.override.localDue)||et.due||null,
    assignee:et.assignee||null,
    source:et.source==='smartsheet'?'CF':'LSI',
  })));
  // Cap snapshot — 50 rows is enough signal without bloating the prompt.
  const snapshot={
    project:{name:p.name||'',description:(p.desc||'').slice(0,500)},
    counts:{
      total:rows.length,
      done:rows.filter(r=>r.status==='Done').length,
      overdue:rows.filter(r=>r.status!=='Done'&&r.due&&r.due<today).length,
      open:rows.filter(r=>r.status!=='Done').length,
    },
    sample:rows.slice(0,50),
  };
  // Render the loading state.
  modal.innerHTML=`<div style="padding:14px;max-width:640px"><div style="font-size:14px;font-weight:600;margin-bottom:6px">🩺 AI Coach is reading "${esc(p.name||'')}"…</div><div style="font-size:11px;color:var(--t3);line-height:1.55">Reading ${rows.length} task${rows.length===1?'':'s'} (${snapshot.counts.open} open · ${snapshot.counts.overdue} overdue · ${snapshot.counts.done} done). Usually takes ~10s.</div></div>`;
  modalBg.classList.add('show');
  try{
    const sys=`You are a senior project coach reviewing a specific project. Read the snapshot and output STRICTLY one JSON object, no prose or markdown:
{
  "headline": "<one sentence on the project's state, 15-25 words>",
  "health": "<one of: on-track | at-risk | blocked | stalled>",
  "summary": "<2-3 sentences on progress, momentum, and notable items, 50-80 words>",
  "blockers": [ {"title":"<task title>", "why":"<one sentence on what's stuck, ~15 words>"} ],
  "nextMilestone": "<concrete next milestone or deliverable, ~15-20 words>",
  "recommendedFocus": [ "<concrete action 1, ~12 words>", "<action 2>", "<action 3>" ]
}
Pick 0-4 blockers (only real ones), exactly 3 recommendedFocus items. Items in blockers MUST come from the sample. Be specific and use real task titles.`;
    const userContent=`Project snapshot:\n${JSON.stringify(snapshot)}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent,provider:provider||'manus'},'mutation');
    const raw=String(res?.result||res?.text||'').trim();
    const m=raw.match(/\{[\s\S]*\}/);
    if(!m)throw new Error('AI returned no JSON');
    const coach=JSON.parse(m[0]);
    // Persist.
    p.aiCoach={dateISO:new Date().toISOString(),coach};
    save('projects');
    // Render the structured card.
    const healthColors={'on-track':'#10b981','at-risk':'#f59e0b','blocked':'#ef4444','stalled':'#64748b'};
    const hc=healthColors[coach.health]||'var(--t3)';
    const sec=(emoji,title,items)=>{
      if(!items||!items.length)return '';
      return `<div style="margin-top:12px"><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${emoji} ${title}</div><ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px">${items.slice(0,4).map(it=>{
        if(typeof it==='string')return `<li style="font-size:12px;color:var(--t1);padding:5px 9px;background:var(--s3);border-radius:5px">${esc(it)}</li>`;
        return `<li style="font-size:12px;color:var(--t1);padding:6px 9px;background:var(--s3);border-radius:5px"><div style="font-weight:600">${esc(it.title||'')}</div>${it.why?`<div style="font-size:11px;color:var(--t2);margin-top:2px">${esc(it.why)}</div>`:''}</li>`;
      }).join('')}</ul></div>`;
    };
    const freshness=_relTime(p.aiCoach&&p.aiCoach.dateISO);
    modal.innerHTML=`<div style="padding:16px;max-width:640px;max-height:80vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <div>
          <h2 style="font-size:15px;font-weight:650;margin:0">🩺 AI Coach · ${esc(p.name||'')}</h2>
          ${freshness?`<div style="font-size:11px;color:var(--t3);margin-top:2px">Generated ${esc(freshness)}</div>`:''}
        </div>
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:11px;background:color-mix(in srgb,${hc} 18%,transparent);color:${hc};text-transform:uppercase;letter-spacing:.05em">${esc(coach.health||'unknown')}</span>
      </div>
      <div style="font-size:13px;color:var(--t1);font-style:italic;padding:10px 12px;background:color-mix(in srgb,${hc} 10%,transparent);border-left:3px solid ${hc};border-radius:4px;margin-bottom:10px">"${esc(coach.headline||'')}"</div>
      <div style="font-size:12px;color:var(--t2);line-height:1.6">${esc(coach.summary||'')}</div>
      ${sec('🚧','Blockers',coach.blockers||[])}
      ${coach.nextMilestone?`<div style="margin-top:12px"><div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">🎯 Suggested next milestone</div><div style="font-size:12px;color:var(--t1);padding:7px 10px;background:color-mix(in srgb,var(--ac) 12%,transparent);border-radius:5px;font-weight:500">${esc(coach.nextMilestone)}</div></div>`:''}
      ${sec('⚡','Recommended focus this week',coach.recommendedFocus||[])}
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:14px;padding-top:10px;border-top:1px solid var(--bd1)">
        <button class="btn btn-s" onclick="_copyCoachToClipboard(${pid})" title="Copy as markdown">📋 Copy</button>
        <button class="btn btn-s" onclick="_aiProjectCoach(${pid})" title="Regenerate">↻ Refresh</button>
        <button class="btn btn-p" onclick="closeModal()">Done</button>
      </div>
    </div>`;
  }catch(e){
    modal.innerHTML=`<div style="padding:14px;max-width:480px"><div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--red)">⚠ Coach failed</div><div style="font-size:11px;color:var(--t2);line-height:1.55">${esc(e.message||String(e))}</div><div style="margin-top:10px;display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-s" onclick="closeModal()">Close</button></div></div>`;
  }
}
function _copyCoachToClipboard(pid){
  const p=(D.projects||[]).find(x=>String(x.id)===String(pid));
  if(!p||!p.aiCoach||!p.aiCoach.coach){toast({type:'warn',title:'No coach result to copy'});return;}
  const c=p.aiCoach.coach;
  const lines=[];
  lines.push(`# ${p.name||''} — AI Coach`);
  lines.push(`*Health: ${c.health||'unknown'}*`);
  lines.push('');
  if(c.headline)lines.push(`> ${c.headline}`);
  lines.push('');
  if(c.summary)lines.push(c.summary);
  if(c.blockers&&c.blockers.length){lines.push('');lines.push('**Blockers**');c.blockers.forEach(b=>lines.push(`- **${b.title||''}** — ${b.why||''}`));}
  if(c.nextMilestone){lines.push('');lines.push('**Next milestone**');lines.push(`- ${c.nextMilestone}`);}
  if(c.recommendedFocus&&c.recommendedFocus.length){lines.push('');lines.push('**Recommended focus**');c.recommendedFocus.forEach(a=>lines.push(`- ${a}`));}
  const md=lines.join('\n');
  try{navigator.clipboard.writeText(md).then(()=>toast({type:'success',title:'Coach summary copied',duration:1800}),fallback);}catch(_){fallback();}
  function fallback(){const ta=document.createElement('textarea');ta.value=md;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast({type:'success',title:'Copied',duration:1600});}catch{}ta.remove();}
}

async function _aiProjectStatusUpdate(pid){
  const p=(D.projects||[]).find(x=>x.id===pid);
  if(!p)return;
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal){toast({type:'warn',title:'Modal not available'});return;}
  modal.innerHTML=`<div style="padding:14px;max-width:640px"><div style="font-size:13px;font-weight:600;margin-bottom:6px">✨ Generating status update for "${esc(p.name)}"…</div><div style="font-size:11px;color:var(--t3)">Reading tasks, recent completions, and upcoming work — usually takes ~10s.</div></div>`;
  modalBg.classList.add('show');
  try{
    const today=_todayStr;
    const wkStart=new Date();wkStart.setDate(wkStart.getDate()-7);const wkStartStr=_ymd(wkStart);
    const horizon=new Date();horizon.setDate(horizon.getDate()+14);const horizonStr=_ymd(horizon);
    // Native tasks scoped to this project
    const nativePts=_topLevelTasks(D.tasks).filter(t=>t.projectId===pid);
    // External tasks linked to this project
    const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>{
      const ov=t.override;return ov&&String(ov.localProjectId||'')===String(pid)&&!ov.tombstoned;
    });
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    const shipped=[
      ...nativePts.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)>=wkStartStr).map(t=>({src:'P',t:t.title,when:_dayOf(t.completedAt)})),
      ...extLinked.filter(t=>isExtDone(t)&&t.completedAt&&(_ymd(_pd(t.completedAt)))>=wkStartStr).map(t=>({src:t.source==='smartsheet'?'CF':'LSI',t:t.title,when:_ymd(_pd(t.completedAt))})),
    ];
    const inProg=[
      ...nativePts.filter(t=>t.status==='In Progress').map(t=>({src:'P',t:t.title,due:t.due||null,priority:t.priority||null})),
      ...extLinked.filter(t=>!isExtDone(t)&&/(in.?progress|doing|active|working)/i.test(t.status||'')).map(t=>({src:t.source==='smartsheet'?'CF':'LSI',t:t.title,due:(t.override&&t.override.localDue)||t.due||null,priority:(t.override&&t.override.localPriority)||t.priority||null})),
    ];
    const blocked=nativePts.filter(t=>t.status!=='Done'&&(t.blockedBy||t.status==='On Hold'||/blocked|on.?hold|delayed/i.test(t.notes||''))).map(t=>({src:'P',t:t.title,why:t.blockedBy?'predecessor incomplete':t.status||'flagged'}));
    const overdue=[
      ...nativePts.filter(t=>t.status!=='Done'&&t.due&&t.due<today).map(t=>({src:'P',t:t.title,due:t.due})),
      ...extLinked.filter(t=>!isExtDone(t)&&((t.override&&t.override.localDue)||t.due)&&(((t.override&&t.override.localDue)||t.due)<today)).map(t=>({src:t.source==='smartsheet'?'CF':'LSI',t:t.title,due:(t.override&&t.override.localDue)||t.due})),
    ];
    const upcoming=[
      ...nativePts.filter(t=>t.status!=='Done'&&t.due&&t.due>=today&&t.due<=horizonStr).map(t=>({src:'P',t:t.title,due:t.due})),
      ...extLinked.filter(t=>!isExtDone(t)&&((t.override&&t.override.localDue)||t.due)&&(((t.override&&t.override.localDue)||t.due)>=today)&&(((t.override&&t.override.localDue)||t.due)<=horizonStr)).map(t=>({src:t.source==='smartsheet'?'CF':'LSI',t:t.title,due:(t.override&&t.override.localDue)||t.due})),
    ];
    const totalDone=nativePts.filter(t=>t.status==='Done').length+extLinked.filter(isExtDone).length;
    const totalAll=nativePts.length+extLinked.length;
    const pctNow=totalAll?Math.round(totalDone/totalAll*100):0;
    const compact={project:p.name,owner:p.owner,due:p.due,description:p.desc||'',pct:pctNow,totalTasks:totalAll,doneTasks:totalDone,shipped:shipped.slice(0,25),inProgress:inProg.slice(0,25),blockedOrAtRisk:blocked.concat(overdue).slice(0,15),upcoming:upcoming.slice(0,20)};
    const sys=`You are writing a project status update for a COO/CEO to share with executive stakeholders. Read the project data and produce a concise, professional status update with exactly these sections (use ## headings, plain markdown):

## Headline
One short sentence ($pct% complete framing) capturing overall health and momentum.

## Shipped this week
Bulleted list of the most meaningful completions (3-6 items max). Group [CF]/[LSI] tags when relevant.

## In progress
Bulleted list of active work (3-6 items). Note urgency.

## Risks & blockers
Bulleted list of overdue items, on-hold work, dependencies. If none: write "None flagged this week — green health."

## Coming next (2 weeks)
Bulleted list of the most important upcoming items (3-6 max).

Tone: factual, exec-ready, no fluff. Reference real task titles. No more than 250 words total. No greeting, no signoff.`;
    const {provider,configured}=typeof _getAIConfig==='function'?_getAIConfig():{provider:'manus',configured:true};
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:JSON.stringify(compact),provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim()||'(AI returned empty — check your AI key in Settings → AI Features.)';
    modal.innerHTML=`<div style="padding:14px;max-width:680px;max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600">✨ Status Update — ${esc(p.name)}</div>
        <button class="btn btn-s" style="font-size:11px" onclick="navigator.clipboard.writeText(document.getElementById('ai-status-text').innerText);toast({type:'success',title:'Copied to clipboard'})">📋 Copy</button>
      </div>
      <div id="ai-status-text" style="flex:1;overflow-y:auto;padding:12px;background:var(--s2);border-radius:6px;font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(text)}</div>
      <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px">
        <button class="btn btn-s" onclick="_aiProjectStatusUpdate(${pid})">↻ Regenerate</button>
        <button class="btn btn-p" onclick="closeModal()">Done</button>
      </div>
    </div>`;
  }catch(e){
    modal.innerHTML=`<div style="padding:14px;max-width:480px"><div style="color:var(--red);font-size:11px;margin-bottom:10px">Generation failed: ${esc(e.message||String(e))}</div><button class="btn" onclick="closeModal()">Close</button></div>`;
  }
}

// ─── Custom Fields (per-project field defs + per-task values) ──────────────
// Phase-1 scope: text / number / select / date types. Field defs live in
// project_custom_field_defs; values in task_custom_field_values. Server
// router exposes CRUD; client lazily loads + renders inline in the project
// edit drawer (manage) and task drawer (set values).

async function _hydrateProjectCustomFieldsList(pid){
  const host=document.getElementById('proj-custom-fields-list');
  if(!host)return;
  try{
    const defs=await _trpc('customFields.listForProject',{projectId:String(pid)},'query');
    if(!defs.length){host.innerHTML='<em>No custom fields defined for this project yet. Click "+ Add field" to create one.</em>';return;}
    host.innerHTML=defs.map(f=>{
      const opts=f.options?(()=>{try{return JSON.parse(f.options);}catch{return [];}})():null;
      const optLabel=Array.isArray(opts)&&opts.length?` · options: ${opts.join(' / ')}`:'';
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd1)">
        <span style="font-size:11px;font-weight:500;flex:1">${esc(f.name)}</span>
        <span style="font-size:11px;color:var(--t3)">${esc(f.type)}${esc(optLabel)}</span>
        <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" onclick="_editCustomField(${f.id},${pid})" title="Edit">✎</button>
        <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px;color:var(--red)" onclick="_deleteCustomField(${f.id},${pid})" title="Delete">✕</button>
      </div>`;
    }).join('');
  }catch(e){host.innerHTML=`<span style="color:var(--red)">Failed: ${esc(e.message||String(e))}</span>`;}
}

function _openCustomFieldEditor(pid,existing){
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal)return;
  const f=existing||{name:'',type:'text',options:''};
  modal.innerHTML=`<div style="padding:14px;max-width:420px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">${existing?'Edit':'New'} custom field</div>
    <div class="field"><label>Name</label><input id="cf-name" class="inp" value="${esc(f.name)}" placeholder="e.g. Sprint, Stakeholder, Risk Level"></div>
    <div class="field"><label>Type</label>
      <select id="cf-type" class="inp" onchange="document.getElementById('cf-opts-row').style.display=this.value==='select'?'':'none'">
        ${['text','number','select','date'].map(v=>`<option value="${v}" ${f.type===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="cf-opts-row" style="display:${f.type==='select'?'':'none'}">
      <label>Options (comma-separated)</label>
      <input id="cf-opts" class="inp" value="${esc(Array.isArray(f.options)?f.options.join(', '):(f.options||''))}" placeholder="e.g. Low, Medium, High">
    </div>
    <div class="dr-actions" style="display:flex;gap:6px;justify-content:flex-end;margin-top:12px">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_saveCustomField(${pid},${existing?existing.id:'null'})">Save</button>
    </div>
  </div>`;
  modalBg.classList.add('show');
}

async function _saveCustomField(pid,fieldId){
  const name=document.getElementById('cf-name').value.trim();
  const type=document.getElementById('cf-type').value;
  const opts=document.getElementById('cf-opts').value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!name){toast({type:'warn',title:'Field name required'});return;}
  try{
    if(fieldId){
      await _trpc('customFields.updateField',{fieldId,name,type,options:type==='select'?opts:null},'mutation');
    }else{
      await _trpc('customFields.createField',{projectId:String(pid),name,type,options:type==='select'?opts:undefined},'mutation');
    }
    closeModal();
    toast({type:'success',title:'Field saved',duration:1500});
    await _hydrateProjectCustomFieldsList(pid);
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

async function _editCustomField(fieldId,pid){
  try{
    const defs=await _trpc('customFields.listForProject',{projectId:String(pid)},'query');
    const f=defs.find(x=>x.id===fieldId);
    if(!f)return;
    const opts=f.options?(()=>{try{return JSON.parse(f.options);}catch{return [];}})():null;
    _openCustomFieldEditor(pid,{id:f.id,name:f.name,type:f.type,options:opts});
  }catch(e){toast({type:'warn',title:'Load failed',msg:e.message||String(e)});}
}

async function _deleteCustomField(fieldId,pid){
  if(!confirm('Delete this custom field and ALL its values across every task in this project? Cannot be undone.'))return;
  try{
    await _trpc('customFields.deleteField',{fieldId},'mutation');
    toast({type:'success',title:'Field deleted',duration:1500});
    await _hydrateProjectCustomFieldsList(pid);
  }catch(e){toast({type:'warn',title:'Delete failed',msg:e.message||String(e)});}
}

// Task drawer: render custom-field inputs for the task's project (if any).
async function _hydrateTaskCustomFields(t){
  if(!t||!t.projectId)return;
  try{
    const defs=await _trpc('customFields.listForProject',{projectId:String(t.projectId)},'query');
    if(!defs.length)return;
    const taskId=String(t.taskId||t.id);
    const values=await _trpc('customFields.getValuesForTask',{taskId},'query');
    // Insert section into the drawer right before .dr-actions
    const drawer=document.getElementById('drawer-content');
    const acts=drawer.querySelector('.dr-actions');
    if(!acts)return;
    const section=document.createElement('div');
    section.className='field';
    section.style.cssText='margin-top:14px;padding-top:10px;border-top:1px dashed var(--bd1)';
    section.innerHTML=`<label style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px;display:block">Custom Fields <span style="font-size:11px;color:var(--t3);font-weight:400">(from project)</span></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${defs.map(f=>{
        const v=values[String(f.id)]||'';
        const opts=f.options?(()=>{try{return JSON.parse(f.options);}catch{return [];}})():[];
        let input='';
        if(f.type==='select'){
          input=`<select class="inp" data-cf-id="${f.id}" data-cf-task="${esc(taskId)}" style="font-size:11px;height:28px" onchange="_setCustomFieldValue(this)">
            <option value="">—</option>
            ${(opts||[]).map(o=>`<option value="${esc(o)}" ${v===o?'selected':''}>${esc(o)}</option>`).join('')}
          </select>`;
        }else if(f.type==='number'){
          input=`<input class="inp" type="number" value="${esc(v)}" data-cf-id="${f.id}" data-cf-task="${esc(taskId)}" style="font-size:11px;height:28px" onchange="_setCustomFieldValue(this)">`;
        }else if(f.type==='date'){
          input=`<input class="inp" type="date" value="${esc(v)}" data-cf-id="${f.id}" data-cf-task="${esc(taskId)}" style="font-size:11px;height:28px" onchange="_setCustomFieldValue(this)">`;
        }else{
          input=`<input class="inp" value="${esc(v)}" data-cf-id="${f.id}" data-cf-task="${esc(taskId)}" style="font-size:11px;height:28px" onblur="_setCustomFieldValue(this)">`;
        }
        return `<div><div style="font-size:11px;color:var(--t2);margin-bottom:3px">${esc(f.name)}</div>${input}</div>`;
      }).join('')}</div>`;
    acts.parentNode.insertBefore(section,acts);
  }catch{ /* silent — custom fields are optional */ }
}

async function _setCustomFieldValue(el){
  const fieldId=parseInt(el.getAttribute('data-cf-id'),10);
  const taskId=el.getAttribute('data-cf-task');
  const value=el.value||null;
  try{
    await _trpc('customFields.setValue',{taskId,fieldId,value},'mutation');
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}

// ─── Project Edit Drawer: Tasks section ────────────────────────────────────
// Embedded in the Edit Project drawer so the user can manage what work is
// scoped to a project without leaving the edit modal. Shows native tasks
// (assign / unassign via projectId) AND external tasks (link / unlink via
// override.localProjectId), and has an inline add-task input.
function _renderProjectEditTasksSection(pid){
  const native=(D.tasks||[]).filter(t=>t.projectId===pid);
  const ext=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>{
    const ov=t.override;return ov&&String(ov.localProjectId||'')===String(pid)&&!ov.tombstoned;
  });
  const nativeRows=native.map(t=>{
    const done=t.status==='Done';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd1);font-size:11px">
      <span style="flex:1;${done?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span>
      ${t.priority?`<span class="pill ${pillClass(t.priority)}" style="font-size:9px">${t.priority}</span>`:''}
      ${t.due?`<span style="font-size:11px;color:var(--t3)">${esc(t.due)}</span>`:''}
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" title="Unassign from project" onclick="_unassignNativeFromProject(${_tidLit(t.id)},${pid})">✕</button>
    </div>`;
  }).join('');
  const extRows=ext.map(t=>{
    const url=t.externalUrl||'#';
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd1);font-size:11px;background:rgba(${t.source==='smartsheet'?'31,111,235':'147,51,234'},0.04)">
      ${_extSourceBadge(t.source)}
      <a ${_extOpenAttrs(url)} style="flex:1;color:var(--t1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</a>
      ${t.status?`<span style="font-size:11px;color:var(--t3)">${esc(t.status)}</span>`:''}
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" title="Unlink from project" onclick="_unlinkExternalFromProjectFromEdit('${t.source}','${esc(t.externalId)}',${pid})">✕</button>
    </div>`;
  }).join('');
  const total=native.length+ext.length;
  return `<div class="field" style="margin-top:14px">
    <label style="display:flex;align-items:center;justify-content:space-between">
      <span>Tasks (${total})</span>
      <button type="button" class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px" onclick="_openExternalTaskPicker(${pid})" title="Link external tasks from Smartsheet / NiftyPM">🔗 Link external</button>
    </label>
    <div style="margin-top:4px;padding:8px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px">
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="proj-edit-newtask" class="inp" placeholder="+ Add a new task to this project (press Enter)" style="flex:1;font-size:11px;height:28px" onkeydown="if(event.key==='Enter'){event.preventDefault();_addNativeTaskToProjectFromEdit(${pid})}">
        <button class="btn btn-p" style="height:28px;font-size:11px" onclick="_addNativeTaskToProjectFromEdit(${pid})">+ Add</button>
      </div>
      <div style="max-height:220px;overflow-y:auto">
        ${nativeRows}${extRows}
        ${total===0?'<div style="font-size:11px;color:var(--t3);text-align:center;padding:8px">No tasks yet. Add one above or link an external task.</div>':''}
      </div>
    </div>
  </div>`;
}

function _addNativeTaskToProjectFromEdit(pid){
  const inp=document.getElementById('proj-edit-newtask');
  if(!inp)return;
  const title=inp.value.trim();
  if(!title){inp.focus();return;}
  const p=D.projects.find(x=>x.id===pid);
  const newId=Date.now();
  D.tasks.push({
    id:newId,
    title,
    status:'Not Started',
    priority:'Medium',
    projectId:pid,
    project:p?p.name:'',
    createdBy:(D.creds&&D.creds.userName)||'Idris Grant',
    createdAt:new Date().toISOString(),
  });
  save('tasks');
  inp.value='';
  // Re-render the drawer in place so the new row appears without losing edits.
  const cur=D.projects.find(x=>x.id===pid);
  if(cur){
    const d=document.getElementById('drawer-content');
    if(d){d.innerHTML=renderDrawer('project',cur);}
    setTimeout(()=>{const i=document.getElementById('proj-edit-newtask');if(i)i.focus();},0);
  }
  toast({type:'success',title:'Task added to project',duration:1500});
}

function _unassignNativeFromProject(taskId,pid){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  if(!confirm(`Unassign "${(t.title||'').slice(0,60)}" from this project? The task itself stays — only the project link is removed.`))return;
  t.projectId=null;
  t.project='';
  save('tasks');
  const cur=D.projects.find(x=>x.id===pid);
  const d=document.getElementById('drawer-content');
  if(cur&&d){d.innerHTML=renderDrawer('project',cur);}
  toast({type:'info',title:'Unassigned',duration:1500});
}

async function _unlinkExternalFromProjectFromEdit(source,externalId,pid){
  try{
    await _trpc('externalSources.upsertOverride',{source,externalId,localProjectId:null},'mutation');
    await loadExternalTasks();
    const cur=D.projects.find(x=>x.id===pid);
    const d=document.getElementById('drawer-content');
    if(cur&&d){d.innerHTML=renderDrawer('project',cur);}
    toast({type:'success',title:'Unlinked',duration:1500});
  }catch(e){toast({type:'warn',title:'Unlink failed',msg:e.message||String(e)});}
}

// External-task section on the project detail drawer. Renders rows for any
// external task whose override.localProjectId matches this project, with
// source badge + deep-link + unlink button. Empty when no links.
function _renderLinkedExternalTasksSection(pid){
  const ext=Array.isArray(D.externalTasks)?D.externalTasks.filter(t=>{
    const ov=t.override;
    return ov && String(ov.localProjectId||'')===String(pid) && !ov.tombstoned;
  }):[];
  if(!ext.length)return '';
  const rows=ext.map(t=>{
    const url=t.externalUrl||'#';
    const ov=t.override||{};
    const due=ov.localDue||t.due;
    return `<div class="lr" style="padding:6px 0;border-bottom:1px solid var(--bd1);background:rgba(${t.source==='smartsheet'?'31,111,235':'147,51,234'},0.04)">
      ${_extSourceBadge(t.source)}
      <a ${_extOpenAttrs(url)} title="Open in source" style="flex:1;font-size:12px;color:var(--t1);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</a>
      ${t.status?`<span style="font-size:11px;color:var(--t3)">${esc(t.status)}</span>`:''}
      ${due?`<span style="font-size:11px;color:var(--t3);flex-shrink:0">${due}</span>`:''}
      <button class="btn btn-s" style="height:18px;font-size:10px;padding:0 5px" onclick="_unlinkExternalFromProject('${t.source}','${esc(t.externalId)}',${pid})" title="Unlink from this project">✕</button>
    </div>`;
  }).join('');
  return `<div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:16px 0 5px">🔗 External tasks (${ext.length})</div>${rows}`;
}

async function _unlinkExternalFromProject(source,externalId,pid){
  try{
    await _trpc('externalSources.upsertOverride',{source,externalId,localProjectId:null},'mutation');
    await loadExternalTasks();
    openProjectDetail(pid);
    toast({type:'success',title:'Unlinked'});
  }catch(e){toast({type:'warn',title:'Unlink failed',msg:e.message||String(e)});}
}

// ─── External-task picker modal ─────────────────────────────────────────────
// Multi-select picker for "+ Link external task" on a project. Lists every
// non-tombstoned external task with a checkbox preselected for ones already
// linked to THIS project. Filterable by source + search-by-title.
let _extPickerProjectId=null;
let _extPickerSourceFilter='all'; // 'all' | 'smartsheet' | 'nifty'
let _extPickerSearch='';
function _openExternalTaskPicker(pid){
  _extPickerProjectId=pid;
  _extPickerSourceFilter='all';
  _extPickerSearch='';
  const modalBg=document.getElementById('modal-capture');
  const modal=document.getElementById('modal-content');
  if(!modalBg||!modal){toast({type:'warn',title:'Modal not available'});return;}
  modal.innerHTML=_renderExtPickerHTML();
  modalBg.classList.add('show');
}
function _renderExtPickerHTML(){
  const pid=_extPickerProjectId;
  const p=(D.projects||[]).find(x=>String(x.id)===String(pid));
  const ext=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>!(t.override&&t.override.tombstoned));
  const q=_extPickerSearch.toLowerCase();
  const filtered=ext.filter(t=>{
    if(_extPickerSourceFilter!=='all'&&t.source!==_extPickerSourceFilter)return false;
    if(q&&!(t.title||'').toLowerCase().includes(q))return false;
    return true;
  });
  const linkedSet=new Set(ext.filter(t=>t.override&&String(t.override.localProjectId||'')===String(pid)).map(t=>t.source+':'+t.externalId));
  const rows=filtered.slice(0,300).map(t=>{
    const key=t.source+':'+t.externalId;
    const linked=linkedSet.has(key);
    const otherProj=t.override&&t.override.localProjectId&&String(t.override.localProjectId)!==String(pid);
    const otherProjName=otherProj?((D.projects||[]).find(p=>String(p.id)===String(t.override.localProjectId))?.name||'another project'):'';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--bd1);font-size:11px;cursor:pointer">
      <input type="checkbox" data-ext-pick-key="${esc(key)}" data-source="${t.source}" data-external-id="${esc(t.externalId)}" ${linked?'checked':''}>
      ${_extSourceBadge(t.source)}
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
      ${t.status?`<span style="font-size:11px;color:var(--t3)">${esc(t.status)}</span>`:''}
      ${otherProj?`<span title="Already linked to: ${esc(otherProjName)}" style="font-size:11px;color:var(--warn)">↪ ${esc(otherProjName.slice(0,16))}</span>`:''}
    </label>`;
  }).join('');
  const tooMany=filtered.length>300?`<div style="font-size:11px;color:var(--t3);padding:6px;text-align:center">… showing first 300 of ${filtered.length}. Use search to narrow.</div>`:'';
  return `<div style="padding:14px;max-width:680px;max-height:80vh;display:flex;flex-direction:column">
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">Link external tasks to <em>${esc(p?p.name:'project')}</em></div>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">Check tasks to include them on this project's page. Unchecking removes the link (the task itself stays in its source).</div>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      ${['all','smartsheet','nifty'].map(s=>`<button class="btn btn-s" style="font-size:11px;background:${_extPickerSourceFilter===s?'var(--ac)':'transparent'};color:${_extPickerSourceFilter===s?'#fff':'var(--t2)'}" onclick="_extPickerSourceFilter='${s}';document.getElementById('modal-content').innerHTML=_renderExtPickerHTML()">${s==='all'?'All':(s==='smartsheet'?'CF only':'LSI only')}</button>`).join('')}
      <input id="ext-pick-search" class="inp" placeholder="Search title…" style="flex:1;font-size:11px;height:26px" value="${esc(_extPickerSearch)}" oninput="_extPickerSearch=this.value;document.getElementById('ext-pick-results').innerHTML=_renderExtPickerRows();setTimeout(()=>document.getElementById('ext-pick-search').focus(),0)">
    </div>
    <div id="ext-pick-results" style="flex:1;overflow-y:auto;border:1px solid var(--bd1);border-radius:6px;margin-bottom:10px">${rows||'<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">No matching external tasks.</div>'}${tooMany}</div>
    <div style="display:flex;gap:6px;justify-content:flex-end">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_saveExternalTaskPicker()">Save links</button>
    </div>
  </div>`;
}
// Lighter re-render for the search input (preserves focus + scroll)
function _renderExtPickerRows(){
  const ext=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>!(t.override&&t.override.tombstoned));
  const q=_extPickerSearch.toLowerCase();
  const pid=_extPickerProjectId;
  const filtered=ext.filter(t=>{
    if(_extPickerSourceFilter!=='all'&&t.source!==_extPickerSourceFilter)return false;
    if(q&&!(t.title||'').toLowerCase().includes(q))return false;
    return true;
  });
  const linkedSet=new Set(ext.filter(t=>t.override&&String(t.override.localProjectId||'')===String(pid)).map(t=>t.source+':'+t.externalId));
  const rows=filtered.slice(0,300).map(t=>{
    const key=t.source+':'+t.externalId;
    const linked=linkedSet.has(key);
    const otherProj=t.override&&t.override.localProjectId&&String(t.override.localProjectId)!==String(pid);
    const otherProjName=otherProj?((D.projects||[]).find(p=>String(p.id)===String(t.override.localProjectId))?.name||'another project'):'';
    return `<label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--bd1);font-size:11px;cursor:pointer">
      <input type="checkbox" data-ext-pick-key="${esc(key)}" data-source="${t.source}" data-external-id="${esc(t.externalId)}" ${linked?'checked':''}>
      ${_extSourceBadge(t.source)}
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
      ${t.status?`<span style="font-size:11px;color:var(--t3)">${esc(t.status)}</span>`:''}
      ${otherProj?`<span title="Already linked to: ${esc(otherProjName)}" style="font-size:11px;color:var(--warn)">↪ ${esc(otherProjName.slice(0,16))}</span>`:''}
    </label>`;
  }).join('');
  return rows||'<div style="padding:14px;text-align:center;color:var(--t3);font-size:11px">No matching external tasks.</div>';
}

async function _saveExternalTaskPicker(){
  const pid=_extPickerProjectId;
  // Compute desired diff: what's checked now vs the user's current localProjectId state.
  const allCheckboxes=document.querySelectorAll('[data-ext-pick-key]');
  const toLink=[];
  const toUnlink=[];
  const ext=Array.isArray(D.externalTasks)?D.externalTasks:[];
  const currentlyLinked=new Set(ext.filter(t=>t.override&&String(t.override.localProjectId||'')===String(pid)).map(t=>t.source+':'+t.externalId));
  allCheckboxes.forEach(cb=>{
    const key=cb.getAttribute('data-ext-pick-key');
    const source=cb.getAttribute('data-source');
    const externalId=cb.getAttribute('data-external-id');
    if(cb.checked&&!currentlyLinked.has(key))toLink.push({source,externalId});
    else if(!cb.checked&&currentlyLinked.has(key))toUnlink.push({source,externalId});
  });
  if(!toLink.length&&!toUnlink.length){closeModal();toast({type:'info',title:'No changes'});return;}
  try{
    if(toLink.length)await _trpc('externalSources.setProjectLinks',{projectId:String(pid),tasks:toLink},'mutation');
    if(toUnlink.length)await _trpc('externalSources.setProjectLinks',{projectId:null,tasks:toUnlink},'mutation');
    closeModal();
    toast({type:'success',title:`Updated ${toLink.length+toUnlink.length} link${toLink.length+toUnlink.length===1?'':'s'}`});
    await loadExternalTasks();
    // Re-render whichever surface launched the picker: Edit drawer (shows
    // "Edit Project" h2) or the Detail drawer (shows project name in h2).
    const d=document.getElementById('drawer-content');
    const isEditDrawer=d && /Edit Project/.test(d.innerHTML.slice(0,400));
    if(isEditDrawer){
      const cur=D.projects.find(x=>x.id===pid);
      if(cur)d.innerHTML=renderDrawer('project',cur);
    }else{
      openProjectDetail(pid);
    }
  }catch(e){toast({type:'warn',title:'Save failed',msg:e.message||String(e)});}
}
function renderProjectsKanban(header){
  const cols=['Not Started','In Progress','On Hold','Completed'];
  const colMap={'Not Started':'Not Started','Active':'In Progress','On Hold':'On Hold','Completed':'Completed'};
  // Apply filters (search + health + archive) but ignore the status select since columns ARE statuses.
  const savedStatus=_projStatusFilter;_projStatusFilter='All';
  const filtered=_filteredProjects();
  _projStatusFilter=savedStatus;
  const colHtml=cols.map(col=>{
    const ps=filtered.filter(p=>(colMap[p.status]||p.status)===col);
    return`<div style="flex:1;min-width:180px;max-width:260px">
      <div style="font-size:11px;font-weight:600;padding:6px 8px;border-radius:6px 6px 0 0;background:var(--s3);margin-bottom:6px">${col} <span style="font-size:11px;color:var(--t3)">(${ps.length})</span></div>
      ${ps.map(p=>`<div class="cd" style="cursor:pointer;margin-bottom:6px;border-left:3px solid ${p.color};${p.archived?'opacity:.55':''}" onclick="openProjectDetail(${p.id})">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px"><span style="cursor:pointer;font-size:13px;${p.pinned?'color:var(--warn)':'color:var(--t3)'}" onclick="_projToggleStar(${p.id},event)">${p.pinned?'★':'☆'}</span><span style="font-size:12px;font-weight:500;flex:1">${p.icon?esc(p.icon)+' ':''}${esc(p.name)}</span></div>
        <div style="font-size:11px;color:var(--t3)">Due ${p.due||'—'} · ${p.pct||0}%</div>
        <div class="pb" style="margin-top:4px"><div class="f" style="width:${p.pct||0}%;background:${p.color}"></div></div>
      </div>`).join('')}
      <div class="add-c" onclick="openModal('capture')" style="font-size:11px">+ Add project</div>
    </div>`}).join('');
  $('proj-main').innerHTML=header+`<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px">${colHtml}</div>`;
}
function renderProjectsGantt(header){
  // P8: zoom level toggle — week / month / quarter
  const zoom=_projGanttZoom||'month';
  const windowDays=zoom==='week'?28:zoom==='quarter'?365:120; // visible range
  const today=new Date();
  const parseDate=s=>{if(!s||s==='Ongoing')return null;try{const d=_pd(s);return isNaN(d)?null:d;}catch{return null}};
  const filtered=_filteredProjects();
  const allDates=filtered.map(p=>parseDate(p.due)).filter(Boolean);
  const minDate=_pd(today); minDate.setDate(minDate.getDate()-7);
  const maxFromData=allDates.length?new Date(Math.max(...allDates.map(d=>d.getTime()))):new Date(today.getTime()+windowDays*86400000);
  const maxDate=new Date(Math.max(maxFromData.getTime(),today.getTime()+windowDays*86400000));
  const totalDays=Math.max(1,Math.ceil((maxDate-minDate)/86400000))+14;
  const pct=(d)=>Math.max(0,Math.min(100,Math.ceil((_pd(d)-minDate)/86400000/totalDays*100)));
  // Build column markers for the chosen zoom
  let markers=[];
  if(zoom==='week'){for(let w=0;w<Math.ceil(totalDays/7);w++){const d=_pd(minDate);d.setDate(minDate.getDate()+w*7);markers.push({label:`W${w+1}`,p:pct(d)});}}
  else if(zoom==='month'){const cur=new Date(minDate.getFullYear(),minDate.getMonth(),1);while(cur<=maxDate){markers.push({label:cur.toLocaleDateString(undefined,{month:'short',year:'2-digit'}),p:pct(cur)});cur.setMonth(cur.getMonth()+1);}}
  else{const cur=new Date(minDate.getFullYear(),Math.floor(minDate.getMonth()/3)*3,1);while(cur<=maxDate){const q=Math.floor(cur.getMonth()/3)+1;markers.push({label:`Q${q} '${String(cur.getFullYear()).slice(-2)}`,p:pct(cur)});cur.setMonth(cur.getMonth()+3);}}
  const markerHtml=markers.map(m=>`<div style="position:absolute;left:${m.p}%;top:0;bottom:0;width:1px;background:var(--bd1)"></div><div style="position:absolute;left:${m.p}%;top:-18px;transform:translateX(-50%);font-size:11px;color:var(--t3);white-space:nowrap">${esc(m.label)}</div>`).join('');
  const rows=filtered.map(p=>{
    const due=parseDate(p.due);
    const start=parseDate(p.startDate)||new Date(today.getTime()-14*86400000);
    const startPct=Math.max(0,pct(start));
    const endPct=due?pct(due):80;
    const barW=Math.max(2,endPct-startPct);
    const filledW=barW*((p.pct||0)/100);
    const ms=Array.isArray(p.milestones)?p.milestones:[];
    const msMarks=ms.map(m=>{const d=parseDate(m.date||m.due);if(!d)return '';const mp=pct(d);const od=!m.done&&(m.date||m.due)&&(m.date||m.due)<_todayStr;return `<div title="${esc(m.title||m.name||'milestone')} · ${m.date||m.due||''}${od?' · overdue':''}" style="position:absolute;left:${mp}%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:9px;height:9px;background:${m.done?'var(--ok)':od?'var(--red)':'var(--s1)'};border:2px solid ${m.done?'var(--ok)':od?'var(--red)':p.color};border-radius:2px;z-index:3;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`;}).join('');
    const hp=projectHealth(p);
    // External-tasks count for this project (linked via override.localProjectId).
    const extLinked=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>{
      const ov2=t.override;return ov2&&String(ov2.localProjectId||'')===String(p.id)&&!ov2.tombstoned;
    });
    const cfN=extLinked.filter(t=>t.source==='smartsheet').length;
    const lsiN=extLinked.filter(t=>t.source==='nifty').length;
    const extBadge=extLinked.length
      ?`<span title="${cfN?cfN+' CF':''}${cfN&&lsiN?' · ':''}${lsiN?lsiN+' LSI':''} external task${extLinked.length===1?'':'s'} linked" style="display:inline-flex;align-items:center;gap:2px;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;background:var(--s3);color:var(--t2);margin-left:4px">${cfN?`<span style="color:#1f6feb">${cfN}CF</span>`:''}${cfN&&lsiN?'·':''}${lsiN?`<span style="color:#9333ea">${lsiN}LSI</span>`:''}</span>`
      :'';
    return`<div class="gantt-row" style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid var(--bd1);border-radius:7px">
      <div style="width:170px;flex-shrink:0;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="openProjectDetail(${p.id})" title="${esc(p.name)} · ${hp.label}">
        <span style="width:7px;height:7px;border-radius:2px;background:${p.color};display:inline-block;margin-right:5px"></span>${p.pinned?'<span style="color:var(--warn);margin-right:3px">★</span>':''}${esc(p.name)}${extBadge}
      </div>
      <div style="flex:1;position:relative;height:22px;background:var(--s3);border-radius:6px;overflow:hidden">
        ${markerHtml}
        <div style="position:absolute;left:${startPct}%;width:${barW}%;height:100%;background:color-mix(in srgb,${p.color} 22%,transparent);border-radius:6px;z-index:1"></div>
        <div style="position:absolute;left:${startPct}%;width:${filledW}%;height:100%;background:linear-gradient(90deg,${p.color},color-mix(in srgb,${p.color} 70%,#fff));border-radius:6px;display:flex;align-items:center;padding:0 6px;z-index:2;box-shadow:0 1px 6px color-mix(in srgb,${p.color} 45%,transparent)"><span style="font-size:11px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-shadow:0 1px 2px rgba(0,0,0,.4)">${p.pct||0}%</span></div>
        ${msMarks}
        <div style="position:absolute;left:${pct(today)}%;top:0;bottom:0;width:2px;background:var(--warn);box-shadow:0 0 6px var(--warn);z-index:4"></div>
      </div>
      <div style="width:70px;flex-shrink:0;font-size:11px;color:${due&&p.due<_todayStr?'var(--red)':'var(--t3)'};text-align:right">${p.due||'—'}</div>
    </div>`}).join('');
  $('proj-main').innerHTML=header+`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:11px;color:var(--t3)">Zoom:</span>${['week','month','quarter'].map(z=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:${zoom===z?'var(--ac)':'transparent'};color:${zoom===z?'#fff':'var(--t2)'}" onclick="setProjFilter('ganttZoom','${z}')">${z[0].toUpperCase()+z.slice(1)}</button>`).join('')}<span style="margin-left:auto;font-size:11px;color:var(--t3)">Yellow line = today · circles = milestones (filled = done)</span></div><div style="padding-top:22px">${rows||'<p style="font-size:11px;color:var(--t3);padding:16px">No projects match your filters.</p>'}</div>`;
}

