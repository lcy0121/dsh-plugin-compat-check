# dsh-plugin-compat-check

이 프로젝트가 유용하거나 흥미롭다면 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)를 눌러 응원해 주세요!

**설치된 DSH 플러그인**과 대상 DSH 버전의 호환성을 검사하고 소스 위치, 근거, 증거 범위를 제공합니다. 선언 통과나 활성화 성공만으로 업무 기능의 정상 동작을 보장하지 않습니다.

[简体中文](README.md) | [English](README.en.md) | **한국어**

## 버전과 진입점

**0.1.5** · Node `^22.19.0 || >=24`. npm 플러그인은 호환성 탭, 플러그인별 발견·배지, `compat_check`, skill provider를 제공합니다. 저장소의 CLI, 설치 검사와 개발 도구는 같은 판정 커널을 사용합니다. npm 패키지에는 **CLI bin이 없으며** `npx dsh-plugin-compat-check`를 지원하지 않습니다. 배포·검증·후속 작업은 [Plan](docs/Plan.md)을 참고하세요.

## 화면 예시

기록된 상세 화면은 보고서 표현을 보여 주며 완전한 호환 인증이 아닙니다.

![부분 사용 가능: 위치, 영향과 근거](plugin/assets/compat-detail-partial.png)
![선언 충돌: 추론된 위험과 호스트 안내](plugin/assets/compat-detail-declared.png)

## 빠른 시작

### 플러그인

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2: **더 보기 → 설정 → 내장 플러그인 → 호환성**. 실제 profile을 선택하세요. desktop을 기본으로 가정하지 않습니다. agent는 `compat_check`를 호출할 수 있습니다.

0.1.5는 검색·조합 필터, 발견 접기, 전체 보고서 미리 보기·복사, 기준선 대비 새 위험과 다음 확인 단계를 제공합니다. 설치/loader 이벤트와 5초 주기 확인으로 캐시를 갱신하며 필터와 이전 결과를 유지하고 실패 원인을 표시합니다. 보고서에는 대상, 카탈로그 버전·해시와 검증 범위가 표시됩니다. 중복 플러그인 식별자는 판정 불가로 처리하며 기준선을 갱신하지 않습니다. 연결된 probe의 미래 시각 오차가 5분을 넘으면 해당 증거를 거부하고 정적 발견과 이유를 유지합니다.

의존 관계는 host/client, 필수/선택과 하위 범위를 구분합니다. 제공 선언은 **후보**이며 경로나 순환은 실제 장애를 입증하지 않습니다. 수동 검토 기록은 별도로 저장하고 식별 정보가 바뀌면 재검토하며 발견·판정·기준선·면제를 덮어쓰지 않습니다. 건강 패널은 **과거 JSON만 가져오며** 검사를 실행하지 않습니다. 과거 통과는 현재 산출물의 정상 동작을 증명하지 않습니다. [사용 안내](docs/guide.md)를 참고하세요.

### 저장소 CLI

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| 옵션 | 역할 |
|---|---|
| `--nm <dir>` | 필수 profile 또는 node_modules 경로 |
| `--dsh-version <v>` | 일반 검사의 명시적 대상 버전 |
| `--probe <json>` / `--probe-boot` | 관측 읽기 / 명시적 임시 호스트 시작; 파일 우선 |
| `--json` / `--quiet` | 전체 JSON / 요약 행 |
| `--no-baseline` / `--dry-run` | 기준선 읽기·쓰기 금지 / 비교만 수행 |
| `--baseline-file <path>` | 기준선 파일 선택 |
| `--issue-report` | 기본 익명화 Markdown; 기준선 접근 없음; json/quiet과 배타적 |
| `--rules <json>` / `--catalog <json>` | 규칙 / API 카탈로그 재정의 |
| `--help` / `--version` | 전체 도움말 / 도구 버전; 대상 불필요 |

공유 전 보고서를 확인하세요. 익명화 후에도 플러그인 이름과 패키지 상대 경로가 남습니다. 원본 로그·probe·기준선은 제외하며 자동 게시하지 않습니다. probe 예산과 추가 옵션은 `--help`에 있습니다.

### 업그레이드 전 호환성 미리 보기

패널에 대상 버전을 입력하거나 `compat_check({"upgradeTo":"0.2.1-rc.2"})`를 호출하면 현재 버전은 실행 중인 호스트에서 읽습니다. 저장소 CLI에는 현재·대상 정밀 버전을 모두 지정해야 합니다.

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
```

양쪽 모두 **0.2.0-rc.2, 0.2.1-rc.2**만 지원합니다. 알 수 없는 버전·범위는 카탈로그 대체 없이 `status=unsupported-version`, 종료3을 반환합니다. 동일 플러그인의 비공개 바이트 사본을 한 번 정적으로 추출한 뒤 양쪽 카탈로그·선언으로 독립 판정합니다. 산출물 해시, 카탈로그 출처·해시, 양쪽 보고서, 차이와 증거 한계를 유지합니다. worker 예산·정리가 적용되며 OS 원자적 스냅샷은 아닙니다.

플러그인 실행이나 호스트 설치·업그레이드를 하지 않고 runtime, probe, profile 면제, 일반 캐시·기준선을 사용하거나 제품 상태를 쓰지 않습니다. 종료 **0/1/2**는 각각 새로 생기거나 악화된 위험 없음/비치명적 위험/치명적 위험이며 **3**은 실행 불가입니다. 대상의 기존 문제는 `targetReport`에 남습니다. **종료0은 대상 사용 가능이나 업그레이드 후 업무 성공을 보장하지 않습니다.** 옵션 제한은 [계약](docs/Plan.md#27-升级前静态预检契约)을 참고하세요.

### 저장소 작업 흐름

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh --install-skill
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
```

