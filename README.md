# 家庭健身契约

v2 云同步骨架：`Vite + React + TypeScript + Supabase + React Router + PWA`。本轮把本地原型拆成学员端和管理端，加入请假、自动缺卡同步、递增罚款、路由守卫和 Supabase/RLS 脚本。

## 当前状态

- 已接入 Supabase SDK 和 Realtime 订阅骨架。
- 已拆路由：`/login`、`/`、`/plan`、`/checkin`、`/ledger`、`/admin`、`/admin/review`、`/admin/payments`、`/admin/stats`。
- 已拆角色：`student` 只能进学员端，`coach` 只能进管理端。
- 已加请假按钮：当天写入 `check_ins.status='excused'`，如有当天罚款则置为 `waived`。
- 已加递增罚款：第 1 天 `¥10`，第 2 天 `¥20`，第 3 天 `¥30`，第 4 天 `¥40`，第 5 天起封顶 `¥50`。
- 已使用 `vite-plugin-pwa` 生成 precache，避免旧手写 SW 离线白屏。

没有 `.env.local` 时，应用会显示 Supabase 配置提示，并提供本地预览入口；不会注入演示欠款。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:4270/
```

## Supabase 配置

1. 新建 Supabase 项目。
2. 在项目根目录创建 `.env.local`：

```powershell
Copy-Item .env.example .env.local
```

3. 填入：

```text
VITE_SUPABASE_URL=你的项目 URL
VITE_SUPABASE_ANON_KEY=你的 anon key
```

4. 在 Supabase SQL Editor 运行：

```text
supabase/schema.sql
```

5. 在 Supabase Auth 后台手动创建两个用户：你和爸爸。
6. 把两个 Auth user UUID 插入 `profiles`：

```sql
insert into public.profiles (id, name, role) values ('<dad-auth-user-uuid>', '老张', 'student');
insert into public.profiles (id, name, role) values ('<your-auth-user-uuid>', '你的名字', 'coach');
```

## 验证

```powershell
npm run build
```

## 本轮不做

- 拍照上传到 Supabase Storage。
- Server 酱推送。
- 教练端编辑训练计划。
- 微信收款码付款页。
- Vercel 部署和自定义域名。

## 健康边界

这个应用只用于家庭训练记录和习惯监督，不是医学建议或康复处方。老人训练应量力而行，出现疼痛、头晕、胸闷等情况时先停止训练。

参考来源：https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html
