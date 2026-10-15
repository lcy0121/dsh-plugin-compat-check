# dsh-plugin-compat-check

**설치된 DSH 플러그인**과 대상 DSH 버전의 호환성을 검사하고 소스 위치, 근거, 증거 범위를 제공합니다. 선언 통과나 활성화 성공만으로 모든 기능의 정상 동작을 보장하지 않습니다.

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 버전과 배포

로컬 소스는 **미배포0.1.1 후보 버전**입니다. 2026-10-15에 확인한 npm `latest`는 **0.1.0**이며 미배포 수정 사항을 포함하지 않습니다. [공개 메타데이터 검토](docs/Plan.md)와 [자동 검증 기록](docs/current-state.json)을 참고하세요. Node `^22.19.0 || >=24`를 지원합니다.

| 진입점 | 역할 |
|---|---|
| npm 플러그인 | 현재 호스트 샘플링, 호환성 패널, `compat_check`, skill provider; 설치 전 검사는 불가 |
| 저장소 CLI | 설치된 패키지 정적 검사; 기존 관측 파일 또는 명시적 임시 호스트 검사 |
| 저장소 설치 검사 | spec을 임시 profile에 설치해 설치·시작·호환성 확인 |
| skill | 등록된 도구 또는 저장소 CLI 사용 방법 안내 |

하나의 판정 커널을 공유합니다. **입력과 관측 증거가 같을 때만** 동일한 결과를 기대할 수 있습니다. npm 패키지에는 CLI `bin`이 없어 `npx dsh-plugin-compat-check`를 사용할 수 없습니다. 클라이언트 도착 검사는 별도 개발 도구이며 패널 기능이나 전체 UI 검증이 아닙니다.

## 사용법

### 저장소 CLI

아래 명령은 이미 확보한0.1.1 후보 소스에 적용됩니다. 현재 공개main에는 새 루트 워크스페이스가 없으며 후보 버전의 공개ref는 아직 push되지 않았습니다.

```bash
cd /path/to/dsh-plugin-compat-check
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
| `--dsh-version <v>` | 대상 버전; 명시 값은 시작 관측 버전보다 우선 |
| `--rules <json>` / `--catalog <json>` | 규칙 및 API 카탈로그 지정 |
| `--no-baseline` | 기준선 읽기·쓰기 비활성화 |
| `--baseline-file <path>` / `--dry-run` | 기준선 지정; 쓰지 않고 비교 |
| `--json` / `--quiet` | JSON 문서 하나; 또는 요약만 출력 |
| `--version` / `--help` | 버전·도움말, 대상 불필요 |

### 플러그인과 skill

```bash
# npm 배포 버전 설치 (현재0.1.0)
dsh plugin --profile <profile> add dsh-plugin-compat-check

# CLI 사용자의 독립 skill
./dsh-plugin-compat-check.sh --install-skill
```

플러그인은 호환성 패널, 상세 배지, `compat_check`, skill provider를 등록합니다. 2026-10-15에 실제 tarball을 macOS arm64의 DSH0.2.0-rc.2에 설치하고 도구·skill 호출 및 실제 Chrome의 패널·배지·기준선 변화를 검증했습니다. 독립 skill은 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`에 설치되며 기존 파일 덮어쓰기는 `--force`가 필요합니다.

저장소 루트는 **비공개 개발 워크스페이스**이며 설치 가능한 DSH bundle이 아닙니다. 루트 GitHub spec은 `plugin/` 설치와 같지 않습니다. 후보 버전 검사 시 루트에서 `npm ci --ignore-scripts`를 실행하고 `plugin/`에서 `npm pack --pack-destination <이미있는절대출력경로>`를 실행한 뒤 생성된 `.tgz`를 DSH로 설치하세요. pack이 커널과 LICENSE를 준비합니다. 준비되지 않은 `plugin/` 복사본에는 커널이 없습니다. [플러그인 배포 설명](plugin/README.md)을 참고하세요.

