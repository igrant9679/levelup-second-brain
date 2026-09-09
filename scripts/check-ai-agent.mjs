// Guard: the in-app agent (build -196) must keep working.
//
// Loads client/public/js/app-agent.js into a sandbox with a fake workspace and
// stubs for the app globals it touches, then:
//   1. every tool in the registry runs and produces the app's own record shapes
//   2. names resolve, ambiguity comes back as candidates (never a silent guess)
//   3. every write is undoable and undo actually restores the data
//   4. the parser survives fences / prose / garbage
//   5. the system prompt stays under ai.agent's cap and lists every tool
//   6. the send loop: instant reads run, writes wait for approval, skip is
//      honoured, "continue" is bounded, and a server without ai.agent degrades
//      to the answer-only path instead of failing
//
//   node scripts/check-ai-agent.mjs            # working copy
//   node scripts/check-ai-agent.mjs <dir>      # a dir holding app-agent.js
//   node scripts/check-ai-agent.mjs https://levelupnow.tools
//
// No dependencies. Exits non-zero on failure.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
let src, where;
if (arg && /^https?:\/\//i.test(arg)) {
  where = arg.replace(/\/+$/, '');
  const r = await fetch(`${where}/js/app-agent.js`);
  if (!r.ok) throw new Error(`${r.status} fetching app-agent.js from ${where}`);
  src = await r.text();
} else {
  const dir = arg ? path.resolve(arg) : path.join(ROOT, 'client', 'public', 'js');
  where = dir;
  src = fs.readFileSync(path.join(dir, 'app-agent.js'), 'utf8');
}

let failed = 0;
const t = (name, ok, extra) => {
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  → ' + extra : ''));
};

// ── fake workspace + app globals ───────────────────────────────────────────
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const today = ymd(new Date());
const saved = [];        // every save(key) call
const trpcCalls = [];    // every _trpc call
let trpcScript = [];     // scripted responses for ai.agent
const localStore = {};

const D = {
  creds: { userName: 'Test User' },
  prefs: { aiChat: { messages: [] }, savedReports: [] },
  tasks: [
    { id: 1, title: 'Write the auth refactor spec', status: 'Not Started', priority: 'High', due: today, projectId: 10, project: 'Alpha Launch', subtasks: [] },
    { id: 2, title: 'Review pull request', status: 'Done', priority: 'Medium', due: '', completedAt: new Date().toISOString(), subtasks: [] },
    { id: 3, title: 'Call the bank', status: 'Not Started', priority: 'Low', due: '2020-01-01', subtasks: [] },
  ],
  projects: [
    { id: 10, name: 'Alpha Launch', status: 'Active', due: 'TBD', pct: 0 },
    { id: 11, name: 'Alpha Website', status: 'Active', due: 'TBD', pct: 0 },
    { id: 12, name: 'Beta Program Design', status: 'Active', due: 'TBD', pct: 0 },
  ],
  programs: [{ id: 100, name: 'Growth', status: 'Active', projectIds: [10] }],
  goals: [{ id: 20, title: 'Ship v1', status: 'Active', pct: 20, linkedTaskIds: [], milestones: [] }],
  habits: [{ id: 30, title: 'Morning run', cadence: 'Daily', status: 'Active', streak: 2, doneToday: false, completedDates: [], skippedDates: [] }],
  notes: [{ id: 40, title: 'Meeting with Priya', body: 'Discussed pricing and the auth refactor.', tags: ['meeting'] }],
  ideas: [], contacts: [], opportunities: [{ id: 50, name: 'Cedar Health', accountName: 'Cedar', stage: 'Proposal', value: 12000, status: 'open', linkedTaskIds: [] }],
  mindmaps: [], journal: [],
  finance: {
    accounts: [{ id: 'a1', name: 'Checking', type: 'checking', balance: 1000 }],
    transactions: [], bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 1, catId: 'housing', accountId: 'a1', active: true }],
    categories: [{ id: 'housing', name: 'Housing', group: 'Home', kind: 'expense' }, { id: 'groceries', name: 'Groceries', group: 'Food', kind: 'expense' }, { id: 'misc-other', name: 'Miscellaneous', group: 'Misc', kind: 'expense' }, { id: 'salary', name: 'Salary', group: 'Income', kind: 'income' }],
    budgets: { groceries: 500 }, goals: [], budgetOverrides: {}, settings: {},
  },
};

