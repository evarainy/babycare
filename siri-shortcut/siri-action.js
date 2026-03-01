const API_URL = "https://YOUR_ENV_ID.service.tcloudbase.com/babycare-api";
const API_SECRET = "YOUR_SIRI_SECRET";
const SIRI_USER_ID = "ios-shortcut-user"; // 建议改成你自己的固定ID（同一人保持一致）

(async () => {
  const inputText = (args.shortcutInput || "").trim();
  if (!inputText) {
    const msg = "请输入要记录的内容，例如：8点奶粉120";
    Script.setShortcutOutput(msg);
    Speech.speak(msg);
    return;
  }

  const req = new Request(API_URL);
  req.method = "POST";
  req.headers = {
    "Content-Type": "application/json",
    "X-Siri-Secret": API_SECRET
  };
  req.body = JSON.stringify({
    action: "siriRecord",
    text: inputText,
    secret: API_SECRET,
    userId: SIRI_USER_ID
  });

  const res = await req.loadJSON();

  if (res.code === 0) {
    const payload = res.data || {};
    const records = Array.isArray(payload.records) ? payload.records : [];
    const first = records[0] || {};

    const typeMap = {
      breastfeeding: "亲喂",
      bottle: "瓶喂",
      food: "辅食",
      swimming: "游泳",
      diaper: "换尿布",
      sleep: "睡眠",
      other: "其他"
    };
    const sideMap = { 左: "左侧", 右: "右侧", 双: "双侧" };

    let msg = `✅ 已记录${payload.count || records.length || 1}条`;
    if (first.type) msg += `（${typeMap[first.type] || first.type}`;
    if (first.side) msg += ` ${sideMap[first.side] || first.side}`;
    if (first.amount) msg += ` ${first.amount}ml`;
    if (first.duration) msg += ` ${first.duration}分钟`;
    if (first.type) msg += `）`;

    const hasPending = records.some((r) => r.status === "pending");
    if (hasPending) msg += "\n⚠️ 有待确认记录，请到小程序确认";

    Script.setShortcutOutput(msg);
    Speech.speak(msg);
  } else {
    const errMsg = "记录失败：" + (res.message || "未知错误");
    Script.setShortcutOutput(errMsg);
    Speech.speak(errMsg);
  }
})().catch((err) => {
  const msg = "请求失败：" + (err.message || "未知错误");
  Script.setShortcutOutput(msg);
  Speech.speak(msg);
});
