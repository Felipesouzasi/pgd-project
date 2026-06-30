import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import * as PDFDocument from 'pdfkit';
import { PG_POOL } from '../database/database.module';
import * as fs from 'fs';
import * as path from 'path';

interface ProdutoRow  { produto_nome: string; planejada: string; trabalhado: string; }
interface CulturaRow  { cultura_nome: string; planejada: string; trabalhado: string; }
interface DespesaRow  { dt_despesa: string; tipo_despesa: string; vlr_despesa: number; tp_pagto: string; beneficiario: string; }
interface FotoRow     { foto_path: string; legenda: string; }

const fmtMoney = (v: unknown) =>
  Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const fmtDate = (v: unknown): string => {
  if (!v) return '—';
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR');
};

const str = (obj: Record<string, unknown>, k: string) =>
  String(obj[k] ?? '') || '—';

// ── Cores ──────────────────────────────────────────────────────────────────────
const C = {
  headerBg:   '#1a2e1a',   // cabeçalho escuro
  sectionBg:  '#2d6a2d',   // título de seção verde
  sectionTxt: '#ffffff',
  rowAlt:     '#f0f7f0',   // linha par — verde bem claro
  rowNormal:  '#ffffff',
  tableHead:  '#e0ede0',
  border:     '#c8dcc8',
  labelTxt:   '#5a7a5a',
  valueTxt:   '#1a1a1a',
  footerTxt:  '#999999',
  tagBg:      '#e8f5e8',
  tagTxt:     '#2d6a2d',
};

@Injectable()
export class PdfService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async generateAcaoPdf(acaoId: number): Promise<Buffer> {

    const [acaoRes, prodRes, cultRes, despRes, fotoRes] = await Promise.all([
      this.pool.query<Record<string, unknown>>(
        `SELECT * FROM vw_pgd_acao WHERE acao_id = $1`, [acaoId],
      ),
      this.pool.query<ProdutoRow>(
        `SELECT p.produto AS produto_nome,
                CASE WHEN TRIM(ap.planejada) IN ('S','Y','1','t') THEN 'Sim' ELSE 'Não' END AS planejada,
                CASE WHEN TRIM(ap.trabalhado) IN ('S','Y','1','t') THEN 'Sim' ELSE 'Não' END AS trabalhado
         FROM pgd_acao_produto ap
         JOIN pgd_produto p ON p.produto_id = ap.produto_id
         WHERE ap.acao_id = $1 ORDER BY p.produto`, [acaoId],
      ),
      this.pool.query<CulturaRow>(
        `SELECT c.cultura_nome,
                CASE WHEN TRIM(ac.planejada) IN ('S','Y','1','t') THEN 'Sim' ELSE 'Não' END AS planejada,
                CASE WHEN TRIM(ac.trabalhado) IN ('S','Y','1','t') THEN 'Sim' ELSE 'Não' END AS trabalhado
         FROM pgd_acao_cultura ac
         JOIN pgd_cultura c ON c.cultura_id = ac.cultura_id
         WHERE ac.acao_id = $1 ORDER BY c.cultura_nome`, [acaoId],
      ),
      this.pool.query<DespesaRow>(
        `SELECT dc.dt_despesa,
                COALESCE(td.nome, '') AS tipo_despesa,
                COALESCE(dc.vlr_despesa, 0) AS vlr_despesa,
                '' AS tp_pagto, '' AS beneficiario
         FROM pgd_despesa_comprovante dc
         LEFT JOIN pgd_tp_despesa td ON td.id = dc.tp_despesa_id
         WHERE dc.acao_id = $1 ORDER BY dc.dt_despesa`, [acaoId],
      ).catch(() => ({ rows: [] as DespesaRow[] })),
      this.pool.query<FotoRow>(
        `SELECT foto_path, COALESCE(legenda,'') AS legenda FROM pgd_acao_foto
         WHERE acao_id = $1 ORDER BY foto_id`, [acaoId],
      ).catch(() => ({ rows: [] as FotoRow[] })),
    ]);

    if (!acaoRes.rows.length) throw new NotFoundException(`Ação ${acaoId} não encontrada`);

