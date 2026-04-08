# VitePress 마이그레이션 계획

## 작성일: 2026-04-08
## 상태: DRAFT

---

## 1. 요구사항 요약

### 목표
fumadocs-mdx (Next.js 16) 기반 docs-portal을 VitePress로 완전 전환하여:
- .md 파일 변경 시 ~200ms HMR 즉시 반영 (현재: Docker에서 30초+)
- 현재 디자인/기능 100% 계승
- Docker Production/Dev 환경 유지

### 현재 스택 → 목표 스택

| 항목 | 현재 (fumadocs) | 목표 (VitePress) |
|------|----------------|-----------------|
| 프레임워크 | Next.js 16 + React 19 | VitePress 1.x + Vue 3 |
| 마크다운 | fumadocs-mdx (.mdx) | VitePress (.md) |
| 번들러 | Webpack/Turbopack | Vite |
| 스타일 | Tailwind CSS v4 + CSS vars | CSS vars (직접) |
| 테마 | next-themes | VitePress 내장 다크모드 |
| 컴포넌트 | React (JSX) | Vue 3 (SFC) |
| HMR | 15~30초 (Docker: 30초+) | ~200ms |

---

## 2. 수용 기준 (Acceptance Criteria)

### 기능 (Functional)
- [ ] AC-1: 56개 콘텐츠 파일이 모두 정상 렌더링됨
- [ ] AC-2: 6종 커스텀 컴포넌트 동작 (Mermaid, Asciinema, Badge, Button, Columns, Details)
- [ ] AC-3: Fumadocs 내장 컴포넌트 대체 동작 (Callout/Hint, Tabs, Steps, Accordions)
- [ ] AC-4: GFM Alert 5종 정상 렌더링 (NOTE, WARNING, TIP, IMPORTANT, CAUTION)
- [ ] AC-5: 연도별 탭/사이드바 네비게이션 동작 (2020~2026 + Guide)
- [ ] AC-6: 버전 전환 동작 (Project Alpha v1/v2)
- [ ] AC-7: 3컬럼 레이아웃 (사이드바 260px | 콘텐츠 | TOC 260px)
- [ ] AC-8: 다크모드 토글 + 민트 테마 (라이트 #11999e / 다크 #30e3ca)
- [ ] AC-9: 반응형 디자인 (768px, 1024px, 1280px 브레이크포인트)
- [ ] AC-10: 검색 기능 동작

### 성능 (Performance)
- [ ] AC-11: Dev 모드 .md 변경 → 브라우저 반영 < 2초
- [ ] AC-12: Docker Dev 모드에서도 변경 반영 < 3초
- [ ] AC-13: Production 빌드 시간 < 30초
- [ ] AC-14: 페이지 초기 로드 < 1초 (Production)

### 인프라 (Infrastructure)
- [ ] AC-15: Docker Production 빌드 + 서빙 정상
- [ ] AC-16: Docker Dev 모드 HMR 정상
- [ ] AC-17: 포트 3030 유지

---

## 3. 구현 단계 (Implementation Steps)

### Phase 0: 브랜치 준비
**담당: git-master**

1. 현재 main 코드를 `fumadocs-backup` 브랜치로 복사
   ```bash
   git checkout -b fumadocs-backup
   git push origin fumadocs-backup
   git checkout main
   ```
2. main에서 fumadocs 관련 파일 정리 (VitePress 초기화 준비)

### Phase 1: VitePress 프로젝트 초기화
**담당: executor-1 (인프라)**

1. VitePress 설치 및 기본 구조 생성
   - `package.json` 재작성 (vitepress, vue, mermaid, asciinema-player 의존성)
   - `.vitepress/config.ts` 생성 (사이트 설정, 포트 3030)
   - `.vitepress/theme/index.ts` 생성 (커스텀 테마 등록)

2. 디렉토리 구조 매핑
   ```
   fumadocs                    →  VitePress
   ─────────────────────────────────────────
   content/docs/               →  docs/
   content/docs/2025/          →  docs/2025/
   content/docs/guide/         →  docs/guide/
   src/app/global.css          →  .vitepress/theme/style.css
   src/components/mdx/         →  .vitepress/theme/components/
   ```

3. VitePress 설정 파일 작성
   - `.vitepress/config.ts`: nav, sidebar (연도별 탭), search, 포트 3030
   - 사이드바 자동 생성 유틸리티 (기존 auto-meta.mjs 대체)

### Phase 2: 테마/디자인 이식
**담당: executor-2 (디자인)**

1. CSS 변수 이식 (`global.css` → `.vitepress/theme/style.css`)
   - 민트 테마 컬러 (라이트/다크)
   - VitePress CSS 변수명으로 매핑:
     ```css
     /* fumadocs → VitePress */
     --color-fd-primary      → --vp-c-brand-1: #11999e
     --color-fd-background   → --vp-c-bg: #f3f6f6
     --color-fd-foreground   → --vp-c-text-1: #40514e
     ```
   - 다크모드 `.dark` 클래스 변수

2. 폰트 설정
   - SUITE Variable (sans), D2Coding (mono) CDN import 유지
   - `--vp-font-family-base`, `--vp-font-family-mono` 오버라이드

3. 테이블 스타일 이식
   - 그라디언트 헤더, 행 스트라이핑, 호버 효과

4. 레이아웃 조정
   - VitePress 기본 3컬럼 (사이드바 | 콘텐츠 | TOC) 활용
   - 사이드바 260px, TOC 260px으로 조정
   - 반응형 미디어쿼리 이식

5. GFM Alert 스타일
   - VitePress는 GitHub-style alerts 네이티브 지원 (v1.0+)
   - 기존 커스텀 색상/스타일 오버라이드

### Phase 3: Vue 컴포넌트 개발
**담당: executor-3 (컴포넌트)**

React → Vue 3 변환 (6종 커스텀 + 4종 Fumadocs 대체):

1. **Mermaid.vue** (`src/components/mdx/mermaid.tsx` → `.vitepress/theme/components/Mermaid.vue`)
   - `mermaid` 패키지 dynamic import 유지
   - `useData()` (VitePress)로 다크/라이트 테마 감지
   - markdown-it plugin으로 ```mermaid 코드블록 자동 변환
   - Props: `chart: string`

2. **Asciinema.vue** (`src/components/mdx/asciinema.tsx` → `.vitepress/theme/components/Asciinema.vue`)
   - `asciinema-player` dynamic import
   - `onMounted`/`onUnmounted` 라이프사이클로 create/dispose
   - Props: src, rows, cols, autoPlay, loop, speed, idleTimeLimit, fit

3. **Badge.vue** (`src/components/mdx/badge.tsx` → `.vitepress/theme/components/Badge.vue`)
   - 9가지 스타일 컬러맵 유지
   - `useData().isDark`로 다크모드 감지
   - Props: style, title, value

4. **Button.vue** (`src/components/mdx/button.tsx` → `.vitepress/theme/components/Button.vue`)
   - outline/solid 변형
   - 외부링크 자동감지 + 아이콘
   - Props: href, variant

5. **Columns.vue + Column.vue** (`columns.tsx` → 2개 Vue 컴포넌트)
   - flex 기반, ratio prop 파싱
   - 반응형 (모바일 스택)
   - Props: ratio, className

6. **Details.vue** (`details.tsx` → `.vitepress/theme/components/Details.vue`)
   - HTML `<details>`/`<summary>` 네이티브 활용 (Vue 래퍼 불필요할 수 있음)
   - Props: title

7. **Callout.vue** (Fumadocs Callout 대체)
   - VitePress custom containers 활용: `::: info`, `::: warning`, `::: danger`, `::: tip`
   - 또는 커스텀 Vue 컴포넌트

8. **Tabs.vue** (Fumadocs Tabs 대체)
   - Vue 3 컴포넌트로 구현
   - 클릭 시 탭 전환, 슬롯 기반

9. **Steps.vue** (Fumadocs Steps 대체)
   - CSS counter + 슬롯 기반 구현

10. 글로벌 컴포넌트 등록 (`.vitepress/theme/index.ts`)
    ```typescript
    export default {
      extends: DefaultTheme,
      enhanceApp({ app }) {
        app.component('Mermaid', Mermaid)
        app.component('Asciinema', Asciinema)
        app.component('Badge', Badge)
        // ...
      }
    }
    ```

### Phase 4: 콘텐츠 마이그레이션
**담당: executor-4 (콘텐츠)**

1. 디렉토리 이동
   ```
   content/docs/*  →  docs/*
   ```

2. 파일 확장자 변환
   ```
   *.mdx → *.md (56개 파일)
   ```

3. MDX 구문 → VitePress 구문 변환
   - JSX 컴포넌트 태그 유지 (VitePress도 `.md`에서 Vue 컴포넌트 사용 가능)
   - `import` 문 제거 (글로벌 등록으로 대체)
   - Fumadocs 컴포넌트 → VitePress 대체:
     ```markdown
     # fumadocs Callout → VitePress container
     <Callout type="info">내용</Callout>
     →
     ::: info
     내용
     :::

     # fumadocs Tabs → 커스텀 Tabs 컴포넌트 (동일 구문 유지)
     <Tabs items={['Tab1','Tab2']}>
     →
     <Tabs :items="['Tab1','Tab2']">
     ```
   - GFM Alert 구문은 변경 없음 (`> [!NOTE]` 등)

4. frontmatter 호환성 확인
   - `title`, `description` 필드는 VitePress에서도 동일하게 사용

5. meta.json → VitePress sidebar config 변환
   - `.vitepress/config.ts`의 `sidebar` 옵션으로 변환
   - 또는 auto-sidebar 유틸리티 작성

6. 자산 파일 이동
   - `public/files/` → `docs/public/files/`
   - 이미지/assets 경로 업데이트

### Phase 5: 네비게이션 구성
**담당: executor-1 (인프라, Phase 1 완료 후)**

1. 상단 네비게이션 (nav)
   ```typescript
   nav: [
     { text: '2026', link: '/2026/project-gamma/' },
     { text: '2025', link: '/2025/project-alpha/' },
     // ... 2020까지
     { text: 'Guide', link: '/guide/' },
   ]
   ```

2. 사이드바 (sidebar) — 연도별/프로젝트별 자동 생성
   ```typescript
   sidebar: {
     '/2025/project-alpha/': [
       { text: 'Overview', link: '/2025/project-alpha/' },
       { text: 'Architecture', link: '/2025/project-alpha/architecture' },
       { text: 'API Guide', link: '/2025/project-alpha/api-guide' },
     ],
     // ...
   }
   ```

3. 버전 전환 (Version Selector)
   - VitePress의 `versioning` 또는 커스텀 드롭다운 컴포넌트
   - Project Alpha v1 ↔ v2 전환

4. 리다이렉트
   - `/docs` → `/2025/project-alpha/` (VitePress rewrites 또는 index.md redirect)

### Phase 6: Docker 설정
**담당: executor-1 (인프라)**

1. **Dockerfile** (Production)
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package.json package-lock.json ./
   RUN npm ci
   COPY . .
   RUN npm run docs:build

   FROM nginx:alpine AS runner
   COPY --from=builder /app/.vitepress/dist /usr/share/nginx/html
   COPY nginx.conf /etc/nginx/conf.d/default.conf
   EXPOSE 3030
   ```

2. **docker-compose.yml** (Production)
   ```yaml
   services:
     docs-portal:
       build: .
       ports:
         - "3030:3030"
       restart: unless-stopped
   ```

3. **docker-compose.dev.yml** (Development)
   ```yaml
   services:
     docs-portal:
       image: node:20-alpine
       working_dir: /app
       ports:
         - "3030:3030"
       volumes:
         - .:/app
         - node_modules:/app/node_modules
       command: sh -c "npm install && npm run docs:dev -- --host 0.0.0.0 --port 3030"
       restart: unless-stopped
   volumes:
     node_modules:
   ```

4. **nginx.conf** (SPA fallback + 정적 서빙)

### Phase 7: 검증 및 정리
**담당: verifier**

1. 모든 AC 항목 검증
2. 빌드 테스트 (`npm run docs:build`)
3. Docker Production/Dev 테스트
4. 브라우저 테스트 (다크모드, 반응형, 컴포넌트)
5. 성능 측정 (HMR 시간, 빌드 시간)
6. 불필요 파일 정리 (src/, fumadocs 설정 등)

---

## 4. 병렬 작업 계획

### 의존 관계 그래프

```
Phase 0 (브랜치 준비)
    │
    ├── Phase 1 (VitePress 초기화) ──┐
    │                                │
    │   Phase 2 (테마/디자인) ───────┤ (Phase 1 완료 후)
    │                                │
    │   Phase 3 (Vue 컴포넌트) ─────┤ (Phase 1 완료 후)
    │                                │
    │   Phase 4 (콘텐츠 변환) ──────┤ (독립 실행 가능)
    │                                │
    ├── Phase 5 (네비게이션) ────────┤ (Phase 1,4 완료 후)
    │                                │
    ├── Phase 6 (Docker) ───────────┤ (Phase 1 완료 후)
    │                                │
    └── Phase 7 (검증) ─────────────┘ (전체 완료 후)
```

### 팀 배분

| 에이전트 | 담당 Phase | 병렬 그룹 |
|----------|-----------|-----------|
| git-master | Phase 0 | 선행 |
| executor-1 | Phase 1 → Phase 5 → Phase 6 | A (인프라) |
| executor-2 | Phase 2 (테마/CSS) | B (디자인) |
| executor-3 | Phase 3 (Vue 컴포넌트) | B (컴포넌트) |
| executor-4 | Phase 4 (콘텐츠 변환) | C (콘텐츠) |
| verifier | Phase 7 | 후행 |

**병렬 실행:**
- Phase 0 완료 후 → Phase 1 실행
- Phase 1 완료 후 → Phase 2, 3, 4, 6 동시 실행
- Phase 2, 3, 4 완료 후 → Phase 5 실행
- 전체 완료 후 → Phase 7 검증

---

## 5. 리스크 및 완화

| 리스크 | 영향도 | 확률 | 완화 방안 |
|--------|--------|------|----------|
| Mermaid 렌더링이 VitePress에서 다르게 동작 | 높음 | 중간 | vitepress-plugin-mermaid 패키지 활용 또는 커스텀 markdown-it 플러그인 |
| Asciinema 플레이어 Vue 호환성 문제 | 중간 | 낮음 | onMounted에서 직접 DOM 조작 (React와 동일 패턴) |
| MDX → MD 변환 시 구문 깨짐 | 높음 | 중간 | 변환 스크립트로 자동화 + 수동 검증 |
| 연도별 탭 UI가 VitePress nav와 다름 | 중간 | 높음 | VitePress nav 커스터마이징 또는 커스텀 레이아웃 |
| CSS 변수 매핑 불일치 | 낮음 | 중간 | VitePress CSS 변수 전체 오버라이드 |
| fumadocs-backup 브랜치 손실 | 높음 | 낮음 | 즉시 remote push로 보호 |

---

## 6. 검증 단계 (Verification Steps)

1. **빌드 검증**: `npm run docs:build` 에러 없이 완료
2. **페이지 렌더링**: 모든 56개 페이지 브라우저 접근 확인
3. **컴포넌트 검증**: `guide/components` 페이지에서 전 컴포넌트 동작 확인
4. **테마 검증**: 라이트/다크 모드 전환, 민트 색상 일치
5. **네비게이션 검증**: 연도별 탭, 사이드바, TOC 동작
6. **성능 검증**: .md 변경 → 브라우저 반영 < 2초 (로컬), < 3초 (Docker)
7. **Docker 검증**: Production 빌드 + Dev HMR 모두 정상
8. **반응형 검증**: 768px, 1024px, 1280px 브레이크포인트

---

## 7. 파일 변경 목록

### 삭제 대상 (fumadocs 관련)
- `src/` 디렉토리 전체 (React 컴포넌트, App Router)
- `content/` 디렉토리 (→ `docs/`로 이동)
- `.source/` 디렉토리 (fumadocs 자동 생성)
- `source.config.ts`
- `next.config.mjs`
- `next-env.d.ts`
- `postcss.config.mjs`
- `tsconfig.json` (VitePress용으로 재작성)

### 신규 생성
- `.vitepress/config.ts` — VitePress 설정
- `.vitepress/theme/index.ts` — 커스텀 테마 진입점
- `.vitepress/theme/style.css` — 민트 테마 CSS
- `.vitepress/theme/components/*.vue` — Vue 컴포넌트 10종
- `docs/` — 콘텐츠 (.md 파일 56개)
- `Dockerfile` — nginx 기반 Production
- `docker-compose.yml` — Production
- `docker-compose.dev.yml` — Development
- `nginx.conf` — 정적 서빙 설정
- `package.json` — VitePress 의존성

### 수정
- `scripts/auto-meta.mjs` → sidebar 자동 생성 유틸리티로 변환
- `.gitignore` — VitePress 빌드 산출물 추가
- `.dockerignore` — VitePress용 업데이트
