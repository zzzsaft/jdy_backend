# 使用一个 Node.js 的基础镜像
FROM node:20

# 设置工作目录
WORKDIR /usr/src/app

COPY package*.json ./

COPY .env .env.prod .env.dev ./

# 将编译后的代码复制到镜像中
COPY ./build .
ENV NODE_ENV=production
# 安装项目依赖
RUN npm install --only=production

# 暴露端口
EXPOSE 2000

# 运行应用
CMD ["node", "index.js"]
