# dsh-plugin-compat-check

**설치된 DSH 플러그인**과 대상 DSH 버전의 호환성을 검사하고 소스 위치, 근거, 증거 범위를 제공합니다. 선언 통과나 활성화 성공만으로 모든 기능의 정상 동작을 보장하지 않습니다.

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 버전과 배포

저장소는 **0.1.3 후보(미배포)**이며 rc.2 선언 판정, 버전별 카탈로그, 비활성화 정리 수정을 포함합니다. npm latest는 **0.1.2**입니다(2026-10-17 다운로드·설치 검증, 알고리즘은 0.1.1과 동일). 현재 소스·skill·문서 수정은 공개 tarball에 없습니다. [Plan](docs/Plan.md)과 [검증 범위·통계](docs/current-state.json)를 참고하세요. Node `^22.19.0 || >=24`를 지원합니다.

| 진입점 | 역할 |
|---|---|
| npm 플러그인 | 호스트 관측, 호환성 탭, 플러그인별 발견·배지, `compat_check`, skill provider; 설치 전 검사는 불가 |
| 저장소 CLI | 설치된 패키지 정적 검사; 기존 관측 파일 또는 명시적 임시 호스트 검사 |
| 저장소 설치 검사 | spec을 임시 profile에 설치해 설치·시작·호환성 확인 |
| skill | 등록된 도구 또는 저장소 CLI 사용 방법 안내 |

하나의 판정 커널을 공유합니다. **입력과 관측 증거가 같을 때만** 동일한 결과를 기대할 수 있습니다. npm 패키지에는 CLI `bin`이 없어 `npx dsh-plugin-compat-check`를 사용할 수 없습니다. 클라이언트 도착 검사는 별도 개발 도구이며 패널 기능이나 전체 UI 검증이 아닙니다.

## 어떻게 보이는가

다음은 저장소에 기록된 상세 페이지 스크린샷이며 전체 호환성 인증이 아닙니다. API 발견에는 실제 소스 위치를 표시할 수 있지만 선언·loader 사실은 위치 없이 근거를 설명할 수 있습니다.

![플러그인 상세 페이지: 부분 사용 가능, file:line·영향·근거 포함](plugin/assets/compat-detail-partial.png)

![선언 충돌 예시: 도구 추론과 호스트 경고를 구분](plugin/assets/compat-detail-declared.png)

## 사용법

### 저장소 CLI

저장소는 공통 판정 소스와 루트 개발 워크스페이스를 제공하며 npm에는 plugin 패키지만 포함됩니다. 저장소를 받은 뒤 루트에서 의존성을 설치하세요:

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts

node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --probe /path/to/probe-report.json --dsh-version <version> --no-baseline --json
node bin/compat-check.mjs --help
```

실제 profile을 선택하세요. desktop을 기본으로 가정하지 않습니다. `--nm`은 profile 또는 node_modules 디렉터리를 받습니다. 런타임 관측이 없으면 메서드 판정은 suspected입니다. 관측 파일이 있어도 신원·시간·완전성·소스 귀속에 따라 certain이 아닐 수 있습니다.

| 옵션 | 기능 |
|---|---|
| `--nm <dir>` | 검사 대상 디렉터리, 필수 |
| `--probe <json>` | 기존 관측 파일; `--probe-boot`보다 우선 |
| `--probe-boot` | 명시적으로 profile 복사, probe 설치, 임시 호스트 시작; 대상 플러그인 실행 |
| `--probe-timeout <초>` / `--probe-keep-dir <dir>` | 시작 제한 기본40초; 명시적 비공개 디렉터리에 현장 보존 |
| `--dsh-version <v>` | 선언·카탈로그 선택 대상 버전; 명시 값은 시작 관측 버전보다 우선 |
| `--rules <json>` / `--catalog <json>` | 규칙 및 API 카탈로그 지정 |
| `--no-baseline` | 기준선 읽기·쓰기 비활성화 |
| `--baseline-file <path>` / `--dry-run` | 기준선 지정; 쓰지 않고 비교 |
| `--json` / `--quiet` | JSON 문서 하나; 또는 요약만 출력 |
| `--issue-report` | 기본 비식별 Markdown 보고서; 기준선 읽기/쓰기 없음; `--json`/`--quiet`와 상호 배타적 |
| `--version` / `--help` | 버전·도움말, 대상 불필요 |

공유 보고서는 `node bin/compat-check.mjs --nm <대상> --issue-report > issue-report.md`로 생성합니다. 버전, 관측 모드, 발견, 가능한 패키지 상대 위치, certainty/impactBasis, 범위와 자리표시자 재현 명령을 보존합니다. 원시 로그/프로브, 절대 경로와 기준선은 제외하며 경로·링크·일반 자격 증명·제어 문자가 있는 설명은 전체를 숨깁니다. 패키지 이름과 상대 파일명은 남고 임의의 업무 텍스트에는 민감 정보가 있을 수 있으므로 공유 전에 미리 확인하세요. 종료 코드는 0/1/2/3이며 필요하면 바로 다음 명령에서 `report_status=$?`로 저장하세요. 이 옵션은 현재 저장소 소스에만 있으며 npm 플러그인에는 CLI가 없습니다.

### 플러그인과 skill

```bash
# npm 배포 버전 설치 (2026-10-17 확인: 0.1.2)
dsh plugin --profile <profile> add dsh-plugin-compat-check

