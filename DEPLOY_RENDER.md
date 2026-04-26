# Render + MongoDB Atlas 免费部署指南

本方案用于把当前项目部署成：

- 前端：Render Static Site
- 后端：Render Web Service
- 数据持久化：MongoDB Atlas 免费 M0

部署完成后，老师可以通过 Render 分配的公网网址访问前端；前端会请求 Render 上的 FastAPI 后端；登录、注册、权限、策略数据、访问统计等状态会写入 MongoDB Atlas，而不是写在 Render 的临时本地文件里。

## 0. 先确认项目目录

在本机 CMD 或 PowerShell 里进入项目目录：

```powershell
cd C:\Users\18884\Desktop\量化展业平台\strategy-lab
```

本地构建检查：

```powershell
npm install
npm run build
```

Render 真正部署时不会依赖你本机一直开着 CMD；CMD 只用于本地检查和把代码推送到 GitHub/GitLab/Bitbucket。

## 1. 把代码上传到 Git 仓库

Render 需要从 GitHub、GitLab 或 Bitbucket 拉代码。建议新建一个 GitHub 仓库，然后把 `strategy-lab` 这个项目推上去。

注意：不要把 MongoDB 密码写进代码仓库，后面只放到 Render 环境变量里。

## 2. 创建 MongoDB Atlas 免费 M0

进入 MongoDB Atlas：

https://www.mongodb.com/products/platform/atlas-database

操作顺序：

1. 注册或登录 MongoDB Atlas。
2. 新建 Project，例如 `strategy-lab`。
3. 创建 Cluster，选择 Free / M0。
4. 云厂商和区域可以选离 Render 后端区域较近的，例如 AWS Singapore 或 AWS Oregon，实际可选项以 Atlas 页面为准。
5. 创建 Database User。
   - Username 示例：`strategy_lab_user`
   - Password 使用 Atlas 自动生成的强密码。
6. Network Access 里允许 Render 后端访问 MongoDB。
   - 简单部署：添加 `0.0.0.0/0`。
   - 更稳妥：后端在 Render 创建后，到 Render 后端服务的 Connect / Outbound 里复制 outbound IP ranges，再填到 Atlas Network Access。

然后复制连接字符串：

```text
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

把 `<username>` 和 `<password>` 换成刚才创建的数据库用户。如果密码里有 `@`、`#`、`/` 等特殊字符，需要用 Atlas 页面给出的最终连接串，避免手动拼错。

## 3. 先部署后端 Render Web Service

进入 Render：

https://dashboard.render.com/

选择：

```text
New -> Web Service
```

连接你的 Git 仓库后，填写：

```text
Name: strategy-lab-api
Language: Python 3
Branch: main
Root Directory: 留空
Build Command: pip install -r requirements.txt
Start Command: uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
Instance Type: Free
```

如果你的 Git 仓库根目录不是 `strategy-lab`，而是上一级 `量化展业平台`，则 Root Directory 要填：

```text
strategy-lab
```

在 Environment Variables 里添加：

```text
MARKET_SHARED_STORE_MONGODB_URI = 你的 MongoDB Atlas 连接字符串
MARKET_SHARED_STORE_MONGODB_DB = strategy_lab
MARKET_SHARED_STORE_MONGODB_COLLECTION = shared_kv
MARKET_SHARED_STORE_REQUIRED = 1
MARKET_API_ALLOWED_ORIGINS = http://localhost:5173
DISABLE_HOME_MARKET_PREFETCH = 0
```

先部署后端。部署成功后，Render 会给你一个后端地址，例如：

```text
https://strategy-lab-api.onrender.com
```

打开下面这个地址测试：

```text
https://你的后端地址/api/health
```

正常应返回类似：

```json
{
  "status": "ok",
  "sharedStoreMode": "mongo",
  "sharedStoreStrict": true
}
```

重点看 `sharedStoreMode` 必须是 `mongo`。如果是 `file`，说明 MongoDB 连接没有生效，先不要部署前端。

## 4. 再部署前端 Render Static Site

在 Render 选择：

```text
New -> Static Site
```

连接同一个 Git 仓库后，填写：

```text
Name: strategy-lab-web
Branch: main
Root Directory: 留空
Build Command: npm install && npm run build
Publish Directory: dist
```

同样，如果你的 Git 仓库根目录不是 `strategy-lab`，Root Directory 填：

```text
strategy-lab
```

在 Environment Variables 里添加：

```text
VITE_MARKET_API_BASE_URL = https://你的后端地址
```

例如：

```text
VITE_MARKET_API_BASE_URL = https://strategy-lab-api.onrender.com
```

部署成功后，Render 会给你一个前端地址，例如：

```text
https://strategy-lab-web.onrender.com
```

## 5. 回填后端 CORS 白名单

前端地址出来以后，回到后端 `strategy-lab-api` 的 Environment Variables，把：

```text
MARKET_API_ALLOWED_ORIGINS
```

改成：

```text
https://你的前端地址,http://localhost:5173
```

例如：

```text
https://strategy-lab-web.onrender.com,http://localhost:5173
```

保存后重新部署后端。

## 6. 验收清单

部署完成后检查这些地址和功能：

```text
后端健康检查：https://你的后端地址/api/health
前端首页：https://你的前端地址
```

页面里测试：

1. 管理员登录：`admin` / `Admin@123456`
2. 普通测试账号：`user_demo` / `User@123456`
3. 注册一个新用户，看管理员端是否能看到申请。
4. 修改权限或策略后，刷新页面确认数据没有丢。
5. 重新部署后端，再刷新页面确认数据仍然存在。

## 7. 常见问题

### 前端能打开，但登录失败

通常是 `VITE_MARKET_API_BASE_URL` 没有填对。前端 Static Site 的环境变量必须是后端地址，不要填前端地址。

### `/api/health` 显示 `sharedStoreMode` 是 `file`

说明后端没有连上 MongoDB Atlas。检查：

- `MARKET_SHARED_STORE_MONGODB_URI` 是否完整。
- Atlas Network Access 是否允许 Render 后端访问。
- Atlas Database User 用户名和密码是否正确。
- `MARKET_SHARED_STORE_REQUIRED` 是否设置为 `1`。

### 浏览器控制台出现 CORS 报错

回到后端 Render Web Service，把 `MARKET_API_ALLOWED_ORIGINS` 改成真实前端地址，例如：

```text
https://strategy-lab-web.onrender.com,http://localhost:5173
```

然后重新部署后端。

### 第一次打开很慢

Render 免费 Web Service 空闲一段时间后会休眠。老师第一次访问时，后端可能需要几十秒到一分钟恢复。这是免费层限制，不是代码错误。

### AKShare 行情接口偶尔失败

AKShare 免费，但背后的公开数据源可能会限制频率、改变接口或对海外云服务器访问不稳定。Render 部署可以保留 AKShare，但不能保证第三方行情源永远稳定。

## 8. 推荐部署顺序

严格按这个顺序做：

```text
MongoDB Atlas M0
-> Render Web Service 后端
-> 测试 /api/health，确认 sharedStoreMode=mongo
-> Render Static Site 前端
-> 回填后端 MARKET_API_ALLOWED_ORIGINS
-> 完整测试登录、注册、权限、策略和刷新持久化
```
