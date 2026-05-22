# Album Completo

Site de venda do PDF digital das figurinhas, com checkout Pix, webhook de pagamento e download liberado somente apos confirmacao.

## Deploy no Railway

1. Crie um novo projeto no Railway usando este repositorio.
2. Configure as variaveis de ambiente com base em `.env.example`.
3. No provedor de pagamento, configure o postback para:

```txt
https://SEU-DOMINIO.up.railway.app/api/webhooks/ironpay
```

O Railway usa `npm start` e a rota `/health` como healthcheck.

## Produto

- Nome: `Album Completo`
- Valor: `R$ 19,90`
- Arquivo protegido: `private/Album Completo - Figurinhas.pdf`

O arquivo da pasta `private` nao e servido como estatico. Ele so sai pela rota de download quando o pedido esta pago e com token valido.
