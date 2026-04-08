---
title: 문서 관리 가이드
description: 문서 추가, 구조 관리, 버전 관리, 자동화 스크립트 사용법
---

Tech Docs Portal의 문서를 추가하고 관리하는 방법을 안내합니다.

---

## 디렉토리 구조

```
content/docs/
├── meta.json                # 최상위 구조 정의
├── index.mdx                # /docs 랜딩 페이지
├── example-category/        # 카테고리 (사이드바 탭)
│   ├── meta.json            # 카테고리 설정
│   ├── my-project/          # 프로젝트 폴더
│   │   ├── meta.json        # 페이지 순서
│   │   ├── index.mdx        # 프로젝트 개요
│   │   ├── architecture.mdx
│   │   └── api-guide.mdx
│   └── another-project/
│       ├── meta.json
│       ├── index.mdx
│       └── setup.mdx
└── guide/                   # Guide 탭 (독립 섹션)
    ├── meta.json
    ├── index.mdx
    └── ...
```

---

## 간편 업데이트 (자동화 스크립트)

`auto-meta` 스크립트를 사용하면 **meta.json과 frontmatter 없이** `.mdx` 파일만 넣으면 자동으로 사이드바에 표시됩니다.

### 사용법

```bash
# .mdx 파일을 원하는 위치에 복사/생성
cp my-document.mdx content/docs/example-category/my-project/

# 자동으로 meta.json과 frontmatter 생성
npm run auto-meta

# 결과 확인
npm run dev
```

### 동작 방식

1. `content/docs/` 하위 디렉토리를 스캔
2. `meta.json`이 없는 폴더에 자동 생성 (폴더명 기반 title)
3. frontmatter가 없는 `.mdx` 파일에 자동 추가 (파일명 기반 title)
4. `index` 파일이 항상 첫 번째로 정렬

### 옵션

```bash
# 미리보기 (실제 변경 없이 결과만 확인)
npm run auto-meta -- --dry-run

# 기존 meta.json도 재생성 (주의: 덮어쓰기)
npm run auto-meta -- --force
```

> 이미 `meta.json`이 있는 폴더는 건너뜁니다. 순서를 직접 지정하려면 `meta.json`의 `pages` 배열을 수동으로 편집하세요.

---

## 수동 문서 관리

자동화 스크립트 대신 직접 관리하는 방법입니다.

### meta.json 작성법

#### 최상위 meta.json

```json
{
  "pages": ["index", "example-category", "guide"]
}
```

> `pages` 배열의 순서가 사이드바 표시 순서를 결정합니다.

#### 카테고리 meta.json

카테고리는 사이드바 상단의 독립 탭으로 표시됩니다.

```json
{
  "title": "Example Category",
  "root": true,
  "defaultOpen": true,
  "pages": ["my-project", "another-project"]
}
```

| 필드 | 설명 |
|------|------|
| `title` | 사이드바 탭에 표시되는 이름 |
| `root` | `true`이면 독립 탭으로 표시 |
| `defaultOpen` | `true`이면 사이드바 폴더가 기본 펼침 |
| `pages` | 하위 폴더/페이지 목록 (순서 = 사이드바 순서) |

#### 프로젝트 meta.json

```json
{
  "title": "My Project",
  "pages": ["index", "architecture", "api-guide"]
}
```

### Frontmatter 작성법

모든 `.mdx` 파일의 상단에 YAML frontmatter가 필요합니다.

```yaml
---
title: 페이지 제목
description: 페이지 설명 (선택, 검색/메타태그에 사용)
---

본문 내용을 여기에 작성합니다...
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `title` | O | 사이드바, 브라우저 탭, 페이지 상단에 표시 |
| `description` | X | 검색 결과, 메타태그에 사용 |
| `icon` | X | 사이드바 아이콘 |
| `full` | X | `true`이면 전체 너비 레이아웃 |

> `title`이 자동으로 페이지 상단에 렌더링되므로, 본문에 `# 제목`을 중복 작성할 필요가 없습니다.

---

## 문서 추가 예제

### 예제 1: 기존 프로젝트에 페이지 추가

```bash
# 1. .mdx 파일 생성
cat > content/docs/example-category/my-project/deployment.mdx << 'EOF'
---
title: 배포 가이드
description: My Project 배포 방법
---

배포 관련 내용을 작성합니다.
EOF

# 2. meta.json에 추가 (또는 npm run auto-meta 실행)
# content/docs/example-category/my-project/meta.json
```

