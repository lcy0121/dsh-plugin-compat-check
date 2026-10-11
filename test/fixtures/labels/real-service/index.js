// 合成负例之二：`inject` 一个**真实存在**的宿主服务（`settings`）→ 条目 ACTIVE。
//
// 它与 `@label/broken-service` 构成**方向相反**的对照：
//   前者测召回（该报 fatal 时有没有报）
//   后者测精确（不该报 fatal 时有没有乱报）
//
// ⚠️ 关键在于：两者的真值**都来自宿主**（fiber state），不是我"期望"出来的。
// 如果真值来自期望，那就是自己给自己打分。
export const inject = ['settings'];
export function apply(ctx) {
  ctx.effect(() => {});
}
