# 아키텍처 V2

요구사항의 기준은 PROJECT_SPEC.md다. 이 문서는 V2 기반 구현 계약과 운영 설계를 설명한다.

## 모듈과 경계

`src/engine/`는 Canvas 2D와 requestAnimationFrame만 사용하며 React와 Firebase를 import하지 않는다. React는 인증, 동 선택, actualLevel/viewingLevel/isOwnBuilding 상태와 접근성 UI를 관리한다. `src/lib/`는 Firebase 클라이언트와 배치 전송을 담당한다. `functions/`는 별도 TypeScript 패키지로 Admin SDK를 사용하는 유일한 쓰기 경계다. Firebase Hosting은 dist를 제공하고 모든 SPA 경로를 index.html로 rewrite한다. 인증/DB/함수/Hosting은 동일 프로젝트 ID를 사용한다.

## 문서별 권한과 필드

| 경로 | 최소 필드 | 클라이언트 권한 |
| --- | --- | --- |
| apartments/{id} | name, buildingCount, households, complexCount, source, verificationStatus | 인증 사용자 읽기 |
| complexes/{id} | apartmentId, start, end, buildingCount, households | 인증 사용자 읽기 |
| buildings/{id} | apartmentId, complexId, buildingNumber, tree.actualLevel | 인증 사용자 읽기 |
| users/{uid} | uid, apartmentId, complexId, buildingId, accountType, createdAt, updatedAt | 본인 get |
| participants/{uid} | apartmentId, complexId, buildingId, joinedAt | 본인 get |
| userScores/{uid} | score, lastBatchAt | 본인 get |
| teamScores/{buildingId} | buildingId, complexId, score, revision, actualLevel, updatedAt | 인증 사용자 단건 get (list/쓰기 불가) |
| scoreBatches/{digest} | uid, batchId, points, buildingId, teamScore, teamRevision, createdAt, expiresAt | 접근 불가 |
| results/leaderboard | rows[], updatedAt | 인증 사용자 읽기 |
| events/{eventId} | status, startsAt, endsAt | 인증 사용자 읽기 |

이벤트 문서에는 공개해도 되는 메타데이터만 넣는다. 시작·종료 시각은 Firestore Timestamp, 상태는 draft → active → closed이며 종료 집계 재처리가 필요하면 finalizing을 사용한다. 단일 아파트로 시작하며 eventId는 재사용하지 않는다. 진행 이벤트는 초기 운영 한 개를 전제로 하며 집계 작업의 최대 10개 처리 제한에 도달하면 운영 점검/페이지 처리를 추가한다.

모든 클라이언트 쓰기와 사용자 컬렉션 목록 조회는 Rules로 거부한다. Admin SDK는 Rules를 우회하므로 함수가 인증·스키마·권한을 별도로 검증한다. 공개 집계는 UID와 이메일이 없는 별도 문서다. 도구/로그에도 요청 본문·토큰·개인식별값을 기록하지 않는다.

## 참가와 점수 트랜잭션

joinEvent는 활성 기간과 실제 동 존재를 확인하고 참가 문서를 최초 1회 생성한다. 중복 참가 요청은 현재 동을 반환한다. changeBuilding이 현재 참가 동과 프로필을 원자적으로 변경하고 이전 참가 동 목록을 유지한다.

submitScoreBatch 요청은 eventId, batchId, points 및 입력 당시 buildingId를 받는다. points는 원시 입력 횟수이며 서버가 참가 이력과 아이템 상태를 검증해 동과 실제 경험치를 결정한다. 이전 클라이언트의 buildingId 없는 배치는 현재 동으로 처리한다. UID:batchId의 SHA-256을 배치 문서 ID로 사용한다. 하나의 트랜잭션에서 이벤트, 참가, 기존 배치, 프로필, 개인 점수, 동 원장을 읽고 검증한 후 배치·개인·동·참가자 보상 상태 네 문서를 갱신한다. 이벤트 종료 시각을 넘는 신규 요청은 거부한다. 이미 성공한 배치의 재전송은 종료 후에도 확인 응답할 수 있다. 동일 ID에 다른 점수는 오류다. 동시 중복도 트랜잭션 재시도로 한 번만 반영된다.

최소 4초 간격, 최대 100회 입력/요청, 2,048 bytes 데이터 제한, 함수 인스턴스 제한을 적용한다. 유효한 서로 다른 계정을 대량 생성하는 공격이나 매크로를 판정하는 시스템은 아니다. 실제 callable 전송 envelope는 플랫폼 제한도 적용되며 이 데이터 검증만으로 네트워크 유입 전체를 제한할 수는 없다.

점수 계산/레벨 임계값은 `functions/src/scoring.ts`로 분리한다. 동 단일 문서 경합이 측정되면 배치 원장을 유지한 채 분산 카운터 샤드 및 집계 함수로 교체한다. 이 경우 즉시 동 총합을 읽지 않는 계약으로 바꾸고 별도 부하 검증을 한다.

