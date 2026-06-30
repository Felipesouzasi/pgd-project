export class ProdutoComprovacaoDto {
  produto_id!: number;
  trabalhado?: string; // 'S' | 'N'
}

export class CulturaComprovacaoDto {
  cultura_id!: number;
  trabalhado?: string; // 'S' | 'N'
}

export class DespesaDto {
  dt_despesa!: string;
  tp_despesa_id!: number;
  vlr_despesa!: number;
  docto_fiscal?: string;
  comprovante_pagto?: string;
  tp_pgto_id?: number;
}

export class SaveComprovacaoDto {
  vlr_investido_ar?: number;
  sem_vlr_investido_ar?: string;      // 'S' | 'N'
  vlr_investido_fornecedor?: number;
  sem_vlr_investido_fornecedor?: string; // 'S' | 'N'
  publico_realizado?: number;
  obs?: string;
  produtos?: ProdutoComprovacaoDto[];
  culturas?: CulturaComprovacaoDto[];
  enviar?: boolean; // se true → transiciona para status 5
}