const sandbox = {
  console, Date, JSON, Math, String, Number, Array, Object, Promise, parseInt, parseFloat, isNaN, setTimeout, clearTimeout,
  D,
  curScreen: 'home',
  save: (k) => saved.push(k),
  nextId: (arr) => Math.max(0, ...arr.map((x) => x.id)) + 1,
  toast: () => {},
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  renderMd: (s) => '<p>' + String(s) + '</p>',
  nav: (p) => { sandbox.curScreen = p; },
  renderScreen: () => {}, updateSidebarBadges: () => {}, invalidateSearchIndex: () => {},
  _ymd: ymd, _todayStr: today,
  _trpc: async (proc, input) => {
    trpcCalls.push({ proc, input });
    if (proc === 'ai.agent') {
      const next = trpcScript.shift();
      if (next instanceof Error) throw next;
      return { result: typeof next === 'string' ? next : JSON.stringify(next ?? { say: 'ok', next: 'wait' }) };
    }
    if (proc === 'ai.assist') return { result: 'fallback answer' };
    return {};
  },
  _getAIConfig: () => ({ provider: 'openai', apiKey: 'k' }),
  _aiChatHistory: () => D.prefs.aiChat.messages,
  _aiChatSystemPrompt: () => 'legacy prompt',
  AI_USER_MAX: 7900,
  _buildAIContext: () => 'WORKSPACE: ' + 'x'.repeat(600),
  _aiClampStr: (s, n) => { s = String(s == null ? '' : s); return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…'; },
  _luKnowledgeHits: (q) => 'HELP — The weekly review: thirty minutes…',
  _luIsProductQuestion: (q) => /how|review|routine/i.test(q),
  LU_AI_PRIMER: 'ABOUT LEVELUP — primer text',
  _gatherRelevantContent: (q) => D.notes.filter((n) => (n.title + n.body).toLowerCase().includes(String(q).toLowerCase().split(' ')[0])).map((n) => ({ type: 'note', id: n.id, title: n.title, snippet: n.body })),
  _finData: () => D.finance, _finRO: () => false, _finSave: () => saved.push('finance'),
  _finCat: (id) => D.finance.categories.find((c) => c.id === id) || { id, name: '(unknown)' },
  _finYM: (d) => ymd(d).slice(0, 7), _finMonth: today.slice(0, 7), _finTab: 'overview', _finRepOpen: null,
  _finSpent: () => 120, _finIncome: () => 3000, _finSpentByCat: () => ({ groceries: 620 }),
  _finBudgetFor: (cid) => D.finance.budgets[cid] || 0,
  renderMoney: () => {},
  FIN_REPORTS: [{ id: 'monthly-summary', name: 'Monthly summary' }],
  _calEvents: [], renderCal: () => {},
  _reportWidgets: [], _saveReportWidgets: () => saved.push('widgets'), _reportRange: '30d', _reportSections: {},
  WIDGET_SOURCES: { tasks: {}, habits: {}, goals: {}, journal: {}, projects: {}, ideas: {}, focus: {}, allTasks: {}, external: {}, time: {} },
  _widgetData: (w) => ({ labels: ['a'], values: [1] }), renderReports: () => {},
  _getSavedReports: () => D.prefs.savedReports, _setSavedReports: (a) => { D.prefs.savedReports = a; saved.push('prefs'); }, loadSavedReport: () => {},
  saveMindmaps: () => saved.push('mindmaps'), _mmNextId: (arr) => (arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1),
  calcHabitStreak: (h) => (h.completedDates || []).length,
  _syncTaskCompletedAt: (t) => { if (t.status === 'Done') { if (!t.completedAt) t.completedAt = new Date().toISOString(); } else t.completedAt = ''; },
  applyBidirectionalLinks: () => {},
  luApplyLevel: (n) => { D.prefs.workspace = { level: n }; }, luSetPageOn: (id, on) => { D.prefs.workspace = D.prefs.workspace || {}; D.prefs.workspace[id] = on; },
  _luRebuildLayoutCSS: () => {}, initSidebars: () => {},
  LU_PAGES: [{ id: 'home', label: 'Home', core: true }, { id: 'tasks', label: 'Tasks' }, { id: 'money', label: 'Money' }, { id: 'reports', label: 'Reports' }],
  SM: { home: 's-home', tasks: 's-tasks', money: 's-money', reports: 's-reports', calendar: 's-calendar', notes: 's-notes', projects: 's-projects' },
  _dayCapacityCheck: () => ({ plannedMins: 120, bookedMins: 60, freeMins: 300, deltaMins: 180 }),
  _gtdBuckets: () => ({ Inbox: [1, 2] }),
  _parseJournalDate: (j) => j.date || null,
  _PIPELINE_STAGES: [], _stageDef: (k) => ({ 'Closed Won': { key: 'Closed Won', outcome: 'won' }, Qualified: { key: 'Qualified' }, Lead: { key: 'Lead' } })[k] || null,
  openDrawer: () => {}, openProjectDetail: () => {}, openProgramDetail: () => {}, showNoteInEditor: () => {}, openGoalDetail: () => {}, openIdeaDetail: () => {}, openContactDetail: () => {}, openOpportunityDetail: () => {}, mmOpen: () => {},
  openHelpDrawer: () => {}, toggleAIPanel: () => {}, autoSizeAIInput: () => {}, _fmtChatTime: () => '', _updateAIMsgCount: () => {},
  _cmdpActions: () => [{ id: 'x' }],
  localStorage: { setItem: (k, v) => { localStore[k] = v; }, getItem: (k) => localStore[k] ?? null },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, remove() {} }),
    head: { appendChild() {} },
    addEventListener() {}, removeEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'app-agent.js' });

