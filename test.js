
const fs = require("fs");
let code = fs.readFileSync("index.html", "utf8");
const start = code.indexOf("function updateTextLabelPreview() {");
const end = code.indexOf("function setTextContourColor");
if(start > -1 && end > -1) {
    const newFunc = "function updateTextLabelPreview() {\\n" +
"                if (!textLabelPreview) return;\\n" +
"\\n" +
"                if (previewUpdateFrame) cancelAnimationFrame(previewUpdateFrame);\\n" +
"\\n" +
"                previewUpdateFrame = requestAnimationFrame(() => {\\n" +
"                    const text = textLabelInput.value.trim() || \\"Preview\\";\\n" +
"                    textLabelPreview.textContent = text;\\n" +
"                    textLabelPreview.style.color = config.labelColor || \\"#000000\\";\\n" +
"                    textLabelPreview.classList.remove(\\"text-cell-contour\\");\\n" +
"                    previewUpdateFrame = null;\\n" +
"                });\\n" +
"            }\\n\\n            ";
    code = code.substring(0, start) + newFunc + code.substring(end);
    fs.writeFileSync("index.html", code, "utf8");
    console.log("Fixed updateTextLabelPreview");
} else {
    console.log("could not find bounds");
}