## 읽기 비용과 최종 집계

매분 Scheduler 함수가 활성 이벤트 원장 최대 85개와 동 메타데이터 85개를 읽어 leaderboard 한 문서에 85행을 저장한다. 클라이언트는 트리와 랭킹 화면의 순위를 위해 이 한 문서를 onSnapshot으로 공유 구독하고 단지 필터는 메모리에서 처리한다. 별도로 본인 동 1개와 현재 관전 동 최대 1개 원장만 실시간 구독한다. 관전 대상 변경·화면 해제 시 리스너를 해제하며 전체 원장 목록을 구독하지 않는다. 화면 해제 시 unsubscribe한다. 대략 클라이언트당 활성 1분당 1문서 읽기 + 최초 구독·재연결 읽기가 발생한다. 집계 지연은 최대 약 1분 + 실행 지연이며 UI에 집계 시각을 표시한다. 매분 85행 전체가 전송되므로 문서 크기와 전송량도 모니터링한다.

개인 userScores는 본인만 읽을 수 있으며 현재 게임 UI는 이를 구독하지 않는다. 동 성장과 우리 동 예상 순위는 클라이언트의 미확정 터치를 포함해 즉시 표시한다. 서버의 영구 기록과 정식 순위는 검증된 점수만 사용한다. 종료 배치와 집계가 경합하면 동일 트랜잭션의 이벤트/원장 읽기가 충돌을 감지하고 재시도한다. 마지막 집계 저장과 closed 전환은 원자적이다. 종료 이전에 전송했더라도 서버 승인 전 기간이 끝난 미승인 터치는 인정하지 않는다.

## 클라이언트 배치와 장애

5초 간격으로 pending 터치를 최대 100씩 떼어 UUID와 함께 한 요청으로 보낸다. 미승인 배치는 이벤트 ID/UID/참가 동별로 분리하고 동일 ID와 동일 점수로 재시도한다. 네트워크/일시 오류는 지수 backoff한다. 인증·참가·종료 오류는 전송 중단과 안내가 필요하다. 재시도 중 신규 터치는 별도 pending에 누적한다. 계정 전환·로그아웃 시 다른 UID로 큐를 전송하지 않는다. 매 입력을 동기 LocalStorage 저널에 저장한 후 표시한다. 탭 간 공유 IndexedDB 트랜잭션이 입력을 배치로 묶고 20초 전송 임대를 관리한다. 승인 전에는 저널을 삭제하지 않는다. 승인 tombstone → 저널 삭제 → tombstone 정리 순서를 지켜 중간 종료에도 재수입을 막는다. 프로젝트/UID/이벤트 범위를 구분하고 전송 중 신규 입력은 별도 배치로 보관한다. 종료 거절분은 rejected로 보관하고 전송/합산하지 않는다. 저장소 접근/용량 오류는 안내하고 새 입력을 차단한다.

## 인증과 삭제

browserLocalPersistence 설정 → authStateReady → 기존 사용자 재사용 또는 signInAnonymously. EmailAuthProvider.credential과 linkWithCredential, GoogleAuthProvider와 linkWithPopup을 사용한다. 계정 연결 성공 후 서버 동기화 함수로 accountType을 갱신한다. 이메일 인증/재설정은 Auth API에 위임한다. 충돌 시 게스트를 유지하며 임의 병합하지 않는다.

정식 전환은 아동 보호 요건 확인 뒤 활성화한다. 삭제 함수는 최근 auth_time을 확인하고 status=deleting을 설정해 참여/점수를 차단한다. 모든 이벤트의 UID 연결 기록을 지우고 Auth 계정을 삭제한 뒤 프로필을 제거한다. 실패 시 멱등 재시도 가능하도록 한다. Auth 삭제 직후 장애가 나면 프로필 tombstone이 남을 수 있으므로 운영 복구 작업과 부하 큰 계정의 비동기 삭제 큐는 출시 전 필수다. 공개 비식별 동 집계에는 개인 연결을 남기지 않는다.

## 배포/로컬/확장

실제 .firebaserc 프로젝트 매핑은 비워 둔다. 운영자는 검증된 실제 프로젝트를 firebase use --add로 지정한다. Web SDK의 공개 설정과 Admin 비밀키를 구분한다. Admin 키는 프론트엔드 환경변수에 넣지 않고 관리형 자격증명/ADC를 쓴다. Emulator는 demo-foreon-tree 로컬 전용 ID를 사용한다. 기본 리전 asia-northeast3과 Firestore 위치는 실제 프로젝트 생성 시 함께 확인한다. 네이티브는 향후 Capacitor에서 동일 엔진을 재사용하며 OAuth·영구 저장·딥링크 흐름은 별도 검증한다.