# CLI 사용자의 독립 skill
./dsh-plugin-compat-check.sh --install-skill
```

플러그인은 호환성 패널, 상세 배지, `compat_check`, skill provider를 등록합니다. 2026-10-15에 실제 tarball을 macOS arm64의 DSH0.2.0-rc.2에 설치하고 도구·skill 호출 및 실제 Chrome의 패널·배지·기준선 변화를 검증했습니다. 독립 skill은 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`에 설치되며 기존 파일 덮어쓰기는 `--force`가 필요합니다.

rc.2 경로는 더 보기 → 설정 → 내장 플러그인 → 호환성입니다. 2026-10-18에 0.1.3 후보 tarball, 전용 rc.2 호스트와 실제 Chrome으로 탭·보고서, 비활성화/재활성화 시 경로 제거·복구 및 탭 하나 유지를 확인했습니다. 10월17일의 탭 미표시 기록은 이번에 재현되지 않았으며 당시 원인이나 전체 업무 기능을 인증하지는 않습니다.

저장소 루트는 **비공개 개발 워크스페이스**이며 설치 가능한 DSH bundle이 아닙니다. 루트 GitHub spec은 `plugin/` 설치와 같지 않습니다. 소스 검사 시 루트에서 `npm ci --ignore-scripts`를 실행하고 `plugin/`에서 `npm pack --pack-destination <이미있는절대출력경로>`를 실행한 뒤 생성된 `.tgz`를 DSH로 설치하세요. pack이 커널과 LICENSE를 준비합니다. 준비되지 않은 `plugin/` 복사본에는 커널이 없습니다. [플러그인 배포 설명](plugin/README.md)을 참고하세요.