const A = sandbox.luAgent;
const TOOLS = A.tools;
const exec = (tool, args) => sandbox._agentExec({ tool, args });
console.log(`source: ${where}\ntools: ${TOOLS.length}\n`);

// ── 1. registry integrity ──────────────────────────────────────────────────
t('every tool has name/kind/sig/run', TOOLS.every((x) => x.name && ['read', 'nav', 'write', 'destructive'].includes(x.kind) && x.sig && typeof x.run === 'function'));
t('tool names unique', new Set(TOOLS.map((x) => x.name)).size === TOOLS.length);
t('sig starts with the tool name', TOOLS.every((x) => x.sig.startsWith(x.name + '{')), TOOLS.filter((x) => !x.sig.startsWith(x.name + '{')).map((x) => x.name).join(','));
t('describe() never throws on empty args', TOOLS.every((x) => { try { sandbox._agentDescribe({ tool: x.name, args: {} }); return true; } catch { return false; } }));
t('delete is destructive; reads are read', sandbox._agentTool('delete').kind === 'destructive' && sandbox._agentTool('status').kind === 'read' && sandbox._agentTool('navigate').kind === 'nav');

// ── 2. prompt ──────────────────────────────────────────────────────────────
const sys = A.systemPrompt('how do I run a weekly review?');
t('system prompt under ai.agent cap', sys.length <= 15000, sys.length + ' / 15000');
t('prompt lists every tool', TOOLS.every((x) => sys.includes(x.name + '{')));
t('prompt carries workspace status', sys.includes('WORKSPACE NOW') && sys.includes('overdue'));
t('prompt pulls help for product questions', sys.includes('RELEVANT HELP'));
t('prompt states today\'s date', sys.includes(today));
t('prompt keeps the response format', sys.includes('"say"') && sys.includes('"actions"') && sys.includes('"ask"'));

// ── 3. parser ──────────────────────────────────────────────────────────────
const p1 = A.parse('{"say":"hi","actions":[{"tool":"create_task","args":{"title":"x"}}],"next":"continue"}');
t('parses plain JSON', p1.say === 'hi' && p1.actions.length === 1 && p1.next === 'continue');
const p2 = A.parse('Sure! ```json\n{"say":"fenced","ask":{"question":"Which?","options":["a","b"]}}\n```');
t('parses fenced JSON', p2.say === 'fenced' && p2.ask && p2.ask.options.length === 2);
const p3 = A.parse('Here you go: {"say":"embedded"} thanks');
t('parses embedded JSON', p3.say === 'embedded');
const p4 = A.parse('just prose, no json');
t('prose becomes say', p4.say === 'just prose, no json' && p4.actions.length === 0);
const p5 = A.parse('{"actions":[{"tool":"list","args":{"entity":"tasks"}},{"nope":1}]}');
t('drops malformed actions', p5.actions.length === 1);
t('junk input safe', (() => { try { A.parse(null); A.parse(''); A.parse('{'); return true; } catch { return false; } })());

