require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { default: PQueue } = require('p-queue');

// 从 .env 读取配置
const {
    GITHUB_TOKEN,
    REPO_OWNER,
    REPO_NAME,
    BRANCH = 'main',
    TARGET_DIR = 'images',
    CONCURRENCY = 3,
} = process.env;

const headers = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json'
};

// 本地图片目录
const IMAGE_DIR = './images';

// 检查目录是否存在
if (!fs.existsSync(IMAGE_DIR)) {
    console.error(`错误：目录 ${IMAGE_DIR} 不存在！`);
    process.exit(1);
}

// 读取本地图片文件
const imageFiles = fs.readdirSync(IMAGE_DIR).filter(file =>
    ['.jpg', '.jpeg', '.png', '.gif'].includes(path.extname(file).toLowerCase())
);

if (imageFiles.length === 0) {
    console.log('没有找到图片文件！');
    process.exit(0);
}

// 确保远程目录存在
async function ensureRemoteDirectoryExists() {
    const checkUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TARGET_DIR}`;

    try {
        await axios.get(checkUrl, { headers });
        console.log(`✓ 远程目录 ${TARGET_DIR} 已存在`);
    } catch (error) {
        if (error.response?.status === 404) {
            const createUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TARGET_DIR}/.gitkeep`;
            await axios.put(createUrl, {
                message: `创建目录 ${TARGET_DIR}`,
                content: Buffer.from('目录占位文件').toString('base64'),
            }, { headers });
            console.log(`✓ 已创建远程目录 ${TARGET_DIR}`);
        } else {
            throw error;
        }
    }
}

// 上传单张图片的函数
async function uploadImage(fileName) {
    const filePath = path.join(IMAGE_DIR, fileName);
    const targetPath = `${TARGET_DIR}/${fileName}`;
    const imageData = fs.readFileSync(filePath, { encoding: 'base64' });
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetPath}`;

    // 1. 检查文件是否已存在并获取sha
    let sha = null;
    try {
        const existingFile = await axios.get(url, { headers });
        sha = existingFile.data.sha;
        console.log(`ℹ️ ${fileName} 已存在，准备更新（SHA: ${sha.slice(0, 7)}...）`);
    } catch (error) {
        if (error.response?.status !== 404) {
            console.error(`⚠️ 检查文件存在时出错:`, error.message);
            return null;
        }
    }

    // 2. 构建请求数据（包含sha如果存在）
    const data = {
        message: sha ? `更新 ${fileName}` : `上传 ${fileName}`,
        content: imageData,
        branch: BRANCH,
        ...(sha && { sha }) // 关键：如果存在则添加sha
    };

    // 3. 执行上传/更新
    try {
        const response = await axios.put(url, data, { headers });
        console.log(`✅ ${sha ? '更新' : '上传'} ${fileName} 成功！`);
        return {
            name: fileName,
            github: response.data.content.download_url,
            cdn: `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/${targetPath}`
        };
    } catch (error) {
        console.error(`❌ ${fileName} 操作失败:`, {
            status: error.response?.status,
            message: error.response?.data?.message,
            url: error.config?.url
        });
        return null;
    }
}

// 主函数
(async () => {
    try {
        // 1. 确保远程目录存在
        await ensureRemoteDirectoryExists();

        // 2. 初始化队列
        const queue = new PQueue({ concurrency: parseInt(CONCURRENCY) });
        console.log(`开始上传 ${imageFiles.length} 张图片（并发数: ${CONCURRENCY}）...`);

        // 3. 批量上传
        const uploadTasks = imageFiles.map(fileName =>
            queue.add(() => uploadImage(fileName))
        );
        const results = (await Promise.all(uploadTasks)).filter(Boolean);

        // 4. 输出结果
        console.log('\n===== 上传结果 =====');
        console.log(`✅ 成功: ${results.length} 张 | ❌ 失败: ${imageFiles.length - results.length} 张`);

        // 5. 保存结果
        const linksArray = results.map(result => ({
            name: result.name,
            github: result.github,
            cdn: result.cdn,
        }));

        fs.writeFileSync('upload_results.json', JSON.stringify(linksArray, null, 2));
        console.log('\n📄 结果已保存到 upload_results.json');

        // 6. 打印示例链接
        if (linksArray.length > 0) {
            console.log('\n🔗 示例链接:');
            linksArray.slice(0, 3).forEach(link => {
                console.log(`- ${link.name}: ${link.cdn}`);
            });
        }
    } catch (error) {
        console.error('❗ 主流程错误:', error.message);
        process.exit(1);
    }
})();