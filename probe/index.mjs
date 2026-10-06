/**
 * dsh-plugin-compat-check 通用探针
 * ---------------------------------------------------------------------------
 * 为什么需要它：插件的 package.json 只声明「依赖哪些服务」（peerDependencies /
 * dsh.client.inject），无法告诉你宿主**实际**提供了什么。而这个生态里同一版本号
 * 下 API 被移除是常态（例：0.2.0 移除了 ctx.settings.register）。光看声明会误判。
 *
 * 做法：装进一个临时 profile，真实启动一次，把插件用到的每个服务连**原型链上的
 * 方法**一起 dump 出来，供编排脚本与插件源码里的实际调用点逐一比对。
 *
 * 刻意不声明 inject：保证自己一定激活，不因缺服务而卡在 PENDING。
 * 立刻写 applied 标记（失败也要留痕），延迟后写正式报告。
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const name = 'dsh-plugin-compat-check-probe';

const WORKDIR = '/tmp/dsh-plugin-compat-check';
const SERVICES_FILE = `${WORKDIR}/services.json`;
const APPLIED = `${WORKDIR}/probe-applied.txt`;
const REPORT = `${WORKDIR}/probe-report.json`;

const MAX_METHODS = 200;

function w(file, text) {
  try {
    writeFileSync(file, text);
  } catch {
    /* 尽力而为：探针自身绝不能影响宿主启动 */
  }
}

/** 连原型链一起枚举，返回 { 方法名: 类型 } —— 这是本次踩坑换来的关键修正 */
function dumpShape(svc) {
  const methods = {};
  const data = {};
  let obj = svc;
  const seen = new Set();
  let guard = 0;
  while (obj && obj !== Object.prototype && guard++ < 12) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'constructor' || seen.has(key)) continue;
      seen.add(key);
      let t;
      try {
        t = typeof svc[key];
      } catch (e) {
        t = 'unreadable:' + (e && e.message ? e.message : e);
      }
      if (t === 'function') {
        if (Object.keys(methods).length < MAX_METHODS) methods[key] = t;
      } else {
        try {
          const v = svc[key];
          if (v === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof v)) {
            data[key] = v === undefined ? 'undefined' : v;
          }
        } catch {
          /* 忽略不可读属性 */
        }
      }
    }
    obj = Object.getPrototypeOf(obj);
  }
  return { methods, data };
}

function readWanted() {
  try {
    const parsed = JSON.parse(readFileSync(SERVICES_FILE, 'utf8'));
    if (Array.isArray(parsed.services) && parsed.services.length > 0) return parsed.services;
  } catch {
    /* 缺失/损坏则用默认集合 */
  }
  return ['settings', 'agents', 'jobs', 'webServer', 'session', 'tools', 'llm', 'subprocess'];
}

export function apply(ctx) {
  w(APPLIED, 'apply() ok @ ' + new Date().toISOString() + '\n');

  setTimeout(() => {
    const report = {
      probeVersion: 2,
      probedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      wanted: [],
      root: {},
      scoped: {},
    };

    const wanted = readWanted();
    report.wanted = wanted;

    for (const n of wanted) {
      try {
        const svc = ctx.get(n);
        if (svc === undefined) {
          report.root[n] = { present: false };
        } else {
          const shape = dumpShape(svc);
          report.root[n] = { present: true, methods: shape.methods, data: shape.data };
        }
      } catch (e) {
        report.root[n] = { present: false, error: String(e && e.message ? e.message : e) };
      }
    }

    // 作用域上下文（ctx.inject 拿到的那种）是否也能看见同样的服务
    try {
      if (typeof ctx.inject === 'function') {
        ctx.inject(wanted, (sctx) => {
          for (const n of wanted) {
            try {
              const svc = sctx[n] ?? sctx.get?.(n);
              if (svc === undefined) {
                report.scoped[n] = { present: false };
              } else {
                const shape = dumpShape(svc);
                report.scoped[n] = { present: true, methods: shape.methods };
              }
            } catch (e) {
              report.scoped[n] = { present: false, error: String(e && e.message ? e.message : e) };
            }
          }
          w(REPORT, JSON.stringify(report, null, 2));
        });
      } else {
        report.scopedError = 'ctx.inject 不是函数';
        w(REPORT, JSON.stringify(report, null, 2));
      }
    } catch (e) {
      report.scopedError = String(e && e.message ? e.message : e);
      w(REPORT, JSON.stringify(report, null, 2));
    }

    // 兜底：即使 scoped 回调没触发，也要留下一份 root 报告
    setTimeout(() => {
      try {
        readFileSync(REPORT);
      } catch {
        w(REPORT, JSON.stringify(report, null, 2));
      }
    }, 4000);
  }, 4000);
}
