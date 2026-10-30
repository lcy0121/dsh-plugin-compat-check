export const REASONING_SLOT_NOTICE =
  "普通渲染、翻译及未翻译视图使用 text；需要原始模型输出才使用 rawText。Content Factory 仍接收 text/running/labels，不重复处理显示文本；回调 props 用途、普通/签名流式/完成态未验证，不证明业务失败。";
export const SLOT_UNKNOWN_NOTICE =
  "槽位目标未能静态确定；动态、展开、访问器或逃逸值不证明槽位身份，回调 props 未验证。";
export const SLOT_UNREVIEWED_NOTICE =
  "槽位语义未审查；不借用邻近版本的 text/rawText 契约，回调 props 未验证。";

/** Presentation-only follow-up checks. Never changes a finding or performs work. */
export function nextSteps(finding) {
  if (!finding || typeof finding !== "object") return [];
  switch (finding.category) {
    case "client-entry-missing":
      return [
        '检查该插件 package.json 的 dsh.client 与 exports["./client"] 客户端入口声明，并在实际安装制品中核对入口文件是否存在、可读且已随包交付。',
        "把已装插件的精确版本与制品文件清单对照；如需作者处理，提供缺失入口的包内相对位置，不猜测修复版本。",
        "补充同一目标的浏览器加载结果，并实际操作客户端功能、核验实际功能结果；静态入口发现不等于业务失败已实测。",
      ];
    case "declared-incompatible":
      return [
        "复核已装插件 package.json 的 engines.dsh 与官方 peerDependencies、字段格式及目标 DSH 版本；按报告所用声明策略核对生效字段。",
        "只读核对目标 profile 的 compatibility.json 是否有该插件名、插件精确版本与目标 DSH 精确版本的记录；未观测或未授予不等于可自行添加豁免。",
        "补充该目标的实际加载与功能结果；声明冲突不证明已经实际加载失败，豁免也不证明业务通过。",
      ];
    case "host-entry-inactive": {
      const state = finding.evidence?.state;
      const step =
        state === "FAILED"
          ? "定位该包对应的 FAILED loader 条目，先在本机查看失败原因与同次启动日志，核对导入、初始化失败发生在哪一步。"
          : state === "PENDING"
            ? "定位该包对应的 PENDING loader 条目，核对顶层必需 inject 与各依赖服务的提供者是否在同一宿主实际激活。"
            : "在同一目标宿主重新读取该包映射的 loader 条目状态，核对条目身份、启用状态与采样时间，不从说明文本猜测状态。";
      return [
        step,
        "补充同一 profile、DSH 版本和时间的服务观测及 loader 状态；LOADING、禁用或无法映射的条目不能代替 FAILED 或 PENDING 证据。",
        "服务或条目状态恢复后仍需实际操作对应功能并核验结果；激活成功不能代替业务验收。",
      ];
    }
    case "unprovided-dependency": {
      const absent = finding.evidence?.status === "absent";
      const steps = [
        absent
          ? "核对本次明确 absent 的服务观测是否属于同一 profile、DSH 版本与依赖作用域，并查看该服务的提供者是否实际激活。"
          : "该依赖仍待确认：补充同一 profile、DSH 版本与有效采样时间的服务观测；省略键或未采样不能确认服务缺失，也不能确认插件挂起。",
        finding.evidence?.hardInject === true
          ? "在报告给出的源码位置检查顶层必需 inject 与激活前提，再对照实际 loader 状态；依赖声明本身不能证明已经挂起。"
          : "在报告给出的源码位置区分可选或子作用域依赖与顶层硬依赖；不推断整个插件挂起，实际操作相关功能核验影响。",
      ];
      if (finding.evidence?.status === "unreadable")
        steps.push(
          "先在本机核对采样读取失败原因；只补安全的结构观测，不执行 getter 来消除未知。",
        );
      steps.push(
        "核对服务提供者的包声明与实际运行状态；提供声明只是线索，不自动安装依赖或认定某包能提供该服务。",
      );
      return steps;
    }
    case "host-service-missing":
      return [
        "在报告给出的源码位置核对服务读取及必需 inject 的作用域，并确认 absent 观测绑定同一 profile、DSH 版本与采样时间。",
        "核对该服务的实际提供者及 loader 状态，补充相关功能操作结果；服务缺失的推断影响不等于业务失败已实测。",
      ];
    case "api-argument-invalid":
    case "api-option-unsupported":
      return [
        "按源码位置核对选项类型、枚举、实际传值和精确目标版本，查阅 evidence 中固定源码及归档摘要；方法存在或能力守卫不证明参数有效。",
        "在独立目标会话核验草稿保留、替换或追加；本项仅是静态参数风险，不证明业务失败，也不自动修改或提交草稿。",
      ];
    case "host-method-missing":
      return [
        "在报告给出的文件与行号核对实际方法调用、Context 绑定及能力守卫，检查是否存在报告尚未识别的兜底。",
        "补充同一目标服务的完整方法结构观测，区分目录线索、未采样方法与明确缺失；实际操作对应功能核验推断影响。",
        "需要替代 API 时先查该目标版本的源码或官方契约并保留出处；本报告不猜测替代方法或修复版本。",
      ];
    case "declaration-mismatch":
      return [
        "对照已装插件的兼容声明、精确目标版本及报告中的具体 API 发现，分别核对声明范围与运行时证据。",
        "在已有源码位置检查调用与守卫，并补充同一目标的服务观测和实际功能结果；声明放行不证明业务通过。",
      ];
    default:
      return [
        "先核对该发现的类别、依据、已有包内位置和目标版本；缺少位置或状态时保留待确认，不补造证据。",
        "补充同一 profile、DSH 版本与采样时间的相关观测，再实际操作对应功能核验影响；不根据未知类别猜测修复。",
      ];
  }
}
