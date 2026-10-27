// LevelUp client, file 6 of 7: Reports, Archive, My Day / Week / Year, Process (GTD), Focus, Ideas, journal export, Habits, Coach page.
// Plain classic script: its top-level functions and variables are globals shared with the other files, and it must load in the order of scripts/lib/bundles.mjs (index.html loader). Split out of app-part1.js in build -234.
// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS PAGE — full-featured dashboard with date ranges, charts, and PDF/Excel export
// ═══════════════════════════════════════════════════════════════════════════════
let _reportRange=localStorage.getItem('lu_report_range')||'30d';
let _reportSections=JSON.parse(localStorage.getItem('lu_report_sections')||'null')||{tasks:true,goals:true,habits:true,focus:true,journal:true,projects:true};
// Custom widgets attached to the currently-rendered report. Each widget is
// {id,title,source,filter,groupBy,metric,viz,color,sizeW?}. Persisted as
// part of the active saved report (D.prefs.savedReports[*].widgets).
let _reportWidgets=JSON.parse(localStorage.getItem('lu_report_widgets')||'null')||[];
function _saveReportWidgets(){try{localStorage.setItem('lu_report_widgets',JSON.stringify(_reportWidgets));}catch(_){}}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM REPORT WIDGET ENGINE — Phase 1
// Each widget is a tiny query: source → filter → groupBy → metric → viz.
// The same 5-slot model covers ~90% of useful report charts.
// ═══════════════════════════════════════════════════════════════════════════

// Built-in templates — picking one autofills the widget config so users have
// a working library on day one.
const WIDGET_TEMPLATES=[
  {id:'t-tasks-day',label:'📊 Tasks completed by day',w:{title:'Tasks Completed (by day)',source:'tasks',filter:{status:'Done'},groupBy:'day(completedAt)',metric:'count',viz:'bar',color:'#22c55e',sizeW:6}},
  {id:'t-tasks-line',label:'📈 Tasks completed (line)',w:{title:'Completion Trend',source:'tasks',filter:{status:'Done'},groupBy:'day(completedAt)',metric:'count',viz:'line',color:'#22c55e',sizeW:6}},
  {id:'t-tasks-pri',label:'🎯 Open tasks by priority',w:{title:'Open Tasks by Priority',source:'tasks',filter:{status_not:'Done'},groupBy:'priority',metric:'count',viz:'donut',color:'#3b82f6',sizeW:6}},
  {id:'t-tasks-status',label:'🥯 Tasks by status',w:{title:'Tasks by Status',source:'tasks',filter:{},groupBy:'status',metric:'count',viz:'donut',color:'#a855f7',sizeW:6}},
  {id:'t-tasks-proj',label:'📁 Open tasks by project',w:{title:'Open Tasks by Project',source:'tasks',filter:{status_not:'Done'},groupBy:'project',metric:'count',viz:'bar',color:'#06b6d4',sizeW:6}},
  {id:'t-overdue',label:'⚠ Overdue task count',w:{title:'Overdue Tasks',source:'tasks',filter:{overdue:true},groupBy:'_total',metric:'count',viz:'kpi',color:'#ef4444',sizeW:3}},
  {id:'t-top-open',label:'📋 Top open tasks (table)',w:{title:'Top Open Tasks',source:'tasks',filter:{status_not:'Done'},groupBy:'_rows',metric:'list',viz:'table',color:'#3b82f6',sizeW:12}},
  {id:'t-goals-prog',label:'🎯 Goals progress (progress bars)',w:{title:'Goals — current progress',source:'goals',filter:{},groupBy:'title',metric:'avg(pct)',viz:'progress',color:'#dc2626',sizeW:12}},
  {id:'t-habit-streaks',label:'🔥 Habit streaks',w:{title:'Habit Streaks',source:'habits',filter:{},groupBy:'title',metric:'sum(streak)',viz:'bar',color:'#10b981',sizeW:6}},
  {id:'t-journal-mood',label:'📓 Journal mood (avg)',w:{title:'Average Journal Mood',source:'journal',filter:{has_mood:true},groupBy:'_total',metric:'avg(mood)',viz:'kpi',color:'#f43f5e',sizeW:3}},
  {id:'t-journal-entries',label:'✏ Journal entries (heatmap)',w:{title:'Journal Activity',source:'journal',filter:{},groupBy:'day(date)',metric:'count',viz:'heatmap',color:'#f43f5e',sizeW:6}},
  {id:'t-focus-line',label:'⏱ Focus minutes (line)',w:{title:'Focus Minutes Trend',source:'focus',filter:{},groupBy:'day(date)',metric:'sum(mins)',viz:'line',color:'#a855f7',sizeW:6}},
  {id:'t-focus-spark',label:'⏱ Focus total (sparkline)',w:{title:'Focus This Period',source:'focus',filter:{},groupBy:'day(date)',metric:'sum(mins)',viz:'sparkline',color:'#a855f7',sizeW:6}},
  {id:'t-projects-status',label:'📁 Projects by status',w:{title:'Projects by Status',source:'projects',filter:{},groupBy:'status',metric:'count',viz:'donut',color:'#a855f7',sizeW:6}},
  {id:'t-ideas-stage',label:'💡 Ideas by stage',w:{title:'Ideas Pipeline',source:'ideas',filter:{},groupBy:'stage',metric:'count',viz:'donut',color:'#eab308',sizeW:6}},
  {id:'t-habits-heat',label:'🔥 Habit consistency (heatmap)',w:{title:'Daily Habit Activity',source:'habits',filter:{},groupBy:'_total',metric:'count',viz:'kpi',color:'#10b981',sizeW:3}},
  // ── Cross-source command-center widgets ────────────────────────────────────
  // These use the `allTasks` source (native + Smartsheet + Nifty) so a single
  // widget surfaces "what's on Idris's plate across CF + LSI + Personal".
  {id:'t-all-today-bar',label:'🎯 Today across CF / LSI / Personal',w:{title:'Today — by source',source:'allTasks',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'_sourceLabel',metric:'count',viz:'bar',color:'#3b82f6',sizeW:6}},
  {id:'t-all-by-pri',label:'🎯 All open work by priority',w:{title:'All Open Work — by Priority',source:'allTasks',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'priority',metric:'count',viz:'donut',color:'#3b82f6',sizeW:6}},
  {id:'t-all-overdue',label:'⚠ Overdue across all sources',w:{title:'Overdue — All Sources',source:'allTasks',filter:[{op:'overdue'}],groupBy:'_total',metric:'count',viz:'kpi',color:'#ef4444',sizeW:3}},
  {id:'t-all-table',label:'📋 All open work (table)',w:{title:'All Open Work',source:'allTasks',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'_rows',metric:'list',viz:'table',color:'#3b82f6',sizeW:12}},
  // ── External-only command-center widgets (Smartsheet + Nifty) ──────────────
  {id:'t-ext-by-source',label:'📊 External: CF vs LSI split',w:{title:'External Work — CF vs LSI',source:'external',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'sourceLabel',metric:'count',viz:'donut',color:'#1f6feb',sizeW:6}},
  {id:'t-ext-by-project',label:'📁 External: open by project',w:{title:'External Open — by Project',source:'external',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'project',metric:'count',viz:'bar',color:'#9333ea',sizeW:6}},
  {id:'t-ext-by-status',label:'🥯 External: by status',w:{title:'External — by Status',source:'external',filter:[],groupBy:'status',metric:'count',viz:'donut',color:'#06b6d4',sizeW:6}},
  {id:'t-ext-shipped-week',label:'🚀 External shipped (week)',w:{title:'External Shipped — by Week',source:'external',filter:[{field:'status',op:'eq',value:'Done'}],groupBy:'week(completedAt)',metric:'count',viz:'line',color:'#22c55e',sizeW:6,range:'90d'}},
  {id:'t-ext-overdue',label:'⚠ External overdue',w:{title:'External Overdue',source:'external',filter:[{op:'overdue'}],groupBy:'_total',metric:'count',viz:'kpi',color:'#ef4444',sizeW:3}},
  {id:'t-ext-assignee',label:'👤 External: by assignee',w:{title:'External Open — by Assignee',source:'external',filter:[{field:'status',op:'ne',value:'Done'}],groupBy:'assignee',metric:'count',viz:'bar',color:'#a855f7',sizeW:6}},
  {id:'t-ext-pending',label:'⬆ External pending push',w:{title:'Pending Push to Source',source:'external',filter:[{field:'hasPendingPush',op:'eq',value:true}],groupBy:'_total',metric:'count',viz:'kpi',color:'#f59e0b',sizeW:3}},
  // ── Time-entry widgets ─────────────────────────────────────────────────────
  {id:'t-time-day',label:'⏱ Time tracked by day',w:{title:'Time Tracked (by day)',source:'time',filter:[],groupBy:'day(date)',metric:'sum(mins)',viz:'bar',color:'#0ea5e9',sizeW:6,range:'30d'}},
  {id:'t-time-proj',label:'⏱ Time by project',w:{title:'Time by Project',source:'time',filter:[],groupBy:'project',metric:'sum(mins)',viz:'bar',color:'#06b6d4',sizeW:6,range:'30d'}},
  {id:'t-time-week-kpi',label:'⏱ Time this week (KPI)',w:{title:'Time This Week',source:'time',filter:[],groupBy:'_total',metric:'sum(mins)',viz:'kpi',color:'#06b6d4',sizeW:3,range:'7d'}},
  {id:'t-time-source',label:'⏱ Time by hat (Personal/CF/LSI)',w:{title:'Time by Hat',source:'time',filter:[],groupBy:'sourceLabel',metric:'sum(mins)',viz:'donut',color:'#0ea5e9',sizeW:6,range:'30d'}},
];

// Sensible default groupBy/metric/viz suggestions per source. Used by the
// editor when the user changes Source so the dependent slots don't get
// stuck on options that don't exist for the new source.
const SOURCE_DEFAULTS={
  tasks:    {groupBy:'status',metric:'count',viz:'donut'},
  habits:   {groupBy:'title',metric:'sum(streak)',viz:'bar'},
  goals:    {groupBy:'title',metric:'avg(pct)',viz:'progress'},
  journal:  {groupBy:'day(date)',metric:'count',viz:'bar'},
  projects: {groupBy:'status',metric:'count',viz:'donut'},
  ideas:    {groupBy:'stage',metric:'count',viz:'donut'},
  bookmarks:{groupBy:'_total',metric:'count',viz:'kpi'},
  focus:    {groupBy:'day(date)',metric:'sum(mins)',viz:'line'},
  allTasks: {groupBy:'_sourceLabel',metric:'count',viz:'bar'},
  external: {groupBy:'sourceLabel',metric:'count',viz:'donut'},
  time:     {groupBy:'day(date)',metric:'sum(mins)',viz:'bar'},
};
// Filter-builder field options per source.
const FILTER_FIELDS={
  tasks:['status','priority','project','context','assignedTo','energy','recurring','myDay'],
  habits:['cadence','category','createdBy'],
  goals:['category','status','createdBy'],
  journal:['mood','date','createdBy'],
  projects:['status','color'],
  ideas:['stage','idea_type'],
  bookmarks:['isFavorite','isRead'],
  focus:['date'],
  allTasks:['status','priority','project','_sourceLabel','assignee','myDay'],
  external:['status','priority','project','sourceLabel','source','assignee','myDay','hasPendingPush'],
  time:['project','source','sourceLabel'],
};
const FILTER_OPS=[
  {v:'eq',label:'is'},
  {v:'ne',label:'is not'},
  {v:'contains',label:'contains'},
  {v:'empty',label:'is empty'},
  {v:'notempty',label:'is not empty'},
  {v:'gt',label:'>'},
  {v:'lt',label:'<'},
  {v:'gte',label:'≥'},
  {v:'lte',label:'≤'},
];
// Normalise a filter into the array shape used by the visual builder.
function _normalizeFilter(filter){
  if(Array.isArray(filter))return filter.slice();
  const arr=[];
  for(const k of Object.keys(filter||{})){
    const v=filter[k];
    if(k==='overdue'&&v===true){arr.push({op:'overdue'});continue;}
    if(k==='has_mood'&&v===true){arr.push({op:'has_mood'});continue;}
    if(k.endsWith('_not')){arr.push({field:k.slice(0,-4),op:'ne',value:v});continue;}
    arr.push({field:k,op:'eq',value:v});
  }
  return arr;
}

// Data-source registry: which array on D, and what date field if any.
// 'arr' returns rows in a uniform shape so the rest of the engine doesn't
// need to know about the storage details.
const WIDGET_SOURCES={
  tasks:    {arr:()=>D.tasks||[],     dateField:'completedAt',label:'Tasks'},
  habits:   {arr:()=>D.habits||[],    dateField:null,         label:'Habits'},
  goals:    {arr:()=>D.goals||[],     dateField:'createdAt',  label:'Goals'},
  journal:  {arr:()=>D.journal||[],   dateField:'date',       label:'Journal'},
  projects: {arr:()=>D.projects||[],  dateField:null,         label:'Projects'},
  ideas:    {arr:()=>D.ideas||[],     dateField:'createdAt',  label:'Ideas'},
  bookmarks:{arr:()=>D.bookmarks||[], dateField:null,         label:'Bookmarks'},
  focus:    {arr:()=>{
    // Convert focusLog {date:mins} dict into a uniform row array.
    const fl=(D.prefs&&D.prefs.focusLog)||{};
    return Object.entries(fl).map(([date,mins])=>({date,mins:Number(mins)||0}));
  },dateField:'date',label:'Focus sessions'},
  // Cross-source: native tasks + external (Smartsheet/Nifty) tasks normalized
  // into the same shape so widgets like "Open across CF/LSI/Personal" work.
  // Each external row gets a virtual `project` = source label and `priority`
  // falls back to Medium so the standard groupBy=priority widgets still bucket
  // them. Tombstoned externals are skipped.
  allTasks: {arr:()=>{
    const local=(D.tasks||[]).map(t=>Object.assign({},t,{_source:'local',_sourceLabel:'Personal'}));
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    const ext=(Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>!(t.override&&t.override.tombstoned)).map(et=>{
      const ov=et.override||{};
      const done=isExtDone(et);
      return {
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title,
        // Normalised to 'Done' so existing widgets with filter:{status:'Done'}
        // also count external completions.
        status:done?'Done':(et.status||'Not Started'),
        priority:ov.localPriority||et.priority||'Medium',
        due:ov.localDue||et.due,
        startDate:et.startDate,
        // completedAt = LevelUp-side first-seen-as-done timestamp (or null
        // when still open). Drives "Tasks Completed (by day)" rollups.
        completedAt:done?(et.completedAt||et.fetchedAt||null):null,
        project:et.projectLabel||(et.source==='smartsheet'?'CF':'LSI'),
        assignee:et.assignee,
        myDay:!!ov.myDay,
        _source:et.source,
        _sourceLabel:et.source==='smartsheet'?'CF':'LSI',
      };
    });
    return local.concat(ext);
  },dateField:'completedAt',label:'All tasks (Personal + CF + LSI)'},
  // Time entries source — every completed timer in the last 90d. Normalised
  // so a widget can groupBy day/week/project/source and metric=sum(mins).
  // Joins to D.tasks for project + title; falls back to externalTasks for
  // CF/LSI entries.
  time: {arr:()=>{
    const rows=Array.isArray(D.timeEntries)?D.timeEntries:[];
    const projById=new Map((D.projects||[]).map(p=>[String(p.id),p]));
    const taskById=new Map((D.tasks||[]).map(t=>[String(t.id),t]));
    const extById=new Map();
    (D.externalTasks||[]).forEach(et=>{extById.set(et.externalId,et);});
    return rows.map(r=>{
      let project='';
      let title='';
      if(r.source==='local'){
        const t=taskById.get(String(r.taskId));
        if(t){
          title=t.title||'';
          const p=projById.get(String(t.projectId||''));
          project=p?p.name:(t.project||'');
        }
      }else{
        const et=extById.get(r.taskId);
        if(et){
          title=et.title||'';
          project=et.projectLabel||(r.source==='smartsheet'?'CF':'LSI');
        }
      }
      const startedAt=r.startedAt||r.createdAt||null;
      const date=startedAt?_dayOf(startedAt):'';
      return {
        id:r.id,
        taskId:r.taskId,
        title,
        project:project||'(no project)',
        source:r.source||'local',
        sourceLabel:r.source==='smartsheet'?'CF':r.source==='nifty'?'LSI':'Personal',
        mins:Number(r.durationMins)||0,
        note:r.note||'',
        date,                 // YYYY-MM-DD for groupBy day()
        startedAt,
        endedAt:r.endedAt||null,
      };
    });
  },dateField:'date',label:'Time entries (90d)'},

  // External-only source — Smartsheet + Nifty pulled tasks, normalised to the
  // same task-ish shape. Skips tombstoned rows. Use this when you want a
  // widget scoped purely to CF/LSI without native tasks diluting the bucket.
  external: {arr:()=>{
    const isExtDone=t=>{const s=(t.status||'').toLowerCase();return _isExtDone(s);};
    return (Array.isArray(D.externalTasks)?D.externalTasks:[]).filter(t=>!(t.override&&t.override.tombstoned)).map(et=>{
      const ov=et.override||{};
      const done=isExtDone(et);
      return {
        id:'ext:'+et.source+':'+et.externalId,
        title:et.title,
        status:done?'Done':(et.status||'Not Started'),
        rawStatus:et.status||'',
        priority:ov.localPriority||et.priority||'Medium',
        due:ov.localDue||et.due,
        startDate:et.startDate,
        completedAt:done?(et.completedAt||et.fetchedAt||null):null,
        project:et.projectLabel||(et.source==='smartsheet'?'CF':'LSI'),
        assignee:et.assignee||'(unassigned)',
        myDay:!!ov.myDay,
        source:et.source,                                          // 'smartsheet' | 'nifty'
        sourceLabel:et.source==='smartsheet'?'CF':'LSI',
        hasPendingPush:!!(ov.pendingStatus),
      };
    });
  },dateField:'completedAt',label:'External tasks (CF + LSI)'},
};

// Mood map (same as legacy reports)
const _MOOD_MAP={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};

// Apply a widget's filter against a row. Two shapes supported:
//   - Object map (legacy, Phase 1):
//       {<field>:<value>, <field>_not:<value>, overdue:true, has_mood:true}
//   - Array of condition objects (Phase 2, visual builder):
//       [{field,op,value}] where op ∈ eq|ne|gt|lt|gte|lte|contains|empty|notempty|overdue|has_mood
//   Multiple conditions are AND-ed.
function _widgetFilterRow(row,filter){
  if(Array.isArray(filter)){
    for(const cond of filter){
      if(!_evalCond(row,cond))return false;
    }
    return true;
  }
  for(const k of Object.keys(filter||{})){
    const v=filter[k];
    if(k==='overdue'&&v===true){
      const t=_ymd(new Date());
      if(!(row.status!=='Done'&&row.due&&row.due<t))return false;
    }else if(k==='has_mood'&&v===true){
      if(!row.mood||!_MOOD_MAP[row.mood])return false;
    }else if(k.endsWith('_not')){
      const f=k.slice(0,-4);
      if(row[f]===v)return false;
    }else{
      if(row[k]!==v)return false;
    }
  }
  return true;
}
function _evalCond(row,c){
  const op=c.op||'eq';
  const f=c.field;
  if(op==='overdue'){const t=_ymd(new Date());return row.status!=='Done'&&row.due&&row.due<t;}
  if(op==='has_mood'){return row.mood&&_MOOD_MAP[row.mood];}
  if(!f)return true;
  const lv=row[f];
  const rv=c.value;
  if(op==='empty')return lv===undefined||lv===null||lv===''||(Array.isArray(lv)&&!lv.length);
  if(op==='notempty')return !(lv===undefined||lv===null||lv===''||(Array.isArray(lv)&&!lv.length));
  if(op==='eq')return String(lv)===String(rv);
  if(op==='ne')return String(lv)!==String(rv);
  if(op==='contains'){
    if(Array.isArray(lv))return lv.includes(rv);
    return String(lv||'').toLowerCase().includes(String(rv||'').toLowerCase());
  }
  if(op==='gt')return Number(lv)>Number(rv);
  if(op==='lt')return Number(lv)<Number(rv);
  if(op==='gte')return Number(lv)>=Number(rv);
  if(op==='lte')return Number(lv)<=Number(rv);
  return true;
}

// Resolve a row's group key. Special keys:
//   _total           -> all rows in one bucket
//   _rows            -> no grouping; one row per record (table viz)
//   day(field)       -> ISO date prefix
//   week(field)      -> ISO week start (Mon)
//   month(field)     -> YYYY-MM
//   <field>          -> row[field]
function _widgetGroupKey(row,groupBy){
  if(groupBy==='_total')return 'Total';
  if(groupBy==='_rows')return null;
  const dm=String(groupBy).match(/^(day|week|month)\((\w+)\)$/);
  if(dm){
    const fname=dm[2];
    const raw=row[fname];if(!raw)return null;
    const d=_pd(raw);if(isNaN(d))return null;
    if(dm[1]==='day')return _ymd(d);
    if(dm[1]==='month')return _ymd(d).slice(0,7);
    // week (Mon start)
    const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);
    return _ymd(d)+'w';
  }
  return row[groupBy]||'(unset)';
}

// Compute a metric value for a bucket of rows.
function _widgetMetric(rows,metric){
  if(metric==='count')return rows.length;
  if(metric==='list')return rows;
  const sm=String(metric).match(/^(sum|avg)\((\w+)\)$/);
  if(sm){
    const fname=sm[2];
    const vals=rows.map(r=>{
      if(fname==='mood')return _MOOD_MAP[r.mood]||0;
      return Number(r[fname])||0;
    }).filter(v=>!isNaN(v));
    if(!vals.length)return 0;
    if(sm[1]==='sum')return vals.reduce((a,b)=>a+b,0);
    return vals.reduce((a,b)=>a+b,0)/vals.length;
  }
  return rows.length;
}

// Build {labels[], values[], rows{}} for a widget.
// The rows a widget counts: its filter, then its date range. The range used
// to apply only to day/week/month groupings, so a "Time this week" KPI summed
// 90 days and 30-day donuts were all-time. Now the range filters on the
// grouping's date field, else the source's dateField; a row with no date there
// (an open task has no completedAt) is kept — the range can't place it.
function _widgetRows(w){
  const src=WIDGET_SOURCES[w.source]||WIDGET_SOURCES.tasks;
  const effRange=w.range||_reportRange;
  let rows=src.arr().filter(r=>_widgetFilterRow(r,w.filter||{}));
  if(effRange==='all')return rows;
  const days={'7d':7,'30d':30,'90d':90,'365d':365}[effRange]||30;
  const st=new Date();st.setDate(st.getDate()-days);
  const startKey=_ymd(st),todayKey=_ymd(new Date());
  const dm=String(w.groupBy||'').match(/^(day|week|month)\((\w+)\)$/);
  const field=dm?dm[2]:src.dateField;
  if(!field)return rows;
  return rows.filter(r=>{const v=r[field];if(!v)return !dm;const d=_dayOf(v);return d>=startKey&&d<=todayKey;});
}
function _widgetData(w){
  const src=WIDGET_SOURCES[w.source]||WIDGET_SOURCES.tasks;
  // Resolve effective date range: per-widget override beats report-level.
  // Widget-level range is a string like '7d', '30d', '90d', '365d', 'all'.
  const effRange=w.range||_reportRange;
  const days={'7d':7,'30d':30,'90d':90,'365d':365,'all':9999}[effRange]||30;
  const _startDate=new Date();_startDate.setDate(_startDate.getDate()-days);
  const useRange=/^(day|week|month)\(/.test(w.groupBy);
  const startKey=_ymd(_startDate);
  const todayKey=_ymd(new Date());
  const dm=useRange&&String(w.groupBy).match(/^(\w+)\((\w+)\)$/);
  const rows=_widgetRows(w);
  void startKey;void todayKey;
  if(w.groupBy==='_rows'){
    return {rows,total:rows.length};
  }
  const buckets={};
  rows.forEach(r=>{const k=_widgetGroupKey(r,w.groupBy);if(k===null||k===undefined)return;(buckets[k]=buckets[k]||[]).push(r);});
  // Build day axis when applicable so we get continuous bars even on empty days
  let labels;
  if(useRange&&dm&&dm[1]==='day'){
    const axisDays=Math.min(days,180);
    labels=Array.from({length:axisDays},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(axisDays-1-i));return _ymd(d);});
  }else{
    labels=Object.keys(buckets).sort();
  }
  const values=labels.map(k=>_widgetMetric(buckets[k]||[],w.metric));
  return {labels,values,total:values.reduce((a,b)=>a+(Number(b)||0),0),rawBuckets:buckets};
}

// Render a single widget as HTML.
function _renderWidget(w,idx){
  const data=_widgetData(w);
  const color=w.color||'var(--ac)';
  let body='';
  if(w.viz==='kpi'){
    const val=w.groupBy==='_total'?_widgetMetric(_widgetRows(w),w.metric):data.total;
    const display=typeof val==='number'?(Number.isInteger(val)?val:val.toFixed(1)):String(val);
    body=`<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0"><div style="font-size:38px;font-weight:800;color:${color};line-height:1">${display}</div><div style="font-size:11px;color:var(--t3);font-weight:500">${esc(WIDGET_SOURCES[w.source].label)}</div></div>`;
  }else if(w.viz==='bar'){
    const max=Math.max(...data.values,1);
    body=`<div style="display:flex;align-items:flex-end;gap:3px;height:72px;padding:6px 0">${data.values.map((v,i)=>{const h=Math.max(2,Math.round(v/max*64));return `<div class="lu-bar-wrap" style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:4px;height:72px;justify-content:flex-end;position:relative"><div class="lu-bar" style="width:80%;background:linear-gradient(180deg,${color},color-mix(in srgb,${color} 35%,transparent));border-radius:3px 3px 0 0;height:${h}px"></div><div class="lu-bar-tip">${esc(data.labels[i]||'')}: ${typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(1)):v}</div></div>`;}).join('')}</div>`;
    if(data.total===0)body=`<div style="font-size:11px;color:var(--t3);text-align:center;padding:30px">No matching data in range</div>`;
  }else if(w.viz==='donut'){
    const total=data.values.reduce((a,b)=>a+(Number(b)||0),0)||1;
    let acc=0;
    const palette=[color,'#3b82f6','#a855f7','#22c55e','#f59e0b','#ef4444','#06b6d4','#ec4899'];
    const stops=data.labels.map((k,i)=>{const v=data.values[i]||0;const start=acc/total*100;acc+=v;const end=acc/total*100;return `${palette[i%palette.length]} ${start}% ${end}%`;}).join(',');
    body=`<div style="display:flex;gap:14px;align-items:center"><div class="lu-donut" style="background:conic-gradient(${stops});width:90px;height:90px;border-radius:50%;flex-shrink:0;mask:radial-gradient(circle,transparent 36%,#000 38%);-webkit-mask:radial-gradient(circle,transparent 36%,#000 38%)"></div><div style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:11px">${data.labels.map((k,i)=>`<div style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;background:${palette[i%palette.length]};border-radius:2px;flex-shrink:0"></span><span style="flex:1;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(k)}</span><strong>${data.values[i]}</strong></div>`).join('')||'<div style="color:var(--t3)">No data</div>'}</div></div>`;
  }else if(w.viz==='table'){
    const rows=(data.rows||[]).slice(0,10);
    if(w.source==='tasks'){
      body=`<table style="width:100%;font-size:11px;border-collapse:collapse"><thead><tr style="color:var(--t3);text-transform:uppercase;font-size:11px;letter-spacing:.05em"><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--bd1)">Title</th><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--bd1)">Priority</th><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--bd1)">Project</th><th style="text-align:left;padding:4px 6px;border-bottom:1px solid var(--bd1)">Due</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:4px 6px;border-bottom:1px solid var(--bd1)">${esc(r.title||'')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--bd1)"><span class="pill ${pillClass?pillClass(r.priority):''}">${esc(r.priority||'')}</span></td><td style="padding:4px 6px;border-bottom:1px solid var(--bd1);color:var(--t2)">${esc(r.project||'')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--bd1);color:var(--t2)">${esc(r.due||'')}</td></tr>`).join('')||'<tr><td colspan="4" style="padding:14px;text-align:center;color:var(--t3)">No matching rows</td></tr>'}</tbody></table>`;
    }else{
      body=`<table style="width:100%;font-size:11px"><tbody>${rows.map(r=>`<tr><td style="padding:4px 6px;border-bottom:1px solid var(--bd1)">${esc(r.title||r.name||'(unnamed)')}</td></tr>`).join('')||'<tr><td style="padding:14px;text-align:center;color:var(--t3)">No data</td></tr>'}</tbody></table>`;
    }
  }else if(w.viz==='line'){
    const vals=data.values.map(v=>Number(v)||0);
    const max=Math.max(...vals,1),min=Math.min(...vals,0);
    const range=Math.max(max-min,1);
    const W=420,H=80;
    const step=vals.length>1?W/(vals.length-1):0;
    const pts=vals.map((v,i)=>[i*step,H-((v-min)/range)*H]);
    const d=pts.length?'M '+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L '):'';
    const fill=pts.length?d+` L ${W} ${H} L 0 ${H} Z`:'';
    body=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:80px;overflow:visible">
      <path d="${fill}" fill="${color}" opacity=".18"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:600;stroke-dashoffset:600;animation:sparkDraw 1.1s ease forwards"/>
      ${pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${color}"><title>${esc(data.labels[i]||'')}: ${vals[i]}</title></circle>`).join('')}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-top:4px"><span>${esc(data.labels[0]||'')}</span><span>${esc(data.labels[data.labels.length-1]||'')}</span></div>`;
    if(data.total===0)body=`<div style="font-size:11px;color:var(--t3);text-align:center;padding:30px">No matching data in range</div>`;
  }else if(w.viz==='heatmap'){
    // Square grid coloured by intensity. Best for date-grouped data.
    const vals=data.values.map(v=>Number(v)||0);
    const max=Math.max(...vals,1);
    body=`<div style="display:flex;flex-wrap:wrap;gap:3px;padding:6px 0">${vals.map((v,i)=>{
      const intensity=v/max;
      const bgC=v===0?'var(--s3)':`color-mix(in srgb, ${color} ${Math.round(15+intensity*85)}%, transparent)`;
      return `<div style="width:14px;height:14px;border-radius:3px;background:${bgC}" title="${esc(data.labels[i]||'')}: ${v}"></div>`;
    }).join('')}</div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-top:6px"><span>Less</span><div style="display:flex;gap:3px">${[.15,.4,.65,.9].map(i=>`<div style="width:10px;height:10px;border-radius:2px;background:color-mix(in srgb,${color} ${i*100}%,transparent)"></div>`).join('')}</div><span>More</span></div>`;
  }else if(w.viz==='sparkline'){
    // Compact inline trendline with the total as a big number on the left.
    const vals=data.values.map(v=>Number(v)||0);
    const total=vals.reduce((a,b)=>a+b,0);
    body=`<div style="display:flex;align-items:center;gap:14px"><div style="font-size:30px;font-weight:800;color:${color};line-height:1">${total}</div><div style="flex:1">${_sparkline(vals.length?vals:[0,0],color,{width:200,height:40})}</div></div>`;
  }else if(w.viz==='progress'){
    // Horizontal progress bar(s). For _total / single value treats it as
    // percentage; for multi-bucket renders one bar per group.
    const vals=data.values.map(v=>Number(v)||0);
    const max=Math.max(...vals,100);
    body=`<div style="display:flex;flex-direction:column;gap:8px;padding:6px 0">${(data.labels.length?data.labels:['Value']).map((k,i)=>{const v=vals[i]||0;const pct=Math.max(0,Math.min(100,(v/max)*100));return `<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:var(--t1)">${esc(k)}</span><span style="color:var(--t3);font-variant-numeric:tabular-nums">${typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(1)):v}${w.metric==='avg(pct)'?'%':''}</span></div><div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden"><div style="height:100%;background:linear-gradient(90deg,${color},color-mix(in srgb,${color} 60%,#fff));width:${pct}%;border-radius:4px;transition:width .6s ease"></div></div></div>`;}).join('')||'<div style="font-size:11px;color:var(--t3);text-align:center;padding:14px">No matching data</div>'}</div>`;
  }else{
    body=`<div style="font-size:11px;color:var(--t3);padding:14px;text-align:center">Unsupported viz: ${esc(w.viz)}</div>`;
  }
  const span=Math.max(3,Math.min(12,Number(w.sizeW)||6));
  return `<div class="cd lu-widget" draggable="true" data-widget-idx="${idx}"
      ondragstart="_widgetDragStart(event,${idx})"
      ondragover="_widgetDragOver(event,${idx})"
      ondragleave="_widgetDragLeave(event)"
      ondrop="_widgetDrop(event,${idx})"
      ondragend="_widgetDragEnd(event)"
      style="grid-column:span ${span};padding:12px 14px;border-left:3px solid ${color};cursor:grab">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:6px">
      <div style="font-size:11px;font-weight:600;color:var(--t1);display:flex;align-items:center;gap:6px;min-width:0;flex:1">
        <span style="color:var(--t3);font-size:13px;line-height:1;cursor:grab" title="Drag to reorder">⋮⋮</span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.title||'Widget')}</span>
      </div>
      <div class="no-print" style="display:flex;gap:3px;flex-shrink:0">
        <div style="position:relative">
          <button class="btn btn-s" style="height:22px;font-size:11px;padding:0 6px" onclick="_toggleSizeMenu(${idx},event)" title="Resize">⤢ ${span}</button>
          <div id="lu-size-menu-${idx}" data-pop-menu="1" style="display:none;position:absolute;right:0;top:24px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:3px;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.4)">
            ${[3,4,6,8,12].map(n=>`<button class="btn btn-s" style="display:block;width:48px;height:22px;font-size:11px;background:${span===n?'var(--ac)':'transparent'};color:${span===n?'#fff':'var(--t1)'};border:none;margin:1px 0" onclick="setWidgetSize(${idx},${n})">${n} col</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-s" style="height:22px;font-size:11px" onclick="editReportWidget(${idx})" title="Edit">✏</button>
        <button class="btn btn-s" style="height:22px;font-size:11px" onclick="duplicateReportWidget(${idx})" title="Duplicate">⎘</button>
        <button class="btn btn-s" style="height:22px;font-size:11px;color:var(--page-accent)" onclick="pinWidgetToHome(${idx})" title="Pin to Home dashboard">📌</button>
        <button class="btn btn-d" style="height:22px;font-size:11px" onclick="deleteReportWidget(${idx})" title="Delete">✕</button>
      </div>
    </div>
    ${body}
  </div>`;
}
// Drag-and-drop reorder handlers — HTML5 native API. Keeps it dependency-free.
let _wDragFrom=-1;
function _widgetDragStart(e,idx){_wDragFrom=idx;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(idx));}catch(_){}e.currentTarget.style.opacity='.55';}
function _widgetDragOver(e,idx){if(_wDragFrom<0||_wDragFrom===idx)return;e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.style.outline='2px dashed var(--page-accent)';e.currentTarget.style.outlineOffset='-2px';}
function _widgetDragLeave(e){e.currentTarget.style.outline='';e.currentTarget.style.outlineOffset='';}
function _widgetDrop(e,idx){e.preventDefault();e.currentTarget.style.outline='';e.currentTarget.style.outlineOffset='';if(_wDragFrom<0||_wDragFrom===idx)return;const item=_reportWidgets.splice(_wDragFrom,1)[0];_reportWidgets.splice(idx,0,item);_wDragFrom=-1;_saveReportWidgets();renderReports();}
function _widgetDragEnd(e){e.currentTarget.style.opacity='';e.currentTarget.style.outline='';_wDragFrom=-1;}
function _toggleSizeMenu(idx,ev){ev&&ev.stopPropagation();const m=document.getElementById('lu-size-menu-'+idx);if(!m)return;document.querySelectorAll('[data-pop-menu="1"]').forEach(el=>{if(el!==m)el.style.display='none';});m.style.display=m.style.display==='block'?'none':'block';if(m.style.display==='block')setTimeout(()=>document.addEventListener('click',()=>{m.style.display='none';},{once:true}),0);}
function setWidgetSize(idx,n){const w=_reportWidgets[idx];if(!w)return;w.sizeW=Math.max(3,Math.min(12,Number(n)||6));_saveReportWidgets();renderReports();}

// Pin a widget to the Home page. Stored under D.prefs.homePinnedWidgets so it
// syncs across devices via the prefs blob, separate from saved reports.
function pinWidgetToHome(idx){
  const w=_reportWidgets[idx];if(!w)return;
  D.prefs.homePinnedWidgets=Array.isArray(D.prefs.homePinnedWidgets)?D.prefs.homePinnedWidgets:[];
  // Avoid dupes by id
  const exists=D.prefs.homePinnedWidgets.some(p=>p.id===w.id);
  if(exists){
    if(!confirm('This widget is already pinned to Home. Unpin it?'))return;
    D.prefs.homePinnedWidgets=D.prefs.homePinnedWidgets.filter(p=>p.id!==w.id);
    save('prefs');
    toast('Unpinned from Home');
    return;
  }
  D.prefs.homePinnedWidgets.push(JSON.parse(JSON.stringify(w)));
  save('prefs');
  toast({type:'success',title:'📌 Pinned to Home',msg:'See it on the Home dashboard.',actions:[{label:'Go to Home',primary:true,onClick:()=>nav('home')}],duration:5000});
}
function unpinHomeWidget(id){
  D.prefs.homePinnedWidgets=(D.prefs.homePinnedWidgets||[]).filter(p=>p.id!==id);
  save('prefs');
  if(typeof renderScreen==='function'&&curScreen==='home')renderScreen('home');
  toast('Unpinned from Home');
}
// Email the current report to the user. Renders a clean HTML version (the
// reports-main innerHTML with toolbars stripped) and ships it via the existing
// sendEmail server route. Works on demand; scheduled delivery just calls this
// at the right time on the user's next login.
async function emailCurrentReport(){
  const recipient=(D.creds&&D.creds.email)||'';
  if(!recipient){toast('Your account has no email on record');return;}
  if(!confirm(`Email this report to ${recipient}?`))return;
  toast({type:'info',title:'📧 Generating report…',duration:1800});
  // Clone the current reports-main, strip .no-print elements (matches the
  // existing PDF export behaviour) and wrap in a minimal HTML document.
  const node=document.getElementById('reports-main');
  if(!node){toast('Reports view not loaded — open Reports first.');return;}
  const clone=node.cloneNode(true);
  clone.querySelectorAll('.no-print, button').forEach(el=>el.remove());
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>LevelUp Report</title><style>
    body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#0b0f1a;color:#f8fafc;padding:24px;margin:0}
    .cd{background:#161d2e;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;margin-bottom:12px}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:0 0 10px}
    p{font-size:12px;color:#94a3b8;margin:0 0 6px}
    svg{max-width:100%}
  </style></head><body>${clone.innerHTML}</body></html>`;
  try{
    const ok=await _trpc('oauthSync.sendCustom',{to:recipient,subject:`LevelUp Report — ${new Date().toLocaleDateString()}`,html},'mutation').catch(()=>null);
    // Fallback: if no custom endpoint, just open a mailto: with the HTML in clipboard.
    if(!ok){
      try{await navigator.clipboard.writeText(html);}catch(_){}
      window.open(`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent('LevelUp Report — '+new Date().toLocaleDateString())}&body=${encodeURIComponent('Your report HTML is on the clipboard — paste it into the email body.')}`,'_blank');
      toast({type:'info',title:'📋 Report copied to clipboard',msg:'Paste it into the email that just opened.',duration:5500});
      return;
    }
    toast({type:'success',title:`📧 Sent to ${recipient}`,duration:3500});
  }catch(e){
    toast({type:'error',title:'Email failed',msg:String(e.message||e).slice(0,200),duration:5000});
  }
}

// AI-assisted widget builder: user types what they want, the LLM returns
// a JSON widget config that's validated and inserted.
function openAIWidgetBuilder(){
  const m=document.getElementById('modal-content');if(!m)return;
  m.innerHTML=`
    <h2 style="font-size:15px;font-weight:600;margin-bottom:6px">✨ AI Widget Builder</h2>
    <p style="font-size:11px;color:var(--t2);margin-bottom:10px">Describe what you want to see — the AI will pick the right source, group, metric, viz and filter for you.</p>
    <textarea id="aiwb-prompt" class="inp" style="min-height:80px;font-size:12px;line-height:1.5" placeholder="e.g. &quot;Overdue tasks by project from the last 30 days, as a donut&quot;&#10;&quot;Daily focus minutes this week as a line chart&quot;&#10;&quot;Top 10 open High-priority tasks as a table&quot;&#10;&quot;Habit streaks longer than 5 days&quot;"></textarea>
    <div id="aiwb-examples" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
      ${['Overdue tasks count','Tasks done last 7 days line chart','Goals progress as bars','Top 10 open tasks','Journal mood trend','Focus minutes heatmap','Ideas by stage donut','Habits completed today'].map(s=>`<button class="btn btn-s" style="height:22px;font-size:11px" onclick="document.getElementById('aiwb-prompt').value='${esc(s)}'">${esc(s)}</button>`).join('')}
    </div>
    <div id="aiwb-result" style="display:none;margin-top:10px;padding:10px;background:var(--s3);border-radius:6px;font-size:11px;font-family:ui-monospace,monospace;max-height:160px;overflow-y:auto"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" id="aiwb-go" onclick="_runAIWidgetBuilder()">✨ Generate</button>
    </div>`;
  document.getElementById('modal-capture').classList.add('show');
  setTimeout(()=>{const t=document.getElementById('aiwb-prompt');if(t)t.focus();},20);
}
async function _runAIWidgetBuilder(){
  const promptEl=document.getElementById('aiwb-prompt');
  const userText=(promptEl?.value||'').trim();
  if(!userText){toast('Describe what you want to see first');return;}
  const btn=document.getElementById('aiwb-go');
  const orig=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='⏳ Generating…';}
  // System prompt teaches the LLM the schema.
  const sysPrompt=`You build report widgets for a personal productivity app. Return ONLY a single JSON object matching this schema — no prose, no markdown fences.

Schema:
{
  "title": string,                            // short human-readable label
  "source": one of: tasks, habits, goals, journal, projects, ideas, bookmarks, focus, allTasks (= native tasks + Smartsheet/Nifty external — use when the user asks about "all my work" / "across companies" / "CF + LSI + personal")
  "groupBy": one of: _total, _rows, day(<dateField>), week(<dateField>), month(<dateField>), or a field name like status / priority / project / context / assignedTo / title / cadence / category / stage / idea_type / mood / name / color
  "metric": one of: count, list, sum(<field>), avg(<field>)
  "viz": one of: kpi, bar, line, donut, heatmap, sparkline, progress, table
  "filter": array of conditions [{field, op, value}] where op is one of: eq, ne, contains, empty, notempty, gt, lt, gte, lte, overdue (task-only), has_mood (journal-only)
  "color": hex string like "#22c55e"
  "sizeW": integer 3–12 (grid columns wide; 12 = full row)
  "range": optional string in 7d / 30d / 90d / 365d / all; omit to inherit report range
}

Tips: 'count' is the safest metric. For 'overdue tasks' use filter [{op:"overdue"}]. For dates use day(completedAt) for tasks, day(date) for journal/focus, day(createdAt) for goals/ideas. KPI is best for a single number. Donut for category breakdowns. Bar/line for time series. Heatmap for date-grouped activity. Table when the user asks for rows or a 'list'. Progress for goal/project completion.`;
  try{
    const {provider,configured}=_getAIConfig();
    const res=await _trpc('ai.assist',{
      systemPrompt:sysPrompt,
      userContent:userText,
      provider:provider||'manus',
    },'mutation');
    const text=String(res?.result||res?.text||'').trim();
    // Strip optional code fences the model may have added.
    const jsonText=text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    let w;try{w=JSON.parse(jsonText);}catch(e){throw new Error('Model returned invalid JSON. Raw response:\n'+text.slice(0,400));}
    // Light validation + defaults.
    if(!w||typeof w!=='object')throw new Error('Empty response from AI');
    w.title=String(w.title||'AI widget');
    w.source=WIDGET_SOURCES[w.source]?w.source:'tasks';
    w.groupBy=String(w.groupBy||'_total');
    w.metric=String(w.metric||'count');
    if(!['kpi','bar','line','donut','heatmap','sparkline','progress','table'].includes(w.viz))w.viz='bar';
    w.filter=Array.isArray(w.filter)?w.filter:[];
    w.color=/^#[0-9a-f]{3,8}$/i.test(w.color||'')?w.color:'#3b82f6';
    w.sizeW=Math.max(3,Math.min(12,Number(w.sizeW)||6));
    if(w.range&&!['7d','30d','90d','365d','all'].includes(w.range))delete w.range;
    w.id=Date.now();
    // Show the parsed config briefly so the user sees what's happening.
    const r=document.getElementById('aiwb-result');
    if(r){r.style.display='block';r.textContent=JSON.stringify(w,null,2);}
    _reportWidgets.push(w);_saveReportWidgets();closeModal();renderReports();
    toast({type:'success',title:'✨ Widget created',msg:'You can edit any slot via the ✏ button.',duration:3500});
  }catch(e){
    toast({type:'error',title:'AI widget builder failed',msg:String(e.message||e).slice(0,200),duration:5000});
    if(btn){btn.disabled=false;btn.textContent=orig||'✨ Generate';}
  }
}

// Widget lifecycle handlers
function addReportWidget(){_openWidgetEditor(null);}
function editReportWidget(idx){_openWidgetEditor(idx);}
function duplicateReportWidget(idx){
  const w=_reportWidgets[idx];if(!w)return;
  const copy=JSON.parse(JSON.stringify(w));copy.id=Date.now();copy.title=(w.title||'Widget')+' (copy)';
  _reportWidgets.splice(idx+1,0,copy);_saveReportWidgets();renderReports();
}
function moveReportWidget(idx,delta){
  const j=idx+delta;if(j<0||j>=_reportWidgets.length)return;
  const t=_reportWidgets[idx];_reportWidgets[idx]=_reportWidgets[j];_reportWidgets[j]=t;
  _saveReportWidgets();renderReports();
}
function deleteReportWidget(idx){
  const w=_reportWidgets[idx];if(!w)return;
  if(!confirm('Delete widget "'+(w.title||'')+'"?'))return;
  _reportWidgets.splice(idx,1);_saveReportWidgets();renderReports();
}
function applyWidgetTemplate(tid){
  const t=WIDGET_TEMPLATES.find(x=>x.id===tid);if(!t)return;
  const w=JSON.parse(JSON.stringify(t.w));w.id=Date.now();
  _reportWidgets.push(w);_saveReportWidgets();closeModal();renderReports();
  toast('✓ Added widget: '+w.title);
}
// In-memory editor scratch state — the modal mutates this, _saveWidgetFromEditor
// reads it back. Kept on window so inline onclicks can poke at it.
window._weDraft=null;
function _openWidgetEditor(idx){
  const base=idx==null?{id:Date.now(),title:'New widget',source:'tasks',filter:[],groupBy:'status',metric:'count',viz:'donut',color:'#3b82f6',sizeW:6,range:''}:JSON.parse(JSON.stringify(_reportWidgets[idx]));
  base.filter=_normalizeFilter(base.filter);
  if(!base.range)base.range='';
  window._weDraft=base;window._weIdx=idx;
  _renderWidgetEditor();
  document.getElementById('modal-capture').classList.add('show');
}
function _renderWidgetEditor(){
  const w=window._weDraft;if(!w)return;
  const isNew=window._weIdx==null;
  const m=document.getElementById('modal-content');if(!m)return;
  m.innerHTML=`
    <h2 style="font-size:15px;font-weight:600;margin-bottom:8px">${isNew?'+ Add Widget':'✏ Edit Widget'}</h2>
    ${isNew?`<div style="margin-bottom:14px;padding:10px;background:var(--s3);border-radius:8px">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:6px">📚 Start from a template</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;max-height:160px;overflow-y:auto">
        ${WIDGET_TEMPLATES.map(t=>`<button class="btn btn-s" style="height:auto;padding:6px 10px;font-size:11px;text-align:left;justify-content:flex-start" onclick="applyWidgetTemplate('${t.id}')">${esc(t.label)}</button>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--t3);text-align:center;margin-top:8px">— or configure manually below —</div>
    </div>`:''}
    <div style="display:grid;grid-template-columns:1fr 100px;gap:10px;margin-bottom:8px">
      <div class="field"><label>Title</label><input class="inp" id="wf-title" value="${esc(w.title||'')}" oninput="window._weDraft.title=this.value"></div>
      <div class="field"><label>Color</label><input class="inp" type="color" id="wf-color" value="${esc(w.color||'#3b82f6')}" style="height:32px;padding:2px" oninput="window._weDraft.color=this.value"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:8px">
      <div class="field"><label>Source</label><select class="inp" id="wf-source" onchange="_weChangeSource(this.value)">
        ${Object.entries(WIDGET_SOURCES).map(([k,v])=>`<option value="${k}" ${w.source===k?'selected':''}>${esc(v.label)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Group By</label><select class="inp" id="wf-groupby" onchange="window._weDraft.groupBy=this.value">
        ${_groupByOptions(w.source).map(([k,l])=>`<option value="${k}" ${w.groupBy===k?'selected':''}>${esc(l)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Metric</label><select class="inp" id="wf-metric" onchange="window._weDraft.metric=this.value">
        ${_metricOptions(w.source).map(([k,l])=>`<option value="${k}" ${w.metric===k?'selected':''}>${esc(l)}</option>`).join('')}
      </select></div>
    </div>
    <div style="display:grid;grid-template-columns:1.6fr 1.4fr 100px;gap:10px;margin-bottom:8px">
      <div class="field"><label>Visualisation</label><select class="inp" id="wf-viz" onchange="window._weDraft.viz=this.value">
        ${[['kpi','KPI tile'],['bar','Bar chart'],['line','Line chart'],['donut','Donut'],['heatmap','Heatmap'],['sparkline','Sparkline + total'],['progress','Progress bars'],['table','Table']].map(([k,l])=>`<option value="${k}" ${w.viz===k?'selected':''}>${esc(l)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Date Range <span style="font-size:11px;color:var(--t3)">overrides report range</span></label><select class="inp" id="wf-range" onchange="window._weDraft.range=this.value">
        ${[['','Use report range'],['7d','Last 7 days'],['30d','Last 30 days'],['90d','Last 90 days'],['365d','Last year'],['all','All time']].map(([k,l])=>`<option value="${k}" ${(w.range||'')===k?'selected':''}>${esc(l)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Width (3–12)</label><input type="number" class="inp" id="wf-size" min="3" max="12" value="${w.sizeW||6}" oninput="window._weDraft.sizeW=Math.max(3,Math.min(12,Number(this.value)||6))"></div>
    </div>
    <div style="margin-bottom:10px;padding:10px;background:var(--s3);border-radius:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:11px;font-weight:600;color:var(--t2)">🔎 Filter (all conditions must match)</div>
        <button class="btn btn-s" style="height:22px;font-size:11px" onclick="_weAddFilterRow()">+ Add condition</button>
      </div>
      <div id="we-filter-rows" style="display:flex;flex-direction:column;gap:4px">${_weRenderFilterRows()}</div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-p" onclick="_saveWidgetFromEditor()">💾 Save Widget</button>
    </div>`;
}
function _groupByOptions(src){
  const common=[['_total','Single total'],['_rows','One row each (table)']];
  const date=[
    ...(src==='tasks'?[['day(completedAt)','Day (completed)'],['day(createdAt)','Day (created)'],['week(completedAt)','Week (completed)'],['month(completedAt)','Month (completed)']]:[]),
    ...(src==='journal'?[['day(date)','Day'],['week(date)','Week'],['month(date)','Month']]:[]),
    ...(src==='goals'?[['day(createdAt)','Day (created)']]:[]),
    ...(src==='ideas'?[['day(createdAt)','Day (created)']]:[]),
    ...(src==='focus'?[['day(date)','Day'],['week(date)','Week'],['month(date)','Month']]:[]),
    ...(src==='allTasks'||src==='external'?[['day(completedAt)','Day (completed)'],['week(completedAt)','Week (completed)'],['month(completedAt)','Month (completed)']]:[]),
    ...(src==='time'?[['day(date)','Day'],['week(date)','Week'],['month(date)','Month']]:[]),
  ];
  const fields={
    tasks:[['status','Status'],['priority','Priority'],['project','Project'],['context','Context'],['assignedTo','Assignee'],['title','Title']],
    habits:[['title','Habit name'],['cadence','Cadence'],['category','Category']],
    goals:[['title','Title'],['category','Category'],['status','Status']],
    journal:[['mood','Mood']],
    projects:[['status','Status'],['name','Name']],
    ideas:[['stage','Stage'],['idea_type','Type']],
    bookmarks:[['source','Source']],
    focus:[],
    allTasks:[
      ['_sourceLabel','Source (Personal/CF/LSI)'],
      ['status','Status'],['priority','Priority'],['project','Project'],['assignee','Assignee'],
    ],
    external:[
      ['sourceLabel','Source (CF/LSI)'],
      ['source','Source key'],
      ['status','Status'],['priority','Priority'],['project','Project'],['assignee','Assignee'],
    ],
    time:[
      ['project','Project'],
      ['sourceLabel','Source (Personal/CF/LSI)'],
      ['source','Source key'],
    ],
  }[src]||[];
  return [...common,...date,...fields];
}
function _metricOptions(src){
  const base=[['count','Count'],['list','List rows']];
  const extras={
    tasks:[['sum(estimatedMins)','Sum of estimatedMins'],['sum(timeSpent)','Sum of timeSpent']],
    habits:[['sum(streak)','Sum of streak'],['avg(streak)','Avg streak']],
    goals:[['avg(pct)','Avg progress %'],['sum(pct)','Sum of pct']],
    journal:[['avg(mood)','Avg mood (1–5)']],
    projects:[['avg(pct)','Avg pct']],
    ideas:[['avg(ice_impact)','Avg ICE impact'],['avg(ice_confidence)','Avg ICE confidence'],['avg(ice_ease)','Avg ICE ease']],
    focus:[['sum(mins)','Sum of minutes'],['avg(mins)','Avg minutes/day']],
    time:[['sum(mins)','Sum of minutes'],['avg(mins)','Avg minutes/entry']],
  }[src]||[];
  return [...base,...extras];
}
function _weChangeSource(src){
  const w=window._weDraft;w.source=src;
  // Reset filter (field names are source-specific)
  w.filter=[];
  // Reset groupBy/metric/viz to sensible defaults
  const d=SOURCE_DEFAULTS[src]||{};
  w.groupBy=d.groupBy||'_total';
  w.metric=d.metric||'count';
  w.viz=d.viz||'kpi';
  _renderWidgetEditor();
}
function _weRenderFilterRows(){
  const w=window._weDraft;
  const fields=FILTER_FIELDS[w.source]||[];
  if(!w.filter.length)return '<div style="font-size:11px;color:var(--t3);font-style:italic">No filters — all rows from this source are included.</div>';
  return w.filter.map((c,i)=>{
    const needsValue=!['empty','notempty','overdue','has_mood'].includes(c.op||'eq');
    const isSpecial=c.op==='overdue'||c.op==='has_mood';
    return `<div style="display:grid;grid-template-columns:${isSpecial?'1fr 28px':'1.2fr 1fr 1.4fr 28px'};gap:4px;align-items:center">
      ${isSpecial?`<div style="font-size:11px;padding:5px 8px;background:var(--s2);border-radius:5px;color:var(--t1)">${c.op==='overdue'?'⚠ Task is overdue':'📓 Has a mood'}</div>`
        :`<select class="inp" style="height:26px;font-size:11px" onchange="window._weDraft.filter[${i}].field=this.value">
          <option value="">— field —</option>
          ${fields.map(f=>`<option value="${esc(f)}" ${c.field===f?'selected':''}>${esc(f)}</option>`).join('')}
        </select>
        <select class="inp" style="height:26px;font-size:11px" onchange="window._weDraft.filter[${i}].op=this.value;_renderWidgetEditor()">
          ${FILTER_OPS.map(o=>`<option value="${o.v}" ${(c.op||'eq')===o.v?'selected':''}>${esc(o.label)}</option>`).join('')}
        </select>
        ${needsValue?`<input class="inp" style="height:26px;font-size:11px" value="${esc(c.value==null?'':c.value)}" placeholder="value" oninput="window._weDraft.filter[${i}].value=this.value">`:'<div></div>'}`}
      <button class="btn btn-d" style="height:22px;font-size:11px" onclick="_weDelFilter(${i})">✕</button>
    </div>`;
  }).join('');
}
function _weAddFilterRow(){
  const w=window._weDraft;w.filter.push({field:'',op:'eq',value:''});
  _renderWidgetEditor();
}
function _weDelFilter(i){window._weDraft.filter.splice(i,1);_renderWidgetEditor();}
function _saveWidgetFromEditor(){
  const w=window._weDraft;if(!w){closeModal();return;}
  // Drop empty filter conditions
  w.filter=(w.filter||[]).filter(c=>(c.op==='overdue'||c.op==='has_mood')||(c.field&&(['empty','notempty'].includes(c.op)||c.value!=='')));
  const idx=window._weIdx;
  if(idx==null)_reportWidgets.push(w);else _reportWidgets[idx]=w;
  _saveReportWidgets();closeModal();renderReports();
  toast('✓ Widget saved');
}
// Saved custom reports — each entry: {id,name,emoji,range,sections,createdAt}
// Stored in D.prefs.savedReports so they sync across devices via the prefs blob.
function _getSavedReports(){return (D.prefs&&Array.isArray(D.prefs.savedReports))?D.prefs.savedReports:[];}
function _setSavedReports(arr){D.prefs=D.prefs||{};D.prefs.savedReports=arr;save('prefs');}
function loadSavedReport(id){
  const r=_getSavedReports().find(x=>x.id===id);if(!r)return;
  _reportRange=r.range||'30d';
  _reportSections=Object.assign({tasks:true,goals:true,habits:true,focus:true,journal:true,projects:true},r.sections||{});
  _reportWidgets=Array.isArray(r.widgets)?JSON.parse(JSON.stringify(r.widgets)):[];
  localStorage.setItem('lu_report_range',_reportRange);
  localStorage.setItem('lu_report_sections',JSON.stringify(_reportSections));
  _saveReportWidgets();
  renderReports();
  toast('📊 Loaded: '+r.name);
}
function saveCurrentReport(){
  const name=prompt('Name this report (e.g. "Weekly Standup", "Q3 Performance Review")','');
  if(!name||!name.trim())return;
  const emoji=prompt('Pick an emoji icon (1-2 chars, optional)','📊')||'📊';
  const arr=_getSavedReports();
  arr.push({
    id:Date.now(),
    name:name.trim(),
    emoji:emoji.trim().slice(0,4)||'📊',
    range:_reportRange,
    sections:Object.assign({},_reportSections),
    widgets:JSON.parse(JSON.stringify(_reportWidgets)),
    createdAt:new Date().toISOString(),
  });
  _setSavedReports(arr);
  renderReports();
  toast('✓ Report saved');
}
function deleteSavedReport(id){
  const r=_getSavedReports().find(x=>x.id===id);if(!r)return;
  if(!confirm('Delete saved report "'+r.name+'"?'))return;
  _setSavedReports(_getSavedReports().filter(x=>x.id!==id));
  renderReports();
  toast('Report deleted');
}
function renameSavedReport(id){
  const r=_getSavedReports().find(x=>x.id===id);if(!r)return;
  const name=prompt('Rename report:',r.name);
  if(!name||!name.trim())return;
  r.name=name.trim();
  _setSavedReports(_getSavedReports());
  renderReports();
}
// ── Report assignment + sharing (multi-assignee + Primary Responsible) ────
function _openReportAssign(id){
  const r=_getSavedReports().find(x=>String(x.id)===String(id)); if(!r){toast('Report not found');return;}
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  modal.innerHTML=`<div style="padding:16px;max-width:480px">
    <h2 style="font-size:14px;font-weight:600;margin-bottom:4px">👥 Assign Report</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:10px">${esc((r.emoji||'📊')+' '+(r.name||'Untitled'))}</div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('rep-assign-ma',r)}</div>
    <div class="dr-actions" style="margin-top:14px">
      <button class="btn btn-p" onclick="_saveReportAssign('${String(id)}')">Save</button>
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
  </div>`;
  bg.classList.add('show');
}
function _saveReportAssign(id){
  const arr=_getSavedReports(); const r=arr.find(x=>String(x.id)===String(id)); if(!r)return;
  if(typeof _maGet==='function'){ const ma=_maGet('rep-assign-ma'); r.assignees=ma.assignees; r.assigneeNames=ma.assigneeNames; r.primaryAssigneeId=ma.primaryAssigneeId; const pi=ma.assignees.indexOf(ma.primaryAssigneeId); r.assignedTo=pi>=0?ma.assigneeNames[pi]:''; }
  _setSavedReports(arr);
  document.getElementById('modal-capture').classList.remove('show');
  toast({type:'success',title:'Assigned',msg:r.assignedTo?('Primary: '+r.assignedTo):'Assignees updated.',duration:1800});
  if(typeof renderReports==='function')renderReports();
}
async function _loadSharedReports(){
  try{ if(typeof _trpc!=='function')return; const res=await _trpc('appData.sharedReportsForMe',undefined,'query');
    if(res&&res.ok&&Array.isArray(res.reports)){ D._sharedReports=res.reports.map((p,i)=>({...p,_idx:i})); if(typeof curScreen!=='undefined'&&curScreen==='reports'&&typeof renderReports==='function')renderReports(); }
  }catch(e){ /* non-fatal */ }
}
function _renderSharedReportsSection(){
  const shared=Array.isArray(D._sharedReports)?D._sharedReports:[];
  if(!shared.length)return '';
  const open=!(D.prefs&&D.prefs.sharedReportSectionCollapsed);
  return `<div class="cd no-print" style="border-left:3px solid var(--purp);margin-bottom:14px">
    <div onclick="_toggleSharedReportSection()" style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;${open?'margin-bottom:8px':''}">
      <span style="display:inline-block;font-size:11px;${open?'':'transform:rotate(-90deg)'}">▾</span>
      <span style="font-size:12px;font-weight:600;color:var(--purp)">Shared &amp; delegated reports</span>
      <span style="font-size:11px;font-weight:600;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:1px 7px;border-radius:8px">${shared.length}</span>
      <span style="flex:1"></span><span style="font-size:11px;color:var(--t3)">click to edit · assigned to/by you</span>
    </div>
    ${open?shared.map(_sharedReportCard).join(''):''}
  </div>`;
}
function _toggleSharedReportSection(){ D.prefs=D.prefs||{}; D.prefs.sharedReportSectionCollapsed=!D.prefs.sharedReportSectionCollapsed; try{save('prefs');}catch(_){} if(typeof renderReports==='function')renderReports(); }
function _sharedReportCard(p){
  const delegated=!!p._delegated;
  const who=delegated?(p._assigneeName||'someone'):_userNameById(p._sharedFromUserId);
  const badge=delegated?'DELEGATED':'SHARED';
  const sub=delegated?('assigned to '+esc(who)):('from '+esc(who));
  return `<div onclick="_openSharedReportView(${Number(p._idx)||0})" style="background:var(--s2);border:1px solid var(--bd1);border-left:3px solid var(--purp);border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer" title="Shared report — click to edit">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:9px;font-weight:700;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px;flex-shrink:0">${badge}</span>
      <span style="font-size:13px;font-weight:600;color:var(--t1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((p.emoji||'📊')+' '+(p.name||'Untitled'))}</span>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">${(p.widgets||[]).length} widget${(p.widgets||[]).length===1?'':'s'} · ${sub}</div>
  </div>`;
}
async function _openSharedReportView(idx){
  let p=(D._sharedReports||[])[idx];
  if(!p&&typeof _loadSharedReports==='function'){ await _loadSharedReports(); p=(D._sharedReports||[])[idx]; }
  if(!p){toast('Shared report not found — try refreshing.');return;}
  const from=p._delegated?'you':_userNameById(p._sharedFromUserId);
  const modal=document.getElementById('modal-content'); const bg=document.getElementById('modal-capture');
  if(!modal||!bg){toast('Editor not available');return;}
  const adminSh=['admin','owner'].includes(String((D.creds&&D.creds.role)||'').toLowerCase());
  modal.innerHTML=`<div style="padding:16px;max-width:480px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--purp);background:color-mix(in srgb,var(--purp) 14%,transparent);padding:2px 6px;border-radius:6px">${p._delegated?'DELEGATED':'SHARED'} · EDITABLE</span>
      <span style="font-size:11px;color:var(--t3)">${p._delegated?('assigned to '+esc(p._assigneeName||'someone')):('owned by '+esc(from))}</span>
    </div>
    <div class="field"><label>Name</label><input class="inp" id="srp-name" value="${esc(p.name||'')}"></div>
    <div class="field"><label>Assignees <span style="font-size:11px;color:var(--t3);font-weight:400">★ = Primary Responsible</span></label>${buildMultiAssignee('srp-ma',p)}</div>
    <div class="dr-actions" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="_saveSharedReport(${Number(idx)||0})">Save</button>
      ${adminSh&&!p._delegated?`<button class="btn btn-s" style="border-color:var(--ac);color:var(--ac)" onclick="_takeReportOwnership(${Number(idx)||0})" title="Move this report into your workspace; the current owner stays an assignee">⬇ Take ownership</button>`:''}
      ${adminSh?`<button class="btn btn-d" onclick="_deleteSharedReportItem(${Number(idx)||0})">Delete</button>`:''}
      <button class="btn btn-s" onclick="document.getElementById('modal-capture').classList.remove('show')">Cancel</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${adminSh?'Admin: edit, reassign, take ownership &amp; delete — the report config stays with the owner.':'Saved to the report owner.'}</div>
  </div>`;
  bg.classList.add('show');
}
async function _saveSharedReport(idx){
  const p=(D._sharedReports||[])[idx]; if(!p){toast('Could not save — refresh and try again.');return;}
  const ownerUserId=Number(p._sharedFromUserId)||0; const reportId=String(p.id);
  const g=id=>document.getElementById(id);
  const patch={ name:(g('srp-name')?.value||'').trim() };
  if(typeof _maGet==='function'){ const ma=_maGet('srp-ma'); patch.assignees=ma.assignees; patch.assigneeNames=ma.assigneeNames; patch.primaryAssigneeId=ma.primaryAssigneeId; }
  try{
    const res=await _trpc('appData.updateSharedReport',{ownerUserId,reportId,patch},'mutation');
    if(res&&res.ok){
      Object.assign(p,patch);
      toast({type:'success',title:'Saved',msg:'Changes saved to the report owner.',duration:2200});
      document.getElementById('modal-capture').classList.remove('show');
      if(typeof _loadSharedReports==='function')_loadSharedReports();
      else if(typeof renderReports==='function')renderReports();
    }else{ toast({type:'error',title:'Could not save',msg:(res&&res.error)||'Try again.'}); }
  }catch(e){ toast({type:'error',title:'Could not save',msg:String(e&&e.message||e)}); }
}
async function _takeReportOwnership(idx){
  const it=(D._sharedReports||[])[idx]; if(!it){toast('Item not loaded — refresh and try again.');return;}
  const ownerUserId=Number(it._sharedFromUserId)||0; const reportId=String(it.id);
  if(!confirm('Take ownership of this report?\n\nIt moves into your workspace and you become the owner. The current owner stays on as an assignee.'))return;
  try{
    const res=await _trpc('appData.transferReportOwnership',{ownerUserId,reportId},'mutation');
    if(res&&res.ok){
      toast({type:'success',title:'Ownership taken',msg:'This report is now in your workspace.',duration:2600});
      try{document.getElementById('modal-capture').classList.remove('show');}catch(_){}
      if(typeof loadServerData==='function')loadServerData();
      if(typeof _loadSharedReports==='function')_loadSharedReports();
      if(typeof renderReports==='function'&&typeof curScreen!=='undefined'&&curScreen==='reports')renderReports();
    }else{ toast({type:'error',title:'Could not take ownership',msg:(res&&res.error)||'Try again.'}); }
  }catch(e){ toast({type:'error',title:'Failed',msg:String(e&&e.message||e)}); }
}
async function _deleteSharedReportItem(idx){
  const it=(D._sharedReports||[])[idx]; if(!it){toast('Item not loaded — refresh and try again.');return;}
  if(!confirm('Delete report "'+(it.name||'this report')+'" from the owner’s workspace? This can’t be undone.'))return;
  const ownerUserId=Number(it._sharedFromUserId)||0; const reportId=String(it.id);
  try{
    const res=await _trpc('appData.deleteSharedReport',{ownerUserId,reportId},'mutation');
    if(res&&res.ok){ D._sharedReports=(D._sharedReports||[]).filter((_,i)=>i!==idx); toast({type:'success',title:'Deleted',duration:1800}); document.getElementById('modal-capture')?.classList.remove('show'); if(typeof _loadSharedReports==='function')_loadSharedReports(); else if(typeof renderReports==='function')renderReports(); }
    else toast({type:'error',title:'Could not delete',msg:(res&&res.error)||'Try again.'});
  }catch(e){ toast({type:'error',title:'Failed',msg:String(e&&e.message||e)}); }
}
// Schedule email delivery for a saved report. Stored on the report itself
// as r.schedule = {frequency:'off'|'daily'|'weekly'|'monthly', time:'08:00',
// dow:0..6 (for weekly), dom:1..28 (for monthly), lastSentISO?:string}.
// Delivery: the hourly server cron (server/_core/scheduledReports.ts), plus
// this tab's catch-up on login / Reports open — one claim per period in the
// server's send ledger decides which of them sends.
function openReportSchedule(id){
  const r=_getSavedReports().find(x=>x.id===id);if(!r)return;
  const s=r.schedule||{frequency:'off',time:'08:00',dow:1,dom:1};
  const m=document.getElementById('modal-content');if(!m)return;
  m.innerHTML=`
    <h2 style="font-size:15px;font-weight:600;margin-bottom:4px">⏰ Schedule: ${esc(r.name)}</h2>
    <p style="font-size:11px;color:var(--t3);margin-bottom:12px">Email this report to <strong>${esc(D.creds.email||'your account')}</strong> automatically.
      <br>Sent at the scheduled time on your clock (time zone: Settings → AI Coach), even when LevelUp is closed; if LevelUp is open then, you get the full report with charts. Never twice.</p>
    <div class="field" style="margin-bottom:10px"><label>Frequency</label>
      <select class="inp" id="rs-freq" onchange="_rsToggle()">
        ${[['off','Off (manual only)'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l])=>`<option value="${v}" ${s.frequency===v?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="field"><label>Send at (24h)</label><input type="time" class="inp" id="rs-time" value="${esc(s.time||'08:00')}"></div>
      <div class="field" id="rs-dow-wrap"><label>Day of week</label><select class="inp" id="rs-dow">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<option value="${i}" ${Number(s.dow)===i?'selected':''}>${d}</option>`).join('')}
      </select></div>
      <div class="field" id="rs-dom-wrap" style="display:none"><label>Day of month</label><input type="number" class="inp" id="rs-dom" min="1" max="28" value="${s.dom||1}"></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-s" onclick="closeModal()">Cancel</button>
      <button class="btn btn-d" onclick="_saveSchedule(${id},'off')">Disable</button>
      <button class="btn btn-p" onclick="_saveSchedule(${id})">💾 Save Schedule</button>
    </div>`;
  document.getElementById('modal-capture').classList.add('show');
  setTimeout(_rsToggle,0);
}
function _rsToggle(){
  const f=document.getElementById('rs-freq')?.value||'off';
  const dowWrap=document.getElementById('rs-dow-wrap');
  const domWrap=document.getElementById('rs-dom-wrap');
  if(dowWrap)dowWrap.style.display=(f==='weekly')?'':'none';
  if(domWrap)domWrap.style.display=(f==='monthly')?'':'none';
}
function _saveSchedule(id,forceFreq){
  const arr=_getSavedReports();const r=arr.find(x=>x.id===id);if(!r)return;
  const freq=forceFreq||document.getElementById('rs-freq')?.value||'off';
  if(freq==='off'){r.schedule={frequency:'off'};}
  else{
    r.schedule={
      frequency:freq,
      time:document.getElementById('rs-time')?.value||'08:00',
      dow:Number(document.getElementById('rs-dow')?.value||1),
      dom:Number(document.getElementById('rs-dom')?.value||1),
    };
  }
  _setSavedReports(arr);
  closeModal();renderReports();
  toast(freq==='off'?'Schedule disabled':`⏰ Will email ${freq} at ${r.schedule.time}`);
}
// On every Reports render + on login, walk saved reports and send any whose
// schedule is overdue. Catch-up model: if a daily 8am report wasn't sent
// today and the current time is past 8am, send it now. Idempotent — won't
// double-send within the same window.
// The server decides whether a report is due (on your time-zone clock) and
// hands out ONE claim per period — shared with the hourly server cron, which
// sends a lighter version when no tab is open. Before -228 this tab and the
// cron each kept their own lastSentISO, in local time and UTC, and both sent.
async function _checkReportSchedules(){
  if(!D.creds||!D.creds.email)return;
  const arr=_getSavedReports();let changed=false;
  for(const r of arr){
    const s=r.schedule;if(!s||s.frequency==='off'||!s.frequency)continue;
    let claim=null;
    try{claim=await _trpc('reportsSchedule.claim',{reportId:String(r.id)},'mutation');}catch(e){continue;}
    if(!claim||!claim.claimed)continue;
    // Load the report config in-memory (without re-rendering UI), build HTML, send.
    try{
      // Briefly switch active state to render this report into reports-main
      const savedRange=_reportRange,savedSections=_reportSections,savedWidgets=_reportWidgets;
      _reportRange=r.range||'30d';
      _reportSections=Object.assign({tasks:true,goals:true,habits:true,focus:true,journal:true,projects:true},r.sections||{});
      _reportWidgets=Array.isArray(r.widgets)?JSON.parse(JSON.stringify(r.widgets)):[];
      const stashedMain=document.getElementById('reports-main');
      let html='';
      if(stashedMain){
        const wasOn=document.getElementById('s-reports').classList.contains('on');
        if(!wasOn)document.getElementById('s-reports').classList.add('on');
        renderReports();
        const clone=stashedMain.cloneNode(true);
        clone.querySelectorAll('.no-print, button').forEach(el=>el.remove());
        html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.name)}</title><style>body{font-family:-apple-system,Segoe UI,sans-serif;background:#0b0f1a;color:#f8fafc;padding:24px}.cd{background:#161d2e;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;margin-bottom:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:0 0 10px}p{font-size:12px;color:#94a3b8;margin:0 0 6px}</style></head><body>${clone.innerHTML}</body></html>`;
        if(!wasOn)document.getElementById('s-reports').classList.remove('on');
      }
      // Restore state
      _reportRange=savedRange;_reportSections=savedSections;_reportWidgets=savedWidgets;
      if(curScreen==='reports')renderReports();
      if(!html)throw new Error('the report did not render');
      await _trpc('oauthSync.sendCustom',{to:D.creds.email,subject:`📊 ${r.name} — ${new Date().toLocaleDateString()}`,html},'mutation');
      changed=true;
    }catch(e){
      console.warn('[report schedule] send failed',r.name,e);
      // Hand the period back so the server cron (or the next open) sends it.
      try{await _trpc('reportsSchedule.release',{reportId:String(r.id),period:claim.period},'mutation');}catch(_){}
    }
  }
  if(changed)toast({type:'success',title:'📧 Scheduled reports sent',duration:3000});
}

function _reportRangeDays(){return {'7d':7,'30d':30,'90d':90,'365d':365,'all':9999}[_reportRange]||30;}
function _reportRangeLabel(){return {'7d':'Last 7 days','30d':'Last 30 days','90d':'Last 90 days','365d':'Last year','all':'All time'}[_reportRange]||_reportRange;}
function _reportStartDate(){const d=new Date();d.setDate(d.getDate()-_reportRangeDays());return _ymd(d);}

function setReportRange(r){_reportRange=r;_reportCustomFrom='';_reportCustomTo='';localStorage.setItem('lu_report_range',r);_reportNarrativeCache=null;_reportAnomaliesCache=null;renderReports();}
function toggleReportSection(s){_reportSections[s]=!_reportSections[s];localStorage.setItem('lu_report_sections',JSON.stringify(_reportSections));renderReports();}
// ─── R8: custom date range ────────────────────────────────────────────
if(typeof _reportCustomFrom==='undefined')var _reportCustomFrom='';
if(typeof _reportCustomTo==='undefined')var _reportCustomTo='';
function setReportCustomRange(){
  const f=document.getElementById('rep-from')?.value;const t=document.getElementById('rep-to')?.value||_ymd(new Date());
  if(!f)return toast('Pick a from date');
  _reportCustomFrom=f;_reportCustomTo=t;_reportRange='custom';_reportNarrativeCache=null;_reportAnomaliesCache=null;renderReports();
}
// Override range helpers to handle 'custom'.
const _origReportRangeDays=_reportRangeDays;
_reportRangeDays=function(){if(_reportRange==='custom'&&_reportCustomFrom){const f=_pd(_reportCustomFrom);const t=_reportCustomTo?_pd(_reportCustomTo):new Date();return Math.max(1,Math.ceil((t-f)/86400000)+1);}return _origReportRangeDays();};
const _origReportRangeLabel=_reportRangeLabel;
_reportRangeLabel=function(){if(_reportRange==='custom'&&_reportCustomFrom)return `${_reportCustomFrom} → ${_reportCustomTo||'today'}`;return _origReportRangeLabel();};
const _origReportStartDate=_reportStartDate;
_reportStartDate=function(){if(_reportRange==='custom'&&_reportCustomFrom)return _reportCustomFrom;return _origReportStartDate();};
// ─── R9: project + tag filters ────────────────────────────────────────
if(typeof _reportProjectFilter==='undefined')var _reportProjectFilter='';
if(typeof _reportTagFilter==='undefined')var _reportTagFilter='';
function setReportProjectFilter(v){_reportProjectFilter=v||'';_reportNarrativeCache=null;_reportAnomaliesCache=null;renderReports();}
function setReportTagFilter(v){_reportTagFilter=v||'';_reportNarrativeCache=null;_reportAnomaliesCache=null;renderReports();}
function _reportTaskMatches(t){
  if(_reportProjectFilter){const id=parseInt(_reportProjectFilter)||null;if(id){if(t.projectId!==id)return false;}else{if((t.project||'')!==_reportProjectFilter)return false;}}
  if(_reportTagFilter)return (t.tags||[]).map(x=>x.toLowerCase()).includes(_reportTagFilter.toLowerCase());
  return true;
}
// ─── R2: period comparison ────────────────────────────────────────────
function _reportPeriodPair(){
  const days=Math.min(_reportRangeDays(),365);
  const today=new Date();today.setHours(0,0,0,0);
  let curStart,curEnd;
  if(_reportRange==='custom'&&_reportCustomFrom){curStart=_pd(_reportCustomFrom);curEnd=_reportCustomTo?_pd(_reportCustomTo):_pd(today);}
  else{curEnd=_pd(today);curStart=_pd(today);curStart.setDate(today.getDate()-(days-1));}
  const prevEnd=_pd(curStart);prevEnd.setDate(prevEnd.getDate()-1);
  const prevStart=_pd(prevEnd);prevStart.setDate(prevStart.getDate()-(days-1));
  const iso=d=>_ymd(d);
  return {days,curStart:iso(curStart),curEnd:iso(curEnd),prevStart:iso(prevStart),prevEnd:iso(prevEnd)};
}
function _delta(cur,prev){
  const c=Number(cur)||0,p=Number(prev)||0;
  if(p===0)return {pct:c>0?100:0,arrow:c>0?'▲':'·',color:c>0?'var(--ok)':'var(--t3)',label:c>0?'new':'·'};
  const pct=Math.round(((c-p)/Math.abs(p))*100);
  if(pct===0)return {pct:0,arrow:'·',color:'var(--t3)',label:'flat'};
  return {pct:Math.abs(pct),arrow:pct>0?'▲':'▼',color:pct>0?'var(--ok)':'var(--red)',label:(pct>0?'+':'-')+Math.abs(pct)+'%'};
}
function _renderDeltaChip(cur,prev,opts){
  const d=_delta(cur,prev);const o=opts||{};
  if(d.label==='·'&&!o.showFlat)return '';
  const goodIsUp=o.goodIsUp!==false;
  const color=d.label==='flat'?'var(--t3)':((d.arrow==='▲')===goodIsUp?'var(--ok)':'var(--red)');
  return `<span style="display:inline-flex;align-items:center;gap:2px;font-size:11px;font-weight:600;color:${color};margin-left:6px" title="vs previous period (${prev||0})">${d.arrow} ${d.label}</span>`;
}
// ─── R6: simple linear forecast ───────────────────────────────────────
function _reportForecast(series,days){
  if(!series||series.length<3)return null;
  // Simple linear regression to project forward.
  const n=series.length;const xs=Array.from({length:n},(_,i)=>i);
  const sumX=xs.reduce((a,b)=>a+b,0),sumY=series.reduce((a,b)=>a+b,0);
  const sumXY=xs.reduce((s,x,i)=>s+x*series[i],0),sumX2=xs.reduce((s,x)=>s+x*x,0);
  const denom=n*sumX2-sumX*sumX;if(denom===0)return null;
  const slope=(n*sumXY-sumX*sumY)/denom;const intercept=(sumY-slope*sumX)/n;
  const projected=Array.from({length:days||7},(_,i)=>Math.max(0,Math.round(intercept+slope*(n+i))));
  return {slope,intercept,projected,total:projected.reduce((a,b)=>a+b,0)};
}
// ─── R7: goal pace check ─────────────────────────────────────────────
function _goalPaceCheck(g){
  if((g.pct||0)>=100)return {status:'done',label:'Done',color:'var(--ok)'};
  const due=_goalDue(g);
  if(!due)return {status:'unknown',label:'No deadline',color:'var(--t3)'};
  const dueMs=+_pd(due);if(isNaN(dueMs))return {status:'unknown',label:'No deadline',color:'var(--t3)'};
  const created=g.createdAt?Date.parse(g.createdAt):(Date.now()-90*86400000);
  const now=Date.now();const elapsed=Math.max(1,(now-created)/86400000);
  const ratePerDay=(g.pct||0)/elapsed;
  if(ratePerDay<=0)return {status:'stalled',label:'Stalled',color:'var(--red)',projected:null};
  const remaining=100-(g.pct||0);
  const daysToFinish=remaining/ratePerDay;
  const projectedMs=now+daysToFinish*86400000;
  const slipDays=Math.round((projectedMs-dueMs)/86400000);
  const projectedISO=_ymd(_pd(projectedMs));
  if(slipDays<=0)return {status:'on-pace',label:`On pace · ${projectedISO}`,color:'var(--ok)',projected:projectedISO,slip:slipDays};
  if(slipDays<=14)return {status:'tight',label:`+${slipDays}d late · ${projectedISO}`,color:'var(--warn)',projected:projectedISO,slip:slipDays};
  return {status:'behind',label:`+${slipDays}d late · ${projectedISO}`,color:'var(--red)',projected:projectedISO,slip:slipDays};
}
// ─── R1, R3, R4, R5: AI handlers ──────────────────────────────────────
if(typeof _reportNarrativeCache==='undefined')var _reportNarrativeCache=null; // {key, text}
if(typeof _reportAnomaliesCache==='undefined')var _reportAnomaliesCache=null;
async function _reportAICall(systemPrompt,userContent){
  const {provider,configured}=_getAIConfig();
  const res=await _trpc('ai.assist',{systemPrompt,userContent,provider:provider||'manus'},'mutation');
  return String(res?.result||res?.text||'').trim();
}
function _reportContextCompact(){
  const p=_reportPeriodPair();
  const inCur=d=>d&&d>=p.curStart&&d<=p.curEnd;
  const inPrev=d=>d&&d>=p.prevStart&&d<=p.prevEnd;
  const tasks=(D.tasks||[]).filter(_reportTaskMatches);
  const habits=(D.habits||[]).filter(h=>h.cadence==='Daily');
  const focusLog=(D.prefs&&D.prefs.focusLog)||{};
  const fSum=(s,e)=>Object.entries(focusLog).filter(([d])=>d>=s&&d<=e).reduce((a,[,v])=>a+(Number(v)||0),0);
  const cur={
    done:tasks.filter(t=>t.status==='Done'&&inCur(_dayOf(t.completedAt))).length,
    created:tasks.filter(t=>inCur(_dayOf(t.createdAt))).length,
    overdue:tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<p.curEnd).length,
    focus:fSum(p.curStart,p.curEnd),
    journal:(D.journal||[]).filter(j=>inCur((j.date||'').slice(0,10))).length,
    habitsDone:habits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>inCur(d)).length,0),
  };
  const prev={
    done:tasks.filter(t=>t.status==='Done'&&inPrev(_dayOf(t.completedAt))).length,
    created:tasks.filter(t=>inPrev(_dayOf(t.createdAt))).length,
    focus:fSum(p.prevStart,p.prevEnd),
    journal:(D.journal||[]).filter(j=>inPrev((j.date||'').slice(0,10))).length,
    habitsDone:habits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>inPrev(d)).length,0),
  };
  return {p,cur,prev,goals:D.goals||[],projectsCount:(D.projects||[]).length};
}
async function aiReportNarrative(force){
  const key=`${_reportRange}|${_reportCustomFrom}|${_reportCustomTo}|${_reportProjectFilter}|${_reportTagFilter}`;
  if(!force&&_reportNarrativeCache&&_reportNarrativeCache.key===key)return;
  const sec=document.getElementById('report-narrative');if(sec)sec.innerHTML=`<div style="padding:10px;color:var(--t3);font-size:11px">⏳ Reading your data…</div>`;
  try{
    const ctx=_reportContextCompact();
    const sys=`You are a sharp data analyst writing the executive summary for a personal productivity report. In 3 short paragraphs (~150 words total): 1) Headline number + comparison to previous period. 2) The most interesting trend or correlation in the data. 3) One specific suggestion based on what you see. Plain prose, no markdown headers. Reference real numbers.`;
    const user=`Period: ${ctx.p.curStart} → ${ctx.p.curEnd} (${ctx.p.days} days). Previous: ${ctx.p.prevStart} → ${ctx.p.prevEnd}.\nThis period vs previous:\n- Tasks done: ${ctx.cur.done} vs ${ctx.prev.done}\n- Tasks created: ${ctx.cur.created} vs ${ctx.prev.created}\n- Focus minutes: ${ctx.cur.focus} vs ${ctx.prev.focus}\n- Journal entries: ${ctx.cur.journal} vs ${ctx.prev.journal}\n- Habit completions: ${ctx.cur.habitsDone} vs ${ctx.prev.habitsDone}\n- Overdue tasks now: ${ctx.cur.overdue}\n- Active goals: ${ctx.goals.length} (avg ${ctx.goals.length?Math.round(ctx.goals.reduce((s,g)=>s+(g.pct||0),0)/ctx.goals.length):0}%)\nFilters: project="${_reportProjectFilter||'(all)'}", tag="${_reportTagFilter||'(none)'}"`;
    const text=await _reportAICall(sys,user);
    _reportNarrativeCache={key,text};
    if(sec)sec.innerHTML=`<div style="font-size:11px;line-height:1.7;color:var(--t1);white-space:pre-wrap;padding:12px 14px;background:linear-gradient(135deg,color-mix(in srgb,var(--ac) 12%,var(--s2)),color-mix(in srgb,var(--purp) 8%,var(--s2)));border:1px solid color-mix(in srgb,var(--ac) 30%,var(--bd2));border-radius:10px">${esc(text)}</div><div style="margin-top:6px;display:flex;gap:6px"><button class="btn btn-s" style="font-size:11px" onclick="aiReportNarrative(true)">↻ Regenerate</button><span style="font-size:11px;color:var(--t3);align-self:center">cached for this filter combo</span></div>`;
  }catch(e){if(sec)sec.innerHTML=`<div style="padding:10px;color:var(--red);font-size:11px">Narrative failed: ${esc(String(e.message||e).slice(0,200))}</div>`;}
}
async function aiReportAskQuestion(){
  const inp=document.getElementById('rep-ask-input');if(!inp)return;
  const q=(inp.value||'').trim();if(!q)return toast('Type a question');
  const out=document.getElementById('rep-ask-output');if(out)out.innerHTML=`<div style="padding:10px;color:var(--t3);font-size:11px">⏳ Looking at your data…</div>`;
  try{
    const ctx=_reportContextCompact();
    // Build a richer detail blob: per-day series for tasks done + focus
    const days=Math.min(_reportRangeDays(),60);
    const dayKeys=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(days-1-i));return _ymd(d);});
    const focusLog=(D.prefs&&D.prefs.focusLog)||{};
    const seriesDone=dayKeys.map(k=>(D.tasks||[]).filter(_reportTaskMatches).filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===k).length);
    const seriesFocus=dayKeys.map(k=>focusLog[k]||0);
    const projLines=(D.projects||[]).slice(0,8).map(p=>`- ${p.name}: ${p.pct||0}%`).join('\n');
    const goalLines=ctx.goals.slice(0,8).map(g=>`- ${g.title}: ${g.pct||0}%`).join('\n');
    const sys=`You are a productivity data analyst. Answer the user's question about THEIR data only — never invent numbers. Be specific: cite real figures from the context. If the question can't be answered from the data, say so. 1-3 short paragraphs max.`;
    const user=`Period: ${ctx.p.curStart} → ${ctx.p.curEnd} (${ctx.p.days} days)\nFilters: project="${_reportProjectFilter||'(all)'}", tag="${_reportTagFilter||'(none)'}"\n\nSummary: tasks done ${ctx.cur.done} (was ${ctx.prev.done}), tasks created ${ctx.cur.created}, focus ${ctx.cur.focus}m, journal ${ctx.cur.journal} entries, habit completions ${ctx.cur.habitsDone}, overdue ${ctx.cur.overdue}.\n\nDaily series (last ${dayKeys.length} days, oldest first):\nTasks done: ${seriesDone.join(',')}\nFocus min: ${seriesFocus.join(',')}\n\nProjects:\n${projLines||'(none)'}\nGoals:\n${goalLines||'(none)'}\n\nQuestion: ${q}`;
    const text=await _reportAICall(sys,user);
    if(out)out.innerHTML=`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.65;white-space:pre-wrap;color:var(--t1)">${esc(text)}</div>`;
  }catch(e){if(out)out.innerHTML=`<div style="padding:10px;color:var(--red);font-size:11px">Failed: ${esc(String(e.message||e).slice(0,200))}</div>`;}
}
async function aiReportAnomalies(force){
  const key=`${_reportRange}|${_reportCustomFrom}|${_reportCustomTo}|${_reportProjectFilter}|${_reportTagFilter}`;
  if(!force&&_reportAnomaliesCache&&_reportAnomaliesCache.key===key){_renderAnomalies(_reportAnomaliesCache.items);return;}
  const sec=document.getElementById('report-anomalies');if(sec)sec.innerHTML=`<div style="padding:10px;color:var(--t3);font-size:11px">⏳ Scanning for anomalies…</div>`;
  try{
    const days=Math.min(_reportRangeDays(),90);
    const dayKeys=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(days-1-i));return _ymd(d);});
    const focusLog=(D.prefs&&D.prefs.focusLog)||{};
    const tasks=(D.tasks||[]).filter(_reportTaskMatches);
    const seriesDone=dayKeys.map(k=>tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===k).length);
    const seriesFocus=dayKeys.map(k=>focusLog[k]||0);
    const sys=`You are a pattern-detection analyst. Identify up to 4 specific ANOMALIES or notable patterns in the data series provided. For each: a 1-line title and a 1-2 sentence explanation grounded in the actual numbers. Reply with strict JSON only: {"anomalies":[{"title":"…","detail":"…","severity":"low|med|high"}, …]}. If everything looks normal, return an empty list.`;
    const user=`Days (oldest first, ${days} total):\n${dayKeys.join(',')}\nTasks done per day: ${seriesDone.join(',')}\nFocus minutes per day: ${seriesFocus.join(',')}\nFind anomalies.`;
    const text=String(await _reportAICall(sys,user)).replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    const parsed=JSON.parse(text);
    _reportAnomaliesCache={key,items:parsed.anomalies||[]};
    _renderAnomalies(parsed.anomalies||[]);
  }catch(e){if(sec)sec.innerHTML=`<div style="padding:10px;color:var(--red);font-size:11px">Anomaly scan failed: ${esc(String(e.message||e).slice(0,200))}</div>`;}
}
function _renderAnomalies(items){
  const sec=document.getElementById('report-anomalies');if(!sec)return;
  if(!items||!items.length){sec.innerHTML=`<div style="padding:10px;color:var(--t3);font-size:11px">No anomalies detected — your data looks consistent.</div>`;return;}
  const sevColor={low:'var(--ac)',med:'var(--warn)',high:'var(--red)'};
  sec.innerHTML=items.map(a=>`<div style="display:flex;gap:10px;padding:10px 12px;background:var(--s2);border:1px solid var(--bd1);border-left:3px solid ${sevColor[a.severity]||'var(--t3)'};border-radius:8px;margin-bottom:6px"><span style="font-size:16px">${a.severity==='high'?'🚨':a.severity==='med'?'⚠️':'💡'}</span><div style="flex:1"><div style="font-size:12px;font-weight:600;margin-bottom:3px">${esc(a.title||'')}</div><div style="font-size:11px;color:var(--t2);line-height:1.5">${esc(a.detail||'')}</div></div></div>`).join('');
}
async function aiReportRecommendWidgets(){
  toast({type:'info',title:'Looking for widget ideas…',duration:2000});
  try{
    const ctx=_reportContextCompact();
    const existing=(_reportWidgets||[]).map(w=>`${w.title} (${w.source}/${w.viz})`).join(', ');
    const sys=`You are a personal-analytics designer. Given a workspace summary and the user's existing custom widgets, recommend 3 NEW widgets they should add. Each must be specific: title, source (one of: tasks, notes, projects, goals, journal, habits, ideas, focus), viz (one of: kpi, bar, line, donut, heatmap, sparkline, progress, table), groupBy (e.g. status, priority, day(completedAt), project, _total), metric (count, sum(estimatedMins), avg(pct)), and a 1-line "why". Reply with strict JSON: {"widgets":[{"title":"…","source":"…","viz":"…","groupBy":"…","metric":"…","why":"…"}, …]}`;
    const user=`Cur period: tasks done ${ctx.cur.done}, created ${ctx.cur.created}, focus ${ctx.cur.focus}m, journal ${ctx.cur.journal}, habits done ${ctx.cur.habitsDone}.\nGoals (${ctx.goals.length}): ${ctx.goals.slice(0,5).map(g=>g.title+' '+(g.pct||0)+'%').join(', ')}.\nProjects: ${ctx.projectsCount}.\nExisting widgets: ${existing||'(none)'}.`;
    const text=String(await _reportAICall(sys,user)).replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    const parsed=JSON.parse(text);
    if(!Array.isArray(parsed.widgets))throw new Error('Bad response');
    window._reportRecCache=parsed.widgets;
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">✨ Recommended Widgets</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">Click any to add it to your report.</div>${parsed.widgets.map((w,i)=>`<div class="cd" style="cursor:pointer;margin-bottom:6px;padding:10px" onclick="addRecommendedWidget(${i})" id="recw-${i}"><div style="font-size:12px;font-weight:600;margin-bottom:3px">📊 ${esc(w.title||'')}</div><div style="font-size:11px;color:var(--t3);margin-bottom:4px">${esc(w.source||'')} → ${esc(w.viz||'')} (group: ${esc(w.groupBy||'')}, metric: ${esc(w.metric||'')})</div><div style="font-size:11px;color:var(--t2);font-style:italic">${esc(w.why||'')}</div></div>`).join('')}<div style="display:flex;gap:6px;margin-top:8px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'Recommendation failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
function addRecommendedWidget(i){
  const w=window._reportRecCache?.[i];if(!w)return;
  const widget={id:Date.now(),title:w.title||'AI widget',source:WIDGET_SOURCES[w.source]?w.source:'tasks',groupBy:w.groupBy||'_total',metric:w.metric||'count',viz:['kpi','bar','line','donut','heatmap','sparkline','progress','table'].includes(w.viz)?w.viz:'kpi',color:'#3b82f6',sizeW:6,filter:[]};
  _reportWidgets.push(widget);_saveReportWidgets();
  const card=document.getElementById('recw-'+i);if(card){card.style.opacity='.4';card.style.pointerEvents='none';card.innerHTML+='<div style="font-size:11px;color:var(--ok);margin-top:4px">✓ Added</div>';}
  toast(`📊 "${widget.title}" added`);
}
// ─── R10: drill-down on common widget cells ─────────────────────────
function reportDrillDown(kind,key){
  const p=_reportPeriodPair();
  let items=[];let title='';
  if(kind==='taskday'){title=`Tasks done on ${key}`;items=(D.tasks||[]).filter(_reportTaskMatches).filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===key);}
  else if(kind==='taskstatus'){title=`Tasks: ${key}`;items=(D.tasks||[]).filter(_reportTaskMatches).filter(t=>(t.status||'Not Started')===key);}
  else if(kind==='taskpriority'){title=`Active tasks: ${key} priority`;items=(D.tasks||[]).filter(_reportTaskMatches).filter(t=>t.status!=='Done'&&t.priority===key);}
  else return;
  if(!items.length){toast('No items in this slice');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">${esc(title)}</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">${items.length} item${items.length===1?'':'s'} — click to open</div><div style="max-height:400px;overflow-y:auto">${items.map(t=>`<div class="lr" style="cursor:pointer;font-size:11px;padding:5px 8px;border-bottom:1px solid var(--bd1)" onclick="closeModal();openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><span class="rt">${esc(t.title)}</span><span class="pill ${pillClass(t.priority)}" style="font-size:11px">${t.priority||''}</span><span style="font-size:11px;color:var(--t3)">${t.due||''}</span></div>`).join('')}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
  document.getElementById('modal-capture').classList.add('show');
}

// Lazy-load SheetJS (xlsx) the first time the user wants Excel export.
let _xlsxLoaded=false;
function _ensureXLSX(){return new Promise((resolve,reject)=>{if(_xlsxLoaded||window.XLSX){_xlsxLoaded=true;return resolve(window.XLSX);}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=()=>{_xlsxLoaded=true;resolve(window.XLSX);};s.onerror=()=>reject(new Error('Failed to load XLSX library'));document.head.appendChild(s);});}

async function exportReportsExcel(){
  try{
    toast('⏳ Building Excel workbook…');
    const XLSX=await _ensureXLSX();
    const wb=XLSX.utils.book_new();
    const startKey=_reportStartDate();
    const inRange=(dateStr)=>!dateStr||dateStr>=startKey;
    // Tasks sheet
    const taskRows=(D.tasks||[]).filter(t=>inRange(t.completedAt||t.createdAt||t.due)).map(t=>({Title:t.title,Status:t.status,Priority:t.priority,Due:t.due||'',Completed:t.completedAt||'',Project:t.project||'',Tags:(t.tags||[]).join('; ')}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(taskRows),'Tasks');
    // Goals sheet
    const goalRows=(D.goals||[]).map(g=>({Title:g.title,Category:g.category||'',Progress:(g.pct||0)+'%',DueDate:g.dueDate||'',Milestones:(g.milestones||[]).length}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(goalRows),'Goals');
    // Habits sheet
    const habitRows=(D.habits||[]).map(h=>({Title:h.title,Cadence:h.cadence,Streak:h.streak||0,DoneToday:h.doneToday?'Yes':'No',Completions30d:(h.completedDates||[]).filter(d=>d>=startKey).length}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(habitRows),'Habits');
    // Journal sheet
    const journalRows=(D.journal||[]).filter(j=>inRange(j.date)).map(j=>({Date:j.date,Title:j.title,Mood:j.mood||'',Body:j.body||''}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(journalRows),'Journal');
    // Projects sheet
    const projectRows=(D.projects||[]).map(p=>({Name:p.name,Status:p.status||'',Progress:(p.pct||0)+'%',Due:p.due||'',Owner:p.owner||''}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(projectRows),'Projects');
    // Summary sheet (key metrics)
    const todayKey=_ymd(new Date());
    const summary=[
      {Metric:'Report range',Value:_reportRangeLabel()},
      {Metric:'Generated',Value:new Date().toLocaleString()},
      {Metric:'Total tasks',Value:(D.tasks||[]).length},
      {Metric:'Done in range',Value:(D.tasks||[]).filter(t=>t.status==='Done'&&(t.completedAt||'')>=startKey).length},
      {Metric:'Currently overdue',Value:(D.tasks||[]).filter(t=>t.status!=='Done'&&t.due&&t.due<todayKey).length},
      {Metric:'Total goals',Value:(D.goals||[]).length},
      {Metric:'Avg goal progress',Value:(D.goals||[]).length?Math.round((D.goals||[]).reduce((s,g)=>s+(g.pct||0),0)/(D.goals||[]).length)+'%':'—'},
      {Metric:'Daily habits',Value:(D.habits||[]).filter(h=>h.cadence==='Daily').length},
      {Metric:'Habits done today',Value:(D.habits||[]).filter(h=>h.cadence==='Daily'&&h.doneToday).length},
      {Metric:'Journal entries in range',Value:(D.journal||[]).filter(j=>(j.date||'')>=startKey).length},
    ];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),'Summary');
    const stamp=_ymd(new Date());
    XLSX.writeFile(wb,`levelup-report-${stamp}.xlsx`);
    toast('⬇ Excel report downloaded');
  }catch(e){toast('⚠ Excel export failed: '+(e.message||e));}
}

function exportReportsPDF(){
  // Browser print → user picks "Save as PDF" in the print dialog. The print stylesheet
  // hides everything outside the report so the PDF is clean.
  document.body.classList.add('lu-print-report');
  setTimeout(()=>{
    window.print();
    setTimeout(()=>document.body.classList.remove('lu-print-report'),500);
  },50);
}

function renderReports(){
  const startKey=_reportStartDate();
  const todayKey=_ymd(new Date());
  const inRange=d=>d&&d>=startKey&&d<=todayKey;
  // Journal entries store free-form dates ("Today · Monday, May 19"); normalise
  // through _parseJournalDate before any range comparison.
  const jKey=j=>{const d=_parseJournalDate(j);return d?_ymd(d):'';};
  const tasks=D.tasks||[];const goals=D.goals||[];const habits=D.habits||[];const journal=D.journal||[];const projects=D.projects||[];
  const days=Math.min(_reportRangeDays(),365);
  const dayKeys=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(days-1-i));return _ymd(d);});

  // Tasks data
  const tasksDoneRange=tasks.filter(t=>t.status==='Done'&&inRange(t.completedAt||''));
  const tasksCreatedRange=tasks.filter(t=>inRange(t.createdAt||''));
  const completionByDay=dayKeys.map(k=>tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===k).length);
  const maxCompletion=Math.max(...completionByDay,1);
  // Show at most ~30 bars to keep readable
  const barStep=Math.max(1,Math.ceil(dayKeys.length/30));
  const barData=[];for(let i=0;i<dayKeys.length;i+=barStep){let sum=0;for(let j=i;j<Math.min(i+barStep,dayKeys.length);j++)sum+=completionByDay[j];barData.push({key:dayKeys[i],count:sum});}
  const barMax=Math.max(...barData.map(b=>b.count),1);
  const tasksBars=barData.map(b=>{const h=Math.round(b.count/barMax*60)+2;return `<div class="lu-bar-wrap" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:6px;height:64px;justify-content:flex-end;position:relative;cursor:${b.count?'pointer':'default'}" ${b.count?`onclick="reportDrillDown('taskday','${b.key}')"`:''}><div class="lu-bar" style="width:80%;background:linear-gradient(180deg,var(--ac),color-mix(in srgb,var(--ac) 35%,transparent));border-radius:3px 3px 0 0;height:${h}px;min-height:2px"></div><div class="lu-bar-tip">${b.key}: ${b.count} task${b.count===1?'':'s'}</div></div>`;}).join('');
  // R11: x-axis labels for the bars
  const tasksBarLabels=barData.map((b,i)=>{const showLabel=barData.length<=14||i===0||i===barData.length-1||i%Math.ceil(barData.length/7)===0;return `<div style="flex:1;text-align:center;font-size:9px;color:var(--t3);min-width:6px">${showLabel?esc(b.key.slice(5)):''}</div>`;}).join('');
  const tasksByPriority={High:tasks.filter(t=>t.priority==='High'&&t.status!=='Done').length,Medium:tasks.filter(t=>t.priority==='Medium'&&t.status!=='Done').length,Low:tasks.filter(t=>t.priority==='Low'&&t.status!=='Done').length};
  const tasksByStatus={Done:tasks.filter(t=>t.status==='Done').length,'In Progress':tasks.filter(t=>t.status==='In Progress').length,'Not Started':tasks.filter(t=>t.status==='Not Started').length,Someday:tasks.filter(t=>t.status==='Someday').length};

  // Goals data
  const avgGoalPct=goals.length?Math.round(goals.reduce((s,g)=>s+(g.pct||0),0)/goals.length):0;
  const goalsOnTrack=goals.filter(g=>(g.pct||0)>=50).length;
  const goalsBehind=goals.filter(g=>(g.pct||0)<30).length;

  // Habits data
  const dailyHabits=habits.filter(h=>h.cadence==='Daily');
  const habitCells=dayKeys.slice(-Math.min(days,90)).map(k=>{const total=dailyHabits.length;const done=dailyHabits.filter(h=>(h.completedDates||[]).includes(k)).length;const pct=total?done/total:0;const c=pct===0?'var(--s3)':(pct<.34?'rgba(34,197,94,.25)':(pct<.67?'rgba(34,197,94,.55)':'rgba(34,197,94,.95)'));return `<div title="${k}: ${done}/${total}" style="width:14px;height:14px;background:${c};border-radius:3px"></div>`;}).join('');
  const totalHabitCompletions=dailyHabits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>d>=startKey).length,0);
  const topStreak=habits.reduce((b,h)=>(h.streak||0)>(b.streak||0)?h:b,{streak:0,title:'—',icon:''});

  // Focus data
  const focusLog=(D.prefs&&D.prefs.focusLog)||{};
  const focusByDay=dayKeys.map(k=>focusLog[k]||0);
  const focusTotal=focusByDay.reduce((a,b)=>a+b,0);
  const focusMax=Math.max(...focusByDay,1);
  const focusBars=focusByDay.map((m,i)=>{const h=Math.round(m/focusMax*52)+1;return `<div class="lu-bar-wrap" style="flex:1;display:flex;flex-direction:column;align-items:center;min-width:4px;height:56px;justify-content:flex-end;position:relative"><div class="lu-bar" style="width:80%;background:linear-gradient(180deg,var(--purp),color-mix(in srgb,var(--purp) 35%,transparent));border-radius:3px 3px 0 0;height:${h}px;min-height:2px"></div><div class="lu-bar-tip">${dayKeys[i]}: ${m}m focus</div></div>`;}).join('');

  // Journal/Mood data
  const moodMap={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};
  const journalRange=journal.filter(j=>j&&inRange(jKey(j)));
  const journalScored=journalRange.filter(j=>moodMap[j.mood]).map(j=>moodMap[j.mood]);
  const avgMood=journalScored.length?(journalScored.reduce((a,b)=>a+b,0)/journalScored.length).toFixed(1):'—';

  // Donut helper for status
  const sTotal=Object.values(tasksByStatus).reduce((a,b)=>a+b,0)||1;
  const sColors={Done:'#22c55e','In Progress':'var(--ac)','Not Started':'var(--t3)',Someday:'var(--warn)'};
  let acc=0;const donutStops=Object.entries(tasksByStatus).map(([k,v])=>{const start=acc/sTotal*100;acc+=v;const end=acc/sTotal*100;return `${sColors[k]} ${start}% ${end}%`;}).join(',');

  // R2: previous-period comparison numbers
  const periodPair=_reportPeriodPair();
  const inPrev=d=>d&&d>=periodPair.prevStart&&d<=periodPair.prevEnd;
  const filteredTasks=tasks.filter(_reportTaskMatches);
  const prevDone=filteredTasks.filter(t=>t.status==='Done'&&inPrev(_dayOf(t.completedAt))).length;
  const prevCreated=filteredTasks.filter(t=>inPrev(_dayOf(t.createdAt))).length;
  const prevFocus=Object.entries(focusLog).filter(([d])=>d>=periodPair.prevStart&&d<=periodPair.prevEnd).reduce((a,[,v])=>a+(Number(v)||0),0);
  const prevJournal=journal.filter(j=>inPrev(jKey(j))).length;
  // R6: forecast for next 7 days
  const forecast7=_reportForecast(completionByDay.slice(-Math.min(14,completionByDay.length)),7);
  // Tasks projects + tags for R9 filter dropdowns
  const allProjOpts=[{id:'',name:'All projects'},...((D.projects||[]).map(p=>({id:String(p.id),name:p.name})))];
  const allTagSet=new Set();(D.tasks||[]).forEach(t=>(t.tags||[]).forEach(tg=>allTagSet.add(tg)));
  const allTagList=[...allTagSet].sort();
  $('reports-main').innerHTML=`
  <div id="lu-report-print-target">
    <div class="ph-r" style="margin-bottom:14px">
      <div><h1 style="font-size:24px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('barChart',24,'var(--page-accent)')}Reports & Insights</h1><p style="font-size:12px;color:var(--t2)">${_reportRangeLabel()} · ${tasksDoneRange.length} tasks completed · ${journalRange.length} journal entries · ${focusTotal} focus minutes${_reportProjectFilter?` · filtered: ${esc(allProjOpts.find(o=>o.id===_reportProjectFilter)?.name||_reportProjectFilter)}`:''}${_reportTagFilter?` · #${esc(_reportTagFilter)}`:''}</p></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select class="inp" style="height:30px;font-size:11px" onchange="setReportRange(this.value)">
          ${['7d','30d','90d','365d','all'].map(r=>`<option value="${r}" ${_reportRange===r?'selected':''}>${({'7d':'Last 7 days','30d':'Last 30 days','90d':'Last 90 days','365d':'Last year','all':'All time'})[r]}</option>`).join('')}
          <option value="custom" ${_reportRange==='custom'?'selected':''}>Custom range…</option>
        </select>
        <div style="position:relative;display:inline-block">
          <button class="btn btn-s no-print" style="height:30px;font-size:11px" onclick="event.stopPropagation();togglePopMenu('rep-filter-menu')" title="Filter by project / tag">🔍 Filter${(_reportProjectFilter||_reportTagFilter)?` • ${(_reportProjectFilter?1:0)+(_reportTagFilter?1:0)}`:''} ▾</button>
          <div id="rep-filter-menu" data-pop-menu="1" onclick="event.stopPropagation()" style="display:none;position:absolute;right:0;top:34px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:10px;z-index:50;width:240px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
            <div style="font-size:11px;color:var(--t3);font-weight:600;margin-bottom:4px">Project</div>
            <select class="inp" style="width:100%;height:28px;font-size:11px;padding:0 6px;margin-bottom:8px;box-sizing:border-box" onchange="setReportProjectFilter(this.value)">
              ${allProjOpts.map(p=>`<option value="${esc(p.id)}" ${_reportProjectFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
            </select>
            <div style="font-size:11px;color:var(--t3);font-weight:600;margin-bottom:4px">Tag</div>
            <select class="inp" style="width:100%;height:28px;font-size:11px;padding:0 6px;margin-bottom:8px;box-sizing:border-box" onchange="setReportTagFilter(this.value)">
              <option value="" ${!_reportTagFilter?'selected':''}>All tags</option>
              ${allTagList.map(t=>`<option value="${esc(t)}" ${_reportTagFilter===t?'selected':''}>#${esc(t)}</option>`).join('')}
            </select>
            ${(_reportProjectFilter||_reportTagFilter)?`<button class="btn btn-s" style="width:100%;height:26px;font-size:11px;color:var(--warn)" onclick="setReportProjectFilter('');setReportTagFilter('')">✕ Clear filters</button>`:''}
          </div>
        </div>
        <div style="position:relative;display:inline-block">
          <button class="btn btn-s no-print" style="height:30px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('rep-ai-menu')">✨ AI ▾</button>
          <div id="rep-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:34px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:220px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('rep-ai-menu');aiReportNarrative(true)">📰 Refresh narrative</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--warn);background:transparent;border:none;text-align:left" onclick="closePopMenu('rep-ai-menu');aiReportAnomalies(true)">🔍 Detect anomalies</button>
            <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('rep-ai-menu');aiReportRecommendWidgets()">📊 Recommend widgets</button>
          </div>
        </div>
        <button class="btn btn-s no-print" style="font-size:11px" onclick="exportReportsPDF()">⬇ PDF</button>
        <button class="btn btn-s no-print" style="font-size:11px" onclick="exportReportsExcel()">⬇ Excel</button>
        <button class="btn btn-s no-print" style="font-size:11px" onclick="openReportCustomize()">⚙ Customize</button>
        <button class="btn btn-p no-print" style="font-size:11px" onclick="saveCurrentReport()" title="Save the current range + sections as a named report">💾 Save</button>
      </div>
    </div>
    ${_reportRange==='custom'?`<div class="cd no-print" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:10px;flex-wrap:wrap"><span style="font-size:11px;color:var(--t3);font-weight:600">Custom range:</span><input id="rep-from" type="date" class="inp" value="${esc(_reportCustomFrom)}" style="height:26px;font-size:11px;padding:0 6px"><span style="font-size:11px;color:var(--t3)">to</span><input id="rep-to" type="date" class="inp" value="${esc(_reportCustomTo)}" style="height:26px;font-size:11px;padding:0 6px"><button class="btn btn-p" style="height:26px;font-size:11px" onclick="setReportCustomRange()">Apply</button></div>`:''}
    <!-- R1: AI Narrative Summary -->
    <div style="margin-bottom:14px">
      <div class="sec-h" style="color:var(--ac);display:flex;align-items:center;gap:6px;margin-bottom:6px">📰 What this report says</div>
      <div id="report-narrative"></div>
    </div>

    <!-- R3: AI Q&A -->
    <div style="margin-bottom:14px;padding:10px 12px;background:var(--s2);border:1px solid var(--bd1);border-radius:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:12px;font-weight:600">💬 Ask anything about your data</div>
      <div style="display:flex;gap:6px"><input id="rep-ask-input" class="inp" placeholder="e.g. when am I most productive? which project is bleeding time? am I improving?" style="flex:1;height:30px;font-size:11px;padding:0 8px" onkeydown="if(event.key==='Enter'){event.preventDefault();aiReportAskQuestion();}"><button class="btn btn-p" style="height:30px;font-size:11px" onclick="aiReportAskQuestion()">Ask</button></div>
      <div id="rep-ask-output" style="margin-top:8px"></div>
    </div>

    <!-- R4: AI Anomaly Detection -->
    <div style="margin-bottom:14px">
      <div class="sec-h" style="color:var(--warn);display:flex;align-items:center;gap:6px;margin-bottom:6px">🔍 Notable patterns</div>
      <div id="report-anomalies"></div>
    </div>

    ${(()=>{
      const saved=_getSavedReports();
      if(!saved.length)return '';
      return `<div class="cd no-print" style="margin-bottom:14px;padding:10px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:600;color:var(--t2);margin-right:4px">⭐ Saved Reports:</span>
        ${saved.map(r=>`<span style="display:inline-flex;align-items:center;gap:6px;background:color-mix(in srgb,var(--page-accent) 12%,var(--s2));border:1px solid color-mix(in srgb,var(--page-accent) 28%,var(--bd2));border-radius:14px;padding:3px 4px 3px 10px;font-size:11px;cursor:pointer;transition:transform .1s,filter .1s" onclick="loadSavedReport(${r.id})" onmouseover="this.style.transform='translateY(-1px)';this.style.filter='brightness(1.1)'" onmouseout="this.style.transform='';this.style.filter=''" title="${r.schedule?`Scheduled: ${esc(r.schedule.frequency)} at ${esc(r.schedule.time||'08:00')}`:`Range: ${esc(({'7d':'7 days','30d':'30 days','90d':'90 days','365d':'1 year','all':'All time'})[r.range]||r.range)}`}">
          <span style="font-size:13px">${esc(r.emoji||'📊')}</span>
          <span style="font-weight:500">${esc(r.name)}</span>
          ${r.schedule&&r.schedule.frequency&&r.schedule.frequency!=='off'?`<span style="font-size:11px;background:rgba(34,197,94,.18);color:#86efac;padding:1px 5px;border-radius:8px" title="Auto-email enabled">⏰</span>`:''}
          <button onclick="event.stopPropagation();openReportSchedule(${r.id})" title="Schedule email" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:11px;padding:2px 4px;border-radius:3px">⏰</button>
          <button onclick="event.stopPropagation();renameSavedReport(${r.id})" title="Rename" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:11px;padding:2px 4px;border-radius:3px">✏</button>
          <button onclick="event.stopPropagation();_openReportAssign(${r.id})" title="Assign to team members" style="background:none;border:none;color:${(r.assignedTo||(r.assignees||[]).length)?'var(--purp)':'var(--t3)'};cursor:pointer;font-size:11px;padding:2px 4px;border-radius:3px">👥</button>
          <button onclick="event.stopPropagation();deleteSavedReport(${r.id})" title="Delete" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:11px;padding:2px 4px;border-radius:3px">×</button>
        </span>`).join('')}
      </div>`;
    })()}
    ${typeof _renderSharedReportsSection==='function'?_renderSharedReportsSection():''}

    <!-- KPI tiles with sparklines -->
    ${(()=>{
      // Compute mini trend arrays for sparklines (compress dayKeys into ~14 buckets)
      const buckets=14;
      const bucketSize=Math.max(1,Math.ceil(dayKeys.length/buckets));
      const bucketIt=(arrByDay)=>{const out=[];for(let i=0;i<dayKeys.length;i+=bucketSize){let s=0;for(let j=i;j<Math.min(i+bucketSize,dayKeys.length);j++)s+=arrByDay[j]||0;out.push(s);}return out;};
      const sparkDone=bucketIt(completionByDay);
      const sparkCreated=bucketIt(dayKeys.map(k=>tasks.filter(t=>_dayOf(t.createdAt)===k).length));
      const sparkFocus=bucketIt(focusByDay);
      const sparkMood=bucketIt(dayKeys.map(k=>{const e=journal.find(j=>j&&jKey(j)===k);return e&&moodMap[e.mood]?moodMap[e.mood]:0;}));
      // R6: forecast chips on top KPIs
      const fcDone=_reportForecast(completionByDay.slice(-Math.min(14,completionByDay.length)),7);
      const fcFocus=_reportForecast(focusByDay.slice(-Math.min(14,focusByDay.length)),7);
      const fcChip=(fc,label)=>fc?`<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:8px;background:color-mix(in srgb,var(--ac) 14%,transparent);color:var(--ac);margin-top:4px" title="Linear projection from your last 14 days">📈 next 7d: ${fc.total}${label||''}</span>`:'';
      return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:18px">
        <div class="cd" style="padding:14px"><div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap"><div style="font-size:28px;font-weight:800;color:var(--ok);line-height:1">${tasksDoneRange.length}</div><div style="font-size:11px;color:var(--t3);font-weight:500">Tasks completed</div>${_renderDeltaChip(tasksDoneRange.length,prevDone)}</div>${_sparkline(sparkDone,'#22c55e')}<div>${fcChip(fcDone,'')}</div></div>
        <div class="cd" style="padding:14px"><div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap"><div style="font-size:28px;font-weight:800;color:var(--ac);line-height:1">${tasksCreatedRange.length}</div><div style="font-size:11px;color:var(--t3);font-weight:500">Tasks created</div>${_renderDeltaChip(tasksCreatedRange.length,prevCreated,{goodIsUp:false})}</div>${_sparkline(sparkCreated,'#3b82f6')}</div>
        <div class="cd" style="padding:14px"><div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap"><div style="font-size:28px;font-weight:800;color:var(--purp);line-height:1">${focusTotal}m</div><div style="font-size:11px;color:var(--t3);font-weight:500">Focus time</div>${_renderDeltaChip(focusTotal,prevFocus)}</div>${_sparkline(sparkFocus,'#a855f7')}<div>${fcChip(fcFocus,'m')}</div></div>
        <div class="cd" style="text-align:center;padding:14px"><div style="font-size:28px;font-weight:800;color:var(--warn)">${avgGoalPct}%</div><div style="font-size:11px;color:var(--t3);margin-top:2px">Avg goal progress</div></div>
        <div class="cd" style="padding:14px"><div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap"><div style="font-size:28px;font-weight:800;color:#f43f5e;line-height:1">${avgMood}</div><div style="font-size:11px;color:var(--t3);font-weight:500">Avg mood / 5</div>${_renderDeltaChip(journalRange.length,prevJournal,{goodIsUp:true})}</div>${_sparkline(sparkMood.filter(v=>v>0).length>1?sparkMood:[0,0],'#f43f5e')}</div>
        <div class="cd" style="text-align:center;padding:14px"><div style="font-size:28px;font-weight:800;color:#fb7185">🔥${topStreak.streak||0}</div><div style="font-size:11px;color:var(--t3);margin-top:2px">Top streak${topStreak.title&&topStreak.title!=='—'?': '+esc(topStreak.title):''}</div></div>
      </div>`;
    })()}

    <!-- Custom widgets — phase-1 report builder -->
    <div class="cd no-print" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--page-accent) 12%,var(--s2)),var(--s2));gap:8px;flex-wrap:wrap">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--t1)">🧱 Custom widgets <span style="font-size:11px;color:var(--t3);font-weight:400;margin-left:4px">drag ⋮⋮ to reorder · ⤢ to resize</span></div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${_reportWidgets.length?_reportWidgets.length+' widget'+(_reportWidgets.length===1?'':'s')+' on this report.':'Build your own report — pick a source, group, metric and viz, or just describe what you want.'}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-s" style="font-size:11px;height:28px;color:#a855f7" onclick="openAIWidgetBuilder()" title="Describe what you want and AI builds the widget">✨ AI Build</button>
        <button class="btn btn-s" style="font-size:11px;height:28px" onclick="emailCurrentReport()" title="Email this report to yourself">📧 Email Now</button>
        <button class="btn btn-p" style="font-size:11px;height:28px" onclick="addReportWidget()">+ Add Widget</button>
      </div>
    </div>
    ${_reportWidgets.length?`<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:12px;margin-bottom:18px">${_reportWidgets.map((w,i)=>_renderWidget(w,i)).join('')}</div>`:''}

    ${_reportSections.tasks?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">✓ Tasks Performance</h2>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:18px;align-items:start">
        <div>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:6px"><span>Completion trend (${barData.length} ${barStep===1?'days':'periods'})</span><span style="color:var(--t3);font-size:11px">click any bar to drill in</span></div>
          <div style="display:flex;align-items:flex-end;gap:3px;height:64px;padding:4px 0">${tasksBars}</div>
          <div style="display:flex;gap:3px;margin-top:2px">${tasksBarLabels}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Status breakdown (${sTotal} total)</div>
          <div style="display:flex;gap:10px;align-items:center">
            <div style="background:conic-gradient(${donutStops});width:70px;height:70px;border-radius:50%;flex-shrink:0"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:3px;font-size:11px">${Object.entries(tasksByStatus).map(([k,v])=>`<div style="display:flex;align-items:center;gap:4px;cursor:${v?'pointer':'default'}" ${v?`onclick="reportDrillDown('taskstatus','${k}')"`:''}><span style="width:8px;height:8px;background:${sColors[k]};border-radius:2px"></span><span style="flex:1;color:var(--t2)">${k}</span><strong>${v}</strong></div>`).join('')}</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px">
        ${Object.entries(tasksByPriority).map(([k,v])=>{const c={High:'var(--red)',Medium:'var(--warn)',Low:'var(--ok)'}[k];return `<div style="border:1px solid var(--bd1);border-radius:6px;padding:10px;text-align:center;cursor:${v?'pointer':'default'}" ${v?`onclick="reportDrillDown('taskpriority','${k}')"`:''}><div style="font-size:18px;font-weight:700;color:${c}">${v}</div><div style="font-size:11px;color:var(--t3)">Active ${k}</div></div>`;}).join('')}
      </div>
    </div>`:''}

    ${_reportSections.goals?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">🎯 Goals Progress</h2>
      ${goals.length?`
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
          <div style="text-align:center"><div style="font-size:22px;font-weight:700">${goals.length}</div><div style="font-size:11px;color:var(--t3)">Total goals</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--ok)">${goalsOnTrack}</div><div style="font-size:11px;color:var(--t3)">On track (≥50%)</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--warn)">${goalsBehind}</div><div style="font-size:11px;color:var(--t3)">Behind (&lt;30%)</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">${goals.map(g=>{const pct=g.pct||0;const c=pct>=70?'var(--ok)':(pct>=40?'var(--ac)':(pct>=20?'var(--warn)':'var(--red)'));const pace=_goalPaceCheck(g);return `<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;gap:6px;flex-wrap:wrap"><span>${g.icon||'🎯'} ${esc(g.title)}</span><span style="display:flex;align-items:center;gap:6px"><span style="font-size:11px;color:${pace.color};font-weight:600" title="Projected completion">${esc(pace.label)}</span><strong style="color:${c}">${pct}%</strong></span></div><div style="height:8px;background:var(--s3);border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c};border-radius:4px"></div></div></div>`;}).join('')}</div>
      `:'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No goals yet.</div>'}
    </div>`:''}

    ${_reportSections.habits?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">🔥 Habits Consistency</h2>
      ${dailyHabits.length?`
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
          <div style="text-align:center"><div style="font-size:22px;font-weight:700">${dailyHabits.length}</div><div style="font-size:11px;color:var(--t3)">Daily habits</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--ok)">${totalHabitCompletions}</div><div style="font-size:11px;color:var(--t3)">Completions in range</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--warn)">🔥 ${topStreak.streak||0}</div><div style="font-size:11px;color:var(--t3)">Top streak</div></div>
        </div>
        <div style="font-size:11px;color:var(--t3);margin-bottom:6px">Heatmap (${Math.min(days,90)} days, color = % of habits done)</div>
        <div style="display:grid;grid-template-columns:repeat(15,1fr);gap:4px">${habitCells}</div>
      `:'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No daily habits yet.</div>'}
    </div>`:''}

    ${_reportSections.focus?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">⏱ Focus Time</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
        <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--purp)">${focusTotal}m</div><div style="font-size:11px;color:var(--t3)">Total minutes</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:700">${(focusTotal/60).toFixed(1)}h</div><div style="font-size:11px;color:var(--t3)">Total hours</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:700">${days?Math.round(focusTotal/days):0}m</div><div style="font-size:11px;color:var(--t3)">Daily average</div></div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:60px">${focusBars}</div>
    </div>`:''}

    ${_reportSections.journal?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">📔 Journal & Mood</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div style="text-align:center"><div style="font-size:22px;font-weight:700">${journalRange.length}</div><div style="font-size:11px;color:var(--t3)">Entries in range</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:#f43f5e">${avgMood}/5</div><div style="font-size:11px;color:var(--t3)">Average mood</div></div>
        <div style="text-align:center"><div style="font-size:22px;font-weight:700">${journalScored.length}</div><div style="font-size:11px;color:var(--t3)">Mood-tagged</div></div>
      </div>
    </div>`:''}

    ${_reportSections.projects?`
    <div class="cd" style="margin-bottom:14px"><h2 style="font-size:14px;font-weight:700;margin-bottom:10px">📁 Projects</h2>
      ${projects.length?`<div style="display:flex;flex-direction:column;gap:6px">${projects.slice(0,12).map(p=>{const pct=p.pct||0;const c=pct>=70?'var(--ok)':(pct>=40?'var(--ac)':'var(--warn)');return `<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span>${esc(p.name)} <span style="color:var(--t3);font-size:11px">${esc(p.status||'')}</span></span><strong style="color:${c}">${pct}%</strong></div><div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c};border-radius:3px"></div></div></div>`;}).join('')}</div>`:'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">No projects yet.</div>'}
    </div>`:''}

    <div class="no-print" style="text-align:center;color:var(--t3);font-size:11px;margin:24px 0 12px">Generated ${new Date().toLocaleString()} · LevelUp Second Brain</div>
  </div>`;
  // Auto-fetch AI panels (cached per filter combo so this is cheap on re-renders)
  setTimeout(()=>{aiReportNarrative();aiReportAnomalies();},150);
}

function openReportCustomize(){
  const sections=[{k:'tasks',label:'Tasks Performance'},{k:'goals',label:'Goals Progress'},{k:'habits',label:'Habits Consistency'},{k:'focus',label:'Focus Time'},{k:'journal',label:'Journal & Mood'},{k:'projects',label:'Projects'}];
  const html=`<div style="padding:18px;min-width:320px">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">⚙ Customize Report</h3>
    <p style="font-size:11px;color:var(--t3);margin-bottom:12px">Toggle sections to include in your report. Saves automatically.</p>
    ${sections.map(s=>`<div class="lr" style="padding:6px 0"><label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;flex:1"><input type="checkbox" ${_reportSections[s.k]?'checked':''} onchange="toggleReportSection('${s.k}')">${s.label}</label></div>`).join('')}
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-s" onclick="closeModal()">Done</button></div>
  </div>`;
  const mc=document.getElementById('modal-content');if(mc)mc.innerHTML=html;
  document.getElementById('modal-capture').classList.add('show');
  document.body.style.overflow='hidden';
}

// BUGFIX: Archive was hardcoded placeholder UI — dead tabs, dead search,
// fake rows, dead Restore. Rebuilt to aggregate real completed/archived
// items with working filter tabs, search and restore.
let _archiveTab='All';
let _archiveSearch='';
function setArchiveTab(t){_archiveTab=t;renderArchive();}
function archiveSearchInput(v){_archiveSearch=(v||'').toLowerCase();renderArchive();}
function _archiveItems(){
  const items=[];
  (D.tasks||[]).forEach(t=>{if(t.status==='Done')items.push({type:'Task',id:t.id,title:t.title||'(untitled task)',date:(t.completedAt||t.updated||t.createdAt||''),restore:'task'});});
  (D.projects||[]).forEach(p=>{if(p.archived)items.push({type:'Project',id:p.id,title:p.name||'(untitled project)',date:(p.archivedAt||p.updatedAt||p.updated||''),restore:'project'});});
  (D.goals||[]).forEach(g=>{if((g.pct||0)>=100)items.push({type:'Goal',id:g.id,title:(g.icon?g.icon+' ':'')+(g.title||'(untitled goal)'),date:(g.updatedAt||g.completedAt||''),restore:'goal'});});
  (D.notes||[]).forEach(n=>{if(n.archived)items.push({type:'Note',id:n.id,title:n.title||'(untitled note)',date:(n.updated||n.createdAt||''),restore:'note'});});
  return items.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
function archiveRestore(type,id){
  if(type==='task'){const t=D.tasks.find(x=>x.id===id);if(t){setTaskStatus(t,'Not Started');toast('↩ Task reopened');}}
  else if(type==='project'){const p=D.projects.find(x=>x.id===id);if(p){p.archived=false;save('projects');toast('↩ Project restored');}}
  else if(type==='goal'){const g=D.goals.find(x=>x.id===id);if(g){if(typeof openDrawer==='function')openDrawer('goal',g);return;}}
  else if(type==='note'){const n=D.notes.find(x=>x.id===id);if(n){n.archived=false;save('notes');toast('↩ Note restored');}}
  renderArchive();
}
function renderArchive(){
  const tabs=['All','Task','Project','Goal','Note'];
  let items=_archiveItems();
  const counts={All:items.length};
  tabs.slice(1).forEach(t=>counts[t]=items.filter(i=>i.type===t).length);
  if(_archiveTab!=='All')items=items.filter(i=>i.type===_archiveTab);
  if(_archiveSearch)items=items.filter(i=>(i.title||'').toLowerCase().includes(_archiveSearch));
  const fmt=d=>{if(!d)return '';try{const dt=_pd(d);return isNaN(dt)?'':dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch(_){return '';}};
  const typeColors={Task:'var(--ac)',Project:'var(--purp)',Goal:'var(--red)',Note:'var(--ok)'};
  const rows=items.length?items.map(i=>`<div class="lr">
    <span style="font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--s3);color:${typeColors[i.type]||'var(--t3)'}">${i.type}</span>
    <span class="rt" style="cursor:pointer" onclick="archiveRestore('${i.restore}',${i.id})" title="Open / restore">${esc(i.title)}</span>
    <span class="rm">${fmt(i.date)||'<span style="color:var(--t3)">—</span>'}</span>
    <span class="acts"><button class="btn btn-s" style="height:20px;font-size:10px;padding:0 8px" onclick="archiveRestore('${i.restore}',${i.id})">${i.type==='Goal'?'Open':'↩ Restore'}</button></span>
  </div>`).join(''):`<div style="text-align:center;padding:36px 16px;color:var(--t3);font-size:12px">Nothing archived${_archiveTab!=='All'?` in ${_archiveTab}s`:''}${_archiveSearch?' matching your search':''}. Completed tasks, archived projects, finished goals and archived notes appear here.</div>`;
  $('arch-main').innerHTML=`<div class="pg-h"><h1>🗄 Archive</h1><p style="font-size:12px;color:var(--t2)">${counts.All} item${counts.All===1?'':'s'} · completed &amp; archived</p></div>
<div class="tabs">${tabs.map(t=>`<div class="tab ${_archiveTab===t?'on':''}" onclick="setArchiveTab('${t}')">${t==='All'?'All':t+'s'}${counts[t]?` <span class="tc">${counts[t]}</span>`:''}</div>`).join('')}</div>
<input class="inp" style="margin-bottom:10px" placeholder="🔍 Search archive..." value="${esc(_archiveSearch)}" oninput="_keepFocus(()=>archiveSearchInput(this.value))">
<div class="cd">${rows}</div>`;
}

function renderMyDay(){
// Restore the user's last subnav choice; default to Execute (most-used view).
const _mdSec=(D.prefs&&D.prefs.myDaySection)||'e';
$('myday-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('sun',22,'var(--page-accent)')}My Day</h1><p style="font-size:12px;color:var(--t2)">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})} · ${D.tasks.filter(t=>t.myDay).length} selected</p>${_focusViewTabs('myday')}</div><div style="display:flex;gap:4px"><button class="btn btn-s" onclick="startFreshMyDay()" title="Clear all My Day flags and start fresh for today">🔄 Start Fresh</button><button class="btn btn-s" onclick="D.tasks.forEach(t=>t.myDay=false);save('tasks');renderScreen('myday')">Clear All</button><button class="btn btn-p" onclick="openFA('task')">+ Full Add</button></div></div>
<div class="subnav"><span class="sn ${_mdSec==='p'?'on':''}" onclick="mdSec(this,'p')">📋 Plan</span><span class="sn ${_mdSec==='e'?'on':''}" onclick="mdSec(this,'e')">⚡ Execute</span><span class="sn ${_mdSec==='w'?'on':''}" onclick="mdSec(this,'w')">🌙 Wrap-Up</span></div>
<div id="md-p" style="display:${_mdSec==='p'?'':'none'}">${_renderCapacityIndicator()}<div class="sec-h" style="display:flex;align-items:center;justify-content:space-between"><span>📋 Plan — Select tasks for today</span><div style="display:flex;gap:5px"><button class="btn btn-s" style="font-size:11px;height:24px;color:var(--purp);border-color:var(--purp)" onclick="aiSmartSchedule()" title="AI builds a time-blocked schedule that respects your calendar + peak focus hours">🧠 AI Smart Plan</button><button class="btn btn-s" style="font-size:11px;height:24px" onclick="scheduleMyDay()" title="Linear auto-assign (basic) — ignores calendar events">🗓 Basic Schedule</button></div></div>
<div class="cd">${D.tasks.filter(t=>t.status!=='Done').map(t=>`<div class="lr" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><div class="chk ${t.myDay?'on':''}" onclick="event.stopPropagation();D.tasks.find(x=>x.id==${_tidLit(t.id)}).myDay=!D.tasks.find(x=>x.id==${_tidLit(t.id)}).myDay;save('tasks');renderScreen('myday')"></div><span class="rt">${esc(t.title)}</span><span class="pill ${pillClass(t.priority)}">${t.priority}</span><span class="rm">${t.context}</span><span style="cursor:pointer;font-size:12px" title="Toggle My Day">${t.myDay?'☀️':'○'}</span></div>`).join('')}</div></div>
<div id="md-e" style="display:${_mdSec==='e'?'':'none'}">
<div id="pomo-bar" style="background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:10px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
  <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
    <div id="pomo-timer" style="font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ac);letter-spacing:1px">25:00</div>
    <div id="pomo-label" style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Focus</div>
  </div>
  <div style="flex:1;min-width:120px">
    <div id="pomo-task-name" style="font-size:11px;font-weight:500;color:var(--t1);margin-bottom:3px">No task selected</div>
    <div style="background:var(--s3);border-radius:3px;height:4px;overflow:hidden"><div id="pomo-progress" style="background:var(--ac);height:100%;width:0%;transition:width 1s linear"></div></div>
    <div id="pomo-sessions" style="font-size:11px;color:var(--t3);margin-top:2px">Session 1 of 4</div>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">
    <button class="btn btn-p" id="pomo-btn" onclick="pomoToggle()" style="min-width:64px">▶ Start</button>
    <button class="btn btn-s" onclick="pomoReset()">↺ Reset</button>
    <select class="inp" id="pomo-mode" aria-label="Focus timer mode" onchange="pomoSetMode(this.value)" style="font-size:11px;padding:2px 6px;height:26px">
      ${[['25','25 min Focus'],['50','50 min Deep Work'],['5','5 min Break'],['15','15 min Long Break']]
        .map(([v,l])=>`<option value="${v}" ${String(Math.round(_pomoTotal/60))===v?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>
</div>
<div class="sec-h">⚡ Execute — My Day tasks</div>
<div class="tabs"><div class="tab on" onclick="mdExecFilter(this,'all')">All</div><div class="tab" onclick="mdExecFilter(this,'high')">High Priority</div><div class="tab" onclick="mdExecFilter(this,'quickwin')">⚡ Quick Wins</div><div class="tab" onclick="mdExecFilter(this,'pending')">Pending</div><div class="tab" onclick="mdExecFilter(this,'done')">Done</div></div>
<div id="md-exec-summary">${getMdExecSummary('all')}</div><div id="md-exec-list">${renderMdExecList('all')}</div></div>
<div id="md-w" style="display:${_mdSec==='w'?'':'none'}"><div class="sec-h">🌙 Wrap-Up</div>
<div class="g3" style="margin-bottom:12px">
  <div class="stat"><div class="stat-n" style="color:var(--ok)">${D.tasks.filter(t=>t.status==='Done').length}</div><div class="stat-l">Done today</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--warn)">${D.tasks.filter(t=>t.myDay&&t.status!=='Done').length}</div><div class="stat-l">Carried over</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--ac)">${Math.floor((D.prefs&&D.prefs.focusMinsToday||0)/60)+'h '+(D.prefs&&D.prefs.focusMinsToday||0)%60+'m'}</div><div class="stat-l">Focus time</div></div>
</div>
<div class="cd">
  <div style="font-size:12px;font-weight:600;margin-bottom:8px">📝 Daily Reflection</div>
  <div style="font-size:11px;color:var(--t3);margin-bottom:4px">What went well today?</div>
  <textarea class="inp" id="wrapup-wins" placeholder="Wins, breakthroughs, things to celebrate..." style="height:56px;margin-bottom:8px"></textarea>
  <div style="font-size:11px;color:var(--t3);margin-bottom:4px">What could be improved?</div>
  <textarea class="inp" id="wrapup-improve" placeholder="Challenges, blockers, lessons learned..." style="height:56px;margin-bottom:8px"></textarea>
  <div style="font-size:11px;color:var(--t3);margin-bottom:4px">Top priority for tomorrow?</div>
  <textarea class="inp" id="wrapup-tomorrow" placeholder="One thing that will make tomorrow great..." style="height:40px;margin-bottom:10px"></textarea>
  <button class="btn btn-p" style="width:100%" onclick="saveWrapUp()">Save as Journal Entry</button>
</div></div>`;
// ── Right rail: Day at a Glance + Up Next + Today's meetings + Quick Wins + Quick Capture
_populateMyDayRail();
}
function _populateMyDayRail(){
  const rail=document.getElementById('myday-rail');
  if(!rail)return;
  const today=_todayStr;
  const myDay=D.tasks.filter(t=>t.myDay);
  const myDone=myDay.filter(t=>t.status==='Done').length;
  const myTotal=myDay.length;
  const pct=myTotal?Math.round(myDone/myTotal*100):0;
  const focusMins=Number((D.prefs&&D.prefs.focusLog||{})[today]||0);
  const totalMins=myDay.reduce((s,t)=>s+(Number(t.estimatedMins)||0),0);
  const doneMins=myDay.filter(t=>t.status==='Done').reduce((s,t)=>s+(Number(t.estimatedMins)||0),0);
  const remainMins=Math.max(0,totalMins-doneMins);
  const fmtH=m=>{const h=Math.floor(m/60),mm=m%60;return (h?h+'h ':'')+(mm?mm+'m':(h?'':'0m'));};
  // Donut
  const ringStyle=`background:conic-gradient(var(--ok) 0% ${pct}%, var(--s3) ${pct}% 100%);width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center`;
  // Up Next: next 3 not-done My Day tasks. Smart sort: scheduled startTime → priority → soonest due.
  const priRank={High:3,Medium:2,Low:1};
  const upNext=myDay.filter(t=>t.status!=='Done').slice().sort((a,b)=>{
    const ta=a.startTime||'99:99',tb=b.startTime||'99:99';
    if(ta!==tb)return ta<tb?-1:1;
    const pr=(priRank[b.priority||'Medium']||0)-(priRank[a.priority||'Medium']||0);
    if(pr)return pr;
    return (a.due||'9999').localeCompare(b.due||'9999');
  }).slice(0,4);
  const upNextHtml=upNext.length?upNext.map(t=>{
    const colors={High:'#ef4444',Medium:'#f59e0b',Low:'#10b981'};
    const dot=`<span style="width:6px;height:6px;border-radius:50%;background:${colors[t.priority]||'var(--t3)'};flex-shrink:0"></span>`;
    const time=t.startTime?`<span style="font-size:11px;color:var(--ac);font-weight:600;margin-left:4px">⏰ ${esc(t.startTime)}</span>`:'';
    return `<div class="lr" style="cursor:pointer;padding:5px 6px" onclick="pomoSelectTask(${_tidLit(t.id)});mdSec(document.querySelector('#s-myday .sn:nth-child(2)'),'e')" title="Focus on this task">${dot}<span class="rt" style="font-size:11px">${esc(t.title)}</span>${time}</div>`;
  }).join(''):`<div style="font-size:11px;color:var(--t3);padding:6px;text-align:center">All My Day tasks done — go celebrate. 🎉</div>`;
  // Today's meetings
  const meetings=_calMeetingsOn(today).sort((a,b)=>(a.start||'').localeCompare(b.start||'')).slice(0,4);
  const now=new Date();
  const meetingHtml=meetings.length?meetings.map(e=>{
    const s=_pd(e.start);
    const fmtT=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    const mins=Math.floor((s-now)/60000);
    const rel=mins<-15?'past':mins<0?'now':mins<60?`in ${mins}m`:`in ${Math.floor(mins/60)}h${mins%60?' '+(mins%60)+'m':''}`;
    const isPast=mins<-15;
    return `<div class="lr" style="padding:5px 6px;${isPast?'opacity:.55':''}"><span style="font-size:13px;flex-shrink:0">📅</span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title||'(untitled)')}</div><div style="font-size:11px;color:var(--t3)">${fmtT(s)}</div></div><span style="font-size:11px;padding:2px 5px;border-radius:3px;background:var(--acs);color:var(--ach);flex-shrink:0">${rel}</span></div>`;
  }).join(''):`<div style="font-size:11px;color:var(--t3);padding:6px;text-align:center">No meetings today.</div>`;
  // Quick wins (≤15 min, not done, on My Day or due/scheduled today)
  const wins=D.tasks.filter(t=>t.status!=='Done'&&(Number(t.estimatedMins)||999)<=15&&(t.myDay||t.due===today||t.startDate===today)).slice(0,5);
  const winsHtml=wins.length?wins.map(t=>`<div class="lr" style="cursor:pointer;padding:4px 6px" onclick="toggleTask(${_tidLit(t.id)});setTimeout(()=>renderScreen('myday'),100)" title="Click to mark done"><span style="font-size:11px;flex-shrink:0">⚡</span><span class="rt" style="font-size:11px">${esc(t.title)}</span><span style="font-size:11px;color:var(--t3);flex-shrink:0">${t.estimatedMins||'?'}m</span></div>`).join(''):`<div style="font-size:11px;color:var(--t3);padding:6px;text-align:center">No quick wins — set 'Estimated mins' on tasks to see them here.</div>`;
  // Habits today snapshot
  const hbs=(D.habits||[]).filter(h=>h.cadence==='Daily');
  const hbsDone=hbs.filter(h=>h.doneToday).length;
  const habitsHtml=hbs.length?`<div style="display:flex;align-items:center;gap:6px;font-size:11px"><strong style="color:${hbsDone===hbs.length?'var(--ok)':'var(--warn)'}">${hbsDone}/${hbs.length}</strong> habits done<div style="flex:1;height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;width:${hbs.length?Math.round(hbsDone/hbs.length*100):0}%;background:${hbsDone===hbs.length?'var(--ok)':'var(--warn)'};border-radius:3px"></div></div></div>`:`<div style="font-size:11px;color:var(--t3)">No daily habits set up.</div>`;
  rail.innerHTML=`
  <div class="cd" style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">📊 Day at a Glance</div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="${ringStyle};flex-shrink:0"><div style="width:68px;height:68px;background:var(--bg);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:18px;font-weight:700;color:${pct===100?'var(--ok)':'var(--ac)'};line-height:1">${pct}%</div><div style="font-size:9px;color:var(--t3);margin-top:2px">${myDone}/${myTotal}</div></div></div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;font-size:11px">
        <div>⏱ <strong>${focusMins}m</strong> <span style="color:var(--t3)">focus today</span></div>
        <div>🎯 <strong>${fmtH(remainMins)}</strong> <span style="color:var(--t3)">work left</span></div>
        <div style="margin-top:2px">${habitsHtml}</div>
      </div>
    </div>
  </div>
  <div class="cd" style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">⏭ Up Next</div>
    ${upNextHtml}
  </div>
  <div class="cd" style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">📅 Today's Meetings</div>
    ${meetingHtml}
  </div>
  <div class="cd" style="margin-bottom:10px">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">⚡ Quick Wins (≤15m)</div>
    ${winsHtml}
  </div>
  <div class="cd">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">✏ Quick Capture</div>
    <textarea id="md-rail-cap" class="inp" placeholder="Brain dump — Enter to save as task" style="font-size:11px;height:54px;margin-bottom:6px" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();_mdRailCapture();}"></textarea>
    <div style="display:flex;gap:5px">
      <button class="btn btn-p" style="flex:1;font-size:11px;height:24px" onclick="_mdRailCapture()">+ Task</button>
      <button class="btn btn-s" style="flex:1;font-size:11px;height:24px" onclick="_mdRailCaptureNote()">+ Note</button>
    </div>
  </div>`;
}
function _mdRailCapture(){
  const ta=document.getElementById('md-rail-cap');if(!ta)return;
  const v=(ta.value||'').trim();if(!v){ta.focus();return;}
  D.tasks.push({id:nextId(D.tasks),title:v,priority:'Medium',due:_todayStr,context:'Inbox',project:'',status:'Not Started',myDay:true,energy:'',notes:'',createdAt:new Date().toISOString(),createdBy:D.creds.userName||'Idris Grant'});
  save('tasks');
  ta.value='';
  toast('☀ Added to My Day');
  renderScreen('myday');
}
function _mdRailCaptureNote(){
  const ta=document.getElementById('md-rail-cap');if(!ta)return;
  const v=(ta.value||'').trim();if(!v){ta.focus();return;}
  const firstLine=v.split('\n')[0].slice(0,80);
  D.notes.unshift({id:nextId(D.notes),title:firstLine||'Quick note',body:v,tags:[],created:new Date().toISOString(),updated:new Date().toISOString(),createdAt:new Date().toISOString()});
  save('notes');
  ta.value='';
  toast('📝 Saved to Notes');
}
function mdSec(el,s){el.parentElement.querySelectorAll('.sn').forEach(x=>x.classList.remove('on'));el.classList.add('on');['p','e','w'].forEach(x=>document.getElementById('md-'+x).style.display=x===s?'':'none');D.prefs=D.prefs||{};D.prefs.myDaySection=s;save('prefs');}
function saveWrapUp(){
  const wins=(document.getElementById('wrapup-wins')||{}).value||'';
  const improve=(document.getElementById('wrapup-improve')||{}).value||'';
  const tomorrow=(document.getElementById('wrapup-tomorrow')||{}).value||'';
  if(!wins&&!improve&&!tomorrow){toast('Please fill in at least one reflection field.');return;}
  const today=new Date();
  const dateStr=today.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const body=[
    wins?'**What went well:**\n'+wins:'',
    improve?'**What could be improved:**\n'+improve:'',
    tomorrow?'**Top priority for tomorrow:**\n'+tomorrow:'',
    '---',
    '🍅 Focus sessions today: '+(D.prefs&&D.prefs.focusMinsToday||0)+' mins',
    '✅ Tasks done: '+D.tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)===_todayStr).length,
    '⏳ Carried over: '+D.tasks.filter(t=>t.myDay&&t.status!=='Done').length,
  ].filter(Boolean).join('\n\n');
  const entry={
    id:nextId(D.journal),
    date:_ymd(today),
    title:'Daily Wrap-Up — '+dateStr,
    body,
    mood:'😊',
    energy:'medium',
    tags:['wrap-up','daily-review'],
    created:today.toISOString(),
    createdAt:new Date().toISOString(),
  };
  D.journal.unshift(entry);
  save('journal');
  // Reset fields
  ['wrapup-wins','wrapup-improve','wrapup-tomorrow'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  toast('📝 Wrap-Up saved to Journal!');
}
function getMdExecSummary(filter){
  let tasks=D.tasks.filter(t=>t.myDay);
  if(filter==='high')tasks=tasks.filter(t=>t.priority==='High');
  else if(filter==='quickwin')tasks=tasks.filter(t=>t.status!=='Done'&&(t.estimatedMins||999)<=15);
  else if(filter==='pending')tasks=tasks.filter(t=>t.status!=='Done');
  else if(filter==='done')tasks=tasks.filter(t=>t.status==='Done');
  const total=tasks.reduce((s,t)=>s+(t.estimatedMins||0),0);
  const done=tasks.filter(t=>t.status==='Done').length;
  const pending=tasks.filter(t=>t.status!=='Done').length;
  if(!tasks.length)return '';
  const hrs=Math.floor(total/60),mins=total%60;
  const timeStr=total?`⏱ ${hrs?hrs+'h ':''}${mins?mins+'m':''} estimated`:'⏱ No estimates set';
  const pct=tasks.length?Math.round(done/tasks.length*100):0;
  return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--s2);border-radius:6px;margin-bottom:8px;font-size:11px;color:var(--t2);flex-wrap:wrap">
    <span style="color:var(--t3)">${timeStr}</span>
    <span style="color:var(--t3)">·</span>
    <span>${done} done</span>
    <span style="color:var(--t3)">·</span>
    <span>${pending} pending</span>
    <div style="flex:1;min-width:60px;height:4px;background:var(--s3);border-radius:2px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--ok,#10B981);border-radius:2px;transition:width .3s"></div></div>
    <span style="font-size:11px;color:var(--t3)">${pct}%</span>
  </div>`;
}
function renderMdExecList(filter){
  let tasks=D.tasks.filter(t=>t.myDay);
  if(filter==='high')tasks=tasks.filter(t=>t.priority==='High');
  else if(filter==='quickwin')tasks=tasks.filter(t=>t.status!=='Done'&&(t.estimatedMins||999)<=15);
  else if(filter==='pending')tasks=tasks.filter(t=>t.status!=='Done');
  else if(filter==='done')tasks=tasks.filter(t=>t.status==='Done');
  if(!tasks.length)return '<p style="color:var(--t3);font-size:12px;text-align:center;padding:20px">'+
    (filter==='done'?'No completed tasks yet today.':filter==='quickwin'?'No quick wins (≤15 min) on My Day. Add estimated time to tasks to see them here.':'Nothing here. Go to Plan to add tasks.')+'</p>';
  return tasks.map(t=>{
    const subs=t.subtasks||[];
    const subsDone=subs.filter(s=>s.done).length;
    const colors={High:'var(--err,#EF4444)',Medium:'var(--warn,#F59E0B)',Low:'var(--ok,#10B981)'};
    return`<div class="cd" style="margin-bottom:8px;border-left:3px solid ${colors[t.priority]||'var(--bd2)'}" id="exec-card-${t.id}">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div class="chk ${t.status==='Done'?'on':''}" style="margin-top:2px;flex-shrink:0" onclick="toggleTask(${_tidLit(t.id)})"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span id="exec-title-${t.id}" style="font-size:13px;font-weight:500;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}" onclick="startInlineEdit(${_tidLit(t.id)})" title="Click to edit">${esc(t.title)}</span>
            <span class="pill ${pillClass(t.priority)}" style="font-size:11px">${t.priority}</span>
            ${t.context?`<span style="font-size:11px;color:var(--t3)">${esc(t.context)}</span>`:''}
            ${t.startTime?`<span style="font-size:11px;color:var(--t2)">⏰ ${t.startTime}${t.endTime?' – '+t.endTime:''}</span>`:''}
          </div>
          ${t.due?`<div style="font-size:11px;color:var(--t3);margin-top:2px">📅 Due ${fmtDate(t.due)}${t.estimatedMins?' · ⏱ '+t.estimatedMins+'m':''}</div>`:''}          ${subs.length?`<div style="margin-top:5px">${subs.map((s,si)=>`<div class="lr" style="padding:2px 0"><div class="chk ${s.done?'on':''}" style="width:11px;height:11px" onclick="toggleSubtask(${_tidLit(t.id)},${si})"></div><span style="font-size:11px;${s.done?'text-decoration:line-through;color:var(--t3)':''}">${esc(s.title)}</span></div>`).join('')}<div style="font-size:11px;color:var(--t3);margin-top:2px">${subsDone}/${subs.length} subtasks done</div></div>`:''}
          ${t.notes?`<div style="font-size:11px;color:var(--t2);margin-top:4px;font-style:italic">${esc(t.notes)}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
          <button class="btn btn-p" style="font-size:10px;padding:1px 6px;height:20px" title="Focus on this task" onclick="pomoSelectTask(${_tidLit(t.id)});toast('🎯 Focusing on: '+esc(D.tasks.find(x=>x.id==${_tidLit(t.id)})?.title||''))">⏱</button>
          <button class="btn btn-s" style="font-size:10px;padding:1px 6px;height:20px" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))">✏</button>
          <button class="btn btn-s" style="font-size:10px;padding:1px 6px;height:20px" onclick="D.tasks.find(x=>x.id==${_tidLit(t.id)}).myDay=false;save('tasks');renderScreen('myday')">✕</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function mdExecFilter(el,filter){
  el.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  el.classList.add('on');
  const list=document.getElementById('md-exec-list');
  if(list)list.innerHTML=renderMdExecList(filter);
  const summ=document.getElementById('md-exec-summary');
  if(summ)summ.innerHTML=getMdExecSummary(filter);
}
function startInlineEdit(taskId){
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  const span=document.getElementById('exec-title-'+taskId);
  if(!span)return;
  const inp=document.createElement('input');
  inp.className='inp';
  inp.value=t.title;
  inp.style.cssText='font-size:13px;font-weight:500;padding:1px 4px;height:22px;width:100%';
  inp.onblur=()=>{t.title=inp.value.trim()||t.title;save('tasks');renderScreen('myday');};
  inp.onkeydown=(e)=>{if(e.key==='Enter'){e.preventDefault();inp.blur();}if(e.key==='Escape'){renderScreen('myday');}}
  span.replaceWith(inp);
  inp.focus();
  inp.select();
}
// toggleSubtask is defined above (unified)
// ====== POMODORO FOCUS TIMER ======
let _pomoInterval=null,_pomoSecs=25*60,_pomoTotal=25*60,_pomoRunning=false,_pomoSession=1,_pomoTaskId=null;
function pomoSetMode(mins){
  if(_pomoRunning)pomoToggle();
  _pomoTotal=parseInt(mins)*60;
  _pomoSecs=_pomoTotal;
  _pomoUpdateDisplay();
}
function _pomoUpdateDisplay(){
  const m=Math.floor(_pomoSecs/60),s=_pomoSecs%60;
  const el=document.getElementById('pomo-timer');
  if(el)el.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  const prog=document.getElementById('pomo-progress');
  if(prog)prog.style.width=(((_pomoTotal-_pomoSecs)/_pomoTotal)*100)+'%';
  const sess=document.getElementById('pomo-sessions');
  if(sess)sess.textContent='Session '+_pomoSession+' of 4';
}
function pomoToggle(){
  const btn=document.getElementById('pomo-btn');
  if(_pomoRunning){
    clearInterval(_pomoInterval);
    _pomoRunning=false;
    if(btn)btn.textContent='▶ Resume';
  } else {
    _pomoRunning=true;
    if(btn)btn.textContent='⏸ Pause';
    _pomoInterval=setInterval(()=>{
      _pomoSecs--;
      _pomoUpdateDisplay();
      if(_pomoSecs<=0){
        clearInterval(_pomoInterval);
        _pomoRunning=false;
        const isBreak=_pomoTotal<=15*60&&_pomoTotal>=5*60;
        if(!isBreak){
          // Offer to complete the linked task — one session rarely finishes a
          // task, and it used to be marked Done after the first one.
          if(_pomoTaskId){
            const t=D.tasks.find(x=>x.id===_pomoTaskId);
            if(t&&t.status!=='Done'){const tid=_pomoTaskId;setTimeout(()=>toast({type:'info',title:'Session done on "'+t.title+'"',msg:'Is the task finished?',duration:9000,actions:[{label:'✓ Mark done',primary:true,onClick:()=>toggleTask(tid)}]}),400);}
          }
          // Log focus time to D.prefs
          D.prefs=D.prefs||{};
          D.prefs.focusMinsToday=(D.prefs.focusMinsToday||0)+Math.round(_pomoTotal/60);
          // Record in 7-day rolling log
          const _today=_ymd(new Date());
          D.prefs.focusLog=D.prefs.focusLog||{};
          D.prefs.focusLog[_today]=(D.prefs.focusLog[_today]||0)+Math.round(_pomoTotal/60);
          // Per-hour tracker for the Peak Focus Hour Home widget.
          D.prefs.focusByHour=D.prefs.focusByHour||{};
          const _hr=new Date().getHours();
          D.prefs.focusByHour[_hr]=(D.prefs.focusByHour[_hr]||0)+Math.round(_pomoTotal/60);
          // Trim to last 30 days
          const _keys=Object.keys(D.prefs.focusLog).sort();
          if(_keys.length>30)_keys.slice(0,_keys.length-30).forEach(k=>delete D.prefs.focusLog[k]);
          save('prefs');
          _pomoSession=Math.min(_pomoSession+1,4);
          toast('🍅 Focus session complete! Take a break.');
          // Auto-switch to 5-min break
          _pomoTotal=5*60;
          _pomoSecs=5*60;
          const sel=document.getElementById('pomo-mode');
          if(sel)sel.value='5';
          const lbl=document.getElementById('pomo-label');
          if(lbl)lbl.textContent='Break';
        } else {
          toast('⚡ Break over! Back to focus.');
          _pomoTotal=25*60;
          _pomoSecs=25*60;
          const sel=document.getElementById('pomo-mode');
          if(sel)sel.value='25';
          const lbl=document.getElementById('pomo-label');
          if(lbl)lbl.textContent='Focus';
        }
        _pomoUpdateDisplay();
        if(btn)btn.textContent='▶ Start';
      }
    },1000);
  }
}
function pomoReset(){
  clearInterval(_pomoInterval);
  _pomoRunning=false;
  const sel=document.getElementById('pomo-mode');
  _pomoTotal=(sel?parseInt(sel.value):25)*60;
  _pomoSecs=_pomoTotal;
  _pomoUpdateDisplay();
  const btn=document.getElementById('pomo-btn');
  if(btn)btn.textContent='▶ Start';
}
function pomoSelectTask(taskId){
  _pomoTaskId=taskId;
  const t=D.tasks.find(x=>x.id===taskId);
  const el=document.getElementById('pomo-task-name');
  if(el&&t)el.textContent='🎯 '+t.title;
}

function getWeekDates(offsetWeeks=0){
  const now=new Date();
  const day=now.getDay();
  const mon=_pd(now);
  mon.setDate(now.getDate()-(day===0?6:day-1)+offsetWeeks*7);
  return Array.from({length:7},(_,i)=>{const d=_pd(mon);d.setDate(mon.getDate()+i);return d;});
}
let weekOffset=0;
function renderMyWeek(){
  const days=getWeekDates(weekOffset);
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today=new Date().toDateString();
  const fmt=d=>_ymd(d);
  const label=d=>dayNames[d.getDay()===0?6:d.getDay()-1]+' '+d.getDate();
  // Group tasks by their startDate or due date falling within this week
  const weekStart=fmt(days[0]);
  const weekEnd=fmt(days[6]);
  function tasksForDay(d){
    const ds=fmt(d);
    return D.tasks.filter(t=>{
      const td=t.startDate||t.due||'';
      return td===ds;
    });
  }
  // Unscheduled tasks (no startDate, not done)
  const unscheduled=D.tasks.filter(t=>!t.startDate&&!t.due&&t.status!=='Done').slice(0,10);
  const overdue=D.tasks.filter(t=>{
    const td=t.startDate||t.due||'';
    return td&&td<weekStart&&t.status!=='Done';
  });
  const colHtml=days.map((d,i)=>{
    const ds=fmt(d);
    const isToday=d.toDateString()===today;
    const pts=tasksForDay(d);
    return`<div class="wk-col" id="wkcol-${ds}" data-date="${ds}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropTaskOnDay(event,'${ds}')" style="flex:1;min-width:0;background:var(--s2);border-radius:6px;padding:6px;border:2px solid ${isToday?'var(--ac)':'transparent'};transition:border-color .15s">
      <div style="font-size:11px;font-weight:600;text-align:center;margin-bottom:5px;color:${isToday?'var(--ac)':'var(--t2)'}">${label(d)}${isToday?' • Today':''}</div>
      <div id="wkday-${ds}" style="min-height:60px">
        ${pts.map(t=>weekTaskChip(t)).join('')}
      </div>
      <div style="font-size:11px;color:var(--t3);text-align:center;margin-top:4px;cursor:pointer" onclick="quickAddToDay('${ds}')">+ Add</div>
    </div>`;
  }).join('');
  $('myweek-main').innerHTML=`
  <div class="ph-r" style="margin-bottom:12px">
    <div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('calendar',22,'var(--page-accent)')}My Week</h1><p style="font-size:12px;color:var(--t2)">${days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${days[6].toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</p>${_focusViewTabs('myweek')}</div>
    <div style="display:flex;gap:4px">
      <button class="btn btn-s" onclick="weekOffset--;renderMyWeek()">← Prev</button>
      <button class="btn btn-s" onclick="weekOffset=0;renderMyWeek()">Today</button>
      <button class="btn btn-s" onclick="weekOffset++;renderMyWeek()">Next →</button>
      <button class="btn btn-p" onclick="openFA('task')">+ Task</button>
    </div>
  </div>
  ${overdue.length?`<div style="background:var(--wrn-bg,#fff3cd);border:1px solid var(--warn);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px">⚠️ <strong>${overdue.length} overdue task${overdue.length>1?'s':''}</strong> — <span style="color:var(--t2)">${overdue.slice(0,3).map(t=>esc(t.title)).join(', ')}${overdue.length>3?'...':''}</span></div>`:''}
  <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px">${colHtml}</div>
  ${unscheduled.length?`<div style="margin-top:12px"><div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--t2)">📥 Unscheduled (drag to a day)</div><div style="display:flex;flex-wrap:wrap;gap:5px">${unscheduled.map(t=>weekTaskChip(t,true)).join('')}</div></div>`:''}
  ${(()=>{const parked=(D.ideas||[]).filter(x=>x.verdict_outcome==='parked'&&x.parked_review_date&&x.parked_review_date<=weekEnd&&x.parked_review_date>=weekStart);const stale=(D.ideas||[]).filter(x=>['develop','stress_test'].includes(x.stage)&&ideaDaysInStage(x)>=14);return(parked.length||stale.length)?`<div style="margin-top:12px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:10px 12px"><div style="font-size:11px;font-weight:600;margin-bottom:8px">💡 Ideas Needing Attention</div>${parked.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd1)"><span style="font-size:14px">🅿</span><div style="flex:1"><div style="font-size:11px;font-weight:500">${esc(x.title)}</div><div style="font-size:11px;color:var(--t3)">Parked review due ${x.parked_review_date}</div></div><button class="btn btn-s" style="font-size:11px" onclick="openIdeaDetail(${x.id})">Review</button></div>`).join('')}${stale.map(x=>`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd1)"><span style="font-size:14px">⚠️</span><div style="flex:1"><div style="font-size:11px;font-weight:500">${esc(x.title)}</div><div style="font-size:11px;color:var(--red)">${ideaDaysInStage(x)}d stale in ${IDEA_STAGE_LABELS[x.stage]}</div></div><button class="btn btn-s" style="font-size:11px" onclick="nav('ideas');openIdeaDetail(${x.id})">Develop</button></div>`).join('')}</div>`:''})()}
  `;
}
function weekTaskChip(t,draggable=true){
  const colors={High:'var(--err,#EF4444)',Medium:'var(--warn,#F59E0B)',Low:'var(--ok,#10B981)'};
  return`<div draggable="true" ondragstart="dragTaskStart(event,${_tidLit(t.id)})" style="background:var(--s3);border-left:3px solid ${colors[t.priority]||'var(--bd2)'};border-radius:3px;padding:4px 6px;margin-bottom:3px;cursor:grab;font-size:11px;display:flex;align-items:center;gap:4px" title="${esc(t.title)}">
    <div class="chk ${t.status==='Done'?'on':''}" style="width:12px;height:12px;flex-shrink:0" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)})"></div>
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${t.status==='Done'?'text-decoration:line-through;color:var(--t3)':''}">${esc(t.title)}</span>
    ${t.startTime?`<span style="font-size:9px;color:var(--t3);flex-shrink:0">${t.startTime}</span>`:''}
  </div>`;
}
function dragTaskStart(event,taskId){
  event.dataTransfer.setData('text/plain',String(taskId));
  event.dataTransfer.effectAllowed='move';
}
function dropTaskOnDay(event,dateStr){
  event.preventDefault();
  const col=event.currentTarget;
  col.classList.remove('drag-over');
  const taskId=parseInt(event.dataTransfer.getData('text/plain'));
  const t=D.tasks.find(x=>x.id===taskId);
  if(!t)return;
  t.startDate=dateStr;
  if(!t.due||t.due<dateStr)t.due=dateStr;
  save('tasks');
  renderMyWeek();
  toast('📅 Task moved to '+new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}));
}
function quickAddToDay(dateStr){
  openFA('task');
  // Pre-fill date after modal opens
  setTimeout(()=>{
    const el=document.getElementById('cap-due');
    if(el)el.value=dateStr;
    const sd=document.getElementById('cap-startdate');
    if(sd)sd.value=dateStr;
  },50);
}

function renderMyYear(){
  const yr=new Date().getFullYear();
  const now=new Date();
  const todayStr=_ymd(now);
  const dayOfYear=Math.floor((now-new Date(yr,0,0))/(1000*60*60*24));
  const daysInYear=((yr%4===0&&yr%100!==0)||yr%400===0)?366:365;
  const yearPct=Math.round(dayOfYear/daysInYear*100);

  // Yearly stats
  const doneTasks=D.tasks.filter(t=>t.status==='Done').length;
  const totalTasks=D.tasks.length;
  const notesCount=D.notes.length;
  const journalCount=D.journal.length;
  const topStreak=D.habits.reduce((b,h)=>h.streak>b.streak?h:b,{streak:0,title:'—',icon:''});
  const focusLog=D.prefs&&D.prefs.focusLog||{};
  const totalFocusMins=Object.values(focusLog).reduce((s,v)=>s+v,0)+(D.prefs.focusMinsToday||0);

  // Goal timeline
  const goalTimeline=D.goals.map(g=>{
    const start=g.startDate||`${yr}-01-01`;
    const end=g.dueDate||`${yr}-12-31`;
    const sDay=Math.floor((_pd(start)-new Date(yr,0,0))/(1000*60*60*24));
    const eDay=Math.floor((_pd(end)-new Date(yr,0,0))/(1000*60*60*24));
    const left=Math.max(0,Math.min(100,(sDay/daysInYear)*100));
    const width=Math.max(2,Math.min(100-left,((eDay-sDay)/daysInYear)*100));
    return {g,left,width};
  });

  // Habit heatmap — last 52 weeks (364 days)
  const heatLog=D.prefs.focusLog||{};
  const heatDays=Array.from({length:364},(_,i)=>{const d=_pd(now);d.setDate(d.getDate()-363+i);return _ymd(d);});
  const heatMax=Math.max(1,...Object.values(heatLog));
  function heatColor(v){if(!v)return 'var(--s3)';const p=v/heatMax;if(p<0.25)return '#1e3a5f';if(p<0.5)return '#1d5fa8';if(p<0.75)return '#2b7de9';return 'var(--ac)';}

  // Quarterly breakdown
  const quarters=['Q1 (Jan–Mar)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Oct–Dec)'];
  const qRanges=[['01-01','03-31'],['04-01','06-30'],['07-01','09-30'],['10-01','12-31']];
  const qStats=qRanges.map(([s,e])=>{
    const qs=`${yr}-${s}`,qe=`${yr}-${e}`;
    const qt=D.tasks.filter(t=>{const d=t.due||t.startDate||'';return d>=qs&&d<=qe;});
    return {total:qt.length,done:qt.filter(t=>t.status==='Done').length};
  });

  $('myyear-main').innerHTML=`
  <div class="ph-r" style="margin-bottom:12px">
    <div><h1 style="font-size:22px;font-weight:700">🗓 My Year — ${yr}</h1><p style="font-size:12px;color:var(--t2)">Day ${dayOfYear} of ${daysInYear} · ${yearPct}% through the year</p>${_focusViewTabs('myyear')}</div>
    <button class="btn btn-p" onclick="openFA('goal')">+ New Goal</button>
  </div>

  <div style="background:var(--s2);border-radius:8px;padding:8px 14px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t3);margin-bottom:4px"><span>Jan</span><span>Mar</span><span>Jun</span><span>Sep</span><span>Dec</span></div>
    <div style="position:relative;height:6px;background:var(--s3);border-radius:3px;margin-bottom:4px">
      <div style="position:absolute;left:0;top:0;height:100%;width:${yearPct}%;background:var(--ac);border-radius:3px"></div>
      <div style="position:absolute;top:-3px;left:${yearPct}%;transform:translateX(-50%);width:12px;height:12px;border-radius:50%;background:var(--ac);border:2px solid var(--bg)"></div>
    </div>
    <div style="font-size:11px;color:var(--t3);text-align:right">${yearPct}% of year elapsed</div>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    ${[{l:'Tasks Done',v:doneTasks+'/'+totalTasks,c:'var(--ok)'},{l:'Notes',v:notesCount,c:'var(--ac)'},{l:'Journal Entries',v:journalCount,c:'var(--warn)'},{l:'Top Streak',v:topStreak.streak+'🔥',c:'var(--warn)'},{l:'Focus Hours',v:Math.round(totalFocusMins/60)+'h',c:'var(--ac)'}].map(s=>`<div style="flex:1;min-width:80px;background:var(--s2);border-radius:8px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:700;color:${s.c}">${s.v}</div><div style="font-size:11px;color:var(--t3);margin-top:2px">${s.l}</div></div>`).join('')}
  </div>

  <div class="sec-h">🎯 Goal Timeline</div>
  <div style="background:var(--s2);border-radius:8px;padding:12px 14px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--t3);margin-bottom:8px"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span></div>
    ${goalTimeline.map(({g,left,width})=>`
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
        <span>${g.icon} ${esc(g.title)}</span><span style="color:var(--t3)">${g.pct}%</span>
      </div>
      <div style="position:relative;height:14px;background:var(--s3);border-radius:3px">
        <div style="position:absolute;left:${left}%;width:${width}%;height:100%;background:${g.pct>=70?'var(--ok)':g.pct>=40?'var(--ac)':'var(--warn)'};border-radius:3px;opacity:0.85" title="${g.title}: ${g.pct}%"></div>
        <div style="position:absolute;left:${yearPct}%;top:0;height:100%;width:1px;background:var(--t3);opacity:0.5"></div>
      </div>
    </div>`).join('')}
  </div>

  <div class="sec-h">📅 Quarterly Breakdown</div>
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    ${quarters.map((q,i)=>{
      const {total,done}=qStats[i];
      const pct=total?Math.round(done/total*100):0;
      const isCur=Math.floor((now.getMonth())/3)===i;
      return `<div style="flex:1;min-width:100px;background:${isCur?'var(--acs)':'var(--s2)'};border:${isCur?'1px solid var(--ac)':'1px solid transparent'};border-radius:8px;padding:10px">
        <div style="font-size:11px;font-weight:600;margin-bottom:4px">${q}${isCur?' <span style="font-size:9px;color:var(--ac)">← Now</span>':''}</div>
        <div style="font-size:16px;font-weight:700;color:${pct>=70?'var(--ok)':pct>=40?'var(--ac)':'var(--t2)'}">${pct}%</div>
        <div style="font-size:11px;color:var(--t3)">${done}/${total} tasks</div>
        <div class="pb" style="margin-top:4px"><div class="f" style="width:${pct}%;background:${pct>=70?'var(--ok)':pct>=40?'var(--ac)':'var(--warn)'}"></div></div>
      </div>`;
    }).join('')}
  </div>

  <div class="sec-h">🔥 Focus Activity (52 weeks)</div>
  <div style="background:var(--s2);border-radius:8px;padding:12px 14px;margin-bottom:12px;overflow-x:auto">
    <div style="display:flex;gap:2px;flex-wrap:wrap">
      ${heatDays.map(d=>`<div style="width:10px;height:10px;border-radius:2px;background:${heatColor(heatLog[d]||0)}" title="${d}: ${heatLog[d]||0}m"></div>`).join('')}
    </div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:11px;color:var(--t3)">
      <span>Less</span>
      ${['var(--s3)','#1e3a5f','#1d5fa8','#2b7de9','var(--ac)'].map(c=>`<div style="width:10px;height:10px;border-radius:2px;background:${c}"></div>`).join('')}
      <span>More</span>
    </div>
  </div>

  <div class="sec-h">📊 Annual Goals</div>
  <div class="cd">${D.goals.map(g=>`<div class="lr" onclick="openDrawer('goal',D.goals.find(x=>x.id==${_tidLit(g.id)}))">${g.icon}<span class="rt">${esc(g.title)}</span><span style="font-size:11px;color:var(--t3);margin-right:6px">${g.dueDate||''}</span><div class="pb" style="width:60px"><div class="f" style="width:${g.pct}%;background:${g.pct>=70?'var(--ok)':g.pct>=40?'var(--ac)':'var(--warn)'}"></div></div><span class="rm">${g.pct}%</span></div>`).join('')}</div>
  `;
  $('myyear-rail').innerHTML=`
  <div style="font-size:12px;font-weight:600;margin-bottom:8px">📌 Year Priorities</div>
  ${D.goals.filter(g=>g.pct<100).slice(0,5).map((g,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:18px;height:18px;border-radius:50%;background:var(--ac);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.icon} ${esc(g.title)}</div><div class="pb" style="margin-top:3px"><div class="f" style="width:${g.pct}%"></div></div></div><span style="font-size:11px;color:var(--t3)">${g.pct}%</span></div>`).join('')}
  <div style="font-size:12px;font-weight:600;margin:12px 0 6px">📈 Year Stats</div>
  <div style="font-size:11px;color:var(--t2);line-height:1.8">
    <div>📋 Tasks done: <strong>${doneTasks}</strong></div>
    <div>📝 Notes: <strong>${notesCount}</strong></div>
    <div>📓 Journal entries: <strong>${journalCount}</strong></div>
    <div>⏱ Focus time: <strong>${Math.round(totalFocusMins/60)}h ${totalFocusMins%60}m</strong></div>
    <div>🔥 Top streak: <strong>${topStreak.streak} days</strong></div>
  </div>
  `;
}

let _processTab='tasks';
let _processGtdTab='Inbox';
// GTD bucket model — derived from existing task fields (no new schema):
//   Inbox     = Not Started, undated, not delegated/snoozed (unprocessed)
//   Do Next   = flagged for action (My Day) or In Progress
//   Calendar  = has a start/due date (date-bound action)
//   Delegated = status Delegated, or assigned to someone else
//   Snoozed   = snoozeUntil is set and still in the future
//   Someday   = status Someday (maybe / not now)
//   Done      = completed
function _gtdBuckets(){
  const me=D.creds.userName||'Idris Grant';
  const today=_todayStr;
  const snoozed=t=>t.snoozeUntil&&String(t.snoozeUntil).slice(0,10)>=today&&t.status!=='Done';
  const delegated=t=>t.status!=='Done'&&(t.status==='Delegated'||(t.assignedTo&&t.assignedTo!==me));
  const dated=t=>!!(t.due||t.startDate);
  return {
    Inbox:t=>t.status==='Not Started'&&!dated(t)&&!delegated(t)&&!snoozed(t)&&!t.myDay,
    'Do Next':t=>t.status!=='Done'&&t.status!=='Someday'&&!delegated(t)&&!snoozed(t)&&(t.myDay||t.status==='In Progress'),
    Calendar:t=>t.status!=='Done'&&t.status!=='Someday'&&!delegated(t)&&!snoozed(t)&&dated(t),
    Delegated:delegated,
    Snoozed:snoozed,
    Someday:t=>t.status==='Someday',
    Done:t=>t.status==='Done',
  };
}
function setProcessGtdTab(tab){_processGtdTab=tab;renderProcess();}
// Triage actions — these are what "feed" each bucket.
function gtdDoNext(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;t.myDay=true;t.snoozeUntil='';if(t.status==='Someday'||t.status==='Not Started')setTaskStatus(t,'In Progress',{noSave:true});save('tasks');renderProcess();toast('⚡ Moved to Do Next');}
function gtdSchedule(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;const v=prompt('Schedule for (YYYY-MM-DD):',t.due||_ymd(new Date()));if(!v)return;t.due=v.trim();t.snoozeUntil='';if(t.status==='Not Started'||t.status==='Someday')setTaskStatus(t,'In Progress',{noSave:true});save('tasks');renderProcess();toast('📅 Scheduled for '+t.due);}
function gtdSomeday(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;setTaskStatus(t,'Someday',{noSave:true});t.myDay=false;t.snoozeUntil='';save('tasks');renderProcess();toast('🗓 Moved to Someday');}
function gtdDone(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;setTaskStatus(t,'Done');renderProcess();toast('✓ Done');}
function gtdToInbox(id){const t=D.tasks.find(x=>x.id===id);if(!t)return;setTaskStatus(t,'Not Started',{noSave:true});t.myDay=false;t.snoozeUntil='';t.due='';t.startDate='';t.assignedTo='';save('tasks');renderProcess();toast('📥 Back to Inbox');}
function renderProcess(){
  const sparkIdeas=(D.ideas||[]).filter(x=>x.stage==='spark');
  const _gtdB=_gtdBuckets();
  const tabBar=`<div style="display:flex;gap:2px;background:var(--s3);border-radius:6px;padding:2px;margin-bottom:12px;width:fit-content">
    <button class="btn" style="border-radius:4px;height:28px;font-size:11px;background:${_processTab==='tasks'?'var(--ac)':'transparent'};color:${_processTab==='tasks'?'#fff':'var(--t2)'};border:none" onclick="_processTab='tasks';renderProcess()">Tasks (${D.tasks.filter(_gtdB.Inbox).length})</button>
    <button class="btn" style="border-radius:4px;height:28px;font-size:11px;background:${_processTab==='ideas'?'var(--ac)':'transparent'};color:${_processTab==='ideas'?'#fff':'var(--t2)'};border:none" onclick="_processTab='ideas';renderProcess()">💡 Ideas (${sparkIdeas.length})</button>
  </div>`;
  const _gtdOrder=['Inbox','Do Next','Calendar','Delegated','Snoozed','Someday','Done'];
  const _gtdIcons={Inbox:'📥','Do Next':'⚡',Calendar:'📅',Delegated:'📤',Snoozed:'⏰',Someday:'🗓',Done:'✓'};
  const _gtdHints={
    Inbox:'Unprocessed captures. Triage each one below — that’s what feeds every other list.',
    'Do Next':'Your actionable next actions (flagged for My Day or already In Progress).',
    Calendar:'Date-bound actions — anything with a start or due date.',
    Delegated:'Waiting on someone else (status Delegated or assigned to another person).',
    Snoozed:'Deferred until a future date (Snooze sets the wake date).',
    Someday:'Maybe / not now. Review periodically and pull back when ready.',
    Done:'Completed tasks.',
  };
  if(!_gtdB[_processGtdTab])_processGtdTab='Inbox';
  const bucketTasks=D.tasks.filter(_gtdB[_processGtdTab]);
  function gtdRow(t){
    const inbox=_processGtdTab==='Inbox';
    const acts=inbox
      ?`<button class="btn btn-s gtd-a" title="Actionable now — adds to Do Next / My Day" onclick="event.stopPropagation();gtdDoNext(${_tidLit(t.id)})">⚡ Do Next</button>
        <button class="btn btn-s gtd-a" title="Give it a date" onclick="event.stopPropagation();gtdSchedule(${_tidLit(t.id)})">📅 Schedule</button>
        <button class="btn btn-s gtd-a" title="Hand off to someone" onclick="event.stopPropagation();delegateTask(${_tidLit(t.id)})">📤 Delegate</button>
        <button class="btn btn-s gtd-a" title="Defer to a future date" onclick="event.stopPropagation();snoozeTask(${_tidLit(t.id)})">⏰ Snooze</button>
        <button class="btn btn-s gtd-a" title="Maybe / not now" onclick="event.stopPropagation();gtdSomeday(${_tidLit(t.id)})">🗓 Someday</button>
        <button class="btn btn-s gtd-a" style="color:var(--ok)" title="2-min rule: just do it" onclick="event.stopPropagation();gtdDone(${_tidLit(t.id)})">✓ Done</button>`
      :`${_processGtdTab!=='Done'?`<button class="btn btn-s gtd-a" onclick="event.stopPropagation();gtdDoNext(${_tidLit(t.id)})">⚡ Do Next</button>`:''}
        ${_processGtdTab!=='Calendar'?`<button class="btn btn-s gtd-a" onclick="event.stopPropagation();gtdSchedule(${_tidLit(t.id)})">📅 Schedule</button>`:''}
        ${_processGtdTab!=='Someday'?`<button class="btn btn-s gtd-a" onclick="event.stopPropagation();gtdSomeday(${_tidLit(t.id)})">🗓 Someday</button>`:''}
        ${_processGtdTab!=='Done'?`<button class="btn btn-s gtd-a" style="color:var(--ok)" onclick="event.stopPropagation();gtdDone(${_tidLit(t.id)})">✓ Done</button>`:''}
        <button class="btn btn-s gtd-a" title="Reset to unprocessed Inbox" onclick="event.stopPropagation();gtdToInbox(${_tidLit(t.id)})">📥 Inbox</button>`;
    return `<div class="gtd-item">${taskRow(t,false)}<div class="gtd-acts">${acts}</div></div>`;
  }
  const tabBarG=`<div class="tabs gtd-tabs">${_gtdOrder.map(name=>{
    const n=D.tasks.filter(_gtdB[name]).length;
    return `<div class="tab ${_processGtdTab===name?'on':''}" onclick="setProcessGtdTab('${name.replace(/'/g,"\\'")}')">${_gtdIcons[name]} ${name}${n?` <span class="tc">${n}</span>`:''}</div>`;
  }).join('')}</div>`;
  const emptyMsg={
    Inbox:'🎉 Inbox zero — every capture has been clarified.',
    Done:'No completed tasks yet.',
  }[_processGtdTab]||`Nothing in ${_processGtdTab} right now.`;
  const tasksHtml=`<div class="sec-h">📥 Task Processing</div>
${tabBarG}
<div style="font-size:10.5px;color:var(--t2);margin-bottom:10px;line-height:1.5">${_gtdIcons[_processGtdTab]} <strong>${_processGtdTab}</strong> — ${esc(_gtdHints[_processGtdTab])}</div>
<div class="cd" style="padding:6px">${bucketTasks.length?bucketTasks.map(gtdRow).join(''):`<div style="text-align:center;padding:34px 18px;color:var(--t3);font-size:12px">${emptyMsg}</div>`}</div>`;
  const ideasHtml=sparkIdeas.length===0
    ?`<div style="text-align:center;padding:40px 20px;color:var(--t3)">🎉 No ideas in Spark stage — all caught up!</div>`
    :`<div style="font-size:11px;color:var(--t2);margin-bottom:10px">Triage each Spark idea: <strong>Develop</strong> to move forward, <strong>Park</strong> for later, or <strong>Kill</strong> to discard.</div>
    ${sparkIdeas.map(idea=>{
      const ice=Math.round((idea.ice_impact+idea.ice_confidence+idea.ice_ease)/3);
      return `<div style="background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:20px">${IDEA_TYPE_ICONS[idea.idea_type]||'💡'}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${esc(idea.title)}</div>
            <div style="font-size:11px;color:var(--t3);margin-bottom:6px">${esc(idea.description||'')}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <span style="font-size:11px;background:var(--s3);padding:2px 6px;border-radius:10px;color:var(--t2)">ICE ${ice}/10</span>
              <span style="font-size:11px;background:var(--s3);padding:2px 6px;border-radius:10px;color:var(--t2)">${IDEA_TYPE_LABELS[idea.idea_type]||'General'}</span>
              ${idea.goal_id?`<span style="font-size:11px;background:var(--s3);padding:2px 6px;border-radius:10px;color:var(--ac)">🎯 ${esc((D.goals.find(g=>g.id===idea.goal_id)||{}).title||'Goal')}</span>`:''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="btn btn-p" style="font-size:11px;padding:4px 10px" onclick="ideaAdvanceStage(${idea.id},'develop');renderProcess()">→ Develop</button>
            <button class="btn btn-s" style="font-size:11px;padding:4px 10px" onclick="openIdeaDetail(${idea.id})">🔍 Detail</button>
            <button class="btn btn-s" style="font-size:11px;padding:4px 10px;color:var(--warn)" onclick="ideaAdvanceStage(${idea.id},'verdict');D.ideas.find(x=>x.id==${_tidLit(idea.id)}).verdict_outcome='parked';D.ideas.find(x=>x.id==${_tidLit(idea.id)}).parked_review_date=_ymd(new Date(Date.now()+30*86400000));save('ideas');renderProcess();toast('🅿 Parked for 30 days')">🅿 Park</button>
            <button class="btn btn-s" style="font-size:11px;padding:4px 10px;color:var(--red)" onclick="if(confirm('Kill this idea?')){ideaAdvanceStage(${idea.id},'verdict');D.ideas.find(x=>x.id==${_tidLit(idea.id)}).verdict_outcome='killed';save('ideas');renderProcess();toast('🗑 Idea killed')}">🗑 Kill</button>
          </div>
        </div>
      </div>`;
    }).join('')}`;
  const inbox=D.tasks.filter(_gtdB.Inbox).length;
  const today=_todayStr;
  const overdueProc=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today).length;
  $('process-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px">
    <div>
      <h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('zap',22,'var(--page-accent)')}Process (GTD)</h1>
      <p style="font-size:12px;color:var(--t2)">${inbox} task${inbox===1?'':'s'} to clarify${overdueProc?` · <span style="color:var(--red);font-weight:600">${overdueProc} overdue</span>`:''} · ${sparkIdeas.length} idea${sparkIdeas.length===1?'':'s'} to triage</p>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="nav('myday')" title="Plan today's focus">☀ My Day</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="nav('focus')" title="Start a focus timer">⚡ Focus</button>
      <button class="btn btn-p" style="height:28px;font-size:11px" onclick="openFA('task')">+ Capture Task</button>
    </div>
  </div>
  ${tabBar}
  ${_processTab==='tasks'?tasksHtml:ideasHtml}`;
}
// ====== FOCUS / POMODORO ======
let _focusTimer=null,_focusSecsLeft=25*60,_focusRunning=false,_focusSessions=JSON.parse(localStorage.getItem('lu_focus_sessions')||'[]'),_focusTaskId=null;
function renderFocus(){
  const el=$('focus-main');
  if(!el)return;
  const mins=Math.floor(_focusSecsLeft/60),secs=_focusSecsLeft%60;
  const pct=Math.round((1-_focusSecsLeft/(25*60))*100);
  const totalMins=_focusSessions.reduce((s,x)=>s+(x.mins||0),0);
  const todaySessions=_focusSessions.filter(s=>s.date===_todayStr);
  const taskOpts=D.tasks.filter(t=>t.status!=='Done').map(t=>`<option value="${t.id}" ${_focusTaskId===t.id?'selected':''}>${esc(t.title)}</option>`).join('');
  el.innerHTML=`<div class="ph-r" style="margin-bottom:16px">
    <div>
      <h1 style="font-size:22px;font-weight:700">⏱ Focus Mode</h1>
      <p style="font-size:12px;color:var(--t2)">Pomodoro timer · ${todaySessions.length} session${todaySessions.length===1?'':'s'} today · ${Math.round(totalMins/60)}h ${totalMins%60}m total · ${_focusRunning?'<span style="color:var(--red);font-weight:600">● Running</span>':'<span style="color:var(--t3)">Idle</span>'}</p>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="nav('myday')" title="Pick today's tasks">☀ My Day</button>
      <button class="btn btn-s" style="height:28px;font-size:11px" onclick="nav('tasks')" title="Browse all tasks">📋 Tasks</button>
    </div>
  </div>
  <div style="max-width:600px;margin:0 auto;padding:0 24px 24px">

  <div style="text-align:center;margin-bottom:24px">
    <svg width="200" height="200" viewBox="0 0 200 200" style="transform:rotate(-90deg)">
      <circle cx="100" cy="100" r="88" fill="none" stroke="var(--bd2)" stroke-width="12"/>
      <circle id="focus-ring" cx="100" cy="100" r="88" fill="none" stroke="var(--ac)" stroke-width="12" stroke-dasharray="553" stroke-dashoffset="${553-(553*pct/100)}" style="transition:stroke-dashoffset .5s"/>
    </svg>
    <div style="margin-top:-120px;font-size:48px;font-weight:700;letter-spacing:-2px;line-height:1" id="focus-clock">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div>
    <div style="margin-top:8px;font-size:12px;color:var(--t3)">${_focusRunning?'Focus session running...':'Ready to focus'}</div>
    <div style="margin-top:120px"></div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
    <button class="btn btn-p" style="padding:10px 24px;font-size:14px" onclick="toggleFocusTimer()">${_focusRunning?'⏸ Pause':'▶ Start'}</button>
    <button class="btn btn-s" onclick="resetFocusTimer()">↺ Reset</button>
    <button class="btn btn-s" onclick="_focusSecsLeft=5*60;renderFocus()">5 min</button>
    <button class="btn btn-s" onclick="_focusSecsLeft=15*60;renderFocus()">15 min</button>
    <button class="btn btn-s" onclick="_focusSecsLeft=25*60;renderFocus()">25 min</button>
  </div>
  <div style="margin-bottom:20px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Focusing on task</label>
    <select class="inp" style="width:100%;margin-top:4px" onchange="_focusTaskId=parseInt(this.value)||null">
      <option value="">— No specific task —</option>
      ${taskOpts}
    </select>
  </div>
  ${(()=>{
    // 7-day bar chart
    const days7=Array.from({length:7},(_,i)=>{
      const d=new Date();d.setDate(d.getDate()-6+i);
      return _ymd(d);
    });
    const dayLabels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const dayMins=days7.map(ds=>_focusSessions.filter(s=>s.date===ds).reduce((a,s)=>a+(s.mins||0),0));
    const maxMins=Math.max(...dayMins,1);
    const bars=days7.map((ds,i)=>{
      const h=Math.round((dayMins[i]/maxMins)*80);
      const isToday=ds===_todayStr;
      const d=new Date(ds+'T00:00');
      const lbl=dayLabels[d.getDay()===0?6:d.getDay()-1];
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1">
        <div style="font-size:11px;color:var(--t3)">${dayMins[i]?dayMins[i]+'m':''}</div>
        <div style="width:100%;background:var(--s3);border-radius:4px 4px 0 0;height:80px;display:flex;align-items:flex-end">
          <div style="width:100%;height:${h}px;background:${isToday?'var(--ac)':'var(--ac-muted,#6366f1aa)'};border-radius:4px 4px 0 0;transition:height .3s"></div>
        </div>
        <div style="font-size:11px;color:${isToday?'var(--ac)':'var(--t3)'};font-weight:${isToday?700:400}">${lbl}</div>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:20px"><div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:10px">📊 7-Day Focus History</div><div style="display:flex;gap:4px;align-items:flex-end">${bars}</div></div>`;
  })()}
  ${todaySessions.length?`<div><div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:8px">Today\'s sessions</div>${todaySessions.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd1)"><span style="font-size:16px">🍅</span><div style="flex:1"><div style="font-size:12px;font-weight:500">${s.taskTitle||'Free focus'}</div><div style="font-size:11px;color:var(--t3)">${s.time} &middot; ${s.mins} min</div></div></div>`).join('')}</div>`:''}
  `;
}
function toggleFocusTimer(){
  if(_focusRunning){
    clearInterval(_focusTimer);
    _focusRunning=false;
    renderFocus();
  } else {
    _focusRunning=true;
    renderFocus();
    _focusTimer=setInterval(()=>{
      _focusSecsLeft--;
      const mins=Math.floor(_focusSecsLeft/60),secs=_focusSecsLeft%60;
      const clk=document.getElementById('focus-clock');
      if(clk)clk.textContent=String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');
      const ring=document.getElementById('focus-ring');
      const pct=Math.round((1-_focusSecsLeft/(25*60))*100);
      if(ring)ring.style.strokeDashoffset=553-(553*pct/100);
      if(_focusSecsLeft<=0){
        clearInterval(_focusTimer);
        _focusRunning=false;
        const task=_focusTaskId?D.tasks.find(t=>t.id===_focusTaskId):null;
        if(task){task.timeSpent=(task.timeSpent||0)+25;save('tasks');}
        const sess={id:Date.now(),date:_todayStr,time:new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}),mins:25,taskId:_focusTaskId,taskTitle:task?task.title:'Free focus'};
        _focusSessions.push(sess);
        localStorage.setItem('lu_focus_sessions',JSON.stringify(_focusSessions));
        // Update focusLog for heatmap and persist to server via save('prefs')
        if(!D.prefs.focusLog)D.prefs.focusLog={};
        D.prefs.focusLog[sess.date]=(D.prefs.focusLog[sess.date]||0)+sess.mins;
        D.prefs.focusByHour=D.prefs.focusByHour||{};
        const _hh=new Date().getHours();
        D.prefs.focusByHour[_hh]=(D.prefs.focusByHour[_hh]||0)+sess.mins;
        D.prefs.focusMinsToday=(D.prefs.focusMinsToday||0)+sess.mins;
        save('prefs');
        _focusSecsLeft=25*60;
        toast('🍅 Focus session complete! Great work.');
        renderFocus();
      }
    },1000);
  }
}
function resetFocusTimer(){
  clearInterval(_focusTimer);
  _focusRunning=false;
  _focusSecsLeft=25*60;
  renderFocus();
}
// Returns the ISO week string "YYYY-Www" for a given Date
function isoWeek(date){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=d.getUTCDay()||7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const wk=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return d.getUTCFullYear()+'-W'+String(wk).padStart(2,'0');
}
// Returns the required completions per week for a cadence string
// Which weekdays (0=Sun…6=Sat) a habit is due on, or null for count-per-week
// cadences (Weekly, 3×/week…). Weekdays/Weekends/Custom used to fall into the
// weekly branch needing 7 a week, so their streak was always 0.
function _habitScheduledDays(h){
  const c=(h&&h.cadence)||'Daily';
  if(c==='Daily')return new Set([0,1,2,3,4,5,6]);
  if(c==='Weekdays')return new Set([1,2,3,4,5]);
  if(c==='Weekends')return new Set([0,6]);
  if(c==='Custom'&&Array.isArray(h.customDays)&&h.customDays.length){
    const idx={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
    const s=new Set(h.customDays.map(d=>idx[String(d).slice(0,3)]).filter(n=>n!=null));
    return s.size?s:new Set([0,1,2,3,4,5,6]);
  }
  return null;
}
function cadencePerWeek(cadence){
  if(!cadence||cadence==='Daily')return 7;
  if(cadence==='Weekdays')return 5;
  if(cadence==='Weekends')return 2;
  if(cadence==='Weekly'||cadence==='1x/week')return 1;
  if(cadence==='2x/week')return 2;
  if(cadence==='3x/week'||cadence==='3xd7/week'||cadence==='3×/week')return 3;
  if(cadence==='4x/week')return 4;
  if(cadence==='5x/week')return 5;
  if(cadence==='6x/week')return 6;
  return 7; // default to daily
}
// Calculates current streak for a habit based on its cadence and completedDates
function calcHabitStreak(h){
  const completedDates=(h.completedDates||[]).slice().sort();
  const skippedDates=(h.skippedDates||[]);
  if(!completedDates.length)return 0;
  const cadence=h.cadence||'Daily';
  const reqPerWeek=cadencePerWeek(cadence);
  const sched=_habitScheduledDays(h);
  if(sched){
    // Count consecutive SCHEDULED days ending today (or the last scheduled day
    // before it if today isn't done yet); unscheduled days are skipped over.
    const today=new Date();today.setHours(0,0,0,0);
    let streak=0;
    let checkDate=_pd(today);
    const todayStr=_ymd(today);
    if(!sched.has(today.getDay())||!completedDates.includes(todayStr))checkDate.setDate(checkDate.getDate()-1);
    for(let guard=0;guard<4000;guard++){
      if(!sched.has(checkDate.getDay())){checkDate.setDate(checkDate.getDate()-1);continue;}
      const ds=_ymd(checkDate);
      if(completedDates.includes(ds)||skippedDates.includes(ds)){
        streak++;
        checkDate.setDate(checkDate.getDate()-1);
      } else break;
    }
    return streak;
  } else {
    // Weekly cadence: count consecutive ISO weeks where completions >= reqPerWeek
    // Build a map of week -> completion count
    const weekMap={};
    completedDates.forEach(ds=>{
      const d=_pd(ds);
      const wk=isoWeek(d);
      weekMap[wk]=(weekMap[wk]||0)+1;
    });
    // Also count skipped days as 1 completion each for streak preservation
    skippedDates.forEach(ds=>{
      const d=_pd(ds);
      const wk=isoWeek(d);
      weekMap[wk]=(weekMap[wk]||0)+0.5; // half-credit for skips
    });
    const today=new Date();
    const currentWeek=isoWeek(today);
    let streak=0;
    let checkWeek=currentWeek;
    // Helper to get previous ISO week string
    const prevWeek=wkStr=>{
      const [yr,wn]=wkStr.split('-W').map(Number);
      // isoWeek reads the LOCAL date, so hand it a local one (a UTC
      // midnight is the previous evening here, sometimes the previous week).
      return isoWeek(new Date(yr,0,1+((wn-1)*7)-7));
    };
    // If current week has enough completions, count it
    if((weekMap[checkWeek]||0)>=reqPerWeek){
      streak++;
      checkWeek=prevWeek(checkWeek);
    } else {
      // Current week not yet fulfilled — look back from previous week
      checkWeek=prevWeek(checkWeek);
    }
    while((weekMap[checkWeek]||0)>=reqPerWeek){
      streak++;
      checkWeek=prevWeek(checkWeek);
    }
    return streak;
  }
}
function skipHabitToday(id){
  const h=D.habits.find(x=>x.id===id);
  if(!h)return;
  h.skippedToday=true;
  h.doneToday=false;
  const todayStr=_ymd(new Date());
  if(!h.skippedDates)h.skippedDates=[];
  if(!h.completedDates)h.completedDates=[];
  if(!h.skippedDates.includes(todayStr))h.skippedDates.push(todayStr);
  h.completedDates=h.completedDates.filter(d=>d!==todayStr);
  save('habits');
  renderHabits();
  toast(`⏭ Skipped "${h.title}" — streak preserved`);
}
function toggleHabit(id){
  const h=D.habits.find(x=>x.id===id);
  if(!h)return;
  const wasOff=!h.doneToday;
  h.doneToday=wasOff;
  h.skippedToday=false;
  const todayStr=_ymd(new Date());
  if(!h.completedDates)h.completedDates=[];
  if(!h.skippedDates)h.skippedDates=[];
  if(wasOff){
    if(!h.completedDates.includes(todayStr))h.completedDates.push(todayStr);
    h.skippedDates=h.skippedDates.filter(d=>d!==todayStr);
    h.streak=calcHabitStreak(h);
    const cadenceLabel=h.cadence==='Daily'?'day':(h.cadence==='Weekly'||h.cadence==='1x/week')?'week':'week';
    toast(h.icon+' '+h.title+' — 🔥 '+h.streak+' '+cadenceLabel+' streak!');
  } else {
    h.completedDates=h.completedDates.filter(d=>d!==todayStr);
    h.streak=calcHabitStreak(h);
    toast(h.icon+' Habit unchecked. Streak recalculated.');
  }
  save('habits');
  invalidateSearchIndex();
  renderHabits();
  if(curScreen==='home')renderScreen('home');
}
let _habitsMyOnly=false;
// ====== IDEAS MODULE ======
const IDEA_QUESTION_TEMPLATES = {
  tool_to_build: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this tool?',help:'Be specific — avoid "a platform that…"'},
      {key:'who_for',prompt:'Who is it for?',help:'Describe the specific person, not a broad demographic.'},
    ],
    develop: [
      {key:'problem_evidence',prompt:'What problem does it solve, and what evidence do you have the problem is real?',help:'User quotes, data, or your own repeated pain count.'},
      {key:'workaround',prompt:'What is the current workaround?',help:'If there is no workaround, that is a red flag.'},
      {key:'smallest_version',prompt:'What is the smallest version you could test in a week?',help:'Think prototype, not MVP.'},
      {key:'effort_hours',prompt:'Estimate the effort in hours to ship the smallest version.',help:'Be honest — multiply your first estimate by 3.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine you ship this and abandon it within six months. What killed it?',help:'Be brutally honest.'},
      {key:'kill_threshold',prompt:'What is the threshold at which you would kill this — users, time spent, dollars?',help:'Set this now, before you are emotionally invested.'},
      {key:'opportunity_cost',prompt:'What else could you build with the same hours?',help:'List 2–3 alternatives.'},
      {key:'prior_art',prompt:'Has someone built something similar? What happened?',help:'Research before answering.'},
    ],
  },
  business: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this business?',help:'Describe the value exchange clearly.'},
      {key:'customer',prompt:'Who is the primary customer and what do they pay for?',help:'Be specific about the buyer and the outcome they purchase.'},
    ],
    develop: [
      {key:'market_size',prompt:'What is the realistic addressable market, and how did you arrive at that number?',help:'Bottom-up estimates beat top-down TAM slides.'},
      {key:'revenue_model',prompt:'How does this make money? What are the unit economics?',help:'Revenue per customer, cost to acquire, margin.'},
      {key:'unfair_advantage',prompt:'What gives you an unfair advantage over existing alternatives?',help:'Distribution, IP, team, timing, or network effects.'},
      {key:'first_customer',prompt:'Who is the first customer you would call tomorrow, and why would they say yes?',help:'A name, not a persona.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine this business fails in 18 months. What was the cause of death?',help:'Be specific — "ran out of money" is not an answer.'},
      {key:'regulatory_risk',prompt:'What regulatory, legal, or compliance risks could kill this?',help:'Think about data, licensing, and incumbents with lobbying power.'},
      {key:'competition_response',prompt:'If this works, what stops a well-funded competitor from copying it in 12 months?',help:'Your moat must be real, not aspirational.'},
      {key:'founder_fit',prompt:'Why are you the right person to build this, and what are you missing?',help:'Honest self-assessment of skills and gaps.'},
    ],
  },
  content: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this content about?',help:'State the core thesis or angle.'},
      {key:'audience',prompt:'Who is the primary audience, and where do they currently consume content?',help:'Be specific about platform and persona.'},
    ],
    develop: [
      {key:'unique_angle',prompt:'What is the unique angle that makes this worth reading/watching over existing content?',help:'What do you know or see that others miss?'},
      {key:'format_cadence',prompt:'What format and cadence will you commit to?',help:'Realistic > ambitious. Consistency beats volume.'},
      {key:'distribution',prompt:'How will the first 100 people find this content?',help:'Do not rely on organic discovery alone.'},
      {key:'effort',prompt:'How many hours per piece, and how many pieces per month?',help:'Calculate the annual time commitment before committing.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine you stop publishing after 3 months. What caused you to quit?',help:'Address that cause now.'},
      {key:'differentiation',prompt:'What existing content is most similar, and why will yours win?',help:'Name specific creators or publications.'},
      {key:'monetization',prompt:'If this never directly makes money, is it still worth doing?',help:'Clarity on intrinsic vs. extrinsic motivation matters.'},
      {key:'opportunity_cost',prompt:'What else could you do with the same time investment?',help:'Content compounds slowly — is this the best use of your creative energy?'},
    ],
  },
  career: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this career move?',help:'Role, company, or direction change.'},
      {key:'why_now',prompt:'Why are you considering this now?',help:'Push vs. pull — are you running from something or toward something?'},
    ],
    develop: [
      {key:'skills_gap',prompt:'What skills or experiences do you currently lack for this move?',help:'Be specific — list 3–5 gaps.'},
      {key:'path',prompt:'What is the most realistic path to making this move in 12 months?',help:'Steps, not wishes.'},
      {key:'financial_impact',prompt:'What is the financial impact (positive or negative) of this move?',help:'Include opportunity cost, not just salary.'},
      {key:'network',prompt:'Who in your network has made a similar move and can give you honest advice?',help:'Name 2–3 people to contact.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine you make this move and regret it in 2 years. What happened?',help:'Specific scenarios, not vague anxiety.'},
      {key:'reversibility',prompt:'How reversible is this decision?',help:'Can you go back? At what cost?'},
      {key:'identity',prompt:'Does this move align with who you want to become, or just what you want to earn?',help:'Long-term identity > short-term compensation.'},
      {key:'worst_case',prompt:'What is the realistic worst-case outcome, and can you live with it?',help:'If yes, the decision is easier than you think.'},
    ],
  },
  investment: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this investment?',help:'Asset class, instrument, and thesis.'},
      {key:'thesis',prompt:'What is your investment thesis in 2–3 sentences?',help:'Why will this appreciate? What do you know that the market does not?'},
    ],
    develop: [
      {key:'due_diligence',prompt:'What research have you done, and what key questions remain unanswered?',help:'List what you know and what you need to verify.'},
      {key:'position_size',prompt:'What percentage of your investable assets will this represent, and why?',help:'Kelly criterion or your own sizing framework.'},
      {key:'time_horizon',prompt:'What is your time horizon, and what triggers an exit?',help:'Set exit criteria now, not when emotions are high.'},
      {key:'downside',prompt:'What is the maximum realistic loss, and what is your plan if that happens?',help:'Stress-test at -50% and -90%.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine this investment goes to zero. What was the cause?',help:'Specific failure modes, not "market risk."'},
      {key:'bias_check',prompt:'What cognitive biases might be driving this decision?',help:'Confirmation bias, FOMO, recency bias, social proof.'},
      {key:'opportunity_cost',prompt:'What else could you do with this capital?',help:'Compare risk-adjusted returns honestly.'},
      {key:'expert_opinion',prompt:'What would a skeptical expert say about this investment?',help:'Steelman the bear case.'},
    ],
  },
  process_change: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what process are you changing and how?',help:'Current state → desired state.'},
      {key:'pain_point',prompt:'What specific pain or inefficiency is driving this change?',help:'Quantify if possible — time lost, errors, cost.'},
    ],
    develop: [
      {key:'root_cause',prompt:'What is the root cause of the current problem?',help:'Use 5 Whys to get past symptoms.'},
      {key:'stakeholders',prompt:'Who is affected by this change, and who needs to buy in?',help:'List people, not roles.'},
      {key:'rollout',prompt:'How will you roll this out — pilot, phased, or big bang?',help:'Smaller rollouts reduce risk and build evidence.'},
      {key:'metrics',prompt:'How will you measure whether the change worked?',help:'Define success metrics before you start.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine this process change is reverted in 6 months. Why?',help:'Adoption failure, unintended consequences, or wrong diagnosis?'},
      {key:'resistance',prompt:'Who will resist this change and why?',help:'Address resistance proactively, not reactively.'},
      {key:'second_order',prompt:'What are the second-order effects of this change?',help:'What breaks downstream when you fix this upstream?'},
      {key:'simpler_alternative',prompt:'Is there a simpler change that would achieve 80% of the benefit?',help:'Complexity is a cost.'},
    ],
  },
  hire_fire: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is the hire or separation decision?',help:'Role, person (if applicable), and direction.'},
      {key:'urgency',prompt:'Why is this decision urgent, and what happens if you delay 30 days?',help:'Urgency should be real, not manufactured.'},
    ],
    develop: [
      {key:'role_clarity',prompt:'Is the role clearly defined, and does the team agree on what success looks like?',help:'Unclear roles cause most hiring and performance failures.'},
      {key:'evidence',prompt:'What specific evidence supports this decision?',help:'Concrete examples, not impressions.'},
      {key:'alternatives',prompt:'What alternatives have you considered?',help:'Coaching, role change, team restructure, or waiting.'},
      {key:'process',prompt:'What is the fair and legal process for this decision?',help:'Consult HR or legal if in doubt.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine this decision creates a serious problem in 6 months. What happened?',help:'Wrong hire, wrongful termination claim, team morale collapse.'},
      {key:'bias_check',prompt:'What biases might be affecting your judgment here?',help:'Affinity bias, recency bias, attribution error.'},
      {key:'team_impact',prompt:'How will this decision affect the rest of the team?',help:'Model the second-order effects on morale and workload.'},
      {key:'reversibility',prompt:'How reversible is this decision, and at what cost?',help:'Hiring is more reversible than firing — but both have costs.'},
    ],
  },
  general: {
    spark: [
      {key:'one_sentence',prompt:'In one sentence, what is this idea?',help:'State it clearly enough that a stranger would understand.'},
      {key:'why_now',prompt:'Why are you thinking about this now?',help:'Context and timing matter.'},
    ],
    develop: [
      {key:'core_value',prompt:'What is the core value this idea creates, and for whom?',help:'Value must be real and specific.'},
      {key:'effort',prompt:'What would it take to act on this idea?',help:'Time, money, skills, relationships.'},
      {key:'dependencies',prompt:'What needs to be true for this idea to work?',help:'List the key assumptions.'},
      {key:'first_step',prompt:'What is the single next action that would move this idea forward?',help:'Make it concrete and completable in under 2 hours.'},
    ],
    stress_test: [
      {key:'premortem',prompt:'Imagine this idea fails or is abandoned. What caused it?',help:'Specific failure modes.'},
      {key:'opportunity_cost',prompt:'What are you NOT doing if you pursue this?',help:'Every yes is a no to something else.'},
      {key:'simpler_version',prompt:'What is the simplest version of this idea that still delivers the core value?',help:'Simplicity reduces risk.'},
      {key:'who_disagrees',prompt:'Who would strongly disagree with this idea, and why?',help:'Engage with the strongest objection.'},
    ],
  },
};

const IDEA_STAGE_COLORS = {spark:'var(--t3)',develop:'var(--ac)',stress_test:'var(--warn)',verdict:'var(--ok)'};
const IDEA_STAGE_LABELS = {spark:'Spark',develop:'Develop',stress_test:'Stress Test',verdict:'Verdict'};
const IDEA_TYPE_ICONS = {tool_to_build:'🔧',business:'💼',content:'✍️',career:'🎯',investment:'📈',process_change:'⚙️',hire_fire:'👥',general:'💡'};
const IDEA_TYPE_LABELS = {tool_to_build:'Tool to Build',business:'Business',content:'Content',career:'Career',investment:'Investment',process_change:'Process Change',hire_fire:'Hire / Fire',general:'General'};

function ideaICE(idea){return Math.round(((idea.ice_impact||5)+(idea.ice_confidence||5)+(idea.ice_ease||5))/3*10)/10;}
function ideaDaysInStage(idea){
  const stageAtKey=idea.stage+'_at';
  const stageAt=idea[stageAtKey]||idea.createdAt;
  if(!stageAt)return 0;
  return Math.floor((Date.now()-_pd(stageAt).getTime())/(1000*60*60*24));
}
function ideaStagePill(stage,outcome){
  const label=outcome?({killed:'Killed',parked:'Parked',promoted:'Promoted'}[outcome]||IDEA_STAGE_LABELS[stage]):IDEA_STAGE_LABELS[stage];
  const color=outcome?({killed:'var(--red)',parked:'#8B5CF6',promoted:'var(--ok)'}[outcome]||IDEA_STAGE_COLORS[stage]):IDEA_STAGE_COLORS[stage];
  return `<span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600">${label}</span>`;
}

let _ideasView='active';
function renderIdeasLeaderboard(){
  // Rank all non-killed ideas by total votes + ICE score
  const ranked=D.ideas
    .filter(x=>x.verdict_outcome!=='killed')
    .map(x=>({
      idea:x,
      ice:ideaICE(x),
      votes:(x.votes||[]).reduce((s,v)=>s+v.score,0),
      score:ideaICE(x)*0.6+((x.votes||[]).reduce((s,v)=>s+v.score,0))*0.4
    }))
    .sort((a,b)=>b.score-a.score);
  if(!ranked.length)return `<div style="text-align:center;padding:48px;color:var(--t3)">No ideas to rank yet. Add some ideas first.</div>`;
  const medals=['🥇','🥈','🥉'];
  return `<div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:12px">Ranked by ICE score (60%) + community votes (40%). Click any row to open the idea.</div>
    <div style="display:flex;flex-direction:column;gap:6px">
    ${ranked.map((r,i)=>{
      const idea=r.idea;
      const medal=medals[i]||`<span style="font-size:12px;font-weight:700;color:var(--t3);width:20px;text-align:center">#${i+1}</span>`;
      const barW=Math.round((r.score/Math.max(...ranked.map(x=>x.score),1))*100);
      return `<div style="background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px" onclick="openIdeaDetail(${idea.id})" onmouseover="this.style.background='var(--s3)'" onmouseout="this.style.background='var(--s2)'">
        <span style="font-size:18px;width:24px;text-align:center;flex-shrink:0">${medal}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(idea.title)}</div>
          <div style="height:4px;background:var(--s3);border-radius:2px;overflow:hidden;margin-bottom:3px">
            <div style="height:100%;width:${barW}%;background:var(--ac);border-radius:2px;transition:width .3s"></div>
          </div>
          <div style="display:flex;gap:8px;font-size:11px;color:var(--t3)">
            ${ideaStagePill(idea.stage,idea.verdict_outcome)}
            <span>ICE <strong style="color:var(--ac)">${r.ice}</strong></span>
            <span>Votes <strong style="color:var(--ok)">${r.votes}</strong></span>
            <span>Score <strong style="color:var(--t1)">${r.score.toFixed(1)}</strong></span>
          </div>
        </div>
        <button class="btn btn-s" style="font-size:11px;padding:3px 8px;flex-shrink:0" onclick="event.stopPropagation();openIdeaVote(${idea.id})">👍 Vote</button>
      </div>`;
    }).join('')}
    </div>
  </div>`;
}
function renderIdeas(){
  const el=$('ideas-main');
  if(!el)return;
  const me=D.creds.userName||'Idris Grant';
  const staleCount=D.ideas.filter(x=>['develop','stress_test'].includes(x.stage)&&ideaDaysInStage(x)>=14).length;
  // Update badge
  const badge=document.getElementById('badge-ideas');
  if(badge){badge.textContent=staleCount||'';badge.style.display=staleCount?'':'none';}

  const viewTabs=['active','parked','graveyard','promoted','all','leaderboard'];
  const viewLabels={active:'Active',parked:'Parked',graveyard:'Graveyard',promoted:'Promoted',all:'All',leaderboard:'🏆 Leaderboard'};
  function filterIdeas(v){
    if(v==='active')return D.ideas.filter(x=>['spark','develop','stress_test'].includes(x.stage));
    if(v==='parked')return D.ideas.filter(x=>x.stage==='verdict'&&x.verdict_outcome==='parked');
    if(v==='graveyard')return D.ideas.filter(x=>x.stage==='verdict'&&x.verdict_outcome==='killed');
    if(v==='promoted')return D.ideas.filter(x=>x.stage==='verdict'&&x.verdict_outcome==='promoted');
    return D.ideas;
  }
  const ideas=filterIdeas(_ideasView);

  // I8: apply semantic search filter when active
  let filtered=ideas;
  if(_ideasSemanticIds)filtered=ideas.filter(i=>_ideasSemanticIds.has(i.id));
  else if(_ideasSearch){const q=_ideasSearch.toLowerCase();filtered=ideas.filter(i=>(i.title||'').toLowerCase().includes(q)||(i.description||'').toLowerCase().includes(q));}
  // I5: Monday weekly digest banner
  const today=new Date();
  const isMonday=today.getDay()===1;
  const cachedDigest=D.prefs&&D.prefs.aiIdeasWeeklyDigest;
  const showDigestBanner=isMonday&&D.ideas.length>=3&&(!cachedDigest||cachedDigest.date!==_ymd(today));
  el.innerHTML=`
  <div class="ph-r" style="margin-bottom:12px">
    <div>
      <h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('lightbulb',22,'var(--page-accent)')}Ideas</h1>
      <p style="font-size:12px;color:var(--t2)">Develop, stress-test, and decide which ideas earn your time.</p>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <input id="ideas-search" placeholder="🔍 Search ideas…" value="${esc(_ideasSearch)}" style="height:30px;font-size:11px;width:170px;padding:0 8px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;color:var(--t1)" oninput="_keepFocus(()=>setIdeasSearch(this.value))" onkeydown="if(event.key==='Enter'){event.preventDefault();aiIdeasSemanticSearch();}">
      <button class="btn btn-s" style="height:30px;font-size:11px;color:var(--ac)" onclick="aiIdeasSemanticSearch()" title="Semantic search via AI">✨ Semantic</button>
      <div style="position:relative;display:inline-block">
        <button class="btn btn-s" style="height:30px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('ideas-ai-menu')" title="AI tools">✨ AI ▾</button>
        <div id="ideas-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:34px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:220px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('ideas-ai-menu');openAIIdeaGenerator()">✨ Generate sparks</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('ideas-ai-menu');aiClusterIdeas()">🧩 Cluster by theme</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('ideas-ai-menu');openAIRoadmap()">🗺 Roadmap (Now/Next/Later)</button>
          <div style="height:1px;background:var(--bd1);margin:3px 2px"></div>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--t1);background:transparent;border:none;text-align:left" onclick="closePopMenu('ideas-ai-menu');aiAutoTagAllIdeas()">🏷 Auto-tag untagged</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('ideas-ai-menu');aiIdeasWeeklyDigest()">📅 Weekly digest</button>
        </div>
      </div>
      <button class="btn btn-p" onclick="openNewIdeaModal()">+ New Idea</button>
    </div>
  </div>
  ${showDigestBanner?`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:10px;background:linear-gradient(90deg,color-mix(in srgb,var(--ac) 14%,transparent),color-mix(in srgb,var(--purp) 14%,transparent));border:1px solid color-mix(in srgb,var(--ac) 30%,var(--bd2));border-radius:8px"><span style="font-size:18px">📅</span><div style="flex:1"><div style="font-size:11px;font-weight:600">It's Monday — want a digest?</div><div style="font-size:11px;color:var(--t3)">AI will summarize top ICE, stale items, and parked-due-for-review.</div></div><button class="btn btn-p" style="font-size:11px;height:28px" onclick="aiIdeasWeeklyDigest()">📅 Show digest</button></div>`:''}
  ${_ideasSemanticIds?`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;margin-bottom:8px;background:var(--acs);border:1px solid var(--ac);border-radius:6px;font-size:11px"><span>✨ Semantic search · ${filtered.length} match${filtered.length===1?'':'es'}</span><button class="btn btn-s" style="margin-left:auto;font-size:11px;height:22px" onclick="setIdeasSearch('')">✕ Clear</button></div>`:''}
  <div style="display:flex;gap:0;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden;margin-bottom:16px;width:fit-content">
    ${viewTabs.map(v=>{
      const cnt=filterIdeas(v).length;
      return `<button class="btn" style="border-radius:0;height:28px;font-size:11px;border:none;${_ideasView===v?'background:var(--ac);color:#fff':'background:transparent;color:var(--t2)'}" onclick="_ideasView='${v}';renderIdeas()">${viewLabels[v]}${cnt?` (${cnt})`:''}</button>`;
    }).join('')}
  </div>
  ${_ideasView==='leaderboard'?renderIdeasLeaderboard():filtered.length===0?renderEmptyState({icon:'lightbulb',title:_ideasSearch?'No matches for your search':_ideasView==='active'?'No ideas in flight':_ideasView==='parked'?'No parked ideas':_ideasView==='graveyard'?'Graveyard is empty':_ideasView==='promoted'?'No promoted ideas yet':'No ideas captured',hint:_ideasSearch?'Try the ✨ Semantic button for an AI-powered intent search.':_ideasView==='active'?'Every project starts as a spark. Capture one and develop it.':_ideasView==='all'?'Capture ideas the moment they appear — develop them later.':'Switch to another view or capture a new idea.',ctaLabel:_ideasSearch?'Clear search':'+ Capture an idea',ctaFn:_ideasSearch?"setIdeasSearch('')":'openNewIdeaModal()'}):`
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
    ${filtered.map(idea=>{
      const ice=ideaICE(idea);
      const days=ideaDaysInStage(idea);
      const stale=days>=14&&['develop','stress_test'].includes(idea.stage);
      const goalName=idea.goal_id?D.goals.find(g=>g.id===idea.goal_id)?.title:'';
      return `<div class="cd" style="cursor:pointer;border-left:3px solid ${IDEA_STAGE_COLORS[idea.stage]};${stale?'border-color:var(--red)':''}" onclick="openIdeaDetail(${idea.id})">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px">
          <span style="font-size:20px">${IDEA_TYPE_ICONS[idea.idea_type]||'💡'}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${esc(idea.title)}</div>
            <div style="font-size:11px;color:var(--t2);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(idea.description)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          ${ideaStagePill(idea.stage,idea.verdict_outcome)}
          <span style="font-size:11px;color:var(--t3)">${IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type}</span>
          ${stale?`<span style="font-size:11px;color:var(--red);font-weight:600">⚠ ${days}d stale</span>`:`<span style="font-size:11px;color:var(--t3)">${days}d in stage</span>`}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:11px;color:var(--t3)">ICE</span>
            <span style="font-size:12px;font-weight:700;color:var(--ac)">${ice}</span>
          </div>
          ${goalName?`<span style="font-size:11px;background:var(--ac)22;color:var(--ac);border-radius:4px;padding:1px 6px">🎯 ${esc(goalName.slice(0,20))}</span>`:''}
          ${idea.collaborators&&idea.collaborators.length?`<span style="font-size:11px;color:var(--t3)">👥 ${idea.collaborators.length}</span>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`}`;
}

function openNewIdeaModal(){
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">💡 New Idea</h2>
  <div style="margin-bottom:10px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Title *</label>
    <input id="ni-title" class="inp" style="width:100%;margin-top:4px" placeholder="What is the idea?">
  </div>
  <div style="margin-bottom:10px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">One-line description</label>
    <input id="ni-desc" class="inp" style="width:100%;margin-top:4px" placeholder="In one sentence…">
  </div>
  <!-- Rich Text Editor for full idea description -->
  <div style="margin-bottom:10px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Full Description <span style="font-size:11px;font-weight:400;text-transform:none;color:var(--t3)">(rich text — describe your idea in full detail)</span></label>
    ${luRTE_render({id:'ni-body-rte', placeholder:'Describe your idea in full… What problem does it solve? Who is it for? What makes it unique?', value:'', height:'160px'})}
    <!-- AI Assistance -->
    <div style="margin-top:6px;padding:8px;background:var(--s2);border-radius:6px;border:1px solid var(--brd)">
      <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px">✨ AI Assistance</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteIdeaAI('validate')">✅ Validate</button>
        <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteIdeaAI('premortem')">⚠ Pre-mortem</button>
        <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteIdeaAI('ice')">🎯 ICE Score</button>
        <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteIdeaAI('expand')">💡 Expand</button>
        <button type="button" class="btn btn-s" style="height:24px;font-size:11px" onclick="rteIdeaAI('competitors')">🔍 Competitors</button>
        ${typeof _aiLengthChip==='function'?_aiLengthChip():''}
      </div>
      <div id="ni-ai-result" style="display:none;margin-top:6px;padding:8px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:180px;overflow-y:auto"></div>
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:10px">
    <div style="flex:1">
      <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Idea type *</label>
      <select id="ni-type" class="inp" style="width:100%;margin-top:4px">
        ${Object.entries(IDEA_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${IDEA_TYPE_ICONS[k]} ${v}</option>`).join('')}
      </select>
    </div>
    <div style="flex:1">
      <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Link to goal</label>
      <select id="ni-goal" class="inp" style="width:100%;margin-top:4px">
        <option value="">— None —</option>
        ${D.goals.map(g=>`<option value="${g.id}">${g.icon} ${esc(g.title)}</option>`).join('')}
      </select>
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-p" onclick="saveNewIdea()">Create Idea</button>
    <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  setTimeout(()=>document.getElementById('ni-title')?.focus(),50);
}

function saveNewIdea(){
  const title=document.getElementById('ni-title')?.value.trim();
  const desc=document.getElementById('ni-desc')?.value.trim();
  const bodyHtml=document.getElementById('ni-body-rte')?.innerHTML||'';
  const idea_type=document.getElementById('ni-type')?.value||'general';
  const goal_id=parseInt(document.getElementById('ni-goal')?.value)||null;
  if(!title){toast('Please enter a title.');return;}
  const idea={
    id:nextId(D.ideas),title,description:desc||'',bodyHtml:bodyHtml||'',idea_type,stage:'spark',
    goal_id,ice_impact:5,ice_confidence:5,ice_ease:5,
    ai_ice_impact:null,ai_ice_confidence:null,ai_ice_ease:null,ai_ice_rationale:null,
    kill_reason:null,parked_review_date:null,promoted_project_id:null,verdict_outcome:null,
    spark_at:new Date().toISOString(),develop_at:null,stress_test_at:null,verdict_at:null,
    answers:[],collaborators:[],comments:[],votes:[],checkIns:[],
    createdBy:D.creds.userName||'Idris Grant',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  };
  D.ideas.push(idea);
  save('ideas');
  closeModal();
  renderIdeas();
  toast('💡 Idea captured! Open it to develop further.');
  // Open detail immediately
  openIdeaDetail(idea.id);
}

let _currentIdeaId=null;
let _ideaAIMode='devil'; // 'devil' or 'champion'
function openIdeaDetail(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  _currentIdeaId=id;
  renderIdeaDetail(idea);
  // Load related bookmarks for the idea rail
  setTimeout(()=>loadRelatedBookmarks('idea', id), 0);
}

function renderIdeaDetail(idea){
  const el=$('ideas-main');
  if(!el)return;
  const rail=$('ideas-rail');
  const stages=['spark','develop','stress_test','verdict'];
  const stageIdx=stages.indexOf(idea.stage);
  const qs=IDEA_QUESTION_TEMPLATES[idea.idea_type]||IDEA_QUESTION_TEMPLATES.general;
  const ice=ideaICE(idea);

  // Render main content
  el.innerHTML=`
  <div style="max-width:900px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <button class="btn btn-s" style="font-size:11px" onclick="renderIdeas()">← Ideas</button>
    </div>
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
      <div style="flex:1">
        <div contenteditable="true" id="idea-title-edit" style="font-size:22px;font-weight:700;outline:none;border-bottom:2px solid transparent;padding-bottom:2px" onfocus="this.style.borderColor='var(--ac)'" onblur="this.style.borderColor='transparent';updateIdeaTitle(${idea.id},this.textContent)">${esc(idea.title)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:4px">${IDEA_TYPE_ICONS[idea.idea_type]} ${IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type} &nbsp;·&nbsp; Created ${_pd(idea.createdAt).toLocaleDateString()}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <div style="background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:4px 10px;text-align:center">
          <div style="font-size:16px;font-weight:700;color:var(--ac)">${ice}</div>
          <div style="font-size:11px;color:var(--t3)">ICE</div>
        </div>
        <button class="btn btn-s" style="font-size:11px" onclick="openIdeaShare(${idea.id})">👥 Share</button>
        <button class="btn btn-s" style="font-size:11px" onclick="exportIdeaMarkdown(${idea.id})" title="Export as Markdown">⬇ MD</button>
        <button class="btn btn-s" style="font-size:11px" onclick="exportIdeaPDF(${idea.id})" title="Export as PDF">🖨 PDF</button>
        <button class="btn btn-s" style="font-size:11px;color:var(--red)" onclick="if(confirm('Delete this idea?')){D.ideas=D.ideas.filter(x=>x.id!==${idea.id});save('ideas');renderIdeas();toast('Idea deleted.');}">🗑</button>
      </div>
    </div>

    <!-- Stage strip -->
    <div style="display:flex;gap:0;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;overflow:hidden;margin-bottom:20px">
      ${stages.map((s,i)=>{
        const active=idea.stage===s;
        const past=i<stageIdx;
        const color=active?'var(--ac)':past?'var(--ok)':'var(--t3)';
        const bg=active?'var(--ac)22':past?'var(--ok)11':'transparent';
        return `<div style="flex:1;padding:8px 4px;text-align:center;background:${bg};cursor:pointer;border-right:1px solid var(--bd1)" onclick="moveIdeaToStage(${idea.id},'${s}')">
          <div style="font-size:11px;font-weight:600;color:${color}">${IDEA_STAGE_LABELS[s]}</div>
          ${active?`<div style="width:6px;height:6px;background:var(--ac);border-radius:50%;margin:3px auto 0"></div>`:''}
        </div>`;
      }).join('')}
      <div style="flex:1;padding:8px 4px;text-align:center;cursor:pointer" onclick="openVerdictModal(${idea.id})">
        <div style="font-size:11px;font-weight:600;color:${idea.stage==='verdict'?'var(--ok)':'var(--t3)'}">Verdict</div>
        ${idea.verdict_outcome?`<div style="font-size:11px;color:var(--t3)">${idea.verdict_outcome}</div>`:''}
      </div>
    </div>

    <!-- AI mode toggle -->
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:16px;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;padding:6px 10px">
      <span style="font-size:11px;color:var(--t2)">AI mode:</span>
      <button class="btn btn-s" style="font-size:11px;${_ideaAIMode==='devil'?'background:var(--red)22;color:var(--red);border-color:var(--red)44':''}" onclick="_ideaAIMode='devil';renderIdeaDetail(D.ideas.find(x=>x.id==${_tidLit(idea.id)}))">😈 Devil's Advocate</button>
      <button class="btn btn-s" style="font-size:11px;${_ideaAIMode==='champion'?'background:var(--ok)22;color:var(--ok);border-color:var(--ok)44':''}" onclick="_ideaAIMode='champion';renderIdeaDetail(D.ideas.find(x=>x.id==${_tidLit(idea.id)}))">🏆 Champion</button>
      <button class="btn btn-s" style="font-size:11px;color:var(--ac)" onclick="aiIdeaDecisionBrief(${idea.id})" title="AI combines Devil + Champion arguments into a decision brief">📋 Decision Brief</button>
      ${idea.stage!=='verdict'||idea.verdict_outcome!=='promoted'?`<button class="btn btn-s" style="font-size:11px;color:var(--purp)" onclick="aiIdeaPromoteToProject(${idea.id})" title="AI drafts a project + tasks from this idea">📁 AI Promote → Project</button>`:''}
      ${idea.stage==='stress_test'?`<button class="btn btn-s" style="font-size:11px;margin-left:auto" onclick="ideaSynthesisMode(${idea.id})">✨ Synthesize</button>`:''}
    </div>

    <!-- Free-form body RTE -->
    <div style="margin-bottom:20px;border:1px solid var(--bd2);border-radius:8px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--s2);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:600">📝 Full Description</span>
          <span style="font-size:11px;color:var(--t3)">Rich text — edit freely</span>
        </div>
        <span style="display:flex;align-items:center;gap:8px">
          <span id="idea-rte-wc-${idea.id}" style="font-size:11px;color:var(--t3)">${idea.bodyHtml?(idea.bodyHtml.replace(/<[^>]+>/g,'').trim().split(/\s+/).filter(Boolean).length+' words'):'0 words'}</span>
          <span style="font-size:12px;color:var(--t3)">▾</span>
        </span>
      </div>
      <div style="padding:0">
        ${luRTE_render({id:`idea-body-rte-${idea.id}`, placeholder:'Describe your idea in full… What problem does it solve? Who is it for? What makes it unique?', value:(idea.bodyHtml||''), height:'140px'})}
        <div style="display:flex;justify-content:flex-end;padding:6px 8px;background:var(--s1);border-top:1px solid var(--bd1)">
          <button type="button" class="btn btn-p" style="height:24px;padding:0 10px;font-size:11px" onclick="saveIdeaBodyHtml(${idea.id})">✓ Save</button>
        </div>
        <!-- AI Assistance -->
        <div style="padding:8px;background:var(--s2);border-top:1px solid var(--bd1)">
          <div style="font-size:11px;font-weight:600;color:var(--t2);margin-bottom:5px">✨ AI Assistance</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="ideaDetailAI(${idea.id},'validate')">✅ Validate</button>
            <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="ideaDetailAI(${idea.id},'premortem')">💥 Pre-mortem</button>
            <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="ideaDetailAI(${idea.id},'expand')">${_icon('sparkles',12,'currentColor')} Expand</button>
            <button type="button" class="btn btn-s" style="height:22px;font-size:11px" onclick="ideaDetailAI(${idea.id},'competitors')">🔭 Competitors</button>
          </div>
          <div id="idea-detail-ai-result-${idea.id}" style="display:none;margin-top:5px;padding:7px;background:var(--s1);border-radius:4px;font-size:11px;color:var(--t2);line-height:1.6;white-space:pre-wrap;max-height:200px;overflow-y:auto"></div>
        </div>
      </div>
    </div>

    <!-- Question sections per stage -->
    ${['spark','develop','stress_test'].filter(s=>stages.indexOf(s)<=stageIdx).map(s=>{
      const stageQs=qs[s]||[];
      const collapsed=s!==idea.stage;
      return `<div style="margin-bottom:16px;border:1px solid var(--bd2);border-radius:8px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--s2);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <div style="display:flex;align-items:center;gap:8px">
            ${ideaStagePill(s)}
            <span style="font-size:13px;font-weight:600">${IDEA_STAGE_LABELS[s]} Questions</span>
          </div>
          <span style="font-size:12px;color:var(--t3)">${collapsed?'▸':'▾'}</span>
        </div>
        <div style="${collapsed?'display:none':''}padding:14px">
          ${stageQs.map(q=>{
            const ans=idea.answers.find(a=>a.stage===s&&a.question_key===q.key);
            return `<div style="margin-bottom:16px">
              <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
                <label style="font-size:12px;font-weight:600;flex:1">${esc(q.prompt)}</label>
                <button class="btn btn-s" style="font-size:11px;padding:2px 6px;white-space:nowrap" onclick="ideaAISparkle(${idea.id},'${s}','${q.key}',this)">✨ AI</button>
              </div>
              ${q.help?`<div style="font-size:11px;color:var(--t3);margin-bottom:6px;font-style:italic">${esc(q.help)}</div>`:''}
              <textarea class="inp" style="width:100%;min-height:80px;font-size:12px;resize:vertical" placeholder="Your answer…" onblur="saveIdeaAnswer(${idea.id},'${s}','${q.key}',this.value)">${esc(ans?.body||'')}</textarea>
            </div>`;
          }).join('')}
          <button class="btn btn-s" style="font-size:11px;margin-top:4px" onclick="ideaWhyStuck(${idea.id},'${s}')">🤔 Why I'm stuck</button>
        </div>
      </div>`;
    }).join('')}

    <!-- Move to next stage / verdict buttons -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      ${idea.stage==='spark'?`<button class="btn btn-p" onclick="moveIdeaToStage(${idea.id},'develop')">→ Move to Develop</button>`:''}
      ${idea.stage==='develop'?`<button class="btn btn-p" onclick="moveIdeaToStage(${idea.id},'stress_test')">→ Move to Stress Test</button>`:''}
        ${idea.stage==='stress_test'?`<button class="btn btn-p" onclick="openVerdictModal(${idea.id})">⚖ Move to Verdict</button><button class="btn btn-s" style="color:var(--warn)" onclick="runIdeaPremortem(${idea.id})">🧨 Premortem AI</button>`:''}      ${idea.stage!=='verdict'?`<button class="btn btn-s" style="color:var(--red)" onclick="openVerdictModal(${idea.id})">⚖ Verdict now</button>`:''}    </div>
  </div>`;

  // Render right rail
  if(rail){
    const linkedGoal=idea.goal_id?D.goals.find(g=>g.id===idea.goal_id):null;
    const similar=D.ideas.filter(x=>x.id!==idea.id&&(x.idea_type===idea.idea_type||x.title.split(' ').some(w=>w.length>4&&idea.title.toLowerCase().includes(w.toLowerCase())))).slice(0,3);
    rail.innerHTML=`
    <div style="padding:14px">
      <!-- Goal link -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Linked goal</div>
        <select class="inp" style="width:100%;font-size:12px" onchange="updateIdeaGoal(${idea.id},parseInt(this.value)||null)">
          <option value="">— None —</option>
          ${D.goals.map(g=>`<option value="${g.id}" ${idea.goal_id===g.id?'selected':''}>${g.icon} ${esc(g.title)}</option>`).join('')}
        </select>
        ${!linkedGoal?`<div style="font-size:11px;color:var(--t3);margin-top:4px;font-style:italic">Ideas without a goal link tend to drift. Pick one, or note this is exploratory.</div>`:''}
      </div>

      <!-- ICE score -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">ICE score</div>
        ${[['ice_impact','Impact'],['ice_confidence','Confidence'],['ice_ease','Ease']].map(([k,l])=>`
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${l}</span><span style="font-weight:700;color:var(--ac)">${idea[k]||5}</span></div>
          <input type="range" min="1" max="10" value="${idea[k]||5}" style="width:100%" oninput="updateIdeaICE(${idea.id},'${k}',parseInt(this.value));this.previousElementSibling.querySelector('span:last-child').textContent=this.value">
        </div>`).join('')}
        <div style="text-align:center;margin:8px 0">
          <div style="font-size:20px;font-weight:700;color:var(--ac)">${ice}</div>
          <div style="font-size:11px;color:var(--t3)">ICE average</div>
        </div>
        ${idea.ai_ice_rationale?`<div style="background:var(--s3);border-radius:6px;padding:8px;font-size:11px;color:var(--t2);margin-top:6px"><div style="font-weight:600;margin-bottom:4px">AI suggestion: ${idea.ai_ice_impact}/${idea.ai_ice_confidence}/${idea.ai_ice_ease}</div>${esc(idea.ai_ice_rationale)}<br><button class="btn btn-s" style="font-size:11px;margin-top:6px" onclick="useAIIceScore(${idea.id})">Use AI score</button></div>`:`<button class="btn btn-s" style="width:100%;font-size:11px;margin-top:4px" onclick="requestAIIceScore(${idea.id})">✨ Get AI score</button>`}
      </div>

      <!-- Similar ideas -->
      ${similar.length?`<div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Similar ideas</div>
        ${similar.map(s=>`<div style="padding:6px 0;border-bottom:1px solid var(--bd1);cursor:pointer" onclick="openIdeaDetail(${s.id})">
          <div style="font-size:11px;font-weight:500">${esc(s.title)}</div>
          <div style="display:flex;gap:4px;margin-top:2px">${ideaStagePill(s.stage,s.verdict_outcome)}${s.kill_reason?`<span style="font-size:11px;color:var(--t3)">${esc(s.kill_reason.slice(0,30))}</span>`:''}</div>
        </div>`).join('')}
      </div>`:''}

      <!-- Collaborators -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Collaborators</div>
        ${(idea.collaborators||[]).map(c=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><div style="width:24px;height:24px;border-radius:50%;background:var(--ac);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">${c.email[0].toUpperCase()}</div><div style="flex:1"><div style="font-size:11px">${esc(c.email)}</div><div style="font-size:11px;color:var(--t3)">${c.role}</div></div><button class="btn btn-s" style="font-size:11px;color:var(--red)" onclick="revokeIdeaCollaborator(${idea.id},'${c.email}')">✕</button></div>`).join('')}
        <button class="btn btn-s" style="width:100%;font-size:11px;margin-top:6px" onclick="openIdeaInvite(${idea.id})">+ Invite</button>
      </div>

      <!-- Activity log -->
      <div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Activity</div>
        <div style="font-size:11px;color:var(--t3)">
          <div style="padding:4px 0;border-bottom:1px solid var(--bd1)">Created ${_pd(idea.createdAt).toLocaleDateString()}</div>
          ${idea.develop_at?`<div style="padding:4px 0;border-bottom:1px solid var(--bd1)">Moved to Develop ${_pd(idea.develop_at).toLocaleDateString()}</div>`:''}
          ${idea.stress_test_at?`<div style="padding:4px 0;border-bottom:1px solid var(--bd1)">Moved to Stress Test ${_pd(idea.stress_test_at).toLocaleDateString()}</div>`:''}
          ${idea.verdict_at?`<div style="padding:4px 0">Verdict: ${idea.verdict_outcome} ${_pd(idea.verdict_at).toLocaleDateString()}</div>`:''}
        </div>
      </div>

      <!-- Related Bookmarks -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">🔗 Related Bookmarks</div>
          <button class="btn btn-s" style="font-size:11px;padding:2px 6px" onclick="showLinkBookmarkPanel('idea',${idea.id})">+ Link</button>
        </div>
        <div id="related-bk-idea-${idea.id}" style="font-size:11px;color:var(--t3)">Loading...</div>
      </div>
    </div>`;
  }
}

function saveIdeaBodyHtml(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const rte=document.getElementById('idea-body-rte-'+id);
  if(rte){idea.bodyHtml=rte.innerHTML;idea.updatedAt=new Date().toISOString();save('ideas');toast('\u2713 Description saved!');}
}

async function ideaDetailAI(id,mode){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const rte=document.getElementById('idea-body-rte-'+id);
  const body=(rte?.innerText||'').trim();
  const context=`Idea: ${idea.title}\nOne-liner: ${idea.description||''}\nDescription: ${body}`;
  const resultEl='idea-detail-ai-result-'+id;
  const prompts={
    validate:`You are a startup advisor. Validate this idea: identify the core value proposition, target market, and 3 key risks. Be direct and constructive.\n\n${context}`,
    premortem:`You are a critical thinker. Imagine this idea has failed 2 years from now. List the 5 most likely reasons it failed. Be specific and actionable.\n\n${context}`,
    expand:`You are a product strategist. Expand this idea with additional use cases, potential features, monetisation angles, and adjacent opportunities.\n\n${context}`,
    competitors:`You are a market researcher. List 5 potential competitors or alternatives to this idea. For each, note their key strength and how this idea could differentiate.\n\n${context}`,
  };
  const systemPrompt=prompts[mode]||prompts.validate;
  await _rteAIGeneral(systemPrompt,body||idea.title,resultEl,'idea-body-rte-'+id);
}

function updateIdeaTitle(id,title){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea||!title.trim())return;
  idea.title=title.trim();
  idea.updatedAt=new Date().toISOString();
  save('ideas');
}
function updateIdeaGoal(id,goalId){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  idea.goal_id=goalId;
  idea.updatedAt=new Date().toISOString();
  save('ideas');
  renderIdeaDetail(idea);
}
function updateIdeaICE(id,key,val){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  idea[key]=val;
  idea.updatedAt=new Date().toISOString();
  save('ideas');
  // Update ICE display
  const ice=ideaICE(idea);
  const iceEl=document.querySelector('[data-ice-display]');
  if(iceEl)iceEl.textContent=ice;
}
function saveIdeaAnswer(id,stage,key,body){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const existing=idea.answers.find(a=>a.stage===stage&&a.question_key===key);
  if(existing){existing.body=body;existing.updated_at=new Date().toISOString();}
  else{idea.answers.push({id:Date.now(),stage,question_key:key,body,updated_at:new Date().toISOString()});}
  idea.updatedAt=new Date().toISOString();
  save('ideas');
}
function moveIdeaToStage(id,stage){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const stages=['spark','develop','stress_test','verdict'];
  const curIdx=stages.indexOf(idea.stage);
  const newIdx=stages.indexOf(stage);
  if(newIdx>curIdx+1){
    if(!confirm(`Skip to ${IDEA_STAGE_LABELS[stage]}? This will skip intermediate stages.`))return;
  }
  idea.stage=stage;
  idea[stage+'_at']=new Date().toISOString();
  idea.updatedAt=new Date().toISOString();
  save('ideas');
  renderIdeaDetail(idea);
  toast(`→ Moved to ${IDEA_STAGE_LABELS[stage]}`);
}
// BUGFIX: the Process (GTD) Ideas-triage buttons (→ Develop / 🅿 Park /
// 🗑 Kill) and the Ideas "👍 Vote" / empty-state "+ Add Note" buttons
// called these functions, which were never defined — the buttons did
// nothing. Lightweight stage setter (no skip-confirm / no detail re-render
// since the Process page re-renders itself afterwards).
function ideaAdvanceStage(id,stage){
  const idea=(D.ideas||[]).find(x=>x.id===id);
  if(!idea)return;
  idea.stage=stage;
  if(stage&&!idea[stage+'_at'])idea[stage+'_at']=new Date().toISOString();
  idea.updatedAt=new Date().toISOString();
  save('ideas');
}
function openIdeaVote(id){
  const idea=(D.ideas||[]).find(x=>x.id===id);
  if(!idea)return;
  idea.votes=idea.votes||[];
  const me=D.creds.userName||'Idris Grant';
  const i=idea.votes.findIndex(v=>v.by===me);
  if(i>=0){idea.votes.splice(i,1);toast('Vote removed');}
  else{idea.votes.push({by:me,score:1,ts:new Date().toISOString()});toast('👍 Voted');}
  idea.updatedAt=new Date().toISOString();
  save('ideas');
  if(typeof curScreen!=='undefined'&&curScreen==='ideas'&&typeof renderIdeas==='function')renderIdeas();
}
function openNewNote(){
  if(typeof openFA==='function')openFA('note');
  else if(typeof openModal==='function')openModal('capture');
}

// Helper: route Ideas-page AI calls through the user's chosen provider via ai.assist tRPC.
// ─── Ideas AI suite (I1-I8) ───────────────────────────────────────────
// I8: semantic search state — when active, only ideas in this id set render.
if(typeof _ideasSearch==='undefined')var _ideasSearch='';
if(typeof _ideasSemanticIds==='undefined')var _ideasSemanticIds=null;
function setIdeasSearch(q){_ideasSearch=q||'';_ideasSemanticIds=null;renderIdeas();}
async function aiIdeasSemanticSearch(){
  const q=document.getElementById('ideas-search')?.value.trim();
  if(!q)return toast('Type a search query first');
  if(!D.ideas.length)return toast('No ideas yet');
  toast({type:'info',title:'AI searching…',duration:1500});
  try{
    const lines=D.ideas.map((i,idx)=>`${idx+1}. ${i.title} — ${(i.description||'').slice(0,100)}`).join('\n');
    const sys=`You are a semantic search engine. Given a numbered list of ideas and a user query, return the indices of ideas whose meaning, intent, or theme matches the query (not just keyword matches). Reply with strict JSON only: {"matches":[1,4,12], "reason":"…"}`;
    const text=String(await _ideaAICall(`Query: "${q}"\nIdeas:\n${lines}\n\nReturn the indices of semantically matching ideas.`,true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const parsed=JSON.parse(text);
    const matches=Array.isArray(parsed.matches)?parsed.matches.map(n=>D.ideas[n-1]).filter(Boolean):[];
    _ideasSemanticIds=new Set(matches.map(i=>i.id));
    renderIdeas();
    toast({type:'success',title:`✨ ${matches.length} semantic match${matches.length===1?'':'es'}`,msg:parsed.reason||'',duration:3000});
  }catch(e){toast({type:'error',title:'Semantic search failed',msg:String(e.message||e).slice(0,200),duration:4000});}
}
// I1: AI Idea Generator — generate 5 sparks from a prompt
function openAIIdeaGenerator(){
  const m=document.getElementById('modal-content');if(!m)return;
  const goalOpts='<option value="">— No goal —</option>'+D.goals.map(g=>`<option value="${g.id}">${esc(g.icon||'🎯')} ${esc(g.title)}</option>`).join('');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">✨ AI Idea Generator</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">Describe a topic, problem, or goal. AI will propose 5 fresh idea sparks you can save with one click.</div>
    <textarea id="aig-prompt" class="inp" style="width:100%;min-height:80px;font-size:12px;margin-bottom:8px;padding:8px" placeholder="e.g. ways to grow my newsletter audience to 5k subscribers, or, side projects that combine my skills in design and code…"></textarea>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <select id="aig-type" class="inp" style="flex:1;height:30px;font-size:11px;padding:0 6px">${Object.entries(IDEA_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${IDEA_TYPE_ICONS[k]||'💡'} ${v}</option>`).join('')}</select>
      <select id="aig-goal" class="inp" style="flex:1;height:30px;font-size:11px;padding:0 6px">${goalOpts}</select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:10px"><button class="btn btn-p" id="aig-go" onclick="aiIdeaGenerate()">✨ Generate 5 sparks</button><button class="btn btn-s" onclick="closeModal()">Cancel</button></div>
    <div id="aig-results"></div>`;
  document.getElementById('modal-capture').classList.add('show');
  setTimeout(()=>document.getElementById('aig-prompt')?.focus(),50);
}
async function aiIdeaGenerate(){
  const promptEl=document.getElementById('aig-prompt');const typeEl=document.getElementById('aig-type');const goalEl=document.getElementById('aig-goal');const btn=document.getElementById('aig-go');const results=document.getElementById('aig-results');
  const userPrompt=(promptEl?.value||'').trim();if(!userPrompt)return toast('Tell the AI what you want to brainstorm');
  const type=typeEl?.value||'general';const goalId=parseInt(goalEl?.value||'')||null;
  const goal=goalId?D.goals.find(g=>g.id===goalId):null;
  if(btn){btn.disabled=true;btn.textContent='⏳ Generating…';}
  try{
    const sys=`You are a creative-but-practical brainstorming partner. Given a user prompt, generate 5 distinct idea sparks. Each must be specific (not vague), framed as a single project / experiment / piece of work, and varied in approach (don't propose 5 versions of the same thing). Reply with strict JSON only: {"ideas":[{"title":"…","description":"…"}, …]}`;
    const userContent=`Topic: ${userPrompt}${goal?`\nLinked goal: ${goal.icon||''} ${goal.title} — ${goal.target||''}`:''}\nIdea type focus: ${IDEA_TYPE_LABELS[type]||type}\nGenerate 5 sparks.`;
    const text=String(await _ideaAICall(userContent.replace(/^Topic:/,sys+'\n\nTopic:'),true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const parsed=JSON.parse(text);
    const ideas=Array.isArray(parsed.ideas)?parsed.ideas.slice(0,5):[];
    if(!ideas.length)throw new Error('No ideas returned');
    results.innerHTML=`<div style="font-size:11px;color:var(--t3);margin-bottom:6px">Click any spark to save it as a new idea:</div>${ideas.map((i,idx)=>`<div class="cd" style="cursor:pointer;margin-bottom:6px;padding:10px" onclick="saveAIGeneratedSpark(${idx})" id="aig-card-${idx}"><div style="font-size:13px;font-weight:600;margin-bottom:3px">💡 ${esc(i.title||'')}</div><div style="font-size:11px;color:var(--t2);line-height:1.45">${esc(i.description||'')}</div></div>`).join('')}<button class="btn btn-s" onclick="aiIdeaGenerate()" style="font-size:11px;margin-top:6px">↻ Regenerate</button>`;
    window._aigCache={ideas,type,goalId};
  }catch(e){results.innerHTML=`<div style="color:var(--red);font-size:11px;padding:8px">Failed: ${esc(String(e.message||e).slice(0,200))}</div>`;}
  finally{if(btn){btn.disabled=false;btn.textContent='✨ Regenerate';}}
}
function saveAIGeneratedSpark(idx){
  const cache=window._aigCache;if(!cache||!cache.ideas[idx])return;
  const i=cache.ideas[idx];
  const idea={id:nextId(D.ideas),title:i.title,description:i.description,bodyHtml:'',idea_type:cache.type||'general',stage:'spark',goal_id:cache.goalId||null,ice_impact:5,ice_confidence:5,ice_ease:5,ai_ice_impact:null,ai_ice_confidence:null,ai_ice_ease:null,ai_ice_rationale:null,kill_reason:null,parked_review_date:null,promoted_project_id:null,verdict_outcome:null,spark_at:new Date().toISOString(),develop_at:null,stress_test_at:null,verdict_at:null,answers:[],collaborators:[],comments:[],votes:[],checkIns:[],createdBy:D.creds.userName||'Idris Grant',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),ai_generated:true};
  D.ideas.push(idea);save('ideas');
  const card=document.getElementById('aig-card-'+idx);if(card){card.style.opacity='.4';card.style.pointerEvents='none';card.innerHTML=card.innerHTML+'<div style="font-size:11px;color:var(--ok);margin-top:4px">✓ Saved</div>';}
  toast(`💡 "${i.title}" saved`);
}
// I2: AI Promote-to-Project
async function aiIdeaPromoteToProject(id){
  const idea=D.ideas.find(x=>x.id===id);if(!idea)return;
  if(!confirm(`AI will draft a project (name + milestones + 5 first tasks) from "${idea.title}". Continue?`))return;
  toast({type:'info',title:'Drafting project…',duration:2000});
  try{
    const answers=(idea.answers||[]).filter(a=>a.body&&a.body.trim()).map(a=>`[${a.stage}] ${a.body}`).join('\n');
    const ideaCtx=`Idea: ${idea.title}\nDescription: ${idea.description||'(none)'}\nType: ${IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type}\nAnswers:\n${answers||'(none)'}`;
    const sys=`You are a project planner. Convert an idea into an actionable project. Reply with strict JSON only: {"name":"…","desc":"…","milestones":[{"title":"…","due_offset_days":N}, …max 4],"tasks":[{"title":"…","priority":"High|Medium|Low","est_minutes":N}, …exactly 5]}`;
    const text=String(await _ideaAICall(`${sys}\n\n${ideaCtx}\n\nDraft the project.`,true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const p=JSON.parse(text);
    if(!p||!p.name||!Array.isArray(p.tasks))throw new Error('Bad AI response');
    // Show preview modal so the user can confirm before creating
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">📁 Promote to Project</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">AI-drafted project. Review and confirm.</div>
      <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(p.name)}</div>
        <div style="font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:8px;overflow-wrap:anywhere;word-break:break-word">${esc(p.desc||'')}</div>
        ${(p.milestones||[]).length?`<div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Milestones</div>${p.milestones.map(ms=>`<div style="font-size:11px;padding:2px 0;color:var(--t1)">🏁 ${esc(ms.title||'')} <span style="color:var(--t3);font-size:11px">(in ${ms.due_offset_days||30}d)</span></div>`).join('')}`:''}
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin:8px 0 4px">First 5 tasks</div>
        ${p.tasks.map(t=>`<div style="font-size:11px;padding:2px 0;color:var(--t1)">📋 ${esc(t.title||'')} <span style="color:var(--t3);font-size:11px">[${esc(t.priority||'Medium')}, ~${t.est_minutes||30}m]</span></div>`).join('')}
      </div>
      <div style="display:flex;gap:6px"><button class="btn btn-p" onclick="confirmAIPromotion(${id})" style="font-size:11px">✓ Create project + tasks</button><button class="btn btn-s" onclick="closeModal()">Cancel</button></div>`;
    window._aigPromote={ideaId:id,plan:p};
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'AI promote failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
function confirmAIPromotion(id){
  const cache=window._aigPromote;if(!cache||cache.ideaId!==id)return;
  const idea=D.ideas.find(x=>x.id===id);if(!idea)return;
  const p=cache.plan;
  const project={id:Date.now(),name:p.name,desc:p.desc||'',color:'#3b82f6',status:'Active',pct:0,due:'',startDate:_ymd(new Date()),createdBy:D.creds.userName||'Idris Grant',createdAt:new Date().toISOString(),milestones:(p.milestones||[]).map((ms,i)=>({id:i+1,title:ms.title,date:_ymd(new Date(Date.now()+(ms.due_offset_days||30)*86400000)),done:false}))};
  if(!D.projects)D.projects=[];
  D.projects.push(project);save('projects');
  // Create 5 tasks linked to project
  (p.tasks||[]).slice(0,5).forEach((t,i)=>{
    D.tasks.push({id:Date.now()+i+1,title:t.title,priority:t.priority||'Medium',status:'Not Started',due:'',startDate:'',endDate:'',startTime:'',endTime:'',estimatedMins:t.est_minutes||30,context:'',project:project.name,projectId:project.id,myDay:false,energy:'medium',tags:['promoted-idea'],notes:`From idea: ${idea.title}`,recurring:'None',subtasks:[],linkedGoalId:idea.goal_id||null,assignedTo:D.creds.userName||'Idris Grant',createdBy:D.creds.userName||'Idris Grant'});
  });
  save('tasks');
  // Mark idea as promoted
  idea.stage='verdict';idea.verdict_outcome='promoted';idea.verdict_at=new Date().toISOString();idea.promoted_project_id=project.id;
  save('ideas');
  closeModal();
  toast({type:'success',title:`📁 Project + ${(p.tasks||[]).length} tasks created`,msg:`"${project.name}" is in your projects list.`,duration:3500});
  if(typeof renderIdeas==='function')renderIdeas();
}
// I3: AI Decision Brief — combines devil + champion arguments
async function aiIdeaDecisionBrief(id){
  const idea=D.ideas.find(x=>x.id===id);if(!idea)return;
  toast({type:'info',title:'Building decision brief…',duration:2000});
  try{
    const answers=(idea.answers||[]).filter(a=>a.body&&a.body.trim()).map(a=>`[${a.stage}/${a.question_key}]: ${a.body}`).join('\n');
    const ice=ideaICE(idea);
    const sys=`You are an experienced strategic advisor preparing a one-page decision brief. Output MUST be markdown with these exact sections, in order: ## Recommendation (one line: PROMOTE / PARK / KILL with confidence %), ## Why this idea wins (3 bullets), ## Why it might fail (3 bullets), ## What we don't know yet (2 bullets), ## Decision criteria met / not met, ## Suggested next step (1-2 sentences). Be honest and specific.`;
    const ctx=`Idea: ${idea.title}\nType: ${IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type}\nDescription: ${idea.description||'(none)'}\nStage: ${idea.stage}\nICE composite: ${ice}\nAnswers so far:\n${answers||'(none)'}\nUser ICE (impact/conf/ease): ${idea.ice_impact}/${idea.ice_confidence}/${idea.ice_ease}\nAI ICE: ${idea.ai_ice_impact||'—'}/${idea.ai_ice_confidence||'—'}/${idea.ai_ice_ease||'—'}`;
    const text=String(await _ideaAICall(`${sys}\n\n${ctx}\n\nWrite the decision brief.`)||'').trim();
    // Render the markdown so headings / bullets / bold show formatted in the
    // modal preview AND get saved to idea.decisionBriefHtml for future renders
    // (drawer, summary card, etc.) without recomputing renderMd every time.
    const html=(typeof renderMd==='function')?renderMd(text):`<div style="white-space:pre-wrap">${esc(text)}</div>`;
    // _jsArg: raw JSON in a double-quoted onclick ended the attribute at the
// brief's first quote, so Copy markdown did nothing.
    const copyJs=`navigator.clipboard.writeText(${_jsArg(text)});toast('📋 Copied')`;
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">📋 Decision Brief: ${esc(idea.title)}</h2><div id="ai-brief-preview" style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:14px;font-size:12px;line-height:1.7;max-height:480px;overflow-y:auto">${html}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-p" onclick="_aiBriefAppendToIdea(${idea.id})" title="Append the brief to the idea's full description">⬇ Append to Description</button><button class="btn btn-s" onclick="${copyJs}">📋 Copy markdown</button><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
    // Persist BOTH the markdown source (for editing / regenerating) and the
    // pre-rendered HTML (for instant display in drawers / summaries). The
    // drawer-render code can prefer .decisionBriefHtml when present, fall
    // back to renderMd(.decisionBrief) for legacy briefs.
    idea.decisionBrief=text;
    idea.decisionBriefHtml=html;
    idea.decisionBriefAt=new Date().toISOString();
    save('ideas');
  }catch(e){toast({type:'error',title:'Brief failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
// Append the rendered Decision Brief HTML into the idea's full description
// (idea.descriptionHtml) so it lives inside the idea body alongside the user's
// own writing. Falls back to creating descriptionHtml if it doesn't exist yet.
function _aiBriefAppendToIdea(id){
  const idea=D.ideas.find(x=>x.id===id);if(!idea)return;
  const prev=String(idea.descriptionHtml||idea.description||'').trim();
  const briefHtml=idea.decisionBriefHtml||(typeof renderMd==='function'?renderMd(idea.decisionBrief||''):'');
  if(!briefHtml)return toast('No brief content to append');
  const stamp=new Date().toLocaleDateString();
  const block=`<hr style="border:none;border-top:1px solid var(--bd1);margin:10px 0"><div style="font-size:11px;color:var(--t3);margin-bottom:4px">📋 Decision Brief · ${stamp}</div>${briefHtml}`;
  idea.descriptionHtml=prev?prev+block:block;
  // Keep .description in sync as a plain-text fallback for older renderers.
  idea.description=(idea.description||'')+(idea.description?'\n\n':'')+'--- Decision Brief ('+stamp+') ---\n'+(idea.decisionBrief||'');
  save('ideas');
  closeModal();
  toast({type:'success',title:'✓ Brief appended to idea',duration:3000});
  // Refresh the idea detail view if it's open. _currentIdeaId is a script-
  // scoped let (line ~19820) so it's directly accessible here without window.
  // renderIdeaDetail takes the idea object, not the id.
  if(typeof renderIdeaDetail==='function'&&typeof _currentIdeaId!=='undefined'&&_currentIdeaId===id)renderIdeaDetail(idea);
  else if(typeof renderIdeas==='function')renderIdeas();
}
// I4: AI Roadmap Generator
function openAIRoadmap(){
  const active=D.ideas.filter(x=>['spark','develop','stress_test'].includes(x.stage));
  if(!active.length)return toast('No active ideas to roadmap');
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🗺 AI Roadmap Generator</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">Pick the ideas to bundle into Now / Next / Later phases. AI will propose phasing and rationale.</div>
    <div style="max-height:280px;overflow-y:auto;border:1px solid var(--bd1);border-radius:6px;padding:6px;margin-bottom:10px">${active.map(i=>`<label style="display:flex;align-items:center;gap:6px;padding:5px 4px;cursor:pointer;font-size:11px"><input type="checkbox" value="${i.id}" checked style="width:14px;height:14px"><span style="flex:1">${IDEA_TYPE_ICONS[i.idea_type]||'💡'} ${esc(i.title)}</span><span style="font-size:11px;color:var(--t3)">ICE ${ideaICE(i)}</span></label>`).join('')}</div>
    <div style="display:flex;gap:6px"><button class="btn btn-p" onclick="aiGenerateRoadmap()">🗺 Generate roadmap</button><button class="btn btn-s" onclick="closeModal()">Cancel</button></div>
    <div id="airm-results" style="margin-top:10px"></div>`;
  document.getElementById('modal-capture').classList.add('show');
}
async function aiGenerateRoadmap(){
  const checks=document.querySelectorAll('#modal-content input[type="checkbox"]:checked');
  const ids=[...checks].map(c=>parseInt(c.value));
  if(!ids.length)return toast('Pick at least one idea');
  const ideas=D.ideas.filter(i=>ids.includes(i.id));
  toast({type:'info',title:'Building roadmap…',duration:2000});
  try{
    const lines=ideas.map(i=>`- ${i.title} (ICE ${ideaICE(i)}, ${IDEA_TYPE_LABELS[i.idea_type]||i.idea_type}): ${(i.description||'').slice(0,140)}`).join('\n');
    const sys=`You are a strategic planner. Bundle the user's ideas into a phased roadmap (Now = 0-30 days, Next = 30-90 days, Later = 90+ days). Reply with strict JSON: {"now":[{"title":"…","why":"…"}, …],"next":[…],"later":[…],"strategy":"1-2 sentence overall theme"}`;
    const text=String(await _ideaAICall(`${sys}\n\nIdeas:\n${lines}\n\nBuild the roadmap.`,true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const r=JSON.parse(text);
    const phase=(label,arr,color)=>`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:8px;border-left:3px solid ${color}"><div style="font-size:12px;font-weight:700;color:${color};margin-bottom:6px">${label}</div>${(arr||[]).map(it=>`<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--bd1)"><strong>${esc(it.title||'')}</strong><div style="font-size:11px;color:var(--t3);margin-top:2px">${esc(it.why||'')}</div></div>`).join('')||'<div style="font-size:11px;color:var(--t3)">(empty)</div>'}</div>`;
    document.getElementById('airm-results').innerHTML=`<div style="font-size:11px;color:var(--t2);margin-bottom:8px;padding:8px;background:var(--acs);border-radius:6px">🧭 ${esc(r.strategy||'')}</div>${phase('🟢 Now (0-30d)',r.now,'var(--ok)')}${phase('🟡 Next (30-90d)',r.next,'var(--warn)')}${phase('🔵 Later (90d+)',r.later,'var(--ac)')}`;
  }catch(e){document.getElementById('airm-results').innerHTML=`<div style="color:var(--red);font-size:11px">${esc(String(e.message||e).slice(0,200))}</div>`;}
}
// I5: Weekly digest (Mondays) — cached in D.prefs.aiIdeasWeeklyDigest
async function aiIdeasWeeklyDigest(force){
  const today=_ymd(new Date());
  const cache=D.prefs&&D.prefs.aiIdeasWeeklyDigest;
  if(!force&&cache&&cache.date===today&&cache.text){renderIdeasWeeklyDigest(cache.text);return;}
  toast({type:'info',title:'Generating weekly digest…',duration:1800});
  try{
    const top=D.ideas.filter(x=>x.stage!=='verdict').sort((a,b)=>ideaICE(b)-ideaICE(a)).slice(0,5);
    const stale=D.ideas.filter(x=>['develop','stress_test'].includes(x.stage)&&ideaDaysInStage(x)>=14);
    const parkedDue=D.ideas.filter(x=>x.verdict_outcome==='parked'&&x.parked_review_date&&x.parked_review_date<=today);
    const ctx=`Top by ICE:\n${top.map(i=>`- ${i.title} (ICE ${ideaICE(i)}, ${i.stage})`).join('\n')||'(none)'}\nStale (14d+):\n${stale.map(i=>`- ${i.title} (${ideaDaysInStage(i)}d in ${i.stage})`).join('\n')||'(none)'}\nParked review due:\n${parkedDue.map(i=>`- ${i.title}`).join('\n')||'(none)'}`;
    const sys=`You are a productivity coach reviewing someone's idea pipeline. Write a short Monday digest (2 paragraphs max + a bulleted "Suggested actions this week" list with 3 specific items referencing the actual idea names). Encouraging but direct.`;
    const text=String(await _ideaAICall(`${sys}\n\n${ctx}\n\nWrite the digest.`)||'').trim();
    D.prefs.aiIdeasWeeklyDigest={date:today,text};save('prefs');
    renderIdeasWeeklyDigest(text);
  }catch(e){toast({type:'error',title:'Digest failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
function renderIdeasWeeklyDigest(text){
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">📅 Weekly Idea Digest</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:14px;font-size:12px;line-height:1.7;white-space:pre-wrap;max-height:420px;overflow-y:auto">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="aiIdeasWeeklyDigest(true)">↻ Regenerate</button><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
  document.getElementById('modal-capture').classList.add('show');
}
// I6: Cluster active ideas by theme
async function aiClusterIdeas(){
  const active=D.ideas.filter(x=>['spark','develop','stress_test'].includes(x.stage));
  if(active.length<3)return toast('Need at least 3 active ideas to cluster');
  toast({type:'info',title:'Clustering…',duration:2000});
  try{
    const lines=active.map((i,idx)=>`${idx+1}. ${i.title} — ${(i.description||'').slice(0,100)}`).join('\n');
    const sys=`You are a synthesis assistant. Group a numbered list of ideas into 3-5 thematic clusters. For each cluster: name (2-4 words), one-line summary, and the indices of ideas in it. Reply with strict JSON: {"clusters":[{"name":"…","summary":"…","ids":[1,4,7]}, …]}`;
    const text=String(await _ideaAICall(`${sys}\n\nIdeas:\n${lines}\n\nCluster them.`,true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const c=JSON.parse(text);
    if(!Array.isArray(c.clusters))throw new Error('Bad response');
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🧩 Idea Clusters</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">${c.clusters.length} themes across ${active.length} active ideas</div><div style="max-height:480px;overflow-y:auto">${c.clusters.map(cl=>`<div class="cd" style="margin-bottom:8px;padding:10px"><div style="font-size:13px;font-weight:600;margin-bottom:3px">${esc(cl.name||'')}</div><div style="font-size:11px;color:var(--t2);margin-bottom:8px;line-height:1.45">${esc(cl.summary||'')}</div>${(cl.ids||[]).map(idx=>{const idea=active[idx-1];if(!idea)return '';return `<div class="lr" style="font-size:11px;cursor:pointer;padding:3px 0" onclick="closeModal();openIdeaDetail(${idea.id})"><span style="flex-shrink:0">${IDEA_TYPE_ICONS[idea.idea_type]||'💡'}</span><span class="rt">${esc(idea.title)}</span></div>`;}).join('')}</div>`).join('')}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="aiClusterIdeas()">↻ Re-cluster</button><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'Cluster failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
// I7: AI auto-tag all untagged active ideas
async function aiAutoTagAllIdeas(){
  const active=D.ideas.filter(x=>['spark','develop'].includes(x.stage)&&(!x.tags||!x.tags.length));
  if(!active.length)return toast('No untagged active ideas');
  toast({type:'info',title:`Tagging ${active.length} ideas…`,duration:2000});
  let tagged=0;
  for(const idea of active){
    try{
      const text=String(await _ideaAICall(`Suggest 2-4 single-word lowercase tags (no #) that describe this idea: "${idea.title}". Description: "${idea.description||''}". Reply with strict JSON only: {"tags":["tag1","tag2"]}`,true)||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
      const p=JSON.parse(text);
      if(Array.isArray(p.tags)&&p.tags.length){idea.tags=[...new Set(p.tags.slice(0,4).map(t=>String(t).toLowerCase().trim()).filter(Boolean))];tagged++;}
    }catch(_){}
  }
  if(tagged){save('ideas');renderIdeas();toast({type:'success',title:`🏷 Tagged ${tagged} idea${tagged===1?'':'s'}`,duration:2500});}
  else toast({type:'error',title:'No tags applied',duration:2500});
}
async function _ideaAICall(prompt,jsonMode){
  const {provider,configured}=_getAIConfig();
  const systemPrompt=jsonMode?'You are a helpful assistant. Respond with valid JSON only.':'You are a helpful assistant.';
  const res=await _trpc('ai.assist',{systemPrompt,userContent:prompt,provider},'mutation');
  return res?.result||res?.text||'';
}
function ideaAISparkle(id,stage,key,btn){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const qs=IDEA_QUESTION_TEMPLATES[idea.idea_type]||IDEA_QUESTION_TEMPLATES.general;
  const q=(qs[stage]||[]).find(x=>x.key===key);
  const ans=idea.answers.find(a=>a.stage===stage&&a.question_key===key);
  const mode=_ideaAIMode;
  const modeLabel=mode==='devil'?"devil's advocate":"champion";
  const prompt=`You are reviewing an idea titled "${idea.title}" (type: ${idea.idea_type}). The question is: "${q?.prompt}". The user answered: "${ans?.body||'(no answer yet)'}". As a ${modeLabel}, provide a concise 2-3 sentence response that ${mode==='devil'?'challenges assumptions, surfaces risks, and asks hard questions':'strengthens the idea, suggests better framings, and identifies supporting evidence'}. Be direct and specific.`;
  btn.textContent='…';
  btn.disabled=true;
  _ideaAICall(prompt).then(text=>{
    text=text||'No response.';
    btn.textContent='✨ AI';btn.disabled=false;
    // Show in a popover below the button
    const existing=btn.parentElement.querySelector('.ai-popover');
    if(existing)existing.remove();
    const pop=document.createElement('div');
    pop.className='ai-popover';
    pop.style.cssText='background:var(--s3);border:1px solid var(--bd2);border-radius:6px;padding:10px;font-size:11px;color:var(--t2);margin-top:6px;line-height:1.5';
    pop.innerHTML=`<div style="font-size:11px;font-weight:600;color:${mode==='devil'?'var(--red)':'var(--ok)'};margin-bottom:4px">${mode==='devil'?'😈 Devil\'s Advocate':'🏆 Champion'}</div>${esc(text)}<button class="btn btn-s" style="font-size:11px;margin-top:6px;display:block" onclick="this.parentElement.remove()">Dismiss</button>`;
    btn.parentElement.appendChild(pop);
  }).catch(()=>{btn.textContent='✨ AI';btn.disabled=false;toast('AI unavailable.');});
}

function ideaWhyStuck(id,stage){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const prompt=`An idea titled "${idea.title}" is in the ${stage} stage. The user is stuck. Provide 3 alternate framings of the core challenge in this stage that might help them think differently. Be concise and specific.`;
  toast('🤔 Generating alternate framings…');
  _ideaAICall(prompt).then(text=>{
    text=text||'No response.';
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:12px">🤔 Alternate Framings</h2><div style="font-size:12px;color:var(--t2);line-height:1.7;white-space:pre-wrap">${esc(text)}</div><button class="btn btn-s" style="margin-top:12px" onclick="closeModal()">Close</button>`;
    document.getElementById('modal-capture').classList.add('show');
  }).catch(()=>toast('AI unavailable.'));
}

function ideaSynthesisMode(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const answers=idea.answers.map(a=>`[${a.stage}/${a.question_key}]: ${a.body}`).join('\n');
  const prompt=`Here are all the answers a person wrote about their idea titled "${idea.title}":\n\n${answers}\n\nIf you were giving advice to a friend with this exact idea and these exact answers, what would you say? Be honest, specific, and actionable. 3-4 paragraphs.`;
  toast('✨ Synthesizing your thinking…');
  _ideaAICall(prompt).then(text=>{
    text=text||'No response.';
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:12px">✨ AI Synthesis</h2><div style="font-size:12px;color:var(--t2);line-height:1.7;white-space:pre-wrap">${esc(text)}</div><button class="btn btn-s" style="margin-top:12px" onclick="closeModal()">Close</button>`;
    document.getElementById('modal-capture').classList.add('show');
  }).catch(()=>toast('AI unavailable.'));
}

function runIdeaPremortem(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const answers=idea.answers.filter(a=>a.body.trim()).map(a=>`[${a.question_key}]: ${a.body}`).join('\n');
  const prompt=`You are a brutal but constructive devil's advocate. The user has an idea titled "${idea.title}" (type: ${idea.idea_type}).\n\nTheir thinking so far:\n${answers||'(no answers yet)'}\n\nRun a structured premortem: imagine it's 12 months from now and this idea has completely failed or been abandoned. Write:\n1. The most likely cause of death (1-2 sentences)\n2. Three specific failure modes they haven't addressed\n3. One hidden assumption that, if wrong, kills everything\n4. One concrete thing they should validate BEFORE committing more time\n\nBe specific, not generic. Name real risks.`;
  toast('🧨 Running premortem analysis…');
  _ideaAICall(prompt).then(text=>{
    text=text||'No response.';
    // Save premortem to idea
    idea.premortem=text;
    idea.premortem_at=new Date().toISOString();
    save('ideas');
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:4px">🧨 Premortem: ${esc(idea.title)}</h2>
    <div style="font-size:11px;color:var(--t3);margin-bottom:12px">If this fails in 12 months, here’s why:</div>
    <div style="font-size:12px;color:var(--t2);line-height:1.75;white-space:pre-wrap;background:var(--s2);border-radius:8px;padding:12px;border:1px solid var(--bd2)">${esc(text)}</div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-p" onclick="navigator.clipboard.writeText(${_jsArg(text)});toast('Copied!');" style="font-size:11px">📋 Copy</button>
      <button class="btn btn-s" onclick="closeModal()" style="font-size:11px">Close</button>
    </div>`;
    document.getElementById('modal-capture').classList.add('show');
  }).catch(()=>toast('AI unavailable.'));
}
function requestAIIceScore(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const prompt=`Score this idea on ICE (Impact, Confidence, Ease) each from 1-10. Idea: "${idea.title}". Type: ${idea.idea_type}. Description: "${idea.description}". Answers: ${idea.answers.map(a=>a.body).join(' | ')}. Respond in JSON: {"impact":N,"confidence":N,"ease":N,"rationale":"..."}`;
  toast('✨ Getting AI ICE score…');
  _ideaAICall(prompt,true).then(text=>{
    try{
      const j=JSON.parse(text||'{}');
      idea.ai_ice_impact=j.impact||5;idea.ai_ice_confidence=j.confidence||5;idea.ai_ice_ease=j.ease||5;idea.ai_ice_rationale=j.rationale||'';
      save('ideas');renderIdeaDetail(idea);toast('✨ AI ICE score ready!');
    }catch(e){toast('Could not parse AI response.');}
  }).catch(()=>toast('AI unavailable.'));
}
function useAIIceScore(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  idea.ice_impact=idea.ai_ice_impact||5;idea.ice_confidence=idea.ai_ice_confidence||5;idea.ice_ease=idea.ai_ice_ease||5;
  save('ideas');renderIdeaDetail(idea);toast('✓ AI ICE score applied.');
}

function exportIdeaMarkdown(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const ice=ideaICE(idea);
  const stageLabel=IDEA_STAGE_LABELS[idea.stage]||idea.stage;
  const typeLabel=IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type;
  const qs=IDEA_QUESTION_TEMPLATES[idea.idea_type]||IDEA_QUESTION_TEMPLATES.general;
  let md=`# ${idea.title}\n\n`;
  md+=`**Type:** ${typeLabel}  \n`;
  md+=`**Stage:** ${stageLabel}  \n`;
  md+=`**ICE Score:** ${ice} (Impact: ${idea.ice_impact||5} / Confidence: ${idea.ice_confidence||5} / Ease: ${idea.ice_ease||5})  \n`;
  md+=`**Created:** ${_pd(idea.createdAt).toLocaleDateString()}  \n`;
  if(idea.verdict_outcome)md+=`**Verdict:** ${idea.verdict_outcome}  \n`;
  md+=`\n---\n\n`;
  if(idea.description)md+=`## Description\n\n${idea.description}\n\n`;
  // Full description (rich text body)
  if(idea.bodyHtml){
    // Convert basic HTML to Markdown-friendly text
    const bodyMd=idea.bodyHtml
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi,'# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi,'## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi,'### $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi,'**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi,'**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi,'*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi,'*$1*')
      .replace(/<u[^>]*>(.*?)<\/u>/gi,'_$1_')
      .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi,'[$2]($1)')
      .replace(/<li[^>]*>(.*?)<\/li>/gi,'- $1\n')
      .replace(/<br\s*\/?>/gi,'\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi,'$1\n\n')
      .replace(/<div[^>]*>(.*?)<\/div>/gi,'$1\n')
      .replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
      .trim();
    if(bodyMd)md+=`## Full Description\n\n${bodyMd}\n\n`;
  }
  // Answers by stage
  ['spark','develop','stress_test'].forEach(s=>{
    const stageQs=qs[s]||[];
    const stageAnswers=idea.answers.filter(a=>a.stage===s&&a.body.trim());
    if(!stageAnswers.length)return;
    md+=`## ${IDEA_STAGE_LABELS[s]} Stage\n\n`;
    stageAnswers.forEach(a=>{
      const q=stageQs.find(x=>x.key===a.question_key);
      md+=`### ${q?q.prompt:a.question_key}\n\n${a.body}\n\n`;
    });
  });
  if(idea.premortem)md+=`## Premortem Analysis\n\n${idea.premortem}\n\n`;
  if(idea.verdict_reason)md+=`## Verdict Reason\n\n${idea.verdict_reason}\n\n`;
  // Activity log
  if((idea.activity||[]).length){
    md+=`## Activity Log\n\n`;
    idea.activity.forEach(a=>md+=`- **${_pd(a.at).toLocaleDateString()}** ${a.text}\n`);
  }
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(idea.title.replace(/[^a-z0-9]/gi,'_').toLowerCase()||'idea')+'.md';
  a.click();
  toast('✓ Exported as Markdown');
}
function exportIdeaPDF(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const ice=ideaICE(idea);
  const typeLabel=IDEA_TYPE_LABELS[idea.idea_type]||idea.idea_type;
  const stageLabel=IDEA_STAGE_LABELS[idea.stage]||idea.stage;
  const qs=IDEA_QUESTION_TEMPLATES[idea.idea_type]||IDEA_QUESTION_TEMPLATES.general;
  let answersHtml='';
  ['spark','develop','stress_test'].forEach(s=>{
    const stageQs=qs[s]||[];
    const stageAnswers=idea.answers.filter(a=>a.stage===s&&a.body.trim());
    if(!stageAnswers.length)return;
    answersHtml+=`<h3 style="font-size:13px;font-weight:700;margin:16px 0 8px;color:#4f46e5">${IDEA_STAGE_LABELS[s]} Stage</h3>`;
    stageAnswers.forEach(a=>{
      const q=stageQs.find(x=>x.key===a.question_key);
      answersHtml+=`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:600;margin-bottom:4px">${q?q.prompt:a.question_key}</div><div style="font-size:11px;color:#374151;line-height:1.6;padding:8px;background:#f9fafb;border-radius:4px">${a.body.replace(/\n/g,'<br>')}</div></div>`;
    });
  });
  const pmHtml=idea.premortem?`<h3 style="font-size:13px;font-weight:700;margin:16px 0 8px;color:#dc2626">Premortem Analysis</h3><div style="font-size:11px;color:#374151;line-height:1.6;padding:8px;background:#fef2f2;border-radius:4px">${idea.premortem.replace(/\n/g,'<br>')}</div>`:'';
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${idea.title}</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#111}@media print{body{padding:0}}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #4f46e5">
    <div><h1 style="font-size:22px;font-weight:800;margin:0 0 6px">${idea.title}</h1><div style="font-size:12px;color:#6b7280">${typeLabel} &bull; ${stageLabel} &bull; Created ${_pd(idea.createdAt).toLocaleDateString()}</div></div>
    <div style="text-align:center;background:#eef2ff;border-radius:8px;padding:8px 16px"><div style="font-size:24px;font-weight:800;color:#4f46e5">${ice}</div><div style="font-size:11px;color:#6b7280">ICE Score</div></div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:16px">
    <div style="flex:1;background:#f9fafb;border-radius:6px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:700;color:#4f46e5">${idea.ice_impact||5}</div><div style="font-size:11px;color:#6b7280">Impact</div></div>
    <div style="flex:1;background:#f9fafb;border-radius:6px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:700;color:#4f46e5">${idea.ice_confidence||5}</div><div style="font-size:11px;color:#6b7280">Confidence</div></div>
    <div style="flex:1;background:#f9fafb;border-radius:6px;padding:10px;text-align:center"><div style="font-size:18px;font-weight:700;color:#4f46e5">${idea.ice_ease||5}</div><div style="font-size:11px;color:#6b7280">Ease</div></div>
  </div>
  ${idea.description?`<div style="margin-bottom:16px"><h3 style="font-size:13px;font-weight:700;margin:0 0 6px">Description</h3><p style="font-size:11px;color:#374151;line-height:1.6">${idea.description}</p></div>`:''}
  ${idea.bodyHtml?`<div style="margin-bottom:16px"><h3 style="font-size:13px;font-weight:700;margin:0 0 6px">Full Description</h3><div style="font-size:11px;color:#374151;line-height:1.6;padding:10px;background:#f9fafb;border-radius:6px;border-left:3px solid #4f46e5">${idea.bodyHtml}</div></div>`:''}
  ${answersHtml}
  ${pmHtml}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">Generated by LevelUp Second Brain &bull; ${new Date().toLocaleDateString()}</div>
</body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
  toast('🖨 Opening print dialog…');
}
// ====== JOURNAL EXPORT ======
function _htmlToMd(html){
  if(!html)return '';
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi,'# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi,'## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi,'### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi,'**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi,'**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi,'*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi,'*$1*')
    .replace(/<u[^>]*>(.*?)<\/u>/gi,'_$1_')
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi,'[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi,'- $1\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi,'$1\n\n')
    .replace(/<div[^>]*>(.*?)<\/div>/gi,'$1\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
    .trim();
}

// ====== SINGLE ENTRY JOURNAL EXPORT ======
function _buildJournalEntryMD(j){
  let md=`## ${j.title||'Untitled Entry'}\n\n`;
  md+=`**Date:** ${j.date||''}  \n`;
  if(j.mood)md+=`**Mood:** ${j.mood}  \n`;
  if(j.energy)md+=`**Energy:** ${j.energy}  \n`;
  if(j.type)md+=`**Type:** ${j.type}  \n`;
  md+=`\n`;
  if(j.body)md+=`${j.body}\n\n`;
  if(j.diaryBody){const bodyMd=_htmlToMd(j.diaryBody);if(bodyMd)md+=`### Diary Entry\n\n${bodyMd}\n\n`;}
  if(j.gratitude&&j.gratitude.filter(Boolean).length)md+=`### Gratitude\n\n${j.gratitude.filter(Boolean).map(g=>`- ${g}`).join('\n')}\n\n`;
  if(j.wins&&j.wins.filter(Boolean).length)md+=`### Wins\n\n${j.wins.filter(Boolean).map(w=>`- ${w}`).join('\n')}\n\n`;
  if(j.improvements&&j.improvements.filter(Boolean).length)md+=`### Improvements\n\n${j.improvements.filter(Boolean).map(i=>`- ${i}`).join('\n')}\n\n`;
  return md;
}
function exportSingleJournalMD(id){
  const j=D.journal.find(x=>x.id===id);
  if(!j){toast('\u26a0 Entry not found');return;}
  const md=`# ${j.title||'Journal Entry'}\n\nExported ${new Date().toLocaleDateString()}\n\n---\n\n`+_buildJournalEntryMD(j);
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=((j.title||'journal-entry').replace(/[^a-z0-9]/gi,'_').toLowerCase())+'-'+j.date+'.md';
  a.click();
  toast('\u2713 Entry exported as Markdown');
}
function exportSingleJournalPDF(id){
  const j=D.journal.find(x=>x.id===id);
  if(!j){toast('\u26a0 Entry not found');return;}
  const moodBadge=j.mood?`<span style="font-size:22px;margin-left:8px">${j.mood}</span>`:'';
  const metaBadges=[
    j.energy?`<span style="background:#eef2ff;color:#4f46e5;border-radius:10px;padding:2px 10px;font-size:11px">${j.energy}</span>`:'',
    j.type?`<span style="background:#f0fdf4;color:#16a34a;border-radius:10px;padding:2px 10px;font-size:11px">${j.type}</span>`:'',
  ].filter(Boolean).join(' ');
  const bodyHtml=j.body?`<p style="font-size:12px;color:#374151;line-height:1.7;margin:10px 0">${j.body.replace(/\n/g,'<br>')}</p>`:'';
  const diaryHtml=j.diaryBody?`<div style="margin-top:12px;padding:12px;background:#f9fafb;border-left:3px solid #4f46e5;border-radius:0 6px 6px 0"><div style="font-size:11px;font-weight:700;color:#4f46e5;margin-bottom:8px">\ud83d\udcd3 Diary Entry</div><div style="font-size:12px;color:#374151;line-height:1.7">${j.diaryBody}</div></div>`:'';
  const gratHtml=(j.gratitude||[]).filter(Boolean).length?`<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px">\ud83d\ude4f Gratitude</div>${j.gratitude.filter(Boolean).map(g=>`<div style="font-size:12px;color:#374151;padding:3px 0">\u2022 ${g}</div>`).join('')}</div>`:'';
  const winsHtml=(j.wins||[]).filter(Boolean).length?`<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:6px">\ud83c\udf1f Wins</div>${j.wins.filter(Boolean).map(w=>`<div style="font-size:12px;color:#374151;padding:3px 0">\u2022 ${w}</div>`).join('')}</div>`:'';
  const improvHtml=(j.improvements||[]).filter(Boolean).length?`<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:6px">\ud83d\udd04 Improvements</div>${j.improvements.filter(Boolean).map(i=>`<div style="font-size:12px;color:#374151;padding:3px 0">\u2022 ${i}</div>`).join('')}</div>`:'';
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${j.title||'Journal Entry'}</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:36px;color:#111}@media print{body{padding:0}}</style></head><body>
  <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #4f46e5">
    <div style="display:flex;align-items:center;margin-bottom:6px">
      <h1 style="font-size:22px;font-weight:800;margin:0;flex:1">${j.title||'Journal Entry'}${moodBadge}</h1>
      <div style="font-size:12px;color:#6b7280">${j.date||''}</div>
    </div>
    ${metaBadges?`<div>${metaBadges}</div>`:''}
  </div>
  ${bodyHtml}${diaryHtml}${gratHtml}${winsHtml}${improvHtml}
  <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">Generated by LevelUp Second Brain \u2022 ${new Date().toLocaleDateString()}</div>
</body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
  toast('\ud83d\udda8 Opening print dialog\u2026');
}

// ====== JOURNAL EXPORT SCOPE PICKER ======
let _jrnlExportFormat='md';
function openJournalExportModal(fmt){
  _jrnlExportFormat=fmt||'md';
  const activeTab=document.querySelector('#jrnl-tabs .tab.on');
  const currentFilter=activeTab?activeTab.textContent.trim():'All';
  const totalCount=D.journal.length;
  const filteredCount=currentFilter==='All'?totalCount:D.journal.filter(j=>j.type===currentFilter).length;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">${fmt==='pdf'?'\ud83d\udda8':'\u2b07'} Export Journal as ${fmt==='pdf'?'PDF':'Markdown'}</h2>
  <p style="font-size:12px;color:var(--t2);margin-bottom:14px">Choose which entries to include in the export:</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
    <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--bd2);border-radius:7px;cursor:pointer" onclick="this.style.borderColor='var(--ac)';document.getElementById('jrnl-exp-filter').style.borderColor='var(--bd2)'">
      <input type="radio" name="jrnl-exp-scope" value="all" checked style="accent-color:var(--ac)">
      <div><div style="font-size:12px;font-weight:600">All entries</div><div style="font-size:11px;color:var(--t3)">${totalCount} entr${totalCount===1?'y':'ies'} total</div></div>
    </label>
    <label id="jrnl-exp-filter" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--bd2);border-radius:7px;cursor:pointer" onclick="this.style.borderColor='var(--ac)';this.previousElementSibling.style.borderColor='var(--bd2)'">
      <input type="radio" name="jrnl-exp-scope" value="filter" style="accent-color:var(--ac)">
      <div><div style="font-size:12px;font-weight:600">Current filter: <span style="color:var(--ac)">${currentFilter}</span></div><div style="font-size:11px;color:var(--t3)">${filteredCount} entr${filteredCount===1?'y':'ies'} matching</div></div>
    </label>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="doJournalExport('${currentFilter}')">Export</button>
    <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function doJournalExport(currentFilter){
  const scope=document.querySelector('input[name="jrnl-exp-scope"]:checked')?.value||'all';
  let entries=D.journal;
  if(scope==='filter'&&currentFilter!=='All'){
    entries=D.journal.filter(j=>j.type===currentFilter);
  }
  if(!entries.length){toast('\u26a0 No entries match the selected filter');closeModal();return;}
  closeModal();
  if(_jrnlExportFormat==='pdf'){
    _exportJournalPDFEntries(entries);
  } else {
    _exportJournalMDEntries(entries);
  }
}
function _exportJournalMDEntries(entries){
  const sorted=[...entries].sort((a,b)=>_pd(b.date)-_pd(a.date));
  let md=`# Journal Export\n\nExported ${new Date().toLocaleDateString()} \u2014 ${sorted.length} entr${sorted.length===1?'y':'ies'}\n\n---\n\n`;
  sorted.forEach(j=>md+=_buildJournalEntryMD(j)+'---\n\n');
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`journal-export-${_ymd(new Date())}.md`;
  a.click();
  toast('\u2713 Journal exported as Markdown ('+sorted.length+' entries)');
}
function _exportJournalPDFEntries(entries){
  const sorted=[...entries].sort((a,b)=>_pd(b.date)-_pd(a.date));
  let entriesHtml='';
  sorted.forEach((j,idx)=>{
    const moodBadge=j.mood?`<span style="font-size:18px;margin-left:8px">${j.mood}</span>`:'';
    const metaBadges=[j.energy?`<span style="background:#eef2ff;color:#4f46e5;border-radius:10px;padding:1px 8px;font-size:11px">${j.energy}</span>`:'',j.type?`<span style="background:#f0fdf4;color:#16a34a;border-radius:10px;padding:1px 8px;font-size:11px">${j.type}</span>`:''].filter(Boolean).join(' ');
    const bodyHtml=j.body?`<p style="font-size:11px;color:#374151;line-height:1.7;margin:8px 0">${j.body.replace(/\n/g,'<br>')}</p>`:'';
    const diaryHtml=j.diaryBody?`<div style="margin-top:10px;padding:10px;background:#f9fafb;border-left:3px solid #4f46e5;border-radius:0 6px 6px 0"><div style="font-size:11px;font-weight:700;color:#4f46e5;margin-bottom:6px">\ud83d\udcd3 Diary Entry</div><div style="font-size:11px;color:#374151;line-height:1.7">${j.diaryBody}</div></div>`:'';
    const gratHtml=(j.gratitude||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:4px">\ud83d\ude4f Gratitude</div>${j.gratitude.filter(Boolean).map(g=>`<div style="font-size:11px;color:#374151;padding:2px 0">\u2022 ${g}</div>`).join('')}</div>`:'';
    const winsHtml=(j.wins||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">\ud83c\udf1f Wins</div>${j.wins.filter(Boolean).map(w=>`<div style="font-size:11px;color:#374151;padding:2px 0">\u2022 ${w}</div>`).join('')}</div>`:'';
    const improvHtml=(j.improvements||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px">\ud83d\udd04 Improvements</div>${j.improvements.filter(Boolean).map(i=>`<div style="font-size:11px;color:#374151;padding:2px 0">\u2022 ${i}</div>`).join('')}</div>`:'';
    entriesHtml+=`<div style="page-break-inside:avoid;margin-bottom:24px;padding-bottom:20px;${idx<sorted.length-1?'border-bottom:1px solid #e5e7eb':''}">
      <div style="display:flex;align-items:center;margin-bottom:8px"><h2 style="font-size:15px;font-weight:700;margin:0;flex:1">${j.title||'Untitled Entry'}${moodBadge}</h2><div style="font-size:11px;color:#6b7280">${j.date||''}</div></div>
      ${metaBadges?`<div style="margin-bottom:8px">${metaBadges}</div>`:''}
      ${bodyHtml}${diaryHtml}${gratHtml}${winsHtml}${improvHtml}
    </div>`;
  });
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Journal Export</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#111}@media print{body{padding:0}}</style></head><body><div style="margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #4f46e5"><h1 style="font-size:24px;font-weight:800;margin:0 0 4px">\u270f\ufe0f Journal Export</h1><div style="font-size:12px;color:#6b7280">${sorted.length} entr${sorted.length===1?'y':'ies'} \u2022 Exported ${new Date().toLocaleDateString()}</div></div>${entriesHtml}<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">Generated by LevelUp Second Brain \u2022 ${new Date().toLocaleDateString()}</div></body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
  toast('\ud83d\udda8 Opening print dialog\u2026 ('+sorted.length+' entries)');
}

function exportJournalMD(){
  if(!D.journal||!D.journal.length){toast('⚠ No journal entries to export');return;}
  const sorted=[...D.journal].sort((a,b)=>_pd(b.date)-_pd(a.date));
  let md=`# Journal Export\n\nExported ${new Date().toLocaleDateString()} — ${sorted.length} entr${sorted.length===1?'y':'ies'}\n\n---\n\n`;
  sorted.forEach(j=>{
    md+=`## ${j.title||'Untitled Entry'}\n\n`;
    md+=`**Date:** ${j.date||''}  \n`;
    if(j.mood)md+=`**Mood:** ${j.mood}  \n`;
    if(j.energy)md+=`**Energy:** ${j.energy}  \n`;
    if(j.type)md+=`**Type:** ${j.type}  \n`;
    md+=`\n`;
    if(j.body)md+=`${j.body}\n\n`;
    if(j.diaryBody){
      const bodyMd=_htmlToMd(j.diaryBody);
      if(bodyMd)md+=`### Diary Entry\n\n${bodyMd}\n\n`;
    }
    if(j.gratitude&&j.gratitude.filter(Boolean).length){
      md+=`### Gratitude\n\n${j.gratitude.filter(Boolean).map(g=>`- ${g}`).join('\n')}\n\n`;
    }
    if(j.wins&&j.wins.filter(Boolean).length){
      md+=`### Wins\n\n${j.wins.filter(Boolean).map(w=>`- ${w}`).join('\n')}\n\n`;
    }
    if(j.improvements&&j.improvements.filter(Boolean).length){
      md+=`### Improvements\n\n${j.improvements.filter(Boolean).map(i=>`- ${i}`).join('\n')}\n\n`;
    }
    md+=`---\n\n`;
  });
  const blob=new Blob([md],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`journal-export-${_ymd(new Date())}.md`;
  a.click();
  toast('✓ Journal exported as Markdown ('+sorted.length+' entries)');
}

function exportJournalPDF(){
  if(!D.journal||!D.journal.length){toast('⚠ No journal entries to export');return;}
  const sorted=[...D.journal].sort((a,b)=>_pd(b.date)-_pd(a.date));
  let entriesHtml='';
  sorted.forEach((j,idx)=>{
    const moodBadge=j.mood?`<span style="font-size:18px;margin-left:8px">${j.mood}</span>`:'';
    const metaBadges=[
      j.energy?`<span style="background:#eef2ff;color:#4f46e5;border-radius:10px;padding:1px 8px;font-size:11px">${j.energy}</span>`:'',
      j.type?`<span style="background:#f0fdf4;color:#16a34a;border-radius:10px;padding:1px 8px;font-size:11px">${j.type}</span>`:'',
    ].filter(Boolean).join(' ');
    const bodyHtml=j.body?`<p style="font-size:11px;color:#374151;line-height:1.7;margin:8px 0">${j.body.replace(/\n/g,'<br>')}</p>`:'';
    const diaryHtml=j.diaryBody?`<div style="margin-top:10px;padding:10px;background:#f9fafb;border-left:3px solid #4f46e5;border-radius:0 6px 6px 0"><div style="font-size:11px;font-weight:700;color:#4f46e5;margin-bottom:6px">📓 Diary Entry</div><div style="font-size:11px;color:#374151;line-height:1.7">${j.diaryBody}</div></div>`:'';
    const gratHtml=(j.gratitude||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:4px">🙏 Gratitude</div>${j.gratitude.filter(Boolean).map(g=>`<div style="font-size:11px;color:#374151;padding:2px 0">• ${g}</div>`).join('')}</div>`:'';
    const winsHtml=(j.wins||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">🌟 Wins</div>${j.wins.filter(Boolean).map(w=>`<div style="font-size:11px;color:#374151;padding:2px 0">• ${w}</div>`).join('')}</div>`:'';
    const improvHtml=(j.improvements||[]).filter(Boolean).length?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px">🔄 Improvements</div>${j.improvements.filter(Boolean).map(i=>`<div style="font-size:11px;color:#374151;padding:2px 0">• ${i}</div>`).join('')}</div>`:'';
    entriesHtml+=`<div style="page-break-inside:avoid;margin-bottom:24px;padding-bottom:20px;${idx<sorted.length-1?'border-bottom:1px solid #e5e7eb':''}">
      <div style="display:flex;align-items:center;margin-bottom:8px">
        <h2 style="font-size:15px;font-weight:700;margin:0;flex:1">${j.title||'Untitled Entry'}${moodBadge}</h2>
        <div style="font-size:11px;color:#6b7280">${j.date||''}</div>
      </div>
      ${metaBadges?`<div style="margin-bottom:8px">${metaBadges}</div>`:''}
      ${bodyHtml}${diaryHtml}${gratHtml}${winsHtml}${improvHtml}
    </div>`;
  });
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Journal Export</title><style>body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:32px;color:#111}@media print{body{padding:0}}</style></head><body>
  <div style="margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #4f46e5">
    <h1 style="font-size:24px;font-weight:800;margin:0 0 4px">✏️ Journal Export</h1>
    <div style="font-size:12px;color:#6b7280">${sorted.length} entr${sorted.length===1?'y':'ies'} &bull; Exported ${new Date().toLocaleDateString()}</div>
  </div>
  ${entriesHtml}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">Generated by LevelUp Second Brain &bull; ${new Date().toLocaleDateString()}</div>
</body></html>`;
  const w=window.open('','_blank');
  if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),400);}
  toast('🖨 Opening print dialog… ('+sorted.length+' entries)');
}

function openVerdictModal(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:12px">⚖ Verdict: ${esc(idea.title)}</h2>
  <div style="margin-bottom:12px">
    <label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Outcome *</label>
    <div style="display:flex;gap:8px;margin-top:6px">
      <label style="flex:1;cursor:pointer"><input type="radio" name="verdict" value="killed" onchange="showVerdictFields('killed')" style="margin-right:4px"><span style="font-size:12px;color:var(--red)">🪦 Kill</span></label>
      <label style="flex:1;cursor:pointer"><input type="radio" name="verdict" value="parked" onchange="showVerdictFields('parked')" style="margin-right:4px"><span style="font-size:12px;color:#8B5CF6">🅿 Park</span></label>
      <label style="flex:1;cursor:pointer"><input type="radio" name="verdict" value="promoted" onchange="showVerdictFields('promoted')" style="margin-right:4px"><span style="font-size:12px;color:var(--ok)">🚀 Promote</span></label>
    </div>
  </div>
  <div id="verdict-fields"></div>
  <div style="display:flex;gap:8px;margin-top:16px">
    <button class="btn btn-p" onclick="confirmVerdict(${id})">Confirm Verdict</button>
    <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function showVerdictFields(outcome){
  const el=document.getElementById('verdict-fields');
  if(!el)return;
  if(outcome==='killed'){
    el.innerHTML=`<div><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Kill reason *</label><textarea id="vf-kill" class="inp" style="width:100%;height:80px;margin-top:4px;font-size:12px" placeholder="Why are you killing this idea?"></textarea></div>`;
  } else if(outcome==='parked'){
    el.innerHTML=`<div><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Review date *</label><input id="vf-date" type="date" class="inp" style="width:100%;margin-top:4px" value="${_ymd(new Date(Date.now()+30*24*60*60*1000))}"></div>`;
  } else if(outcome==='promoted'){
    el.innerHTML=`<div><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">New project name</label><input id="vf-proj" class="inp" style="width:100%;margin-top:4px" placeholder="Project name (leave blank to skip)"></div>`;
  }
}
function confirmVerdict(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const outcome=document.querySelector('input[name="verdict"]:checked')?.value;
  if(!outcome){toast('Please select an outcome.');return;}
  if(outcome==='killed'){
    const reason=document.getElementById('vf-kill')?.value.trim();
    if(!reason){toast('Please provide a kill reason.');return;}
    idea.kill_reason=reason;
  } else if(outcome==='parked'){
    const date=document.getElementById('vf-date')?.value;
    if(!date){toast('Please set a review date.');return;}
    idea.parked_review_date=date;
  } else if(outcome==='promoted'){
    const projName=document.getElementById('vf-proj')?.value.trim();
    if(projName){
      const proj={id:nextId(D.projects),name:projName,color:'#3B82F6',status:'Active',due:'TBD',pct:0,desc:`Promoted from idea: ${idea.title}\n\n${idea.answers.map(a=>`**${a.stage}/${a.question_key}:** ${a.body}`).join('\n\n')}`};
      D.projects.push(proj);
      idea.promoted_project_id=proj.id;
      save('projects');
    }
    if(idea.goal_id){/* goal link preserved */}
  }
  idea.stage='verdict';
  idea.verdict_outcome=outcome;
  idea.verdict_at=new Date().toISOString();
  idea.updatedAt=new Date().toISOString();
  // Auto-create Decision Log entry
  if(!D.decisions)D.decisions=[];
  D.decisions.push({id:Date.now(),idea_id:id,outcome,date:_ymd(new Date()),title:`Idea ${outcome}: ${idea.title}`,context:idea.answers.map(a=>`**${a.stage}/${a.question_key}:** ${a.body}`).join('\n\n'),kill_reason:idea.kill_reason||null,promoted_project_id:idea.promoted_project_id||null});
  save('ideas');
  closeModal();
  renderIdeas();
  const icons={killed:'🪦',parked:'🅿',promoted:'🚀'};
  toast(`${icons[outcome]} Idea ${outcome}!${outcome==='promoted'&&idea.promoted_project_id?' New project created.':''}`);
}

function openIdeaInvite(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:12px">👥 Invite Collaborator</h2>
  <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Email *</label><input id="inv-email" class="inp" style="width:100%;margin-top:4px" type="email" placeholder="collaborator@example.com"></div>
  <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Role</label><select id="inv-role" class="inp" style="width:100%;margin-top:4px"><option value="reviewer">Reviewer (read + comment + vote)</option><option value="collaborator">Collaborator (read + comment + edit Develop)</option><option value="observer">Observer (read only)</option></select></div>
  <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Expires after (days)</label><input id="inv-expires" class="inp" style="width:100%;margin-top:4px" type="number" value="30" min="1" max="365"></div>
  <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px">Personal message (optional)</label><textarea id="inv-msg" class="inp" style="width:100%;height:60px;margin-top:4px;font-size:12px" placeholder="Hi! I'd love your input on this idea…"></textarea></div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="sendIdeaInvite(${id})">Send Invite</button>
    <button class="btn btn-s" onclick="closeModal()">Cancel</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}
function sendIdeaInvite(id){
  const email=document.getElementById('inv-email')?.value.trim();
  const role=document.getElementById('inv-role')?.value||'reviewer';
  const expires=parseInt(document.getElementById('inv-expires')?.value)||30;
  if(!email||!email.includes('@')){toast('Please enter a valid email.');return;}
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  if(!idea.collaborators)idea.collaborators=[];
  const token=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
  idea.collaborators.push({email,role,invited_at:new Date().toISOString(),accepted_at:null,revoked_at:null,expires_at:new Date(Date.now()+expires*24*60*60*1000).toISOString(),magic_link_token:token});
  save('ideas');
  closeModal();
  renderIdeaDetail(idea);
  toast(`✓ Invite sent to ${email} (${role}). Magic link: #idea-${id}-${token}`);
}
function revokeIdeaCollaborator(id,email){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  const c=idea.collaborators.find(x=>x.email===email);
  if(c)c.revoked_at=new Date().toISOString();
  idea.collaborators=idea.collaborators.filter(x=>x.email!==email);
  save('ideas');
  renderIdeaDetail(idea);
  toast(`✓ Access revoked for ${email}`);
}
function openIdeaShare(id){
  const idea=D.ideas.find(x=>x.id===id);
  if(!idea)return;
  // Generate a public read-only token if one doesn't exist
  if(!idea.public_token){
    idea.public_token=Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
    save('ideas');
  }
  const baseUrl=window.location.origin+window.location.pathname;
  const publicUrl=`${baseUrl}?idea=${idea.id}&token=${idea.public_token}`;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:12px">🔗 Share Idea</h2>
  <div style="background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:12px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Public Read-Only Link</div>
    <div style="font-size:11px;color:var(--t1);word-break:break-all;background:var(--s3);border-radius:4px;padding:8px;margin-bottom:8px;font-family:monospace">${publicUrl}</div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-p" style="font-size:11px" onclick="navigator.clipboard.writeText('${publicUrl}').then(()=>toast('✓ Link copied to clipboard!'))">📋 Copy Link</button>
      <button class="btn btn-s" style="font-size:11px" onclick="window.open('${publicUrl}','_blank')">👁 Preview</button>
      <button class="btn btn-s" style="font-size:11px;color:var(--red)" onclick="D.ideas.find(x=>x.id===${id}).public_token=null;save('ideas');closeModal();toast('Link revoked.')">🚫 Revoke</button>
    </div>
  </div>
  <div style="font-size:11px;font-weight:600;margin-bottom:8px">Or invite a specific collaborator:</div>
  <div style="margin-bottom:8px"><input id="inv-email" class="inp" style="width:100%" type="email" placeholder="collaborator@example.com"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
    <select id="inv-role" class="inp"><option value="reviewer">Reviewer (read + vote)</option><option value="collaborator">Collaborator (edit)</option><option value="observer">Observer (read only)</option></select>
    <input id="inv-expires" class="inp" type="number" value="30" min="1" max="365" placeholder="Expires (days)">
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn btn-p" onclick="sendIdeaInvite(${id})">Send Invite</button>
    <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
  // Handle shared idea view if URL has token
  const urlParams=new URLSearchParams(window.location.search);
  if(urlParams.get('idea')&&urlParams.get('token')){
    const sharedIdea=D.ideas.find(x=>x.id===parseInt(urlParams.get('idea'))&&x.public_token===urlParams.get('token'));
    if(sharedIdea){nav('ideas');openIdeaDetail(sharedIdea.id);}
  }
}

// ====== HABITS AI ======
function aiHabitCoach(){
  if(!D.habits.length){toast('Add some habits first');return;}
  toast('✨ Analyzing your habits...');
  const tips=[];
  D.habits.forEach(h=>{
    const streak=h.streak||0;
    const completedDates=h.completedDates||[];
    const total=completedDates.length;
    const recentDays=7;
    const recentDates=Array.from({length:recentDays},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return _ymd(d);});
    const recentCount=completedDates.filter(d=>recentDates.includes(d)).length;
    const consistency=recentDays>0?Math.round(recentCount/recentDays*100):0;
    if(streak===0&&total>0)tips.push({h,type:'warning',msg:`"${h.name}" streak broken — restart today to rebuild momentum`});
    else if(streak>=7)tips.push({h,type:'celebrate',msg:`"${h.name}" is on a ${streak}-day streak! Consider increasing difficulty or frequency`});
    else if(consistency<30)tips.push({h,type:'warning',msg:`"${h.name}" only ${consistency}% consistent this week — try habit stacking with an existing routine`});
    else if(consistency>=80)tips.push({h,type:'good',msg:`"${h.name}" is ${consistency}% consistent — great work! Try adding a related habit`});
    else tips.push({h,type:'neutral',msg:`"${h.name}" at ${consistency}% consistency — aim for 3 more completions this week`});
  });
  const colors={warning:'var(--warn)',celebrate:'var(--grn)',good:'var(--ac)',neutral:'var(--t3)'};
  const icons={warning:'⚠️',celebrate:'🎉',good:'✅',neutral:'💡'};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✨ AI Habit Coach</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Personalized insights for your ${D.habits.length} habit${D.habits.length!==1?'s':''}:</div>
  <div style="max-height:320px;overflow-y:auto">${tips.map(({h,type,msg})=>`<div style="padding:8px 10px;margin-bottom:6px;border-radius:6px;background:var(--s2);border-left:3px solid ${colors[type]};font-size:12px">
    <div style="display:flex;gap:6px;align-items:flex-start"><span>${icons[type]}</span><div><strong>${esc(h.name)}</strong><br><span style="color:var(--t2)">${esc(msg)}</span></div></div>
  </div>`).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Got it</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiHabitCorrelation(){
  if(!D.habits.length||!D.journal.length){toast('Need both habits and journal entries for correlation');return;}
  toast('📈 Analyzing mood-habit correlation...');
  const moodMap={'😄':5,'😊':4,'😐':3,'😔':2,'😢':1,'😤':2,'😴':2,'🤩':5,'😌':4};
  const journalWithMood=D.journal.filter(j=>j.mood&&moodMap[j.mood]);
  if(journalWithMood.length<3){toast('Need at least 3 journal entries with mood to correlate');return;}
  const correlations=D.habits.map(h=>{
    const completedDates=h.completedDates||[];
    let sumDone=0,countDone=0,sumNotDone=0,countNotDone=0;
    journalWithMood.forEach(j=>{
      const score=moodMap[j.mood];
      if(completedDates.includes(j.date)){sumDone+=score;countDone++;}
      else{sumNotDone+=score;countNotDone++;}
    });
    const avgDone=countDone?sumDone/countDone:null;
    const avgNotDone=countNotDone?sumNotDone/countNotDone:null;
    const diff=avgDone!==null&&avgNotDone!==null?avgDone-avgNotDone:0;
    return{h,avgDone,avgNotDone,diff,countDone};
  }).filter(x=>x.countDone>0).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
  if(!correlations.length){toast('Not enough data for correlation yet');return;}
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📈 Mood-Habit Correlation</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Based on ${journalWithMood.length} journal entries with mood data:</div>
  <div style="max-height:300px;overflow-y:auto">${correlations.map(({h,avgDone,avgNotDone,diff,countDone})=>{
    const positive=diff>0;
    const neutral=Math.abs(diff)<0.3;
    const color=neutral?'var(--t3)':positive?'var(--grn)':'var(--red)';
    const icon=neutral?'↔️':positive?'⬆️':'⬇️';
    return`<div style="padding:8px 10px;margin-bottom:6px;border-radius:6px;background:var(--s2);font-size:12px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong>${esc(h.name)}</strong>
        <span style="color:${color};font-weight:600">${icon} ${neutral?'No effect':positive?'+'+diff.toFixed(1)+' mood':''+diff.toFixed(1)+' mood'}</span>
      </div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">Done days: avg mood ${avgDone?.toFixed(1)||'N/A'} · Skipped days: avg mood ${avgNotDone?.toFixed(1)||'N/A'} · ${countDone} data points</div>
    </div>`;
  }).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Got it</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiWellbeingReport(){
  toast('📊 Generating wellbeing report...');
  const today=new Date();
  const weekAgo=_pd(today);weekAgo.setDate(today.getDate()-7);
  const weekDates=Array.from({length:7},(_,i)=>{const d=_pd(weekAgo);d.setDate(weekAgo.getDate()+i+1);return _ymd(d);});
  // Habits this week
  const habitScore=D.habits.length?Math.round(D.habits.reduce((sum,h)=>{
    const done=(h.completedDates||[]).filter(d=>weekDates.includes(d)).length;
    const target=h.frequency==='Daily'?7:h.frequency==='3x/week'?3:h.frequency==='Weekly'?1:7;
    return sum+(done/target);
  },0)/D.habits.length*100):0;
  // Journal mood this week
  const moodMap={'😄':5,'😊':4,'😐':3,'😔':2,'😢':1,'😤':2,'😴':2,'🤩':5,'😌':4};
  const weekJournal=D.journal.filter(j=>weekDates.includes(j.date));
  const moodScores=weekJournal.filter(j=>moodMap[j.mood]).map(j=>moodMap[j.mood]);
  const avgMood=moodScores.length?moodScores.reduce((a,b)=>a+b,0)/moodScores.length:null;
  // Tasks completed this week
  const weekTasksDone=D.tasks.filter(t=>t.status==='Done'&&t.completedAt&&weekDates.some(d=>t.completedAt.startsWith(d))).length;
  // Overall score
  const moodPct=avgMood?Math.round((avgMood/5)*100):50;
  const overallScore=Math.round((habitScore+moodPct)/2);
  const grade=overallScore>=80?'Excellent':overallScore>=60?'Good':overallScore>=40?'Fair':'Needs Attention';
  const gradeColor=overallScore>=80?'var(--grn)':overallScore>=60?'var(--ac)':overallScore>=40?'var(--warn)':'var(--red)';
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📊 Weekly Wellbeing Report</h2>
  <div style="font-size:11px;color:var(--t3);margin-bottom:12px">${weekDates[0]} to ${weekDates[6]}</div>
  <div style="text-align:center;padding:12px;background:var(--s2);border-radius:8px;margin-bottom:12px">
    <div style="font-size:36px;font-weight:700;color:${gradeColor}">${overallScore}</div>
    <div style="font-size:12px;font-weight:600;color:${gradeColor}">${grade}</div>
    <div style="font-size:11px;color:var(--t3);margin-top:2px">Overall Wellbeing Score</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--ac)">${habitScore}%</div>
      <div style="font-size:11px;color:var(--t3)">Habit Score</div>
    </div>
    <div style="text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--purp)">${avgMood?avgMood.toFixed(1)+'/5':'N/A'}</div>
      <div style="font-size:11px;color:var(--t3)">Avg Mood</div>
    </div>
    <div style="text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--grn)">${weekTasksDone}</div>
      <div style="font-size:11px;color:var(--t3)">Tasks Done</div>
    </div>
  </div>
  <div style="font-size:11px;color:var(--t2);padding:8px 10px;background:var(--s2);border-radius:6px">
    ${overallScore>=80?'🎉 Outstanding week! You\'re hitting your habits and maintaining a positive outlook.':overallScore>=60?'👍 Good week overall. Keep building on your habits and reflect on what\'s working.':overallScore>=40?'💡 Mixed week. Focus on your top 1-2 habits and try journaling daily to track your mood.':'⚠️ Tough week. Be kind to yourself — pick one small habit to restart and write about how you\'re feeling.'}
  </div>
  <button class="btn btn-p" style="margin-top:12px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

// ====== JOURNAL AI ======
function aiJournalSentiment(){
  if(D.journal.length<3){toast('Need at least 3 journal entries for sentiment analysis');return;}
  toast('📈 Analyzing sentiment trends...');
  const moodMap={'😄':5,'😊':4,'😐':3,'😔':2,'😢':1,'😤':2,'😴':2,'🤩':5,'😌':4};
  const positiveWords=['happy','great','amazing','excited','grateful','proud','accomplished','wonderful','fantastic','love','joy','success','win','achieve','progress','motivated','inspired','energized','confident','optimistic'];
  const negativeWords=['stressed','anxious','tired','exhausted','frustrated','overwhelmed','sad','worried','difficult','hard','struggle','fail','stuck','lost','confused','angry','upset','disappointed','behind','behind'];
  const entries=D.journal.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
  const scored=entries.map(j=>{
    const text=(j.body||'').toLowerCase();
    const posCount=positiveWords.filter(w=>text.includes(w)).length;
    const negCount=negativeWords.filter(w=>text.includes(w)).length;
    const moodScore=moodMap[j.mood]||3;
    const textScore=3+(posCount-negCount)*0.3;
    const combined=Math.min(5,Math.max(1,(moodScore+textScore)/2));
    return{date:j.date,score:combined,mood:j.mood,title:j.title};
  });
  const avg=scored.reduce((s,x)=>s+x.score,0)/scored.length;
  const trend=scored.length>1?scored[scored.length-1].score-scored[0].score:0;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">📈 Sentiment Trend</h2>
  <div style="display:flex;gap:12px;margin-bottom:12px">
    <div style="flex:1;text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:var(--ac)">${avg.toFixed(1)}/5</div>
      <div style="font-size:11px;color:var(--t3)">Avg Sentiment</div>
    </div>
    <div style="flex:1;text-align:center;padding:8px;background:var(--s2);border-radius:6px">
      <div style="font-size:20px;font-weight:700;color:${trend>0?'var(--grn)':trend<0?'var(--red)':'var(--t3)'}">${trend>0?'⬆':trend<0?'⬇':'↔'} ${Math.abs(trend).toFixed(1)}</div>
      <div style="font-size:11px;color:var(--t3)">Trend (last 14 days)</div>
    </div>
  </div>
  <div style="max-height:220px;overflow-y:auto">${scored.map(s=>{
    const bar=Math.round(s.score/5*80);
    const color=s.score>=4?'var(--grn)':s.score>=3?'var(--ac)':s.score>=2?'var(--warn)':'var(--red)';
    return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div style="font-size:11px;color:var(--t3);width:70px;flex-shrink:0">${s.date.slice(5)}</div>
      <div style="flex:1;background:var(--s3);border-radius:3px;height:12px;overflow:hidden"><div style="width:${bar}%;height:100%;background:${color};border-radius:3px"></div></div>
      <div style="font-size:12px;width:20px">${s.mood||''}</div>
    </div>`;
  }).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiJournalThemes(){
  if(D.journal.length<2){toast('Need at least 2 journal entries for theme detection');return;}
  toast('🔍 Detecting themes...');
  const allText=D.journal.map(j=>(j.title+' '+(j.body||'')).toLowerCase()).join(' ');
  const themePatterns=[
    {name:'Work & Career',words:['work','project','meeting','deadline','client','team','boss','job','career','office','task','goal','productivity']},
    {name:'Health & Fitness',words:['exercise','gym','run','sleep','tired','energy','health','diet','food','water','workout','body','weight']},
    {name:'Relationships',words:['friend','family','partner','love','relationship','social','people','talk','conversation','together','support']},
    {name:'Learning & Growth',words:['learn','read','book','course','skill','improve','study','knowledge','understand','practice','develop']},
    {name:'Finance & Money',words:['money','budget','spend','save','invest','cost','price','financial','income','expense','salary']},
    {name:'Stress & Anxiety',words:['stress','anxious','worry','overwhelm','pressure','nervous','fear','doubt','uncertain','difficult']},
    {name:'Gratitude & Joy',words:['grateful','thankful','happy','joy','appreciate','blessed','wonderful','amazing','love','enjoy','celebrate']},
    {name:'Planning & Goals',words:['plan','goal','future','next','week','month','year','strategy','focus','priority','achieve','accomplish']},
  ];
  const scored=themePatterns.map(theme=>{
    const count=theme.words.reduce((sum,w)=>{
      const re=new RegExp('\\b'+w,'g');
      return sum+(allText.match(re)||[]).length;
    },0);
    return{...theme,count};
  }).filter(t=>t.count>0).sort((a,b)=>b.count-a.count);
  if(!scored.length){toast('No clear themes detected');return;}
  const maxCount=scored[0].count;
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">🔍 Recurring Themes</h2>
  <div style="font-size:11px;color:var(--t2);margin-bottom:10px">Across ${D.journal.length} journal entries:</div>
  <div style="max-height:300px;overflow-y:auto">${scored.map((t,i)=>{
    const pct=Math.round(t.count/maxCount*100);
    const colors=['var(--ac)','var(--purp)','var(--grn)','var(--warn)','var(--red)'];
    const color=colors[i%colors.length];
    return`<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:12px;font-weight:500">${t.name}</span>
        <span style="font-size:11px;color:var(--t3)">${t.count} mentions</span>
      </div>
      <div style="background:var(--s3);border-radius:3px;height:8px"><div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div></div>
    </div>`;
  }).join('')}</div>
  <button class="btn btn-p" style="margin-top:10px" onclick="closeModal()">Close</button>`;
  document.getElementById('modal-capture').classList.add('show');
}

function aiJournalPrompt(){
  const prompts=[
    'What is one thing you accomplished today that you are proud of, and what made it possible?',
    'Describe a challenge you are currently facing. What is one small step you could take tomorrow to move forward?',
    'Who has positively impacted your life recently? How could you express gratitude to them?',
    'What is draining your energy right now? What would it feel like to let it go?',
    'If your future self looked back on this week, what advice would they give you?',
    'What is one habit or behaviour you want to change? What triggers it, and what could replace it?',
    'Describe your ideal day one year from now. What needs to happen for that to be your reality?',
    'What are you avoiding that you know you should address? What is the first step?',
    'What are three things you are grateful for today, and why do they matter?',
    'What did you learn this week — about yourself, others, or your work?',
    'Where are you spending your time vs. where you want to be spending it?',
    'What would you do if you knew you could not fail?',
  ];
  const prompt=prompts[Math.floor(Math.random()*prompts.length)];
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:15px;font-weight:600;margin-bottom:8px">✏ Guided Journal Prompt</h2>
  <div style="background:var(--acs);border:1px solid var(--ac);border-radius:8px;padding:14px;margin-bottom:14px;font-size:13px;line-height:1.6;font-style:italic">“${esc(prompt)}”</div>
  <div style="display:flex;gap:8px">
  <button class="btn btn-p" onclick="closeModal();openFA('journal');setTimeout(()=>{const el=document.querySelector('#capture-modal .inp[placeholder*=\'Title\']');if(el)el.value='Reflection';},200)">Write Now</button>
  <button class="btn btn-s" onclick="(function(){const prompts=${_jsArg(prompts)};const p=prompts[Math.floor(Math.random()*prompts.length)];document.querySelector('#modal-content blockquote,#modal-content div[style*=italic]').textContent=p;})()">New Prompt</button>
  <button class="btn btn-s" onclick="closeModal()">Close</button>
  </div>`;
  document.getElementById('modal-capture').classList.add('show');
}

// Reassign every habit's createdBy to the logged-in user. Run once per
// device (guarded by a localStorage flag) so single-user installs don't
// have habits hidden behind seed-data names like 'Priya Nair'. Returns
// true if any rows changed (which is a signal to save+resync).
function reassignHabitsToOwner(){
  if(localStorage.getItem('lu_habits_owner_migrated_v1')==='1')return false;
  const me=(D.creds&&D.creds.userName)||'';
  if(!me||!Array.isArray(D.habits)||!D.habits.length){
    // Set the flag anyway so we don't keep retrying when there's nothing
    // to migrate yet. The next branch (loadServerData) re-runs without
    // the flag check by clearing it when habits actually arrive.
    localStorage.setItem('lu_habits_owner_migrated_v1','1');
    return false;
  }
  let changed=false;
  D.habits.forEach(h=>{
    if(h.createdBy!==me){h.createdBy=me;changed=true;}
  });
  if(changed)save('habits');
  localStorage.setItem('lu_habits_owner_migrated_v1','1');
  return changed;
}

// One-time: notes "favorited" via the New Note ⭐ checkbox were saved with
// `favorite:true` but `starred:false`, so they never appeared in the Favorites
// view (which filters on `starred`). Converge onto `starred` as the single
// source of truth. Guarded by a localStorage flag so a later un-star (which
// only clears `starred`) is never undone by a lingering `favorite:true`.
function _backfillNoteStarredFromFavorite(){
  if(localStorage.getItem('lu_note_fav_starred_v1')==='1')return false;
  if(!Array.isArray(D.notes)||!D.notes.length)return false; // wait for notes to load
  let changed=false;
  D.notes.forEach(n=>{ if(n&&n.favorite&&!n.starred){n.starred=true;changed=true;} });
  if(changed)save('notes');
  localStorage.setItem('lu_note_fav_starred_v1','1');
  return changed;
}

function renderHabits(){
  const me=D.creds.userName||'Idris Grant';
  const visibleHabits=_habitsMyOnly?D.habits.filter(h=>!h.createdBy||h.createdBy===me):D.habits;
  // "Done today" is measured against habits scheduled daily — non-daily
  // habits (weekly, 3x/week) aren't part of today's ratio. Matches Home,
  // Coach and Reports, which all count cadence==='Daily'.
  const todayHabits=visibleHabits.filter(h=>h.cadence==='Daily');
  const done=todayHabits.filter(h=>h.doneToday).length;
  const total=todayHabits.length;
  const pct=total?Math.round(done/total*100):0;
  $('habits-main').innerHTML=`<div class="ph-r" style="margin-bottom:12px"><div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('checkCircle',22,'var(--page-accent)')}Habits</h1><p style="font-size:12px;color:var(--t2)">${done} of ${total} done today</p></div><div style="display:flex;gap:6px;align-items:center"><div style="display:flex;background:var(--s2);border:1px solid var(--bd2);border-radius:6px;overflow:hidden"><button id="habits-scope-my" title="Show only habits you created (or that have no creator on record)" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${_habitsMyOnly?'var(--ac)':'transparent'};color:${_habitsMyOnly?'#fff':'var(--t2)'};border:none" onclick="_habitsMyOnly=true;renderHabits()">My Habits</button><button id="habits-scope-all" title="Show every team member's habits, including yours" class="btn" style="border-radius:0;height:28px;font-size:11px;background:${!_habitsMyOnly?'var(--ac)':'transparent'};color:${!_habitsMyOnly?'#fff':'var(--t2)'};border:none" onclick="_habitsMyOnly=false;renderHabits()">All Habits</button></div><div style="position:relative;display:inline-block"><button class="btn btn-s" style="height:28px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('habits-ai-menu')" title="AI tools">✨ AI ▾</button><div id="habits-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:32px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.35)"><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('habits-ai-menu');aiHabitCoach()">✨ Habit Coach</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('habits-ai-menu');aiHabitCorrelation()">📈 Mood Correlation</button><button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('habits-ai-menu');aiWellbeingReport()">📊 Wellbeing Report</button></div></div><button class="btn btn-p" onclick="openFA('habit')">+ New Habit</button></div></div>
  ${visibleHabits.length===0?renderEmptyState({icon:'checkCircle',title:_habitsMyOnly?'No habits yet':'No team habits',hint:_habitsMyOnly?'Small daily reps compound. Start with one habit you can stick to.':'Switch to "My Habits" or add one to get the team going.',ctaLabel:'+ Start your first habit',ctaFn:"openFA('habit')"}):`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${visibleHabits.map(h=>{
    const lt=h.linkedTaskId?D.tasks.find(t=>t.id===h.linkedTaskId):null;
    return`<div class="cd" style="cursor:pointer;border:1.5px solid ${h.doneToday?'var(--ok)':'var(--brd)'};transition:border-color .2s" onclick="openHabitDrawer(${h.id})">
      <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
        <span style="font-size:20px">${h.icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${esc(h.title)}</div>
          <div style="font-size:11px;color:var(--t3)">${h.cadence}${h.startTime?' · ⏰ '+h.startTime:''}</div>
          ${h.category?`<div style="font-size:11px;color:var(--ac);margin-top:1px">${h.category}</div>`:''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
        <div class="chk ${h.doneToday?'on':''}" onclick="event.stopPropagation();toggleHabit(${h.id})"></div>
        <span style="font-size:11px;color:${h.doneToday?'var(--ok)':h.skippedToday?'var(--purp)':'var(--t3)'}">${h.doneToday?'✓ Done today':h.skippedToday?'⏭ Skipped today':'Pending'}</span>
        <span style="font-size:11px;color:var(--warn);margin-left:auto" title="${h.cadence} streak">🔥 ${h.streak}${h.cadence==='Daily'?'d':(h.cadence&&h.cadence.includes('/week'))?'w':'d'}</span>
      </div>
      ${!h.doneToday&&!h.skippedToday?`<button class="btn btn-s" style="height:20px;font-size:10px;padding:0 6px;margin-bottom:4px" onclick="event.stopPropagation();skipHabitToday(${h.id})" title="Skip today without breaking streak">⏭ Skip Today</button>`:''}
      ${lt?`<div style="font-size:11px;color:var(--t2);margin-bottom:4px">📋 Linked: ${esc(lt.title)}</div>`:''}
      <div class="hm">${genHM(h.streak,h.skippedDates,h.completedDates)}</div>
      ${genHeatmapMonth(h)}
    </div>`}).join('')}</div>`}
  <div class="cd" style="margin-top:12px;padding:10px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">Today's Progress</div><div style="background:var(--s3);border-radius:4px;height:8px;overflow:hidden"><div style="background:var(--ok);height:100%;width:${pct}%;transition:width .4s"></div></div><div style="font-size:11px;color:var(--t2);margin-top:4px">${pct}% complete — ${done} of ${total} habits done</div></div>`;
  $('habits-rail').innerHTML=`<div style="font-size:12px;font-weight:600;margin-bottom:6px">Today's Habits</div>${D.habits.filter(h=>h.cadence==='Daily').map(h=>`<div class="lr"><div class="chk ${h.doneToday?'on':''}" onclick="toggleHabit(${h.id})"></div><span class="rt" style="font-size:11px">${h.icon} ${esc(h.title)}</span><span style="font-size:11px;color:var(--warn)">🔥${h.streak}</span></div>`).join('')}
  <div style="margin-top:12px"><div style="font-size:12px;font-weight:600;margin-bottom:4px">Today's Rate</div><div class="stat"><div class="stat-n" style="color:var(--ok)">${pct}%</div><div class="stat-l">${done}/${total} done</div></div></div>`;
}
function genHM(s,skippedDates,completedDates){
  // Generate a 90-day heatmap. If completedDates/skippedDates provided, use them; else use streak count
  let h='';
  const today=new Date();today.setHours(0,0,0,0);
  for(let i=89;i>=0;i--){
    const d=_pd(today);d.setDate(today.getDate()-i);
    const dStr=_ymd(d);
    let cls;
    if(completedDates&&completedDates.length){
      cls=completedDates.includes(dStr)?'ok':(skippedDates&&skippedDates.includes(dStr)?'sk':'mi');
    } else {
      // Fallback: approximate from streak count
      cls=(i<s)?'ok':'mi';
    }
    h+=`<div class="hm-c ${cls}" title="${dStr}"></div>`;
  }
  return h;
}
function genHeatmapMonth(h){
  // Generate a calendar-style monthly heatmap for the current month
  const today=new Date();today.setHours(0,0,0,0);
  const year=today.getFullYear(),month=today.getMonth();
  const firstDay=new Date(year,month,1);
  const daysInMonth=new Date(year,month+1,0).getDate();
  const startDow=(firstDay.getDay()+6)%7; // 0=Mon
  const dayNames=['M','T','W','T','F','S','S'];
  const completedDates=h.completedDates||[];
  const skippedDates=h.skippedDates||[];
  let cells=dayNames.map(d=>`<div style="font-size:9px;color:var(--t3);text-align:center;font-weight:600">${d}</div>`).join('');
  // Empty cells before first day
  for(let i=0;i<startDow;i++)cells+=`<div class="hm-month-cell future"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const d=new Date(year,month,day);
    const dStr=_ymd(d);
    const isFuture=d>today;
    let cls;
    if(isFuture)cls='future';
    else if(completedDates.includes(dStr))cls='ok';
    else if(skippedDates.includes(dStr))cls='sk';
    else cls='mi';
    cells+=`<div class="hm-month-cell ${cls}" title="${dStr}: ${cls==='ok'?'Done':cls==='sk'?'Skipped':isFuture?'Future':'Missed'}"></div>`;
  }
  const monthName=today.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  return `<div style="margin-top:8px;border-top:1px solid var(--bd1);padding-top:6px">
    <div style="font-size:11px;color:var(--t3);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
      <span>${monthName}</span>
      <span style="display:flex;gap:6px;align-items:center">
        <span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:var(--ok);vertical-align:middle"></span><span>Done</span>
        <span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:var(--purp);opacity:.7;vertical-align:middle"></span><span>Skip</span>
        <span style="display:inline-block;width:8px;height:8px;border-radius:1px;background:var(--s3);vertical-align:middle"></span><span>Miss</span>
      </span>
    </div>
    <div class="hm-month">${cells}</div>
  </div>`;
}
function openHabitDrawer(hid){
  const h=hid?D.habits.find(x=>x.id===hid):null;
  const isNew=!h;
  const d=document.getElementById('drawer-content');
  const ov=document.getElementById('drawer-ov');
  d.innerHTML=`<h2>${isNew?'+ New Habit':h.icon+' Edit Habit'} <button class="close" onclick="closeDrawer()">✕</button></h2>
  <div class="field"><label>Title</label><input class="inp" value="${esc(h?.title||'')}" id="hdr-title"></div>
  <div class="field-row">
    <div class="field"><label>Icon</label>${_iconPickBtn('hdr-icon',h?.icon||'✅','Pick…')}</div>
    <div class="field"><label>Category</label><select class="inp" id="hdr-cat"><option ${(h?.category||'')==='Mindfulness'?'selected':''}>Mindfulness</option><option ${h?.category==='Health'?'selected':''}>Health</option><option ${h?.category==='Learning'?'selected':''}>Learning</option><option ${h?.category==='Productivity'?'selected':''}>Productivity</option><option ${h?.category==='Reflection'?'selected':''}>Reflection</option><option ${h?.category==='Finance'?'selected':''}>Finance</option><option ${h?.category==='Social'?'selected':''}>Social</option></select></div>
  </div>
  <div class="field-row">
    <div class="field"><label>Cadence</label><select class="inp" id="hdr-cadence"><option ${(h?.cadence||'Daily')==='Daily'?'selected':''}>Daily</option><option ${h?.cadence==='Weekdays'?'selected':''}>Weekdays</option><option ${h?.cadence==='Weekends'?'selected':''}>Weekends</option><option value="3x/week" ${['3xd7/week','3x/week','3×/week'].includes(h?.cadence)?'selected':''}>3×/week</option><option ${h?.cadence==='Weekly'?'selected':''}>Weekly</option></select></div>
    <div class="field"><label>Start Time</label><input class="inp" type="time" value="${h?.startTime||''}" id="hdr-start"></div>
    <div class="field"><label>Reminder</label><input class="inp" type="time" value="${h?.reminderTime||''}" id="hdr-reminder"></div>
  </div>
  <div class="field"><label>Link to Task (optional)</label><select class="inp" id="hdr-task"><option value="">None</option>${D.tasks.filter(t=>t.status!=='Done').map(t=>`<option value="${t.id}" ${h?.linkedTaskId===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></div>
  <div class="field"><label>Notes</label><textarea class="inp" id="hdr-notes">${esc(h?.notes||'')}</textarea></div>
  <div class="dr-actions">
    <button class="btn btn-p" onclick="saveHabit(${hid||'null'})">${isNew?'Create Habit':'Save Changes'}</button>
    ${!isNew?`<button class="btn btn-d" onclick="deleteHabit(${hid})">Delete</button>`:''}
    <button class="btn btn-s" onclick="closeDrawer()">Cancel</button>
  </div>`;
  ov.classList.add('show');
}
function saveHabit(hid){
  const title=document.getElementById('hdr-title')?.value.trim();
  if(!title){toast('Title required');return;}
  const data={
    title,
    icon:document.getElementById('hdr-icon')?.value||'✅',
    category:document.getElementById('hdr-cat')?.value||'',
    cadence:document.getElementById('hdr-cadence')?.value||'Daily',
    startTime:document.getElementById('hdr-start')?.value||'',
    reminderTime:document.getElementById('hdr-reminder')?.value||'',
    linkedTaskId:document.getElementById('hdr-task')?.value?parseInt(document.getElementById('hdr-task').value):null,
    notes:document.getElementById('hdr-notes')?.value||'',
  };
  if(hid){
    const h=D.habits.find(x=>x.id===hid);
    if(h)Object.assign(h,data);
  } else {
    D.habits.push({id:nextId(D.habits),streak:0,doneToday:false,...data});
  }
  save('habits');
  closeDrawer();
  renderScreen('habits');
  toast(hid?'Habit updated!':'Habit created!');
}
function deleteHabit(hid){
  if(!confirm('Delete this habit?'))return;
  D.habits=D.habits.filter(x=>x.id!==hid);
  save('habits');
  closeDrawer();
  renderScreen('habits');
  toast('Habit deleted');
}

// ─── Coach AI suite (C1-C7) ───────────────────────────────────────────
async function _coachAICall(systemPrompt,userContent){
  const {provider,configured}=_getAIConfig();
  const res=await _trpc('ai.assist',{systemPrompt,userContent,provider:provider||'manus'},'mutation');
  return String(res?.result||res?.text||'').trim();
}
function _coachWorkspaceContext(){
  const today=_ymd(new Date());
  const tomorrow=_ymd(new Date(Date.now()+86400000));
  const tasksDueToday=D.tasks.filter(t=>t.status!=='Done'&&(t.due===today||t.startDate===today||t.myDay));
  const overdue=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today);
  const calToday=_calMeetingsOn(today);
  const habits=(D.habits||[]).filter(h=>h.cadence==='Daily');
  const habitsDone=habits.filter(h=>h.doneToday).length;
  const goalsActive=(D.goals||[]).filter(g=>(g.pct||0)<100).slice(0,5);
  const recentJournal=(D.journal||[]).slice(-3).map(j=>`- ${j.date||''} (${j.mood||''}): ${(j.body||'').slice(0,160)}`).join('\n');
  const focusToday=(D.prefs&&D.prefs.focusLog||{})[today]||0;
  return `Today: ${today}\nTomorrow: ${tomorrow}\n\nTasks due today (${tasksDueToday.length}):\n${tasksDueToday.slice(0,8).map(t=>`- [${t.priority||'M'}] ${t.title}${t.due?` (due ${t.due})`:''}`).join('\n')||'(none)'}\n\nOverdue (${overdue.length}):\n${overdue.slice(0,5).map(t=>`- ${t.title} (${t.due})`).join('\n')||'(none)'}\n\nCalendar today (${calToday.length} events):\n${calToday.slice(0,5).map(e=>`- ${e.title||'(untitled)'} @ ${(e.start||'').slice(11,16)||'?'}`).join('\n')||'(none)'}\n\nDaily habits: ${habitsDone}/${habits.length} done · ${habits.map(h=>`${h.icon||''}${h.title} (streak ${h.streak||0})`).join(', ')}\n\nActive goals (${goalsActive.length}):\n${goalsActive.map(g=>`- ${g.icon||''} ${g.title} — ${g.pct||0}%`).join('\n')||'(none)'}\n\nFocus today: ${focusToday}m\n\nRecent journal:\n${recentJournal||'(no recent entries)'}`;
}
// C1: Daily AI Brief — cached per day
async function aiCoachDailyBrief(force){
  const today=_ymd(new Date());
  const cache=D.prefs&&D.prefs.coachDailyBrief;
  const sec=document.getElementById('coach-daily-brief');
  if(!force&&cache&&cache.date===today&&cache.text){if(sec)sec.innerHTML=_coachBriefHtml(cache.text);return;}
  if(sec)sec.innerHTML=`<div style="padding:12px;text-align:center;color:var(--t3);font-size:11px">⏳ Generating today's brief…</div>`;
  try{
    const sys=`You are a calm, sharp productivity coach. Read the user's workspace snapshot and write a personalized morning brief (3 short paragraphs, ~150 words total). Paragraph 1: what today actually looks like (be specific, name 1-2 tasks/events by name). Paragraph 2: the single most important thing to ship today and why. Paragraph 3: one gentle nudge based on patterns (habits, journal sentiment, goals). End with 2 specific suggested actions as bullets. No emoji.`;
    const text=await _coachAICall(sys,_coachWorkspaceContext());
    D.prefs=D.prefs||{};D.prefs.coachDailyBrief={date:today,text};save('prefs');
    if(sec)sec.innerHTML=_coachBriefHtml(text);
  }catch(e){if(sec)sec.innerHTML=`<div style="padding:10px;color:var(--red);font-size:11px">Brief generation failed: ${esc(String(e.message||e).slice(0,200))}</div>`;}
}
function _coachBriefHtml(text){return `<div style="font-size:11px;line-height:1.7;color:var(--t1);white-space:pre-wrap;padding:12px 14px;background:linear-gradient(135deg,color-mix(in srgb,var(--ac) 12%,var(--s2)),color-mix(in srgb,var(--purp) 8%,var(--s2)));border:1px solid color-mix(in srgb,var(--ac) 30%,var(--bd2));border-radius:10px">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:6px"><button class="btn btn-s" style="font-size:11px" onclick="aiCoachDailyBrief(true)">↻ Regenerate</button><span style="font-size:11px;color:var(--t3);align-self:center">Cached for today · regenerate after a major change</span></div>`;}
// C2: Coach chat panel — persistent thread per day
function _coachThreadKey(){return _ymd(new Date());}
function aiCoachChatRender(){
  const sec=document.getElementById('coach-chat');if(!sec)return;
  const key=_coachThreadKey();
  const thread=(D.prefs&&D.prefs.coachThread&&D.prefs.coachThread.date===key)?(D.prefs.coachThread.messages||[]):[];
  sec.innerHTML=`<div style="background:var(--s2);border:1px solid var(--bd1);border-radius:10px;padding:10px">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;font-weight:600">💬 Talk to your coach <span style="font-size:11px;color:var(--t3);font-weight:400;margin-left:auto">${thread.length} message${thread.length===1?'':'s'} today</span></div>
    <div id="coach-chat-thread" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">${thread.map(m=>`<div style="display:flex;gap:6px;align-items:flex-start"><span style="font-size:14px;flex-shrink:0">${m.role==='user'?'👤':'🤖'}</span><div style="flex:1;font-size:11px;line-height:1.5;background:${m.role==='user'?'var(--acs)':'var(--s3)'};padding:6px 10px;border-radius:8px;white-space:pre-wrap">${esc(m.text||'')}</div></div>`).join('')||'<div style="font-size:11px;color:var(--t3);padding:8px;text-align:center">Ask anything: try &quot;how should I structure today?&quot;, &quot;I am stuck on X&quot;, or &quot;help me decide between A and B&quot;</div>'}</div>
    <div style="display:flex;gap:6px"><input id="coach-chat-input" class="inp" style="flex:1;height:30px;font-size:11px" placeholder="Ask your coach…" onkeydown="if(event.key==='Enter'){event.preventDefault();aiCoachChatSend();}"><button class="btn btn-p" style="height:30px;font-size:11px;padding:0 12px" onclick="aiCoachChatSend()">Send</button>${thread.length?`<button class="btn btn-s" style="height:30px;font-size:11px" onclick="aiCoachChatClear()" title="Clear today's thread">🗑</button>`:''}</div>
  </div>`;
}
async function aiCoachChatSend(){
  const inp=document.getElementById('coach-chat-input');if(!inp)return;
  const text=(inp.value||'').trim();if(!text)return;
  const key=_coachThreadKey();
  D.prefs=D.prefs||{};
  if(!D.prefs.coachThread||D.prefs.coachThread.date!==key)D.prefs.coachThread={date:key,messages:[]};
  D.prefs.coachThread.messages.push({role:'user',text,ts:Date.now()});
  inp.value='';save('prefs');aiCoachChatRender();
  try{
    const ctx=_coachWorkspaceContext();
    const history=D.prefs.coachThread.messages.slice(-10).map(m=>`${m.role==='user'?'User':'Coach'}: ${m.text}`).join('\n');
    const sys=`You are a calm, sharp productivity coach. The user is talking to you in their second-brain app. You have FULL context of their tasks/calendar/habits/goals/journal (provided). Reply concisely (2-4 short paragraphs max), specifically (reference real items by name when relevant), and helpfully. No filler, no excessive empathy phrases, no emoji unless the user used them.`;
    const userContent=`Workspace context:\n${ctx}\n\nConversation so far:\n${history}\n\nReply to the latest user message.`;
    const reply=await _coachAICall(sys,userContent);
    D.prefs.coachThread.messages.push({role:'coach',text:reply,ts:Date.now()});
    save('prefs');aiCoachChatRender();
    setTimeout(()=>{const t=document.getElementById('coach-chat-thread');if(t)t.scrollTop=t.scrollHeight;},50);
  }catch(e){
    D.prefs.coachThread.messages.push({role:'coach',text:'Sorry — I couldn\'t reach the AI. Check your AI key in Settings.',ts:Date.now()});
    save('prefs');aiCoachChatRender();
  }
}
function aiCoachChatClear(){if(!confirm('Clear today\'s coach thread?'))return;if(D.prefs)D.prefs.coachThread=null;save('prefs');aiCoachChatRender();}
// C3: Weekly Review (Friday/Sunday surfacing)
async function aiCoachWeeklyReview(){
  toast({type:'info',title:'Building weekly review…',duration:2000});
  try{
    const today=new Date();
    const dow=today.getDay();
    const monday=_pd(today);monday.setDate(today.getDate()-(dow===0?6:dow-1));monday.setHours(0,0,0,0);
    const ws=_ymd(monday);const we=_ymd(today);
    const doneWeek=D.tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)>=ws);
    const slipped=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<we&&t.due>=ws);
    const focusLog=D.prefs&&D.prefs.focusLog||{};
    const focusWeek=Object.entries(focusLog).filter(([d])=>d>=ws).reduce((s,[,v])=>s+v,0);
    const habits=(D.habits||[]).filter(h=>h.cadence==='Daily');
    const habitsRate=habits.length?Math.round(habits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>d>=ws).length,0)/(habits.length*7)*100):0;
    const journalEntries=(D.journal||[]).filter(j=>{const d=j.date||'';return d>=ws||(d.toLowerCase().includes('today'));}).slice(-7);
    const sys=`You are an experienced productivity coach running a Friday weekly review. Format strictly:\n\n## What shipped this week\n[1-2 sentences naming specific completed work]\n\n## What slipped\n[bullets, each 1 line, naming specific items]\n\n## Patterns I noticed\n[2-3 specific patterns: energy, focus times, habit consistency, journal sentiment]\n\n## For next week\n[3 concrete actions, each 1 line]`;
    const ctx=`Week ${ws} → ${we}\nDone (${doneWeek.length}):\n${doneWeek.slice(0,12).map(t=>'- '+t.title).join('\n')||'(none)'}\nSlipped past due (${slipped.length}):\n${slipped.slice(0,8).map(t=>`- ${t.title} (was due ${t.due})`).join('\n')||'(none)'}\nFocus minutes: ${focusWeek}m total\nDaily habit completion rate: ${habitsRate}%\nRecent journal moods: ${journalEntries.map(j=>j.mood||'').join(' ')||'(none logged)'}`;
    const text=await _coachAICall(sys,ctx);
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">📅 Weekly Review</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">Week of ${ws} → ${we}</div><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:14px;font-size:12px;line-height:1.7;white-space:pre-wrap;max-height:480px;overflow-y:auto">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="navigator.clipboard.writeText(${_jsArg(text)});toast('Copied')">📋 Copy</button><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'Weekly review failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
// C4: Accountability check — looks at yesterday's promised items + today's open tasks
async function aiCoachAccountability(){
  toast({type:'info',title:'Running accountability check…',duration:2000});
  try{
    const today=_ymd(new Date());
    const yesterday=_ymd(new Date(Date.now()-86400000));
    const yTasks=D.tasks.filter(t=>(t.due===yesterday||t.startDate===yesterday)&&t.status!=='Done');
    const overdue=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<today);
    const myDay=D.tasks.filter(t=>t.myDay&&t.status!=='Done');
    const sys=`You are a kind but firm accountability partner. Look at what the user committed to recently and what's still open. For each top item (max 5): ask one direct question (Done? Deferred? Need help?). Tone: warm, specific, no shame. End with: "Hit reply with what's true."`;
    const ctx=`Yesterday's open tasks:\n${yTasks.map(t=>'- '+t.title).join('\n')||'(none)'}\nOverdue (${overdue.length}):\n${overdue.slice(0,5).map(t=>`- ${t.title} (was due ${t.due})`).join('\n')||'(none)'}\nMy Day still open:\n${myDay.slice(0,5).map(t=>'- '+t.title).join('\n')||'(none)'}`;
    const text=await _coachAICall(sys,ctx);
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🤝 Accountability Check</h2><div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:14px;font-size:12px;line-height:1.7;white-space:pre-wrap;max-height:420px;overflow-y:auto">${esc(text)}</div><div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-p" onclick="closeModal();nav('tasks')">📋 Open tasks</button><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'Accountability check failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
// C5: Focus pattern recognition
function aiCoachFocusPattern(){
  const hourly=(D.prefs&&D.prefs.focusByHour)||{};
  const fl=(D.prefs&&D.prefs.focusLog)||{};
  const totalMin=Object.values(fl).reduce((s,v)=>s+(Number(v)||0),0);
  const completionsByHour={};
  D.tasks.filter(t=>t.completedAt).forEach(t=>{const h=_pd(t.completedAt).getHours();completionsByHour[h]=(completionsByHour[h]||0)+1;});
  const peaks=Object.entries(hourly).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const compPeaks=Object.entries(completionsByHour).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const fmt=h=>{const n=Number(h);const ap=n>=12?'pm':'am';const h12=((n%12)||12);return h12+ap;};
  const m=document.getElementById('modal-content');
  m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">⏱ Focus Pattern</h2><div style="font-size:11px;color:var(--t2);line-height:1.65">
    <p style="margin:0 0 10px"><strong>${totalMin}m</strong> of focus time logged total.</p>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Top focus hours</div>
      ${peaks.length?peaks.map(([h,m])=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span><strong style="color:var(--ac)">${fmt(h)}</strong></span><span>${m}m logged</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">Use the Focus timer for a few sessions to build this picture.</div>'}
    </div>
    <div style="background:var(--s2);border:1px solid var(--bd1);border-radius:8px;padding:10px;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Top completion hours</div>
      ${compPeaks.length?compPeaks.map(([h,c])=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0"><span><strong style="color:var(--ok)">${fmt(h)}</strong></span><span>${c} task${c===1?'':'s'} done</span></div>`).join(''):'<div style="font-size:11px;color:var(--t3)">Complete tasks to build this picture.</div>'}
    </div>
    <p style="margin:10px 0 0;color:var(--t3);font-size:11px">💡 Schedule deep work in your top focus hours and admin / meetings in the lulls.</p>
  </div>
  <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
  document.getElementById('modal-capture').classList.add('show');
}
// C6: Goal-task alignment audit
async function aiCoachGoalTaskAudit(){
  const orphans=D.tasks.filter(t=>t.status!=='Done'&&t.status!=='Someday'&&!t.linkedGoalId&&!(t.tags||[]).some(tg=>tg.startsWith('goal:')));
  if(!orphans.length){toast('Every active task is linked to a goal 🎯');return;}
  if(!D.goals.length){toast('No goals to align to. Create one first.');return;}
  toast({type:'info',title:'Auditing alignment…',duration:2000});
  try{
    const goalLines=D.goals.map((g,i)=>`${i+1}. ${g.icon||'🎯'} ${g.title} — ${g.target||''}`).join('\n');
    const taskLines=orphans.slice(0,20).map((t,i)=>`${i+1}. ${t.title}`).join('\n');
    const sys=`You are an alignment coach. The user has unlinked tasks and goals. For each task, suggest a single goal index (or 0 if none fit). Reply with strict JSON only: {"pairings":[{"task":1,"goal":2,"why":"…"}, …]}`;
    const text=String(await _coachAICall(sys,`Goals:\n${goalLines}\n\nUnlinked tasks:\n${taskLines}`)).trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');
    const p=JSON.parse(text);
    const pairs=Array.isArray(p.pairings)?p.pairings:[];
    const m=document.getElementById('modal-content');
    m.innerHTML=`<h2 style="font-size:14px;font-weight:600;margin-bottom:6px">🎯 Goal-Task Alignment</h2><div style="font-size:11px;color:var(--t3);margin-bottom:10px">${orphans.length} task${orphans.length===1?'':'s'} not linked to any goal. AI suggested pairings:</div>
      <div style="max-height:380px;overflow-y:auto">${pairs.map(p=>{const t=orphans[p.task-1];const g=p.goal>0?D.goals[p.goal-1]:null;if(!t)return '';return `<div class="cd" style="margin-bottom:6px;padding:8px"><div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="flex:1;font-size:11px;font-weight:500">📋 ${esc(t.title)}</span>${g?`<span style="font-size:11px;color:var(--ac)">→ ${g.icon||'🎯'} ${esc(g.title)}</span>`:'<span style="font-size:11px;color:var(--t3)">no good fit</span>'}</div>${p.why?`<div style="font-size:11px;color:var(--t3);font-style:italic">${esc(p.why)}</div>`:''}${g?`<button class="btn btn-s" style="font-size:11px;height:22px;margin-top:4px" onclick="D.tasks.find(x=>x.id==${_tidLit(t.id)}).linkedGoalId=${g.id};save('tasks');this.textContent='✓ Linked';this.disabled=true">Link this</button>`:''}</div>`;}).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:10px"><button class="btn btn-s" onclick="closeModal()">Close</button></div>`;
    document.getElementById('modal-capture').classList.add('show');
  }catch(e){toast({type:'error',title:'Audit failed',msg:String(e.message||e).slice(0,200),duration:5000});}
}
// C7: Burnout signal — multi-signal check (no AI required for the math)
function _coachBurnoutSignal(){
  const today=new Date();const todayStr=_ymd(today);
  const past14=Array.from({length:14},(_,i)=>{const d=_pd(today);d.setDate(today.getDate()-i);return _ymd(d);});
  const past14Done=D.tasks.filter(t=>t.status==='Done'&&_dayOf(t.completedAt)>=past14[13]).length;
  const overdueCount=D.tasks.filter(t=>t.status!=='Done'&&t.due&&t.due<todayStr).length;
  const focusLog=D.prefs&&D.prefs.focusLog||{};
  const focus14=past14.reduce((s,d)=>s+(focusLog[d]||0),0);
  const habits=(D.habits||[]).filter(h=>h.cadence==='Daily');
  const habitRate14=habits.length?habits.reduce((s,h)=>s+(h.completedDates||[]).filter(d=>past14.includes(d)).length,0)/(habits.length*14):1;
  const moodMap={'😊':5,'🙂':4,'😐':3,'😫':2,'😰':1};
  const recentMoods=(D.journal||[]).slice(-7).map(j=>moodMap[j.mood]||null).filter(Boolean);
  const moodAvg=recentMoods.length?recentMoods.reduce((s,v)=>s+v,0)/recentMoods.length:null;
  // Score: higher = more stress
  let stress=0;const reasons=[];
  if(overdueCount>=8){stress+=3;reasons.push(`${overdueCount} overdue tasks`);}else if(overdueCount>=4){stress+=2;reasons.push(`${overdueCount} overdue tasks`);}
  if(habitRate14<0.4){stress+=2;reasons.push(`Daily habits only ${Math.round(habitRate14*100)}% in last 14 days`);}
  else if(habitRate14<0.6){stress+=1;reasons.push(`Habit consistency dipping (${Math.round(habitRate14*100)}%)`);}
  if(moodAvg!==null&&moodAvg<2.7){stress+=2;reasons.push(`Mood average ${moodAvg.toFixed(1)}/5 in recent journal entries`);}
  else if(moodAvg!==null&&moodAvg<3.3){stress+=1;reasons.push(`Mood average ${moodAvg.toFixed(1)}/5`);}
  if(focus14>14*120){stress+=2;reasons.push(`${focus14}m of focus time over 14 days (>2h/day average)`);}
  if(past14Done>=14*5){stress+=1;reasons.push(`Heavy task throughput: ${past14Done} done in 14 days`);}
  return {stress,reasons,level:stress>=5?'high':stress>=3?'moderate':'low'};
}

function renderCoach(){
  // ---- Compute real insights from data ----
  const now=new Date();
  const todayStr=_ymd(now);
  const dayOfWeek=now.getDay();
  const monDate=_pd(now);monDate.setDate(now.getDate()-(dayOfWeek===0?6:dayOfWeek-1));monDate.setHours(0,0,0,0);
  const weekStart=_ymd(monDate);
  const sunDate=_pd(monDate);sunDate.setDate(monDate.getDate()+6);
  const weekEnd=_ymd(sunDate);

  // Tasks
  const doneTasks=D.tasks.filter(t=>t.status==='Done');
  const pendingTasks=D.tasks.filter(t=>t.status!=='Done'&&t.status!=='Someday');
  const overdueTasks=D.tasks.filter(t=>t.due&&t.due<todayStr&&t.status!=='Done');
  const highPending=pendingTasks.filter(t=>t.priority==='High');
  const weekTasks=D.tasks.filter(t=>{const d=t.startDate||t.due||'';return d>=weekStart&&d<=weekEnd;});
  const weekDone=weekTasks.filter(t=>t.status==='Done');
  const completionRate=weekTasks.length?Math.round(weekDone.length/weekTasks.length*100):0;

  // Habits
  const dailyHabits=D.habits.filter(h=>h.cadence==='Daily');
  const doneHabitsToday=dailyHabits.filter(h=>h.doneToday);
  const habitRate=dailyHabits.length?Math.round(doneHabitsToday.length/dailyHabits.length*100):0;
  const topStreak=D.habits.reduce((best,h)=>h.streak>best.streak?h:best,{streak:0,title:'—',icon:''});
  const neglectedHabits=D.habits.filter(h=>!h.doneToday&&h.cadence==='Daily');

  // Goals
  const goalsOnTrack=D.goals.filter(g=>g.pct>=50);
  const goalsBehind=D.goals.filter(g=>g.pct<30&&g.dueDate&&g.dueDate>todayStr);
  const nearDueGoals=D.goals.filter(g=>{if(!g.dueDate)return false;const diff=(_pd(g.dueDate)-now)/(1000*60*60*24);return diff>=0&&diff<=14;});

  // Focus
  const focusLog=D.prefs&&D.prefs.focusLog||{};
  const focusToday=D.prefs&&D.prefs.focusMinsToday||0;
  const focusWeek=Object.entries(focusLog).filter(([d])=>d>=weekStart&&d<=weekEnd).reduce((s,[,v])=>s+v,0); // focusLog already holds today (no +focusMinsToday)
  const focusAvgDay=weekTasks.length?Math.round(focusWeek/7):0;

  // Build insight cards
  const observations=[];
  const encouragements=[];
  const warnings=[];
  const nudges=[];

  // Observations
  observations.push({t:`This week: ${weekDone.length}/${weekTasks.length} tasks done (${completionRate}%)`,b:`${weekTasks.length-weekDone.length} tasks still pending this week.`,a:weekTasks.length?`<button class="btn btn-s" style="height:20px;font-size:10px" onclick="nav('myweek')">View Week</button>`:''});
  if(focusWeek>0)observations.push({t:`${focusWeek}m focus time this week`,b:`That's roughly ${Math.round(focusWeek/60*10)/10}h of deep work. Daily average: ${focusAvgDay}m.`,a:''});
  observations.push({t:`Habits: ${habitRate}% done today`,b:`${doneHabitsToday.length} of ${dailyHabits.length} daily habits completed.`,a:dailyHabits.length?`<button class="btn btn-s" style="height:20px;font-size:10px" onclick="nav('habits')">View Habits</button>`:''});
  if(goalsOnTrack.length)observations.push({t:`${goalsOnTrack.length} goal${goalsOnTrack.length>1?'s':''} on track (≥50%)`,b:goalsOnTrack.map(g=>g.icon+' '+g.title+' — '+g.pct+'%').join(', '),a:''});

  // Encouragements
  if(topStreak.streak>=7)encouragements.push({t:`🔥 ${topStreak.streak}-day streak on "${topStreak.icon} ${topStreak.title}"!`,b:'Consistency is compounding. Keep it going!'});
  if(completionRate>=70)encouragements.push({t:`Strong week — ${completionRate}% task completion!`,b:'You\'re in the top tier of productive weeks. Finish strong.'});
  if(doneTasks.length>0)encouragements.push({t:`${doneTasks.length} task${doneTasks.length>1?'s':''} completed overall`,b:'Every done item is momentum. Great work, '+((D.creds.userName||'Idris').split(' ')[0])+'!'});
  if(encouragements.length===0)encouragements.push({t:'You\'re showing up — that\'s what matters.',b:'Start small, stay consistent. Today is a fresh page.'});

  // Warnings
  if(overdueTasks.length)warnings.push({t:`${overdueTasks.length} overdue task${overdueTasks.length>1?'s':''}`,b:overdueTasks.slice(0,3).map(t=>t.title).join(', ')+(overdueTasks.length>3?'...':''),a:`<button class="btn btn-s" style="height:20px;font-size:10px" onclick="nav('tasks')">Review Tasks</button>`});
  if(highPending.length>=5)warnings.push({t:`${highPending.length} high-priority tasks pending`,b:'Consider delegating or deferring some to stay focused.',a:''});
  if(neglectedHabits.length&&now.getHours()>=18)warnings.push({t:`${neglectedHabits.length} habit${neglectedHabits.length>1?'s':''} not done today`,b:neglectedHabits.map(h=>h.icon+' '+h.title).join(', '),a:`<button class="btn btn-s" style="height:20px;font-size:10px" onclick="nav('habits')">Check In</button>`});
  if(nearDueGoals.length)warnings.push({t:`${nearDueGoals.length} goal${nearDueGoals.length>1?'s':''} due within 14 days`,b:nearDueGoals.map(g=>g.icon+' '+g.title+' ('+g.dueDate+')').join(', '),a:`<button class="btn btn-s" style="height:20px;font-size:10px" onclick="nav('goals')">Review Goals</button>`});
  if(goalsBehind.length)warnings.push({t:`${goalsBehind.length} goal${goalsBehind.length>1?'s':''} behind (<30%)`,b:goalsBehind.map(g=>g.icon+' '+g.title+' — '+g.pct+'%').join(', '),a:''});

  // Daily nudges based on time of day
  const hr=now.getHours();
  if(hr<10)nudges.push({t:'Morning Ritual',b:'Start with your top 3 priorities. What\'s the one thing that would make today a win?',a:`<button class="btn btn-p" style="height:22px;font-size:11px" onclick="nav('myday')">Open My Day</button>`});
  else if(hr<13)nudges.push({t:'Mid-Morning Check-in',b:`You have ${pendingTasks.filter(t=>t.myDay).length} tasks on My Day. Stay in deep work mode.`,a:`<button class="btn btn-p" style="height:22px;font-size:11px" onclick="nav('myday')">Execute</button>`});
  else if(hr<17)nudges.push({t:'Afternoon Focus',b:'Energy typically dips after 2 PM. Consider a 5-min break or a Pomodoro sprint.',a:`<button class="btn btn-p" style="height:22px;font-size:11px" onclick="nav('myday')">Start Timer</button>`});
  else nudges.push({t:'Evening Wrap-Up',b:'Great time to complete your daily reflection and plan tomorrow\'s top 3.',a:`<button class="btn btn-p" style="height:22px;font-size:11px" onclick="nav('myday')">Wrap Up</button>`});

  function insCard(items,cls){return items.map(i=>`<div class="ins ${cls}" style="margin-bottom:8px"><div style="font-size:12px;font-weight:500;margin-bottom:3px">${i.t}</div><div style="font-size:11px;color:var(--t2);line-height:1.5">${i.b}</div>${i.a?`<div style="margin-top:6px">${i.a}</div>`:''}</div>`).join('');}

  // C7: burnout signal — show flag when score >= 3
  const burnout=_coachBurnoutSignal();
  // C1: daily AI brief — auto-trigger if cache stale
  const briefCache=D.prefs&&D.prefs.coachDailyBrief;
  const briefFresh=briefCache&&briefCache.date===todayStr&&briefCache.text;
  $('coach-main').innerHTML=`
  <div class="ph-r" style="margin-bottom:12px">
    <div><h1 style="font-size:22px;font-weight:700;display:inline-flex;align-items:center;gap:8px">${_icon('brain',22,'var(--page-accent)')}Coach</h1><p style="font-size:12px;color:var(--t2)">Personalized insights — rule-based + AI</p></div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <div style="position:relative;display:inline-block">
        <button class="btn btn-s" style="height:30px;font-size:11px;color:var(--ac)" onclick="event.stopPropagation();togglePopMenu('coach-ai-menu')" title="AI tools">✨ AI ▾</button>
        <div id="coach-ai-menu" data-pop-menu="1" style="display:none;position:absolute;right:0;top:34px;background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:4px;z-index:50;min-width:230px;box-shadow:0 4px 16px rgba(0,0,0,.35)">
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('coach-ai-menu');aiCoachDailyBrief(true)">📰 Refresh daily brief</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--purp);background:transparent;border:none;text-align:left" onclick="closePopMenu('coach-ai-menu');aiCoachWeeklyReview()">📅 Weekly review</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--warn);background:transparent;border:none;text-align:left" onclick="closePopMenu('coach-ai-menu');aiCoachAccountability()">🤝 Accountability check</button>
          <div style="height:1px;background:var(--bd1);margin:3px 2px"></div>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--ac);background:transparent;border:none;text-align:left" onclick="closePopMenu('coach-ai-menu');aiCoachFocusPattern()">⏱ Focus patterns</button>
          <button class="btn btn-s" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:flex-start;height:28px;font-size:11px;color:var(--grn);background:transparent;border:none;text-align:left" onclick="closePopMenu('coach-ai-menu');aiCoachGoalTaskAudit()">🎯 Goal-task audit</button>
        </div>
      </div>
      <button class="btn btn-s" onclick="renderCoach()">🔄 Refresh</button>
    </div>
  </div>
  ${burnout.stress>=3?`<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:10px;background:color-mix(in srgb,${burnout.level==='high'?'var(--red)':'var(--warn)'} 14%,var(--s2));border:1px solid color-mix(in srgb,${burnout.level==='high'?'var(--red)':'var(--warn)'} 35%,var(--bd2));border-radius:8px"><span style="font-size:18px">🪫</span><div style="flex:1"><div style="font-size:11px;font-weight:600;color:${burnout.level==='high'?'var(--red)':'var(--warn)'}">${burnout.level==='high'?'High stress signals':'Watch your bandwidth'}</div><div style="font-size:11px;color:var(--t2);margin-top:3px;line-height:1.5">${burnout.reasons.slice(0,3).map(r=>esc(r)).join(' · ')}</div></div><button class="btn btn-s" style="font-size:11px" onclick="aiCoachAccountability()">🤝 Triage</button></div>`:''}
  <div style="margin-bottom:12px"><div class="sec-h" style="color:var(--ac);display:flex;align-items:center;gap:6px">📰 Daily Brief ${briefFresh?'<span style="font-size:11px;color:var(--t3);font-weight:400">cached</span>':''}</div><div id="coach-daily-brief">${briefFresh?_coachBriefHtml(briefCache.text):'<div style="padding:12px;text-align:center;color:var(--t3);font-size:11px">⏳ Generating today&#39;s brief…</div>'}</div></div>
  <div style="margin-bottom:12px"><div class="sec-h" style="color:var(--purp)">💬 Coach Chat</div><div id="coach-chat"></div></div>
  <div style="background:var(--s2);border-radius:8px;padding:12px 14px;margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
    <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ac)">${completionRate}%</div><div style="font-size:11px;color:var(--t3)">Week Tasks</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ok)">${habitRate}%</div><div style="font-size:11px;color:var(--t3)">Habits Today</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--warn)">${overdueTasks.length}</div><div style="font-size:11px;color:var(--t3)">Overdue</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ac)">${focusToday}m</div><div style="font-size:11px;color:var(--t3)">Focus Today</div></div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:700;color:var(--ok)">${topStreak.streak}🔥</div><div style="font-size:11px;color:var(--t3)">Top Streak</div></div>
  </div>
  ${nudges.length?`<div class="sec-h" style="color:var(--ac)">💡 Right Now</div>${insCard(nudges,'obs')}`:''}
  <div class="sec-h">📊 Observations</div>${insCard(observations,'obs')}
  <div class="sec-h" style="color:var(--ok)">🌟 Encouragement</div>${insCard(encouragements,'enc')}
  ${warnings.length?`<div class="sec-h" style="color:var(--warn)">⚠️ Needs Attention</div>${insCard(warnings,'wrn')}`:''}
  `;
  // After mount: render the chat panel + auto-fetch brief if stale.
  if(typeof aiCoachChatRender==='function')aiCoachChatRender();
  if(!briefFresh)setTimeout(()=>aiCoachDailyBrief(),200);
  $('coach-rail').innerHTML=`
  <div style="font-size:12px;font-weight:600;margin-bottom:8px">🎯 Daily Priorities</div>
  ${D.tasks.filter(t=>t.priority==='High'&&t.status!=='Done').slice(0,3).map(t=>`<div class="lr" style="font-size:11px" onclick="openDrawer('task',D.tasks.find(x=>x.id==${_tidLit(t.id)}))"><div class="chk ${t.status==='Done'?'on':''}" onclick="event.stopPropagation();toggleTask(${_tidLit(t.id)})"></div><span class="rt">${esc(t.title)}</span></div>`).join('')||(D.tasks.filter(t=>t.status!=='Done').length?'':'<p style="font-size:11px;color:var(--t3)">All tasks done! 🎉</p>')}
  <div style="font-size:12px;font-weight:600;margin:12px 0 6px">✅ Habit Check-In</div>
  ${dailyHabits.map(h=>`<div class="lr"><div class="chk ${h.doneToday?'on':''}" onclick="toggleHabit(${h.id})"></div><span class="rt" style="font-size:11px">${h.icon} ${esc(h.title)}</span><span style="font-size:11px;color:var(--warn)">🔥${h.streak}</span></div>`).join('')}
  <div style="font-size:12px;font-weight:600;margin:12px 0 6px">${_icon('target',14,'currentColor')} Goals Snapshot</div>
  ${D.goals.slice(0,4).map(g=>`<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>${g.icon} ${esc(g.title)}</span><span style="color:var(--t3)">${g.pct}%</span></div><div class="pb"><div class="f" style="width:${g.pct}%;background:${g.pct>=70?'var(--ok)':g.pct>=40?'var(--ac)':'var(--warn)'}"></div></div></div>`).join('')}
  `;
}

