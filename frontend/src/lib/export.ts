import type { Acao } from '../types';

export const EXPORT_HEADERS = [
  'Ação', 'Data Ação', 'Consultor', 'Filial', 'Município',
  'Atividade', 'Vlr Prev. AR', 'Produtos', 'Culturas', 'Status',
];

export function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('T')[0].split('-');
  return `${day}/${m}/${y}`;
}

export function cleanStatus(s: string | null) {
  if (!s) return '';
  return s.replace(/^\d+-/, '').trim();
}

export function splitBr(v: string | null): string[] {
  if (!v) return [];
  return v.split(/<br\s*\/?>|\n/).map((i) => i.trim()).filter(Boolean);
}

function getRow(r: Acao, separator: string) {
  return [
    r.acao_id,
    fmtDate(r.dt_acao),
    r.consultor ?? '',
    r.filial ?? '',
    r.municipio ?? '',
    r.atividade ?? '',
    (r.vlr_previsto_ar ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
    splitBr(r.produtos).join(separator),
    splitBr(r.culturas).join(separator),
    cleanStatus(r.status_nome),
  ];
}

/* Excel via HTML table ─────────────────────────────────────────────────────
   x:str em cada <td> impede que Excel interprete "- PRODUTO" como fórmula  */
export function exportExcel(rows: Acao[]) {
  const esc = (v: unknown) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '&#10;'); // quebra dentro da célula

  const cellStyle = 'vertical-align:top;white-space:pre-wrap;font-family:Calibri;font-size:11pt';
  const hdStyle   = 'background:#1a5276;color:#fff;font-weight:bold;font-family:Calibri;font-size:11pt';

  const header = EXPORT_HEADERS.map(
    (h) => `<th style="${hdStyle}">${h}</th>`,
  ).join('');

  const body = rows
    .map((r) => {
      const cells = getRow(r, '\n')
        .map((v) => `<td x:str style="${cellStyle}">${esc(v)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>Ações</x:Name>
<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table border="1" style="border-collapse:collapse">
<thead><tr>${header}</tr></thead>
<tbody>${body}</tbody>
</table></body></html>`;

  download('﻿' + html, 'acoes.xls', 'application/vnd.ms-excel;charset=utf-8');
}

/* CSV ──────────────────────────────────────────────────────────────────────
   Produtos/culturas separados por " | " — evita célula iniciando com "-"   */
export function exportCSV(rows: Acao[]) {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    EXPORT_HEADERS.map(q).join(';'),
    ...rows.map((r) => getRow(r, ' | ').map(q).join(';')),
  ];
  download('﻿' + lines.join('\r\n'), 'acoes.csv', 'text/csv;charset=utf-8');
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