// ── 4. dates & resolution ──────────────────────────────────────────────────
t('date: ISO passthrough', A.date('2026-12-01') === '2026-12-01');
t('date: tomorrow', A.date('tomorrow') === ymd(new Date(Date.now() + 86400000)));
t('date: garbage → empty', A.date('someday') === '');
const amb = A.find(D.projects, 'Alpha', 'name');
t('ambiguous name → candidates', !!amb.ambiguous && amb.ambiguous.length === 2);
t('unique partial name resolves', A.find(D.projects, 'Beta', 'name').item?.id === 12);
t('id resolves', A.find(D.tasks, '3', 'title').item?.id === 3);
t('multi-word loose match', A.find(D.tasks, 'auth spec', 'title').item?.id === 1);

// ── 5. tools ───────────────────────────────────────────────────────────────
let r;
r = exec('create_task', { title: 'Draft launch email', due: 'tomorrow', priority: 'high', project: 'Beta', subtasks: ['Outline', 'Write'], myDay: true, tags: 'launch, email' });
const nt = D.tasks.find((x) => x.title === 'Draft launch email');
t('create_task builds the app shape', r.ok && nt && nt.projectId === 12 && nt.project === 'Beta Program Design' && nt.priority === 'High' && nt.subtasks.length === 2 && nt.myDay === true && nt.tags.length === 2 && nt.status === 'Not Started' && nt.createdBy === 'Test User' && typeof nt.createdAt === 'string' && Array.isArray(nt.comments), r.summary);
t('create_task with ambiguous project asks', !exec('create_task', { title: 'x', project: 'Alpha' }).ok && !!exec('create_task', { title: 'x', project: 'Alpha' }).candidates);
t('create_task rejects empty title', !exec('create_task', {}).ok);
r = exec('update_task', { id: 'Draft launch', due: '', priority: 'Low', status: 'In Progress' });
t('update_task edits by name', r.ok && nt.priority === 'Low' && nt.status === 'In Progress' && nt.due === '');
r = exec('complete_task', { id: nt.id });
t('complete_task stamps completedAt', r.ok && nt.status === 'Done' && !!nt.completedAt);
r = exec('add_subtasks', { id: nt.id, titles: ['Send', 'Track opens'] });
t('add_subtasks appends', r.ok && nt.subtasks.length === 4 && nt.subtasks[3].done === false);
r = exec('block_time', { id: 1, start: '14:00', mins: 90 });
t('block_time creates a linked focus block', r.ok && sandbox._calEvents.length === 1 && sandbox._calEvents[0].linkedTaskId === '1' && D.tasks[0].startTime === '14:00' && D.tasks[0].endTime === '15:30' && D.tasks[0].myDay === true && !!localStore.lu_calEvents);

r = exec('create_project', { name: 'Q4 Launch', due: 'end of month', program: 'Growth', tasks: ['Kickoff', { title: 'Budget sign-off', priority: 'High' }] });
const np = D.projects.find((x) => x.name === 'Q4 Launch');
t('create_project with tasks + program', r.ok && np && np.status === 'Active' && np.pct === 0 && D.tasks.filter((x) => x.projectId === np.id).length === 2 && D.programs[0].projectIds.includes(np.id) && r.data.taskIds.length === 2);
r = exec('create_program', { name: 'Platform', projects: ['Beta'] });
t('create_program links projects', r.ok && D.programs.find((x) => x.name === 'Platform').projectIds[0] === 12);
r = exec('update_program', { id: 'Platform', addProjects: ['Q4 Launch'], removeProjects: ['Beta'] });
t('update_program add/remove', r.ok && D.programs.find((x) => x.name === 'Platform').projectIds.join() === String(np.id));

r = exec('create_note', { title: 'Launch checklist', body: '# Steps\n- one', tags: ['launch'], projects: ['Q4 Launch'] });
const nn = D.notes.find((x) => x.title === 'Launch checklist');
t('create_note builds the app shape', r.ok && nn && nn.body.startsWith('# Steps') && nn.bodyHtml.includes('<p>') && nn.linkedProjectIds[0] === np.id && nn.readingStatus === 'Inbox' && nn.starred === false);
r = exec('append_note', { id: 'Launch checklist', text: '- two' });
t('append_note appends', r.ok && nn.body.endsWith('- two') && nn.updated === 'Just now');
r = exec('update_note', { id: nn.id, starred: true, tags: 'a,b,c' });
t('update_note edits', r.ok && nn.starred === true && nn.tags.length === 3);

