import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import FormData from 'form-data';
import axios from 'axios';
import { initDB, dbOps } from './database.js';
import { utils } from './utils.js';

// 配置常量
const API_BASE = "https://stableai.com.cn/myxz/skill/rmbg";




const MAX_SIZE = 15 * 1024 * 1024; // 15MB

/**
 * 核心执行器
 */
export default async function run(params) {
    let { input, saveDir, backgroundColor} = params;

    const vk = params.config?.vk || params.vk;

    // 1. VK 校验 (优先从参数获取，其次环境变量)
    const activeVK = vk || process.env.RMBG_VK;
    if (!activeVK) {
        return { success: false, error: "缺少 API Key (VK)，请在插件配置中输入。" };
    }

    if (!saveDir || saveDir.trim() === '') {
        saveDir = path.join(process.cwd(), 'myxz-result', 'bgremove');
    }

    // 2. 初始化环境与三级目录
    const absoluteSaveDir = path.resolve(saveDir);
    
    // 生成 日期/批次ID 目录
    const dateStr = new Date().toISOString().split('T')[0]; // 2024-04-28
    const batchId = crypto.randomBytes(3).toString('hex'); // 6位随机ID
    const batchDir = path.join(absoluteSaveDir, dateStr, batchId);

    try {
        await fsPromises.mkdir(batchDir, { recursive: true });
    } catch (err) {
        return { success: false, error: `无法创建目录: ${err.message}` };
    }

    // 初始化数据库
    const db = initDB(absoluteSaveDir);
    await dbOps.cleanup(db); // 清理旧数据

    // 3. 解析输入源 (支持数组, CSV字符串, 文件夹)
    let sources = Array.isArray(input) ? input : (input.includes(',') ? input.split(',') : [input]);
    let tasks = [];
    
    for (let s of sources) {
        s = s.trim();
        if (!s) continue;

        if (s.startsWith('http')) {
            tasks.push({ type: 'url', path: s });
        } else if (fs.existsSync(s)) {
            const stats = await fsPromises.lstat(s);
            if (stats.isDirectory()) {
                const files = await fsPromises.readdir(s);
                for (const f of files) {
                    if (utils.isValidFormat(path.extname(f))) {
                        tasks.push({ type: 'file', path: path.join(s, f) });
                    }
                }
            } else if (utils.isValidFormat(path.extname(s))) {
                tasks.push({ type: 'file', path: s });
            }
        }
    }

    const summary = {
        total: tasks.length,
        details: []
    };

    // 4. 串行处理任务
    for (const task of tasks) {
        let buffer, fileName, tempPath = null;
        try {
            // A. 加载图片数据
            if (task.type === 'url') {
                const dl = await utils.downloadUrl(task.path);
                buffer = dl.buffer;
                fileName = dl.name;
                tempPath = dl.tempPath;
            } else {
                const stats = await fsPromises.stat(task.path);
                if (stats.size > MAX_SIZE) throw new Error("文件超过15MB限制");
                buffer = await fsPromises.readFile(task.path);
                fileName = path.basename(task.path);
            }

            // B. 缓存检查
            const hash = utils.getHash(buffer);
            const targetName = `${path.basename(fileName, path.extname(fileName))}_no_bg.png`;
            const localSavePath = path.join(batchDir, targetName);

            const record = await dbOps.find(db, { hash });
            if (record && record.status === 'success' && fs.existsSync(record.localPath)) {
                summary.details.push({
                    taskId: record.taskId,
                    input: task.path,
                    status: "成功(缓存)",
                    resultUrl: record.remoteUrl,
                    localPath: record.localPath
                });
                continue;
            }

            // C. 提交任务
            const form = new FormData();
            form.append('file', buffer, { filename: fileName });
            if (backgroundColor) form.append('backgroundColor', backgroundColor);

            const sRes = await axios.post(`${API_BASE}/submittask`, form, {
                headers: { 'X-Skill-VK': activeVK, ...form.getHeaders() },
                timeout: 30000
            });

            if (sRes.data.code !== 200) throw new Error(sRes.data.message || "接口提交失败");
            const taskId = sRes.data.data.taskId;

            // D. 轮询结果 (200成功, 202处理中, 其他失败)
            let remoteUrl = null;
            for (let i = 0; i < 30; i++) {
                await utils.sleep(1000); // 间隔2秒
                const qRes = await axios.post(`${API_BASE}/querytask`, 
                    { taskId }, 
                    { headers: { 'X-Skill-VK': activeVK } }
                );

                const resData = qRes.data;
                if (resData.code !== 200) throw new Error(`查询失败: ${resData.message}`);

                const taskStatus = resData.data.status;
                if (taskStatus === 200) {
                    remoteUrl = resData.data.resultUrl;
                    break;
                } else if (taskStatus === 202) {
                    continue; // 正在处理
                } else {
                    throw new Error(`AI处理失败: ${resData.data.message || '状态码 ' + taskStatus}`);
                }
            }

            if (!remoteUrl) throw new Error("处理超时");

            // E. 下载保存
            const imgRes = await axios.get(remoteUrl, { responseType: 'arraybuffer' });
            await fsPromises.writeFile(localSavePath, Buffer.from(imgRes.data));

            // F. 存入数据库
            await dbOps.insert(db, {
                hash,
                taskId,
                status: 'success',
                remoteUrl,
                localPath: localSavePath,
                bgColor: backgroundColor || 'transparent',
                createdAt: Date.now()
            });

            summary.details.push({
                taskId: taskId,
                input: task.path,
                status: "成功",
                resultUrl: remoteUrl,
                localPath: localSavePath
            });

        } catch (err) {
            summary.details.push({
                input: task.path,
                status: "失败",
                error: err.message
            });
        } finally {
            // 清理临时下载的文件
            if (tempPath && fs.existsSync(tempPath)) {
                await fsPromises.rm(tempPath).catch(() => {});
            }
        }
    }

    // 5. 生成最终报告
    const successList = summary.details.filter(d => d.status.includes("成功"));
    const failList = summary.details.filter(d => d.status === "失败");

    const report = {
        "任务状态": `🎉 处理完成！(成功: ${successList.length} / 总计: ${summary.total})`,
        "本地保存目录": batchDir,
        "成功清单": successList.map(d => ({
            "任务id": d.taskId,
            "素材名": path.basename(d.input),
            "原始来源": d.input,
            "远程预览": d.resultUrl,
            "本地路径": d.localPath
        }))
    };

    if (failList.length > 0) {
        report["失败清单"] = failList.map(d => ({
            "任务id": d.taskId,
            "素材名": path.basename(d.input),
            "原始来源": d.input,
            "失败原因": d.error
        }));
    }

    return report;
}