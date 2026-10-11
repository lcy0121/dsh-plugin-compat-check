// 合成负例：不 inject 任何东西 → 条目 ACTIVE。
// 它测的是**另一个方向**：工具不该对它报 fatal。
export function apply(ctx) {
  ctx.effect(() => {});
}
