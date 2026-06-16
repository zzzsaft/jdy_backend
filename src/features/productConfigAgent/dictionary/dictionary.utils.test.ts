import assert from "node:assert/strict";
import { formatStructuredTextNormalizedValue } from "./dictionary.utils.js";

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "A层比例",
    rawValue: "15%",
  }),
  "A层比例: 15%",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "B层比例",
    rawValue: "70%",
  }),
  "B层比例: 70%",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "一层",
    rawValue: "20%",
  }),
  "一层: 20%",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "二层配比",
    rawValue: "80%",
  }),
  "二层配比: 80%",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "芯层占比",
    rawValue: "50%",
  }),
  "芯层占比: 50%",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "layer_ratio",
    rawFieldName: "复合比例",
    rawValue: "15/70/15",
  }),
  "复合比例: 15/70/15",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "throughput",
    rawFieldName: "产量",
    rawValue: "3000 kg/h",
  }),
  "3000 kg/h",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "extruder_model",
    rawFieldName: "D层挤出机型号",
    rawValue: "配Φ100挤出机，产量225 kg/h以下，原料：",
  }),
  "D层挤出机型号: 配Φ100挤出机，产量225 kg/h以下，原料：",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "extruder_model",
    rawFieldName: "一层挤出机型号",
    rawValue: "Φ65单螺杆",
  }),
  "一层挤出机型号: Φ65单螺杆",
);

assert.equal(
  formatStructuredTextNormalizedValue({
    termType: "extruder_model",
    rawFieldName: "主挤出机型号",
    rawValue: "SJ-120",
  }),
  "主挤出机型号: SJ-120",
);

console.log("productConfigAgent dictionary utils tests passed");
