# 인터넷 폐지줍기 모음

네이버 블로그 RSS를 주기적으로 수집해 앱테크·이벤트·포인트 정보를 한 페이지에 모아주는 자동화 사이트.

- `scripts/sources.json` — 수집할 블로그 RSS 목록
- `scripts/fetch-feeds.js` — RSS를 읽어 `data/items.json`에 병합하고 `docs/index.html`을 다시 생성
- `.github/workflows/update.yml` — 하루 4번 자동 실행 후 변경 사항을 커밋/푸시
- `docs/` — GitHub Pages로 배포되는 정적 사이트

## 새 출처 추가하기

`scripts/sources.json`에 `{ "name": "블로그 이름", "rssUrl": "https://rss.blog.naver.com/아이디.xml" }` 형태로 추가.

## 로컬에서 실행

```
node scripts/fetch-feeds.js
```
