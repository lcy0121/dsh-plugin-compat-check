# dsh-plugin-compat-check

**설치된 DSH 플러그인**을 대상 버전과 비교하고 소스 위치, 근거, 분석 한계를 제공합니다. 버전 선언 통과, 활성화 또는 발견 없음이 실제 기능 성공을 보장하지 않습니다. [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)

[简体中文](README.md) | [English](README.en.md) | **한국어**

## 버전과 진입점

**0.2.1**은 미출시 후보입니다. DSH rc.5의 정확한 카탈로그, 매개변수/슬롯 의미, 업그레이드 사전 검사 및 작성자 CI를 지원하며, 중·영·한 UI, 의존 관계, 수동 검토, 로컬 보고서 이력을 제공합니다. 인증된 정확한 카탈로그 버전은 **0.2.0-rc.2, 0.2.1-rc.2, 0.2.1-rc.3, 0.2.1-rc.5**입니다. Node `^22.19.0 || >=24`, 호스트 선언은 `>=0.2.0-rc.2`이며 미래 버전을 인증하지 않습니다.

동일한 CI 0.2.1 아카이브가 macOS/Linux의 rc.5 검수를 통과했습니다. 커밋과 범위는 [docs/current-state.json](docs/current-state.json)에 기록하며, 이후 소스/패키지는 다시 확인해야 합니다. 공개 npm/GitHub Release는 여전히 0.2.0으로 앞의 세 카탈로그만 포함합니다. npm 패키지는 화면, 상세/배지, `compat_check`, skill을 제공합니다. CLI·설치 검사·배치·작성자 CI·건강 실행기는 저장소 전용이며 npm CLI bin과 `npx dsh-plugin-compat-check`는 지원하지 않습니다.

## 설치와 사용

```sh
# 현재 공개 버전; 이번 작업에서 0.2.1은 출시하지 않습니다
dsh plugin --profile <profile> add dsh-plugin-compat-check@0.2.0
# 검수한 후보 아카이브
dsh plugin --profile <profile> add file:/absolute/path/dsh-plugin-compat-check-0.2.1.tgz
```

