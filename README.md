# 家庭健身契约

v1.1 家庭成员版：`Vite + React + TypeScript + Supabase + React Router + PWA + Cloudflare Pages`。当前版本支持管理者绑定多个成员、按成员制定计划、成员当天自定计划、状态备注打卡、审核和账款记录。

## 当前状态

- 已接入 Supabase SDK、Realtime 订阅骨架；历史图片证据表和私有 Storage bucket 保留兼容旧记录，新打卡不再要求上传照片。
- 已拆路由：`/login`、`/`、`/plan`、`/checkin`、`/ledger`、`/admin`、`/admin/members`、`/admin/review`、`/admin/payments`。
- 已拆角色：`student` 只能进学员端，`coach` 只能进管理端。
- 已加成员绑定：管理者可用成员邮箱或成员码绑定已有学员账号，并给每个成员设置管理端显示昵称。
- 已加云端计划：管理者给成员制定计划；无计划时，成员可自己制定当天计划。
- 已改为无照片打卡：成员记录身体状态、异常和备注，管理端按成员审核打卡、请假和备注。
- 已加请假按钮：当天写入 `check_ins.status='excused'`，如有当天罚款则置为 `waived`。
- 已加递增罚款：第 1 天 `¥10`，第 2 天 `¥20`，第 3 天 `¥30`，第 4 天 `¥40`，第 5 天起封顶 `¥50`。
- 已加付款确认闭环：成员只能上报“已付款”，管理端确认后才会变成“已支付”。
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

这会创建 `profiles`、`coach_members`、`plans`、`plan_items`、RLS policy，并保留历史兼容用的 `check_in_evidence` 表和私有 Storage bucket：`checkin-evidence`。

5. 在 Supabase Auth 后台手动创建用户：你和成员。
6. 把 Auth user UUID 插入 `profiles`：

```sql
insert into public.profiles (id, name, role, email) values ('<dad-auth-user-uuid>', '爸爸', 'student', '<dad-email>');
insert into public.profiles (id, name, role, email) values ('<your-auth-user-uuid>', '你的名字', 'coach', '<your-email>');
```

7. 登录管理端后，在“成员”页填写“成员昵称”和成员邮箱/成员码来绑定成员。这个显示昵称保存在 `coach_members.display_name`，不会修改成员账号自己的 `profiles.name`。

## 验证

```powershell
npm run build
```

## 本轮不做

- Server 酱推送。
- 管理端直接创建 Supabase Auth 账号。
- 视频上传。
- 微信收款码付款页。
- Vercel 部署和自定义域名。

## 健康边界

这个应用只用于家庭训练记录和习惯监督，不是医学建议或康复处方。老人训练应量力而行，出现疼痛、头晕、胸闷等情况时先停止训练。

参考来源：https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html
