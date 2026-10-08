import {
  loadSrgbIcc
} from "../chunk-H4RAYUF3.js";
import "../chunk-BJGX7GXP.js";

// src/assets/node.ts
import { readFile } from "fs/promises";
var datei = (name) => new URL(`../../files/${name}`, import.meta.url);
async function loadNodeAssets() {
  const [fontRegular, fontBold] = await Promise.all([
    readFile(datei("Inter-Rechnung-Regular.ttf")),
    readFile(datei("Inter-Rechnung-Bold.ttf"))
  ]);
  return {
    fontRegular: new Uint8Array(fontRegular),
    fontBold: new Uint8Array(fontBold),
    iccProfile: loadSrgbIcc()
  };
}
export {
  loadNodeAssets
};
