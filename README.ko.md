# dsh-plugin-compat-check

**설치된 DSH 플러그인**과 대상 DSH 버전의 호환성을 검사하고 소스 위치, 근거, 증거 범위를 제공합니다. 선언 통과나 활성화 성공만으로 업무 기능의 정상 동작을 보장하지 않습니다.

[简体中文](README.md) | [English](README.en.md) | **한국어**

## 버전과 진입점

npm `latest`는 **0.1.4**이며 Node `^22.19.0 || >=24`를 지원합니다. 이번 패치에는 활성화 전제 설명, Origin 유효 포트 검사, npm 하위 디렉터리 메타데이터와 저장소 엔지니어링 진단이 포함됩니다. 전달 상태·검증·후속 작업은 [Plan](docs/Plan.md)을 참고하세요.

| 진입점 | 역할 |
|---|---|
| npm 플러그인 | 호환성 탭, 플러그인별 발견·배지, `compat_check`, skill provider |
| 저장소 CLI | 설치된 플러그인 검사, 관측 파일 읽기 또는 명시적 임시 호스트 시작 |
| 저장소 설치 검사 | 임시 profile에 spec을 설치·시작하고 검사 |
| skill | 같은 도구 또는 CLI 사용 안내; [전달 설명](skill/README.md) |

하나의 판정 커널을 공유하며 입력과 관측 증거가 같을 때만 동일한 결과를 기대할 수 있습니다. npm 패키지에는 **CLI bin이 없어** `npx dsh-plugin-compat-check`를 사용할 수 없습니다.

## UI 예시

기록된 상세 페이지는 보고서 표시 예시이며 전체 호환성 인증이 아닙니다:

![부분 사용 가능: 소스 위치·영향·근거](plugin/assets/compat-detail-partial.png)
![선언 충돌: 도구 추론과 호스트 경고 구분](plugin/assets/compat-detail-declared.png)

## 빠른 시작

### 플러그인

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2 경로: **더 보기 → 설정 → 내장 플러그인 → 호환성**. agent는 `compat_check`를 호출할 수 있습니다. 실제 profile을 선택하고 desktop을 기본으로 가정하지 마세요.

### 저장소 CLI

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| 옵션 | 기능 |
|---|---|
| `--nm <dir>` | 필수; profile 또는 node_modules 디렉터리 |
| `--probe <json>` / `--probe-boot` | 관측 파일 읽기 / 명시적 임시 호스트 시작; 함께 주면 파일 우선 |
| `--dsh-version <v>` | 선언·카탈로그 선택 대상 버전, 명시 값 우선 |
| `--json` / `--quiet` | 전체 JSON / 요약만 출력 |
| `--no-baseline` / `--dry-run` | 기준선 읽기·쓰기 금지 / 쓰지 않고 비교 |
| `--baseline-file <path>` | 기준선 파일 지정 |
| `--issue-report` | 기본 비식별 Markdown; 기준선 읽기·쓰기 없음; json/quiet와 상호 배타적 |
| `--rules <json>` / `--catalog <json>` | 규칙 / API 카탈로그 지정 |
| `--probe-timeout <초>` / `--probe-keep-dir <dir>` | 시작 대기 기본40초 / 명시적 비공개 디렉터리에 probe 증거 보존 |
| `--help` / `--version` | 전체 도움말 / 도구 버전, 대상 불필요 |

`--issue-report`에는 패키지 이름과 패키지 상대 경로가 남으므로 공유 전 확인하세요. 원시 로그·probe·기준선은 제외하며 자동 게시하지 않습니다. 비공개 작업 디렉터리와 엔지니어링 진단도 그대로 공유할 보고서가 아닙니다.

### 고정 표본 정적 일괄 검사（저장소 도구）

```bash
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json > next.json
node tools/static-batch.mjs --hash <로컬-패키지-디렉터리>
```

매니페스트에 패키지 이름·정확한 버전·전체 파일 트리 SHA-256을 고정합니다. 비공개 복사본을 검증한 뒤 같은 커널로 각각 분석합니다. 최대16개, 항목당10초, 전체60초이며 대상 설치·실행, probe·기준선 읽기는 하지 않습니다. 종료0/1/2는 정적 판정, 3은 입력·해시·예산·도구 오류입니다. 합성 예제는 의도적으로2를 반환합니다. 모든 결과는 **작성자 검토 대기**이며 제한된 범위·공허한 판정·불완전 스캔 정보를 유지합니다. 업무 기능 인증이 아닙니다. 증분 비교도 매번 다시 분석하며 분석 대상·분석기 소스·규칙·카탈로그·대상 버전·예산이 바뀌면 비교하지 않습니다. JSON 공유 전에 확인하세요.

