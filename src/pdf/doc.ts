import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

// PdfDoc — a thin layout layer over pdf-lib. Manages pages, a vertical cursor,
// auto-pagination, per-tenant letterhead header/footer, and text primitives
// (headings, paragraphs, bullets, key/value + data tables). Every exhibit draws
// through this so the whole package shares one look.

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 96; // room for the letterhead header
const MARGIN_BOTTOM = 64; // room for the footer

// StandardFonts encode WinAnsi and THROW on unencodable characters. Map the
// common typographic unicode we use to ASCII, then strip anything else. (Same
// class of bug the CRM hit — bulletproof it here.)
export function sanitize(input: string | null | undefined): string {
  // Every exhibit's text — cells, headings, key-values — funnels through here
  // before drawText. Fixtures never had null fields; real submissions do, so a
  // single null cell used to take the whole package down with an opaque 500.
  // Coalescing nullish to '' at this one chokepoint bulletproofs all 13
  // exhibits against it at once.
  if (input == null) return '';
  return String(input)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/×/g, 'x')
    .replace(/[^\x09\x0A\x20-\x7E]/g, ''); // keep tab/newline + printable ASCII
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = rgb(0.08, 0.12, 0.18);
const MUTED = rgb(0.42, 0.46, 0.52);
const LINE = rgb(0.82, 0.85, 0.88);

// Document-wide minimum type size (pt). Every text primitive clamps to this, so
// no rendered text — including sizes passed in by exhibits — falls below it.
const MIN_FONT = 10;
const clampFont = (n: number): number => Math.max(MIN_FONT, n);

export interface DocMeta {
  brandName: string;
  primaryHex: string;
  version: string; // package version stamp
  packageTitle: string;
}

export interface TableColumn {
  header: string;
  width: number; // fraction of content width (0..1) or absolute pts if >1
}

export class PdfDoc {
  readonly pdf: PDFDocument;
  private meta: DocMeta;
  private accent: RGB;
  reg!: PDFFont;
  bold!: PDFFont;
  italic!: PDFFont;
  private page!: PDFPage;
  private y = 0;
  private pageNum = 0;
  private headerless = false;

  private constructor(pdf: PDFDocument, meta: DocMeta) {
    this.pdf = pdf;
    this.meta = meta;
    this.accent = hexToRgb(meta.primaryHex);
  }

  static async create(meta: DocMeta): Promise<PdfDoc> {
    const pdf = await PDFDocument.create();
    const doc = new PdfDoc(pdf, meta);
    doc.reg = await pdf.embedFont(StandardFonts.Helvetica);
    doc.bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    doc.italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
    return doc;
  }

  get contentWidth(): number {
    return PAGE_W - MARGIN_X * 2;
  }
  get cursorY(): number {
    return this.y;
  }

  // ---- page lifecycle ----
  newPage(opts?: { headerless?: boolean }): void {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pageNum += 1;
    this.headerless = opts?.headerless ?? false;
    if (!this.headerless) this.drawHeader();
    this.drawFooter();
    this.y = PAGE_H - MARGIN_TOP;
  }

  private drawHeader(): void {
    // brand + accent rule
    this.page.drawText(sanitize(this.meta.brandName), {
      x: MARGIN_X,
      y: PAGE_H - 52,
      size: 13,
      font: this.bold,
      color: this.accent,
    });
    const label = sanitize(this.meta.packageTitle);
    this.page.drawText(label, {
      x: PAGE_W - MARGIN_X - this.reg.widthOfTextAtSize(label, 8),
      y: PAGE_H - 50,
      size: 10,
      font: this.reg,
      color: MUTED,
    });
    this.page.drawRectangle({
      x: MARGIN_X,
      y: PAGE_H - 62,
      width: this.contentWidth,
      height: 2,
      color: this.accent,
    });
  }

  private drawFooter(): void {
    this.page.drawRectangle({
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 12,
      width: this.contentWidth,
      height: 0.5,
      color: LINE,
    });
    // Kept short so it fits beside the version/page stamp at the 10pt floor; the
    // full UPPA disclaimer lives on the summary page.
    const left = sanitize('Contractor findings & incurred cost - not a coverage determination.');
    this.page.drawText(left, {
      x: MARGIN_X,
      y: MARGIN_BOTTOM - 24,
      size: MIN_FONT,
      font: this.reg,
      color: MUTED,
    });
    const right = sanitize(`${this.meta.version}  ·  p.${this.pageNum}`);
    this.page.drawText(right, {
      x: PAGE_W - MARGIN_X - this.reg.widthOfTextAtSize(right, MIN_FONT),
      y: MARGIN_BOTTOM - 24,
      size: MIN_FONT,
      font: this.reg,
      color: MUTED,
    });
  }

