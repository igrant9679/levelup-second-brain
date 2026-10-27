// LevelUp client, file 5 of 7: Goals, Journal, Mail, Calendar.
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
// ====== GOALS AI ======
function aiGoalProgress(){
  if(!D.goals.length){toast('No goals yet');return;}
  toast('✨ Generating progress narratives...');
  const narratives=D.goals.map(g=>{
    const pct=g.pct||0;
    const linkedTasks=D.tasks.filter(t=>(t.tags||[]).includes('goal:'+((g.title||'').toLowerCase().replace(/\s+/g,'-'))));
    const doneTasks=linkedTasks.filter(t=>t.status==='Done').length;
    const openTasks=linkedTasks.filter(t=>t.status!=='Done').length;
    const dueDate=_goalDue(g)?new Date(_goalDue(g)):null;
    const daysLeft=dueDate?Math.floor((dueDate-new Date())/(1000*60*60*24)):null;
    let narrative='';
    if(pct>=100)narrative=`✅ Completed! You achieved "${g.title}". Celebrate this win and consider what\'s next.`;
    else if(pct>=75)narrative=`🎉 Almost there! "${g.title}" is ${pct}% complete.${daysLeft!==null?` With ${daysLeft} days left, you\'re on track.`:''} ${openTasks} task${openTasks!==1?'s':''} remaining.`;
    else if(pct>=50)narrative=`💪 Halfway through "${g.title}" at ${pct}%.${daysLeft!==null&&daysLeft<30?` Only ${daysLeft} days left — consider increasing focus.`:''} ${doneTasks} tasks done, ${openTasks} to go.`;
    else if(pct>=25)narrative=`🔄 "${g.title}" is ${pct}% complete. Good start — ${openTasks} tasks remain.${daysLeft!==null&&daysLeft<60?` ${daysLeft} days left — time to accelerate.`:''}` ;
    else if(pct>0)narrative=`⚠️ "${g.title}" is only ${pct}% complete.${daysLeft!==null?` ${daysLeft} days remaining.`:''} Consider breaking it into smaller milestones.`;
    else narrative=`💤 "${g.title}" hasn\'t started yet.${daysLeft!==null?` Due in ${daysLeft} days.`:''} Add tasks and check in to build momentum.`;
    return{g,pct,narrative,doneTasks,openTasks,daysLeft};
  });
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ Goal Progress Narratives</h2>
  <div style="max-height:360px;overflow-y:auto">${narratives.map(({g,pct,narrative,daysLeft})=>{
    const color=pct>=75?'var(--grn)':pct>=50?'var(--ac)':pct>=25?'var(--warn)':'var(--red)';
    return`<div style="padding:10px;margin-bottom:8px;border-radius:6px;background:var(--s2);border-left:3px solid ${color}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <div style="font-size:12px;font-weight:600">${esc(g.title)}</div>
        <div style="font-size:11px;font-weight:700;color:${color}">${pct}%</div>
      </div>
      <div style="background:var(--s3);border-radius:3px;height:4px;margin-bottom:6px"><div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div></div>
      <div style="font-size:11px;color:var(--t2);line-height:1.5">${esc(narrative)}</div>
      ${daysLeft!==null?`<div style="font-size:11px;color:var(--t3);margin-top:3px">${daysLeft>0?daysLeft+' days remaining':daysLeft===0?'Due today!':'Overdue by '+Math.abs(daysLeft)+' days'}</div>`:''}
    </div>`;
  }).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiWeeklyReview(){
  toast('📅 Generating weekly review...');
  const today=new Date();
  const weekAgo=_pd(today);weekAgo.setDate(today.getDate()-7);
  const weekDates=Array.from({length:7},(_,i)=>{const d=_pd(weekAgo);d.setDate(weekAgo.getDate()+i+1);return _ymd(d);});
  // Tasks
  const tasksDone=D.tasks.filter(t=>t.status==='Done'&&t.completedAt&&weekDates.some(d=>t.completedAt.startsWith(d)));
  const tasksAdded=D.tasks.filter(t=>t.created&&weekDates.some(d=>t.created.startsWith(d)));
  const overdueTasks=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<weekDates[6]);
  // Habits
  const habitsDone=D.habits.filter(h=>(h.completedDates||[]).some(d=>weekDates.includes(d)));
  const habitScore=D.habits.length?Math.round(D.habits.reduce((sum,h)=>{
    const done=(h.completedDates||[]).filter(d=>weekDates.includes(d)).length;
    const target=h.frequency==='Daily'?7:h.frequency==='3x/week'?3:h.frequency==='Weekly'?1:7;
    return sum+(done/target);
  },0)/D.habits.length*100):0;
  // Journal
  const journalEntries=D.journal.filter(j=>{const d=_parseJournalDate(j);return d&&weekDates.includes(_ymd(d));});
  const moodMap={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};
  const moodScores=journalEntries.filter(j=>moodMap[j.mood]).map(j=>moodMap[j.mood]);
  const avgMood=moodScores.length?moodScores.reduce((a,b)=>a+b,0)/moodScores.length:null;
  // Goals
  const activeGoals=D.goals.filter(g=>g.pct<100);
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📅 Weekly Review</h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:12px">${weekDates[0]} – ${weekDates[6]}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:18px;font-weight:700;color:var(--grn)">${tasksDone.length}</div>
      <div style="font-size:11px;color:var(--t3)">Tasks Completed</div>
    </div>
    <div style="padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:18px;font-weight:700;color:var(--ac)">${habitScore}%</div>
      <div style="font-size:11px;color:var(--t3)">Habit Score</div>
    </div>
    <div style="padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:18px;font-weight:700;color:var(--purp)">${journalEntries.length}</div>
      <div style="font-size:11px;color:var(--t3)">Journal Entries</div>
    </div>
    <div style="padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:18px;font-weight:700;color:${avgMood?avgMood>=4?'var(--grn)':avgMood>=3?'var(--ac)':'var(--warn)':'var(--t3)'}">${avgMood?avgMood.toFixed(1)+'/5':'N/A'}</div>
      <div style="font-size:11px;color:var(--t3)">Avg Mood</div>
    </div>
  </div>
  ${tasksDone.length?`<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">✅ Wins this week</div>${tasksDone.slice(0,5).map(t=>`<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(t.title)}</div>`).join('')}${tasksDone.length>5?`<div style="font-size:11px;color:var(--t3)">+${tasksDone.length-5} more</div>`:''}</div>`:''}
  ${overdueTasks.length?`<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--warn)">⚠️ Overdue tasks (${overdueTasks.length})</div>${overdueTasks.slice(0,3).map(t=>`<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(t.title)} (due ${fmtDate(t.due)})</div>`).join('')}</div>`:''}
  ${activeGoals.length?`<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">🎯 Active Goals</div>${activeGoals.slice(0,4).map(g=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0"><span>${esc(g.title)}</span><span style="color:var(--ac);font-weight:600">${g.pct||0}%</span></div>`).join('')}</div>`:''}
  <div style="display:flex;gap:8px;margin-top:10px">
    <button class="btn btn-p" onclick="closeModal();openFA('journal')" title="Write a reflection entry">Write Reflection</button>
    <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiOKRAlignment(){
  if(!D.goals.length){toast('No goals to check alignment for');return;}
  toast('🔗 Checking OKR alignment...');
  // Group goals by type: Objective vs Key Result
  const objectives=D.goals.filter(g=>g.type==='Objective'||g.okrType==='Objective'||(!g.parentId&&!g.okrType));
  const keyResults=D.goals.filter(g=>g.type==='Key Result'||g.okrType==='Key Result'||g.parentId);
  // For each task, check if it has a goal tag
  const allActiveTasks=D.tasks.filter(t=>t.status!=='Done');
  const taggedTasks=allActiveTasks.filter(t=>(t.tags||[]).some(tag=>tag.startsWith('goal:')));
  const untaggedTasks=allActiveTasks.filter(t=>!(t.tags||[]).some(tag=>tag.startsWith('goal:')));
  const alignmentPct=allActiveTasks.length?Math.round(taggedTasks.length/allActiveTasks.length*100):0;
  // Find orphaned key results (no parent objective)
  const orphanKRs=keyResults.filter(kr=>kr.parentId&&!D.goals.find(g=>g.id===kr.parentId));
  // Find objectives with no key results
  const objectivesWithoutKRs=objectives.filter(o=>!keyResults.some(kr=>kr.parentId===o.id));
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔗 OKR Alignment Check</h2>
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <div style="flex:1;text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:${alignmentPct>=70?'var(--grn)':alignmentPct>=40?'var(--warn)':'var(--red)'}">${alignmentPct}%</div>
      <div style="font-size:11px;color:var(--t3)">Tasks Aligned to Goals</div>
    </div>
    <div style="flex:1;text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--ac)">${objectives.length}</div>
      <div style="font-size:11px;color:var(--t3)">Objectives</div>
    </div>
    <div style="flex:1;text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--purp)">${keyResults.length}</div>
      <div style="font-size:11px;color:var(--t3)">Key Results</div>
    </div>
  </div>
  ${untaggedTasks.length?`<div style="margin-bottom:10px;padding:8px;background:var(--s2);border-radius:6px;border-left:3px solid var(--warn)">
    <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--warn)">⚠️ ${untaggedTasks.length} task${untaggedTasks.length!==1?'s':''} not linked to any goal</div>
    ${untaggedTasks.slice(0,4).map(t=>`<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(t.title)}</div>`).join('')}
    ${untaggedTasks.length>4?`<div style="font-size:11px;color:var(--t3)">+${untaggedTasks.length-4} more</div>`:''}
    <div style="font-size:11px;color:var(--t3);margin-top:4px">Add a goal: tag to link these tasks to objectives</div>
  </div>`:''}
  ${objectivesWithoutKRs.length?`<div style="margin-bottom:10px;padding:8px;background:var(--s2);border-radius:6px;border-left:3px solid var(--red)">
    <div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--red)">🚨 ${objectivesWithoutKRs.length} objective${objectivesWithoutKRs.length!==1?'s':''} with no Key Results</div>
    ${objectivesWithoutKRs.map(o=>`<div style="font-size:11px;color:var(--t2);padding:2px 0">• ${esc(o.title)}</div>`).join('')}
  </div>`:''}
  ${alignmentPct>=70?`<div style="padding:8px;background:var(--s2);border-radius:6px;border-left:3px solid var(--grn);font-size:11px;color:var(--t2)">✅ Strong alignment! Most of your active work is connected to goals.</div>`:''}
  <button class="btn btn-p" style="margin-top:12px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

// Global so filter state persists across re-renders (was previously local — caused filter to reset).
if(typeof _goalsMyOnly==='undefined')var _goalsMyOnly=false;
if(typeof _goalsView==='undefined')var _goalsView='grid';
// G1: filter + search + sort state
if(typeof _goalsSearch==='undefined')var _goalsSearch='';
if(typeof _goalsCategory==='undefined')var _goalsCategory='All';
if(typeof _goalsStatusFilter==='undefined')var _goalsStatusFilter='All';
if(typeof _goalsHealthFilter==='undefined')var _goalsHealthFilter='All';
if(typeof _goalsSort==='undefined')var _goalsSort='order';
// G4: track which goals have their linked-tasks panel expanded
if(typeof _goalsExpandedTasks==='undefined')var _goalsExpandedTasks=new Set();
// A goal's deadline. Every editor (drawer, quick-add, assistant, seeds)
// writes dueDate, while health, sorting, alerts and the AI read due  so
// goals never showed as at risk. Read every field name in use.
function _goalDue(g){return (g&&(g.dueDate||g.due||g.deadline||g.targetDate))||null;}
// Re-render the Goals screen from outside renderGoals. Calling
// renderGoalCards() from global code hit the HOME helper of the same name
// (it only returns a string), so ticks and milestone edits never showed.
function _refreshGoals(){try{if(typeof curScreen!=='undefined'&&curScreen==='goals')renderGoals();}catch(_){}}
// G2: goal health based on time elapsed vs progress.
function goalHealth(g){
  const due=_goalDue(g);
  if((g.pct||0)>=100)return {icon:'🟢',label:'Done',color:'var(--ok)'};
  if(!due)return {icon:'🟢',label:'On Track',color:'var(--ok)'};
  const dueMs=+_pd(due);if(isNaN(dueMs))return {icon:'🟢',label:'On Track',color:'var(--ok)'};
  const now=Date.now();
  const daysLeft=Math.ceil((dueMs-now)/86400000);
  if(daysLeft<0)return {icon:'🔴',label:'Overdue',color:'var(--red)'};
  const created=g.createdAt?Date.parse(g.createdAt):now-90*86400000;
  const totalDays=Math.max(1,Math.ceil((dueMs-created)/86400000));
  const elapsed=Math.max(0,Math.ceil((now-created)/86400000));
  const expectedPct=Math.min(100,(elapsed/totalDays)*100);
  if((g.pct||0)<expectedPct-25)return {icon:'🔴',label:'At Risk',color:'var(--red)'};
  if((g.pct||0)<expectedPct-10)return {icon:'🟡',label:'Needs Attention',color:'var(--warn)'};
  return {icon:'🟢',label:'On Track',color:'var(--ok)'};
}
// G5: latest check-in helper
function _goalLastCheckIn(g){const cs=g.checkIns||[];if(!cs.length)return null;const last=cs[cs.length-1];const d=+_pd(last.date);return isNaN(d)?null:{date:last.date,daysAgo:Math.floor((Date.now()-d)/86400000)};}
// G3: stale = no check-in or update in 30+ days (and not done)
function _goalIsStale(g){if((g.pct||0)>=100)return false;const last=_goalLastCheckIn(g);const lastTouch=g.lastTouchedAt?Date.parse(g.lastTouchedAt):(g.createdAt?Date.parse(g.createdAt):0);const lastMs=Math.max(last?Date.now()-last.daysAgo*86400000:0,lastTouch||0);return Date.now()-lastMs>30*86400000;}
// G6: 14-point progress sparkline from g.pctHistory
function _goalSparkline(g){
  const h=Array.isArray(g.pctHistory)?g.pctHistory.slice(-14):[];
  if(h.length<2)return '';
  const min=0,max=100;
  const pts=h.map((p,i)=>{const x=i/(h.length-1)*100;const y=100-((p.pct-min)/(max-min))*90-5;return `${x.toFixed(1)},${y.toFixed(1)}`;});
  return `<svg viewBox="0 0 100 60" preserveAspectRatio="none" style="width:80px;height:18px;overflow:visible;flex-shrink:0" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--ac)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function setGoalsFilter(field,val){
  if(field==='search')_goalsSearch=val||'';
  else if(field==='category')_goalsCategory=val||'All';
  else if(field==='status')_goalsStatusFilter=val||'All';
  else if(field==='health')_goalsHealthFilter=val||'All';
  else if(field==='sort')_goalsSort=val||'order';
  if(typeof renderGoals==='function')renderGoals();
}
function clearGoalsFilters(){_goalsSearch='';_goalsCategory='All';_goalsStatusFilter='All';_goalsHealthFilter='All';_goalsSort='order';renderGoals();}
function _goalsFiltered(){
  const me=D.creds.userName||'Idris Grant';
  let arr=_goalsMyOnly?D.goals.filter(g=>!g.createdBy||g.createdBy===me):[...D.goals];
  if(_goalsSearch){const q=_goalsSearch.toLowerCase();arr=arr.filter(g=>(g.title||'').toLowerCase().includes(q)||(g.target||'').toLowerCase().includes(q)||(g.category||'').toLowerCase().includes(q));}
  if(_goalsCategory!=='All')arr=arr.filter(g=>(g.category||'')===_goalsCategory);
  if(_goalsStatusFilter==='Active')arr=arr.filter(g=>(g.pct||0)<100);
  else if(_goalsStatusFilter==='Done')arr=arr.filter(g=>(g.pct||0)>=100);
  else if(_goalsStatusFilter==='At risk')arr=arr.filter(g=>{const h=goalHealth(g);return h.label==='At Risk'||h.label==='Overdue';});
  if(_goalsHealthFilter!=='All')arr=arr.filter(g=>goalHealth(g).label===_goalsHealthFilter);
  if(_goalsSort==='pctDesc')arr.sort((a,b)=>(b.pct||0)-(a.pct||0));
  else if(_goalsSort==='pctAsc')arr.sort((a,b)=>(a.pct||0)-(b.pct||0));
  else if(_goalsSort==='dueAsc')arr.sort((a,b)=>(Date.parse(_goalDue(a)||'9999')||9e15)-(Date.parse(_goalDue(b)||'9999')||9e15));
  else if(_goalsSort==='az')arr.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  return arr;
}
function _goalToggleTaskExpand(gid){
  if(_goalsExpandedTasks.has(gid))_goalsExpandedTasks.delete(gid);else _goalsExpandedTasks.add(gid);
  if(typeof renderGoals==='function')renderGoals();
}
function renderGoals(){
  // Auto-recalculate all goal percentages before rendering
  D.goals.forEach(g=>autoCalcGoalPct(g));
  function renderGoalCards(){
    const me=D.creds.userName||'Idris Grant';
    const el=document.getElementById('goals-grid');
    if(!el)return;
    // Team view — group goals by owner
    if(_goalsView==='team'){
      const allMembers=[...new Set(D.goals.map(g=>g.createdBy||'Idris Grant'))];
      el.style.gridTemplateColumns='1fr';
      el.innerHTML=allMembers.map(member=>{
        const mGoals=D.goals.filter(g=>(g.createdBy||'Idris Grant')===member);
        const avgPct=mGoals.length?Math.round(mGoals.reduce((s,g)=>s+g.pct,0)/mGoals.length):0;
        return`<div class="cd"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:32px;height:32px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">${member.split(' ').map(w=>w[0]).join('').slice(0,2)}</div><div><div style="font-size:13px;font-weight:600">${esc(member)}</div><div style="font-size:11px;color:var(--t3)">${mGoals.length} goal${mGoals.length!==1?'s':''} · avg ${avgPct}%</div></div></div>${mGoals.map(g=>{
          const ms=g.milestones||[];const msDone=ms.filter(m=>m.done).length;
          return`<div style="padding:6px;border-radius:6px;background:var(--s2);margin-bottom:5px;cursor:pointer" onclick="openGoalDetail(${g.id})"><div style="display:flex;align-items:center;gap:6px"><span>${g.icon}</span><span style="font-size:12px;font-weight:500;flex:1">${esc(g.title)}</span><span style="font-size:11px;font-weight:700;color:var(--ac)">${g.pct}%</span></div><div class="pb" style="margin-top:4px"><div class="f" style="width:${g.pct}%;background:var(--ac)"></div></div>${ms.length?`<div style="font-size:11px;color:var(--t3);margin-top:2px">🏁 ${msDone}/${ms.length} milestones</div>`:''}</div>`}).join('')}</div>`;
      }).join('');
      return;
    }
    // OKR mode: group goals by category as Objectives, milestones as Key Results
    if(_goalsView==='okr'){
      el.style.gridTemplateColumns='1fr';
      const me2=D.creds.userName||'Idris Grant';
      const goals2=_goalsMyOnly?D.goals.filter(g=>!g.createdBy||g.createdBy===me2):D.goals;
      // Group by category
      const cats=[...new Set(goals2.map(g=>g.category||'Uncategorized'))];
      el.innerHTML=cats.map(cat=>{
        const catGoals=goals2.filter(g=>(g.category||'Uncategorized')===cat);
        const catAvg=catGoals.length?Math.round(catGoals.reduce((s,g)=>s+g.pct,0)/catGoals.length):0;
        return `<div style="margin-bottom:18px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 12px;background:var(--s2);border-radius:8px;border-left:4px solid var(--ac)">
            <div style="flex:1">
              <div style="font-size:14px;font-weight:700">${esc(cat)}</div>
              <div style="font-size:11px;color:var(--t3)">${catGoals.length} Objective${catGoals.length!==1?'s':''} · avg ${catAvg}%</div>
            </div>
            <div style="font-size:16px;font-weight:700;color:var(--ac)">${catAvg}%</div>
          </div>
          ${catGoals.map(g=>{
            const krs=g.milestones||[];
            const krsDone=krs.filter(m=>m.done).length;
            const linkedTasks=D.tasks.filter(t=>(g.linkedTaskIds||[]).includes(t.id));
            return `<div style="margin-left:16px;margin-bottom:10px;border:1px solid var(--bd2);border-radius:8px;overflow:hidden">
              <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--s1);cursor:pointer" onclick="openGoalDetail(${g.id})">
                <span style="font-size:18px">${g.icon}</span>
                <div style="flex:1">
                  <div style="font-size:12px;font-weight:600">${esc(g.title)}</div>
                  <div style="font-size:11px;color:var(--t3)">${esc(g.target)} · ${g.pct}% complete</div>
                </div>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-s" style="font-size:11px;padding:2px 6px" onclick="event.stopPropagation();openGoalCheckIn(${g.id})">🗓</button>
                  <button class="btn btn-s" style="font-size:11px;padding:2px 6px" onclick="event.stopPropagation();openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))">✏</button>
                </div>
              </div>
              <div class="pb" style="height:4px;border-radius:0;margin:0"><div class="f" style="width:${g.pct}%;background:var(--ac);height:4px;border-radius:0"></div></div>
              ${krs.length?`<div style="padding:8px 12px;background:var(--s0)">
                <div style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Key Results (${krsDone}/${krs.length})</div>
                ${krs.map((kr,ki)=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--bd1)">
                  <input type="checkbox" ${kr.done?'checked':''} onchange="const g3=D.goals.find(x=>x.id==${_tidLit(g.id)});if(g3){g3.milestones[${ki}].done=this.checked;autoCalcGoalPct(g3);save('goals');_refreshGoals();}" style="width:14px;height:14px;accent-color:var(--ac)">
                  <span style="font-size:11px;flex:1;${kr.done?'text-decoration:line-through;color:var(--t3)':'color:var(--t1)'}">${esc(kr.title)}</span>
                  ${kr.target?`<span style="font-size:11px;color:var(--t3)">${esc(kr.target)}</span>`:''}
                </div>`).join('')}
              </div>`:''}
              ${linkedTasks.length?`<div style="padding:6px 12px;background:var(--s0);border-top:1px solid var(--bd1)"><span style="font-size:11px;color:var(--t3)">📋 ${linkedTasks.length} linked task${linkedTasks.length!==1?'s':''}</span></div>`:''}
            </div>`;
          }).join('')}
        </div>`;
      }).join('') || '<p style="color:var(--t3);font-size:11px;padding:16px">No goals found.</p>';
      return;
    }
    el.style.gridTemplateColumns='repeat(auto-fill,minmax(280px,1fr))';
    const goals=_goalsFiltered();
    if(!goals.length){
      el.style.gridTemplateColumns='1fr';
      const hasFilters=_goalsSearch||_goalsCategory!=='All'||_goalsStatusFilter!=='All'||_goalsHealthFilter!=='All';
      el.innerHTML=renderEmptyState({icon:'target',title:hasFilters?'No goals match your filters':'No goals yet',hint:hasFilters?'Try clearing the filters or broadening your search.':_goalsMyOnly?"You haven't set any goals. Aim somewhere — the rest of the system aligns around them.":'Goals turn intent into trackable outcomes. Start with one.',ctaLabel:hasFilters?'Clear filters':'+ Set your first goal',ctaFn:hasFilters?'clearGoalsFilters()':"openFA('goal')"});
      return;
    }
    el.innerHTML=goals.map(g=>{
    const ms=g.milestones||[];
    const msDone=ms.filter(m=>m.done).length;
    const linkedTasks=D.tasks.filter(t=>(g.linkedTaskIds||[]).includes(t.id));
    const nextMs=ms.find(m=>!m.done);
    const health=goalHealth(g);
    const last=_goalLastCheckIn(g);
    const dueCheckIn=!last||last.daysAgo>=7;
    const spark=_goalSparkline(g);
    const expanded=_goalsExpandedTasks.has(g.id);
    return`<div class="cd" style="cursor:pointer;border-left:3px solid ${health.color}" onclick="openGoalDetail(${g.id})">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
        <span style="font-size:22px">${g.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${esc(g.title)}</div>
          <div style="font-size:11px;color:var(--t3)">${esc(g.category||'')}${g.category?' · ':''}${esc(g.target||'')}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
          <span style="font-size:13px;font-weight:700;color:${health.color}">${g.pct}%</span>
          <span style="font-size:11px;color:${health.color};font-weight:600;white-space:nowrap" title="Health: ${health.label}">${health.icon} ${health.label}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div class="pb" style="flex:1;margin:0"><div class="f" style="width:${g.pct}%;background:${health.color}"></div></div>
        ${spark}
      </div>
      ${ms.length?`<div style="font-size:11px;color:var(--t3);margin-bottom:4px">🏁 Milestones: ${msDone}/${ms.length} done${nextMs?` · Next: ${esc(nextMs.title)}`:''}</div>`:''}
      ${linkedTasks.length?`<div style="font-size:11px;color:var(--t3);margin-bottom:4px"><span style="cursor:pointer;color:var(--ac);text-decoration:underline" onclick="event.stopPropagation();_goalToggleTaskExpand(${g.id})">📋 ${linkedTasks.length} linked task${linkedTasks.length>1?'s':''} ${expanded?'▴':'▾'}</span></div>${expanded?`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:6px;padding:6px 8px;margin-bottom:6px">${linkedTasks.slice(0,8).map(t=>`<div class="lr" style="padding:3px 0;font-size:11px;cursor:pointer" onclick="event.stopPropagation();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><span class="chk ${t.status==='Done'?'on':''}" style="width:12px;height:12px;flex-shrink:0"></span><span class="rt" style="font-size:11px;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span><span style="font-size:11px;color:var(--t3)">${t.due||''}</span></div>`).join('')}${linkedTasks.length>8?`<div style="font-size:11px;color:var(--t3);padding:3px 0">+${linkedTasks.length-8} more</div>`:''}</div>`:''}`:''}
      ${last?`<div style="font-size:11px;color:${dueCheckIn?'var(--warn)':'var(--t3)'};margin-bottom:4px">${dueCheckIn?'⚠ ':'🗓 '}Last check-in: ${last.daysAgo===0?'today':last.daysAgo+'d ago'}${dueCheckIn?' · check-in due':''}</div>`:`<div style="font-size:11px;color:var(--warn);margin-bottom:4px">⚠ No check-ins yet</div>`}
      <div style="margin-top:6px;display:flex;gap:4px">
        <button class="btn btn-s" style="font-size:11px;padding:2px 8px" onclick="event.stopPropagation();openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))">✏ Edit</button>
        <button class="btn btn-s" style="font-size:11px;padding:2px 8px;color:${dueCheckIn?'var(--warn)':'var(--ac)'}" onclick="event.stopPropagation();openGoalCheckIn(${g.id})">🗓 Check-in${dueCheckIn?' (due)':''}</button>
      </div>
    </div>`}).join('') || '<p style="color:var(--t3);font-size:11px;padding:16px">No goals found.</p>';
  }
  $('goals-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('target',22,'var(--page-accent)')}Goals</h1><p style="font-size:12px;color:var(--t2)">${(()=>{const gs=D.goals||[];if(!gs.length)return 'No goals yet — add one to get started.';const avg=Math.round(gs.reduce((s,g)=>s+(g.pct||0),0)/gs.length);const dn=gs.filter(g=>(g.pct||0)===100).length;return `${gs.length} goal${gs.length!==1?'s':''} · ${avg}% avg progress${dn?` · ${dn} complete`:''}`;})()}</p></div><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden"><button id="goals-scope-my" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_goalsView!=='team'&&_goalsMyOnly?'var(--ac)':'transparent'};color:${_goalsView!=='team'&&_goalsMyOnly?'#fff':'var(--t2)'};border:none" onclick="_goalsMyOnly=true;_goalsView='grid';document.getElementById('goals-scope-my').style.background='var(--ac)';document.getElementById('goals-scope-my').style.color='#fff';document.getElementById('goals-scope-all').style.background='transparent';document.getElementById('goals-scope-all').style.color='var(--t2)';renderGoalCards()">My Goals</button><button id="goals-scope-all" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_goalsView!=='team'&&!_goalsMyOnly?'var(--ac)':'transparent'};color:${_goalsView!=='team'&&!_goalsMyOnly?'#fff':'var(--t2)'};border:none" onclick="_goalsMyOnly=false;_goalsView='grid';document.getElementById('goals-scope-all').style.background='var(--ac)';document.getElementById('goals-scope-all').style.color='#fff';document.getElementById('goals-scope-my').style.background='transparent';document.getElementById('goals-scope-my').style.color='var(--t2)';renderGoalCards()">All Goals</button><button id="goals-scope-team" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_goalsView==='team'?'var(--ac)':'transparent'};color:${_goalsView==='team'?'#fff':'var(--t2)'};border:none" onclick="_goalsView='team';document.getElementById('goals-scope-team').style.background='var(--ac)';document.getElementById('goals-scope-team').style.color='#fff';document.getElementById('goals-scope-my').style.background='transparent';document.getElementById('goals-scope-my').style.color='var(--t2)';document.getElementById('goals-scope-all').style.background='transparent';document.getElementById('goals-scope-all').style.color='var(--t2)';renderGoalCards()">👥 Team</button></div><button id="goals-view-okr" class="btn btn-s" style="height:28px;font-size:11px;background:${_goalsView==='okr'?'var(--ac)':''};color:${_goalsView==='okr'?'#fff':''}" onclick="_goalsView=_goalsView==='okr'?'grid':'okr';this.style.background=_goalsView==='okr'?'var(--ac)':'';this.style.color=_goalsView==='okr'?'#fff':'';renderGoalCards()" title="Toggle OKR mode">🎯 OKR</button>${_goalsView==='grid'?`<div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px" onclick="event.stopPropagation();togglePopMenu('goals-filter-menu')" title="Filters & sort">🔍 Filter${(()=>{const n=(_goalsSearch?1:0)+(_goalsCategory!=='All'?1:0)+(_goalsStatusFilter!=='All'?1:0)+(_goalsHealthFilter!=='All'?1:0)+(_goalsSort!=='order'?1:0);return n?` • ${n}`:'';})()} ▾</button><div id="goals-filter-menu" data-pop-menu="1" onclick="event.stopPropagation()" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:10px;z-index:50;width:280px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><input class="inp" placeholder="🔍 Search goals…" value="${esc(_goalsSearch)}" style="width:100%;height:28px;font-size:11px;margin-bottom:6px;box-sizing:border-box" oninput="setGoalsFilter('search',this.value)"><div style="display:flex;gap:6px;margin-bottom:6px"><select class="inp" style="flex:1;min-width:0;height:28px;font-size:11px;padding:0 6px" onchange="setGoalsFilter('status',this.value)">${['All','Active','At risk','Done'].map(s=>`<option ${_goalsStatusFilter===s?'selected':''}>${s}</option>`).join('')}</select><select class="inp" style="flex:1;min-width:0;height:28px;font-size:11px;padding:0 6px" onchange="setGoalsFilter('health',this.value)">${['All','On Track','Needs Attention','At Risk','Overdue','Done'].map(s=>`<option ${_goalsHealthFilter===s?'selected':''}>${s}</option>`).join('')}</select></div><select class="inp" style="width:100%;height:28px;font-size:11px;padding:0 6px;margin-bottom:6px;box-sizing:border-box" onchange="setGoalsFilter('sort',this.value)"><option value="order" ${_goalsSort==='order'?'selected':''}>Default order</option><option value="pctDesc" ${_goalsSort==='pctDesc'?'selected':''}>% high → low</option><option value="pctAsc" ${_goalsSort==='pctAsc'?'selected':''}>% low → high</option><option value="dueAsc" ${_goalsSort==='dueAsc'?'selected':''}>Due soon</option><option value="az" ${_goalsSort==='az'?'selected':''}>A → Z</option></select>${(_goalsSearch||_goalsCategory!=='All'||_goalsStatusFilter!=='All'||_goalsHealthFilter!=='All'||_goalsSort!=='order')?`<button class="btn btn-s" style="width:100%;height:26px;font-size:11px;color:var(--warn)" onclick="clearGoalsFilters()">✕ Clear all filters</button>`:''}</div></div>`:''}<div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('goals-ai-menu')" title="AI tools">✨ AI ▾</button><div id="goals-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('goals-ai-menu');aiGoalProgress()">${_icon('sparkles',14,'currentColor')} Progress Narrative</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('goals-ai-menu');aiWeeklyReview()">${_icon('calendar',14,'currentColor')} Weekly Review</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('goals-ai-menu');aiOKRAlignment()">${_icon('link',14,'currentColor')} OKR Alignment</button></div></div><button class="btn btn-p" onclick="openFA('goal')">+ New Goal</button></div></div>
  ${(()=>{
    if(_goalsView!=='grid')return '';
    const cats=['All',...[...new Set(D.goals.map(g=>g.category||'').filter(Boolean))].sort()];
    if(cats.length<=2)return '';
    return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">${cats.map(c=>`<button class="btn btn-s" style="height:22px;font-size:11px;padding:0 8px;background:${_goalsCategory===c?'var(--ac)':'var(--s2)'};color:${_goalsCategory===c?'#fff':'var(--t2)'};border-color:var(--bd2)" onclick="setGoalsFilter('category','${_jsAttr(c).replace(/'/g,'&#39;')}')">${esc(c)}</button>`).join('')}</div>`;
  })()}
  ${(()=>{
    // G3: stale goals strip
    if(_goalsView!=='grid')return '';
    const stale=(D.goals||[]).filter(_goalIsStale).slice(0,5);
    if(!stale.length)return '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:10px;background:color-mix(in srgb,var(--warn) 10%,var(--s2));border:1px solid color-mix(in srgb,var(--warn) 35%,var(--bd2));border-radius:8px"><span style="font-size:14px">🧹</span><div style="flex:1;font-size:11px"><strong>${stale.length} stale goal${stale.length===1?'':'s'}</strong> (no check-in or update in 30+ days): ${stale.map(g=>`<span style="cursor:pointer;color:var(--ac);text-decoration:underline" onclick="openGoalCheckIn(${g.id})">${esc(g.icon||'🎯')} ${esc(g.title)}</span>`).join(' · ')}</div></div>`;
  })()}
  <div id="goals-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px"></div>`;
  renderGoalCards();
}
function openGoalCheckIn(gid){
  const g=D.goals.find(x=>x.id===gid);
  if(!g)return;
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const m=document.getElementById('modal-content');
  const prevCheckins=(g.checkIns||[]).slice(-3);
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:4px">🗓 Weekly Check-in</h2>
  <div style="font-size:12px;color:var(--t2);margin-bottom:12px">${esc(g.icon)} ${esc(g.title)} &nbsp;·&nbsp; ${today}</div>
  <div style="display:flex;gap:10px;margin-bottom:12px">
    <div style="flex:1">
      <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Progress this week</label>
      <textarea id="ci-progress" class="inp" style="width:100%;height:70px;font-size:12px;margin-top:4px;resize:vertical" placeholder="What progress did you make toward this goal?"></textarea>
    </div>
    <div style="flex:1">
      <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Blockers / challenges</label>
      <textarea id="ci-blockers" class="inp" style="width:100%;height:70px;font-size:12px;margin-top:4px;resize:vertical" placeholder="Any obstacles or challenges?"></textarea>
    </div>
  </div>
  <div style="margin-bottom:12px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Next week’s focus</label>
    <textarea id="ci-next" class="inp" style="width:100%;height:60px;font-size:12px;margin-top:4px;resize:vertical" placeholder="What will you focus on next week?"></textarea>
  </div>
  <div style="margin-bottom:12px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Update progress % (current: ${g.pct}%)</label>
    <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
      <input id="ci-pct" type="range" min="0" max="100" value="${g.pct}" style="flex:1" oninput="document.getElementById('ci-pct-val').textContent=this.value+'%'">
      <span id="ci-pct-val" style="font-size:13px;font-weight:700;color:var(--ac);min-width:36px">${g.pct}%</span>
    </div>
  </div>
  ${prevCheckins.length?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Previous check-ins</div>${prevCheckins.reverse().map(ci=>`<div style="background:var(--s3);border-radius:5px;padding:6px 8px;margin-bottom:4px;font-size:11px"><div style="font-weight:600;color:var(--t3);margin-bottom:2px">${ci.date}</div><div style="color:var(--t2)">${esc(ci.progress)}</div></div>`).join('')}</div>`:''}
  <div style="display:flex;gap:8px;flex-wrap:wrap">
  <button class="btn btn-p" onclick="saveGoalCheckIn(${gid})">Save Check-in</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function saveGoalCheckIn(gid){
  const g2=D.goals.find(x=>x.id===gid);
  if(!g2)return;
  const progress=document.getElementById('ci-progress').value.trim();
  const blockers=document.getElementById('ci-blockers').value.trim();
  const next=document.getElementById('ci-next').value.trim();
  const pct=parseInt(document.getElementById('ci-pct').value);
  if(!progress){toast('Please describe your progress.');return;}
  const today=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  if(!g2.checkIns)g2.checkIns=[];
  g2.checkIns.push({date:today,progress,blockers,next,pct});
  g2.pct=pct;
  g2.lastTouchedAt=new Date().toISOString();
  g2.pctHistory=Array.isArray(g2.pctHistory)?g2.pctHistory:[];
  g2.pctHistory.push({ts:Date.now(),pct});
  if(g2.pctHistory.length>30)g2.pctHistory=g2.pctHistory.slice(-30);
  // Also create a journal entry
  const jEntry={id:Date.now(),type:'goal-checkin',title:'Goal Check-in: '+g2.title,date:_ymd(new Date()),body:'## Progress\n'+progress+(blockers?'\n\n## Blockers\n'+blockers:'')+(next?'\n\n## Next Week\n'+next:''),tags:['goal','check-in'],mood:'',energy:'',createdAt:new Date().toISOString(),createdBy:D.creds.userName||'Idris Grant'};
  D.journal.push(jEntry);
  save('goals');save('journal');
  closeModal();
  renderGoals();
  toast('✓ Check-in saved and logged to Journal!');
}
function openGoalDetail(gid){
  const g=D.goals.find(x=>x.id===gid);
  if(!g)return;
  const ms=g.milestones||[];
  const linkedTasks=D.tasks.filter(t=>(g.linkedTaskIds||[]).includes(t.id));
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  // Build visual milestone timeline
  const totalMs=ms.length;
  const doneMs=ms.filter(m=>m.done).length;
  const msTimelineHtml=totalMs===0?'':`
  <div style="position:relative;padding:0 0 0 0;margin-bottom:4px">
    <!-- Horizontal track -->
    <div style="position:relative;height:4px;background:var(--s3);border-radius:2px;margin:20px 0 28px">
      <div style="position:absolute;left:0;top:0;height:100%;width:${totalMs>1?Math.round((doneMs/totalMs)*100):doneMs?100:0}%;background:var(--ac);border-radius:2px;transition:width .4s"></div>
      ${ms.map((m,mi)=>{
        const pct=totalMs>1?(mi/(totalMs-1))*100:50;
        return `<div style="position:absolute;top:50%;left:${pct}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${m.done?'var(--ac)':'var(--s1)'};border:2px solid ${m.done?'var(--ac)':'var(--bd2)'};cursor:pointer;z-index:1" title="${esc(m.title)}" onclick="toggleMilestone(${gid},${mi})">${m.done?'<div style="width:6px;height:6px;background:#fff;border-radius:50%;margin:2px auto"></div>':''}</div>
        <div style="position:absolute;top:14px;left:${pct}%;transform:translateX(-50%);font-size:9px;color:${m.done?'var(--ac)':'var(--t3)'};white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis;text-align:center">${esc(m.title)}</div>`;
      }).join('')}
    </div>
  </div>
  <div id="ms-list" style="display:block">${ms.map((m,mi)=>`<div class="lr" style="padding:4px 0"><div class="chk ${m.done?'on':''}" onclick="toggleMilestone(${gid},${mi})"></div><span class="rt" style="font-size:11px;${m.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m.title)}</span><span style="font-size:11px;color:var(--t3)">${m.due||''}</span><span class="acts"><button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" onclick="editMilestone(${gid},${mi})">✏</button><button class="btn btn-d" style="height:18px;font-size:10px;padding:0 4px" onclick="deleteMilestone(${gid},${mi})">✕</button></span></div>`).join('')}</div>`;
  const msHtml=ms.map((m,mi)=>`<div class="lr" style="padding:4px 0">
    <div class="chk ${m.done?'on':''}" onclick="toggleMilestone(${gid},${mi})"></div>
    <span class="rt" style="font-size:11px;${m.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m.title)}</span>
    <span style="font-size:11px;color:var(--t3)">${m.due||''}</span>
  </div>`).join('');
  const taskHtml=linkedTasks.map(t=>`<div class="lr" style="padding:3px 0;cursor:pointer" onclick="closeDrawer();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">
    <div class="chk ${t.status==='Done'?'on':''}"></div>
    <span class="rt" style="font-size:11px;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span>
    <span class="pill ${pillClass(t.priority)}" style="font-size:11px">${t.priority}</span>
  </div>`).join('');
  d.innerHTML=`<h2>${g.icon} ${esc(g.title)} <button class="close" onclick="closeDrawer()">✕</button></h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:8px">${esc(g.category||'')} · ${esc(g.target)}</div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <div class="pb" style="flex:1"><div class="f" style="width:${g.pct}%;background:var(--ac)"></div></div>
    <span style="font-size:14px;font-weight:700;color:var(--ac)">${g.pct}%</span>
  </div>
  ${g.descriptionHtml?`<div class="md-body" style="font-size:12px;color:var(--t1);margin-bottom:12px;padding:10px;background:var(--s2);border:1px solid var(--bd1);border-radius:6px;line-height:1.6">${g.descriptionHtml}</div>`:''}
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:12px;font-weight:600">🏁 Milestones${totalMs?` (${doneMs}/${totalMs})`:''}</div>${totalMs?`<button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px" onclick="document.getElementById('ms-list').style.display=document.getElementById('ms-list').style.display==='none'?'block':'none'">List ▾</button>`:''}</div>${msTimelineHtml||`<div id="ms-list" style="font-size:11px;color:var(--t3);padding:6px 0">No milestones yet — add the first one below.</div>`}<div style="display:flex;gap:6px;margin:6px 0 12px"><input class="inp" placeholder="Add milestone..." id="new-ms" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();addMilestone(${gid})}"><input class="inp" type="date" id="new-ms-due" style="width:120px"><button class="btn btn-s" onclick="addMilestone(${gid})">+ Add</button></div>  ${linkedTasks.length?`<div style="font-size:12px;font-weight:600;margin-bottom:6px">📋 Linked Tasks (${linkedTasks.length})</div>${taskHtml}`:''}  <div style="display:flex;gap:8px;margin-top:12px">    <button class="btn btn-p" onclick="closeDrawer();openDrawer('goal',D.goals.find(x=>x.id===${gid}))">✏ Edit Goal</button>    <button class="btn btn-s" onclick="closeDrawer()">Close</button>  </div>`;
  ov.classList.add('show');
}
function toggleMilestone(goalId,idx){
  const g=D.goals.find(x=>x.id===goalId);
  if(!g||!g.milestones[idx])return;
  g.milestones[idx].done=!g.milestones[idx].done;
  save('goals');
  const list=document.getElementById('ms-list');
  if(list){
    const ms=g.milestones;
    list.innerHTML=ms.map((m,mi)=>`<div class="lr" style="padding:4px 0"><div class="chk ${m.done?'on':''}" onclick="toggleMilestone(${goalId},${mi})"></div><span class="rt" style="font-size:11px;${m.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m.title)}</span><span style="font-size:11px;color:var(--t3)">${m.due||''}</span><span class="acts"><button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" onclick="editMilestone(${goalId},${mi})">✏</button><button class="btn btn-d" style="height:18px;font-size:10px;padding:0 4px" onclick="deleteMilestone(${goalId},${mi})">✕</button></span></div>`).join('');
  }
  toast(g.milestones[idx].done?'🏁 Milestone complete!':'Milestone unmarked');
}
function addMilestone(goalId){
  const g=D.goals.find(x=>x.id===goalId);
  if(!g)return;
  const inp=document.getElementById('new-ms');
  const due=document.getElementById('new-ms-due');
  const title=(inp?.value||'').trim();
  if(!title){toast('Enter a milestone title');return;}
  if(!g.milestones)g.milestones=[];
  g.milestones.push({id:Date.now(),title,done:false,due:due?.value||''});
  autoCalcGoalPct(g);
  save('goals');
  _refreshGoals();
  openGoalDetail(goalId);
  toast('Milestone added');
}
function editMilestone(goalId,idx){
  const g=D.goals.find(x=>x.id===goalId);
  if(!g||!g.milestones[idx])return;
  const m=g.milestones[idx];
  const newTitle=prompt('Edit milestone title:',m.title);
  if(newTitle===null)return;
  const trimmed=newTitle.trim();
  if(!trimmed){toast('Title cannot be empty');return;}
  m.title=trimmed;
  save('goals');
  const list=document.getElementById('ms-list');
  if(list){
    const ms=g.milestones;
    list.innerHTML=ms.map((m2,mi)=>`<div class="lr" style="padding:4px 0"><div class="chk ${m2.done?'on':''}" onclick="toggleMilestone(${goalId},${mi})"></div><span class="rt" style="font-size:11px;${m2.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m2.title)}</span><span style="font-size:11px;color:var(--t3)">${m2.due||''}</span><span class="acts"><button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" onclick="editMilestone(${goalId},${mi})">✏</button><button class="btn btn-d" style="height:18px;font-size:10px;padding:0 4px" onclick="deleteMilestone(${goalId},${mi})">✕</button></span></div>`).join('');
  }
  toast('Milestone updated');
}
function deleteMilestone(goalId,idx){
  const g=D.goals.find(x=>x.id===goalId);
  if(!g||!g.milestones[idx])return;
  if(!confirm(`Delete milestone "${g.milestones[idx].title}"?`))return;
  g.milestones.splice(idx,1);
  autoCalcGoalPct(g);
  save('goals');
  const list=document.getElementById('ms-list');
  if(list){
    const ms=g.milestones;
    list.innerHTML=ms.map((m,mi)=>`<div class="lr" style="padding:4px 0"><div class="chk ${m.done?'on':''}" onclick="toggleMilestone(${goalId},${mi})"></div><span class="rt" style="font-size:11px;${m.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(m.title)}</span><span style="font-size:11px;color:var(--t3)">${m.due||''}</span><span class="acts"><button class="btn btn-s" style="height:18px;font-size:10px;padding:0 4px" onclick="editMilestone(${goalId},${mi})">✏</button><button class="btn btn-d" style="height:18px;font-size:10px;padding:0 4px" onclick="deleteMilestone(${goalId},${mi})">✕</button></span></div>`).join('');
  }
  _refreshGoals();
  toast('Milestone deleted');
}

