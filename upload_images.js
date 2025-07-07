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

// 上传单张图片的函数
async function uploadImage(fileName) {
    const filePath = path.join(IMAGE_DIR, fileName);
    const targetPath = `${TARGET_DIR}/${fileName}`;
    const imageData = fs.readFileSync(filePath, { encoding: 'base64' });

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${targetPath}`;
    const headers = {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
    };
    const data = {
        message: `Upload ${fileName} via GitHub API`,
        content: imageData,
        branch: BRANCH,
    };

    try {
        const response = await axios.put(url, data, { headers });
        console.log(`✅ ${fileName} 上传成功！`);
        return {
            name: fileName,
            github: `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${targetPath}`,
            cdn: `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}/${targetPath}`,
        };
    } catch (error) {
        console.error(`❌ ${fileName} 上传失败:`, error.response?.data?.message || error.message);
        return null;
    }
}

// 主函数：并行上传 + 结果存储
(async () => {
    const queue = new PQueue({ concurrency: parseInt(CONCURRENCY) });
    console.log(`开始上传 ${imageFiles.length} 张图片（并发数: ${CONCURRENCY}）...`);

    // 批量上传
    const uploadTasks = imageFiles.map(fileName =>
        queue.add(() => uploadImage(fileName))
    );
    const results = (await Promise.all(uploadTasks)).filter(Boolean);

    // 输出统计信息
    console.log('\n===== 上传结果 =====');
    console.log(`✅ 成功: ${results.length} 张 | ❌ 失败: ${imageFiles.length - results.length} 张`);

    // 生成链接数组并保存
    const linksArray = results.map(result => ({
        name: result.name,
        github: result.github,
        cdn: result.cdn,
    }));

    fs.writeFileSync('upload_results.json', JSON.stringify(linksArray, null, 2));
    console.log('\n📄 结果已保存到 upload_results.json');

    // 打印前 3 个链接示例（避免控制台过长）
    console.log('\n🔗 示例链接:');
    linksArray.slice(0, 3).forEach(link => {
        console.log(`- ${link.name}: ${link.cdn}`);
    });
})();