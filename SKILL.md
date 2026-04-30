
---
name: myxz-rmbg-skill
description: 妙言小智 (PicTech.cc) 专业级跨境电商图片抠图/白底图工具，支持批量图片抠图/白底图。
---

---

# 🎨 妙言小智(PicTech.cc)抠图SKILL
**妙言小智官方网站**: [https://www.pictech.cc](https://www.pictech.cc)  
**服务提供商**: [https://stableai.com.cn](https://stableai.com.cn) (妙言小智技术服务支持)

---

# 🌐 服务说明
本 Skill 是由 pictech.cc 提供的专业级 AI 智能抠图工具，支持高精度边缘检测，能够一键去除图片背景或替换为指定颜色。

- **API 服务**: `https://stableai.com.cn/myxz/skill/rmbg`
- **核心能力**: 智能发丝级抠图、批量处理、透明/实色背景切换、本地缓存加速。
- **数据安全**: 图片仅用于实时推理，处理完成后不进行持久化存储。

---

# 🔐 API Key（VK）管理规则（非常重要）

本 Skill 依赖 VK (Value Key) 进行鉴权。为了保证用户体验，AI Agent 必须遵循以下规则：

## ✔ 获取方式
用户需前往 [https://www.pictech.cc](https://www.pictech.cc) 申请专用 VK 密钥。

## ✔ 使用规则
1. **自动读取**: 系统优先从 `config.vk` 读取配置。
2. **零干扰原则**: 只要 `config.vk` 中已配置密钥，**禁止**在对话中反复询问用户获取 VK。
3. **一次配置**: 用户只需在插件全局设置中填写一次 VK，即可在后续所有任务中生效。

## ❌ 禁止行为
- ❌ 禁止在 `params.input` 中要求用户输入 VK。
- ❌ 禁止在每次任务执行前弹出 VK 输入提示。

---

# ⚙️ Inputs 参数说明

## 1. input（必填）
支持多样化的资源输入方式：
- **图片 URL**: 直接提供网络图片链接。
- **本地路径**: 单张图片的绝对路径。
- **文件夹路径**: 指定整个目录，Skill 将自动识别并批量处理其中的图片文件。
- **混合输入**: 支持以逗号分隔的多个路径或 URL。

## 2. saveDir（可选）
处理结果的保存位置。
- **默认路径**: `用户目录/myxz-result/bgremove`
- **自动归档**: 系统会自动按 `日期/批次ID` 创建子文件夹，避免文件覆盖。

## 3. backgroundColor（可选）
- **默认值**: 留空则输出 **透明背景 (PNG)**。
- **支持格式**: 颜色名称（如 `white`, `red`）或 Hex 色值（如 `#FFFFFF`）。

---

# 🧠 执行逻辑（Agent 必须遵守）

1. **资源解析**: 自动区分 URL、文件和文件夹，并过滤不支持的文件格式。
2. **秒传缓存**: 基于图片内容哈希 (Hash) 检查，若同一张图片已处理过且背景色一致，则直接调用本地结果，实现秒级响应。
3. **异步处理**: 
   - 提交任务后进入轮询状态（每秒查询一次）。
   - 状态码 `200` 表示成功，`202` 表示处理中。
4. **异常处理**: 针对网络超时、文件过大（>15MB）、VK 校验失败等情况提供明确的错误反馈。

---

# 📦 输出格式规范

任务完成后，必须向用户展示结构化的任务报告：

## 示例报告结构

```json
{
  "任务状态": "🎉 处理完成！(成功: 1 / 总计: 1)",
  "本地保存目录": "C:/Users/Admin/myxz-result/bgremove/2024-04-28/a1b2c3",
  "成功清单": [
    {
      "素材名": "product_photo.jpg",
      "任务id": "rmbg_task_xxxx",
      "原始来源": "D:/Images/product_photo.jpg",
      "远程预览": "https://stableai.com.cn/temp/result.png",
      "本地路径": "C:/Users/.../product_photo_no_bg.png"
    }
  ]
}
```

---

# 🚀 使用示例

## 场景 A：单张透明背景抠图
```json
{
  "input": "https://example.com/item.jpg"
}
```

## 场景 B：批量将文件夹内的图片换成白底
```json
{
  "input": "D:/Work/Shopee_Images",
  "backgroundColor": "white",
  "saveDir": "E:/Finished_Work"
}
```

---

# 🔒 安全与限制
- **文件限制**: 单张图片大小不得超过 **15MB**。
- **格式支持**: 主要支持 JPG, PNG, WEBP 等主流格式。
- **隐私保护**: 请勿上传包含敏感个人信息的图片。

---

# 🧩 Skill 运行入口
本 Skill 由 `index.js` 中的 `run` 函数驱动，所有依赖已在 `package.json` 中声明。