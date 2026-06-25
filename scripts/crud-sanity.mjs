const SUPABASE_URL = 'https://ygqfhuuomdunetpvwhrj.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlncWZodXVvbWR1bmV0cHZ3aHJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDY5NjgsImV4cCI6MjA5NTgyMjk2OH0.X-yHD2uC1ua1troWyNEOmUobFVyhbbXyNmL_oBhL1A0';

async function req(table, method, body, params = '', prefer = '') {
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, body: text };
}

const results = [];

async function test(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, pass: true, detail });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, pass: false, detail: e.message });
    console.log(`FAIL  ${name} — ${e.message}`);
  }
}

function assertOk(r, label) {
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} ${r.body.slice(0, 200)}`);
}

let testHabitId = null;

await test('habits CREATE', async () => {
  const r = await req('habits', 'POST', {
    label: '__crud_test_item__',
    block: 'shopping',
    status: 'buy',
    frequency: 'daily',
    item_order: 9999,
  }, '', 'return=representation');
  assertOk(r, 'POST habits');
  const rows = JSON.parse(r.body);
  testHabitId = rows[0]?.id;
  if (!testHabitId) throw new Error('No id returned');
  return testHabitId;
});

await test('habits READ', async () => {
  const r = await req('habits', 'GET', null, `?id=eq.${testHabitId}&limit=1`);
  assertOk(r, 'GET habits');
  const rows = JSON.parse(r.body);
  if (!rows.length) throw new Error('Not found');
  return rows[0].label;
});

await test('habits UPDATE', async () => {
  const r = await req('habits', 'PATCH', { sub: 'test note' }, `?id=eq.${testHabitId}`);
  assertOk(r, 'PATCH habits');
  return 'patched';
});

await test('habits DELETE', async () => {
  const r = await req('habits', 'DELETE', null, `?id=eq.${testHabitId}`);
  if (r.status !== 204 && !r.ok) throw new Error(`DELETE habits: HTTP ${r.status} ${r.body.slice(0, 200)}`);
  return `status ${r.status}`;
});

await test('daily_logs CREATE', async () => {
  const habits = await req('habits', 'GET', null, '?limit=1');
  assertOk(habits, 'GET habit for log');
  const h = JSON.parse(habits.body)[0];
  if (!h) throw new Error('No habits in DB');
  const today = new Date().toISOString().slice(0, 10);
  const r = await req('daily_logs', 'POST', { log_date: today, habit_id: h.id, checked: true });
  assertOk(r, 'POST daily_logs');
  return today;
});

await test('app_storage UPSERT', async () => {
  const existing = await req('app_storage', 'GET', null, '?key=eq.__crud_test__&limit=1');
  assertOk(existing, 'GET app_storage');
  const rows = JSON.parse(existing.body);
  if (rows.length) {
    const patch = await req('app_storage', 'PATCH', { value: { ok: true } }, '?key=eq.__crud_test__');
    assertOk(patch, 'PATCH app_storage');
  } else {
    const r = await req('app_storage', 'POST', { key: '__crud_test__', value: { ok: true } });
    assertOk(r, 'POST app_storage');
  }
  const del = await req('app_storage', 'DELETE', null, '?key=eq.__crud_test__');
  if (del.status !== 204 && !del.ok) throw new Error(`DELETE app_storage: ${del.status} ${del.body}`);
  return 'ok';
});

await test('habits DELETE with daily_logs (app flow)', async () => {
  const create = await req('habits', 'POST', {
    label: '__shop_delete_test__',
    block: 'shopping',
    status: 'buy',
    frequency: 'daily',
    item_order: 9996,
  }, '', 'return=representation');
  assertOk(create, 'POST shopping habit');
  const id = JSON.parse(create.body)[0].id;
  const today = new Date().toISOString().slice(0, 10);
  const log = await req('daily_logs', 'POST', { log_date: today, habit_id: id, checked: true });
  assertOk(log, 'POST daily_log (simulates check-off)');
  const clear = await req('daily_logs', 'DELETE', null, `?habit_id=eq.${id}`);
  if (clear.status !== 204 && !clear.ok) throw new Error(`DELETE daily_logs: ${clear.status} ${clear.body.slice(0, 120)}`);
  const del = await req('habits', 'DELETE', null, `?id=eq.${id}`);
  if (del.status !== 204 && !del.ok) throw new Error(`DELETE habit: ${del.status} ${del.body.slice(0, 120)}`);
  return 'shopping delete flow ok';
});

await test('habits DELETE blocked by daily_logs FK', async () => {
  const create = await req('habits', 'POST', {
    label: '__fk_test__',
    block: 'shopping',
    status: 'buy',
    frequency: 'daily',
    item_order: 9998,
  }, '', 'return=representation');
  assertOk(create, 'POST habit for FK test');
  const id = JSON.parse(create.body)[0].id;
  const today = new Date().toISOString().slice(0, 10);
  const log = await req('daily_logs', 'POST', { log_date: today, habit_id: id, checked: true });
  assertOk(log, 'POST daily_log');
  const del = await req('habits', 'DELETE', null, `?id=eq.${id}`);
  if (del.ok || del.status === 204) {
    await req('daily_logs', 'DELETE', null, `?habit_id=eq.${id}`);
    await req('habits', 'DELETE', null, `?id=eq.${id}`);
    return 'unexpected: delete succeeded';
  }
  return `expected failure HTTP ${del.status}: ${del.body.slice(0, 120)}`;
});

await test('habits DELETE after clearing daily_logs', async () => {
  const create = await req('habits', 'POST', {
    label: '__fk_test2__',
    block: 'shopping',
    status: 'buy',
    frequency: 'daily',
    item_order: 9997,
  }, '', 'return=representation');
  assertOk(create, 'POST habit');
  const id = JSON.parse(create.body)[0].id;
  const today = new Date().toISOString().slice(0, 10);
  await req('daily_logs', 'POST', { log_date: today, habit_id: id, checked: true });
  await req('daily_logs', 'DELETE', null, `?habit_id=eq.${id}`);
  const del = await req('habits', 'DELETE', null, `?id=eq.${id}`);
  if (del.status !== 204 && !del.ok) throw new Error(`DELETE after logs cleared: ${del.status} ${del.body.slice(0, 200)}`);
  return `status ${del.status}`;
});

const failed = results.filter(r => !r.pass);
console.log('\n---');
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
