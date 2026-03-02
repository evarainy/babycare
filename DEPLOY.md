# BabyCare 从 0 到上线部署指南（微信小程序 + CloudBase）

> 适用于首次部署。按顺序执行即可。

## 0. 本次代码更新后必须做的云端同步

### 必须执行
1. 重新上传并部署 `cloudfunctions/babycare-api`
2. 重新上传并部署 `cloudfunctions/wechat-bot`
3. 若你改过 `llm-parser`，也同步部署 `cloudfunctions/llm-parser`

### 不需要执行
- 无新增环境变量
- 无新增数据库集合
- 无新增“必须”索引（但建议按本文创建）

---

## 1. 准备账号与工具

1. 注册微信小程序并拿到 `AppID`
2. 开通腾讯云 CloudBase（云开发）并创建环境（记下 `envId`）
3. 安装微信开发者工具（最新稳定版）
4. 拉取项目代码到本地

---

## 2. 导入项目

1. 微信开发者工具 -> 导入项目
2. 选择仓库根目录（包含 `miniprogram/` 和 `cloudfunctions/`）
3. 在 `miniprogram/app.js` 中填写环境 ID

```js
wx.cloud.init({ env: 'YOUR_ENV_ID' })
```

---

## 3. 数据库初始化（CloudBase 控制台）

创建集合：
- `users`
- `babies`
- `feeding_records`
- `bot_bindings`

建议索引：

### `users`
- `openid`（唯一）
- `inviteCode`（唯一、稀疏）
- `botBindCode`（稀疏）

### `babies`
- `familyId + status`
- `familyId + createTime`

### `feeding_records`
- `familyId + status`
- `familyId + recordTime`
- `familyId + babyId + recordTime`（多宝宝强烈建议）

### `bot_bindings`
- `chatid + status`

---

## 4. 云函数部署

在微信开发者工具中，依次右键每个云函数目录：

- `cloudfunctions/babycare-api`
- `cloudfunctions/llm-parser`
- `cloudfunctions/wechat-bot`

选择：**上传并部署（云端安装依赖）**。

> 建议云函数运行时用 Node.js 16/18（CloudBase 控制台可查看）。

---

## 5. 环境变量配置

### `babycare-api`
- `SIRI_SECRET`：Siri 鉴权密钥

### `llm-parser`
- `LLM_API_KEY`
- `LLM_BASE_URL`（OpenAI 兼容）
- `LLM_MODEL`

### `wechat-bot`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `BOT_WEBHOOK_URL`（企业微信群机器人 webhook）

---

## 6. 首次联调（必做）

### 6.1 小程序内联调
1. 打开首页，确认不再报“服务器错误”
2. 打开设置页，确认“加载用户信息/宝宝信息”正常
3. 添加一条记录，回到首页确认汇总更新

### 6.2 Siri 接口联调（curl）

```bash
curl -X POST "https://YOUR_ENV_ID.service.tcloudbase.com/babycare-api" \
  -H "Content-Type: application/json" \
  -H "X-Siri-Secret: your-siri-secret" \
  -d '{
    "action":"siriRecord",
    "text":"奶粉120ml",
    "secret":"your-siri-secret",
    "userId":"mom-iphone"
  }'
```

预期：返回 `code: 0`。

---

## 7. 企业微信群机器人接入（可选）

1. 企业微信群创建机器人并复制 webhook
2. 配置到 `wechat-bot` 的 `BOT_WEBHOOK_URL`
3. 小程序设置页生成绑定码
4. 群内发送：`绑定 XXXXXX`

---

## 8. 常见故障排查

### 8.1 首页 / 设置报 `服务器错误`
通常是云函数代码与本地不一致或函数启动失败：
1. 先重新部署 `babycare-api`、`wechat-bot`
2. 再看云函数日志（按 RequestId）
3. 检查环境变量是否缺失

### 8.2 设置页“加载宝宝失败: 未知操作”
说明云端还是旧版本函数，重新部署 `babycare-api` 即可。

### 8.3 Siri 401 认证失败
`X-Siri-Secret` / `secret` 与云函数 `SIRI_SECRET` 不一致。

---

## 9. 发布上线

1. 微信开发者工具上传代码
2. 微信公众平台提交审核
3. 审核通过后发布

---

## 10. 版本变更时你需要执行什么

后续每次我提交代码，如果涉及云环境改动，我会在 PR 说明和本文件第 0 节明确写：
- 需要重部署哪些云函数
- 是否要新增环境变量
- 是否要新增数据库字段/索引
