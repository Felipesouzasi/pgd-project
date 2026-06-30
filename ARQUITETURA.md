# Arquitetura do Sistema - PGD (Planejamento e Gestão de Despesas)

Este documento descreve a arquitetura macro do sistema PGD utilizando a notação [C4 Model](https://c4model.com/).
A arquitetura foi projetada para suportar alta disponibilidade, clara separação de responsabilidades (Frontend desacoplado) e forte segurança com validação de Tokens JWT.

## Nível 1: Diagrama de Contexto (System Context)

O diagrama de contexto mostra como o Sistema PGD se encaixa no ambiente corporativo, quem são os usuários que o utilizam, e com quais sistemas externos ele se comunica para exercer sua função completa.

```mermaid
C4Context
    title Diagrama de Contexto (Nível 1) - Sistema PGD

    Person(user, "Usuário (GD, COM, GER, ADM)", "Acessa o sistema para criar, visualizar, aprovar ou reprovar ações.")
    
    System(pgd, "Sistema PGD", "Permite o planejamento de verbas, solicitação de pagamentos, comprovantes e aprovação multinível de despesas.")

    System_Ext(db_sap, "Views Estruturais / SAP", "Fornece dados imutáveis de filiais, hierarquia e dados mestre.")
    System_Ext(smtp, "Servidor SMTP", "Serviço corporativo para envio de e-mails transacionais (aprovações, recusas).")

    Rel(user, pgd, "Usa o sistema via", "Browser (HTTPS)")
    Rel(pgd, db_sap, "Lê dados da estrutura corporativa", "TCP")
    Rel(pgd, smtp, "Dispara e-mails de notificação", "SMTP")
```

---

## Nível 2: Diagrama de Containers (Containers)

No nível 2, "damos um zoom" dentro do Sistema PGD (a caixa azul do diagrama acima) para entender como ele é construído internamente. Ele é baseado na clássica arquitetura de Três Camadas (SPA + API + Banco).

```mermaid
C4Container
    title Diagrama de Containers (Nível 2) - Sistema PGD

    Person(user, "Usuário", "Browser / Mobile")

    System_Boundary(pgd_boundary, "Ambiente Interno - Sistema PGD") {
        Container(spa, "Aplicação Frontend", "React, Vite, TailwindCSS, React Query", "Single-Page Application. Apresenta o Dashboard, Máquina de Estados e Formulários.")
        
        Container(api, "API Backend", "Node.js, NestJS", "Fornece endpoints REST, validações de negócio, geração de PDFs e lida com o banco de dados. Autenticação via JWT.")
        
        ContainerDb(db, "Banco de Dados Transacional", "PostgreSQL", "Armazena de forma persistente as ações, produtos, culturas, clientes, status e auditorias (logs).")
    }

    System_Ext(smtp, "Servidor SMTP Externo", "Notificações e Alertas")

    Rel(user, spa, "Interage com as Telas", "HTTPS")
    Rel(spa, api, "Faz requisições REST (GET, POST, PATCH)", "JSON via HTTPS")
    Rel(api, db, "Lê/Grava via Pool de Conexões", "TCP (Driver PG)")
    Rel(api, smtp, "Aciona envios de notificação (Nodemailer)", "SMTP")
```

## Detalhamento Técnico

1. **Frontend (Aplicação React):**
   - Roteamento feito via `react-router-dom`.
   - Gerenciamento de chamadas assíncronas e cache inteligente via `@tanstack/react-query`.
   - Estilização funcional com `Tailwind CSS`.
   
2. **Backend (API NestJS):**
   - Construída de forma modular (`ActionsModule`, `DatabaseModule`, `AuthModule`).
   - Validação forte na entrada utilizando `class-validator` com DTOs.
   - Banco de dados sem ORM pesado, utilizando consultas SQL parametrizadas nativas para máxima performance em relatórios (Query Builder).
   - Documentação de rotas automatizada pelo Plugin nativo do Swagger (disponível na rota `/api/docs`).

3. **Autenticação:**
   - Baseado em `Passport JWT`. Apenas usuários com token válido contendo assinatura digital no Header HTTP são capazes de consumir a API e realizar transações.
