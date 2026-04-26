# Cloudflare 前后端完整部署说明

本项目现在按 Cloudflare Pages + Pages Functions 部署：

- 前端：React + Vite，构建产物目录 `dist`
- 后端：`functions/api/[[path]].ts`，承接 `/api/*`
- 存储：Cloudflare Workers KV，绑定名 `STRATEGY_LAB_STATE`

原来的 `backend/` 是 FastAPI/Python，依赖 pandas、akshare、线程预热和文件系统，不适合原样部署到 Cloudflare 边缘环境。因此 Cloudflare 版本新增了 TypeScript Pages Functions 后端，覆盖登录、注册审核、权限、策略管理、首页配置、访问统计、市场快照和 BP 导入接口。

## 一、首次准备

```powershell
cd C:\Users\18884\Desktop\量化展业平台\strategy-lab
npm install
npm run cloudflare:login
```

创建 Pages 项目：

```powershell
npx -y wrangler pages project create strategy-lab --production-branch=main
```

如果提示项目已存在，可以跳过。

创建 KV 命名空间：

```powershell
npm run cloudflare:kv:create
```

命令会输出类似：

```toml
[[kv_namespaces]]
binding = "STRATEGY_LAB_STATE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

把输出的 `id` 填到 `wrangler.toml` 里的 `[[kv_namespaces]]` 配置，并取消注释。`preview_id` 可以先填同一个 id；正式区分预览和生产时，再单独创建 preview KV。

## 二、本地 Cloudflare 预览

```powershell
npm run dev:cloudflare
```

然后访问终端显示的本地地址，测试这些接口：

```text
/api/health
/api/bootstrap
/api/market/home
```

默认账号：

```text
管理员：admin / Admin@123456
演示用户：user_demo / User@123456
```

## 三、部署到 Cloudflare

```powershell
npm run deploy:cloudflare
```

部署成功后，终端会返回类似：

```text
https://strategy-lab.pages.dev
```

前端已经改为同源 API：

```env
VITE_MARKET_API_BASE_URL=
```

所以部署后的页面会请求：

```text
https://strategy-lab.pages.dev/api/...
```

不再依赖腾讯 CloudBase 后端。

## 四、控制台 Git 自动部署

如果要接入 Git 自动部署：

1. 登录 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 选择 `Create application` -> `Pages` -> `Import an existing Git repository`。
4. 构建设置填写：

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: strategy-lab
```

如果仓库根目录就是 `strategy-lab`，`Root directory` 留空。

还需要在 Pages 项目的 `Settings` -> `Functions` -> `KV namespace bindings` 中添加：

```text
Variable name: STRATEGY_LAB_STATE
KV namespace: 刚创建的 KV namespace
```

## 五、功能边界

Cloudflare 版本后端覆盖平台核心业务功能，但有两点需要注意：

- `/api/market/home` 使用随项目部署的行情快照，不能像原 Python 后端那样用 akshare 实时抓取。
- `/api/admin/performance-import/bp` 已迁到边缘函数，支持 CSV，并尝试支持 XLSX；如 XLSX 在 Cloudflare 运行时解析失败，建议先转 CSV 上传。

如果老师要求实时行情也完全跑在 Cloudflare，需要继续把原 `market_service.py` 中的数据源逐个改写成 Workers `fetch` 版本，或接第三方行情 API。

## 六、路由刷新处理

项目没有提供 `404.html`，Cloudflare Pages 会按 SPA 站点处理未命中的前端路由。新增的后端函数只放在 `functions/api/[[path]].ts`，因此 `/api/*` 进入 Cloudflare Functions，其余前端路由由 Pages 静态站处理。