    const acao    = acaoRes.rows[0];
    const prods   = prodRes.rows;
    const cults   = cultRes.rows;
    const desps   = despRes.rows;
    const fotos   = fotoRes.rows;

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true,
        info: { Title: `Ação PGD #${acaoId}`, Author: 'PGD – Adubos Real' } });

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 36, MR = 36;                  // margens laterais
      const PW = doc.page.width;               // 595
      const CW = PW - ML - MR;                 // 523
      let   y  = 0;

      // ── helpers ─────────────────────────────────────────────────────────────

      const ensureSpace = (needed: number) => {
        if (y + needed > doc.page.height - 50) { doc.addPage(); y = 24; }
      };

      // Cabeçalho de seção
      const section = (title: string) => {
        ensureSpace(28);
        doc.rect(ML, y, CW, 22).fill(C.sectionBg);
        doc.rect(ML, y, 4, 22).fill('#7fcc7f');           // acento lateral claro
        doc.fillColor(C.sectionTxt).font('Helvetica-Bold').fontSize(9.5)
          .text(title.toUpperCase(), ML + 10, y + 6.5, { width: CW - 14 });
        y += 26;
      };

      // Grade de campos (1, 2 ou 3 colunas)
      // cols: [{ label, value }, ...]
      const fieldRow = (cols: { label: string; value: string }[], alt = false) => {
        const h = 30;
        ensureSpace(h);
        const colW = CW / cols.length;
        if (alt) doc.rect(ML, y, CW, h).fill(C.rowAlt);
        else     doc.rect(ML, y, CW, h).fill(C.rowNormal);
        // borda inferior
        doc.moveTo(ML, y + h).lineTo(ML + CW, y + h).stroke(C.border);

        cols.forEach((c, i) => {
          const x = ML + i * colW + 8;
          doc.fillColor(C.labelTxt).font('Helvetica').fontSize(7)
            .text(c.label, x, y + 5, { width: colW - 16 });
          doc.fillColor(C.valueTxt).font('Helvetica-Bold').fontSize(9)
            .text(c.value || '—', x, y + 14, { width: colW - 16 });
        });
        y += h;
      };

      // Tabela genérica
      const table = (headers: string[], widths: number[], rows: string[][], headerBg = C.tableHead) => {
        const rowH = 18;
        ensureSpace(rowH + 4);

        // header
        doc.rect(ML, y, CW, rowH).fill(headerBg);
        let hx = ML + 6;
        headers.forEach((h, i) => {
          doc.fillColor(C.valueTxt).font('Helvetica-Bold').fontSize(8)
            .text(h, hx, y + 5, { width: widths[i] - 6 });
          hx += widths[i];
        });
        doc.moveTo(ML, y + rowH).lineTo(ML + CW, y + rowH).stroke(C.border);
        y += rowH;

        rows.forEach((row, ri) => {
          ensureSpace(rowH);
          if (ri % 2 === 0) doc.rect(ML, y, CW, rowH).fill(C.rowAlt);
          else              doc.rect(ML, y, CW, rowH).fill(C.rowNormal);
          doc.moveTo(ML, y + rowH).lineTo(ML + CW, y + rowH).stroke(C.border);

          let rx = ML + 6;
          row.forEach((cell, ci) => {
            doc.fillColor(C.valueTxt).font('Helvetica').fontSize(8)
              .text(cell, rx, y + 5, { width: widths[ci] - 6 });
            rx += widths[ci];
          });
          y += rowH;
        });
        y += 6;
      };

      // ── CABEÇALHO ───────────────────────────────────────────────────────────
      doc.rect(0, 0, PW, 64).fill(C.headerBg);

      const logoPath = path.join(process.cwd(), '..', 'frontend', 'public', 'logo_pgd.png');
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, ML, 10, { height: 44 }); } catch { /**/ }
      }

      // Título à direita do logo
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
        .text('Plano de Gestão de Desenvolvimento', 0, 14,
          { align: 'center', width: PW });
      doc.fillColor('#9fc99f').font('Helvetica').fontSize(9)
        .text(`Ação #${acaoId}  •  Status: ${str(acao,'status_nome').replace(/^\d+-/,'')}`, 0, 36,
          { align: 'center', width: PW });

      y = 76;

      // ── 1. Informações Gerais ───────────────────────────────────────────────
      section('Informações Gerais');
      fieldRow([
        { label: 'Tipo de Ação',   value: str(acao,'tp_acao') },
        { label: 'Consultor',      value: str(acao,'consultor') },
      ], false);
      fieldRow([
        { label: 'Filial',            value: str(acao,'filial') },
        { label: 'Gerente Regional',  value: str(acao,'gerente_regional') },
        { label: 'Gerente de Unidade',value: str(acao,'gerente_unidade') },
      ], true);
      y += 4;

      // ── 2. Informações da Ação ──────────────────────────────────────────────
      section('Informações da Ação');
      fieldRow([
        { label: 'Município', value: str(acao,'municipio') },
        { label: 'DTM',       value: str(acao,'dtm') },
        { label: 'Data',      value: fmtDate(acao['dt_acao']) },
      ], false);
      fieldRow([
        { label: 'Tipo de Atividade', value: str(acao,'atividade') },
        { label: 'Justificativa',     value: str(acao,'atividade_justificativa') },
      ], true);
      y += 4;

      // ── 3. Valores Previstos ────────────────────────────────────────────────
      section('Valores Previstos');
      fieldRow([
        { label: 'Valor AR (R$)',         value: fmtMoney(acao['vlr_previsto_ar']) },
        { label: 'Valor Fornecedor (R$)', value: fmtMoney(acao['vlr_previsto_fornecedor']) },
        { label: 'Público Previsto',      value: String(acao['publico_previsto'] ?? '—') },
      ], false);
      y += 4;

      // ── 4. Valores Investidos ───────────────────────────────────────────────
      section('Valores Investidos');
      fieldRow([
        { label: 'Valor AR (R$)',         value: fmtMoney(acao['vlr_investido_ar']) },
        { label: 'Valor Fornecedor (R$)', value: fmtMoney(acao['vlr_investido_fornecedor']) },
        { label: 'Público Realizado',     value: String(acao['publico_realizado'] ?? '—') },
      ], false);
      y += 4;

      // ── 5. Produtos ─────────────────────────────────────────────────────────
      if (prods.length) {
        section('Produtos');
        const pw = [CW * 0.60, CW * 0.20, CW * 0.20];
        table(
          ['Produto', 'Planejada', 'Trabalhado'], pw,
          prods.map((p, i) => [`${i+1}. ${p.produto_nome}`, p.planejada, p.trabalhado]),
        );
      }

      // ── 6. Culturas ─────────────────────────────────────────────────────────
      if (cults.length) {
        section('Culturas');
        const cw = [CW * 0.60, CW * 0.20, CW * 0.20];
        table(
          ['Cultura', 'Planejada', 'Trabalhado'], cw,
          cults.map((c, i) => [`${i+1}. ${c.cultura_nome}`, c.planejada, c.trabalhado]),
        );
      }

      // ── 7. Despesas ─────────────────────────────────────────────────────────
      if (desps.length) {
        section('Resumo de Despesas');
        const dw = [CW * 0.15, CW * 0.45, CW * 0.40];
        const despRows = desps.map(d => [fmtDate(d.dt_despesa), d.tipo_despesa, `R$ ${fmtMoney(d.vlr_despesa)}`]);
        table(['Data', 'Tipo', 'Valor'], dw, despRows);

        // Total
        ensureSpace(22);
        const total = desps.reduce((s, d) => s + Number(d.vlr_despesa ?? 0), 0);
        doc.rect(ML, y, CW, 20).fill('#d4edda');
        doc.fillColor('#155724').font('Helvetica-Bold').fontSize(9)
          .text(`Total de Despesas: R$ ${fmtMoney(total)}`, ML + 8, y + 5.5);
        y += 24;
      }

      // ── 8. Fotos ─────────────────────────────────────────────────────────────
      if (fotos.length) {
        section('Fotos da Atividade');
        const uploadsDir = path.join(process.cwd(), 'uploads', 'pgd');
        let fx = ML, imgW = (CW - 6) / 2, imgH = 140;

        fotos.forEach((foto, i) => {
          const imgPath = path.join(uploadsDir, foto.foto_path);
          if (!fs.existsSync(imgPath)) return;
          ensureSpace(imgH + 20);
          try {
            doc.image(imgPath, fx, y, { width: imgW, height: imgH, cover: [imgW, imgH] });
            if (foto.legenda) {
              doc.fillColor(C.labelTxt).font('Helvetica').fontSize(7)
                .text(foto.legenda, fx, y + imgH + 2, { width: imgW });
            }
          } catch { /**/ }
          if (i % 2 === 0) { fx = ML + imgW + 6; }
          else             { fx = ML; y += imgH + 18; }
        });
        if (fotos.length % 2 !== 0) y += imgH + 18;
      }

      // ── Rodapés ──────────────────────────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const py = doc.page.height - 22;
        doc.rect(0, py - 4, PW, 26).fill('#f5f5f5');
        doc.moveTo(0, py - 4).lineTo(PW, py - 4).stroke(C.border);
        doc.fillColor(C.footerTxt).font('Helvetica').fontSize(7)
          .text(`PGD – Adubos Real  •  Ação #${acaoId}`, ML, py + 2, { width: CW / 2 })
          .text(`Página ${i + 1} de ${range.count}`, ML, py + 2,
            { width: CW, align: 'right' });
      }

      doc.end();
    });
  }
}
