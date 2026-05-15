# 家庭健身监督打卡 App

一个面向“你 + 爸爸”的 H5/PWA 健身监督应用。当前版本是 **M1 本地骨架**：保留 `Vite + React + TypeScript`，用 `localStorage` 模拟未来 Supabase 数据，不接真实登录、照片上传、Server 酱推送和在线支付。

## 当前 M1 功能

- 学员端：今日任务、拍照打卡模拟、本周计划、历史记录、90 天热力图、罚款流水、付款页、设置页。
- 管理端：计划概览、待审核打卡、到账确认、用户与罚款规则、双学员看板。
- 双学员模型：`我` 兼管理员和学员，`爸爸` 是主学员。
- 罚款流程：基础 `¥10`，连续缺卡递增，封顶 `¥50`；状态包含 `pending`、`paid_claimed`、`confirmed`、`waived`。
- 配置占位：Server 酱 SendKey、微信收款码、Supabase URL / anon key。
- PWA 基础：manifest、图标和简单 service worker。

## 本地运行

```powershell
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:4270/
```

本机 `5170-5269` 端口段被 Windows 保留，所以开发端口固定为 `4270`。

## 验证

```powershell
npm run build
```

## 后续真实接入

M1 先把产品结构和交互跑通。要上线给爸爸真实使用，下一阶段需要接入：

- Supabase Auth：邮箱 / magic link 登录。
- Supabase Postgres：保存用户、训练计划、打卡、罚款和通知记录。
- Supabase Storage：保存打卡照片和微信收款码图片。
- Server 酱：早晨训练、截止提醒、缺卡罚款、审核结果、付款自报提醒。
- Vercel / Netlify：部署成私密网址，再添加到手机主屏幕。

## 需要准备

- Supabase 项目 URL 和 anon key。
- Vercel 或 Netlify 账号。
- 你和爸爸的 Server 酱 SendKey。
- 你的微信个人收款码图片。
- 可选域名。

## 健康边界

这个应用只用于家庭训练记录和习惯监督，不是医学建议或康复处方。老人训练应量力而行，出现疼痛、头晕、胸闷等情况时先停止训练。

训练安排参考 CDC 对 65 岁以上人群的活动建议：每周包含有氧、肌力和平衡活动，其中肌力活动至少每周 2 天。

参考来源：https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html
