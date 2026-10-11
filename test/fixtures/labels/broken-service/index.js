// 合成正例（**已知会**起不来，而且真值由 loader 给，不由人给）。
//
// `inject` 里点名一个谁都不提供的服务 → 宿主条目停在 PENDING。
// 于是：
//   真值 = PENDING（loader 自己说的，`fiber.state`）
//   工具的期望 = fatal（"条目会停在 pending"）
// 两者对上 → 这条 fatal 是真的（true positive）。
//
// 为什么需要"合成"正例：本机两个真实 profile 上 **0 个 PENDING / 0 个 FAILED**
// —— 一个正例都没有，召回率根本无从谈起。而引入真实坏插件又不可控。
// 合成正例是**自动标注**能走通的那条路：真值仍然来自宿主，只是"病例"由我们安排。
export const inject = ['noSuchServiceAnywhere'];
export function apply(ctx) {
  ctx.effect(() => {});
}