## 브라우저 즉시 표시와 서버 조정

`PersistentOutbox.mjs`는 서버 기준점·미전송 입력·전송 중 배치·보류된 집계를 영속 보관한다. `ScoreQueue.ts`가 내보내는 `PersistentScoreQueue.mjs`는 이를 이용해 터치마다 React 표시를 갱신하고 기존 타이머로만 배치를 전송한다. 응답/재시도/집계 도착 순서와 무관하게 승인된 터치를 한 번만 반영한다. 배치 처리 시 teamScores.revision을 증가시키고 배치 문서에 승인 당시 teamScore/teamRevision을 보관한다. 중복 요청은 동일 승인 내용을 반환한다. 이전 집계의 revision 누락은 0으로 취급하고 감소하지 않는 누적 점수로 호환한다. 함수/클라이언트의 레벨 임계값은 `functions/src/levels.json`을 함께 참조한다.

전송 중 집계는 승인 배치 포함 여부가 불명확하므로 잠시 보류한다. 응답 후 새 기준점을 확정하고 보류 집계 중 더 최신인 값을 반영한다. 미전송 터치는 그대로 남는다. 이 방식은 입력별 네트워크 호출을 추가하지 않는다. 본인/관전 동 원장 구독으로 다른 참여자의 확정 점수도 즉시 받는다. 확정 전 예측 레벨과 순위는 화면용이며 서버 기록을 대체하지 않는다. 정상 전송 상태/성공 문구는 표시하지 않으며 실제 실패 시 경험치 복구 결과만 상단 알림으로 안내한다.

통합 테스트는 실행 중 개발 서버와 충돌하지 않게 `demo-foreon-tests`, Auth 9199/Firestore 8180/Functions 5101과 별도 hub/logging 포트를 사용한다. 임시 Firebase 설정은 테스트 종료 시 제거한다. 개발용 `demo-foreon-tree`와 테스트 데이터를 공유하지 않는다.


## 앱 셸과 승급 UI

`main.tsx`는 `#tree`/`#ranking` 해시 경로를 하단 메뉴 및 브라우저 뒤로 가기와 동기화한다. 화면은 hidden으로 분리하되 점수 큐/본인 동 구독은 유지하고 공개 전체 순위 1문서 구독은 트리의 현재 순위 표시와 랭킹 탭에서 공유한다. 트리 Canvas는 랭킹 탭이나 백그라운드에서 정지하고 복귀 시 다시 시작한다. `ranking.mjs`는 단지별 공동 순위를 계산한 후 검색을 적용해 검색 결과의 원래 순위를 보존한다.

`galleryTransition`은 최초 로딩/동 변경을 실제 성장과 구분한다. 실제 현재 레벨 성장만 자동 이동과 승급 연출을 발생시키고 과거/미래 열람은 유지한다. `PromotionScene.mjs`는 React/Firebase 비의존 Canvas 함수로 2~10레벨의 팔레트/문양을 가진다. `LevelUpCelebration.tsx`가 requestAnimationFrame·DPR 상한 2·3.8~5.6초 수명·해제·모션 줄이기(정적 2.2초)를 관리한다. 최대 파티클 168개로 제한하고 반복 점멸 대신 한 번의 빛 확장을 사용한다.

기존 score/points/revision 원장과 경험치 즉시 표시 로직은 유지한다. 정상 저장 이벤트는 UI 알림을 만들지 않으며 실패와 성장만 사용자에게 의미 있는 위치에서 알린다. 이후 PWA 서비스 워커를 추가할 때 인증/점수 요청을 일반 정적 캐시에 넣지 않도록 별도 설계한다.


## 인증 복원과 Firestore 로컬 캐시

`authRestore.mjs`에서 persistence 준비와 authStateReady 완료 후 기존 UID를 재사용한다. 로그인 토큰 강제 갱신 실패를 이유로 signOut/새 익명 계정 생성을 하지 않는다. 익명 생성은 동일 탭 Promise와 지원 브라우저의 Web Lock으로 조정한다. `firebase.ts`는 persistentLocalCache와 persistentMultipleTabManager를 설정한다. 캐시 스냅샷을 먼저 사용하고 onSnapshot으로 서버를 반영한다. 캐시 미존재는 0으로 확정하지 않는다. React 초기값은 DB에 쓰지 않는다.

계정 변경 시 개인 React 상태·참가 리스너·큐를 해제하고 새 UID 경로만 조회한다. 과거 UID의 늦은 응답은 원래 outbox에만 저장한다. 공용 동 점수는 개인 캐시와 구분한다. Firestore 영구 캐시는 계정별 물리 삭제가 아니라 Rules와 현재 UID 기반 조회/콜백 검증으로 화면 노출을 막는다. 상세 장애 경계와 테스트 결과는 PERSISTENCE_REPORT.md를 따른다.


