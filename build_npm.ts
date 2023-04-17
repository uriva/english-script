import { build, emptyDir } from "https://deno.land/x/dnt@0.33.1/mod.ts";

const outDir = "./dist";

await emptyDir(outDir);

await build({
  typeCheck: false,
  entryPoints: ["./src/index.ts"],
  outDir,
  shims: { deno: true },
  package: {
    name: "english-script",
    version: "0.0.1",
    description: "Embed natural language in your code",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/uriva/english-script.git",
    },
    bugs: { url: "https://github.com/uriva/english-script/issues" },
  },
  postBuild() {
    Deno.copyFileSync("./LICENSE", outDir + "/LICENSE");
    Deno.copyFileSync("./README.md", outDir + "/README.md");
  },
});