### 설치 검사

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout 초] [--json]
node bin/check-install.mjs <spec> --json
```

Node, DSH, pnpm이 필요하며 의존성 해결과 설치는 네트워크를 사용할 수 있습니다. spec은 DSH의 npm/GitHub/git/file 형식을 따릅니다. 실행마다 고유한 임시 profile과 비공개 디렉터리를 사용하고 자신이 시작한 프로세스만 정리합니다. **임시 profile은 운영체제 샌드박스가 아닙니다.**

| 옵션 | 기능 |
|---|---|
| `--keep` | 이번 profile·현장 보존, 반환 경로 사용 |
| `--timeout N` | 시작 대기 초, 기본30 |
| `--json` | stdout에 JSON 하나, 진행 출력 분리 |
| `--install-skill` / `--force` | shell의 독립 skill 설치 및 명시적 덮어쓰기 |
| `--help` / `--version` | shell 도움말·버전 |

CLI 및 Node 설치 검사 결과 코드:

| 코드 | 의미 |
|---|---|
| `0` | 보고된 문제 없음; coverage·vacuous·관측 제한 확인 필요 |
| `1` | 부분 사용 가능하거나 판정이 미확정인 플러그인 존재 |
| `2` | 호환되지 않는 플러그인 또는 명확한 설치 peer 차단 |
| `3` | 입력·설치·네트워크·준비·시작 오류, 판정 불가 |

shell은 Node 진입 전 기존 사용법·커널 오류 코드를 유지합니다. 자동화에는 Node 진입점과 `status`를 사용하고 래퍼 오류를 플러그인 판정으로 해석하지 마세요.

## 증거와 한계

서비스는 present, absent, unobserved, unreadable로 구분합니다. 누락된 키는 미관측입니다. 현대 관측은 profile·DSH 버전이 일치해야 하고 기본24시간 후 만료됩니다. 구형 보고서는 명시된 키만 사용하며 unbound 경고를 표시합니다.

`certainty`는 certain 또는 suspected이며 filtered/abstained는 별도 분류입니다. 선언은 의존 관계를 증명할 뿐 메서드 부재를 증명하지 않습니다. inferred 영향을 유지하세요. 신뢰할 수 있는 loader FAILED/PENDING은 실제 미활성 증거입니다. 0.1.3 후보는 DSH≥0.2.1-rc.1에서 자체 `engines.dsh`를 우선하며 없을 때만 공식 peer를 검사합니다. 이전 대상은 engines 권고 규칙을 유지합니다. 충돌/잘못된 필드는 추론 `declared-incompatible`이며 실제 로드 실패가 아닙니다. profile의 독립 `compatibility.json`을 읽기만 하며 플러그인 이름·정확한 버전·정확한 DSH 버전으로 예외를 맞춥니다. 잘못된 행은 전체를 무시하고 범위를 제한하며, 읽기 실패/64KiB 초과 시 예외는 미관측입니다. 예외는 선언 허용이지 기능 인증이 아닙니다.

`coverage.status=limited`, vacuous, 파싱·읽기·예산 진단, 매핑 불가능한 loader 제한을 항상 함께 전달하세요. 문제 없음이 기능 인증은 아닙니다. 호스트·클라이언트·공유 호출을 구분합니다. provide 선언은 제공자 단서일 뿐 활성화 증거가 아니며 존재하는 서비스의 완전한 메서드 관측은 계속 사용합니다.

고정 버전 Babel JS/TS AST로 어휘 바인딩, 호출 위치, 능력 검사, 부작용 import를 포함한 패키지 내부 상대 import를 분석하며 대상 소스를 실행하지 않습니다. 상수 계산 속성, 직접 함수 인자·반환값, 패키지 내부 ESM/CommonJS 별칭·호출, 빈 handler의 투명 Proxy를 유한 범위에서 지원합니다. 함수 간 확장은 입증된 Context/서비스 바인딩에 한정하며 미확인 키·trap·비동기 반환·모호성·예산 초과는 제한으로 남깁니다. [Plan](docs/Plan.md#21-证据与分析边界)을 참고하세요. 파일·바이트·디렉터리·시간 예산을 두며 호스트 분석은 시간·메모리 제한 worker에서 실행합니다.

기본 정적 CLI는 DSH를 시작하거나 대상을 설치하지 않습니다. 호스트 플러그인은 분석 worker를 사용하지만 검사를 위해 외부 명령·네트워크를 호출하지 않으며 자신의 기준선을 기본 기록합니다. schema2는 canonical profile, 경로 해시, 모드, 도구·규칙·카탈로그를 구분합니다. 경로는 `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`이며 잠금과 원자적 교체를 사용합니다. 불완전한 소스 검사는 기준선을 갱신하지 않습니다. 정적·파일·프로세스 내부 관측은 모드가 다릅니다.

descriptor 샘플링은 getter를 실행하지 않으며 접근자 메서드는 미확인으로 남깁니다. 진단 출력에는 명시적 비공개 `DSC_OUT_DIR`이 필요합니다. 다른 profile 조회는 현재 호스트의 서비스를 빌리지 않고 정적 증거를 사용합니다. 보존된 현장에는 로컬 정보가 포함될 수 있으므로 공유 전 확인하세요.

## 저장소 구조

```text
dsh-plugin-compat-check/
├── README.md / README.en.md / README.ko.md
├── package.json / package-lock.json   # private development workspace
├── bin/                              # compat-check.mjs, check-install.mjs
├── lib/                              # shared analysis, evidence, state and runner modules
├── plugin/                           # npm plugin, client, packaging scripts and skill copy
├── probe/                            # opt-in runtime probe, staged by the owned runner
├── skill/                            # authoritative SKILL.md and delivery notes
├── rules/                            # severity rules, API catalogue and historical inventory
├── docs/                             # current contracts, verification and history
│   ├── Plan.md
│   ├── GPT审计及重构方案文档.md
│   ├── current-state.json
│   └── extraction-findings.md
├── test/                             # behavior, invariants, snapshots and artifact tests
└── tools/                            # documentation, metadata and diagnostic utilities
```

## 검증과 유지보수

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

기본 테스트는 선택적 로컬 profile의 비공개 읽기 전용 복사본을 한 번 만들어 추출·소스 재확인·자식 프로세스가 공유합니다. 단일 테스트 파일은 자체 입력을 캡처합니다. 캡처 중 변경이나 예산 초과는 명시적 오류로, 미설치 profile은 명시적 건너뛰기로 처리합니다. 종료 후 복사본을 정리하며 제품의 스캔·설치 검사 동작은 바뀌지 않습니다.

`doc-check`는 링크·버전·문서 진입점·skill 복사본을 오프라인 검사하며 테스트를 실행하지 않습니다. 성공한 TAP 로그로 `node tools/update-current-state.mjs --test-summary <log>` 후 `node tools/doc-check.mjs --test-summary <log>`를 실행하세요. 배포 전 검사는 기본 전체 테스트를 한 번 실행하고 요약을 재사용하며 독립 tarball 설치 후 제어된 호스트 컨텍스트에서 등록된 도구를 호출합니다. 실제 DSH를 시작하는 검사는 아닙니다. 이 패키지 검증은 비공개 빈 npm 캐시와 npm registry 접속을 사용하며 기존 로컬 캐시에 의존하지 않습니다. 메타데이터 검사는 네트워크와 gh/npm이 필요합니다. 미배포 로컬 버전·README 차이는 notice이고 조회 실패는 미검증입니다.

느린 통합 검사는 명시적 `DSC_SLOW=1`이 필요합니다. macOS DSH/Chrome, Ubuntu arm64 VM 및 Linux x64 CI 기록은 실제 tgz, 도구·skill, UI 대조와 자원 시나리오를 포함합니다. 정확한 커밋과 범위는 [Plan](docs/Plan.md#5-验证记录与复现)을 참고하세요. 과거 CI가 이후 로컬 단언·문서 변경을 인증하지는 않으며 Windows는 보류합니다. [엔지니어링 재현](docs/Plan.md#53-p2工程验收)을 참고하세요. 과거 88.3% 재현율, 66/66 도착 및 loader 라벨은 업무 기능 정확도가 아닙니다. Python parity도 구형 정규식 참고이며 AST의 정답이 아닙니다.

보조 측정은 독립 loader 원시 라벨과 서비스 관측만 받는 예측기를 분리합니다. [Plan 보조 측정 기록](docs/Plan.md#51-已验证范围)을 참고하세요. `node tools/labels.mjs --nm web --synthetic --json`은 비공개 환경을 만들고 실제 누락을 보고하면 exit1을 반환합니다. 기존 대상은 `--probe-boot`, 파일 입력은 `--probe`와 `--labels`를 함께 사용합니다. 이 수치는 첫 계층의 해당 표본에만 적용되며 생태계 정확도가 아닙니다.

[lib/contracts.mjs](lib/contracts.mjs)가 CLI JSON·HTTP·도구·패널의 보고서 계약 원본입니다. 추가 필드는 보존하고 필수 필드 누락이나 미지원 버전은 도구 오류로 처리합니다. 0.1.3 후보는 DSH≥0.2.1-rc.2이면 rc.2 카탈로그(host98/client8), 나머지/미상은 기존 0.2.0-rc.2 카탈로그(host91/client8)를 선택합니다. 명시적 `--catalog`가 우선하며 미래 DSH 버전은 미검증입니다. 카탈로그는 런타임 관측이나 심각도 증거가 아닙니다. AST 목록은 날짜가 있는 부분 표본입니다. [Plan](docs/Plan.md#2-现行判定与集成契约)을 참고하세요.

[개발 기록 및 후속 계획](docs/Plan.md) · [역사 감사](docs/GPT审计及重构方案文档.md) · [규칙](rules/README.md) · [skill 배포](skill/README.md). [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)에 수록되어 있습니다.

## License

[MIT](LICENSE).
