// Orchestrates the full daily pipeline: collect new items -> write a draft ->
// publish it to Tistory -> commit the updated data files to GitHub.
// Meant to be triggered by a scheduled task on this machine.

const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BLOG_URL = process.env.TISTORY_BLOG_URL || process.argv[2];

if (!BLOG_URL) {
  console.error("TISTORY_BLOG_URL 환경변수 또는 인자로 블로그 주소를 지정하세요.");
  process.exit(1);
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

run("node", ["scripts/fetch-feeds.js"]);
run("node", ["scripts/generate-drafts.js"]);
run("node", ["scripts/publish-tistory.js", BLOG_URL]);

try {
  run("git", ["add", "data", "docs"]);
  run("git", ["commit", "-m", `Daily update ${new Date().toISOString()}`]);
  run("git", ["push"]);
} catch (e) {
  console.log("커밋할 변경 사항이 없거나 git 작업을 건너뛰었습니다.");
}