설치한 profile을 사용하는 DSH에서 **왼쪽 아래 더 보기(⋯)/아바타 → 설정 → 내장 플러그인 → 호환성(兼容性)**을 엽니다. desktop으로 가정하지 마세요. 에이전트는 `compat_check`를 호출할 수 있습니다. 소스 설치에는 [완전한 tgz](plugin/README.md#从源码构建安装)가 필요합니다.

### 화면별 사용법

기본 언어는 호스트를 따르며 중국어/English/한국어 또는 호스트 따르기를 선택할 수 있습니다. 미지원 언어는 영어로 표시됩니다. 설정은 로컬에 저장되고 전환해도 필터/초안은 유지됩니다. 원본 근거, 사용자 메모, 명령 및 JSON은 번역하지 않습니다.

| 화면 | 동작 |
|---|---|
| 주 결과 | 대상·시각/캐시·카탈로그를 확인하고 다시 검사하거나 검색/필터 후 발견을 펼칩니다. 진단 보고서는 복사 전 미리 보고 분석 한계와 미인증 경고를 유지합니다. |
| 의존 관계와 잠재 영향 | 서비스 의존성, 후보 제공자, 경로를 펼칩니다. 선언/loader 상태는 실제 제공이나 장애 전파의 증거가 아닙니다. |
| 수동 검토 | 발견에서 편집기로 이동해 상태/근거를 명시적으로 저장하고 해당 발견으로 돌아갑니다. |
| 정적 업그레이드 사전 검사 | 정확한 대상 버전을 입력합니다. DSH를 설치하거나 업그레이드하지 않습니다. |
| 고급 도구 | 필요할 때 검토 보관함, 보고서 저장/비교, 건강 JSON 가져오기를 실행합니다. 자동 실행·수집·업로드는 없습니다. |
| 하단 정보 | 도구 버전, 샘플링, 대상 출처를 확인합니다. |

보조 내용은 기본 접힘이며 결과/관계/발견/사전 검사 상세는 페이지당 50개입니다. 좁은 표는 가로 스크롤하고 필터/페이지는 전체 내보내기를 자르지 않습니다. 상세/배지는 단일 플러그인을 표시합니다. 401이면 호스트 로그인 진입점을 다시 열고 로그인 URL/Cookie를 공유하지 마세요.

### 수동 검토와 이력

1. 실제 소스 위치와 다음 단계를 조사하고 미확인/검토됨/오탐/수정됨을 선택해 절차·결과·근거를 저장합니다.
2. 소스·대상·근거가 바뀌면 다시 검사하고 재검토합니다. 수동 상태는 위험을 숨기거나 판정/종료 코드/기준선을 바꾸거나 예외를 부여하지 않습니다.
3. 초안은 현재 페이지에만 남습니다. 식별자가 바뀌면 오래된 저장을 막으며 복사 후 재검토하거나 버릴 수 있습니다. 새로고침/이동 전 저장하거나 복사하세요.

보관은 확인과 백업이 필요하며 복원/가져오기는 참고용입니다. 보고서는 명시적으로 저장하고 두 개를 선택해 비교합니다. 식별자가 맞지 않으면 중립적으로 표시하며 근거 약화를 수정으로 보지 않습니다. 용량이 차면 내보낸 뒤 삭제하고 자동 정리는 하지 않습니다. 경로·한도·경계는 [가이드](docs/guide.md)에 있습니다.

## 화면 예시

2026-10-29의 **0.2.0 / DSH 0.2.1-rc.3 과거 화면**이며 0.2.1 검수 증거가 아닙니다. 수치는 당시 검사만 나타냅니다. 사전 검사/이력 이미지는 비교·저장을 실행하지 않은 입력 화면입니다. 캡처 언어는 중국어입니다.

![0.2.0 주 결과와 근거 한계](plugin/assets/compat-overview-0.2.0.png)
![0.2.0 수동 검토 진입점](plugin/assets/compat-review-0.2.0.png)
![0.2.0 정적 업그레이드 사전 검사](plugin/assets/compat-upgrade-0.2.0.png)
![0.2.0 로컬 이력 진입점](plugin/assets/compat-history-0.2.0.png)

## 저장소 CLI

```sh
git clone --branch main https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
```

| 옵션 | 용도 |
|---|---|
| `--nm <dir>` | profile 또는 node_modules, 필수 |
| `--dsh-version <v>` | 대상 DSH, 사전 검사에서는 현재 버전 |
| `--probe <json>` / `--probe-boot` | 관측 읽기 / 승인된 임시 호스트 시작 |
| `--json` / `--quiet` | 전체 JSON / 요약 |
| `--no-baseline` / `--dry-run` | 기준선 읽기·쓰기 금지 / 쓰지 않고 비교 |
| `--baseline-file <path>` | 사용자 기준선 경로 |
| `--issue-report` | 미리 보고 직접 공유할 Markdown |
| `--rules <json>` / `--catalog <json>` | 규칙 / 참고 카탈로그 재정의 |
| `--help` / `--version` | 전체 도움말 / 도구 버전 |

일반 정적 검사는 대상을 실행하거나 네트워크를 사용하지 않지만 기본적으로 자체 기준선을 씁니다. 불완전한 검사는 기준선을 갱신하지 않고 손상된 원본은 보존합니다. probe-boot·설치 검사·건강 run은 대상을 실행하므로 승인이 필요합니다. 비공개 profile은 OS 샌드박스가 아닙니다.

## 업그레이드 사전 검사와 검증

`compat_check({"upgradeTo":"0.2.1-rc.5"})`는 호스트의 현재 버전을 사용하고 `upgradePreview`를 반환합니다. CLI에는 두 정확한 버전을 지정합니다.

```sh
node bin/compat-check.mjs --nm <profile> --dsh-version 0.2.1-rc.3 --upgrade-to 0.2.1-rc.5 --json
npm test
npm run check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

등록된 네 버전의 임의 쌍을 비교하며 미등록 버전은 코드 3입니다. 같은 비공개 바이트만 정적으로 비교하고 probe·예외·일반 기준선을 사용하지 않습니다. 사전 검사 0/1/2는 새로 생기거나 악화된 위험 없음/비치명/치명, 3은 검사 불가이며 0에도 기존 위험이 남을 수 있습니다. 일반 종료 코드는 **0 충돌 미발견, 1 일부 사용 가능 또는 알 수 없음, 2 비호환, 3 도구/입력 오류**입니다.

기본 테스트는 실제 DSH/모델을 시작하지 않으며 패키징 테스트는 registry가 필요합니다. 출시 전 검사는 출시하지 않고 메타데이터 조회 실패는 검증 성공이 아닙니다. Windows와 일반 업무 기능은 미인증입니다. [Plan](docs/Plan.md), [가이드](docs/guide.md), [유지보수](docs/maintaining.md), [작성자 CI](docs/author-ci.md), [규칙](rules/README.md), [skill](skill/README.md)을 참고하세요.

## License

[MIT](LICENSE) · [제3자 의존성과 라이선스](THIRD_PARTY_NOTICES.md).
