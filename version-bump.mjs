import { readFileSync, writeFileSync } from "fs";

// package.jsonからバージョンを取得してmanifest.jsonとversions.jsonを更新する
const targetVersion = process.env.npm_package_version;

// manifest.jsonを更新
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// versions.jsonを更新
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
