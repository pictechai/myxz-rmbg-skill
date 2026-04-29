#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import run from './index.js';

// 获取当前目录，定义 VK 缓存文件
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '.vk_config_rmbg');

async function main() {
    try {
        const rawArg = process.argv[2];
        let params = rawArg ? JSON.parse(rawArg) : {};

        // --- VK 检索逻辑 (优先级：参数 > 本地文件 > 环境变量) ---
        let finalVK = params.vk;

        if (!finalVK && fs.existsSync(CONFIG_PATH)) {
            finalVK = fs.readFileSync(CONFIG_PATH, 'utf-8').trim();
        }

        if (!finalVK) {
            finalVK = process.env.RMBG_VK;
        }

        // 如果本次参数传了 VK，则更新本地缓存
        if (params.vk) {
            fs.writeFileSync(CONFIG_PATH, params.vk, 'utf-8');
        }

        // --- 核心判断：如果没有拿到 VK，触发引导信号 ---
        if (!finalVK) {
            console.log(JSON.stringify({
                status: "NEED_VK",
                message: "未找到有效的抠图 API Key (VK)。请引导用户前往 https://www.pictech.cc/ 申请。"
            }));
            process.exit(0);
        }

        // 注入 VK 并运行混淆的核心逻辑
        params.vk = finalVK;
        const result = await run(params);
        
        // 输出标准结果
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error(JSON.stringify({ status: "ERROR", message: err.message }));
        process.exit(1);
    }
}

main();