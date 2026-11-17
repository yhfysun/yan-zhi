export type ImportedBookChapter = {
  title: string;
  paragraphs: string[];
};

export type ParsedImportedBook = {
  title: string;
  chapters: ImportedBookChapter[];
  characterCount: number;
};

const CHAPTER_HEADING = /^\s*((?:第[零〇一二两三四五六七八九十百千万0-9]+[卷章节回篇部集](?:\s|$)[^\n]{0,80})|(?:(?:Chapter|CHAPTER)\s+(?:[0-9]+|[IVXLCDM]+)\b[^\n]{0,80}))\s*$/;

function normalizeText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

function fallbackTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || '本地书籍';
}

function pushParagraph(lines: string[], target: string[]) {
  const paragraph = lines.join('').replace(/[ \t]+/g, ' ').trim();
  lines.length = 0;
  if (paragraph) target.push(paragraph);
}

function chunkLongChapter(chapter: ImportedBookChapter): ImportedBookChapter[] {
  const total = chapter.paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  if (total <= 36_000) return [chapter];
  const chunks: ImportedBookChapter[] = [];
  let paragraphs: string[] = [];
  let size = 0;
  for (const paragraph of chapter.paragraphs) {
    if (size >= 24_000 && paragraphs.length) {
      chunks.push({ title: `${chapter.title}（${chunks.length + 1}）`, paragraphs });
      paragraphs = [];
      size = 0;
    }
    paragraphs.push(paragraph);
    size += paragraph.length;
  }
  if (paragraphs.length) {
    chunks.push({ title: chunks.length ? `${chapter.title}（${chunks.length + 1}）` : chapter.title, paragraphs });
  }
  return chunks.length ? chunks : [chapter];
}

export function decodeBookBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

export function parseBookText(raw: string, fileName = '本地书籍.txt'): ParsedImportedBook {
  const text = normalizeText(raw);
  const title = fallbackTitle(fileName);
  const chapters: ImportedBookChapter[] = [];
  let chapterTitle = '开始阅读';
  let paragraphs: string[] = [];
  let lines: string[] = [];

  const flushChapter = () => {
    pushParagraph(lines, paragraphs);
    if (paragraphs.length) {
      chapters.push(...chunkLongChapter({ title: chapterTitle, paragraphs }));
    }
    paragraphs = [];
  };

  for (const line of text.split('\n')) {
    const heading = line.match(CHAPTER_HEADING)?.[1]?.trim();
    if (heading) {
      flushChapter();
      chapterTitle = heading;
      continue;
    }
    if (!line.trim()) {
      pushParagraph(lines, paragraphs);
      continue;
    }
    lines.push(line.trim());
  }
  flushChapter();

  if (!chapters.length && text) {
    chapters.push(...chunkLongChapter({
      title: '正文',
      paragraphs: text.split(/\n\s*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
    }));
  }

  return {
    title,
    chapters,
    characterCount: text.length,
  };
}
