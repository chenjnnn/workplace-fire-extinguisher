/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 游戏内核是 TS 源码（.ts 导入），交给 Next 编译
  transpilePackages: ['@vc/core'],
  eslint: { ignoreDuringBuilds: true },
  // 构建产物与开发缓存分开：dev 用 .next/，build 用 .next-prod/。
  // 之前 build 和 dev 抢同一个 .next 目录，会把 dev 的缓存写坏、页面 500。
  // （用自定义环境变量而不是 NODE_ENV：next build 自己会强制 NODE_ENV=production，
  //   那样判断会失效。）
  distDir: process.env.VC_BUILD_DIR === 'prod' ? '.next-prod' : '.next',
  // 静态导出：方便直接丢到任意静态托管 / 后续小程序 webview 复用
  // 注意：开启后不能用 next/image 的优化等依赖服务端的能力，本项目用不到
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