r = exec('create_mindmap', { title: 'Pricing options', branches: [{ text: 'Freemium', children: ['Limits', 'Upsell'] }, 'Flat fee', { text: 'Usage-based' }] });
const mm = D.mindmaps[0];
t('create_mindmap lays out nodes/edges', r.ok && mm && mm.nodes.length === 6 && mm.edges.length === 5 && mm.nodes[0].isRoot && mm.nodes.every((n) => typeof n.x === 'number' && n.shape === 'rect') && mm.layout === 'free');

r = exec('create_idea', { title: 'Referral program', description: 'Give credits', idea_type: 'business' });
t('create_idea starts at spark with ICE 5/5/5', r.ok && D.ideas[0].stage === 'spark' && D.ideas[0].ice_impact === 5 && D.ideas[0].spark_at);
r = exec('update_idea', { id: 'Referral', stage: 'develop', ice_impact: 9 });
t('update_idea moves stage', r.ok && D.ideas[0].stage === 'develop' && !!D.ideas[0].develop_at && D.ideas[0].ice_impact === 9);

r = exec('create_goal', { title: 'Run a marathon', category: 'Health', dueDate: 'in 6 months', milestones: ['5k', '10k', { label: 'Half', due: 'in 3 months' }], targetNumber: 42, unit: 'km' });
const ng = D.goals.find((x) => x.title === 'Run a marathon');
t('create_goal with milestones', r.ok && ng && ng.milestones.length === 3 && ng.milestones[2].due && ng.pct === 0 && ng.status === 'Active' && ng.targetNumber === 42);
const jBefore = D.journal.length;
r = exec('goal_checkin', { id: 'marathon', progress: 'Ran 8k today', pct: 15, blockers: 'knee', next: '10k' });
t('goal_checkin updates pct + journals it', r.ok && ng.pct === 15 && ng.checkIns.length === 1 && ng.pctHistory.length === 1 && D.journal.length === jBefore + 1 && D.journal[D.journal.length - 1].type === 'goal-checkin');
r = exec('update_goal', { id: ng.id, status: 'Paused' });
t('update_goal', r.ok && ng.status === 'Paused');

r = exec('create_habit', { title: 'Read 20 pages', cadence: 'Daily', category: 'Learning', targetTime: '9pm' });
const nh = D.habits.find((x) => x.title === 'Read 20 pages');
t('create_habit builds the app shape', r.ok && nh && nh.targetTime === '21:00' && nh.streak === 0 && Array.isArray(nh.completedDates) && nh.startedOn === today);
r = exec('habit_done', { id: 'Morning run' });
t('habit_done ticks today + streak', r.ok && D.habits[0].doneToday === true && D.habits[0].completedDates.includes(new Date().toISOString().slice(0, 10)));
t('habit_done idempotent', exec('habit_done', { id: 'Morning run' }).ok);

r = exec('journal_entry', { title: 'Good day', body: 'Shipped it.', mood: 4, energy: 'high', gratitude: 'team' });
const nj = D.journal.find((x) => x.title === 'Good day');
t('journal_entry maps mood 4 → 🙂', r.ok && nj && nj.mood === '🙂' && nj.date === today && nj.energy === 'high' && nj.gratitude === 'team' && typeof nj.habitsDone === 'number');

r = exec('add_transaction', { payee: 'Costco', amount: 42.5, category: 'groceries' });
t('add_transaction expense is negative + categorised', r.ok && D.finance.transactions[0].amount === -42.5 && D.finance.transactions[0].catId === 'groceries' && D.finance.transactions[0].date === today);
r = exec('add_transaction', { payee: 'Employer', amount: 3000, type: 'income', category: 'Salary', account: 'Checking' });
t('add_transaction income is positive + account resolved', r.ok && D.finance.transactions[1].amount === 3000 && D.finance.transactions[1].accountId === 'a1');
t('add_transaction unknown category errors with the list', !exec('add_transaction', { payee: 'x', amount: 1, category: 'Yachts' }).ok && /Existing/.test(exec('add_transaction', { payee: 'x', amount: 1, category: 'Yachts' }).error));
t('add_transaction rejects zero amount', !exec('add_transaction', { payee: 'x', amount: 0 }).ok);
r = exec('add_bill', { name: 'Internet', amount: 80, dueDay: 40, category: 'Housing' });
t('add_bill clamps dueDay to 28', r.ok && D.finance.bills[1].dueDay === 28 && D.finance.bills[1].active === true);
r = exec('pay_bill', { id: 'Rent' });
t('pay_bill logs the payment + stamps lastPaidYM', r.ok && D.finance.bills[0].lastPaidYM === today.slice(0, 7) && D.finance.transactions.some((x) => x.payee === 'Rent' && x.amount === -1500));
r = exec('set_budget', { category: 'Housing', amount: 1800 });
t('set_budget', r.ok && D.finance.budgets.housing === 1800);
r = exec('add_account', { name: 'Visa', type: 'credit', balance: -250, apr: 22.9 });
t('add_account abs balance + apr', r.ok && D.finance.accounts[1].balance === 250 && D.finance.accounts[1].apr === 22.9);
r = exec('add_savings_goal', { name: 'Japan trip', target: 8000, saved: 500, due: 'in 12 months' });
t('add_savings_goal', r.ok && D.finance.goals[0].target === 8000 && /^\d{4}-\d{2}-\d{2}$/.test(D.finance.goals[0].due));