```json
{
  "title": "My Project",
  "pages": ["index", "architecture", "api-guide", "deployment"]
}
```

### 예제 2: 새 프로젝트 추가

```bash
# 1. 디렉토리 생성
mkdir -p content/docs/example-category/new-project

# 2. index.mdx 작성
cat > content/docs/example-category/new-project/index.mdx << 'EOF'
---
title: New Project 개요
description: 새 프로젝트 설명
---

프로젝트 소개 내용을 작성합니다.
EOF

# 3-1. 자동화 스크립트 사용 (간편)
npm run auto-meta

# 3-2. 또는 수동으로 meta.json 생성
echo '{"title": "New Project", "pages": ["index"]}' > content/docs/example-category/new-project/meta.json
# + 상위 meta.json의 pages에 "new-project" 추가
```

### 예제 3: 새 카테고리(탭) 추가

```bash
# 1. 카테고리 디렉토리 생성
mkdir -p content/docs/new-category

# 2. meta.json 생성
cat > content/docs/new-category/meta.json << 'EOF'
{
  "title": "New Category",
  "root": true,
  "defaultOpen": true,
  "pages": ["my-first-project"]
}
EOF

# 3. 최상위 meta.json에 등록
# content/docs/meta.json의 pages에 "new-category" 추가

# 4. src/app/docs/layout.tsx에 탭 추가
# tabs 배열에 { title: 'New Category', url: '...', urls: urlsNewCategory } 추가
```

> 카테고리를 추가하면 사이드바 상단에 새 탭이 나타납니다.

---

## 버전 관리

동일 프로젝트의 여러 버전을 관리하는 방법입니다.

| 방법 | 설명 | 예시 |
|------|------|------|
| 폴더 분리 | 버전별 별도 폴더 | `my-project/`, `my-project-v2/` |
| 버전 선택기 | 사이드바 드롭다운으로 전환 | `version-selector.tsx` 설정 |

### 버전 선택기 사용

`src/components/version-selector.tsx`의 `projectVersions`에 프로젝트를 등록합니다:

```typescript
const projectVersions: Record<string, VersionDef[]> = {
  'my-project': [
    { label: 'v1', pathKey: '/docs/example-category/my-project', url: '/docs/example-category/my-project' },
    { label: 'v2', pathKey: '/docs/example-category/my-project-v2', url: '/docs/example-category/my-project-v2' },
  ],
};
```

> 해당 프로젝트 페이지에 접속하면 사이드바 하단에 버전 드롭다운이 자동으로 표시됩니다.

---

## 정적 파일 (이미지, 다운로드)

정적 파일은 `public/` 디렉토리에 저장합니다.

```
public/
├── images/        # 이미지 파일
│   └── diagram.png
└── files/         # 다운로드 파일 (PDF, Excel 등)
    ├── report.pdf
    └── template.xlsx
```

MDX에서 사용:

```md
![다이어그램](/images/diagram.png)
[보고서 다운로드](/files/report.pdf)
```

---

## 빌드 및 배포

### 로컬 실행

```bash
# 개발 모드 (Hot Reload — 파일 수정 즉시 반영)
npm run dev
```

### Docker 실행 (권장)

```bash
# 시작 (볼륨 마운트 + 개발 모드)
docker compose up -d
```

Docker는 프로젝트 디렉토리를 볼륨 마운트하여 실행합니다.
`.mdx` 파일을 추가/수정하면 **재시작 없이 즉시 반영**됩니다 (Hot Reload).

```bash
# 문서 추가 후 auto-meta 실행 (Docker 내부)
docker compose exec docs-portal npm run auto-meta

# 로그 확인
docker compose logs -f

# 중지
docker compose down
```

### 프로덕션 빌드 (선택)

정적 파일로 배포하려면:

```bash
npm run build && npm run start
```

---

## 요약 체크리스트

### 간편 방법 (자동화)

| 단계 | 작업 |
|------|------|
| 1 | `.mdx` 파일을 원하는 폴더에 생성/복사 |
| 2 | `npm run auto-meta` 실행 |
| 3 | `npm run dev`로 확인 |

### 수동 방법

| 단계 | 작업 | 필수 |
|------|------|------|
| 1 | `.mdx` 파일 작성 (frontmatter 포함) | O |
| 2 | 해당 폴더 `meta.json`의 `pages`에 추가 | O |
| 3 | 새 폴더인 경우 `meta.json` 생성 | O |
| 4 | 새 폴더인 경우 상위 `meta.json`에 등록 | O |
| 5 | `npm run build` 또는 `npm run dev` | O |
