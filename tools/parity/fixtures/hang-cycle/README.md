# 回归 fixture：无界循环

3个JS文件使用**无扩展名**的相对导入；`b.js`指向`a.js`，`a.js`自导入形成自环：

```
index.js → b   (b.js)
b.js     → a   (a.js)
a.js     → a   (a.js)
```

修复前，`local_graph` 会在这里无界膨胀（实测队列涨到 32 万条、`seen` 只有 8 个文件，
98% CPU 空转不停）。真实触发者是打包了 undici 的插件，例如 `@liustack/modlens`。

跑法：

```
parity_out="$(mktemp -d)"
bash tools/parity/parity.sh tools/parity/fixtures/hang-cycle/node_modules "$parity_out/single"
bash tools/parity/parity.sh tools/parity/fixtures "$parity_out/all"  # 展开子目录；输出均在私有目录
```

⚠️ **这条例程曾经是假通过。** 原来包直接放在 `demo/` 下，而 `parity.sh` 期待参数是
**node_modules 根**（真正的包要在它下面一层）。于是这个命令比对了**空集合**，
打印 `manifests=0 服务=0` 加一个 `✓ 严格项一致`，退出码 0。
一个从未真正执行的检查与一个通过的检查，在输出上没有区别 —— 所以现在：

  - 目录改成 `node_modules/demo/`，命令直接就能用；
  - `parity.sh` 增加了「比到 0 个包就直接失败」的守卫，这类假通过不会再发生。

这是旧Python参考与当前Node实现的回归夹具，不是AST分析正确性的真值。修改相关源码图逻辑后检查循环能终止、实际发现1个包，并审查差异；有意语义变化不能仅靠Python一致性否决。