r = exec('create_event', { title: 'Dentist', date: 'tomorrow', start: '3pm', location: 'Downtown' });
const ev = sandbox._calEvents.find((e) => e.title === 'Dentist');
t('create_event builds the calendar shape', r.ok && ev && ev.hour === 15 && ev.start === '15:00' && ev.end === '16:00' && /^\d{4}-\d{2}-\d{2}$/.test(ev.dateStr) && ev.color === 'var(--ac)');
r = exec('create_contact', { name: 'Priya Nair', company: 'Cedar', email: 'p@cedar.io', tags: 'client' });
t('create_contact', r.ok && D.contacts[0].company === 'Cedar' && D.contacts[0].enriched === false);
r = exec('create_opportunity', { name: 'Northwind renewal', accountName: 'Northwind', stage: 'Qualified', value: 5000, closeDate: 'end of month' });
t('create_opportunity', r.ok && D.opportunities[1].stage === 'Qualified' && D.opportunities[1].status === 'open' && D.opportunities[1].source === 'manual');
r = exec('update_opportunity', { id: 'Cedar', stage: 'Closed Won' });
t('update_opportunity Closed Won → status won + wonAt', r.ok && D.opportunities[0].status === 'won' && !!D.opportunities[0].wonAt);
t('update_opportunity unknown stage errors', !exec('update_opportunity', { id: 'Cedar', stage: 'Maybe' }).ok);

r = exec('create_widget', { title: 'Overdue by project', source: 'tasks', groupBy: 'project', metric: 'count', viz: 'donut', filter: [{ op: 'overdue' }], range: '30d' });
t('create_widget validates + pushes', r.ok && sandbox._reportWidgets.length === 1 && sandbox._reportWidgets[0].viz === 'donut' && sandbox._reportWidgets[0].range === '30d');
t('create_widget bad viz falls back to bar', exec('create_widget', { title: 'x', source: 'nope', viz: 'pie' }).ok && sandbox._reportWidgets[1].viz === 'bar' && sandbox._reportWidgets[1].source === 'tasks');
r = exec('save_report', { name: 'Weekly standup' });
t('save_report snapshots widgets', r.ok && D.prefs.savedReports[0].widgets.length === 2);
r = exec('run_report', { name: 'weekly' });
t('run_report opens a saved report', r.ok && sandbox.curScreen === 'reports');
r = exec('run_report', { name: 'Monthly summary' });
t('run_report opens a Money report', r.ok && sandbox.curScreen === 'money' && sandbox._finRepOpen === 'monthly-summary' && sandbox._finTab === 'reports');
t('run_report unknown lists what exists', /Weekly standup/.test(exec('run_report', { name: 'nothing' }).error));
r = exec('report_data', {});
t('report_data returns widget numbers', r.ok && r.data.length === 2 && r.data[0].data.values[0] === 1);

r = exec('link', { fromType: 'task', fromId: 1, toType: 'note', toId: 'Meeting with Priya' });
t('link task↔note both directions', r.ok && D.tasks[0].linkedNoteIds.includes(40) && D.notes[0].linkedTaskIds.includes(1));
r = exec('link', { fromType: 'goal', fromId: 'Ship v1', toType: 'task', toId: 1 });
t('link goal↔task', r.ok && D.tasks[0].linkedGoalId === 20 && D.goals[0].linkedTaskIds.includes(1));
r = exec('link', { fromType: 'project', fromId: 'Beta', toType: 'program', toId: 'Growth' });
t('link project↔program', r.ok && D.programs[0].projectIds.includes(12));
t('link unsupported pair errors', !exec('link', { fromType: 'habit', fromId: 30, toType: 'note', toId: 40 }).ok);