### 설치 검사

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout 초] [--json]
node bin/check-install.mjs <spec> --json
```

Node, DSH, pnpm이 필요하며 npm 조회와 설치는 네트워크를 사용할 수 있습니다. spec은 DSH의 npm/GitHub/git/file 형식을 따릅니다. 실행마다 고유한 임시 profile과 비공개 디렉터리를 사용하고 자신이 시작한 프로세스만 정리합니다. **임시 profile은 운영체제 샌드박스가 아닙니다.**

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
| `1` | 부분 사용 가능한 플러그인 존재 |
| `2` | 호환되지 않는 플러그인 또는 명확한 설치 peer 차단 |
| `3` | 입력·설치·네트워크·준비·시작 오류, 판정 불가 |

shell은 Node 진입 전 기존 사용법·커널 오류 코드를 유지합니다. 자동화에는 Node 진입점과 `status`를 사용하고 래퍼 오류를 플러그인 판정으로 해석하지 마세요.

## 증거와 한계

서비스는 present, absent, unobserved, unreadable로 구분합니다. 누락된 키는 미관측입니다. 현대 관측은 profile·DSH 버전이 일치해야 하고 기본24시간 후 만료됩니다. 구형 보고서는 명시된 키만 사용하며 unbound 경고를 표시합니다.

`certainty`는 certain 또는 suspected이며 filtered/abstained는 별도 처리 분류입니다. 선언은 의존 관계를 증명할 수 있지만 메서드 부재를 증명하지 못합니다. `impactBasis=inferred`의 기능 영향은 추론임을 유지하세요. 신뢰할 수 있게 매핑된 loader FAILED/PENDING은 실제 미활성 증거입니다. 공식 peer 충돌은 declared-incompatible 및 추론 영향·degraded로 표시하고 미관측 예외를 고려해 fatal로 단정하지 않습니다. `engines.dsh`는 권고 선언입니다.

`coverage.status=limited`, vacuous, 파싱·읽기·예산 진단, 매핑 불가능한 loader 제한을 항상 함께 전달하세요. 문제 없음이 기능 인증은 아닙니다. 호스트·클라이언트·공유 호출을 구분합니다. provide 선언은 제공자 단서일 뿐 활성화 증거가 아니며 존재하는 서비스의 완전한 메서드 관측은 계속 사용합니다.

고정 버전 Babel JS/TS AST로 어휘 바인딩, 호출 위치, 능력 검사, 부작용 import를 포함한 패키지 내부 상대 import를 분석하며 대상 소스를 실행하지 않습니다. 동적 속성, factory/proxy, 함수·모듈 간 데이터 흐름은 제한적입니다. 파일·바이트·디렉터리·시간 예산을 두며 호스트 분석은 시간·메모리 제한 worker에서 실행합니다.

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

`doc-check`는 링크·버전·문서 진입점·skill 복사본을 오프라인 검사하며 테스트를 실행하지 않습니다. 성공한 TAP 로그로 `node tools/update-current-state.mjs --test-summary <log>` 후 `node tools/doc-check.mjs --test-summary <log>`를 실행하세요. 배포 전 검사는 기본 전체 테스트를 한 번 실행하고 요약을 재사용하며 독립 tarball 설치 후 실제 호스트 도구를 호출합니다. 메타데이터 검사는 네트워크와 gh/npm이 필요합니다. 미배포 로컬 버전·README 차이는 notice이고 조회 실패는 미검증입니다.

느린 통합 검사는 명시적 `DSC_SLOW=1`이 필요합니다. 2026-10-15에 정상 도착, 클라이언트 파일 누락, import 예외 및 런타임 음성 대조를 포함한 실제 DSH·Chrome 테스트6개가 통과했습니다. 환경과 명령은 [Plan](docs/Plan.md)을 참고하세요. Windows는 미검증이며 Linux CI 원격 실행 성공도 주장하지 않습니다. 과거88.3% 재현율과 이번66/66 도착 수치는 기능 정확도가 아닙니다. Python parity는 구형 정규식 참고 구현이며 AST의 정답이 아닙니다.

보조 측정은 독립 loader 원시 라벨과 서비스 관측만 받는 예측기를 분리합니다. [Plan §8.7](docs/Plan.md)을 참고하세요. `node tools/labels.mjs --nm web --synthetic --json`은 비공개 환경을 만들고 실제 누락을 보고하면 exit1을 반환합니다. 기존 대상은 `--probe-boot`, 파일 입력은 `--probe`와 `--labels`를 함께 사용합니다. 이 수치는 첫 계층의 해당 표본에만 적용되며 생태계 정확도가 아닙니다.

[lib/contracts.mjs](lib/contracts.mjs)가 보고서 계약의 단일 원본이며 CLI JSON·HTTP·도구·패널에서 증거를 유지합니다. 추가 필드는 보존하고 필수 필드 누락이나 미지원 버전은 도구 오류로 처리합니다. 규칙은 공식0.2.0-rc.2 소스·런타임으로 검토했으며 AST 목록은 부분 스캔임을 명시합니다. [Plan §8.8–8.9](docs/Plan.md)을 참고하세요.

[개발 기록 및 후속 계획](docs/Plan.md) · [역사 감사](docs/GPT审计及重构方案文档.md) · [규칙](rules/README.md) · [skill 배포](skill/README.md). [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)에 수록되어 있습니다.

## License

[MIT](LICENSE).
