-- ============================================================
-- Correção: campo "planejada"/"planejado" dos itens do cadastro
-- Rodar uma vez no banco.
--
-- Contexto: até esta versão, a criação da ação gravava
-- planejada = 'N' em TODOS os produtos/culturas, fazendo com
-- que na tela de comprovação tudo aparecesse como "Novo".
-- Como antes não havia como adicionar itens na comprovação de
-- forma persistente, todos os registros existentes vieram do
-- cadastro e são, portanto, PLANEJADOS.
--
-- Colunas (char(1), valores 'S'/'N'/' '):
--   pgd_acao_produto / pgd_acao_cultura : planejada, trabalhado
--   pgd_acao_cliente                    : planejado, trabalhado
-- ============================================================

-- 1. Itens não-planejados existentes = criados com o bug → trabalhado pré-preenchido 'S'
--    (não mexe nos S/N legítimos de comprovações reais, que têm planejada='S')
UPDATE pgd_acao_produto SET trabalhado = 'S'
  WHERE (planejada IS NULL OR planejada IN (' ', 'N'))
    AND (trabalhado IS NULL OR trabalhado IN (' ', 'N'));
UPDATE pgd_acao_cultura SET trabalhado = 'S'
  WHERE (planejada IS NULL OR planejada IN (' ', 'N'))
    AND (trabalhado IS NULL OR trabalhado IN (' ', 'N'));

-- 2. Todos os produtos/culturas existentes vieram do cadastro → planejados
UPDATE pgd_acao_produto SET planejada = 'S';
UPDATE pgd_acao_cultura SET planejada = 'S';

-- 3. Clientes: coluna correta é "planejado"; adicionar cliente_nome p/ exibição
ALTER TABLE pgd_acao_cliente ADD COLUMN IF NOT EXISTS cliente_nome VARCHAR(255);

UPDATE pgd_acao_cliente SET planejado  = 'S' WHERE planejado  IS NULL OR planejado  IN (' ', 'N');
UPDATE pgd_acao_cliente SET trabalhado = 'S' WHERE trabalhado IS NULL OR trabalhado IN (' ', 'N');

-- 4. Backfill do nome do cliente a partir do master SAP (quando vazio)
UPDATE pgd_acao_cliente ac
   SET cliente_nome = pn.nome
  FROM (SELECT cod_pn::text AS cod, MIN(nome) AS nome
          FROM sap_4hana.pn_cliente GROUP BY cod_pn) pn
 WHERE pn.cod = ac.cliente_id
   AND (ac.cliente_nome IS NULL OR ac.cliente_nome = '');