  // ---- vertical space management ----
  ensure(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) this.newPage();
  }
  spacer(h: number): void {
    this.y -= h;
    if (this.y < MARGIN_BOTTOM) this.newPage();
  }

  // ---- text primitives ----
  private wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const rawLine of sanitize(text).split('\n')) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        out.push('');
        continue;
      }
      let line = '';
      for (const w of words) {
        const trial = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(trial, size) > maxW && line) {
          out.push(line);
          line = w;
        } else {
          line = trial;
        }
      }
      if (line) out.push(line);
    }
    return out;
  }

  heading(text: string, level: 1 | 2 | 3 = 2, sizeOverride?: number): void {
    const size = clampFont(sizeOverride ?? (level === 1 ? 18 : level === 2 ? 13 : 11));
    const font = this.bold;
    this.spacer(level === 1 ? 6 : 12);
    for (const ln of this.wrap(text, font, size, this.contentWidth)) {
      this.ensure(size + 6);
      this.page.drawText(ln, { x: MARGIN_X, y: this.y, size, font, color: this.accent });
      this.y -= size + 4;
    }
    this.y -= 4;
  }

  eyebrow(text: string, size = MIN_FONT): void {
    const s = clampFont(size);
    this.ensure(s + 2);
    this.page.drawText(sanitize(text).toUpperCase(), {
      x: MARGIN_X,
      y: this.y,
      size: s,
      font: this.bold,
      color: MUTED,
    });
    this.y -= s + 4;
  }

  // Draw one line justified — distribute slack evenly across word gaps so the
  // line fills the full measure. Falls back to left for a single word.
  private drawJustified(
    line: string,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB,
    maxWidth: number,
  ): void {
    const words = line.split(' ').filter((w) => w.length > 0);
    if (words.length <= 1) {
      this.page.drawText(line, { x: MARGIN_X, y, size, font, color });
      return;
    }
    const spaceW = font.widthOfTextAtSize(' ', size);
    const wordsW = words.reduce((s, w) => s + font.widthOfTextAtSize(w, size), 0);
    const natural = wordsW + spaceW * (words.length - 1);
    const extra = Math.max(0, maxWidth - natural) / (words.length - 1);
    let cx = MARGIN_X;
    for (const w of words) {
      this.page.drawText(w, { x: cx, y, size, font, color });
      cx += font.widthOfTextAtSize(w, size) + spaceW + extra;
    }
  }

  // Body prose is justified: every wrapped line is filled to the measure except
  // the last line of each paragraph (the line before a hard break, or the final
  // line), which stays left-aligned per convention.
  paragraph(text: string, opts?: { size?: number; color?: RGB; italic?: boolean }): void {
    const size = clampFont(opts?.size ?? 9.5);
    const font = opts?.italic ? this.italic : this.reg;
    const color = opts?.color ?? INK;
    const lh = size + 3.5;
    const lines = this.wrap(text, font, size, this.contentWidth);
    const lastIdx = lines.length - 1;
    lines.forEach((ln, i) => {
      this.ensure(lh);
      if (ln) {
        const continues = i < lastIdx && lines[i + 1] !== '';
        if (continues && ln.includes(' ')) {
          this.drawJustified(ln, this.y, size, font, color, this.contentWidth);
        } else {
          this.page.drawText(ln, { x: MARGIN_X, y: this.y, size, font, color });
        }
      }
      this.y -= lh;
    });
    this.y -= 3;
  }

  bullets(items: string[], opts?: { size?: number }): void {
    const size = clampFont(opts?.size ?? 9.5);
    const lh = size + 3.5;
    const indent = 14;
    for (const item of items) {
      const lines = this.wrap(item, this.reg, size, this.contentWidth - indent);
      lines.forEach((ln, i) => {
        this.ensure(lh);
        if (i === 0) {
          this.page.drawText('-', { x: MARGIN_X + 2, y: this.y, size, font: this.bold, color: this.accent });
        }
        this.page.drawText(ln, { x: MARGIN_X + indent, y: this.y, size, font: this.reg, color: INK });
        this.y -= lh;
      });
    }
    this.y -= 3;
  }

  keyValues(rows: Array<[string, string]>, opts?: { labelWidth?: number }): void {
    const size = MIN_FONT;
    const lh = size + 4;
    const labelW = opts?.labelWidth ?? 150;
    for (const [k, v] of rows) {
      const valueLines = this.wrap(v || '-', this.reg, size, this.contentWidth - labelW - 8);
      valueLines.forEach((ln, i) => {
        this.ensure(lh);
        if (i === 0) {
          this.page.drawText(sanitize(k), { x: MARGIN_X, y: this.y, size, font: this.bold, color: INK });
        }
        this.page.drawText(ln, { x: MARGIN_X + labelW, y: this.y, size, font: this.reg, color: INK });
        this.y -= lh;
      });
    }
    this.y -= 3;
  }

  table(columns: TableColumn[], rows: string[][]): void {
    const size = MIN_FONT;
    const cw = this.contentWidth;
    const widths = columns.map((c) => (c.width <= 1 ? c.width * cw : c.width));
    const xs: number[] = [];
    let acc = MARGIN_X;
    for (const w of widths) {
      xs.push(acc);
      acc += w;
    }
    const drawRow = (cells: string[], font: PDFFont, headerRow: boolean): void => {
      const wrapped = cells.map((cell, i) =>
        this.wrap(cell, font, size, (widths[i] ?? 60) - 8),
      );
      const rowH = Math.max(...wrapped.map((w) => w.length)) * (size + 3) + 6;
      this.ensure(rowH);
      if (headerRow) {
        this.page.drawRectangle({
          x: MARGIN_X,
          y: this.y - rowH + 4,
          width: cw,
          height: rowH,
          color: rgb(0.95, 0.96, 0.975),
        });
      }
      wrapped.forEach((lines, ci) => {
        lines.forEach((ln, li) => {
          this.page.drawText(ln, {
            x: (xs[ci] ?? MARGIN_X) + 3,
            y: this.y - li * (size + 3),
            size,
            font,
            color: headerRow ? this.accent : INK,
          });
        });
      });
      this.y -= rowH;
      this.page.drawRectangle({ x: MARGIN_X, y: this.y + 2, width: cw, height: 0.4, color: LINE });
    };
    drawRow(columns.map((c) => c.header), this.bold, true);
    for (const r of rows) drawRow(r, this.reg, false);
    this.y -= 4;
  }

  hr(): void {
    this.ensure(8);
    this.page.drawRectangle({ x: MARGIN_X, y: this.y, width: this.contentWidth, height: 0.6, color: LINE });
    this.y -= 10;
  }

  // Exhibit tab divider — a full page announcing the exhibit letter + title.
  exhibitCover(letter: string, title: string, subtitle: string): void {
    this.newPage();
    this.y = PAGE_H - 300;
    this.page.drawText(`EXHIBIT ${sanitize(letter)}`, {
      x: MARGIN_X,
      y: this.y,
      size: 40,
      font: this.bold,
      color: this.accent,
    });
    this.y -= 40;
    this.page.drawRectangle({ x: MARGIN_X, y: this.y, width: 80, height: 3, color: this.accent });
    this.y -= 34;
    for (const ln of this.wrap(title, this.bold, 20, this.contentWidth)) {
      this.page.drawText(ln, { x: MARGIN_X, y: this.y, size: 20, font: this.bold, color: INK });
      this.y -= 26;
    }
    this.y -= 6;
    for (const ln of this.wrap(subtitle, this.reg, 11, this.contentWidth)) {
      this.page.drawText(ln, { x: MARGIN_X, y: this.y, size: 11, font: this.reg, color: MUTED });
      this.y -= 15;
    }
    // Body of the exhibit begins on the next page.
    this.newPage();
  }

  // Render a pre-embedded signature image + inspector attribution line.
  // Called synchronously from exhibit M (image is embedded in buildPackage before rendering).
  signatureBlock(
    image: import('pdf-lib').PDFImage,
    opts: { name: string; license: string | null; signedAt: string | null },
  ): void {
    const maxW = 180;
    const maxH = 56;
    const ratio = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * ratio;
    const h = image.height * ratio;
    this.ensure(h + 28);
    this.page.drawImage(image, { x: MARGIN_X, y: this.y - h, width: w, height: h });
    this.y -= h + 6;
    const line = [
      opts.name,
      opts.license ? `License ${opts.license}` : null,
      opts.signedAt ? `Signed ${opts.signedAt}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    this.page.drawText(sanitize(line), {
      x: MARGIN_X,
      y: this.y,
      size: MIN_FONT,
      font: this.reg,
      color: MUTED,
    });
    this.y -= MIN_FONT + 6;
  }

  async bytes(): Promise<Uint8Array> {
    return this.pdf.save();
  }
}
