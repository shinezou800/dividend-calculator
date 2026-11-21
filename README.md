# 攒股收息分红计算器

移动优先的中文模拟盘记录工具，使用 Vite、React、TypeScript、Supabase 和 Vitest。所有人可查看同一份公开持仓；仅管理员登录后可编辑。没有交易、券商或账户对接。

## 本地启动

需要 Node.js 24 和 npm。

```sh
npm ci
cp .env.example .env
# 在 .env 中填写项目 URL 与 anon 公共密钥
npm run dev
```

环境变量：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。未配置或任一值为 `__PENDING__` 时页面显示「未配置 Supabase」，不会退回本地持仓。`.env` 保持忽略、不提交；生产配置 `.env.production` 则提交到仓库，只允许公开 anon / publishable key。前端绝不可放置 `service_role` 或 `sb_secret_` 密钥；Vite 环境变量会被公开打包。匿名访客只使用公共密钥查询，不进行匿名登录。

## Supabase 配置

1. 创建 Supabase 项目，在 SQL 编辑器依次执行 `supabase/migrations/0001_init.sql`（仅执行一次）和 `supabase/migrations/0002_payouts.sql`。脚本创建共享持仓、管理员白名单、RLS 策略及四条初始持仓和到账配置；已有项目只执行第二个迁移。删除所有股票不会重新播种。
2. 在 Authentication 设置中关闭公开注册，无需启用匿名登录。通过控制台创建管理员邮箱用户。
3. 将该用户 UUID 加入白名单（仅通过 SQL 编辑器等受信后端执行）：

```sql
insert into public.app_admin (user_id) values ('替换为管理员用户UUID');
```

4. 在 Authentication URL Configuration 中配置站点 URL 和允许的重定向 URL；本项目生产地址为 `https://shinezou800.github.io/dividend-calculator/`，必须保留完整子路径和末尾斜杠。需要本地登录时另行允许开发地址。
5. 点击「管理员登录」，输入邮箱发送登录邮件，然后点击邮件中的登录链接。当前免费项目使用默认 SMTP，无法自定义邮件模板，邮件只有登录链接，没有六位验证码，无需填写验证码。若以后使用支持验证码的邮件模板，可展开可选验证码区域登录。

登录邮件重定向回当前页面路径（不包含查询参数或旧片段）；客户端使用 implicit 流程和 `detectSessionInUrl` 读取魔法链接回传的会话，再检查管理员权限并加载持仓。会话保存在浏览器本地存储中，刷新后保留；退出登录清除会话。未授权账号显示「该账号无编辑权限」。

数据库权限是安全边界，不依赖前端按钮隐藏：`holdings` 对所有访客只读，写入由 RLS 调用 `is_admin()` 校验；`app_admin` 开启 RLS 且无访问策略，前端无法读取或修改白名单。`is_admin()` 使用固定空搜索路径的 SECURITY DEFINER 函数，仅返回当前用户是否为管理员。每次修改、删除均带有行 ID 条件，兼容 safeupdate。

修改股数、价格、每股分红后约 600ms 自动保存，失败会显示重试按钮。保存失败时不要关闭页面，重试成功后再离开。刷新从 Supabase 重读持仓。添加、删除也直接写入 Supabase；删除需要确认。

## 计算口径

- 股息率 = 每股分红 / 价格；年分红 = 股数 × 每股分红。
- 总市值、组合股息率、月均分红随当前持仓实时更新；零价格或空组合显示零收益率以避免除零。
- 先在 SQL Editor 顺序执行 `0001_init.sql`（新项目）和 `0002_payouts.sql`；已有项目只执行 `0002_payouts.sql`。第二个迁移可重复执行，只为配置为空的四个默认代码填入已知到账，不覆盖非空配置；不修改原 RLS。升级前应先执行迁移，再发布客户端。
- 管理员展开每只股票的「到账月份」，添加、编辑或删除月份、每股到账金额、备注及特别分红标记，约 600 毫秒自动保存；访客没有编辑入口。每股到账独立于顶部年度每股分红字段，后者仍用于简单年分红计算。
- 按月到账表按当前股数 × 各次每股到账金额测算，单次到账按分四舍五入后汇总；12 月映射到 2026-12，1–11 月映射到 2027 年。特别分红始终单独高亮，即使和普通到账同月也不混算。默认金额仍为 20,956 / 21,994 元，特别分红 1,038 元；海尔 3000 × 0.891667 按分取整为 2,675.00 元。无配置持仓列出「未配置到账月份，不计入按月表」，配置后立即计入，不虚构月份。
- 默认持仓按每股分红简单乘为 22,780 元（白药按 TTM）；与到账月份口径分开显示，不强行对齐。
- 税前测算，A股股息按持股期限差别扣税；模拟盘记录，不构成投资建议；2026年度分红方案未全部公布，以公司公告为准。

## 检查

```sh
npm run build
npm test
npx tsc --noEmit
```

本地 Supabase 已运行且有管理员白名单时，可执行 `node scripts/check-payouts-local.mjs`：在事务内验证两个迁移、重复执行保护及 anon / admin / 非管理员的到账列权限，结束后回滚，不改变原本地数据。默认数据库容器为 `supabase_db_supabase-dividend-check`，可用 `SUPABASE_DB_CONTAINER` 覆盖。

测试覆盖默认持仓收益、空组合、零价格、动态月表各月及合计、股数/每股分红变动、删除与无配置持仓、编辑即时更新及只读/编辑权限矩阵。上线前还应在真实 Supabase 项目中验证访客查询、管理员验证码/魔法链接登录、非管理员写入拒绝、添加/修改/删除与刷新持久化。

## GitHub Pages

在 Settings → Pages 中选择 GitHub Actions。无需设置 Actions 仓库变量：生产构建由 Vite 自动读取已提交的 `.env.production`。当前已填写项目 `icsdwmnethygsyknmmei` 的 URL 与公开 legacy anon key；此密钥可公开，数据权限由 RLS 控制。更换项目时仅填写公开 anon / publishable key，提交后重新构建即可；若使用 `__PENDING__` 占位符，页面只显示未配置状态，不会连接 Supabase。

推送 `main` 后工作流构建并发布；向 `main` 提交 PR 时，同一工作流执行 `npm ci`、`npx tsc --noEmit`、`npm test`、`npm run build`，但不上传 Pages 产物或部署。构建后运行 `node scripts/check-dist.mjs`，递归扫描 `dist` 内所有文件（包含隐藏文件），检测以下服务端密钥：

- 匹配 `sb_secret_[A-Za-z0-9_-]{20,}` 的密钥。
- 匹配 `eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+` 的 JWT，且解码后的 JSON 载荷字段 `role` 严格等于 `service_role`。

SDK 中单独的 `sb_secret_` / `service_role` 字面量和公开 anon JWT 不会触发检查。检测到密钥、产物为空或无法完整扫描时阻止发布，错误日志不打印密钥或文件内容。检查只识别上述格式，不验证 JWT 签名，也不能替代正确的密钥管理。

Vite 使用 `base: './'`，支持仓库子路径。配置是构建时注入，修改 `.env.production` 后需要重新构建。本地开发继续使用不提交的 `.env`；生产模式的 `.env.production` 优先于 `.env`，不要把开发配置误认为生产配置。