// Global so the Journal tab filter persists across re-renders.
if(typeof _jrnlFilter==='undefined')var _jrnlFilter='All';
// Hoisted to global scope so inline onclicks in the journal tabs can call it reliably.
// Journal page state (J1, J2, J3 — view + search + selected day)
if(typeof _jrnlSearch==='undefined')var _jrnlSearch='';
if(typeof _jrnlView==='undefined')var _jrnlView='list';
if(typeof _jrnlCalDate==='undefined')var _jrnlCalDate=new Date();
const JOURNAL_CATEGORIES=['Daily','Weekly Review','Gratitude','Planning','Reflection'];
// Parse free-form journal date strings ("Today · May 12", "May 12, 2026", ISO)
// into a real Date. Returns null when unparseable.
function _parseJournalDate(j){
  if(j.createdAt){const d=_pd(j.createdAt);if(!isNaN(d))return d;}
  let raw=String(j.date||'').trim();
  if(/^\d{4}-\d{2}-\d{2}/.test(raw)){const d=_pd(raw);if(!isNaN(d))return d;}
  // Strip leading relative words / weekday names so strings like
  // "Yesterday · Sunday, May 18" still resolve to a real date.
  raw=raw.replace(/^(today|yesterday|tomorrow)\b\s*[·\-,]?\s*/i,'')
         .replace(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b\s*[·\-,]?\s*/i,'')
         .trim();
  // Extract "Month Day" and force a year — yearless strings like "May 19"
  // otherwise parse to year 2001 in V8, which gives the wrong weekday.
  const m=raw.match(/([A-Za-z]{3,9})\s+(\d{1,2})/);
  if(m){
    const explicit=(raw.match(/\b(20\d{2})\b/)||[])[1];
    const yr=explicit||new Date().getFullYear();
    const d=new Date(`${m[1]} ${m[2]}, ${yr}`);
    // A year-less entry can't be in the future: "December 30" read in
    // January was written last year.
    if(!isNaN(d)&&!explicit&&d-Date.now()>2*86400000)d.setFullYear(d.getFullYear()-1);
    if(!isNaN(d))return d;
  }
  const d=_pd(raw);
  return isNaN(d)?null:d;
}
// Format a journal entry's date for display — recomputes the weekday and the
// Today/Yesterday prefix from the real date, so stale stored strings (the
// sample entries hardcode the wrong weekday) still render correctly.
function _fmtJournalDate(j){
  const d=_parseJournalDate(j);
  if(!d)return String(j.date||'');
  const t=new Date();t.setHours(0,0,0,0);
  const dd=_pd(d);dd.setHours(0,0,0,0);
  const diff=Math.round((t-dd)/86400000);
  const wd=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
  const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const rel=diff===0?'Today · ':diff===1?'Yesterday · ':'';
  return `${rel}${wd}, ${mo} ${d.getDate()}`;
}
// Strip diaryBody/bodyHtml to plain text for previews (J7).
function _journalPreviewText(j){
  if(j.diaryBody){const t=luParseInert(j.diaryBody);return (t.textContent||'').trim();}
  if(j.bodyHtml){const t=luParseInert(j.bodyHtml);return (t.textContent||'').trim();}
  return j.body||'';
}
function _journalCategoryOf(j){
  if(j.category)return j.category;
  // Legacy fallback: infer from tags or title keywords.
  const lc=(j.title||'').toLowerCase()+' '+(j.tags||[]).join(' ').toLowerCase();
  for(const c of JOURNAL_CATEGORIES)if(lc.includes(c.toLowerCase()))return c;
  return 'Daily';
}
function setJournalCategoryFilter(c){_jrnlFilter=c||'All';renderJournalList();}
function setJournalSearch(q){_jrnlSearch=q||'';renderJournalList();}
function setJournalView(v){_jrnlView=v||'list';renderJournal();}
function jrnlCalNav(delta){const d=_pd(_jrnlCalDate);d.setMonth(d.getMonth()+delta);_jrnlCalDate=d;renderJournal();}
function _filteredJournalEntries(){
  let entries=[...(D.journal||[])];
  if(_jrnlFilter&&_jrnlFilter!=='All')entries=entries.filter(j=>_journalCategoryOf(j)===_jrnlFilter);
  if(_jrnlSearch){
    const q=_jrnlSearch.toLowerCase();
    entries=entries.filter(j=>(j.title||'').toLowerCase().includes(q)||_journalPreviewText(j).toLowerCase().includes(q)||(j.tags||[]).some(t=>t.toLowerCase().includes(q)));
  }
  return entries;
}
function renderJournalList(){
  const entries=_filteredJournalEntries();
  const el=document.getElementById('jrnl-entries');
  if(!el)return;
  if(!entries.length){
    el.innerHTML=renderEmptyState({icon:'bookOpen',title:_jrnlFilter&&_jrnlFilter!=='All'?`No ${_jrnlFilter} entries match`:(_jrnlSearch?'No entries match your search':'Your journal is empty'),hint:_jrnlSearch?'Try a broader search or clear filters.':'Daily writing builds clarity. Even 3 lines counts.',ctaLabel:_jrnlSearch?'Clear search':'+ Write your first entry',ctaFn:_jrnlSearch?"setJournalSearch('');document.getElementById('jrnl-search').value=''":"openFA('journal')"});
    return;
  }
  el.innerHTML=entries.map(j=>`<div class="cd" style="cursor:pointer;margin-bottom:8px" onclick="openDrawer('journal',D.journal.find(x=>x.id==${_tidLit(j.id)}))" onmouseover="this.style.borderColor='var(--ac)'" onmouseout="this.style.borderColor='var(--bd2)'"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-size:11px;color:var(--t3)">${esc(_fmtJournalDate(j))} · <span style="color:var(--ac)">${esc(_journalCategoryOf(j))}</span></div><div style="font-size:16px">${j.mood||''}</div></div><div style="font-size:13px;font-weight:500;margin-bottom:4px">${esc(j.title||'(untitled)')}</div><div style="font-size:11px;color:var(--t2);line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(_journalPreviewText(j).slice(0,360))}</div></div>`).join('');
}
// J3: month-grid calendar view of journal entries
function renderJournalCalendar(){
  const el=document.getElementById('jrnl-entries');
  if(!el)return;
  const d=_pd(_jrnlCalDate);
  const year=d.getFullYear(),month=d.getMonth();
  const first=new Date(year,month,1);
  const startDow=first.getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const monthLabel=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  // Bucket entries by yyyy-mm-dd
  const buckets={};
  (D.journal||[]).forEach(j=>{const dt=_parseJournalDate(j);if(!dt)return;const k=_ymd(dt);(buckets[k]=buckets[k]||[]).push(j);});
  const cells=[];
  for(let i=0;i<startDow;i++)cells.push('<div></div>');
  const todayKey=_ymd(new Date());
  for(let dom=1;dom<=daysInMonth;dom++){
    const dt=new Date(year,month,dom);
    const k=_ymd(dt);
    const list=buckets[k]||[];
    const isToday=k===todayKey;
    const moods=list.map(j=>j.mood||'').filter(Boolean).slice(0,3).join('');
    const action=list.length?`onclick="openDrawer('journal',D.journal.find(x=>x.id===${list[0].id}))"`:`onclick="openFA('journal')"`;
    cells.push(`<div class="lu-jcal-cell ${isToday?'today':''} ${list.length?'has-entry':''}" ${action} title="${list.length?list.length+' entr'+(list.length===1?'y':'ies'):'No entry — click to add'}"><span class="lu-jcal-num">${dom}</span><span class="lu-jcal-moods">${moods}</span>${list.length>1?`<span class="lu-jcal-count">${list.length}</span>`:''}</div>`);
  }
  el.innerHTML=`<div class="lu-jcal">
    <div class="lu-jcal-h"><button class="btn btn-s" onclick="jrnlCalNav(-1)">‹</button><span>${monthLabel}</span><button class="btn btn-s" onclick="jrnlCalNav(1)">›</button><button class="btn btn-s" style="margin-left:auto" onclick="_jrnlCalDate=new Date();renderJournal()">Today</button></div>
    <div class="lu-jcal-dows">${['S','M','T','W','T','F','S'].map(d=>`<span>${d}</span>`).join('')}</div>
    <div class="lu-jcal-grid">${cells.join('')}</div>
  </div>`;
}
// J4: 14-day mood sparkline (mirrors the home Mood Trend widget but inline)
function _renderJournalMoodSparkline(){
  const moodMap={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};
  const days=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));return d;});
  const series=days.map(d=>{const k=_ymd(d);const list=(D.journal||[]).filter(j=>{const jd=_parseJournalDate(j);return jd&&_ymd(jd)===k;});const last=list[list.length-1];return {date:k,mood:last?last.mood:null,score:last&&moodMap[last.mood]?moodMap[last.mood]:null};});
  const valid=series.filter(s=>s.score!==null);
  if(!valid.length)return '';
  const points=series.map((s,i)=>{const x=i/(series.length-1)*100;const y=s.score?100-((s.score-1)/4)*90-5:null;return {x,y,score:s.score,date:s.date,mood:s.mood};});
  const path='M '+points.filter(p=>p.y!==null).map(p=>`${p.x},${p.y}`).join(' L ');
  const dots=points.filter(p=>p.y!==null).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="var(--ac)"><title>${p.date}: ${p.mood} (${p.score}/5)</title></circle>`).join('');
  const avg=(valid.reduce((s,p)=>s+p.score,0)/valid.length).toFixed(1);
  return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:10px;background:var(--s2);border:1px solid var(--bd1);border-radius:8px"><span style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;font-weight:600;flex-shrink:0">Mood · 14d</span><svg viewBox="0 0 100 60" preserveAspectRatio="none" style="width:200px;height:30px;overflow:visible"><path d="${path}" stroke="var(--ac)" stroke-width="1.5" fill="none" vector-effect="non-scaling-stroke"/>${dots}</svg><span style="font-size:11px;color:var(--t2);flex:1">avg <strong style="color:var(--ac)">${avg}</strong>/5 · ${valid.length} entr${valid.length===1?'y':'ies'}</span></div>`;
}
// J5: "On this day" entries from prior years.
function _onThisDayEntries(){
  const today=new Date();const md=`${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return (D.journal||[]).filter(j=>{const d=_parseJournalDate(j);if(!d)return false;return d.getFullYear()<today.getFullYear()&&`${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`===md;}).sort((a,b)=>(_parseJournalDate(b)||0)-(_parseJournalDate(a)||0));
}
// J6: rotate writing prompts daily and offer an AI-generated refresh.
function _journalPromptPool(){
  return [
    {icon:'🙏',title:'Gratitude',text:'What are you grateful for today?'},
    {icon:'💡',title:'Learning',text:'What did you learn today?'},
    {icon:'🎯',title:'Planning',text:'What is your top priority for tomorrow?'},
    {icon:'🌟',title:'Wins',text:'What went well today?'},
    {icon:'🔄',title:'Reflection',text:'What would you do differently?'},
    {icon:'😊',title:'Check-in',text:'How are you feeling right now?'},
    {icon:'🧭',title:'Direction',text:'If you only get one thing right this week, what should it be?'},
    {icon:'🪞',title:'Self-talk',text:'What story am I telling myself right now? Is it true?'},
    {icon:'🌱',title:'Growth',text:'Where did I push beyond my comfort zone today?'},
    {icon:'🔋',title:'Energy',text:'What drained my energy today? What restored it?'},
    {icon:'🤝',title:'Relationships',text:'Who did I help today? Who helped me?'},
    {icon:'🎨',title:'Creativity',text:'What would I make if no one was watching?'},
  ];
}
async function refreshJournalPromptsAI(){
  const cached=D.prefs&&D.prefs.aiJournalPrompts;
  const today=_ymd(new Date());
  if(cached&&cached.date===today&&!cached.regenerate){toast('Already fresh — try again tomorrow.');return;}
  toast({type:'info',title:'Generating fresh prompts…',duration:2000});
  try{
    const {provider,configured}=_getAIConfig();
    const recent=(D.journal||[]).slice(-10).map(j=>j.title||(j.body||'').slice(0,80)).join(' / ');
    const sys=`You are a thoughtful journaling coach. Read the user's recent journal titles and propose 6 fresh writing prompts (each: title 1-3 words, prompt 8-15 words, single emoji). Reply with strict JSON only: {"prompts":[{"icon":"🙏","title":"…","text":"…"}, …]}`;
    const res=await _trpc('ai.assist',{systemPrompt:sys,userContent:`Recent entries: ${recent||'(none)'}\nGenerate 6 prompts.`,provider:provider||'manus'},'mutation');
    const text=String(res?.result||res?.text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const parsed=JSON.parse(text);
    if(!parsed||!Array.isArray(parsed.prompts))throw new Error('bad response');
    D.prefs.aiJournalPrompts={date:today,prompts:parsed.prompts.slice(0,6)};
    save('prefs');renderJournal();
    toast({type:'success',title:'✨ Prompts refreshed',duration:1800});
  }catch(e){
    toast({type:'error',title:'Could not refresh prompts',msg:'Falling back to today\'s rotation.',duration:3000});
  }
}
function renderJournal(){
  const total=D.journal.length;const streak=(typeof calcJournalStreak==='function')?calcJournalStreak():0;
  const sparkHtml=_renderJournalMoodSparkline();
  $('jrnl-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('edit',22,'var(--page-accent)')}Journal</h1><p style="font-size:12px;color:var(--t2)">${total?`${total} entr${total===1?'y':'ies'}${streak?` · ${streak}-day streak 🔥`:''}`:'No entries yet — write your first one.'}</p></div><div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
    <div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden">
      <button class="btn" style="border-radius:0;height:28px;width:32px;padding:0;font-size:13px;background:${_jrnlView==='list'?'var(--ac)':'transparent'};color:${_jrnlView==='list'?'#fff':'var(--t2)'};border:none" title="List view" onclick="setJournalView('list')">☰</button>
      <button class="btn" style="border-radius:0;height:28px;width:32px;padding:0;font-size:13px;background:${_jrnlView==='calendar'?'var(--ac)':'transparent'};color:${_jrnlView==='calendar'?'#fff':'var(--t2)'};border:none" title="Calendar view" onclick="setJournalView('calendar')">🗓</button>
    </div>
    <div style="position:relative;display:inline-block"><button class="btn btn-s" style="font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('jrnl-ai-menu')" title="AI tools">✨ AI ▾</button><div id="jrnl-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('jrnl-ai-menu');aiJournalSentiment()">📈 Sentiment Trend</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('jrnl-ai-menu');aiJournalThemes()">🔍 Recurring Themes</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('jrnl-ai-menu');aiJournalPrompt()">✏ Writing Prompt</button></div></div>
    <div style="position:relative;display:inline-block"><button class="btn btn-s" style="font-size:11px" onclick="event.stopPropagation();togglePopMenu('jrnl-export-menu')" title="Export">⬇ Export ▾</button><div id="jrnl-export-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('jrnl-export-menu');openJournalExportModal('md')">⬇ Markdown</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('jrnl-export-menu');openJournalExportModal('pdf')">🖨 PDF</button></div></div>
    <button class="btn btn-p" onclick="openFA('journal')">+ New Entry</button>
  </div></div>
  ${sparkHtml}
  <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><input id="jrnl-search" class="inp" placeholder="🔍 Search entries…" value="${esc(_jrnlSearch)}" style="flex:1;height:28px;font-size:11px" oninput="setJournalSearch(this.value)"></div>
  <div class="tabs" id="jrnl-tabs">${['All',...JOURNAL_CATEGORIES].map(t=>`<div class="tab ${(_jrnlFilter||'All')===t?'on':''}" onclick="setJournalCategoryFilter('${_jsAttr(t)}')">${t}</div>`).join('')}</div>
  <div id="jrnl-entries"></div>`;
  if(_jrnlView==='calendar')renderJournalCalendar();
  else renderJournalList();
  // Rail
  const onThisDay=_onThisDayEntries();
  const promptsCache=D.prefs&&D.prefs.aiJournalPrompts;
  const today=_ymd(new Date());
  const useCached=promptsCache&&promptsCache.date===today&&Array.isArray(promptsCache.prompts)&&promptsCache.prompts.length;
  // Daily-rotated prompts: pick 6 from the pool seeded by day-of-year.
  const pool=_journalPromptPool();
  const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0).getTime())/86400000);
  const rotated=Array.from({length:6},(_,i)=>pool[(doy*6+i)%pool.length]);
  const prompts=useCached?promptsCache.prompts:rotated;
  $('jrnl-rail').innerHTML=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:4px">Writing Streak</div><div style="font-size:20px;font-weight:700;color:var(--ac)">${streak} day${streak!==1?'s':''} 🔥</div></div>
  ${onThisDay.length?`<div style="margin-bottom:12px;padding:10px;background:var(--s2);border:1px solid var(--bd1);border-radius:8px"><div style="font-size:11px;font-weight:600;margin-bottom:6px">📅 On this day</div>${onThisDay.slice(0,4).map(j=>{const d=_parseJournalDate(j);const yr=d?d.getFullYear():'';return `<div class="lr" style="font-size:11px;cursor:pointer;padding:4px 0" onclick="openDrawer('journal',D.journal.find(x=>x.id==${_tidLit(j.id)}))"><span style="font-size:11px;color:var(--t3);width:36px;flex-shrink:0">${yr}</span><span class="rt" style="font-size:11px">${esc(j.title||'(untitled)')}</span><span style="font-size:12px;flex-shrink:0">${j.mood||''}</span></div>`;}).join('')}</div>`:''}
  <div style="margin-bottom:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><div style="font-size:12px;font-weight:600">Prompts</div><button class="btn btn-s" style="font-size:10px;padding:0 6px;height:20px;color:var(--ac)" onclick="refreshJournalPromptsAI()" title="Generate fresh AI prompts based on your recent entries">✨ Refresh</button></div>
  <p style="font-size:11px;color:var(--t3);margin-bottom:6px">${useCached?'AI-generated for today':'Rotates daily'}</p>
  ${prompts.map(p=>`<div style="background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:8px 10px;margin-bottom:5px;cursor:pointer;transition:all .15s;display:flex;align-items:flex-start;gap:7px" onmouseover="this.style.borderColor='var(--ac)';this.style.background='var(--acs)'" onmouseout="this.style.borderColor='var(--bd2)';this.style.background='var(--s2)'" onclick="openJournalPrompt('${_jsAttr(p.title).replace(/'/g,'&#39;')}','${_jsAttr(p.text).replace(/'/g,'&#39;')}')"><span style="font-size:14px;flex-shrink:0">${p.icon||'✏'}</span><div><div style="font-size:11px;font-weight:500;color:var(--t1);margin-bottom:1px">${esc(p.title||'')}</div><div style="font-size:11px;color:var(--t2);line-height:1.3">${esc(p.text||'')}</div></div></div>`).join('')}</div>`;
}

function _getMailItems(){
  if(D&&D.mail&&D.mail.inbox&&D.mail.inbox.length)return D.mail.inbox;
  return [];
}
function _getSentItems(){
  if(D&&D.mail&&D.mail.sent&&D.mail.sent.length)return D.mail.sent;
  return [];
}
function openInlineReply(id){
  const el=document.getElementById('inline-reply-'+id);
  if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
  if(el.style.display==='block'){
    const rte=document.getElementById('inline-reply-rte-'+id);
    if(rte)setTimeout(()=>rte.focus(),50);
  }
}
async function sendInlineReply(id){
  const items=_getMailItems();
  // ids arrive as strings from the onclick; synced mail ids are numbers.
  const mail=items.find(m=>String(m.id)===String(id));
  if(!mail)return;
  const rte=document.getElementById('inline-reply-rte-'+id);
  const body=rte?rte.innerHTML:'';
  if(!body.trim()||body==='<br>')return toast('⚠️ Reply body is empty');
  const to=mail.fromEmail||mail.email||mail.from||'';
  const subject='Re: '+(mail.subject||'').replace(/^Re:\s*/i,'');
  const btn=document.querySelector(`#inline-reply-${id} .btn-p`);
  if(btn){btn.disabled=true;btn.textContent='Sending...';}
  try{
    await _trpc('oauthSync.sendComposedMail',{to,subject,body,cc:'',bcc:'',via:'microsoft'},'mutation');
    toast('✓ Reply sent');
    const el=document.getElementById('inline-reply-'+id);
    if(el)el.style.display='none';
    if(rte)rte.innerHTML='';
    // Add to sent
    if(!D.mail)D.mail={inbox:[],sent:[],drafts:[]};
    if(!D.mail.sent)D.mail.sent=[];
    D.mail.sent.unshift({id:'sent-'+Date.now(),to,subject,body,sentDateTime:new Date().toISOString(),read:true});
    save('mail');
  }catch(e){
    toast('⚠️ '+e.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Send Reply';}
  }
}
function _fmtMailDate(d){
  if(!d)return '';
  const dt=_pd(d);
  const now=new Date();
  const diff=now-dt;
  if(diff<86400000)return dt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  if(diff<172800000)return 'Yesterday';
  if(diff<604800000)return Math.floor(diff/86400000)+' days ago';
  return dt.toLocaleDateString([],{month:'short',day:'numeric'});
}
let _selectedMail=null;
let _mailTab='inbox';
function openMailItem(id){
  _selectedMail=id;
  const items=_mailTab==='sent'?_getSentItems():_getMailItems();
  // Inbox onclicks pass the id wrapped in '' (string) while synced messages
  // store numeric ids — compare as strings to avoid type-mismatched lookups
  // that left the detail pane blank.
  const mail=items.find(m=>String(m.id)===String(id));
  if(!mail)return;
  mail.read=true;
  save('mail');
  // Re-render list to show read state
  const inboxEl=document.getElementById('mail-inbox-list');
  if(inboxEl)inboxEl.innerHTML=_mailTab==='sent'?renderMailSentList():renderMailInboxList();
  // Show detail
  const det=document.getElementById('mail-detail');
  if(!det)return;
  const fromLine=_mailTab==='sent'
    ?`<div style="font-size:11px;color:var(--t3);margin-top:2px">To: ${esc(mail.to||mail.toEmail||'')}</div>`
    :`<div style="font-size:11px;color:var(--t3);margin-top:2px">From: ${esc(mail.from||'')} ${mail.fromEmail?'&lt;'+esc(mail.fromEmail)+'&gt;':''}</div>`;
  const dateStr=_fmtMailDate(mail.date||mail.sentDateTime||mail.receivedDateTime);
  det.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
  <div><div style="font-size:14px;font-weight:600">${esc(mail.subject||'(no subject)')}</div>${fromLine}<div style="font-size:11px;color:var(--t3)">${dateStr}</div></div>
   <div style="display:flex;gap:4px">${_mailTab!=='sent'?`<button class="btn btn-p" style="height:24px;font-size:11px" onclick="openInlineReply('${_jsAttr(id)}')">↩ Reply</button><button class="btn btn-s" style="height:24px;font-size:11px" onclick="aiSmartReply('${_jsAttr(id)}')">✨ Smart Reply</button><button class="btn btn-s" style="height:24px;font-size:11px" onclick="openComposeModal({to:'${_jsAttr(mail.fromEmail||mail.email||'')}',subject:'Fwd: ${_jsAttr(mail.subject||'')}'})">Forward</button>`:''}</div>
  </div>
  <div style="font-size:12px;color:var(--t2);line-height:1.7;border-top:1px solid var(--bd1);padding-top:12px">${mail.body?(mail.body.includes('<')?luSanitizeHtml(mail.body):esc(mail.body)):esc(mail.preview||'(no preview)')}</div>
  ${_mailTab!=='sent'?`<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--bd1);display:flex;gap:6px">
  <button class="btn btn-s" style="height:24px;font-size:11px" onclick="toast('Archived')">Archive</button>
  <button class="btn btn-s" style="height:24px;font-size:11px" onclick="toast('Flagged')">Flag</button>
  <button class="btn btn-s" style="height:24px;font-size:11px" onclick="openFA('task')">Create Task</button>
  <button class="btn btn-s" style="height:24px;font-size:11px;color:var(--purp)" onclick="aiSummarizeThread('${_jsAttr(id)}')">✨ Summarize</button>
  <button class="btn btn-s" style="height:24px;font-size:11px;color:var(--grn)" onclick="aiFollowUpReminder('${_jsAttr(id)}')">⏰ Follow-up</button>
  </div>
  <div id="inline-reply-${id}" style="display:none;margin-top:12px;border:1px solid var(--bd1);border-radius:8px;padding:12px;background:var(--s2)">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px">↩ Reply to ${esc(mail.from||mail.fromEmail||'')}</div>
    <div id="inline-reply-rte-${id}" style="min-height:100px;border:1px solid var(--bd1);border-radius:6px;background:var(--s1);padding:8px;font-size:12px;outline:none" contenteditable="true" placeholder="Write your reply..."></div>
    <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
      <button class="btn btn-s" style="height:26px;font-size:11px" onclick="document.getElementById('inline-reply-${id}').style.display='none'">Cancel</button>
      <button class="btn btn-p" style="height:26px;font-size:11px" onclick="sendInlineReply('${_jsAttr(id)}')">Send Reply</button>
    </div>
  </div>`:''}`;
}
function renderMailInboxList(q=''){
  let items=_getMailItems();
  if(q)items=items.filter(m=>(m.from||'').toLowerCase().includes(q)||(m.subject||'').toLowerCase().includes(q)||(m.preview||m.body||'').toLowerCase().includes(q));
  if(!items.length)return q?`<div style="padding:20px;text-align:center;color:var(--t3);font-size:11px">No results for "${esc(q)}"</div>`:renderEmptyState({icon:'mail',title:'Inbox zero — or nothing synced yet',hint:'Connect Microsoft 365 in Settings → Accounts and your inbox will populate here.',ctaLabel:'Sync from Office 365',ctaFn:"syncOAuthMail('microsoft')"});
  return items.map(m=>{
    const sel=_selectedMail===m.id;
    const dt=_fmtMailDate(m.date||m.receivedDateTime);
    return `<div class="lr" style="cursor:pointer;background:${sel?'var(--s3)':'transparent'};border-radius:6px;padding:6px 8px" onclick="openMailItem('${_jsAttr(m.id)}')" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='${sel?'var(--s3)':'transparent'}'"><span style="width:6px;height:6px;border-radius:50%;background:${m.read?'transparent':'var(--ac)'};flex-shrink:0;margin-top:2px"></span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:${m.read?400:600}">${esc(m.from||'')}</div><div style="font-size:11px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject||'(no subject)')}</div></div><span style="font-size:11px;color:var(--t3);white-space:nowrap">${dt}</span></div>`;
  }).join('');
}
function renderMailSentList(q=''){
  let items=_getSentItems();
  if(q)items=items.filter(m=>(m.to||m.toEmail||'').toLowerCase().includes(q)||(m.subject||'').toLowerCase().includes(q)||(m.preview||m.body||'').toLowerCase().includes(q));
  if(!items.length)return q?`<div style="padding:20px;text-align:center;color:var(--t3);font-size:11px">No results for "${esc(q)}"</div>`:renderEmptyState({icon:'mail',title:'No sent messages yet',hint:'Sync from Office 365 to pull in your sent mail.',ctaLabel:'Sync sent mail',ctaFn:'syncSentMail()'});
  return items.map(m=>{
    const sel=_selectedMail===m.id;
    const dt=_fmtMailDate(m.date||m.sentDateTime);
    return `<div class="lr" style="cursor:pointer;background:${sel?'var(--s3)':'transparent'};border-radius:6px;padding:6px 8px" onclick="openMailItem('${_jsAttr(m.id)}')" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='${sel?'var(--s3)':'transparent'}'"><span style="width:6px;height:6px;border-radius:50%;background:transparent;flex-shrink:0;margin-top:2px"></span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:400">To: ${esc(m.to||m.toEmail||'')}</div><div style="font-size:11px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.subject||'(no subject)')}</div></div><span style="font-size:11px;color:var(--t3);white-space:nowrap">${dt}</span></div>`;
  }).join('');
}
async function syncSentMail(){
  toast('⏳ Syncing sent items...');
  try{
    const result=await _trpc('oauthSync.syncSentMail',{limit:20},'mutation');
    const messages=result?.messages||[];
    if(!D.mail)D.mail={inbox:[],sent:[],drafts:[]};
    if(!D.mail.sent)D.mail.sent=[];
    let added=0;
    messages.forEach(m=>{
      if(!m)return;
      const exists=D.mail.sent.find(x=>x.id===m.id||( x.subject===m.subject&&x.to===m.to));
      if(!exists){D.mail.sent.push({id:m.id,to:m.to,toEmail:m.toEmail,subject:m.subject,preview:m.preview,date:m.date,read:true,source:'microsoft'});added++;}
    });
    save('mail');
    if(typeof renderMail==='function')renderMail();
    toast('✓ Synced '+added+' sent items');
  }catch(e){toast('⚠️ '+e.message);}
}
// ====== MAIL AI ======
function aiSmartReply(id){
  const mail=_getMailItems().find(m=>String(m.id)===String(id));
  if(!mail)return;
  toast('✨ Drafting smart reply...');
  const body=(mail.body||'').toLowerCase();
  // Detect intent and generate contextual reply
  let draft='';
  if(body.includes('meeting')||body.includes('schedule')||body.includes('available')){
    draft=`Hi ${mail.from.split(' ')[0]},\n\nThanks for reaching out. I'd be happy to connect. I'm available:\n\n• Tuesday 10am–12pm\n• Wednesday 2–4pm\n• Thursday 9–11am\n\nLet me know what works best for you, or feel free to send a calendar invite.\n\nBest,\n${D.creds.userName||'Idris'}`;
  } else if(body.includes('question')||body.includes('help')||body.includes('how')){
    draft=`Hi ${mail.from.split(' ')[0]},\n\nThank you for your message. I've reviewed your question and happy to help.\n\n[Your response here]\n\nPlease let me know if you need any clarification or have additional questions.\n\nBest regards,\n${D.creds.userName||'Idris'}`;
  } else if(body.includes('follow up')||body.includes('checking in')||body.includes('update')){
    draft=`Hi ${mail.from.split(' ')[0]},\n\nThanks for following up. Here's a quick update:\n\n[Status update here]\n\nI'll keep you posted on any further developments. Don't hesitate to reach out if you need anything.\n\nBest,\n${D.creds.userName||'Idris'}`;
  } else if(body.includes('thank')||body.includes('appreciate')){
    draft=`Hi ${mail.from.split(' ')[0]},\n\nThank you for your kind words! It was a pleasure working with you on this.\n\nLooking forward to our continued collaboration.\n\nBest regards,\n${D.creds.userName||'Idris'}`;
  } else {
    draft=`Hi ${mail.from.split(' ')[0]},\n\nThank you for your email regarding "${mail.subject}". I've reviewed your message and will get back to you shortly with a full response.\n\nBest regards,\n${D.creds.userName||'Idris'}`;
  }
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ Smart Reply Draft</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:8px">Re: ${esc(mail.subject)}</div>
  <textarea id="smart-reply-body" class="inp" style="height:200px;font-size:12px;font-family:inherit;resize:vertical">${esc(draft)}</textarea>
  <div style="display:flex;gap:8px;margin-top:10px">
  <button class="btn btn-p" onclick="const body=document.getElementById('smart-reply-body').value;closeModal();openComposeModal({to:'${_jsAttr(mail.fromEmail||mail.email||'')}',subject:'Re: ${_jsAttr(mail.subject||'')}',body:body})">Use in Compose</button>
  <button class="btn btn-s" onclick="navigator.clipboard.writeText(document.getElementById('smart-reply-body').value).then(()=>toast('✓ Copied!')).catch(()=>toast('Copy failed'))">Copy</button>
  <button class="btn btn-s" onclick="closeModal()">Discard</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
}
function aiSummarizeThread(id){
  const mail=_getMailItems().find(m=>String(m.id)===String(id));
  if(!mail)return;
  const body=mail.body||'';
  if(body.length<50){toast('Email too short to summarize');return;}
  toast('✨ Summarizing thread...');
  // Extract key sentences
  const sentences=body.split(/[.!?\n]+/).map(s=>s.trim()).filter(s=>s.length>20);
  const keyPoints=sentences.slice(0,4);
  // Detect action items
  const actionWords=['please','could you','can you','need','require','action','todo','follow','send','review','confirm','schedule','update'];
  const actions=sentences.filter(s=>actionWords.some(w=>s.toLowerCase().includes(w))).slice(0,3);
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ Thread Summary</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">${esc(mail.subject)} · from ${esc(mail.from)}</div>
  <div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:5px">KEY POINTS</div>${keyPoints.map(p=>`<div style="font-size:12px;padding:4px 8px;background:var(--s2);border-radius:4px;margin-bottom:3px;display:flex;gap:6px"><span style="color:var(--ac)">•</span><span>${esc(p)}</span></div>`).join('')}</div>
  ${actions.length?`<div><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:5px">ACTION ITEMS</div>${actions.map(a=>`<div style="font-size:12px;padding:4px 8px;background:var(--acs);border-left:2px solid var(--ac);border-radius:4px;margin-bottom:3px">${esc(a)}</div>`).join('')}</div>`:''}
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="closeModal()">Got it</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiFollowUpReminder(id){
  const mail=_getMailItems().find(m=>String(m.id)===String(id));
  if(!mail)return;
  const followUpDate=new Date();followUpDate.setDate(followUpDate.getDate()+3);
  const dateStr=_ymd(followUpDate);
  D.tasks.push({id:Date.now(),title:`Follow up: ${mail.subject}`,priority:'Medium',due:dateStr,status:'Not Started',context:'Calls',project:'',tags:['follow-up','email'],notes:`Follow up with ${mail.from} (${mail.email}) re: ${mail.subject}`,myDay:false,energy:'low',subtasks:[],comments:[],createdBy:D.creds.userName||'Idris Grant'});
  save('tasks');
  toast(`⏰ Follow-up task created for ${dateStr}`);
}

function aiTriageMail(){
  toast('✨ Triaging inbox...');
  const actionWords=['please','action required','urgent','asap','deadline','confirm','approve','review by','respond','decision needed'];
  const newsletterWords=['unsubscribe','newsletter','weekly digest','monthly update','promotional','offer','deal','sale','discount'];
  const spamWords=['winner','congratulations','claim your','free gift','click here','limited time','act now','verify your account'];
  const triaged=_getMailItems().map(mail=>{
    const text=(mail.subject+' '+mail.body).toLowerCase();
    let category='FYI';
    if(spamWords.some(w=>text.includes(w)))category='Spam';
    else if(newsletterWords.some(w=>text.includes(w)))category='Newsletter';
    else if(actionWords.some(w=>text.includes(w)))category='Action Required';
    return{...mail,_triage:category};
  });
  const groups={['Action Required']:[],'FYI':[],'Newsletter':[],'Spam':[]};
  triaged.forEach(m=>groups[m._triage]?.push(m));
  const catColors={'Action Required':'var(--red)','FYI':'var(--ac)','Newsletter':'var(--purp)','Spam':'var(--t3)'};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ AI Inbox Triage</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Classified ${_getMailItems().length} emails:</div>
  ${Object.entries(groups).map(([cat,mails])=>`<div style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><span style="font-size:11px;font-weight:700;color:${catColors[cat]}">${cat}</span><span style="font-size:11px;color:var(--t3)">(${mails.length})</span></div>${mails.length?mails.map(ml=>`<div style="font-size:11px;padding:4px 8px;background:var(--s2);border-radius:4px;margin-bottom:2px;cursor:pointer" onclick="closeModal();openMailItem('${_jsAttr(ml.id)}')">${esc(ml.from)} · ${esc(ml.subject)}</div>`).join(''):'<div style="font-size:11px;color:var(--t3);padding:2px 8px">None</div>'}</div>`).join('')}
  <button class="btn btn-p" style="margin-top:8px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function _renderMailInboxPanel(){
  const unread=_getMailItems().filter(m=>!m.read).length;
  return `<div style="display:grid;grid-template-columns:280px 1fr;gap:0;border:1px solid var(--bd1);border-radius:8px;overflow:hidden;min-height:400px">
<div style="border-right:1px solid var(--bd1);overflow-y:auto">
<div style="padding:8px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:600">Inbox</span>${unread?`<span style="font-size:11px;color:var(--ac)">${unread} unread</span>`:''}<button class="btn btn-s" style="font-size:10px;height:20px;padding:0 6px" onclick="syncOAuthMail('microsoft')">Sync</button></div>
<div id="mail-inbox-list" style="padding:4px">${renderMailInboxList()}</div>
</div>
<div id="mail-detail" style="padding:16px;overflow-y:auto"><div style="text-align:center;padding:40px 0;color:var(--t3);font-size:12px">📧 Select an email to read</div></div>
</div>`;
}
function _renderMailSentPanel(){
  return `<div style="display:grid;grid-template-columns:280px 1fr;gap:0;border:1px solid var(--bd1);border-radius:8px;overflow:hidden;min-height:400px">
<div style="border-right:1px solid var(--bd1);overflow-y:auto">
<div style="padding:8px;border-bottom:1px solid var(--bd1);display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:600">Sent</span><button class="btn btn-s" style="font-size:10px;height:20px;padding:0 6px" onclick="syncSentMail()">Sync</button></div>
<div id="mail-inbox-list" style="padding:4px">${renderMailSentList()}</div>
</div>
<div id="mail-detail" style="padding:16px;overflow-y:auto"><div style="text-align:center;padding:40px 0;color:var(--t3);font-size:12px">📧 Select a message to view</div></div>
</div>`;
}
function renderMail(){
  _mailTab='inbox';
  $('mail-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('mail',22,'var(--page-accent)')}Mail, Calendar & Files</h1><p style="font-size:12px;color:var(--t2)">All communications in one place.</p></div><div style="display:flex;gap:6px;align-items:center"><input id="mail-search" type="search" placeholder="🔍 Search mail..." style="height:28px;padding:0 10px;font-size:11px;border:1px solid var(--bd2);border-radius:6px;background:var(--s2);color:var(--t1);width:180px" oninput="filterMail(this.value)"><button class="btn btn-s" style="font-size:11px;color:var(--ac)" onclick="aiTriageMail()">✨ Triage</button><button class="btn btn-p" style="font-size:11px" onclick="openComposeModal()">+ Compose</button></div></div>
<div class="tabs" id="mail-tabs"><div class="tab on" onclick="switchMailTab(this,'inbox')">Inbox</div><div class="tab" onclick="switchMailTab(this,'sent')">Sent</div><div class="tab" onclick="switchMailTab(this,'calendar')">Calendar</div><div class="tab" onclick="switchMailTab(this,'files')">Files</div></div>
<div id="mail-tab-body">${_renderMailInboxPanel()}</div>`;
  if(typeof _populateMailRail==='function')_populateMailRail();
}

let _mailSearchQuery='';
function filterMail(q){
  _mailSearchQuery=(q||'').toLowerCase().trim();
  const listEl=document.getElementById('mail-inbox-list');
  if(!listEl)return;
  if(_mailTab==='sent'){
    listEl.innerHTML=renderMailSentList(_mailSearchQuery);
  }else{
    listEl.innerHTML=renderMailInboxList(_mailSearchQuery);
  }
}
let _cmpAutosaveTimer=null;
let _smtpAccountsCache=null;
async function openComposeModal(opts={}){
  const m=document.getElementById('modal-content');
  m.className='modal compose-modal';
  // Fetch SMTP accounts from server (cached per session)
  if(!_smtpAccountsCache){
    try{_smtpAccountsCache=await _trpc('oauthSync.getAllSmtpAccounts',{},'query');}catch(e){_smtpAccountsCache=[];}
  }
  const smtpAccounts=_smtpAccountsCache||[];
  const msEmail=(D&&D.creds&&D.creds.msEmail)||'';
  const accountOptions=[
    `<option value="microsoft">Office 365${msEmail?' ('+msEmail+')':''}</option>`,
    ...smtpAccounts.map(a=>`<option value="smtp:${a.id}">${a.displayName||a.email} (SMTP)</option>`)
  ].join('');
  m.innerHTML=`
  <div class="cmp-hd">
    <span style="font-size:16px">✉</span>
    <h2>New Message</h2>
    <button class="btn btn-s" style="font-size:11px;padding:3px 8px" onclick="closeModal()">✕ Discard</button>
  </div>
  <div class="cmp-body-wrap">
    <div class="cmp-field"><label>From</label><select id="cmp-from" style="flex:1;font-size:11px;background:var(--s2);border:1px solid var(--bd2);border-radius:4px;padding:3px 6px;color:var(--t1)">${accountOptions}</select></div>
    <div class="cmp-field"><label>To</label><input id="cmp-to" placeholder="recipient@example.com" value="${esc(opts.to||'')}"></div>
    <div class="cmp-field" id="cmp-cc-row" style="display:none"><label>Cc</label><input id="cmp-cc" placeholder="cc@example.com"></div>
    <div class="cmp-field" id="cmp-bcc-row" style="display:none"><label>Bcc</label><input id="cmp-bcc" placeholder="bcc@example.com"></div>
    <div class="cmp-field">
      <label>Subject</label>
      <input id="cmp-sub" placeholder="Subject..." value="${esc(opts.subject||'')}">
      <button class="cmp-toggle" onclick="document.getElementById('cmp-cc-row').style.display=document.getElementById('cmp-cc-row').style.display==='none'?'flex':'none'">Cc</button>
      <button class="cmp-toggle" onclick="document.getElementById('cmp-bcc-row').style.display=document.getElementById('cmp-bcc-row').style.display==='none'?'flex':'none'">Bcc</button>
    </div>
    <div class="cmp-rte-wrap">${luRTE_render({id:'cmp-body', placeholder:'Write your message...', height:'260px', showCharCount:false, allowHtmlPaste:true})}</div>
  </div>
  <div id="cmp-followup-chips" style="display:none;padding:8px 14px 0;gap:6px;flex-wrap:wrap"></div>
  <div class="cmp-ft">
    <button class="btn btn-p" onclick="sendComposedMail()">✉ Send</button>
    <button class="btn btn-s" onclick="saveCmpDraft()">Save Draft</button>
    <button class="btn btn-s" id="cmp-suggest-btn" onclick="suggestFollowUps()" style="font-size:11px">✨ Suggest Follow-ups</button>
    <div style="flex:1"></div>
    <span style="font-size:11px;color:var(--t3)" id="cmp-status"></span>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
  if(opts.body){setTimeout(()=>luRTE_setValue('cmp-body',opts.body),80);}
  setTimeout(()=>document.getElementById('cmp-to')?.focus(),100);
  // Autosave every 30 seconds
  if(_cmpAutosaveTimer)clearInterval(_cmpAutosaveTimer);
  _cmpAutosaveTimer=setInterval(()=>{
    const s=document.getElementById('cmp-status');
    if(!s)return clearInterval(_cmpAutosaveTimer);
    saveCmpDraft();
  },30000);
}
async function suggestFollowUps(){
  const btn=document.getElementById('cmp-suggest-btn');
  const chipsEl=document.getElementById('cmp-followup-chips');
  if(!btn||!chipsEl)return;
  const sub=document.getElementById('cmp-sub')?.value||'';
  const body=luRTE_getValue('cmp-body');
  // Strip HTML tags for LLM input
  const bodyText=body.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  btn.disabled=true;
  btn.textContent='⏳ Thinking...';
  chipsEl.style.display='none';
  chipsEl.innerHTML='';
  try{
    const {provider:_p}=_getAIConfig();
    const res=await _trpc('oauthSync.suggestFollowUps',{subject:sub,body:bodyText,provider:_p},'mutation');
    const suggestions=res?.suggestions||[];
    if(!suggestions.length){toast('No suggestions returned');return;}
    chipsEl.style.display='flex';
    chipsEl.innerHTML=suggestions.map((s,i)=>`<div class="chip" style="cursor:pointer;background:var(--s3);border:1px solid var(--bd);border-radius:12px;padding:4px 10px;font-size:11px;max-width:100%;white-space:normal;line-height:1.4" onclick="_insertFollowUp(${i})" title="Click to insert">${esc(s)}</div>`).join('');
    // Store suggestions for insertion
    window._followUpSuggestions=suggestions;
  }catch(e){
    toast('Failed to get suggestions: '+(e?.message||'unknown error'));
  }finally{
    btn.disabled=false;
    btn.textContent='✨ Suggest Follow-ups';
  }
}
function _insertFollowUp(idx){
  const suggestions=window._followUpSuggestions||[];
  const text=suggestions[idx];
  if(!text)return;
  const existing=luRTE_getValue('cmp-body');
  const divider=existing?'<br><br>':''
  luRTE_setValue('cmp-body',existing+divider+esc(text).replace(/\n/g,'<br>'));
  // Hide chips after inserting
  const chipsEl=document.getElementById('cmp-followup-chips');
  if(chipsEl)chipsEl.style.display='none';
  toast('Follow-up inserted');
}
function saveCmpDraft(){
  const to=document.getElementById('cmp-to')?.value.trim();
  const sub=document.getElementById('cmp-sub')?.value||'(no subject)';
  const body=luRTE_getValue('cmp-body');
  if(!D.mail)D.mail={inbox:[],sent:[],drafts:[]};
  if(!D.mail.drafts)D.mail.drafts=[];
  D.mail.drafts.unshift({id:Date.now(),to,subject:sub,body,date:new Date().toISOString()});
  save('mail');
  document.getElementById('cmp-status').textContent='Draft saved';
  setTimeout(()=>{const s=document.getElementById('cmp-status');if(s)s.textContent='';},2000);
}
async function sendComposedMail(){
  const to=document.getElementById('cmp-to')?.value.trim();
  if(!to){toast('⚠ Recipient required');return;}
  const sub=document.getElementById('cmp-sub')?.value||'(no subject)';
  const cc=document.getElementById('cmp-cc')?.value.trim()||'';
  const bcc=document.getElementById('cmp-bcc')?.value.trim()||'';
  const body=luRTE_getValue('cmp-body');// send HTML
  const fromVal=document.getElementById('cmp-from')?.value||'microsoft';
  const sendBtn=document.querySelector('#modal-capture .btn-p');
  if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='Sending…';}
  try{
    // Determine via: microsoft or smtp with account index
    let payload={to,subject:sub,body,cc:cc||undefined,bcc:bcc||undefined};
    if(fromVal.startsWith('smtp:')){
      const accountId=parseInt(fromVal.split(':')[1],10);
      if(!accountId){toast('⚠ SMTP account not found');if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='✉ Send';}return;}
      payload.via='smtp';
      payload.smtpAccountId=accountId;
    } else {
      payload.via='microsoft';
    }
    await _trpc('oauthSync.sendComposedMail',payload,'mutation');
    if(_cmpAutosaveTimer){clearInterval(_cmpAutosaveTimer);_cmpAutosaveTimer=null;}
    closeModal();
    toast('✅ Message sent to '+to);
    if(!D.mail)D.mail={inbox:[],sent:[],drafts:[]};
    if(!D.mail.sent)D.mail.sent=[];
    D.mail.sent.unshift({id:Date.now(),to,subject:sub,body,date:new Date().toISOString(),read:true,via:fromVal});
    save('mail');
  }catch(e){
    const msg=(e&&e.message)||'Failed to send email';
    toast('❌ '+msg);
    if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='✉ Send';}
  }
}
function switchMailTab(el,tab){
  document.querySelectorAll('#mail-tabs .tab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  _mailTab=tab;
  _selectedMail=null;
  const body=document.getElementById('mail-tab-body');
  if(!body)return;
  if(tab==='inbox'){
    body.innerHTML=_renderMailInboxPanel();
  } else if(tab==='sent'){
    body.innerHTML=_renderMailSentPanel();
  } else if(tab==='calendar'){
    const today=new Date();
    const dayOfWeek=today.getDay();
    const monday=_pd(today);monday.setDate(today.getDate()-(dayOfWeek===0?6:dayOfWeek-1));
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const weekDays=days.map((d,i)=>{const dt=_pd(monday);dt.setDate(monday.getDate()+i);return`${d} ${dt.getDate()}`});
    const weekDateStrs=days.map((_,i)=>{const dt=_pd(monday);dt.setDate(monday.getDate()+i);return _ymd(dt);});
    const gridRows=[8,9,10,11,12,13,14,15,16,17].map(h=>`<div style="font-size:11px;color:var(--t3);text-align:right;padding-right:6px;padding-top:2px">${h>12?h-12:h} ${h>=12?'PM':'AM'}</div>${Array(7).fill(0).map((_,d)=>{const evs=[..._calLocalEventsOn(_pd(weekDateStrs[d])).filter(e=>Number(e.hour)===h&&!_calIsAllDay(e)),..._cellEventsForDate(weekDateStrs[d],h)];return`<div style="border-left:1px solid var(--bd1);border-top:1px solid var(--bd1);min-height:32px;padding:2px">${evs.map(e=>`<div style="font-size:11px;background:${e.color}22;border-left:2px solid ${e.color};padding:2px 4px;border-radius:2px;cursor:pointer;margin-bottom:1px" onclick="openCalEvent('${_jsAttr(String(e.id))}')">${esc(e.title)}</div>`).join('')}</div>`}).join('')}`).join('');
    body.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:12px;font-weight:600">📅 This Week</span><button class="btn btn-p" style="height:26px;font-size:11px" onclick="openNewCalEventModal()">＋ Event</button></div><div style="overflow-x:auto"><div style="display:grid;grid-template-columns:40px repeat(7,1fr);min-width:500px;font-size:11px"><div></div>${weekDays.map((d,i)=>`<div style="text-align:center;padding:4px;font-weight:${i===dayOfWeek-1?700:400};color:${i===dayOfWeek-1?'var(--ac)':'var(--t2)'}">${d}</div>`).join('')}${gridRows}</div></div>`;
  } else {
    body.innerHTML=`<div style="padding:40px;text-align:center;color:var(--t3)"><div style="font-size:32px;margin-bottom:8px">📁</div><div style="font-size:12px">Files integration coming soon</div></div>`;
  }
}
const _calEventsDefault=[
  {id:1,title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:0,hour:9,endHour:10,color:'var(--ac)',desc:'Team sync — share blockers and wins',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
  {id:2,title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:1,hour:9,endHour:10,color:'var(--ac)',desc:'Team sync',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
  {id:3,title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:2,hour:9,endHour:10,color:'var(--ac)',desc:'Team sync',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
  {id:4,title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:3,hour:9,endHour:10,color:'var(--ac)',desc:'Team sync',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
  {id:5,title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:4,hour:9,endHour:10,color:'var(--ac)',desc:'Team sync',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
  {id:6,title:'Deep Focus',time:'10:00 AM',end:'12:00 PM',day:0,hour:10,endHour:12,color:'var(--ok)',desc:'Uninterrupted deep work — no Slack, no meetings',attendees:['Idris Grant'],location:'Office'},
  {id:7,title:'Deep Focus',time:'10:00 AM',end:'12:00 PM',day:3,hour:10,endHour:12,color:'var(--ok)',desc:'Uninterrupted deep work',attendees:['Idris Grant'],location:'Office'},
  {id:8,title:'Budget Review',time:'11:00 AM',end:'12:00 PM',day:0,hour:11,endHour:12,color:'var(--warn)',desc:'Q2 budget review with finance team. Review projections and approve headcount.',attendees:['Idris Grant','Priya Nair'],location:'Conf Room B'},
  {id:9,title:'Client Call',time:'1:00 PM',end:'2:00 PM',day:0,hour:13,endHour:14,color:'var(--red)',desc:'Acme Inc. onboarding call. Discuss implementation timeline and success metrics.',attendees:['Idris Grant','Marcus Webb'],location:'Zoom'},
  {id:10,title:'Client Call',time:'1:00 PM',end:'2:00 PM',day:3,hour:13,endHour:14,color:'var(--red)',desc:'Follow-up with Apex Corp.',attendees:['Idris Grant'],location:'Zoom'},
  {id:11,title:'Deep Focus',time:'2:00 PM',end:'4:00 PM',day:1,hour:14,endHour:16,color:'var(--ok)',desc:'Feature development sprint',attendees:['Idris Grant'],location:'Remote'},
  {id:12,title:'Deep Focus',time:'2:00 PM',end:'4:00 PM',day:4,hour:14,endHour:16,color:'var(--ok)',desc:'Feature development sprint',attendees:['Idris Grant'],location:'Remote'},
  {id:13,title:'Product Review',time:'3:00 PM',end:'4:00 PM',day:2,hour:15,endHour:16,color:'var(--purp)',desc:'Weekly product review — demo new features, review backlog, plan next sprint.',attendees:['Idris Grant','Priya Nair','Marcus Webb'],location:'Teams'},
];
// Calendar grid store (_calEvents). Server-synced as `calGrid` since 2026-10-15
// (migration 0053): it used to live ONLY in this browser's localStorage - no
// backup, no PC/phone sync, and the coach could not see it. The local copy is
// now lu_calGrid; an old lu_calEvents copy is moved over once. Untouched
// built-in sample events (_calEventsDefault) are never kept or uploaded; a
// signed-in device with nothing cached starts EMPTY and the server fills it.
var _LU_CAL_SEED_SIG=new Set(_calEventsDefault.map(function(e){return JSON.stringify(e);}));
function _luCalStripSeeds(a){return (Array.isArray(a)?a:[]).filter(function(e){return e&&!_LU_CAL_SEED_SIG.has(JSON.stringify(e));});}
var _calEvents=(function(){
  var a=null;try{a=JSON.parse(localStorage.getItem('lu_calGrid')||'null');}catch(_){}
  if(!Array.isArray(a)){
    try{a=JSON.parse(localStorage.getItem('lu_calEvents')||'null');}catch(_){}
    if(Array.isArray(a)){a=_luCalStripSeeds(a);try{localStorage.setItem('lu_calGrid',JSON.stringify(a));localStorage.removeItem('lu_calEvents');}catch(_){}}
  }
  if(Array.isArray(a))return _luCalStripSeeds(a);
  return localStorage.getItem('lu_session')?[]:_calEventsDefault;
})();
// D.calGrid is a live view of _calEvents, so the generic save/sync/merge code
// (save('calGrid'), loadServerData) works on it unchanged. Not enumerable, so
// nothing that walks D sees the calendar twice.
try{Object.defineProperty(D,'calGrid',{configurable:true,enumerable:false,get:function(){return _calEvents;},set:function(v){_calEvents=Array.isArray(v)?v:[];}});}catch(_){}
// Every calendar write goes through here (before part2 loads, save() is the
// localStorage-only writer; after, it also pushes to the server).
function _calPersist(){try{if(typeof save==='function')save('calGrid');else localStorage.setItem('lu_calGrid',JSON.stringify(_calEvents));}catch(_){}}
// Until -214 the Quick event dialog and the Outlook/Google calendar sync saved to
// the misspelt key lu_cal_events, so their events vanished on reload. Fold any
// events stranded there back in (by id), once, then drop the stray key.
(function(){try{var stray=JSON.parse(localStorage.getItem('lu_cal_events')||'null');if(!Array.isArray(stray)){return;}var seen={};_calEvents.forEach(function(e){if(e)seen[String(e.id)]=1;});var add=stray.filter(function(e){return e&&!seen[String(e.id)];});if(add.length){_calEvents=_calEvents.concat(add);_calPersist();}localStorage.removeItem('lu_cal_events');}catch(_){}})();
// Mail/Calendar rails read event data from _calEvents — the same store the calendar
// grid renders — so a visibly-full calendar no longer shows "no events" in the rail.
function _calEventTimeLabel(e){
  if(e&&e.time)return e.time;
  if(e&&typeof e.hour==='number'){const h=e.hour;return (h%12||12)+(h<12?' AM':' PM');}
  return '';
}
// Synced calendar events from D.calEvents (OAuth-populated) that fall on a
// given date, normalized to a shape compatible with _calEvents items so the
// existing render code (cells, rails) works unchanged.
function _syncedEventsOn(dateObj){
  const ds=_ymd(dateObj);
  return ((typeof D!=='undefined'&&D&&D.calEvents)||[]).filter((e)=>e&&e.start&&String(e.start).slice(0,10)===ds).map((e)=>{
    const s=String(e.start);
    const hour=parseInt(s.slice(11,13))||0;
    const eh=e.end?parseInt(String(e.end).slice(11,13))||(hour+1):(hour+1);
    return {
      id:e.id,title:e.title||e.subject||'(untitled)',
      hour,endHour:eh,time:s.slice(11,16),
      dateStr:ds,day:(dateObj.getDay()+6)%7,
      color:e.color||'var(--purp)',
      location:e.location||'',
      desc:e.description||e.bodyPreview||e.desc||'',
      attendees:(e.attendees||[]).map((a)=>a&&typeof a==='object'?((a.emailAddress&&(a.emailAddress.name||a.emailAddress.address))||a.name||a.email||''):a).filter(Boolean),
      start:e.start,end:e.end||'',
      _synced:true,
    };
  });
}
// Synced events for a specific (dateStr, hour) cell. Used by the calendar grid
// renderers to union OAuth-synced events into the cell's local-events list.
function _cellEventsForDate(dateStr,hour){
  return ((typeof D!=='undefined'&&D&&D.calEvents)||[]).filter((e)=>{
    if(!e||!e.start)return false;
    const s=String(e.start);
    if(s.slice(0,10)!==dateStr)return false;
    return (parseInt(s.slice(11,13))||0)===hour;
  }).map((e)=>{
    const s=String(e.start);
    const h=parseInt(s.slice(11,13))||0;
    const eh=e.end?parseInt(String(e.end).slice(11,13))||(h+1):(h+1);
    return {id:e.id,title:e.title||e.subject||'(untitled)',hour:h,endHour:eh,color:e.color||'var(--purp)',dateStr,_synced:true};
  });
}
// ── Scheduled tasks on the calendar ────────────────────────────────────────
// A task is SCHEDULED when it has both a date and a start time. The date is
// startDate (when the work happens), falling back to due — a task carrying a
// time but no start date is almost always meant to be done on its due date.
//
// These are DERIVED at render time and never written into _calEvents. That is
// the whole point: rescheduling or completing a task updates the calendar with
// no sync step and no second copy to keep consistent.
function _taskSchedule(t){
  if(!t||(typeof _isSubtaskRow==='function'&&_isSubtaskRow(t)))return null;
  const time=String(t.startTime||'').trim();
  if(!/^\d{1,2}:\d{2}$/.test(time))return null;              // needs a real time
  const date=String(t.startDate||t.due||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;          // and a real date
  const hour=parseInt(time.slice(0,2),10)||0;
  let endHour=hour+1;
  const et=String(t.endTime||'').trim();
  if(/^\d{1,2}:\d{2}$/.test(et)){
    const eh=parseInt(et.slice(0,2),10)||0,em=parseInt(et.slice(3,5),10)||0;
    endHour=Math.max(hour+1,em>0?eh+1:eh);                   // round a :30 end up
  }else if(Number(t.estimatedMins)>0){
    endHour=hour+Math.max(1,Math.ceil(Number(t.estimatedMins)/60));
  }
  return {dateStr:date,hour,endHour,time};
}
// Priority-coded so the calendar reads at a glance; Done goes muted, not hidden
// — seeing what you actually did at 2pm is the useful half of a calendar.
function _taskCalColor(t){
  if(String(t.status||'')==='Done')return 'var(--t3)';
  const p=String(t.priority||'');
  return p==='High'?'var(--red)':p==='Low'?'var(--ok)':'var(--warn)';
}
// Tasks time-blocked through openTimeBlockPicker already push a REAL _calEvents
// entry carrying linkedTaskId. Without this they would render twice — once as
// the block, once as the derived task.
function _blockedTaskIds(){
  const s=new Set();
  (_calEvents||[]).forEach(e=>{if(e&&e.linkedTaskId!=null)s.add(String(e.linkedTaskId));});
  return s;
}
function _scheduledTaskEvents(){
  if(D&&D.prefs&&D.prefs.calShowTasks===false)return [];
  const blocked=_blockedTaskIds();
  const out=[];
  ((typeof _taskPool==='function'?_taskPool():D.tasks)||[]).forEach(t=>{
    if(!t||blocked.has(String(t.id)))return;
    const s=_taskSchedule(t);
    if(!s)return;
    const done=String(t.status||'')==='Done';
    out.push({
      id:t.id,_taskId:t.id,_task:true,_done:done,
      title:(done?'✓ ':'')+String(t.title||'(untitled task)'),
      hour:s.hour,endHour:s.endHour,time:s.time,dateStr:s.dateStr,
      color:_taskCalColor(t),
    });
  });
  return out;
}
function _cellTasksForDate(dateStr,hour){
  return [..._scheduledTaskEvents().filter(e=>e.dateStr===dateStr),..._taskGhostsOn(dateStr)].filter(e=>e.hour===hour);
}
function _tasksOnDate(dateObj){
  const ds=_ymd(dateObj);
  return [..._scheduledTaskEvents().filter(e=>e.dateStr===ds),..._taskGhostsOn(ds)];
}
// One click handler for every calendar chip. Task chips must open the TASK
// drawer, not openCalEvent — their id is a task id and would not resolve.
function _calOpenChip(kind,id){
  if(kind==='task'){
    const t=((typeof _taskPool==='function'?_taskPool():D.tasks)||[]).find(x=>String(x.id)===String(id));
    if(t&&typeof openDrawer==='function')return openDrawer('task',t);
    if(typeof nav==='function')nav('tasks');
    return;
  }
  if(typeof openCalEvent==='function')openCalEvent(id);
}
function _calChipClick(e){
  if(e&&e._finBill)return `nav('money');setTimeout(()=>{if(typeof renderMoney==='function'){_finTab='bills';renderMoney();}},250)`;
  return `_calOpenChip('${e&&e._task?'task':'event'}','${_jsAttr(String(e&&e.id!=null?e.id:''))}')`;
}
// Shared chip markup for the week + month grids.
//
// NB the existing event chips build their tint as `${e.color}22` — string
// concatenation onto a colour. That only works for hex; for a `var(--x)` colour
// it produces `var(--x)22`, which is invalid and silently yields no background.
// Task colours are all vars, so they use color-mix instead of inheriting that bug.
function _calChip(e,opts){
  const o=opts||{};
  const task=!!(e&&e._task);
  const bill=!!(e&&e._finBill);
  // Bills use var() colours like tasks, so they take the color-mix path
  // (the `${e.color}22` concat only works for hex — see note above).
  const bg=(task||bill)?`color-mix(in srgb,${e.color} 15%,transparent)`:`${e.color}22`;
  const edge=task?`2px dashed ${e.color}`:`2px solid ${e.color}`;
  const ghost=!!(e&&e._ghost);
  const done=task&&e._done?';opacity:.55;text-decoration:line-through':ghost?';opacity:.5':'';
  const series=e&&e._seriesId!=null;
  const tip=bill?'Bill due — click to open Money → Bills':ghost?`Repeats here${e.time?' · '+e.time:''} — click to open the task`:task?`${e._done?'Completed task':'Task'}${e.time?' · '+e.time:''} — click to open`:series?_calRuleText({rrule:e._rrule,dateStr:String(e.id).split('~')[1]||e.dateStr}):'';
  // Draggable (-238): grid events you may move, and your own scheduled tasks.
  const ownTask=task&&!ghost&&(D.tasks||[]).some(x=>String(x.id)===String(e.id));
  const drag=bill||ghost?'':ownTask?` data-drag="caltask" data-drag-id="${esc(String(e.id))}"`:(!task&&typeof _calCanMove==='function'&&_calCanMove(e)&&!e._synced?` data-drag="calev" data-drag-id="${esc(String(e.id))}"`:'');
  return `<div class="${o.cls||'cal-ev'}${task?' cal-task':''}"${drag}${tip?` title="${esc(tip)}"`:''} style="background:${bg};border-left:${edge};color:var(--t1);cursor:pointer${done}${o.extra||''}" onclick="event.stopPropagation();${_calChipClick(e)}">${ghost||series?'🔁 ':task&&!e._done?'▢ ':''}${esc(e.title)}</div>`;
}
// Show/hide scheduled tasks. Default ON — the user asked for them — so only an
// explicit false opts out.
function toggleCalShowTasks(){
  D.prefs=D.prefs||{};
  D.prefs.calShowTasks=D.prefs.calShowTasks===false;
  save('prefs');
  if(typeof renderCal==='function')renderCal();
  toast(D.prefs.calShowTasks===false?'Scheduled tasks hidden':'📋 Scheduled tasks shown');
}
// Real calendar events (your own, coach/time blocks, synced Outlook/Google) on
// a day, without the task and bill chips the grid also shows. Each comes back
// with start/end as local 'YYYY-MM-DDTHH:MM:00' strings. Home, My Day, the
// task rail and the coach used to read D.calEvents, which nothing writes, so
// they always showed no meetings.
function _calMeetingsOn(day){
  const d=day instanceof Date?_pd(day):new Date(String(day)+'T00:00');
  if(isNaN(d))return [];
  d.setHours(0,0,0,0);
  const ymd=_ymd(d);
  const hm=(h,m)=>String(Math.max(0,Math.min(23,Number(h)||0))).padStart(2,'0')+':'+String(Number(m)||0).padStart(2,'0');
  return _calEventsOn(d).filter(e=>e&&!e._task&&!e._finBill).map(e=>{
    const iso=typeof e.start==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(e.start);
    const start=iso?e.start:ymd+'T'+hm(e.hour,e.minute)+':00';
    const end=typeof e.end==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(e.end)?e.end:(e.endHour!=null?ymd+'T'+hm(e.endHour,0)+':00':start);
    return Object.assign({},e,{start,end});
  }).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
}
// Open the Calendar in Day view on a given local date (YYYY-MM-DD).
function _openCalDay(ymd){
  const d=new Date(String(ymd)+'T00:00');
  const t=new Date();t.setHours(0,0,0,0);
  if(!isNaN(d)){_calView='day';_calDayOffset=Math.round((d-t)/86400000);}
  nav('calendar');
  setTimeout(()=>{try{renderCal();}catch(_){}},60);
}
// Does a grid event (_calEvents row) fall on this local date? Dated rows
// match their dateStr. Undated rows carry a weekday (day, 0=Mon): those with
// repeat 'weekly' (the -226 "+ Event" weekly repeat) recur every week; older
// undated one-offs belong to the week they were made in, which is how the
// grid always showed them. Week, Day and Month views and _calEventsOn all
// use this one rule (they each had a different one).
function _calLocalOn(e,dt){
  if(!e)return false;
  if(e.dateStr)return e.dateStr===_ymd(dt);
  if(e.day!==(dt.getDay()+6)%7)return false;
  if(/^weekly$/i.test(String(e.repeat||'')))return true;
  const t=new Date();t.setHours(0,0,0,0);
  const mon=_pd(t);mon.setDate(t.getDate()-((t.getDay()+6)%7));
  const d0=_pd(dt);d0.setHours(0,0,0,0);
  return d0>=mon&&d0-mon<7*86400000;
}
const _calIsAllDay=e=>!!(e&&(e.isAllDay||e.allDay));
// ── Repeating events (build -236) ───────────────────────────────────────────
// A repeating event is ONE row. dateStr is its first occurrence, rrule says
// how it repeats, exdates are occurrences deleted on their own, overrides are
// occurrences changed on their own — keyed by the date the rule gives them;
// an override carrying its own dateStr has been moved to that day:
//   rrule     {freq:'daily'|'weekly'|'monthly'|'yearly', interval:1,
//              byDay:[0-6, 0=Sun] (weekly only), until:'YYYY-MM-DD', count:N}
//   exdates   ['YYYY-MM-DD']
//   overrides {'YYYY-MM-DD':{title,start,end,hour,endHour,location,desc,isAllDay,dateStr}}
// An occurrence's id is '<row id>~<YYYY-MM-DD rule date>', so one occurrence
// can be opened, edited, moved, deleted and linked to a meeting note.
// Monthly/yearly on the 29th-31st fall on the month's last day when the month
// is shorter (as Outlook and recurring tasks do). Before -236 "daily" made 14
// copies and "monthly" 6, and the edit dialog's Repeat only labelled the
// event; _calMigrateRecurrence folds those into one row.
// server/_core/calRecur.ts applies the same rules for the coach — change both.
const _CAL_FREQS=['daily','weekly','monthly','yearly'];
// Day numbers (days since 1970-01-01 as a calendar date) keep the arithmetic
// free of time zones and DST.
function _calDn(ymd){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd||''));return m?Date.UTC(+m[1],+m[2]-1,+m[3])/86400000:NaN;}
function _calYmdOf(dn){const d=new Date(dn*86400000);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
// The row's rule, cleaned; null when it does not repeat.
function _calRule(e){
  const r=e&&e.rrule;
  if(!r||_CAL_FREQS.indexOf(r.freq)<0||!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dateStr||'')))return null;
  const n=parseInt(r.interval,10);
  const days=Array.isArray(r.byDay)?r.byDay.map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6):[];
  return {freq:r.freq,interval:n>0?Math.min(n,99):1,byDay:Array.from(new Set(days)).sort((a,b)=>a-b),
    until:/^\d{4}-\d{2}-\d{2}$/.test(String(r.until||''))?String(r.until):'',count:Math.min(Math.max(parseInt(r.count,10)||0,0),999)};
}
// Does the rule (start day number s) land on day number dn? until/count aside.
function _calRuleHits(r,s,dn){
  if(!(dn>=s))return false;
  if(r.freq==='daily')return (dn-s)%r.interval===0;
  const sd=new Date(s*86400000),d=new Date(dn*86400000);
  if(r.freq==='weekly'){
    const days=r.byDay.length?r.byDay:[sd.getUTCDay()];
    if(days.indexOf(d.getUTCDay())<0)return false;
    return (((dn-d.getUTCDay())-(s-sd.getUTCDay()))/7)%r.interval===0;
  }
  const months=(d.getUTCFullYear()-sd.getUTCFullYear())*12+d.getUTCMonth()-sd.getUTCMonth();
  if(r.freq==='monthly'){if(months%r.interval)return false;}
  else if(d.getUTCMonth()!==sd.getUTCMonth()||(months/12)%r.interval)return false;
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  return d.getUTCDate()===Math.min(sd.getUTCDate(),last);
}
// Last day number the series may use (until, or the count-th occurrence).
const _calLastMemo=new Map();
function _calRuleLast(r,s){
  let last=r.until?_calDn(r.until):Infinity;
  if(r.count){
    const k=[r.freq,r.interval,r.byDay.join(','),s,r.count].join('|');
    let c=_calLastMemo.get(k);
    if(c===undefined){
      c=Infinity;
      if(r.freq==='daily')c=s+(r.count-1)*r.interval;
      else{let n=0;for(let dn=s;dn<s+40000;dn++){if(_calRuleHits(r,s,dn)&&++n>=r.count){c=dn;break;}}}
      _calLastMemo.set(k,c);
    }
    last=Math.min(last,c);
  }
  return last;
}
// Is ymd one of the series' rule dates (exdates and overrides aside)?
function _calNaturalOn(e,ymd){
  const r=_calRule(e);if(!r)return false;
  const s=_calDn(e.dateStr),dn=_calDn(ymd);
  return dn<=_calRuleLast(r,s)&&_calRuleHits(r,s,dn);
}
// How many rule dates fall before ymd (for splitting a counted series).
function _calCountBefore(e,ymd){
  const r=_calRule(e);if(!r)return 0;
  const s=_calDn(e.dateStr),end=Math.min(_calDn(ymd),_calRuleLast(r,s)+1);
  let n=0;for(let dn=s;dn<end;dn++)if(_calRuleHits(r,s,dn))n++;
  return n;
}
function _calOccurrence(e,key,ov){
  const o=Object.assign({},e,ov||{});
  delete o.rrule;delete o.exdates;delete o.overrides;
  o.id=e.id+'~'+key;o._seriesId=e.id;o._occ=key;o._rrule=e.rrule;
  o.dateStr=(ov&&ov.dateStr)||key;
  return o;
}
// A series' occurrences on a local date: its own rule date (unless deleted
// or moved away) plus any occurrence moved onto this day.
function _calSeriesOn(e,dt){
  const ymd=_ymd(dt),out=[];
  const ov=e.overrides&&typeof e.overrides==='object'?e.overrides:{};
  const ex=Array.isArray(e.exdates)?e.exdates:[];
  if(ex.indexOf(ymd)<0&&_calNaturalOn(e,ymd)){const o=ov[ymd];if(!(o&&o.dateStr&&o.dateStr!==ymd))out.push(_calOccurrence(e,ymd,o));}
  Object.keys(ov).forEach(k=>{const o=ov[k];if(k!==ymd&&o&&o.dateStr===ymd&&ex.indexOf(k)<0&&_calNaturalOn(e,k))out.push(_calOccurrence(e,k,o));});
  return out;
}
// Every grid event on a local date, repeating ones expanded. All readers of
// "events on a day" go through this (directly or via _calEventsOn).
function _calLocalEventsOn(dt){
  const out=[];
  (_calEvents||[]).forEach(e=>{
    if(!e||e._pendingDelete)return;
    if(_calRule(e))out.push(..._calSeriesOn(e,dt));
    else if(_calLocalOn(e,dt))out.push(e);
  });
  return out;
}
// Grid events between two local dates (inclusive), each with its date.
function _calLocalBetween(fromYmd,toYmd){
  const out=[],a=_calDn(fromYmd),b=_calDn(toYmd);
  for(let dn=a;dn<=b&&dn-a<400;dn++){const ymd=_calYmdOf(dn);_calLocalEventsOn(_pd(ymd)).forEach(e=>out.push(Object.assign({},e,{dateStr:e.dateStr||ymd})));}
  return out;
}
// id → {row, occ (rule date or null), ev (what to show/edit)}.
function _calResolve(id){
  const k=String(id),i=k.indexOf('~');
  if(i>0){
    const row=(_calEvents||[]).find(e=>e&&String(e.id)===k.slice(0,i));
    if(!row)return null;
    const key=k.slice(i+1);
    return {row,occ:_calRule(row)?key:null,ev:_calRule(row)?_calOccurrence(row,key,(row.overrides||{})[key]):row};
  }
  const row=(_calEvents||[]).find(e=>e&&String(e.id)===k);
  return row?{row,occ:null,ev:row}:null;
}
const _CAL_DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function _calRuleText(e){
  const r=_calRule(e);if(!r)return '';
  const unit={daily:'day',weekly:'week',monthly:'month',yearly:'year'}[r.freq];
  let t=r.interval>1?`Every ${r.interval} ${unit}s`:{daily:'Daily',weekly:'Weekly',monthly:'Monthly',yearly:'Yearly'}[r.freq];
  if(r.freq==='weekly'){
    const days=r.byDay.length?r.byDay:[new Date(_calDn(e.dateStr)*86400000).getUTCDay()];
    t=(r.interval===1&&days.join()==='1,2,3,4,5')?'Every weekday':t+' on '+days.map(d=>_CAL_DOW[d]).join(', ');
  }
  if(r.until)t+=' · until '+fmtDate(r.until);
  else if(r.count)t+=` · ${r.count} times`;
  return t;
}
// Old shapes → one row. (1) "+ Event" daily / every-2-weeks / monthly made
// dated copies sharing a recurId: the first becomes the series (count = the
// copies made), a missing copy becomes an exdate, a moved or edited copy an
// override. (2) A "Repeat" chosen in the old edit dialog was only a label on
// a one-off; it now repeats as it said. Undated weekly rows keep their old
// meaning (every week on that weekday). Idempotent; returns rows changed.
function _calMigrateRecurrence(){
  if(!Array.isArray(_calEvents))return 0;
  let changed=0;
  const groups={};
  _calEvents.forEach(e=>{if(e&&e.recurId!=null&&!e.rrule&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.dateStr||''))&&/^(daily|biweekly|monthly)$/.test(String(e.repeat||'')))(groups[e.recurId]=groups[e.recurId]||[]).push(e);});
  Object.keys(groups).forEach(k=>{
    const g=groups[k];
    const base=g.find(e=>!e._recurIndex)||g.slice().sort((a,b)=>(a._recurIndex||0)-(b._recurIndex||0))[0];
    const rep=base.repeat,s=_calDn(base.dateStr);
    const sd=new Date(s*86400000);
    const total=rep==='daily'?14:rep==='biweekly'?7:6;
    const rule=rep==='monthly'?{freq:'monthly',interval:1,count:total}:rep==='daily'?{freq:'daily',interval:1,count:total}:{freq:'weekly',interval:2,byDay:[sd.getUTCDay()],count:total};
    const natural=i=>rep==='monthly'?(()=>{const y=sd.getUTCFullYear(),m=sd.getUTCMonth()+i;const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return _calYmdOf(Date.UTC(y,m,Math.min(sd.getUTCDate(),last))/86400000);})():_calYmdOf(s+i*(rep==='daily'?1:14));
    const exdates=[],overrides={};
    const F=['title','hour','endHour','start','end','time','location','desc','color','isAllDay'];
    for(let i=0;i<total;i++){
      const copy=i===0?base:g.find(e=>e!==base&&Number(e._recurIndex)===i);
      const key=natural(i);
      if(!copy){exdates.push(key);continue;}
      const ov={};
      F.forEach(f=>{if(copy[f]!==undefined&&JSON.stringify(copy[f])!==JSON.stringify(base[f]))ov[f]=copy[f];});
      if(copy.dateStr!==key)ov.dateStr=copy.dateStr;
      if(Object.keys(ov).length)overrides[key]=ov;
    }
    base.dateStr=natural(0);
    base.rrule=rule;
    if(exdates.length)base.exdates=exdates;
    if(Object.keys(overrides).length)base.overrides=overrides;
    delete base.repeat;delete base.recurId;delete base._recurIndex;
    for(let i=_calEvents.length-1;i>=0;i--){const e=_calEvents[i];if(e!==base&&g.indexOf(e)>=0)_calEvents.splice(i,1);}
    changed++;
  });
  _calEvents.forEach(e=>{
    if(!e||e.rrule||e.source||e.recurId!=null||!/^\d{4}-\d{2}-\d{2}$/.test(String(e.dateStr||'')))return;
    const rec=String(e.recurrence||'');
    if(!/^(daily|weekly|biweekly|monthly|yearly)$/.test(rec))return;
    const wd=new Date(_calDn(e.dateStr)*86400000).getUTCDay();
    e.rrule=rec==='biweekly'?{freq:'weekly',interval:2,byDay:[wd]}:rec==='weekly'?{freq:'weekly',interval:1,byDay:[wd]}:{freq:rec,interval:1};
    delete e.recurrence;
    changed++;
  });
  return changed;
}
// ── Editing a repeating event ──
// What an edit / delete changes, kept apart from the dialogs so it is testable.
// scope: 'one' (this occurrence), 'following' (this and later), 'all'.
// fields = the edited event fields; fields.dateStr = the date shown in the
// dialog (the occurrence's date). rule = the Repeat setting (null = none).
// Returns a new row when 'following' splits the series, else null.
const _CAL_EV_FIELDS=['title','start','end','time','hour','endHour','minute','location','desc','isAllDay','color','attendees'];
function _calApplyEdit(row,occ,fields,rule,scope){
  const key=occ||row.dateStr;
  if(!_calRule(row)||(scope==='following'&&key===row.dateStr))scope='all';
  if(scope==='one'){
    const ov=Object.assign({},(row.overrides||{})[key]);
    _CAL_EV_FIELDS.forEach(f=>{if(fields[f]!==undefined)ov[f]=fields[f];});
    if(fields.dateStr&&fields.dateStr!==key)ov.dateStr=fields.dateStr;
    else if(fields.dateStr)delete ov.dateStr;
    row.overrides=Object.assign({},row.overrides||{},{[key]:ov});
    return null;
  }
  if(scope==='following'){
    const before=_calCountBefore(row,key);
    const oldR=Object.assign({},row.rrule,{until:_calYmdOf(_calDn(key)-1)});
    const nr=Object.assign({},row);
    _CAL_EV_FIELDS.forEach(f=>{if(fields[f]!==undefined)nr[f]=fields[f];});
    nr.id=Date.now()+Math.floor(Math.random()*1000);
    nr.dateStr=fields.dateStr||key;
    const shift=_calDn(nr.dateStr)-_calDn(key);
    if(rule){
      nr.rrule=Object.assign({},rule);
      if(row.rrule.count&&rule.count===_calRule(row).count)nr.rrule.count=Math.max(1,rule.count-before);
    }else delete nr.rrule;
    const keep=(d)=>_calDn(d)>=_calDn(key);
    nr.exdates=rule?(row.exdates||[]).filter(keep).map(d=>_calYmdOf(_calDn(d)+shift)):[];
    nr.overrides={};
    if(rule)Object.keys(row.overrides||{}).forEach(d=>{if(keep(d))nr.overrides[_calYmdOf(_calDn(d)+shift)]=row.overrides[d];});
    if(!nr.exdates.length)delete nr.exdates;
    if(!Object.keys(nr.overrides).length)delete nr.overrides;
    delete nr.extId;delete nr.dbId;
    row.rrule=oldR;
    if(row.exdates)row.exdates=row.exdates.filter(d=>!keep(d));
    if(row.overrides)Object.keys(row.overrides).forEach(d=>{if(keep(d))delete row.overrides[d];});
    return nr;
  }
  // all
  const shift=fields.dateStr?_calDn(fields.dateStr)-_calDn(key):0;
  _CAL_EV_FIELDS.forEach(f=>{if(fields[f]!==undefined)row[f]=fields[f];});
  if(shift)row.dateStr=_calYmdOf(_calDn(row.dateStr)+shift);
  else if(!_calRule(row)&&fields.dateStr)row.dateStr=fields.dateStr;
  if(rule){
    const r=Object.assign({},rule);
    // Moving every occurrence to another weekday moves the chosen weekdays too.
    if(shift&&r.freq==='weekly'&&Array.isArray(r.byDay)&&_calRule(row)&&JSON.stringify(r.byDay)===JSON.stringify(_calRule(row).byDay))r.byDay=r.byDay.map(d=>(((d+shift)%7)+7)%7).sort((a,b)=>a-b);
    row.rrule=r;
    if(shift){
      if(row.exdates)row.exdates=row.exdates.map(d=>_calYmdOf(_calDn(d)+shift));
      if(row.overrides){const o={};Object.keys(row.overrides).forEach(d=>{o[_calYmdOf(_calDn(d)+shift)]=row.overrides[d];});row.overrides=o;}
    }
  }else{delete row.rrule;delete row.exdates;delete row.overrides;}
  delete row.repeat;delete row.recurrence;
  return null;
}
// Returns true when the whole row should be removed.
function _calApplyDelete(row,occ,scope){
  const key=occ||row.dateStr;
  if(!_calRule(row)||scope==='all'||(scope==='following'&&key===row.dateStr))return true;
  if(scope==='one'){
    row.exdates=Array.from(new Set([...(row.exdates||[]),key]));
    if(row.overrides&&row.overrides[key])delete row.overrides[key];
    return false;
  }
  row.rrule=Object.assign({},row.rrule,{until:_calYmdOf(_calDn(key)-1)});
  const keep=d=>_calDn(d)<_calDn(key);
  if(row.exdates)row.exdates=row.exdates.filter(keep);
  if(row.overrides)Object.keys(row.overrides).forEach(d=>{if(!keep(d))delete row.overrides[d];});
  return false;
}
// "This event / this and following / all events?" — resolves null on cancel.
function _calAskScope(title,verb){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    ov.innerHTML=`<div role="dialog" aria-label="${esc(verb)} a repeating event" style="background:var(--bg);border:1px solid var(--bd2);border-radius:12px;padding:22px;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)">
      <h3 style="font-size:15px;font-weight:600;margin:0 0 8px">${esc(verb)} repeating event</h3>
      <p style="font-size:12px;color:var(--t2);margin:0 0 16px">"${esc(title)}" repeats. Which events?</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-s" style="text-align:left;padding:8px 12px;font-size:12px" data-s="one">This event</button>
        <button class="btn btn-s" style="text-align:left;padding:8px 12px;font-size:12px" data-s="following">This and following events</button>
        <button class="btn btn-s" style="text-align:left;padding:8px 12px;font-size:12px" data-s="all">All events</button>
        <button class="btn btn-s" style="text-align:left;padding:8px 12px;font-size:12px" data-s="">Cancel</button>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('button[data-s]').forEach(b=>{b.onclick=()=>{ov.remove();resolve(b.dataset.s||null);};});
    ov.addEventListener('click',e=>{if(e.target===ov){ov.remove();resolve(null);}});
    setTimeout(()=>{const b=ov.querySelector('button[data-s="one"]');if(b)b.focus();},30);
  });
}
// Repeat editor shared by the New and Edit event dialogs (ids <prefix>-freq …).
function _calRepeatEditor(prefix,e){
  let r=_calRule(e);
  if(!r&&e){const rec=String(e.recurrence||e.repeat||'');if(/^(daily|weekly|biweekly|monthly|yearly)$/.test(rec))r={freq:rec==='biweekly'?'weekly':rec,interval:rec==='biweekly'?2:1,byDay:[],until:'',count:0};}
  r=r||{freq:'',interval:1,byDay:[],until:'',count:0};
  const sel=(r.freq==='weekly'&&r.interval===1&&r.byDay.join()==='1,2,3,4,5')?'weekdays':r.freq;
  const mode=r.until?'until':r.count?'count':'never';
  const opt=(v,l)=>`<option value="${v}"${sel===v?' selected':''}>${l}</option>`;
  return `<div class="field"><label for="${prefix}-freq">Repeat</label>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select class="inp" id="${prefix}-freq" style="flex:1;min-width:150px" onchange="_calRepeatUi(this)">${opt('','Does not repeat')}${opt('daily','Daily')}${opt('weekdays','Every weekday (Mon–Fri)')}${opt('weekly','Weekly')}${opt('monthly','Monthly')}${opt('yearly','Yearly')}</select>
      <span id="${prefix}-every" style="font-size:12px;color:var(--t2);display:inline-flex;align-items:center;gap:4px">every <input type="number" min="1" max="99" class="inp" id="${prefix}-int" aria-label="Repeat interval" value="${r.interval}" style="width:58px;height:30px"> <span id="${prefix}-unit"></span></span>
    </div>
    <div id="${prefix}-days" style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${_CAL_DOW.map((l,i)=>`<label style="font-size:11px;display:inline-flex;align-items:center;gap:3px;padding:3px 7px;border:1px solid var(--bd2);border-radius:12px;cursor:pointer"><input type="checkbox" value="${i}"${r.byDay.indexOf(i)>=0?' checked':''}> ${l}</label>`).join('')}</div>
    <div id="${prefix}-ends" style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap;font-size:12px;color:var(--t2)">Ends
      <select class="inp" id="${prefix}-endmode" aria-label="Repeat ends" style="width:auto;height:30px" onchange="_calRepeatUi(this)"><option value="never"${mode==='never'?' selected':''}>Never</option><option value="until"${mode==='until'?' selected':''}>On date</option><option value="count"${mode==='count'?' selected':''}>After</option></select>
      <input type="date" class="inp" id="${prefix}-until" aria-label="Repeat until" value="${esc(r.until||'')}" style="width:auto;height:30px">
      <span id="${prefix}-countwrap" style="display:inline-flex;align-items:center;gap:4px"><input type="number" min="1" max="999" class="inp" id="${prefix}-count" aria-label="Number of times" value="${r.count||10}" style="width:64px;height:30px"> times</span>
    </div></div>`;
}
function _calRepeatUi(el){
  const prefix=String(el&&el.id||'').replace(/-(freq|endmode)$/,'');
  const g=s=>document.getElementById(prefix+s);
  const f=(g('-freq')||{}).value||'';
  const show=(n,on)=>{const x=g(n);if(x)x.style.display=on?'':'none';};
  show('-every',!!f&&f!=='weekdays');
  show('-days',f==='weekly');
  show('-ends',!!f);
  const u=g('-unit');if(u)u.textContent={daily:'day(s)',weekly:'week(s)',monthly:'month(s)',yearly:'year(s)'}[f]||'';
  const m=(g('-endmode')||{}).value;
  show('-until',m==='until');show('-countwrap',m==='count');
}
function _calReadRepeat(prefix,startYmd){
  const g=s=>document.getElementById(prefix+s);
  const f=(g('-freq')||{}).value||'';
  if(!f)return null;
  const r={freq:f==='weekdays'?'weekly':f,interval:f==='weekdays'?1:Math.max(1,Math.min(99,parseInt((g('-int')||{}).value,10)||1))};
  if(f==='weekdays')r.byDay=[1,2,3,4,5];
  else if(f==='weekly'){
    const box=g('-days');
    r.byDay=box?Array.from(box.querySelectorAll('input:checked')).map(x=>Number(x.value)).sort((a,b)=>a-b):[];
    if(!r.byDay.length&&startYmd)r.byDay=[new Date(_calDn(startYmd)*86400000).getUTCDay()];
  }
  const m=(g('-endmode')||{}).value;
  const until=(g('-until')||{}).value||'';
  if(m==='until'&&/^\d{4}-\d{2}-\d{2}$/.test(until)&&(!startYmd||until>=startYmd))r.until=until;
  if(m==='count')r.count=Math.max(1,Math.min(999,parseInt((g('-count')||{}).value,10)||1));
  return r;
}
// Upcoming repeats of recurring tasks that have a date and a start time,
// for the next 90 days — shown faded so you can plan around them. Built once
// per render pass. Completing the current one still spawns the next for real.
let _taskGhostMemo=null;
function _taskGhosts(){
  if(_taskGhostMemo)return _taskGhostMemo;
  const map={};
  _taskGhostMemo=map;
  setTimeout(()=>{_taskGhostMemo=null;},0);
  if((D&&D.prefs&&D.prefs.calShowTasks===false)||typeof _nextRecurringDue!=='function')return map;
  const horizon=_ymd(new Date(Date.now()+90*86400000));
  const pool=(typeof _taskPool==='function'?_taskPool():D.tasks)||[];
  pool.forEach(t=>{
    if(!t||!t.recurring||t.recurring==='None'||String(t.status||'')==='Done'||t._shared)return;
    const s=_taskSchedule(t);if(!s)return;
    // A later copy already spawned shows itself.
    if(pool.some(x=>x&&x!==t&&x._recurringFrom!=null&&String(x._recurringFrom)===String(t.id)&&x.status!=='Done'))return;
    const base=t.due&&/^\d{4}-\d{2}-\d{2}/.test(t.due)?String(t.due).slice(0,10):s.dateStr;
    let cur={due:base,recurrenceRule:t.recurrenceRule,recurring:t.recurring,_recurrenceIndex:t._recurrenceIndex};
    for(let i=0;i<60;i++){
      const nx=_nextRecurringDue(cur);
      if(!nx)break;
      const date=_calYmdOf(_calDn(s.dateStr)+(_calDn(nx.due)-_calDn(base)));
      if(date>horizon)break;
      (map[date]=map[date]||[]).push({id:t.id,_taskId:t.id,_task:true,_ghost:true,title:String(t.title||'(untitled task)'),hour:s.hour,endHour:s.endHour,time:s.time,dateStr:date,color:_taskCalColor(t)});
      cur=Object.assign({},cur,{due:nx.due,_recurrenceIndex:nx.idx});
    }
  });
  return map;
}
function _taskGhostsOn(ymd){return (_taskGhosts()[ymd]||[]).slice();}
// Fold old repeat copies in this device's cached calendar now; the server's
// copy is folded again after it loads (loadServerData).
try{if(_calMigrateRecurrence())_calPersist();}catch(_){}
function _calEventsOn(dateObj){
  const local=_calLocalEventsOn(dateObj);
  return [...local,..._syncedEventsOn(dateObj),..._tasksOnDate(dateObj),...((typeof _finBillsOnDate==="function")?_finBillsOnDate(dateObj):[])].sort((a,b)=>(a.hour||0)-(b.hour||0));
}
// Resolve the next `limit` _calEvents occurrences (recurring + date-pinned) into
// real {start,end} datetimes, skipping ones already past today.
function _upcomingCalEvents(limit){
  const now=new Date(),out=[];
  for(let i=0;i<8&&out.length<limit;i++){
    const day=new Date();day.setHours(0,0,0,0);day.setDate(day.getDate()+i);
    _calEventsOn(day).forEach(e=>{
      if(out.length>=limit)return;
      const h=typeof e.hour==='number'?e.hour:0;
      const start=_pd(day);start.setHours(h,0,0,0);
      if(start<now)return;
      const eh=(typeof e.endHour==='number'&&e.endHour>h)?e.endHour:h+1;
      const end=_pd(day);end.setHours(eh,0,0,0);
      out.push({e,start,end});
    });
  }
  return out;
}
// ─── Meeting ↔ Note linking ─────────────────────────────────────────────────
// A note carries `meetings: [{id,title,date}]` snapshots (id = calendar event
// id — number for local _calEvents rows, string for OAuth-synced D.calEvents;
// always compare String()-ified). The NOTE is the single source of truth: the
// event side just scans notes, so calendar re-syncs can never orphan the
// association, and the snapshot keeps the chip renderable even if the event
// later disappears from the calendar. Rides inside the note JSON → no server
// or schema change needed.
function _noteMeetings(n){return Array.isArray(n&&n.meetings)?n.meetings.filter(Boolean):[];}
function _noteForEvent(evId){const k=String(evId);return (D.notes||[]).find(n=>_noteMeetings(n).some(m=>String(m.id)===k));}
function _findCalEventById(evId){
  const k=String(evId);
  const hit=_calResolve(k);
  if(hit)return {ev:hit.ev,synced:false};
  const raw=((typeof D!=='undefined'&&D&&D.calEvents)||[]).find(e=>e&&String(e.id)===k);
  if(raw)return {ev:raw,synced:true};
  return null;
}
function _meetingRefFromEvent(ev,dateStr){
  return {id:ev.id,title:ev.title||ev.subject||'(untitled)',date:dateStr||ev.dateStr||String(ev.start||'').slice(0,10)||_ymd()};
}
// Event side: open the linked meeting note, or create one (Meeting Notes type,
// tagged, dropped into a "Meeting…" folder when one exists) and start editing.
function openMeetingNote(evId,dateStr){
  if(typeof closeModal==='function')closeModal();
  const existing=_noteForEvent(evId);
  if(existing){
    nav('notes');
    setTimeout(()=>showNoteInEditor(existing.id),150);
    return;
  }
  const hit=_findCalEventById(evId);
  if(!hit){toast('Event not found on the calendar');return;}
  const ref=_meetingRefFromEvent(hit.ev,dateStr);
  const mtgFolder=_noteFolders().find(f=>/meeting/i.test(f.name||''));
  const n={
    id:nextId(D.notes),
    title:ref.title+' — '+ref.date,
    body:'',bodyHtml:'',
    noteType:'Meeting Notes',
    para:'Resource',source:'Meeting',
    tags:['meeting'],
    updated:'Just now',
    starred:false,
    meetings:[ref],
    createdBy:(D.creds&&D.creds.userName)||'',
    createdAt:new Date().toISOString()
  };
  if(mtgFolder)n.folderId=mtgFolder.id;
  D.notes.push(n);
  save('notes');
  toast('📝 Meeting note created');
  nav('notes');
  setTimeout(()=>{showNoteInEditor(n.id);toggleNoteInlineEdit(n.id);},150);
}
// Note side: chip actions + picker.
function openMeetingFromNote(evId){
  const hit=_findCalEventById(evId);
  if(!hit){toast('This meeting is no longer on the calendar');return;}
  if(curScreen!=='calendar')nav('calendar');
  setTimeout(()=>openCalEvent(hit.ev.id),120);
}
function unlinkNoteMeeting(noteId,evId){
  const n=D.notes.find(x=>x.id===noteId);if(!n)return;
  n.meetings=_noteMeetings(n).filter(m=>String(m.id)!==String(evId));
  save('notes');
  toast('Meeting unlinked');
  showNoteInEditor(noteId);
}
function _pickMeetingForNote(noteId,evId,date,title){
  const n=D.notes.find(x=>x.id===noteId);if(!n)return;
  n.meetings=_noteMeetings(n);
  if(!n.meetings.some(m=>String(m.id)===String(evId))){
    const hit=_findCalEventById(evId);
    n.meetings.push(hit?_meetingRefFromEvent(hit.ev,date):{id:evId,title,date});
  }
  save('notes');
  if(typeof closeModal==='function')closeModal();
  toast('🔗 Linked to '+title);
  showNoteInEditor(noteId);
}
// Picker modal: every calendar event from the past 7 → next 7 days (local +
// synced), filterable. The filter re-renders only the list so the input keeps
// focus while typing.
function openMeetingPicker(noteId){
  const items=[];
  for(let i=-7;i<=7;i++){
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+i);
    const ds=_ymd(d);
    (_calEventsOn(d)||[]).forEach(e=>{
      items.push({id:e.id,title:e.title||'(untitled)',date:ds,hour:(typeof e.hour==='number'?e.hour:null)});
    });
  }
  window._meetPicker={noteId,items};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:10px">📅 Link this note to a meeting</h2>
  <input class="inp" id="meet-picker-q" placeholder="🔍 Filter meetings…" style="width:100%;height:30px;font-size:12px;margin-bottom:8px;box-sizing:border-box" oninput="_meetPickerFilter(this.value)">
  <div id="meet-picker-list" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
  <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-s" style="height:28px;font-size:11px" onclick="closeModal()">Close</button></div>`;
  _meetPickerFilter('');
  document.getElementById('modal-capture').classList.add('show');
  setTimeout(()=>document.getElementById('meet-picker-q')?.focus(),60);
}
function _meetPickerFilter(q){
  const st=window._meetPicker;if(!st)return;
  const box=document.getElementById('meet-picker-list');if(!box)return;
  const ql=(q||'').toLowerCase();
  const today=_ymd();
  const list=st.items.filter(it=>!ql||it.title.toLowerCase().includes(ql));
  box.innerHTML=list.length?list.map(it=>{
    const taken=_noteForEvent(it.id);
    return `<div class="lr" style="cursor:pointer;padding:6px 8px;border:1px solid var(--bd1);border-radius:6px" onclick="_pickMeetingForNote(${st.noteId},'${_jsAttr(String(it.id))}','${_jsAttr(it.date)}','${_jsAttr(it.title)}')"><span class="rt" style="font-size:12px">${it.date===today?'⭐ ':''}${esc(it.title)}</span><span class="rm" style="font-size:11px;color:var(--t3)">${esc(it.date)}${it.hour!=null?' · '+it.hour+':00':''}${taken?' · has note':''}</span></div>`;
  }).join(''):`<div style="font-size:12px;color:var(--t3);padding:12px;text-align:center">No calendar events in the last or next 7 days.</div>`;
}

function openCalEvent(id){
  const hit=_calResolve(id);
  let ev=hit?hit.ev:null;
  let isSynced=false;
  if(!ev){
    const raw=((typeof D!=='undefined'&&D&&D.calEvents)||[]).find(e=>e&&String(e.id)===String(id));
    if(raw){
      isSynced=true;
      const s=String(raw.start||'');
      ev={
        ...raw,
        title:raw.title||raw.subject||'(untitled)',
        dateStr:s.slice(0,10),
        start:s.slice(11,16),
        end:raw.end?String(raw.end).slice(11,16):'',
        location:raw.location||'',
        desc:raw.description||raw.bodyPreview||raw.desc||'',
        attendees:(raw.attendees||[]).map(a=>a&&typeof a==='object'?((a.emailAddress&&(a.emailAddress.name||a.emailAddress.address))||a.name||a.email||''):a).filter(Boolean),
      };
    }
  }
  if(!ev)return;
  const m=document.getElementById('modal-content');
  const dateDisplay=ev.dateStr?fmtDate(ev.dateStr):'Every week';
  const timeDisplay=_calIsAllDay(ev)?'All day':(ev.start||ev.time||'')+(ev.end?' – '+ev.end:'');
  const mtgNote=_noteForEvent(id);
  const ruleText=hit&&_calRule(hit.row)?_calRuleText(hit.row):(ev.recurrence&&ev.recurrence!=='none'?({'daily':'Daily','weekly':'Weekly','biweekly':'Every 2 weeks','monthly':'Monthly','yearly':'Yearly'}[ev.recurrence]||ev.recurrence):(!ev.dateStr&&/^weekly$/i.test(String(ev.repeat||''))?'Every week':''));
  const noteBtn=`<button class="btn btn-s" style="height:26px;font-size:11px;color:var(--ac);font-weight:600" onclick="openMeetingNote('${_jsAttr(String(id))}','${_jsAttr(ev.dateStr||'')}')" title="${mtgNote?'Open the meeting note linked to this event':'Create a meeting note linked to this event'}">📝 ${mtgNote?'Open notes':'Take notes'}</button>`;
  const orow=hit&&hit.row;
  const outlook=!!(orow&&orow.source==='microsoft');
  const outlookRO=outlook&&orow.editable!==true;
  const openOutlook=outlook&&orow.webLink?`<button class="btn btn-s" style="height:26px;font-size:11px"${_act('_luOpenUrl',[orow.webLink])} title="Open this event in Outlook">↗ Outlook</button>`:'';
  const actions=noteBtn+openOutlook+(outlookRO
    ?`<span style="font-size:11px;color:var(--t3);padding:3px 8px;background:var(--s3);border-radius:10px;white-space:normal" title="It has other attendees (or someone else organises it), so changing it here would email them — change it in Outlook">☁ Outlook meeting · change it in Outlook</span>`
    :isSynced
    ?`<span style="font-size:11px;color:var(--t3);padding:3px 8px;background:var(--s3);border-radius:10px" title="Synced from Office 365 — edit in Outlook">☁ Synced from Office 365</span>`
    :`<button class="btn btn-s" style="height:26px;font-size:11px" onclick="openEditCalEvent('${_jsAttr(String(id))}')" title="Edit event">✏️ Edit</button>
      <button class="btn btn-s" style="height:26px;font-size:11px;color:var(--red)" onclick="deleteCalEvent('${_jsAttr(String(id))}')" title="Delete event">🗑️ Delete</button>`);
  m.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;flex-wrap:wrap">
    <h2 style="font-size:16px;font-weight:600;margin:0">${esc(ev.title)}</h2>
    <div style="display:flex;gap:6px;align-items:center">${actions}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px">
  <div style="display:flex;gap:8px;align-items:center"><span style="font-size:16px">🕒</span><div><div style="font-size:12px;font-weight:500">${esc(timeDisplay)}</div><div style="font-size:11px;color:var(--t3)">${esc(dateDisplay)}</div></div></div>
  <div style="display:flex;gap:8px;align-items:center"><span style="font-size:16px">📍</span><div style="font-size:12px">${esc(ev.location||'No location')}</div></div>
  <div style="display:flex;gap:8px;align-items:flex-start"><span style="font-size:16px">📝</span><div style="font-size:12px;color:var(--t2);line-height:1.5">${esc(ev.desc||ev.description||'No description')}</div></div>
  ${ruleText?`<div style="display:flex;gap:8px;align-items:center"><span style="font-size:16px">🔁</span><div style="font-size:12px;color:var(--t2)">${esc(ruleText)}</div></div>`:''}
  ${ev.attendees&&ev.attendees.length?`<div style="display:flex;gap:8px;align-items:flex-start"><span style="font-size:16px">👥</span><div><div style="font-size:11px;color:var(--t3);margin-bottom:4px">Attendees</div><div style="display:flex;flex-wrap:wrap;gap:4px">${ev.attendees.map(a=>`<span style="font-size:11px;background:var(--s3);padding:2px 6px;border-radius:10px">${esc(a)}</span>`).join('')}</div></div></div>`:''}
  </div>
  <div style="display:flex;gap:6px;margin-top:14px;justify-content:flex-end">
  ${ev.meetingUrl||ev.onlineMeeting?`<button class="btn btn-p" style="height:28px;font-size:11px" onclick="_luOpenUrl('${_jsAttr(ev.meetingUrl||ev.onlineMeeting||'')}')">Join Meeting</button>`:''}
  <button class="btn btn-s" style="height:28px;font-size:11px" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function openEditCalEvent(id){
  const hit=_calResolve(id);
  if(!hit)return;
  const ev=hit.ev,row=hit.row;
  const m=document.getElementById('modal-content');
  // <input type=time> needs 24h HH:MM; older events carry "10:00 AM" or
  // only an hour.
  const startTime=_calHM(ev.start||ev.time,Number.isFinite(ev.hour)?ev.hour:9);
  const endTime=_calHM(ev.end,Number.isFinite(ev.endHour)?ev.endHour:(Number.isFinite(ev.hour)?ev.hour+1:10));
  // An undated row (every week on its weekday) shows this week's date and
  // stays undated unless the date or the Repeat setting is changed.
  const dateVal=ev.dateStr||_nevDefaultDate(ev.day,null);
  const undatedAttr=ev.dateStr?'':` data-undated="${esc(dateVal)}"`;
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:14px">✏️ Edit Event</h2>
  <div style="display:flex;flex-direction:column;gap:10px">
  <div class="field"><label for="cev-title">Title</label><input class="inp" id="cev-title" value="${esc(ev.title)}"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label for="cev-date">Date</label><input type="date" class="inp" id="cev-date" value="${esc(dateVal)}"${undatedAttr}></div>
    <div class="field"><label for="cev-allday">All Day</label><select class="inp" id="cev-allday"><option value="0" ${!ev.isAllDay?'selected':''}>No</option><option value="1" ${ev.isAllDay?'selected':''}>Yes</option></select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label for="cev-start">Start Time</label><input type="time" class="inp" id="cev-start" value="${esc(startTime)}"></div>
    <div class="field"><label for="cev-end">End Time</label><input type="time" class="inp" id="cev-end" value="${esc(endTime)}"></div>
  </div>
  <div class="field"><label for="cev-loc">Location</label><input class="inp" id="cev-loc" value="${esc(ev.location||'')}"></div>
  <div class="field"><label for="cev-desc">Description</label><textarea class="inp" id="cev-desc" style="min-height:60px">${esc(ev.desc||ev.description||'')}</textarea></div>
  ${row.source==='microsoft'?`<div style="font-size:11px;color:var(--t3);background:var(--s2);border-radius:6px;padding:6px 8px">☁ Saving updates this event in Outlook.${row.seriesMasterId?' It is one date of an Outlook series — change the whole series in Outlook.':''}</div>`:_calRepeatEditor('cev',row)}
  </div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="saveEditCalEvent('${_jsAttr(String(id))}')">&#10003; Save Changes</button>
  <button class="btn btn-s" onclick="openCalEvent('${_jsAttr(String(id))}')">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  _calRepeatUi(document.getElementById('cev-freq'));
  setTimeout(()=>document.getElementById('cev-title')?.focus(),100);
}

async function saveEditCalEvent(id){
  const hit=_calResolve(id);
  if(!hit)return;
  const row=hit.row;
  const title=document.getElementById('cev-title')?.value.trim();
  if(!title){toast('⚠ Title is required');return;}
  const dateEl=document.getElementById('cev-date');
  const dateVal=dateEl?.value||hit.ev.dateStr||_ymd(new Date());
  const startTime=document.getElementById('cev-start')?.value||'09:00';
  const endTime=document.getElementById('cev-end')?.value||'10:00';
  const location=document.getElementById('cev-loc')?.value.trim()||null;
  const desc=document.getElementById('cev-desc')?.value.trim()||null;
  const isAllDay=parseInt(document.getElementById('cev-allday')?.value||'0');
  const [sh,sm]=startTime.split(':').map(Number);
  // The grid is hour cells: an end at 10:30 still occupies the 10:00 cell.
  const [eh,em]=endTime.split(':').map(Number);
  const fields={title,start:startTime,time:startTime,end:endTime,hour:sh||0,minute:sm||0,endHour:Math.max((sh||0)+1,(eh||0)+((em||0)>0?1:0)),location,desc,isAllDay};
  const rule=_calReadRepeat('cev',dateVal);
  let msg='✓ Event updated';
  if(_calRule(row)){
    const scope=await _calAskScope(title,'Edit');
    if(!scope)return;
    const nr=_calApplyEdit(row,hit.occ,Object.assign({},fields,{dateStr:dateVal}),rule,scope);
    if(nr)_calEvents.push(nr);
    msg=scope==='one'?'✓ This occurrence updated':scope==='following'?'✓ This and later occurrences updated':'✓ All occurrences updated';
  }else if(!row.dateStr&&dateEl&&dateEl.dataset.undated&&dateVal===dateEl.dataset.undated&&rule&&rule.freq==='weekly'&&rule.interval===1&&(rule.byDay||[]).length===1&&!rule.until&&!rule.count&&/^weekly$/i.test(String(row.repeat||''))){
    // An every-week row left as every week: keep it as it was.
    _CAL_EV_FIELDS.forEach(f=>{if(fields[f]!==undefined)row[f]=fields[f];});
  }else{
    let start=dateVal;
    // An undated weekly row made into a series starts from when it was made,
    // so earlier weeks keep showing it.
    if(!row.dateStr&&rule&&Number(row.id)>1e12){const c=_calDn(_ymd(new Date(Number(row.id)))),k=_calDn(dateVal);if(c<k)start=_calYmdOf(k-Math.floor((k-c)/7)*7);}
    _calApplyEdit(row,null,Object.assign({},fields,{dateStr:start}),rule,'all');
    row.dateStr=row.dateStr||start;
    row.day=(new Date(_calDn(row.dateStr)*86400000).getUTCDay()+6)%7;
  }
  _calPersist();
  // An Outlook event goes back to Outlook (-237); other synced rows keep
  // their server copy current.
  if(row.source==='microsoft'&&row.extId){
    if(row.editable===true&&typeof _calQueuePush==='function'){_calQueuePush(row,'update');msg+=' · sending to Outlook';}
  }else if(row.dbId&&!_calRule(row)){
    try{
      await _trpc('oauthSync.updateCalendarEvent',{id:row.dbId,title,start:new Date(row.dateStr+'T'+startTime+':00'),end:new Date(row.dateStr+'T'+endTime+':00'),location,description:desc,isAllDay},'mutate');
    }catch(e){msg+=' (server copy not updated: '+e.message+')';}
  }
  toast(msg);
  closeModal();
  renderCal();
}

async function deleteCalEvent(id){
  const hit=_calResolve(id);
  if(!hit)return;
  const row=hit.row;
  let removeRow=true,msg='✓ Event deleted';
  if(_calRule(row)){
    const scope=await _calAskScope(row.title||'','Delete');
    if(!scope)return;
    removeRow=_calApplyDelete(row,hit.occ,scope);
    if(!removeRow)msg=scope==='one'?'✓ This occurrence deleted':'✓ This and later occurrences deleted';
    else if(scope!=='all')msg='✓ Series deleted';
  }else if(!confirm('Delete "'+row.title+'"'+(row.source==='microsoft'&&row.extId?' from Outlook too':'')+'? This cannot be undone.'))return;
  if(removeRow&&row.source==='microsoft'&&row.extId&&typeof _calQueuePush==='function'){
    // Hidden now, removed once Outlook confirms (-237).
    _calQueuePush(row,'delete');
    toast('✓ Event deleted · removing it from Outlook');
    closeModal();renderCal();
    return;
  }
  if(removeRow){const idx=_calEvents.indexOf(row);if(idx>-1)_calEvents.splice(idx,1);}
  _calPersist();
  toast(msg);
  if(removeRow&&row.dbId){
    try{await _trpc('oauthSync.deleteCalendarEvent',{id:row.dbId},'mutate');}
    catch(e){console.warn('Server delete failed:',e.message);}
  }
  closeModal();
  renderCal();
}
function blockTaskTime(taskId){
  // New behaviour: show today's free slots so the user can one-click a time
  // window. Falls back to the legacy "open a blank Calendar event modal" flow
  // when openTimeBlockPicker isn't available or when the slot picker comes up
  // empty AND the user wants to manually pick a different day.
  if(typeof openTimeBlockPicker==='function'){
    openTimeBlockPicker(taskId);
    return;
  }
  _legacyBlockTaskTime(taskId);
}
function _legacyBlockTaskTime(taskId){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  const today=new Date();
  let prefillDay=(today.getDay()+6)%7;
  let prefillDateStr=null;
  if(t.due&&t.due!=='No date'){
    const parsed=new Date(t.due+', '+today.getFullYear());
    if(!isNaN(parsed)){
      prefillDay=(parsed.getDay()+6)%7;
      prefillDateStr=_ymd(parsed);
    }
  }
  const prefillHour=9;
  const durationMins=t.estimatedMins||60;
  openNewCalEventModal(prefillDay,prefillHour,t.title,durationMins,prefillDateStr);
  nav('calendar');
  toast('📅 Opening Calendar to block time for: '+t.title);
}
function openNewCalEventModal(prefillDay,prefillHour,prefillTitle,prefillDurationMins,prefillDateStr){
  const m=document.getElementById('modal-content');
  const today=new Date();
  const dayOfWeek=today.getDay();
  const monday=_pd(today);monday.setDate(today.getDate()-(dayOfWeek===0?6:dayOfWeek-1));
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const colorOpts=[{v:'var(--ac)',l:'Blue'},{'v':'var(--ok)',l:'Green'},{'v':'var(--warn)',l:'Yellow'},{'v':'var(--red)',l:'Red'},{'v':'var(--purp)',l:'Purple'}];
  const endHour=prefillHour!==undefined?(prefillHour+Math.ceil((prefillDurationMins||60)/60)):10;
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:14px">📅 New Calendar Event</h2>
  <div style="display:flex;flex-direction:column;gap:10px">
  <div class="field"><label>Title</label><input class="inp" id="nev-title" placeholder="Event title..." value="${esc(prefillTitle||'')}"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Date</label><input type="date" class="inp" id="nev-date" value="${_nevDefaultDate(prefillDay,prefillDateStr)}"></div>
    <div class="field"><label>Color</label><select class="inp" id="nev-color">${colorOpts.map(c=>`<option value="${c.v}">${c.l}</option>`).join('')}</select></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <div class="field"><label>Start Time</label><input type="time" class="inp" id="nev-start" value="${prefillHour!==undefined?(prefillHour<10?'0'+prefillHour:prefillHour)+':00':'09:00'}"></div>
    <div class="field"><label>End Time</label><input type="time" class="inp" id="nev-end" value="${prefillHour!==undefined?(endHour<10?'0'+endHour:endHour)+':00':'10:00'}"></div>
  </div>
  <div class="field"><label>Location</label><input class="inp" id="nev-loc" placeholder="Room, Zoom, Teams..."></div>
  <div class="field"><label>Attendees</label><input class="inp" id="nev-att" placeholder="Names, comma separated..."></div>
  <div class="field"><label>Description</label><textarea class="inp" id="nev-desc" style="min-height:60px" placeholder="Event details..."></textarea></div>
  ${_calRepeatEditor('nev',null)}
  <label id="nev-outlook-row" style="display:none;align-items:center;gap:6px;font-size:12px;color:var(--t2)"><input type="checkbox" id="nev-outlook"> ☁ Also add to my Outlook calendar <span style="font-size:11px;color:var(--t3)">(no invitations are sent)</span></label>
  </div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="saveNewCalEvent()">✓ Add Event</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  _calRepeatUi(document.getElementById('nev-freq'));
  if(typeof _calOutlookReady==='function')_calOutlookReady().then(ok=>{const r=document.getElementById('nev-outlook-row');if(!ok||!r)return;r.style.display='flex';const c=document.getElementById('nev-outlook');if(c)c.checked=localStorage.getItem('lu_cal_push_new')==='1';});
  setTimeout(()=>document.getElementById('nev-title')?.focus(),100);
}
// Default date for the new-event form: an explicit date, else the chosen
// weekday in the week on screen, else the day on screen, else today.
function _nevDefaultDate(prefillDay,prefillDateStr){
  if(prefillDateStr&&/^\d{4}-\d{2}-\d{2}$/.test(prefillDateStr))return prefillDateStr;
  const d=new Date();d.setHours(0,0,0,0);
  if(typeof _calView!=='undefined'&&_calView==='day'&&typeof _calDayOffset!=='undefined'){d.setDate(d.getDate()+_calDayOffset);return _ymd(d);}
  if(prefillDay!==undefined&&prefillDay!==null){
    const mon=_pd(d);mon.setDate(d.getDate()-((d.getDay()+6)%7)+7*(typeof _calWeekOffset!=='undefined'?_calWeekOffset:0));
    mon.setDate(mon.getDate()+Number(prefillDay));return _ymd(mon);
  }
  return _ymd(d);
}
function saveNewCalEvent(){
  const title=document.getElementById('nev-title')?.value.trim();
  if(!title){toast('⚠ Title is required');return;}
  const startVal=document.getElementById('nev-start')?.value||'09:00';
  const endVal=document.getElementById('nev-end')?.value||'10:00';
  const [sh,sm]=startVal.split(':').map(Number);
  const [eh,em]=endVal.split(':').map(Number);
  const dateStr=document.getElementById('nev-date')?.value||_ymd(new Date());
  const day=(new Date(_calDn(dateStr)*86400000).getUTCDay()+6)%7; // 0=Mon, the grid's weekday convention
  const color=document.getElementById('nev-color')?.value||'var(--ac)';
  const loc=document.getElementById('nev-loc')?.value||'';
  const att=document.getElementById('nev-att')?.value||'';
  const desc=document.getElementById('nev-desc')?.value||'';
  // One row; a repeat is a rule on it (it used to be up to 14 copies).
  const rule=_calReadRepeat('nev',dateStr);
  const ev={id:Date.now(),title,dateStr,day,time:startVal,start:startVal,end:endVal,hour:sh||0,minute:sm||0,endHour:Math.max((sh||0)+1,(eh||0)+((em||0)>0?1:0)),color,location:loc,attendees:att?att.split(',').map(x=>x.trim()).filter(Boolean):[],desc};
  if(rule)ev.rrule=rule;
  // Also on Outlook (-237): remembered per device.
  const ob=document.getElementById('nev-outlook'),orow=document.getElementById('nev-outlook-row');
  const toOutlook=!!(ob&&orow&&orow.style.display!=='none'&&ob.checked);
  if(orow&&orow.style.display!=='none'){try{localStorage.setItem('lu_cal_push_new',toOutlook?'1':'0');}catch(_){}}
  if(toOutlook){ev.source='microsoft';ev.editable=true;}
  _calEvents.push(ev);
  if(typeof _calPersist==='function')_calPersist();
  if(toOutlook&&typeof _calQueuePush==='function')_calQueuePush(ev,'create');
  closeModal();
  renderCal();
  toast('✓ Event added'+(rule?' · '+_calRuleText(ev):''));
}
let _calWeekOffset=0;
let _calView='week'; // 'week' | 'day' | 'month'
let _calDayOffset=0; // days from today for Day view
let _calMonthOffset=0; // months from today for Month view

function renderCal(){
  if(_calView==='day')renderCalDay();
  else if(_calView==='month')renderCalMonth();
  else renderCalWeek();
  if(typeof _populateCalRail==='function')_populateCalRail();
}

function _calViewTabs(){
  const showTasks=!(D&&D.prefs&&D.prefs.calShowTasks===false);
  const n=showTasks?_scheduledTaskEvents().length:0;
  // Outlook auto-sync switch (-237), once Outlook is known to be connected.
  const ol=typeof _calOutlookConnected!=='undefined'&&_calOutlookConnected===true;
  const auto=!(D&&D.prefs&&D.prefs.calAutoSync===false);
  const lastPull=+(localStorage.getItem('lu_cal_pull_microsoft')||0);
  const olBtn=ol?`<button class="btn btn-s" style="height:24px;font-size:11px;white-space:normal;color:${auto?'var(--ac)':'var(--t3)'}" onclick="toggleCalAutoSync()" title="${auto?'Outlook is pulled every 15–20 minutes while LevelUp is open, and your changes to your own events go back to it':'Outlook syncs only when you press ☁ Sync O365'}${lastPull?' · last pulled '+esc(new Date(lastPull).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})):''}">☁ Outlook ${auto?'auto':'manual'}</button>`:'';
  return `<div class="tabs" style="margin-bottom:10px;align-items:center">
    <div class="tab ${_calView==='week'?'on':''}" onclick="_calView='week';renderCal()">Week</div>
    <div class="tab ${_calView==='day'?'on':''}" onclick="_calView='day';renderCal()">Day</div>
    <div class="tab ${_calView==='month'?'on':''}" onclick="_calView='month';renderCal()">Month</div>
    <button class="btn btn-s" style="margin-left:auto;height:24px;font-size:11px;white-space:normal;background:${showTasks?'var(--acs)':''};color:${showTasks?'var(--ac)':'var(--t3)'}" onclick="toggleCalShowTasks()" title="Tasks that have both a date and a start time appear on the grid alongside events">${showTasks?'▢ Tasks shown':'▢ Tasks hidden'}${showTasks&&n?` · ${n}`:''}</button>${olBtn}
  </div>`;
}

function renderCalWeek(){
  const _sunFirst=(D.prefs&&D.prefs.firstDayOfWeek)==='sunday';
  const days=_sunFirst?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today=new Date();
  const dayOfWeek=today.getDay(); // 0=Sun,1=Mon,...
  // Calculate offset to week start
  const _startOffset=_sunFirst?(dayOfWeek):(dayOfWeek===0?6:dayOfWeek-1);
  const baseMonday=_pd(today);
  baseMonday.setDate(today.getDate()-_startOffset+(_calWeekOffset*7));
  baseMonday.setHours(0,0,0,0);
  const baseSunday=_pd(baseMonday);baseSunday.setDate(baseMonday.getDate()+6);
  const isCurrentWeek=_calWeekOffset===0;
  const weekRangeLabel=`${baseMonday.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${baseSunday.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  const weekDays=days.map((d,i)=>{
    const dt=_pd(baseMonday);dt.setDate(baseMonday.getDate()+i);
    const isToday=dt.toDateString()===today.toDateString();
    return{label:`${d} ${dt.getDate()}`,isToday,dt};
  });
  const weekDayStrs=weekDays.map(wd=>_ymd(wd.dt));
  // Events per column, split into all-day and timed (all-day ones used to be
  // invisible, and anything outside 8 AM–5 PM was dropped with no hint).
  const _colEvents=weekDays.map((wd,d)=>[..._calLocalEventsOn(wd.dt),..._syncedEventsOn(wd.dt),..._scheduledTaskEvents().filter(e=>e.dateStr===weekDayStrs[d]),..._taskGhostsOn(weekDayStrs[d])]);
  const _allDay=_colEvents.map(list=>list.filter(_calIsAllDay));
  const _timed=_colEvents.map(list=>list.filter(e=>!_calIsAllDay(e)));
  const _hrs=_timed.flat().map(e=>Number(e.hour)).filter(h=>Number.isFinite(h)&&h>=0&&h<=23);
  const _hFrom=Math.min(7,..._hrs),_hTo=Math.max(19,..._hrs);
  const _hours=Array.from({length:_hTo-_hFrom+1},(_,i)=>_hFrom+i);
  const _hLabel=h=>h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`;
  const _allDayRow=_allDay.some(l=>l.length)?`<div class="cal-tl" style="font-size:10px">All day</div>${_allDay.map((l,d)=>`<div class="cal-c" data-drop="cal" data-drop-v="${weekDayStrs[d]}|allday">${l.map(e=>_calChip(e)).join('')}</div>`).join('')}`:'';
  $('cal-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('calendar',22,'var(--page-accent)')}Calendar</h1><p style="font-size:12px;color:var(--t2)">${weekRangeLabel}</p></div><div style="display:flex;gap:4px;align-items:center"><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calWeekOffset--;renderCal()" title="Previous week">‹</button><button class="btn btn-s" style="height:28px;font-size:11px" onclick="_calWeekOffset=0;renderCal()">Today</button><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calWeekOffset++;renderCal()" title="Next week">›</button>${_calAIMenu('cal-ai-week',[{label:'💬 NL Event',fn:'aiCalNLP()',c:'var(--ac)'},{label:'✨ Optimize',fn:'aiScheduleOptimize()',c:'var(--purp)'},{label:'📝 Prep Brief',fn:'aiMeetingPrepBrief()',c:'var(--grn)'}])}<button class="btn btn-s" id="cal-sync-btn-week" style="height:28px;font-size:11px" onclick="syncCalendarO365(this)" title="Sync Office 365 calendar">☁ Sync O365</button><button class="btn btn-p" onclick="openNewCalEventModal()">+ Event</button></div></div>
${_calViewTabs()}
<div style="overflow-x:auto"><div class="cal-grid" style="min-width:600px"><div></div>${weekDays.map((wd,i)=>`<div class="cal-hd" style="${wd.isToday?'color:var(--ac);font-weight:700;background:var(--acs);border-radius:4px':''};padding:2px 4px">${wd.label}</div>`).join('')}
${_allDayRow}${_hours.map(h=>`<div class="cal-tl">${_hLabel(h)}</div>${weekDays.map((wd,d)=>{
  const evs=_timed[d].filter(e=>Number(e.hour)===h);
  return`<div class="cal-c" data-drop="cal" data-drop-v="${weekDayStrs[d]}|${h}">${evs.map(e=>_calChip(e)).join('')}</div>`}).join('')}`).join('')}</div></div>${_calTrayHtml()}`;
}

function renderCalDay(){
  const today=new Date();
  const viewDay=_pd(today);
  viewDay.setDate(today.getDate()+_calDayOffset);
  viewDay.setHours(0,0,0,0);
  const isToday=_calDayOffset===0;
  const dayLabel=viewDay.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const dayStr=_ymd(viewDay);
  const dayOfWeek=(viewDay.getDay()+6)%7; // 0=Mon
  const _dayLocal=_calLocalEventsOn(viewDay).filter(e=>!_calIsAllDay(e));
  const _dayHrs=_dayLocal.map(e=>Number(e.hour)).filter(h=>Number.isFinite(h)&&h>=0&&h<=23);
  const hours=Array.from({length:Math.max(22,..._dayHrs)-Math.min(6,..._dayHrs)+1},(_,i)=>Math.min(6,..._dayHrs)+i);
  const rows=hours.map(h=>{
    const label=h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`;
    const evs=[..._dayLocal.filter(e=>Number(e.hour)===h),..._cellEventsForDate(dayStr,h),..._cellTasksForDate(dayStr,h)];
    const evHtml=evs.map(e=>{
      // Calculate duration in hours for visual height hint
      const durationH=e.endHour&&e.endHour>e.hour?e.endHour-e.hour:1;
      // Task chips are DERIVED, not rows in _calEvents, so they deliberately
      // skip the drag/resize affordances below — calDayDragStart/calResizeStart
      // look the id up in _calEvents and would silently no-op on a task id.
      // Rescheduling a task happens in its drawer.
      if(e._task)return _calChip(e,{cls:'',extra:`;padding:4px 8px;border-radius:4px;margin-bottom:3px;font-size:11px;border-left-width:3px`});
      return`<div
        data-ev-id="${esc(String(e.id))}"
        draggable="${_calCanMove(e)}"
        style="background:${e.color}22;border-left:3px solid ${e.color};padding:4px 8px 2px 8px;border-radius:4px;margin-bottom:3px;cursor:grab;font-size:11px;user-select:none;position:relative"
        onclick="openCalEvent('${_jsAttr(String(e.id))}')"
        ondragstart="calDayDragStart(event,'${_jsAttr(String(e.id))}')"
        title="Drag to reschedule">
        <strong>${e._seriesId!=null?'🔁 ':''}${esc(e.title)}</strong>
        ${e.time?`<span style="color:var(--t3);font-size:11px;margin-left:6px">${e.time}${e.end?' – '+e.end:''}</span>`:''}
        ${e.location?`<span style="color:var(--t3);font-size:11px;margin-left:6px">📍 ${esc(e.location)}</span>`:''}
        <span style="float:right;font-size:11px;color:var(--t3);opacity:.6" title="Drag to move">↕</span>
        <div
          class="cal-resize-handle"
          style="position:absolute;bottom:0;left:0;right:0;height:8px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s"
          onmouseenter="this.style.opacity='1'"
          onmouseleave="this.style.opacity='0'"
          onmousedown="calResizeStart(event,'${_jsAttr(String(e.id))}')"
          onclick="event.stopPropagation()"
          title="Drag to resize">
          <div style="width:24px;height:3px;background:${e.color};border-radius:2px;opacity:.7"></div>
        </div>
      </div>`;
    }).join('');
    const isNowHour=isToday&&new Date().getHours()===h;
    return`<div
      data-hour="${h}" data-drop="cal" data-drop-v="${dayStr}|${h}"
      style="display:grid;grid-template-columns:56px 1fr;border-top:1px solid var(--bd1);min-height:52px"
      ondragover="event.preventDefault();this.style.background='var(--acs)'"
      ondragleave="this.style.background=''"
      ondrop="calDayDrop(event,${h},${dayOfWeek},'${dayStr}');this.style.background=''">
      <div style="font-size:11px;color:${isNowHour?'var(--ac)':'var(--t3)'};font-weight:${isNowHour?700:400};padding:6px 8px 0 0;text-align:right;padding-top:4px">${label}</div>
      <div style="padding:4px 8px;position:relative">
        ${isNowHour?`<div style="position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);border-radius:1px"></div>`:''}
        ${evHtml||`<div style="height:44px;cursor:pointer;border-radius:4px" onclick="openNewCalEventModal(${dayOfWeek},${h})" title="Click to add event"></div>`}
      </div>
    </div>`;
  }).join('');
  $('cal-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('calendar',22,'var(--page-accent)')}Calendar</h1><p style="font-size:12px;color:var(--t2)">${dayLabel}</p></div><div style="display:flex;gap:4px;align-items:center"><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calDayOffset--;renderCal()" title="Previous day">‹</button><button class="btn btn-s" style="height:28px;font-size:11px" onclick="_calDayOffset=0;renderCal()">Today</button><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calDayOffset++;renderCal()" title="Next day">›</button>${_calAIMenu('cal-ai-day',[{label:'💬 NL Event',fn:'aiCalNLP()',c:'var(--ac)'},{label:'📝 Prep Brief',fn:'aiMeetingPrepBrief()',c:'var(--grn)'},{label:'✓ Extract Actions',fn:'aiExtractActions()',c:'var(--purp)'}])}<button class="btn btn-s" id="cal-sync-btn-day" style="height:28px;font-size:11px" onclick="syncCalendarO365(this)" title="Sync Office 365 calendar">☁ Sync O365</button><button class="btn btn-p" onclick="openNewCalEventModal()">+ Event</button></div></div>
${_calViewTabs()}
${(()=>{const ad=[..._calLocalEventsOn(viewDay).filter(_calIsAllDay),..._syncedEventsOn(viewDay).filter(_calIsAllDay)];return ad.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><span style="font-size:11px;color:var(--t3);font-weight:600">All day</span>${ad.map(e=>_calChip(e)).join('')}</div>`:'';})()}<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;overflow:hidden">${rows}</div>`;
}

let _calDragEvId=null;
let _calResizeEvId=null;
let _calResizeStartY=0;
let _calResizeStartEndHour=0;
// Start/end of a grid event in minutes after midnight (start/end may be
// "HH:MM", "9:00 AM", or only hour/endHour on older rows).
function _calEvMins(ev){
  const p=v=>{const m=/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(String(v||'').trim());if(!m)return null;let h=+m[1]%24;if(m[3]){h=h%12+(/p/i.test(m[3])?12:0);}return h*60+(+m[2]);};
  let s=p(ev&&ev.start);if(s==null)s=p(ev&&ev.time);if(s==null)s=(Number(ev&&ev.hour)||0)*60+(Number(ev&&ev.minute)||0);
  let e=p(ev&&ev.end);if(e==null)e=(Number.isFinite(Number(ev&&ev.endHour))&&ev.endHour!=null?Number(ev.endHour)*60:s+60);
  if(e<=s)e=s+60;
  return {s,e};
}
// Move/resize a grid event, or just one occurrence of a repeating one.
// Returns the resolved hit (null when the id is unknown).
function _calMoveEvent(id,dateStr,startMins,endMins){
  const hit=_calResolve(id);
  if(!hit)return null;
  const s=Math.max(0,Math.min(1439,Math.round(startMins))),e=Math.max(s+15,Math.min(1440,Math.round(endMins)));
  const hm=m=>String(Math.floor(Math.min(m,1439)/60)).padStart(2,'0')+':'+String(Math.min(m,1439)%60).padStart(2,'0');
  const f={hour:Math.floor(s/60),minute:s%60,endHour:Math.min(24,Math.max(Math.floor(s/60)+1,Math.ceil(e/60))),start:hm(s),time:hm(s),end:hm(e===1440?1439:e)};
  if(hit.occ!=null)_calApplyEdit(hit.row,hit.occ,Object.assign({},f,dateStr?{dateStr}:{}),_calRule(hit.row),'one');
  else{
    Object.assign(hit.row,f);
    if(dateStr){hit.row.dateStr=dateStr;hit.row.day=(new Date(_calDn(dateStr)*86400000).getUTCDay()+6)%7;}
  }
  _calPersist();
  return hit;
}
// After a drag or resize: an Outlook event goes back to Outlook (-237).
function _calAfterMove(id){const hit=_calResolve(id);if(hit&&hit.occ==null&&hit.row.source==='microsoft'&&hit.row.extId&&hit.row.editable===true&&typeof _calQueuePush==='function')_calQueuePush(hit.row,'update');}
// May this event be dragged or resized? Not an Outlook meeting with other
// attendees (moving it here would email them) — those move in Outlook.
function _calCanMove(e){return !!e&&!e._task&&!e._finBill&&!(e.source==='microsoft'&&e.editable!==true);}
function _calMoveBlocked(e){toast({type:'info',title:'Move it in Outlook',msg:'"'+(e&&e.title||'This meeting')+'" has other attendees, so changing it here would email them.',duration:4500});}
// ── Drag on the Week and Month views (build -238) ──
// Chips carry data-drag (calev = a grid event or one occurrence, caltask = a
// scheduled task); Week cells are data-drop="cal" "<ymd>|<hour or allday>",
// Day rows the same, Month cells data-drop="calday" "<ymd>". Moving keeps the
// minutes and the length; dropping on All day or a Month cell keeps the time.
// ── Unscheduled tasks under the Week view (build -239) ──
// Your open tasks with no start time. Drag one onto a day and hour to
// schedule it there (start date + time, length from its estimate), or tap it
// to pick a free slot on any day (openTimeBlockPicker). My Day first, then
// overdue, due this week, by priority. Hide/show: D.prefs.calTray.
let _calTrayAll=false;
function _calTrayTasks(){
  const today=_todayStr,wk=_ymd(new Date(Date.now()+7*86400000));
  const pr={High:0,Medium:1,Low:2};
  const blocked=_blockedTaskIds();
  return (D.tasks||[]).filter(t=>t&&!t.parentTaskId&&t.status!=='Done'&&t.status!=='Someday'&&!_taskSchedule(t)&&!blocked.has(String(t.id)))
    .map(t=>({t,k:(t.myDay?0:100)+((t.due&&t.due<today)?0:(t.due&&t.due<=wk)?10:20)+(pr[t.priority]!=null?pr[t.priority]:1)}))
    .sort((a,b)=>a.k-b.k||String(a.t.due||'9').localeCompare(String(b.t.due||'9')))
    .map(x=>x.t);
}
function _calTrayHtml(){
  if(D.prefs&&D.prefs.calTray===false)return `<div style="margin-top:8px"><button class="btn btn-s" style="height:24px;font-size:11px"${_act('toggleCalTray',[])}>📋 Show unscheduled tasks</button></div>`;
  const list=_calTrayTasks();
  const shown=list.slice(0,_calTrayAll?60:12);
  const pcol={High:'var(--red)',Medium:'var(--warn)',Low:'var(--ok)'};
  const chips=shown.map(t=>{
    const due=t.due&&/^\d{4}-\d{2}-\d{2}/.test(t.due)?` · due ${esc(fmtDate(String(t.due).slice(0,10)))}`:'';
    return `<div class="cal-tray-chip" data-drag="task" data-drag-id="${esc(String(t.id))}"${_act('openTimeBlockPicker',[t.id])} role="button" tabindex="0" title="Drag onto the calendar to schedule it, or click to pick a free slot" style="display:inline-flex;align-items:center;gap:5px;max-width:240px;padding:4px 8px;border:1px dashed var(--bd2);border-left:3px solid ${pcol[t.priority]||'var(--warn)'};border-radius:6px;background:var(--s2);font-size:11px;color:var(--t1)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.myDay?'☀ ':''}${esc(String(t.title||'(untitled)'))}</span><span style="color:var(--t3);white-space:nowrap">${_fmtHm(Number(t.estimatedMins)||60)}${due}</span></div>`;
  }).join('');
  return `<div class="cal-tray" style="margin-top:10px;border:1px solid var(--bd1);border-radius:8px;padding:8px 10px;background:var(--s1)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
      <span style="font-size:12px;font-weight:600">📋 Unscheduled tasks · ${list.length}</span>
      <span style="font-size:11px;color:var(--t3)">Drag one onto the calendar to schedule it, or click it to pick a free slot.</span>
      <button class="btn btn-s" style="margin-left:auto;height:22px;font-size:11px"${_act('toggleCalTray',[])}>Hide</button>
    </div>
    ${list.length?`<div style="display:flex;flex-wrap:wrap;gap:6px">${chips}${list.length>12?`<button class="btn btn-s" style="height:24px;font-size:11px"${_act('_calTrayMore',[])}>${_calTrayAll?'Show fewer':'+'+(list.length-12)+' more'}</button>`:''}</div>`:`<div style="font-size:11px;color:var(--t3)">Every open task has a time. Nice.</div>`}
  </div>`;
}
function toggleCalTray(){D.prefs=D.prefs||{};D.prefs.calTray=D.prefs.calTray===false;save('prefs');renderCal();}
function _calTrayMore(){_calTrayAll=!_calTrayAll;renderCal();}
function _calDropTo(kind,id,ymd,hour){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd||'')))return;
  const hm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  if(kind==='calev'){
    const hit=_calResolve(id);
    if(!hit)return;
    if(!_calCanMove(hit.ev)){_calMoveBlocked(hit.ev);return;}
    const {s,e}=_calEvMins(hit.ev);
    const ns=hour==null?s:hour*60+(s%60);
    if(ns===s&&hit.ev.dateStr===ymd)return;
    _calMoveEvent(id,ymd,ns,ns+(e-s));
    // A time block made for a task moves the task's time with it.
    const lt=hit.row.linkedTaskId!=null&&hit.occ==null?(D.tasks||[]).find(t=>String(t.id)===String(hit.row.linkedTaskId)):null;
    if(lt){lt.startTime=hm(ns);lt.endTime=hm(Math.min(ns+(e-s),1439));if(lt.startDate)lt.startDate=ymd;save('tasks');}
    _calAfterMove(id);
    renderCal();
    toast(`📅 "${hit.ev.title}" → ${fmtDate(ymd)} ${hm(ns)}${hit.occ!=null?' (this occurrence)':''}`);
    return;
  }
  if(kind==='caltask'||kind==='task'){
    const t=(D.tasks||[]).find(x=>String(x.id)===String(id));
    if(!t)return;
    const sch=_taskSchedule(t);
    const p=v=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(v||''));return m?(+m[1])*60+(+m[2]):null;};
    const s0=sch?p(sch.time):null,e0=p(t.endTime);
    const len=s0!=null&&e0!=null&&e0>s0?e0-s0:Math.max(15,Number(t.estimatedMins)||60);
    const ns=hour!=null?hour*60+(s0!=null?s0%60:0):(s0!=null?s0:9*60);
    // Scheduling sets when the work happens (startDate, which the calendar
    // shows first) — never the deadline.
    t.startDate=ymd;
    t.startTime=hm(ns);
    if(t.endTime||t.estimatedMins)t.endTime=hm(Math.min(ns+len,1439));
    t.updatedAt=new Date().toISOString();
    save('tasks');
    renderCal();
    toast(`📋 "${String(t.title||'Task').slice(0,60)}" → ${fmtDate(ymd)} ${hm(ns)}`);
  }
}
_luDropRoutes.cal=function(kind,id,v){const [ymd,h]=String(v).split('|');_calDropTo(kind,id,ymd,h==='allday'||h==null?null:Number(h));};
_luDropRoutes.calday=function(kind,id,ymd){_calDropTo(kind,id,ymd,null);};
let _calResizeNewEnd=null;
function calResizeStart(event,evId){
  event.preventDefault();
  event.stopPropagation();
  const hit=_calResolve(evId);
  if(!hit)return;
  if(!_calCanMove(hit.ev)){_calMoveBlocked(hit.ev);return;}
  _calResizeEvId=evId;
  _calResizeStartY=event.clientY;
  _calResizeStartEndHour=_calEvMins(hit.ev).e;
  _calResizeNewEnd=null;
  // Prevent drag-to-move from firing during resize
  document.addEventListener('mousemove',calResizeMove);
  document.addEventListener('mouseup',calResizeEnd,{once:true});
  document.body.style.cursor='ns-resize';
  document.body.style.userSelect='none';
}
function calResizeMove(event){
  if(_calResizeEvId===null)return;
  const hit=_calResolve(_calResizeEvId);
  if(!hit)return;
  const {s}=_calEvMins(hit.ev);
  // Each hour row is about 52px tall; snap to half hours.
  const delta=Math.round((event.clientY-_calResizeStartY)/26)*30;
  const ne=Math.max(s+30,Math.min(1440,_calResizeStartEndHour+delta));
  if(ne===_calResizeNewEnd)return;
  _calResizeNewEnd=ne;
  const el=document.querySelector(`[data-ev-id="${CSS.escape(String(_calResizeEvId))}"]`);
  const span=el&&el.querySelector('span');
  const hm=m=>String(Math.floor(Math.min(m,1439)/60)).padStart(2,'0')+':'+String(Math.min(m,1439)%60).padStart(2,'0');
  if(span)span.textContent=`${hm(s)} – ${hm(ne)}`;
}
function calResizeEnd(){
  if(_calResizeEvId===null)return;
  document.removeEventListener('mousemove',calResizeMove);
  document.body.style.cursor='';
  document.body.style.userSelect='';
  const id=_calResizeEvId,ne=_calResizeNewEnd;
  _calResizeEvId=null;_calResizeNewEnd=null;
  const hit=_calResolve(id);
  if(!hit||ne==null)return;
  const {s}=_calEvMins(hit.ev);
  _calMoveEvent(id,null,s,ne);
  if(typeof _calAfterMove==='function')_calAfterMove(id);
  renderCal();
  toast(`📅 "${hit.ev.title}" now ends at ${String(Math.floor(Math.min(ne,1439)/60)).padStart(2,'0')}:${String(Math.min(ne,1439)%60).padStart(2,'0')}${hit.occ!=null?' (this occurrence)':''}`);
}
function calDayDragStart(event,evId){
  _calDragEvId=evId;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',String(evId));
  // Slight opacity on drag
  setTimeout(()=>{if(event.target)event.target.style.opacity='0.5';},0);
  event.target.addEventListener('dragend',()=>{event.target.style.opacity='';},{once:true});
}
function calDayDrop(event,newHour,dayOfWeek,dayStr){
  event.preventDefault();
  const evId=_calDragEvId!=null?_calDragEvId:event.dataTransfer.getData('text/plain');
  _calDragEvId=null;
  const hit=_calResolve(evId);
  if(!hit)return;
  if(!_calCanMove(hit.ev)){_calMoveBlocked(hit.ev);return;}
  const {s,e}=_calEvMins(hit.ev);
  const ns=newHour*60+(s%60);
  if(ns===s&&hit.ev.dateStr===dayStr)return;
  _calMoveEvent(evId,dayStr,ns,ns+(e-s));
  if(typeof _calAfterMove==='function')_calAfterMove(evId);
  renderCal();
  toast(`📅 "${hit.ev.title}" moved to ${String(newHour).padStart(2,'0')}:${String(s%60).padStart(2,'0')}${hit.occ!=null?' (this occurrence)':''}`);
}
function renderCalMonth(){
  const today=new Date();
  const firstOfMonth=new Date(today.getFullYear(),today.getMonth()+_calMonthOffset,1);
  const lastOfMonth=new Date(today.getFullYear(),today.getMonth()+_calMonthOffset+1,0);
  const monthLabel=firstOfMonth.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  // Start grid from Monday before first of month
  const startDow=(firstOfMonth.getDay()+6)%7; // 0=Mon
  const gridStart=_pd(firstOfMonth);gridStart.setDate(1-startDow);
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let cells=[];
  for(let i=0;i<42;i++){
    const d=_pd(gridStart);d.setDate(gridStart.getDate()+i);
    cells.push(d);
  }
  const cellsHtml=cells.map(d=>{
    const isThisMonth=d.getMonth()===firstOfMonth.getMonth();
    const isTodayCell=d.toDateString()===today.toDateString();
    const dStr=_ymd(d);
    const dow=(d.getDay()+6)%7;
    const isCurrentMonth=_calMonthOffset===0;
    const evs=[..._calLocalEventsOn(d),..._syncedEventsOn(d),..._tasksOnDate(d),...((typeof _finBillsOnDate==="function")?_finBillsOnDate(d):[])];
    const evDots=evs.slice(0,3).map(e=>_calChip(e,{cls:'',extra:';font-size:11px;padding:1px 4px;border-radius:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'})).join('');
    const moreCount=evs.length>3?`<div style="font-size:9px;color:var(--t3);padding-left:4px">+${evs.length-3} more</div>`:'';
    return`<div data-drop="calday" data-drop-v="${dStr}" style="border:1px solid var(--bd1);min-height:80px;padding:4px;cursor:pointer;background:${isTodayCell?'var(--acs)':isThisMonth?'var(--s2)':'var(--s1)'};border-radius:4px" onclick="_calDayOffset=Math.round((new Date('${_jsAttr(dStr)}')-new Date(new Date().toDateString()))/(86400000));_calView='day';renderCal()">
      <div style="font-size:11px;font-weight:${isTodayCell?700:400};color:${isTodayCell?'var(--ac)':isThisMonth?'var(--t1)':'var(--t3)'};margin-bottom:3px">${d.getDate()}</div>
      ${evDots}${moreCount}
    </div>`;
  }).join('');
  $('cal-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('calendar',22,'var(--page-accent)')}Calendar</h1><p style="font-size:12px;color:var(--t2)">${monthLabel}</p></div><div style="display:flex;gap:4px;align-items:center"><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calMonthOffset--;renderCal()" title="Previous month">‹</button><button class="btn btn-s" style="height:28px;font-size:11px" onclick="_calMonthOffset=0;renderCal()">Today</button><button class="btn btn-s" style="height:28px;width:28px;padding:0;font-size:14px" onclick="_calMonthOffset++;renderCal()" title="Next month">›</button>${_calAIMenu('cal-ai-month',[{label:'💬 NL Event',fn:'aiCalNLP()',c:'var(--ac)'},{label:'✨ Optimize',fn:'aiScheduleOptimize()',c:'var(--purp)'}])}<button class="btn btn-s" id="cal-sync-btn-month" style="height:28px;font-size:11px" onclick="syncCalendarO365(this)" title="Sync Office 365 calendar">☁ Sync O365</button><button class="btn btn-p" onclick="openNewCalEventModal()">+ Event</button></div></div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">
  ${dayNames.map(d=>`<div style="text-align:center;font-size:11px;font-weight:600;color:var(--t3);padding:4px 0">${d}</div>`).join('')}
  ${cellsHtml}
</div>`;
}

// ====== CALENDAR AI ======
function aiCalNLP(){
  const input=prompt('Describe the event in plain language:\n\nExamples:\n• "Lunch with Sarah next Tuesday at noon at Nobu"\n• "Team standup every Monday at 9am for 30 minutes"\n• "Doctor appointment Friday 3pm"');
  if(!input||!input.trim())return;
  toast('💬 Parsing event...');
  const text=input.toLowerCase();
  // Parse time
  let hour=9;
  const timeMatch=text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if(timeMatch){
    hour=parseInt(timeMatch[1]);
    if(timeMatch[3]==='pm'&&hour!==12)hour+=12;
    if(timeMatch[3]==='am'&&hour===12)hour=0;
  } else if(text.includes('noon')||text.includes('lunch'))hour=12;
  else if(text.includes('morning'))hour=9;
  else if(text.includes('afternoon'))hour=14;
  else if(text.includes('evening'))hour=18;
  // Parse date
  const today=new Date();
  let targetDate=_pd(today);
  if(text.includes('tomorrow'))targetDate.setDate(today.getDate()+1);
  else if(text.includes('monday'))targetDate.setDate(today.getDate()+(1-today.getDay()+7)%7||7);
  else if(text.includes('tuesday'))targetDate.setDate(today.getDate()+(2-today.getDay()+7)%7||7);
  else if(text.includes('wednesday'))targetDate.setDate(today.getDate()+(3-today.getDay()+7)%7||7);
  else if(text.includes('thursday'))targetDate.setDate(today.getDate()+(4-today.getDay()+7)%7||7);
  else if(text.includes('friday'))targetDate.setDate(today.getDate()+(5-today.getDay()+7)%7||7);
  else if(text.includes('saturday'))targetDate.setDate(today.getDate()+(6-today.getDay()+7)%7||7);
  else if(text.includes('sunday'))targetDate.setDate(today.getDate()+(0-today.getDay()+7)%7||7);
  const dateStr=_ymd(targetDate);
  // Parse duration
  let durationMins=60;
  const durMatch=text.match(/(\d+)\s*(hour|hr|minute|min)/);
  if(durMatch){
    const n=parseInt(durMatch[1]);
    durationMins=(durMatch[2].startsWith('h'))?n*60:n;
  } else if(text.includes('standup')||text.includes('sync'))durationMins=30;
  else if(text.includes('lunch')||text.includes('dinner'))durationMins=90;
  // Parse title — strip time/date words, use remaining
  let title=input.replace(/\b(next|this|at|on|for|every|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|noon|morning|afternoon|evening|\d{1,2}(am|pm)?|\d{1,2}:\d{2}|hour|hours|minute|minutes|min|mins|hr|hrs)\b/gi,'').replace(/\s+/g,' ').trim();
  if(!title)title='New Event';
  // Parse location — text after "at" that looks like a place
  let location='';
  const locMatch=input.match(/\bat\s+([A-Z][a-zA-Z\s]+?)(?:\s+(?:on|for|every|at|\d)|$)/i);
  if(locMatch&&!/\d/.test(locMatch[1]))location=locMatch[1].trim();
  const endHour=hour+Math.floor(durationMins/60);
  const startStr=`${hour.toString().padStart(2,'0')}:00`;
  const endStr=`${endHour.toString().padStart(2,'0')}:${(durationMins%60).toString().padStart(2,'0')}`;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">💬 Natural Language Event</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:12px">Parsed from: <em>${esc(input)}</em></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <div><div style="font-size:11px;color:var(--t3);margin-bottom:3px">Title</div><input id="nlp-title" class="inp" value="${esc(title)}" style="font-size:12px"></div>
    <div><div style="font-size:11px;color:var(--t3);margin-bottom:3px">Date</div><input id="nlp-date" class="inp" type="date" value="${dateStr}" style="font-size:12px"></div>
    <div><div style="font-size:11px;color:var(--t3);margin-bottom:3px">Start</div><input id="nlp-start" class="inp" value="${startStr}" style="font-size:12px"></div>
    <div><div style="font-size:11px;color:var(--t3);margin-bottom:3px">End</div><input id="nlp-end" class="inp" value="${endStr}" style="font-size:12px"></div>
    <div style="grid-column:1/-1"><div style="font-size:11px;color:var(--t3);margin-bottom:3px">Location</div><input id="nlp-loc" class="inp" value="${esc(location)}" style="font-size:12px" placeholder="Optional"></div>
  </div>
  <div style="display:flex;gap:8px">
  <button class="btn btn-p" onclick="(function(){
    const t=document.getElementById('nlp-title').value.trim();
    const d=document.getElementById('nlp-date').value;
    const s=document.getElementById('nlp-start').value;
    const e=document.getElementById('nlp-end').value;
    const l=document.getElementById('nlp-loc').value.trim();
    if(!t||!d){toast('Title and date required');return;}
    const h=parseInt(s.split(':')[0]);
    _calEvents.push({id:Date.now(),title:t,dateStr:d,hour:h,start:s,end:e,endHour:parseInt(e.split(':')[0]),location:l,color:'var(--ac)',desc:'Created via NL Event'});
    _calPersist();
    closeModal();renderCal();
    toast('✓ Event created: '+t);
  })()">Create Event</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiScheduleOptimize(){
  toast('✨ Analyzing your schedule...');
  const today=new Date();
  const weekStart=_pd(today);
  weekStart.setDate(today.getDate()-today.getDay()+1);
  const weekDates=Array.from({length:7},(_,i)=>{
    const d=_pd(weekStart);d.setDate(weekStart.getDate()+i);
    return _ymd(d);
  });
  const weekEvents=_calLocalBetween(weekDates[0],weekDates[6]);
  const suggestions=[];
  // Check for back-to-back meetings
  weekDates.forEach(dateStr=>{
    const dayEvs=weekEvents.filter(e=>e.dateStr===dateStr).sort((a,b)=>a.hour-b.hour);
    for(let i=0;i<dayEvs.length-1;i++){
      const a=dayEvs[i],b=dayEvs[i+1];
      if((a.endHour||a.hour+1)>=b.hour){
        suggestions.push(`🔴 Back-to-back: "${a.title}" and "${b.title}" on ${dateStr} — consider adding a 15-min buffer`);
      }
    }
    // Check for no deep work blocks
    const morningFree=dayEvs.filter(e=>e.hour>=9&&e.hour<=12).length===0;
    if(morningFree&&_pd(dateStr)>=today){
      suggestions.push(`🟢 ${dateStr}: Morning 9–12 is free — ideal for deep work block`);
    }
  });
  // Check for meeting-heavy days
  weekDates.forEach(dateStr=>{
    const count=weekEvents.filter(e=>e.dateStr===dateStr).length;
    if(count>=4)suggestions.push(`🟡 ${dateStr} has ${count} events — consider moving one to a lighter day`);
  });
  if(!suggestions.length){toast('✅ Schedule looks well-optimized this week!');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ Schedule Optimization</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">${suggestions.length} suggestion${suggestions.length!==1?'s':''} for this week:</div>
  <div style="max-height:300px;overflow-y:auto">${suggestions.map(s=>`<div style="padding:7px 10px;margin-bottom:5px;border-radius:6px;background:var(--s2);font-size:12px">${esc(s)}</div>`).join('')}</div>
  <button class="btn btn-p" style="margin-top:12px" onclick="closeModal()">Got it</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiMeetingPrepBrief(){
  // Find the next upcoming event
  const today=new Date();
  const todayStr=_ymd(today);
  const upcoming=_calLocalBetween(todayStr,_ymd(new Date(Date.now()+60*86400000))).filter(e=>!(e.dateStr===todayStr&&(Number(e.endHour)||0)<=new Date().getHours())).sort((a,b)=>a.dateStr.localeCompare(b.dateStr)||a.hour-b.hour);
  if(!upcoming.length){toast('No upcoming events found');return;}
  const ev=upcoming[0];
  // Find linked notes, tasks, contacts
  const evTitle=(ev.title||'').toLowerCase();
  const linkedNotes=D.notes.filter(n=>(n.title+' '+(n.body||'')).toLowerCase().includes(evTitle.split(' ')[0]));
  const linkedTasks=D.tasks.filter(t=>t.status!=='Done'&&(t.title+' '+(t.notes||'')).toLowerCase().includes(evTitle.split(' ')[0]));
  const linkedContacts=D.contacts?D.contacts.filter(c=>(c.name+' '+(c.company||'')).toLowerCase().split(' ').some(w=>w.length>3&&evTitle.includes(w))):[];
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📝 Meeting Prep Brief</h2>
  <div style="background:var(--acs);border:1px solid var(--ac);border-radius:6px;padding:8px 10px;margin-bottom:10px">
    <div style="font-size:13px;font-weight:600">${esc(ev.title)}</div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${ev.dateStr} at ${ev.start||ev.hour+':00'}${ev.location?' · '+esc(ev.location):''}</div>
    ${ev.desc?`<div style="font-size:11px;color:var(--t2);margin-top:4px">${esc(ev.desc)}</div>`:''}
  </div>
  ${linkedNotes.length?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:4px">RELATED NOTES (${linkedNotes.length})</div>${linkedNotes.slice(0,3).map(n=>`<div style="font-size:11px;padding:4px 8px;background:var(--s2);border-radius:4px;margin-bottom:3px;cursor:pointer" onclick="closeModal();showNoteInEditor(${_tidLit(n.id)})">${esc(n.title)}</div>`).join('')}</div>`:''}
  ${linkedTasks.length?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:4px">OPEN TASKS (${linkedTasks.length})</div>${linkedTasks.slice(0,3).map(t=>`<div style="font-size:11px;padding:4px 8px;background:var(--s2);border-radius:4px;margin-bottom:3px">${esc(t.title)} <span style="color:var(--t3)">· ${t.priority}</span></div>`).join('')}</div>`:''}
  ${linkedContacts.length?`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:4px">ATTENDEES</div>${linkedContacts.slice(0,4).map(c=>`<div style="font-size:11px;padding:4px 8px;background:var(--s2);border-radius:4px;margin-bottom:3px">${esc(c.name)} · ${esc(c.role||c.company||'')}</div>`).join('')}</div>`:''}
  ${!linkedNotes.length&&!linkedTasks.length&&!linkedContacts.length?'<div style="font-size:11px;color:var(--t3);padding:10px 0">No linked notes, tasks, or contacts found. Add notes or tasks mentioning this event to build a richer brief.</div>':''}
  <div style="display:flex;gap:8px;margin-top:8px">
  <button class="btn btn-p" onclick="closeModal()">Close</button>
  <button class="btn btn-s" onclick="closeModal();nav('notes');setTimeout(()=>openNewNote(),200)">+ Add Note</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiExtractActions(){
  // Look for today's journal entries and notes that mention meetings
  const todayStr=_ymd(new Date());
  const todayJournal=D.journal.filter(j=>j.date===todayStr);
  const todayNotes=D.notes.filter(n=>n.updatedAt&&n.updatedAt.startsWith(todayStr));
  const allText=[...todayJournal.map(j=>j.body||''),...todayNotes.map(n=>n.body||'')].join(' ');
  if(!allText.trim()){toast('No notes or journal entries found for today');return;}
  // Extract action items using heuristic patterns
  const actionPatterns=[/(?:action|todo|follow.?up|need to|will|should|must|assigned to|owner)[:\s]+([^.!?\n]{10,80})/gi,/[-•*]\s*([A-Z][^.!?\n]{10,70})/g,/(?:\d+\.\s*)([A-Z][^.!?\n]{10,70})/g];
  const actions=new Set();
  actionPatterns.forEach(re=>{
    let match;
    while((match=re.exec(allText))!==null){
      const a=match[1].trim();
      if(a.length>10&&a.length<100)actions.add(a);
    }
  });
  const actionList=[...actions].slice(0,8);
  if(!actionList.length){toast('No action items detected in today\'s notes');return;}
  const dueDate=new Date();dueDate.setDate(dueDate.getDate()+1);
  const dueDateStr=_ymd(dueDate);
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✓ Extract Action Items</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Found ${actionList.length} potential action item${actionList.length!==1?'s':''} in today's notes. Select to create tasks:</div>
  <div id="actions-list" style="max-height:260px;overflow-y:auto">${actionList.map((a,i)=>`<label style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;cursor:pointer;font-size:12px"><input type="checkbox" checked data-idx="${i}" style="accent-color:var(--ac);margin-top:2px"> ${esc(a)}</label>`).join('')}</div>
  <div style="display:flex;gap:8px;margin-top:12px">
  <button class="btn btn-p" onclick="(function(){
    const checks=document.querySelectorAll('#actions-list input:checked');
    if(!checks.length){toast('Select at least one action');return;}
    const titles=[...checks].map(c=>c.closest('label').textContent.trim());
    titles.forEach(title=>{
      D.tasks.push({id:Date.now()+Math.random(),title,priority:'Medium',due:'${_jsAttr(dueDateStr)}',status:'Not Started',context:'Admin',project:'',tags:['meeting-action'],notes:'Extracted from meeting notes',myDay:true,energy:'medium',subtasks:[],comments:[],createdBy:D.creds.userName||'Idris Grant'});
    });
    save('tasks');closeModal();
    toast('✓ '+titles.length+' action item'+( titles.length!==1?'s':'')+' added to Tasks!');
  })()">Create Tasks</button>
  <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

