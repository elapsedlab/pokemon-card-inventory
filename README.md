# 🃏 寶可夢卡牌庫存系統

Cloudflare Workers + KV 的寶可夢卡牌庫存管理，支援 QR Code 快速查詢位置。

## 功能

- 新增 / 編輯 / 刪除卡片（名稱、系列、編號、狀態、數量、備註）
- 管理儲存位置（Box、活頁本等）
- 每個位置自動產生 QR Code
- 掃描 QR Code 可直接查看該位置的所有卡片
- 搜尋 + 按位置篩選

## 部署

```bash
# 1. 建立 KV namespace
wrangler kv:namespace create INVENTORY
wrangler kv:namespace create INVENTORY --preview

# 2. 把 ID 填入 wrangler.toml

# 3. 部署
wrangler deploy
```

## Authors

- **Kevin** — [@keep-elapsed-time](https://github.com/keep-elapsed-time)
- **Monday** — AI collaborator
