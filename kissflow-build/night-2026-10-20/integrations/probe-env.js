// probe: where the Input data lands (temporary; replaced by the real parser)
let output = { inputData: JSON.stringify(inputData).slice(0, 800), contextKeys: Object.keys(context || {}).join(",") };
try { output.ctx = JSON.stringify(context).slice(0, 1500); } catch (e) { output.ctxErr = String(e); }
return output;