## 개발자 인증과 아이템

게임 Auth와 개발자 Auth는 같은 프로젝트의 다른 Firebase App 이름을 사용해 기기 인증을 분리한다. 개발자 gate/session 문서는 클라이언트 Rules 접근을 허용하지 않는다. `.env.local`의 scrypt 검증/링크 해시, 최초 UID 고정, 2시간 세션, 분당 10회 전역 시도를 서버 callable에서 검사한다. 개발자 화면은 게임 원장을 쓰지 않는다.

participant.rewards는 version, 보장 구간 진행량/임계값, 대기 선물, 아이템 배율/시작·종료 시각/수령 ID를 가진다. submitScoreBatch가 원시 입력으로 실제 EXP 및 시간제 효과를 계산하고 승인 배치에도 동일 결과를 보관한다. claimGift는 giftId로 멱등 수령한다. 기기 범위는 UID/이벤트/동이며 기존 원장은 해당 동으로 마이그레이션한다. 상세 동 변경/재시도·게임 설계 근거는 GAMEPLAY_NOTES.md를 따른다.

시간제 배치에는 수령 ID와 입력 시각 범위를 추가한다. 비공개 boostGrants의 서버 발급 유효 구간 및 수령별 사용량을 Transaction으로 검증한다. 로컬 저널과 배치의 예상 XP는 입력 순간에 고정해 만료 이후에도 이미 모은 경험치를 유지한다. 일반 배치는 4회, 강화 배치는 원장 사용량을 포함해 5회 쓰기다. 상세 계약은 GAMEPLAY_NOTES.md를 따른다.


## 경험치 단위

`economy.json`의 expPerScoreUnit=1000이 사용자 EXP와 저장 성장 단위를 연결한다. `score`, `teamScore`, 원장의 legacy `awardedXp` 및 기기 저널 XP는 기존 성장 단위를 유지한다. `points`는 원시 입력 횟수다. `levels.json`에는 실제 EXP 임계값을 보관하고 서버/클라이언트가 동일한 환산 후 레벨을 계산한다. `experience.mjs`는 사용자 숫자와 성장 진행률의 EXP 환산을 담당한다. 기존 데이터에 배율을 재가산하거나 별도 저장 마이그레이션을 수행하지 않는다.


## 콤보 상태와 정밀도

참가자 문서의 동별 combos 맵에 meter/lastTapAt/version을 저장한다. 기존 참가 리스너로 확인하고 서버 Transaction의 참가자 쓰기에 포함한다. 클라이언트 입력 시각 배열과 공유 설정으로 계산하며 임의 콤보 배율을 요청에서 받지 않는다. 새 배치는 tapTimes를 포함하고 최대 100입력/2,048 bytes다. 이전 배치는 기존 규칙으로 처리한다. 미확정 시각은 기기 원장에서 순서를 유지하고 승인 중 콤보 기준점은 보류한다.

scoreTicksPerUnit=10의 정수 틱으로 소수 성장 단위를 더한 뒤 사용자 EXP를 정수로 환산한다. 서버/클라이언트의 계산 일치 검증을 테스트에 포함한다. 상태 구독과 쓰기 횟수는 기존 정책을 유지한다. 실시간 게이지 감쇠는 로컬 계산이며 서버 호출을 추가하지 않는다.


## 경험치 옆 현재 순위 — 2026-11-25

현재 트리의 경험치 옆에 전체 순위 및 공동 순위를 표시한다. 집계 수신 전에는 대시를 표시한다. 전체 85개 동의 마지막 집계에 본인 미확정 EXP와 본인/관전 동의 최신 점수를 적용해 순위를 재계산한다. 트리에서도 순위를 표시하기 위해 공개 leaderboard 1문서를 게임 화면 동안 공유 구독한다. 갱신 주기는 기존 60초이며 전체 동 원장 구독이나 별도 폴링을 추가하지 않는다.


레벨별 보상(2026-11-25): `economy.json.levelBaseUnits`는 1성장 단위=1,000 EXP 환산과 별개인 레벨별 기본 입력량이다. `awardComboTaps`의 `startScore`가 있으면 각 입력 직전 누적 동 점수로 기본 입력량을 결정하고 정수 틱으로 선물·콤보를 곱한다. 서버 Transaction과 브라우저 outbox 재생 모두 같은 절차를 사용한다. 승인된 배치는 재계산하지 않으며, 미전송 입력은 새 기준으로 재생한다. 레벨 경계/동시 사용자에 따라 최종값은 서버 원장이 확정한다. 기존 원장의 단위와 batchId/API는 유지한다. 세부 난이도 가정은 GAMEPLAY_NOTES.md 최신 절과 `scripts/balance-economy.mjs` 참조.