r = exec('navigate', { page: 'tasks' });
t('navigate', r.ok && sandbox.curScreen === 'tasks');
t('navigate unknown page errors', !exec('navigate', { page: 'nowhere' }).ok);
r = exec('set_detail_level', { level: 2 });
t('set_detail_level', r.ok && D.prefs.workspace.level === 2);
t('show_page refuses core pages', !exec('show_page', { page: 'home', on: false }).ok);
t('show_page hides a page', exec('show_page', { page: 'money', on: false }).ok && D.prefs.workspace.money === false);

const st = exec('status', {});
t('status digest has the sections', st.ok && st.data.tasks.overdueCount === 1 && st.data.tasks.overdue[0].id === 3 && st.data.capacity.freeMins === 300 && st.data.habits.total === 2 && st.data.money.overBudget[0].cat === 'Groceries' && st.data.projects.withoutNextAction.length > 0);
r = exec('search', { query: 'pricing' });
t('search returns ids', r.ok && r.data[0].type === 'note' && r.data[0].id === 40);
r = exec('help', { query: 'weekly review' });
t('help retrieves', r.ok && /weekly review/i.test(r.data));
for (const ent of ['tasks', 'projects', 'programs', 'goals', 'habits', 'notes', 'ideas', 'contacts', 'opportunities', 'mindmaps', 'journal', 'events', 'bills', 'accounts', 'transactions', 'budgets', 'savings', 'reports', 'pages', 'widgets']) {
  const lr = exec('list', { entity: ent });
  if (!lr.ok) t('list ' + ent, false, lr.error);
}
t('list every entity works', true);
t('list tasks overdue filter', exec('list', { entity: 'tasks', filter: 'overdue' }).data.rows.length === 1);
t('list unknown entity errors', !exec('list', { entity: 'unicorns' }).ok);
r = exec('get', { entity: 'project', id: 'Q4 Launch' });
t('get project includes its tasks', r.ok && r.data.tasks.length === 2 && r.data.name === 'Q4 Launch');
t('get strips heavy fields', !('bodyHtml' in exec('get', { entity: 'note', id: nn.id }).data));

// ── 6. delete + undo ───────────────────────────────────────────────────────
const before = D.tasks.length;
r = exec('delete', { entity: 'task', id: 'Call the bank' });
t('delete removes', r.ok && D.tasks.length === before - 1 && !D.tasks.some((x) => x.id === 3));
t('undo restores the deleted task', sandbox._agentUndoById(r.undo) && D.tasks.some((x) => x.id === 3));
t('undo twice is a no-op', sandbox._agentUndoById(r.undo) === false);
const cr = exec('create_task', { title: 'Temp' });
t('undo create removes it', sandbox._agentUndoById(cr.undo) && !D.tasks.some((x) => x.title === 'Temp'));
const snapTitle = D.tasks[0].title;
const ur = exec('update_task', { id: 1, title: 'Renamed' });
t('undo update restores the snapshot', D.tasks[0].title === 'Renamed' && sandbox._agentUndoById(ur.undo) && D.tasks[0].title === snapTitle);
const dr = exec('delete', { entity: 'bill', id: 'Internet' });
t('delete bill + undo', dr.ok && D.finance.bills.length === 1 && sandbox._agentUndoById(dr.undo) && D.finance.bills.length === 2);
t('every write saved something', saved.length > 30, saved.length + ' save() calls');
t('unknown tool errors with the list', !exec('teleport', {}).ok && /Available/.test(exec('teleport', {}).error));

// ── 7. the send loop ───────────────────────────────────────────────────────
const msgs = D.prefs.aiChat.messages;
msgs.length = 0; trpcCalls.length = 0;
// (a) read action runs instantly and results are relayed, then model finishes
trpcScript = [
  { say: 'Let me look.', actions: [{ tool: 'list', args: { entity: 'tasks', filter: 'overdue' } }], next: 'continue' },
  { say: 'You have one overdue task.', next: 'wait' },
];
await sandbox._agentSend('what is overdue?');
t('loop: read runs instantly', msgs[1].actions && msgs[1].actions[0].ok === true && !msgs[1].pending);
t('loop: results relayed as a hidden turn', msgs[2].role === 'user' && msgs[2].tool === true && /TOOL RESULTS/.test(msgs[2].content));
t('loop: second call sees the results', trpcCalls.filter((c) => c.proc === 'ai.agent').length === 2 && trpcCalls[1].input.messages.some((m) => /TOOL RESULTS/.test(m.content)));
t('loop: final answer stored', msgs[3].content === 'You have one overdue task.');
t('loop: payload within server caps', trpcCalls.every((c) => c.proc !== 'ai.agent' || (c.input.system.length <= 16000 && c.input.messages.every((m) => m.content.length <= 6000))));

