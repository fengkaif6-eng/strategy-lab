# Strategy Lab

量化策略平台前端（React + Vite + TypeScript）。

## 本地运行

```bash
npm install
npm run dev
```

默认访问地址：`http://localhost:5173/`

## 质量检查

```bash
npm run lint
npm run test
npm run build
```

## 部署到 Vercel（公网可访问）

项目已包含 `vercel.json`，支持 React Router 刷新子路由不 404。

1. 首次登录（仅一次）：

```bash
npx vercel login
```

2. 预览部署：

```bash
npm run deploy:vercel
```

3. 生产部署：

```bash
npm run deploy:vercel:prod
```

部署成功后，终端会返回一个 `https://*.vercel.app` 地址，分享该地址即可让他人访问。

### Windows 登录报错备用方案

如果 `npx vercel login` 出现 `is not a legal HTTP header value`，可改用 Token 方式部署：

1. 在浏览器登录 Vercel 后创建 Token：`https://vercel.com/account/tokens`
2. 命令行部署：

```bash
npm run deploy:vercel:prod -- --token <YOUR_VERCEL_TOKEN> --yes
```
