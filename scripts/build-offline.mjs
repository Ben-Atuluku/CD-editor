import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const htmlPath = path.join(dist, "index.html");

if (!fs.existsSync(htmlPath)) {
  console.error("dist/index.html is missing — run `npm run build` first.");
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf8");

const readAsset = (href) => {
  const relative = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\.?\//, "");
  return fs.readFileSync(path.join(dist, relative), "utf8");
};

// Drop preload hints; nothing is fetched once everything is inline.
html = html.replace(/\s*<link[^>]+rel="modulepreload"[^>]*>/g, "");

html = html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_match, href) => {
  const css = readAsset(href);
  return `<style>\n${css}\n</style>`;
});

html = html.replace(
  /<script[^>]+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_match, src) => {
    const code = readAsset(src).replace(/<\/script>/gi, "<\\/script>");
    return `<script type="module">\n${code}\n</script>`;
  },
);

const targets = [path.join(root, "CD-editor.html"), path.join(dist, "CD-editor.html")];
for (const target of targets) {
  fs.writeFileSync(target, html);
  console.log(`Wrote ${path.relative(root, target)} (${(html.length / 1024).toFixed(0)} KB)`);
}

const readme = path.join(root, "README.md");
if (fs.existsSync(readme)) {
  fs.copyFileSync(readme, path.join(dist, "README.md"));
  console.log("Copied README.md into dist/");
}
