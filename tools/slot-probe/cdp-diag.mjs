const [port, target] = [process.argv[2], process.argv[3]]
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const ev = []
ws.addEventListener('message', e => { const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method) ev.push(m) })
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, r => res(r.result ?? r.error)); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const evalx = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value
await send('Runtime.enable'); await send('Page.enable')
await send('Page.navigate', { url: target })
await new Promise(r => setTimeout(r, 19000))
const d = await evalx('window.__COMPAT_SLOTSPEC__ || null')
if (!d) { console.log('没有拿到 SLOTSPEC'); }
else {
  console.log('slots 服务只读 API:', JSON.stringify(d.__api))
  console.log('有 spec() =', d.__hasSpec, ' 有 entries() =', d.__hasEntries, ' 有 entriesOfSlot() =', d.__hasEntriesOfSlot)
  console.log('')
  console.log('槽位'.padEnd(42) + 'declared  kind/scope   entries')
  for (const [k, v] of Object.entries(d)) {
    if (k.startsWith('__')) continue
    console.log(String(k).padEnd(42) + String(v.declared).padEnd(10) + String((v.kind||'-') + '/' + (v.scope||'-')).padEnd(14) + String(v.entries))
  }
}
const exc = ev.filter(e => e.method === 'Runtime.exceptionThrown').length
console.log('\n异常数 =', exc)
for (const e of ev) if (e.method === 'Runtime.consoleAPICalled') {
  const t = e.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')
  if (t.includes('DIAG') || t.includes('INJECT-THREW')) console.log('  ' + t.slice(0, 400))
}
ws.close()
