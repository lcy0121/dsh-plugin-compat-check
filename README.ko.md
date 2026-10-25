# dsh-plugin-compat-check

**설치된 DSH 플러그인**을 대상 버전과 비교하고 소스 위치, 근거, 분석 범위를 제공합니다. 선언 허용, 활성화 또는 발견 없음은 실제 기능의 정상 동작을 보장하지 않습니다. 유용하다면 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)를 남겨 주세요.

[简体中文](README.md) | [English](README.en.md) | **한국어**

## 버전과 진입점

**0.1.7**은 rc.3 대응, 업그레이드 사전 검사, 매개변수 의미 검사와 입력 경계 강화를 제공합니다. Node `^22.19.0 || >=24`, 호스트 최소 선언은 `>=0.2.0-rc.2`입니다. 인증된 정확한 카탈로그 버전은 **0.2.0-rc.2, 0.2.1-rc.2, 0.2.1-rc.3**이며, 최소 버전 선언이 미래 호스트를 인증하지는 않습니다.

npm 플러그인은 호환성 페이지, 상세/배지, `compat_check`와 skill을 제공합니다. 저장소 전용 CLI, 설치 검사, 정적 일괄 검사, 작성자 CI와 기능 검사 실행기는 같은 커널을 사용합니다. npm 패키지에는 CLI bin이 없으며 `npx dsh-plugin-compat-check`는 지원하지 않습니다. [Plan](docs/Plan.md)은 계약과 할 일을, [docs/current-state.json](docs/current-state.json)은 제한된 검증 결과를 기록합니다.

## 화면 예시

과거 화면은 표시 방식의 예시이며 현재 소스나 실제 기능의 검증을 뜻하지 않습니다.

![부분 호환: 소스 위치, 영향과 근거](plugin/assets/compat-detail-partial.png)
![선언 충돌: 도구의 추론과 호스트 안내 구분](plugin/assets/compat-detail-declared.png)

## 설치와 사용

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.3: **왼쪽 아래 계정 메뉴 → 설정 → 내장 플러그인 → 호환성**. 실제 profile을 선택하고 desktop을 가정하지 마세요. 에이전트는 `compat_check`를 호출할 수 있습니다. 패널은 필터, 발견 접기, 전체 보고서 미리 보기/복사와 기준선 대비 새 위험을 제공합니다. 의존성 그래프는 잠재적 관계이며, 검토 기록은 판정을 바꾸지 않고, 기능 검사 페이지는 과거 JSON만 가져옵니다. [사용 안내](docs/guide.md)를 참고하세요.

## 저장소 CLI

저장소 도구는 소스에서 실행합니다:

```bash
git clone --branch main https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| 옵션 | 역할 |
|---|---|
| `--nm <dir>` | 대상 profile 또는 node_modules; 필수 |
| `--dsh-version <v>` | 대상 DSH 버전; 사전 검사에서는 현재 버전 |
| `--probe <json>` / `--probe-boot` | 관측 파일 읽기 / 명시적으로 임시 호스트 실행 |
| `--json` / `--quiet` | 전체 JSON / 요약 한 줄 |
| `--no-baseline` / `--dry-run` | 기준선 읽기·쓰기 금지 / 비교만 수행 |
| `--baseline-file <path>` | 사용자 지정 기준선 경로 |
| `--issue-report` | 공유용 Markdown; 내용을 확인한 뒤 공유 |
| `--rules <json>` / `--catalog <json>` | 규칙 / 참조 카탈로그 지정 |
| `--help` / `--version` | 전체 도움말 / 도구 버전 |

정적 검사는 대상 실행이나 네트워크 접근 없이 동작합니다. 일반 검사는 기준선을 기록하며 no-baseline은 읽기/쓰기를 막습니다. 불완전한 검사는 갱신하지 않습니다. probe-boot/설치 검사는 대상을 실행하므로 승인이 필요하며, 임시 profile은 OS 샌드박스가 아닙니다.

## 업그레이드 사전 검사와 작성자 도구

패널에 대상 버전을 입력하거나 `compat_check({"upgradeTo":"0.2.1-rc.3"})`를 호출하세요. 에이전트는 실행 중인 호스트 버전을 사용하고 `upgradePreview`를 반환합니다. CLI에는 두 정확한 버전이 필요합니다.

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
```

세 정확한 버전을 서로 비교하며 미인증 버전은 코드 3을 반환합니다. 같은 비공개 바이트를 정적으로 비교하고 호스트 실행/업그레이드, probe, 예외나 일반 기준선을 사용하지 않습니다. **0/1/2는 추가·악화 위험 없음/비치명적/치명적 위험, 3은 검사 불가**입니다. 0이어도 기존 위험은 남을 수 있습니다. [계약](docs/Plan.md#27-升级前静态预检契约)을 참고하세요.

[작성자 CI](docs/author-ci.md)는 행렬, 게이트와 JSON/SARIF/JUnit/HTML을 제공합니다. 정적 일괄 검사는 [안내](docs/guide.md#升级预检与有限批量)를 따릅니다. 기능 실행기는 기본 review이며 run에는 승인이 필요합니다. [skill](skill/README.md)과 [완전한 tgz 생성](plugin/README.md#从源码构建安装)도 참고하세요.

## 결과와 검증

일반 종료 코드: **0 충돌 발견 없음, 1 부분 사용 가능 또는 미확인, 2 비호환, 3 도구/입력 오류**. certainty/impactBasis/coverage/vacuous를 유지하세요. 미관측은 부재가 아니며 손상된 기준선은 보존합니다. 클라이언트 실제 기능은 별도 검증하고 공유 전 내용을 확인하세요. 자동 게시하지 않습니다.

```bash
npm test
npm run check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

기본 테스트는 실제 DSH/모델을 시작하지 않으며 패키징 회귀 검사는 registry가 필요합니다. `check`는 형식, 문서/생성 사본, 구문과 카탈로그를 확인합니다. 배포 전 검사는 배포하지 않습니다. 메타데이터 검사는 gh/npm과 네트워크가 필요하며 조회 실패는 통과가 아닙니다. macOS/Linux 증거는 기록된 범위에 한정되고 Windows 실환경 검증은 남아 있습니다.

[규칙](rules/README.md) · [유지보수와 카탈로그 관리](docs/maintaining.md) · [현재 증거](docs/current-state.json).

## License

[MIT](LICENSE) · [타사 의존성과 라이선스](THIRD_PARTY_NOTICES.md).
