export class CreateProductDto {
  produto_id!: number;
  fornecedor_rtv?: string;
  planejada?: string;   // 'S' | 'N'
  trabalhado?: string;  // 'S' | 'N'
}

export class CreateCulturaDto {
  cultura_id!: number;
  planejada?: string;   // 'S' | 'N'
  trabalhado?: string;  // 'S' | 'N'
}

export class CreateClienteDto {
  cliente_id!: string;
  cliente_nome?: string;
}

export class CreateActionDto {
  tp_acao!: 'DT' | 'R' | 'DINAC';
  consultor_id?: number;
  unidade!: string;
  gerente_gd_id?: number;
  gerente_regional_id?: number;
  gerente_unidade_id?: number;
  municipio_acao!: number;
  filial_id?: string;
  dtm_id?: number;
  tripe_item_id?: number;
  dt_acao!: string;
  atividade_id!: number;
  atividade_justificativa?: string;
  rel_desenv_lavoura?: string;
  vlr_previsto_ar?: number;
  sem_vlr_previsto_ar?: boolean;
  vlr_previsto_fornecedor?: number;
  sem_vlr_previsto_fornecedor?: boolean;
  publico_previsto?: number;
  obs?: string;
  lista_presenca?: string;
  lista_presenca_2?: string;
  lista_presenca_3?: string;
  produtos?: CreateProductDto[];
  culturas?: CreateCulturaDto[];
  clientes?: CreateClienteDto[];
  enviar_analise?: boolean;
}