형식·해시 알고리즘·권한과 비용 결정은 [Plan §2.5](docs/Plan.md#25-有限静态批量契约)를 참고하세요. 수동 [static-batch.yml](.github/workflows/static-batch.yml) Action은 저장소의 고정 공개 표본만 읽기 전용 권한으로 분석합니다. 원격 엔드포인트나 결과 캐시는 배포하지 않았으며 npm 플러그인에는 포함되지 않습니다.

### 설치 검사와 독립 skill

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh <spec> --json
./dsh-plugin-compat-check.sh --install-skill
```

설치 검사에는 Node·DSH·pnpm이 필요하며 DSH의 npm/GitHub/git/file spec을 지원합니다. `--keep`, `--timeout`(기본30초)을 사용할 수 있습니다. 설치 중 네트워크를 사용할 수 있고 호스트를 시작해 대상 플러그인을 실행하므로 **임시 profile은 OS 샌드박스가 아닙니다**. 기존 독립 skill 덮어쓰기는 `--force`가 필요하며 위치는 [skill 설명](skill/README.md)을 참고하세요.

저장소 루트는 private 개발 워크스페이스이며 설치 가능한 플러그인이 아닙니다. 소스는 완전한 tgz로 pack한 뒤 DSH로 설치하세요. 루트 GitHub spec이나 준비되지 않은 `plugin/` 복사본은 완전한 산출물과 같지 않습니다. [소스 패키징](plugin/README.md#从源码构建安装)을 참고하세요.

## 결과와 한계

CLI/Node 설치 검사 종료 코드: **0** 보고된 문제 없음, **1** 부분 사용 가능 또는 미확정, **2** 비호환 또는 설치 peer 차단, **3** 입력·실행 오류로 판정 불가. shell은 Node 진입 전 사용법·커널 오류 코드를 유지하므로 자동화에는 Node 진입점과 `status`를 사용하세요.

- `certainty`, `impactBasis`, `coverage`, `vacuous`를 함께 전달하세요. 미확인·미관측·누락된 키는 부재가 아니며 카탈로그는 런타임 관측이 아닙니다. 클라이언트 기능은 별도 검증이 필요합니다.
- 기본 정적 CLI는 DSH를 시작하거나 대상을 설치하지 않습니다. 호스트 검사는 외부 명령·네트워크 없이 예산이 있는 분석 worker를 사용합니다. 기준선은 기본 기록하므로 일회성 검사에는 `--no-baseline`을 쓰세요.
- 메서드 분석은 유한한 Babel AST·패키지 내부 값 흐름을 사용하며 동적 동작은 제한됩니다. 선언·API 위험은 업무 동작을 보장하지 않습니다. 현대 관측은 profile·버전·시간이 맞아야 하며 다른 profile의 증거를 빌리지 않습니다.
- 0.1.3부터 새 DSH 선언 규칙, 정확한 버전 예외와 rc.2 카탈로그를 지원합니다. 미래 DSH는 미검증입니다. macOS/Linux의 한정된 증거가 있으며 Windows는 실제 검증 대기 중입니다. [계약과 한계](docs/Plan.md#2-现行判定与集成契约)를 참고하세요.

## 개발과 문서

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

기본 테스트는 실제 DSH나 모델을 실행하지 않습니다. 패키징 회귀는 비공개 빈 캐시로 설치하므로 npm registry 접속이 필요합니다. `doc-check`는 테스트를 재귀 실행하지 않습니다. 메타데이터 검사는 gh/npm·네트워크가 필요하며 미배포 README 차이는 notice, 조회 불가는 미검증입니다. 배포 전 검사 자체는 버전을 배포하지 않습니다.

[Plan: 계약·검증·후속 작업](docs/Plan.md) · [current-state.json: 통계·증거](docs/current-state.json) · [규칙](rules/README.md) · [skill](skill/README.md). 엔지니어링 진단, 독립 업무 측정과 명시적 모델 테스트의 명령·권한 경계는 [재현 안내](docs/Plan.md#5-验证记录与复现)에 있으며 이 개발 도구들은 npm 플러그인에 포함되지 않습니다.

다음 목록에 수록되어 있습니다:

- [Awesome DSH Plugin (주요 카탈로그)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)
- [dsh.works 플러그인 카탈로그](https://github.com/dshworks/awesome-dsh-plugins)
- [Bruce의 Awesome DSH Plugins](https://github.com/bruc3van/awesome-dsh-plugin)
- [1024 생태계 카탈로그](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) ([1024 Store](https://deepseek1024.com)에 표시)

수록은 호환성 인증을 뜻하지 않습니다. 1024 Store의 npm 설치 방식은 아직 상위 프로젝트의 수정이 필요합니다. 상태는 [Plan](docs/Plan.md)을 참고하세요. [MIT License](LICENSE).

아직 배포되지 않은 소스에는 플러그인 검색, 결론·확실성·미검증 상태의 조합 필터, 접을 수 있는 발견 항목, 전체 보고서 미리보기/복사, 기준선 기반 신규 위험 보기가 추가됩니다. 각 발견에는 근거에 맞는 확인 절차가 제공되며 필터는 내보낼 보고서를 줄이지 않습니다. 실제 플러그인 고정 회귀 도구는 저장소에서만 사용합니다: `node tools/real-regression.mjs --live --out-dir <빈-디렉터리>` 또는 `--replay <증거-루트>`. 통과는 고정 결과 재현을 뜻하며 오탐/누락을 그대로 기록합니다. 범위와 예산은 [Plan](docs/Plan.md)을 참고하세요.