// (b) write action waits for approval; approving runs it
msgs.length = 0; trpcCalls.length = 0;
trpcScript = [
  { say: 'I will add that.', actions: [{ tool: 'create_task', args: { title: 'Approved task' } }], next: 'wait' },
  { say: 'Done.', next: 'wait' },
];
const pending = sandbox._agentSend('add a task called Approved task');
await new Promise((r) => setTimeout(r, 20));
t('loop: write is held pending', !!msgs[1].pending && msgs[1].pending.length === 1 && !D.tasks.some((x) => x.title === 'Approved task'));
sandbox._agentConfirm(1, true);
await pending;
t('loop: approval runs the write', D.tasks.some((x) => x.title === 'Approved task') && msgs[1].actions[0].ok === true && msgs[1].pending === null);

// (c) skip is honoured and the model is told once
msgs.length = 0; trpcCalls.length = 0;
trpcScript = [{ say: 'Delete it?', actions: [{ tool: 'delete', args: { entity: 'task', id: 1 } }], next: 'continue' }];
const p2p = sandbox._agentSend('delete task 1');
await new Promise((r) => setTimeout(r, 20));
sandbox._agentConfirm(1, false);
await p2p;
t('loop: skip leaves data untouched', D.tasks.some((x) => x.id === 1) && msgs[1].actions[0].skipped === true);
t('loop: skip does not call the model again', trpcCalls.filter((c) => c.proc === 'ai.agent').length === 1 && /skipped/.test(msgs[2].content));

// (d) autoWrite runs writes without a card, deletes still ask
msgs.length = 0; trpcCalls.length = 0; D.prefs.aiAgent = { autoWrite: true };
trpcScript = [{ say: 'ok', actions: [{ tool: 'create_task', args: { title: 'Auto task' } }, { tool: 'delete', args: { entity: 'task', id: 'Auto task' } }], next: 'wait' }];
const p3p = sandbox._agentSend('add and delete');
await new Promise((r) => setTimeout(r, 20));
t('loop: autoWrite runs creates, delete still pending', D.tasks.some((x) => x.title === 'Auto task') && msgs[1].pending && msgs[1].pending[0].tool === 'delete');
sandbox._agentConfirm(1, false); await p3p; D.prefs.aiAgent = {};

// (e) "continue" is bounded
msgs.length = 0; trpcCalls.length = 0;
trpcScript = Array.from({ length: 12 }, () => ({ say: 'again', actions: [{ tool: 'status', args: {} }], next: 'continue' }));
await sandbox._agentSend('loop forever');
t('loop: continue is bounded', trpcCalls.filter((c) => c.proc === 'ai.agent').length <= 6, trpcCalls.filter((c) => c.proc === 'ai.agent').length + ' calls');

// (f) old server without ai.agent → answer-only fallback
msgs.length = 0; trpcCalls.length = 0;
trpcScript = [new Error('No "mutation"-procedure on path "ai.agent"')];
await sandbox._agentSend('hello');
t('fallback: degrades to ai.assist', msgs[1].fallback === true && msgs[1].content === 'fallback answer' && trpcCalls.some((c) => c.proc === 'ai.assist'));

// (g) provider failure is reported truthfully
msgs.length = 0; trpcCalls.length = 0;
trpcScript = [new Error('OpenAI error 401: bad key')];
await sandbox._agentSend('hello');
t('error: provider failure surfaces', /couldn.t reach|bad key/.test(msgs[1].content));

// (h) transcript turns stay within budget
msgs.length = 0;
for (let i = 0; i < 40; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', content: 'y'.repeat(4000), ts: 1 });
const turns = sandbox._agentTurnsForModel();
t('transcript: capped turns + clamped length', turns.length <= 16 && turns.every((m) => m.content.length <= 2600));

console.log(failed ? `\n${failed} FAILED` : '\nAI agent holds.');
process.exit(failed ? 1 : 0);
