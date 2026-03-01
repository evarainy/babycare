# BabyCare

BabyCare 是一个「微信小程序 + 云函数」的婴儿喂养记录系统，支持：

- 手动记录（小程序记录页）
- AI 自然语言解析（`llm-parser`）
- Siri 快捷指令语音录入（`babycare-api.siriRecord`）
- 企业微信群机器人辅助录入（`wechat-bot`）

---


## 0. 云环境变更提醒（每次发版请先看）

如果代码改动涉及云函数或数据库，需要同步执行云环境操作。

**本次版本（宝宝信息修正）需执行：**
- 重新上传部署云函数：`cloudfunctions/babycare-api`（新增 `deleteBaby` 接口、默认宝宝初始化逻辑调整）。
- 无新增环境变量。
- 无新增集合；已有 `babies/users/feeding_records` 继续沿用。

详细步骤见 `DEPLOY.md` 的「云环境同步清单（按版本）」章节。

---

## 1. 快速开始

1. 用微信开发者工具导入仓库根目录 `babycare/`
2. 在 `miniprogram/app.js` 中配置云开发环境 ID
3. 部署云函数：
   - `cloudfunctions/babycare-api`
   - `cloudfunctions/llm-parser`
   - `cloudfunctions/wechat-bot`
4. 按 `DEPLOY.md` 完成环境变量、数据库集合和索引初始化

---

## 2. Siri 对接（重点）

### 2.1 云函数端要求

`babycare-api` 需要配置环境变量：

```bash
SIRI_SECRET=your-siri-secret
```

`siriRecord` 接口请求体约定：

```json
{
  "action": "siriRecord",
  "text": "8点奶粉120，12点亲喂20分钟",
  "secret": "your-siri-secret",
  "userId": "ios-shortcut-user"
}
```

字段说明：

- `action`：固定 `siriRecord`
- `text`：Siri 听写后的自然语言文本
- `secret`：与 `SIRI_SECRET` 一致
- `userId`：Siri 场景的用户标识（建议固定，不要频繁变更）

> 说明：Siri 调用通常没有微信 `OPENID`，所以 `userId` 是必须的兜底标识。

### 2.2 iPhone 快捷指令配置步骤

1. 打开 iPhone「快捷指令」App，新建快捷指令
2. 添加动作：
   - `听写文本`
   - `运行脚本`（粘贴 `siri-shortcut/siri-action.js`）
   - `朗读文本`（可选）
3. 在脚本内改 3 个常量：
   - `API_URL`：你的 `babycare-api` HTTP 地址
   - `API_SECRET`：你的 `SIRI_SECRET`
   - `SIRI_USER_ID`：固定用户 ID（如 `mom-iphone`）
4. 绑定 Siri 唤醒词（如“记录喂奶”）

### 2.3 快速联调（推荐先用 curl）

```bash
curl -X POST "https://YOUR_ENV_ID.service.tcloudbase.com/babycare-api" \
  -H "Content-Type: application/json" \
  -H "X-Siri-Secret: your-siri-secret" \
  -d '{
    "action":"siriRecord",
    "text":"8点奶粉120ml，12点亲喂20分钟",
    "secret":"your-siri-secret",
    "userId":"mom-iphone"
  }'
```

返回 `code=0` 即链路打通。

---

## 3. 常见问题

- `认证失败 (401)`：`API_SECRET` 与云函数 `SIRI_SECRET` 不一致
- `缺少用户标识`：请求里没传 `userId`
- `LLM解析失败`：检查 `llm-parser` 的 `LLM_API_KEY / LLM_BASE_URL / LLM_MODEL`
- `未解析到可用记录`：输入建议带类型 + 数值，如“奶粉120ml”“亲喂左侧15分钟”

---

## 4. 说明文档

- 从 0 到上线部署：`DEPLOY.md`
- Siri 脚本模板：`siri-shortcut/siri-action.js`
