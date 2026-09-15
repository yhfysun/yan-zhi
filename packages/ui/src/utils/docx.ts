// 极简 OOXML(.docx) 生成器 —— 只覆盖本次需要的两件事：文字段落 + 内嵌图片。
//
// docx 本质是一个 zip：几个固定 XML 部件 + word/media 下的图片二进制。
// 这里手写最小部件集合，不引入 docx 类库（jszip 已是现有依赖）。
//
// 用途：图片 / 含图 markdown 总结一键导出 Word。

import JSZip from 'jszip';

/** EMU（English Metric Unit）换算：1px ≈ 9525 EMU（96dpi） */
const EMU_PER_PX = 9525;
/** A4 正文可用宽度（去掉左右页边距）约 16cm */
const MAX_CONTENT_WIDTH_EMU = 16 * 360000;

export interface DocxImage {
  /** 图片二进制 */
  data: Uint8Array;
  /** 扩展名（png/jpg/jpeg/gif/webp），决定 Content_Types 与 media 文件名 */
  ext: string;
  /** 原始像素宽高（未提供时按 4:3 估算） */
  width?: number;
  height?: number;
  /** 图片下方的说明文字 */
  caption?: string;
}

export interface DocxSection {
  /** 段落文字（空串表示空行） */
  text?: string;
  /** 该段落之后插入的图片 */
  image?: DocxImage;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeExt(ext: string): string {
  const e = (ext || 'png').toLowerCase().replace(/^\./, '');
  return e === 'jpeg' ? 'jpg' : e;
}

function contentTypeOf(ext: string): string {
  switch (normalizeExt(ext)) {
    case 'jpg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'bmp': return 'image/bmp';
    default: return 'image/png';
  }
}

/** 按内容宽度等比缩放，返回 EMU 尺寸 */
function fitEmu(w?: number, h?: number): { cx: number; cy: number } {
  const pxW = w && w > 0 ? w : 800;
  const pxH = h && h > 0 ? h : 600;
  let cx = pxW * EMU_PER_PX;
  let cy = pxH * EMU_PER_PX;
  if (cx > MAX_CONTENT_WIDTH_EMU) {
    cy = Math.round(cy * (MAX_CONTENT_WIDTH_EMU / cx));
    cx = MAX_CONTENT_WIDTH_EMU;
  }
  return { cx, cy };
}

/** 一个文字段落 */
function paragraph(text: string): string {
  if (!text) return '<w:p/>';
  // 段落内换行拆成多个 w:t，保留空行
  const lines = text.split('\n');
  const runs = lines
    .map((line, i) => `${i > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join('');
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs}</w:p>`;
}

/** 图片段落（inline drawing） */
function imageParagraph(img: DocxImage, relId: string, docPrId: number): string {
  const { cx, cy } = fitEmu(img.width, img.height);
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${docPrId}" name="Picture ${docPrId}"/>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic>`
    + `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="image${docPrId}.${normalizeExt(img.ext)}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic>`
    + `</a:graphicData></a:graphic>`
    + `</wp:inline>`
    + `</w:drawing></w:r></w:p>`;
}

const NS_DECL =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

/**
 * 生成 .docx 二进制。
 * @param sections 段落/图片序列（按顺序写入正文）
 * @param title 可选标题（作为首个加粗段落）
 */
export async function buildDocx(sections: DocxSection[], title?: string): Promise<Uint8Array> {
  const zip = new JSZip();

  // 收集图片，分配关系 id 与 media 文件名
  const images: { img: DocxImage; relId: string; mediaName: string }[] = [];
  sections.forEach((s) => {
    if (!s.image) return;
    const idx = images.length + 1;
    images.push({
      img: s.image,
      relId: `rIdImg${idx}`,
      mediaName: `image${idx}.${normalizeExt(s.image.ext)}`,
    });
  });

  const exts = [...new Set(images.map((i) => normalizeExt(i.img.ext)))];

  // ---- 正文 ----
  const body: string[] = [];
  if (title && title.trim()) {
    body.push(
      `<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(title.trim())}</w:t></w:r></w:p>`,
    );
  }
  let imgCursor = 0;
  for (const s of sections) {
    if (s.text !== undefined && s.text !== '') body.push(paragraph(s.text));
    if (s.image) {
      const entry = images[imgCursor++];
      body.push(imageParagraph(entry.img, entry.relId, imgCursor));
      if (entry.img.caption) {
        body.push(
          `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:r>`
          + `<w:rPr><w:color w:val="808080"/><w:sz w:val="18"/></w:rPr>`
          + `<w:t xml:space="preserve">${esc(entry.img.caption)}</w:t></w:r></w:p>`,
        );
      }
    }
  }
  if (body.length === 0) body.push('<w:p/>');

  // ---- 固定部件 ----
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + exts.map((e) => `<Default Extension="${e}" ContentType="${contentTypeOf(e)}"/>`).join('')
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>';

  const docRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + images
      .map(
        (i) =>
          `<Relationship Id="${i.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${i.mediaName}"/>`,
      )
      .join('')
    + '</Relationships>';

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document ${NS_DECL}>`
    + `<w:body>${body.join('')}`
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>'
    + '</w:sectPr></w:body></w:document>';

  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  for (const i of images) zip.file(`word/media/${i.mediaName}`, i.img.data);

  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return out;
}

/** 读图片原始像素尺寸（用于 docx 里等比排版）；失败返回 undefined */
export function measureImage(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(undefined); return; }
    const img = new Image();
    const timer = setTimeout(() => resolve(undefined), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(undefined);
    };
    img.src = src;
  });
}