설치 검사는 Node, DSH, pnpm이 필요하며 npm/GitHub/git/file spec, `--keep`, `--timeout`(기본30초)을 지원합니다. 네트워크에 접속하고 호스트를 시작하며 플러그인을 실행할 수 있습니다. **임시 profile은 OS 샌드박스가 아닙니다.** 기존 독립 skill을 덮어쓰려면 `--force`가 필요합니다. [skill 안내](skill/README.md)를 참고하세요.

정적 배치 목록은 버전·파일 트리 해시를 고정하며 최대16개, 항목당10초, 전체60초입니다. 대상 설치·실행이나 probe·기준선 접근은 하지 않습니다. 결과는 작성자 검토 대상이며 업무 인증이 아닙니다. 예제는 종료2를 기대합니다. 작성자 CI는 위험·증거 범위 게이트, JSON/SARIF/JUnit과 버전 행렬을 제공합니다. 건강 실행기는 기본 검토 모드이며 대상 명령 실행에 명시적 `--run`과 해당 실행의 승인이 필요합니다. **OS 샌드박스가 아닙니다.** 이 도구들과 실제 플러그인·브라우저·모델 회귀 검사는 저장소 전용으로 npm에 포함되지 않습니다. [안내](docs/guide.md), [작성자 CI](docs/author-ci.md), [유지 관리](docs/maintaining.md)를 참고하세요.

private 저장소 루트는 활성화 가능한 플러그인이 아닙니다. 소스 설치에는 완전한 tgz가 필요하며 루트 GitHub spec이나 `plugin/` 단순 복사로 대체할 수 없습니다. [소스 패키징](plugin/README.md#从源码构建安装)을 참고하세요.

## 결과와 한계

일반 CLI/Node 설치 검사 종료 코드: **0** 발견 없음, **1** 부분 사용 가능·알 수 없음, **2** 비호환·peer 게이트 거부, **3** 입력·실행 오류. 업그레이드 미리 보기는 앞의 차이 코드를 사용합니다. 자동화에서는 Node 진입점과 `status`를 확인하세요.

- `certainty`, `impactBasis`, `coverage`, `vacuous`를 유지하세요. 알 수 없음·미관측·생략된 키는 API 부재가 아닙니다. 카탈로그는 runtime 표면이 아니며 client 업무 기능은 별도 검증해야 합니다.
- 기본 정적 CLI는 DSH를 시작하거나 대상을 설치하지 않습니다. 호스트 내 검사는 외부 명령·네트워크 없이 제한된 worker를 사용합니다. 일반 검사는 기본적으로 자체 기준선을 쓰며 일회성 검사에는 `--no-baseline`을 사용하세요. 불완전한 스캔은 기준선을 갱신하지 않습니다.
- 제한된 Babel AST·패키지 내 값 흐름은 소스를 실행하지 않으며 동적 동작의 증거 범위는 제한적입니다. 현대 관측은 profile·버전·시효가 일치해야 하며 다른 profile의 증거를 빌리지 않습니다.
- 일반 검사는 DSH 선언 정책과 정확한 호환 면제를 지원합니다. 알 수 없는·미래 버전과 사용자 카탈로그는 미인증입니다. macOS/Linux는 제한적으로 검증했으며 Windows는 실제 검증 대기입니다. [전체 계약](docs/Plan.md#2-现行判定与集成契约)을 참고하세요.

## 개발과 문서

```bash
npm test
npm run format:check
node tools/doc-check.mjs
npm run notices:check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

기본 테스트는 실제 DSH·모델을 시작하지 않으며 패키징 회귀에는 npm registry가 필요합니다. `doc-check`는 테스트를 재귀 실행하지 않습니다. 메타데이터 검증에는 gh/npm과 네트워크가 필요하며 조회 실패는 통과가 아닙니다. 사전 검사는 버전을 게시하지 않습니다.

[Plan](docs/Plan.md) · [계수와 증거](docs/current-state.json) · [규칙](rules/README.md) · [사용 안내](docs/guide.md) · [유지 관리·카탈로그 관리](docs/maintaining.md). 생태계 등재와 상위 프로젝트 후속 작업은 Plan에서 추적하며 등재가 호환 인증을 의미하지 않습니다.

## License

[MIT](LICENSE) · 제삼자 의존성과 라이선스: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
